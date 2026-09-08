'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validate, ENGAGEMENTS } = require('../lib/intake-validation');
const content = require('../content.json');
const performance = require('../performance.json');
const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-frontend-test-'));
const outputs = {};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read = (mode, file = 'index.html') => fs.readFileSync(path.join(outputs[mode], file), 'utf8');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const codeAssets = html => [...html.matchAll(/<(?:script|link)\b[^>]*>/g)]
  .map(m => attrs(m[0])).map(a => a.src || a.href).filter(Boolean)
  .map(url => new URL(url, 'https://hammadmedia.com'))
  .filter(url => url.origin === 'https://hammadmedia.com' && /\.(?:css|js)$/.test(url.pathname));
function build(name, env = {}, root = ROOT) {
  const out = path.join(temp, name);
  execFileSync(process.execPath, [path.join(root, 'build.js')], { cwd: root, env: {...process.env, VERCEL_ENV: '', PUBLIC_LAUNCH_APPROVED: '', ...env, HM_BUILD_OUTPUT_DIR: out}, stdio: 'pipe' });
  return outputs[name] = out;
}
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)).map(p => e.name + '/' + p) : [e.name]);
}
test.before(() => {
  build('preview');
  build('unapproved', {VERCEL_ENV:'production', PUBLIC_LAUNCH_APPROVED:'false'});
  build('production', {VERCEL_ENV:'production', PUBLIC_LAUNCH_APPROVED:'true'});
});
test.after(() => fs.rmSync(temp, {recursive:true, force:true}));

test('preview indexing and Analytics remain off unless both production gates are enabled', () => {
  for (const mode of ['preview', 'unapproved']) {
    for (const file of ['index.html', 'zh/index.html', 'privacy/index.html', 'zh/privacy/index.html']) {
      const html = read(mode, file);
      assert.match(html, /name="robots" content="noindex,nofollow"/);
      assert.match(html, /data-preview="true"/);
      assert.doesNotMatch(html, /googletagmanager|G-NEX74824JL|gtag\('config'/);
    }
    assert.equal(read(mode, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  }
  for (const file of ['index.html', 'zh/index.html', 'privacy/index.html', 'zh/privacy/index.html']) {
    const html = read('production', file);
    assert.doesNotMatch(html, /noindex|class="preview-banner"/);
    assert.match(html, /data-preview="false"/);
    assert.match(html, /src="\/assets\/redesign\/analytics\.js\?v=[a-f0-9]{16}"/);
    assert.doesNotMatch(html, /<script[^>]+src="https:\/\/www.googletagmanager/);
  }
  assert.match(read('production', 'robots.txt'), /Allow: \/\nSitemap:/);
});

test('every generated page versions local CSS and scripts by the exact deployed bytes', () => {
  for (const mode of ['preview', 'unapproved', 'production']) {
    for (const file of files(outputs[mode]).filter(file => file.endsWith('.html'))) {
      const references = codeAssets(read(mode, file));
      assert.ok(references.some(url => url.pathname.endsWith('/site.css')), file);
      for (const url of references) {
        const bytes = fs.readFileSync(path.join(outputs[mode], url.pathname.slice(1)));
        const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
        assert.deepEqual([...url.searchParams], [['v', digest]], `${mode}: ${file} -> ${url.pathname}`);
      }
      const analytics = references.filter(url => url.pathname.endsWith('/analytics.js'));
      assert.equal(analytics.length, mode === 'production' && file !== '404.html' ? 1 : 0, `${mode}: ${file}`);
    }
  }
});

test('changing one stylesheet or script changes only that asset URL across localized pages and confirmations', () => {
  const fixture = path.join(temp, 'cache-version-source'); fs.mkdirSync(fixture);
  for (const file of ['build.js', 'content.json', 'performance.json']) fs.copyFileSync(path.join(ROOT, file), path.join(fixture, file));
  fs.cpSync(path.join(outputs.preview, 'assets'), path.join(fixture, 'assets'), {recursive:true});
  const production = {VERCEL_ENV:'production', PUBLIC_LAUNCH_APPROVED:'true'};
  build('cache-before', production, fixture);
  build('cache-identical', production, fixture);
  fs.appendFileSync(path.join(fixture, 'assets/redesign/site.css'), '\n/* Changed stylesheet revision. */\n');
  build('cache-css', production, fixture);
  fs.appendFileSync(path.join(fixture, 'assets/redesign/attribution.js'), '\n/* Changed attribution revision. */\n');
  build('cache-script', production, fixture);
  for (const file of ['index.html', 'zh/index.html', 'privacy/index.html', 'zh/privacy/index.html', 'thanks/index.html', 'zh/thanks/index.html', 'thanks.html', '404.html']) {
    const refs = mode => Object.fromEntries(codeAssets(read(mode, file)).map(url => [url.pathname, url.href]));
    const before = refs('cache-before'), same = refs('cache-identical'), css = refs('cache-css'), script = refs('cache-script');
    assert.deepEqual(same, before, file);
    assert.deepEqual(Object.keys(css), Object.keys(before));
    for (const asset of Object.keys(before)) {
      if (asset.endsWith('/site.css')) assert.notEqual(css[asset], before[asset], file);
      else assert.equal(css[asset], before[asset], `${file}: ${asset}`);
      if (asset.endsWith('/attribution.js')) assert.notEqual(script[asset], css[asset], file);
      else assert.equal(script[asset], css[asset], `${file}: ${asset}`);
    }
  }
});

test('both languages render canonical metrics with per-product dates and correct account assignment', () => {
  for (const [locale, file] of [['en','index.html'], ['zh','zh/index.html']]) {
    const html = read('preview', file);
    assert.match(html, new RegExp(`<html lang="${locale === 'zh' ? 'zh-CN' : 'en'}"`));
    for (const m of Object.values(performance.metrics)) {
      assert.ok(html.includes(esc(m.value[locale])), m.value[locale]);
      assert.ok(html.includes(esc(m.label[locale])), m.label[locale]);
      if (m.note) assert.ok(html.includes(esc(m.note[locale])), m.note[locale]);
    }
    const products = [...html.matchAll(/<article class="product-card" data-product-key="([^"]+)">([\s\S]*?)<\/article>/g)];
    assert.equal(products.length, content.receipts.items.length);
    for (const product of content.receipts.items) {
      const card = products.find(card => card[1] === product.performanceKey)[2];
      const data = performance.products[product.performanceKey];
      assert.ok(card.includes(esc(data.gmv[locale])));
      assert.ok(card.includes(esc(data.units[locale])));
      assert.ok(card.includes(esc(data.period[locale])));
      if (product.videoUrl) assert.ok(card.includes(`href="${esc(product.videoUrl)}"`));
      else assert.doesNotMatch(card, /<a\b|data-product=|href=|Watch a creator review|观看达人测评/);
    }
    for (const [handle, data] of Object.entries(performance.accounts)) {
      const region = [...html.matchAll(/<a class="profile-card" data-profile="([^"]+)"[\s\S]*?<\/a>/g)].find(card => card[1] === handle)[0];
      assert.ok(region.includes(esc(data.gmv[locale])), handle);
      assert.ok(region.includes(esc(data.units[locale])), handle);
    }
    assert.doesNotMatch(html, /Mohammed Hammad|113K\+|182\.9K|#1 Health|48 hours|within 24 hours|four new products|FormSubmit/i);
  }
});

test('reordering source products and accounts cannot silently attach another row’s metrics', () => {
  const fixture = path.join(temp, 'reordered-source'); fs.mkdirSync(fixture);
  for (const file of ['build.js', 'performance.json']) fs.copyFileSync(path.join(ROOT, file), path.join(fixture, file));
  fs.symlinkSync(path.join(ROOT, 'assets'), path.join(fixture, 'assets'), 'dir');
  const reordered = {...content, accounts: content.accounts.slice().reverse(), receipts: {items: content.receipts.items.slice().reverse()}};
  fs.writeFileSync(path.join(fixture, 'content.json'), JSON.stringify(reordered));
  build('reordered', {}, fixture);
  const html = read('reordered');
  const cards = [...html.matchAll(/<article class="product-card" data-product-key="([^"]+)">([\s\S]*?)<\/article>/g)];
  for (const p of reordered.receipts.items) {
    const card = cards.find(c => c[1] === p.performanceKey)[2];
    assert.ok(card.includes(esc(performance.products[p.performanceKey].gmv.en)));
    assert.ok(card.includes(esc(performance.products[p.performanceKey].period.en)));
  }
  assert.ok(html.indexOf('About $2.53M') < html.indexOf('About $1.41M'));
});

test('a product review link cannot point to another creator or an unverified destination', () => {
  const fixture = path.join(temp, 'unverified-review-source'); fs.mkdirSync(fixture);
  for (const file of ['build.js', 'performance.json']) fs.copyFileSync(path.join(ROOT, file), path.join(fixture, file));
  fs.symlinkSync(path.join(ROOT, 'assets'), path.join(fixture, 'assets'), 'dir');
  for (const videoUrl of ['https://www.tiktok.com/@another.creator/video/12345', 'https://example.com/product', '']) {
    const invalid = structuredClone(content);
    invalid.receipts.items.find(p => p.performanceKey === 'glutathione').videoUrl = videoUrl;
    fs.writeFileSync(path.join(fixture, 'content.json'), JSON.stringify(invalid));
    assert.throws(() => build('unverified-review', {}, fixture), /Unverified product review URL: glutathione/);
  }
});

test('both locales contain the matching light and dark hero assets with intrinsic dimensions', () => {
  for (const file of ['index.html', 'zh/index.html']) {
    const html = read('preview', file);
    for (const [theme, asset] of [['dark', 'astaxanthin-hero.webp'], ['light', 'hero-atelier-light.webp']]) {
      const tag = attrs(html.match(new RegExp(`<img class="hero-image-${theme}"[^>]*>`))[0]);
      assert.equal(tag.src, `/assets/redesign/${asset}`);
      assert.equal(tag.width, '1000'); assert.equal(tag.height, '1250');
    }
  }
});

test('theme-specific product images stay attached to the right card and are copied unchanged into both builds', () => {
  for (const mode of ['preview', 'production']) {
    for (const file of ['index.html', 'zh/index.html']) {
      const html = read(mode, file);
      const cards = [...html.matchAll(/<article class="product-card" data-product-key="([^"]+)">([\s\S]*?)<\/article>/g)];
      for (const product of content.receipts.items) {
        const card = cards.find(c => c[1] === product.performanceKey)[2];
        const images = [...card.matchAll(/<img\b[^>]*>/g)].map(m => attrs(m[0]));
        assert.equal(images.length, product.imageDark ? 2 : 1, product.performanceKey);
        assert.deepEqual(images.map(img => img.src), [product.image, product.imageDark].filter(Boolean).map(src => '/' + src));
        assert.equal(card.includes('class="product-photo has-dark-image"'), Boolean(product.imageDark));
        for (const [index, img] of images.entries()) {
          assert.equal(img.class, index ? 'product-image-dark' : 'product-image-light');
          assert.equal(img.alt, esc(product.title.replace(' — ', ' ')));
          assert.equal(img.width, '800'); assert.equal(img.height, '800');
          assert.equal(img.loading, 'lazy');
          // Visibility follows the theme in CSS; neither usable variant is permanently hidden from assistive technology.
          assert.notEqual(img['aria-hidden'], 'true');
          assert.equal(img.tabindex, undefined);
          const asset = img.src.slice(1);
          assert.deepEqual(fs.readFileSync(path.join(outputs[mode], asset)), fs.readFileSync(path.join(ROOT, asset)), asset);
        }
      }
    }
  }
});

test('optional dark-image references cannot escape the public asset boundary', () => {
  const fixture = path.join(temp, 'private-dark-image-source'); fs.mkdirSync(fixture);
  for (const file of ['build.js', 'performance.json']) fs.copyFileSync(path.join(ROOT, file), path.join(fixture, file));
  fs.symlinkSync(path.join(ROOT, 'assets'), path.join(fixture, 'assets'), 'dir');
  for (const imageDark of ['../private/evidence.png', 'assets/../private/evidence.png', 'assets/raw/evidence.png']) {
    const invalid = structuredClone(content);
    invalid.receipts.items[0].imageDark = imageDark;
    fs.writeFileSync(path.join(fixture, 'content.json'), JSON.stringify(invalid));
    assert.throws(() => build('private-dark-image', {}, fixture), /Invalid public asset path/);
  }
});

test('localized routes, navigation fragments and referenced local assets resolve', () => {
  for (const mode of ['preview','production']) for (const file of ['index.html', 'zh/index.html', 'privacy/index.html', 'zh/privacy/index.html']) {
    const html = read(mode, file);
    const current = new URL(file.replace(/index\.html$/, ''), 'https://hammadmedia.com/');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${file}`);
    for (const match of html.matchAll(/<(?:a|link|img|script)\b[^>]*(?:href|src)="([^"]+)"[^>]*>/g)) {
      const url = new URL(match[1], current);
      if (url.origin !== current.origin) continue;
      const target = url.pathname.endsWith('/') ? url.pathname.slice(1) + 'index.html' : url.pathname.slice(1);
      assert.ok(fs.existsSync(path.join(outputs[mode], target)), `${file} -> ${url.pathname}`);
      if (url.hash) {
        const targetText = fs.readFileSync(path.join(outputs[mode], target), 'utf8');
        assert.ok(targetText.includes(`id="${url.hash.slice(1)}"`), `${file} -> ${url.hash}`);
      }
    }
    const canonical = attrs(html.match(/<link rel="canonical"[^>]*>/)[0]);
    assert.equal(canonical.href, current.href);
    assert.match(html, /hreflang="en"/); assert.match(html, /hreflang="zh-Hans"/);
  }
});

test('distribution contains only named public files and no raw evidence, source data, credentials or inquiry records', () => {
  const publicFiles = files(outputs.preview);
  const allowed = new Set(['assets/brand-v3/favicon-16.png','assets/brand-v3/favicon-180.png','assets/brand-v3/favicon-192.png','assets/brand-v3/favicon-32.png','assets/brand-v3/favicon-48.png','assets/brand-v3/favicon-512.png','assets/brand-v3/favicon-64.png','assets/brand-v3/favicon.ico','assets/brand-v3/favicon.svg','assets/brand-v3/signature-logo-dark.png','assets/brand-v3/signature-logo-dark.svg','assets/brand-v3/signature-logo-light.png','assets/brand-v3/signature-logo-light.svg','index.html','zh/index.html','privacy/index.html','zh/privacy/index.html','404.html','thanks.html','thanks/index.html','zh/thanks/index.html','robots.txt','sitemap.xml','favicon.ico',
    'assets/brands/cata-kor.svg', 'assets/award-summit.webp','assets/og.jpg','assets/redesign/site.css','assets/redesign/site.js','assets/redesign/analytics.js','assets/redesign/engagement.js','assets/redesign/thanks.js','assets/redesign/attribution.js','assets/redesign/logo-light.svg','assets/redesign/logo-dark.svg','assets/redesign/astaxanthin-hero.webp','assets/redesign/hero-atelier-light.webp',
    'assets/fonts/manrope.woff2','assets/fonts/fraunces-roman.woff2','assets/fonts/fraunces-italic.woff2',
    ...content.brands.map(b=>b.logo),...content.accounts.map(a=>a.avatar),...content.receipts.items.flatMap(p=>[p.image,p.imageDark].filter(Boolean))]);
  for (const file of publicFiles) {
    assert.ok(allowed.has(file), `Unexpected deployed file: ${file}`);
    assert.doesNotMatch(file, /private|raw|evidence|extract|\.env|\.heic|\.json$|node_modules/i);
    if (/\.(html|js|css|svg|xml|txt)$/.test(file)) {
      const body = read('preview', file);
      assert.doesNotMatch(body, /\/Users\/|sales-evidence|IMG_\d|SUPABASE_SERVICE_ROLE|RESEND_API_KEY|NOTION_TOKEN|TURNSTILE_SECRET|estimated commissions|commission earnings|commission statement/i);
      const emails = [...body.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map(m=>m[0]);
      assert.ok(emails.every(email=>email==='contact@hammadmedia.com'), `Unexpected contact information in ${file}`);
    }
  }
});

test('both forms match the server qualification rules and expose only the same allowed engagements', () => {
  for (const [locale, file] of [['en','index.html'], ['zh','zh/index.html']]) {
    const html = read('preview', file);
    assert.match(html, /<form id="inquiry-form" action="\/api\/intake" method="post">/);
    assert.match(html, /name="paid_partnership_ack" type="checkbox" required/);
    assert.match(html, /id="inquiry-submit"[^>]*disabled/);
    const choices = [...html.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(choices, ENGAGEMENTS);
    const tags = [...html.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map(m=>[attrs(m[0]),m[0]]);
    const base = {submission_id:'fce4ae44-a499-4c0e-a149-4ceda4a2992f',brand:'Acme',email:'brand@example.com',product:'Product',engagement:'Exclusivity',exact_category:'Collagen powder',paid_partnership_ack:true,locale};
    for (const name of ['brand','name','product','exact_category','commission','timing','message']) {
      const tag = tags.find(([a])=>a.name===name)[0];
      assert.ok(Number(tag.maxlength)>0);
      assert.doesNotThrow(()=>validate({...base,[name]:'A'.repeat(Number(tag.maxlength))}), name);
    }
    for (const name of ['brand','email','product']) assert.match(tags.find(([a])=>a.name===name)[1], /\brequired\b/);
    assert.throws(()=>validate({...base,paid_partnership_ack:false}), /paid_partnership_required/);
    assert.throws(()=>validate({...base,exact_category:''}), /invalid_fields/);
    assert.doesNotThrow(()=>validate({...base,engagement:'5 videos',exact_category:''}));
  }
});

test('bilingual public policies preserve paid-only qualification, creative control, separate advertising rights and old-content exclusivity', () => {
  const en = read('preview'), zh = read('preview','zh/index.html');
  for (const text of ['100% upfront', 'Commission-only and gifted-only campaigns are not accepted', 'creative control stays on our side', 'not automatically included in the package price', 'Existing content stays live', 'includes no videos', 'does not book a campaign or commit you to payment', 'not Hammad Media revenue or commission']) assert.ok(en.includes(text), text);
  for (const text of ['100%预付', '不接受纯佣金或仅赠送样品', '创作控制权保留在我方', '不自动包含在套餐价格内', '已有内容继续保留', '不含视频', '不产生付款义务', '并非 Hammad Media 的营收或佣金']) assert.ok(zh.includes(text), text);
  for (const file of ['privacy/index.html','zh/privacy/index.html']) {
    const privacy = read('preview',file);
    for (const provider of ['Vercel','Turnstile','Supabase','Notion','Resend','Google Analytics']) assert.ok(privacy.includes(provider));
  }
  for (const file of ['404.html']) {
    assert.match(read('preview',file), /does not confirm an inquiry was received/);
    assert.match(read('preview',file), /noindex/);
  }
});

test('production Analytics configuration strips query strings and fragments from page and referring URLs', () => {
  const html = read('production');
  const inline = read('production', 'assets/redesign/analytics.js');
  const consentTimestamp=Date.now()-1000;
  const context = {window:{},document:{body:{dataset:{preview:'false'}},title:'Hammad Media',referrer:'https://referrer.example/path?email=private@example.com#secret',getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){}}}, location:new URL('https://hammadmedia.com/zh/?email=private@example.com#secret'),URL,URLSearchParams,Date,localStorage:{getItem:()=>JSON.stringify({version:1,choice:'accepted',timestamp:consentTimestamp}),setItem(){}},addEventListener(){},setTimeout:()=>1,clearTimeout(){}};
  // Browser global names and window properties share the same global object.
  context.window=context;
  vm.runInNewContext(inline, context);
  const events = context.dataLayer.map(args=>Array.from(args));
  const json = JSON.stringify(events);
  assert.doesNotMatch(json, /private@example|secret|\?email/);
  const config = events.find(e=>e[0]==='config')[2];
  assert.equal(config.send_page_view,false);
  assert.equal(config.page_location,'https://hammadmedia.com/zh/');
  assert.equal(config.page_referrer,'https://referrer.example');
});

// A small DOM substitute exercises the actual client state machine without contacting any service.
function clientHarness({store = new Map(), post, locale = 'en', preview = false, enabled = true, query='?utm_source=tiktok&email=private@example.com'} = {}) {
  const calls = [], analytics = [], scripts = [];
  class Element {
    constructor(value='') {this.value=value;this.checked=false;this.disabled=false;this.required=false;this.hidden=false;this.textContent='';this.dataset={};this.handlers={};this.children=[];this.classList={toggle(){}};}
    addEventListener(name,handler){(this.handlers[name] ||= []).push(handler);}
    setAttribute(name,value){this[name]=value;}
    append(...values){this.children.push(...values);}
    async fire(name){for(const handler of this.handlers[name]||[])await handler({preventDefault(){}});}
  }
  const fields = Object.fromEntries(['brand','name','email','product','engagement','message','commission','timing','exact_category','website','paid_partnership_ack'].map(k=>[k,new Element()]));
  Object.assign(fields.brand,{value:'Private brand text',required:true});Object.assign(fields.email,{value:'private@example.com',required:true});Object.assign(fields.product,{value:'Private product detail',required:true});
  fields.engagement.value='5 videos';fields.message.value='Private campaign message';fields.commission.value='Private offered commission';fields.name.value='Private person name';fields.paid_partnership_ack.checked=true;
  const form = new Element();form.elements=fields;
  const button = new Element(), status = new Element(), category = new Element(), token = new Element();
  form.reportValidity=()=>Object.values(fields).every(f=>f.disabled||!f.required||Boolean(f.value));
  form.querySelectorAll=()=>[...Object.values(fields),button];
  const nodes={'inquiry-form':form,'category-field':category,'inquiry-submit':button,'form-status':status,'turnstile-container':token};
  const tiers=['5 videos','Exclusivity'].map(value=>{const a=new Element();a.dataset.tier=value;return a;});
  const document={documentElement:{lang:locale==='zh'?'zh-CN':'en',dataset:{theme:'dark'}},body:{dataset:{preview:String(preview)}},referrer:'https://referrer.example/path?email=private@example.com',
    getElementById:id=>nodes[id],querySelector:()=>null,querySelectorAll:selector=>selector==='[data-tier]'?tiers:[],createElement:()=>new Element(),head:{append(script){scripts.push(script);}}};
  let uuid=0, challenge, widget=0;
  const context={document,location:{origin:'https://hammadmedia.com',pathname:locale==='zh'?'/zh/':'/',search:query,href:'https://hammadmedia.com/'+(locale==='zh'?'zh/':'')+query},URL,URLSearchParams,AbortController,
    localStorage:{getItem(){return null;},setItem(){}},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`},
    FormData:class{get(k){const f=fields[k];return !f||f.disabled?null:k==='paid_partnership_ack'?(f.checked?'on':null):f.value;}},
    setTimeout:()=>1,clearTimeout(){},gtag:(...args)=>{analytics.push(args);args[2]?.event_callback?.();},
    fetch:async(url,options={})=>{if(url==='/api/intake-config')return {ok:true,json:async()=>({enabled,turnstileSiteKey:enabled?'public-site-key':null})};
      const body=JSON.parse(options.body);calls.push(body);if(post)return post(body,calls.length);return {status:202,json:async()=>({ok:true,status:'received',submission_id:body.submission_id})};},
    turnstile:{render(container,options){challenge=options;return ++widget;},remove(){}},
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/attribution.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/site.js'),'utf8'),context);
  const ready=(async()=>{for(let i=0;i<8;i++)await Promise.resolve();if(context.hmTurnstileReady){context.hmTurnstileReady();challenge.callback('ephemeral-token');}})();
  return {store,calls,analytics,fields,status,button,category,form,tiers,context,ready,verify(){challenge.callback('fresh-ephemeral-token');},submit:()=>form.fire('submit')};
}

test('uncertain delivery survives refresh with the same reference and frozen attribution, and clears only after confirmed receipt', async () => {
  const store = new Map();
  const first=clientHarness({store,post:async()=>{throw new Error('Connection lost after possible acceptance');}});await first.ready;
  await first.form.fire('focusin');await first.submit();
  assert.equal(first.calls.length,1);assert.match(first.status.textContent,/could not confirm receipt/);
  const saved=JSON.parse(store.get('hm-pending-inquiry-v1'));
  assert.equal(saved.payload.submission_id,first.calls[0].submission_id);
  assert.ok(!('turnstile_token' in saved.payload));
  assert.doesNotMatch(JSON.stringify(saved),/ephemeral-token/);
  const restored=clientHarness({store,query:'?utm_source=changed-after-refresh'});await restored.ready;
  assert.equal(restored.fields.email.value,'private@example.com');
  assert.match(restored.status.textContent,/Restored an inquiry with unconfirmed receipt/);
  await restored.submit();
  const withoutToken=({turnstile_token,...body})=>body;
  assert.deepEqual(withoutToken(restored.calls[0]),withoutToken(first.calls[0]));
  assert.equal(restored.calls[0].attribution.utm_source,'tiktok');
  assert.equal(store.has('hm-pending-inquiry-v1'),false);
  assert.match(restored.status.textContent,/inquiry has been received/);
  assert.equal(restored.button.disabled,true);
  const events=JSON.stringify([...first.analytics,...restored.analytics]);
  assert.match(events,/generate_lead/);
  assert.doesNotMatch(events,/Private|private@example|offered commission|\?utm|\?email/);
});

test('503 keeps in-page retry, provides an email alternative, and reuses the saved envelope', async () => {
  const app=clientHarness({post:async(p,n)=>({status:n===1?503:202,json:async()=>n===1?{}:{ok:true,status:'received',submission_id:p.submission_id}})});await app.ready;
  await app.submit();assert.match(app.status.textContent,/could not confirm receipt/);
  assert.ok(app.status.children.some(e=>e && e.href==='mailto:contact@hammadmedia.com'));
  assert.equal(app.button.textContent,'Retry inquiry');
  const saved=app.store.get('hm-pending-inquiry-v1');assert.ok(saved);
  app.context.location.search='?utm_source=should-not-change-retry';app.verify();await app.submit();
  assert.equal(app.calls.length,2);assert.equal(app.calls[0].submission_id,app.calls[1].submission_id);
  assert.deepEqual(app.calls[0].attribution,app.calls[1].attribution);
  assert.equal(app.store.has('hm-pending-inquiry-v1'),false);
  assert.ok(app.store.has('hm-inquiry-receipt-v1'));
});

test('material edits renew the reference and payload; exclusivity requires its category', async () => {
  const app=clientHarness({post:async()=>({status:503,json:async()=>({})})});await app.ready;await app.submit();
  const before=app.calls[0].submission_id;
  app.fields.product.value='Changed product';await app.form.fire('input');
  assert.equal(app.store.has('hm-pending-inquiry-v1'),false);app.verify();await app.submit();
  assert.notEqual(app.calls[1].submission_id,before);assert.equal(app.calls[1].product,'Changed product');
  await app.tiers[1].fire('click');
  assert.equal(app.fields.engagement.value,'Exclusivity');assert.equal(app.category.hidden,false);assert.equal(app.fields.exact_category.required,true);assert.equal(app.fields.exact_category.disabled,false);
  const count=app.calls.length;await app.submit();assert.equal(app.calls.length,count);
  app.fields.exact_category.value='Collagen powder';await app.form.fire('input');app.verify();await app.submit();assert.equal(app.calls.at(-1).exact_category,'Collagen powder');
});

test('disabled preview forms only prepare an email draft and never submit or report a lead', async () => {
  const app=clientHarness({preview:true,enabled:false});await app.ready;
  await app.form.fire('focusin');await app.submit();
  assert.equal(app.calls.length,0);assert.equal(app.analytics.length,0);assert.equal(app.store.has('hm-pending-inquiry-v1'),false);
  assert.match(app.context.location.href,/^mailto:contact@hammadmedia\.com/);
  assert.match(app.status.textContent,/Opening an email draft does not submit/);
  assert.doesNotMatch(app.status.textContent,/inquiry has been received/);
});

test('only a matching durable receipt navigates to localized confirmation and counts one lead', async () => {
  for(const locale of ['en','zh']){
    const app=clientHarness({locale});await app.ready;await app.submit();
    assert.equal(app.context.location.href,locale==='zh'?'/zh/thanks/':'/thanks/');
    const receipt=JSON.parse(app.store.get('hm-inquiry-receipt-v1'));
    assert.equal(receipt.reference,app.calls[0].submission_id);
    assert.doesNotMatch(JSON.stringify(receipt),/Private|private@example|campaign|commission/);
    assert.equal(app.analytics.filter(e=>e[1]==='generate_lead').length,1);
    await app.submit();assert.equal(app.analytics.filter(e=>e[1]==='generate_lead').length,1);
  }
  const wrong=clientHarness({post:async()=>({status:202,json:async()=>({ok:true,status:'received',submission_id:'different-reference'})})});await wrong.ready;await wrong.submit();
  assert.equal(wrong.analytics.filter(e=>e[1]==='generate_lead').length,0);
  assert.equal(wrong.store.has('hm-inquiry-receipt-v1'),false);
  assert.doesNotMatch(wrong.context.location.href,/thanks/);
});

test('a replayed receipt after back navigation does not repeat the lead event', async()=>{
  const first=clientHarness();await first.ready;await first.submit();
  const replay=clientHarness({store:first.store});await replay.ready;await replay.submit();
  assert.equal(replay.calls[0].submission_id,first.calls[0].submission_id);
  assert.equal(replay.analytics.filter(e=>e[1]==='generate_lead').length,0);
});

test('thank-you pages track production page views but are always noindex and never infer conversions from a URL',()=>{
  for(const file of ['thanks/index.html','zh/thanks/index.html','thanks.html']){
    const page=read('production',file);
    assert.match(page,/noindex/);assert.match(page,/assets\/redesign\/analytics.js/);
    assert.match(page,/id="confirmation-received" hidden/);
    assert.match(page,/id="confirmation-missing"/);
    assert.match(page,/src="\/assets\/redesign\/thanks\.js\?v=[a-f0-9]{16}"/);
    assert.doesNotMatch(page,/<form|name="email"/);
    assert.doesNotMatch(read('preview',file),/googletagmanager/);
  }
});
