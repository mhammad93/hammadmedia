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

test('production privacy describes the live site while preview-only Analytics wording stays in review builds', () => {
  for (const [file, previewSentence] of [['privacy/index.html','This design preview does not load the production Analytics tag.'],['zh/privacy/index.html','本设计预览不加载正式 Analytics 标签。']]) {
    for (const mode of ['preview','unapproved']) assert.ok(read(mode,file).includes(previewSentence));
    const live = read('production',file);
    assert.ok(!live.includes(previewSentence));
    assert.match(live, /It stays off until you allow it|允许之前保持关闭/);
    assert.match(live, /Your inquiry works whether you allow or decline analytics|不论允许或拒绝分析，咨询表单都可使用/);
    assert.match(live, /src="\/assets\/redesign\/analytics\.js\?v=/);
  }
});

test('all share references use the regenerated dated JPEG rather than the stale dollar presentation', () => {
  const asset='assets/og-partnership-gmv-20260908.jpg';
  const bytes=fs.readFileSync(path.join(ROOT,asset));
  assert.deepEqual([...bytes.subarray(0,3)],[0xff,0xd8,0xff]);
  const source=fs.readFileSync(path.join(ROOT,'tools/make_og.py'),'utf8');
  assert.match(source, /metric\['value'\]\['en'\].*estimated attributed GMV/);
  assert.ok(source.includes('og-partnership-gmv-20260908.jpg'));
  for(const mode of ['preview','unapproved','production']){
    for(const file of ['index.html','zh/index.html','privacy/index.html','zh/privacy/index.html','thanks/index.html','zh/thanks/index.html']){
      const html=read(mode,file);
      assert.ok(html.includes(`property="og:image" content="https://hammadmedia.com/${asset}"`));
      assert.doesNotMatch(html,/assets\/og\.jpg/);
    }
    assert.deepEqual(fs.readFileSync(path.join(outputs[mode],asset)),bytes);
    assert.ok(!fs.existsSync(path.join(outputs[mode],'assets/og.jpg')));
  }
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
  assert.ok(html.indexOf(performance.accounts['drew.review1'].gmv.en) < html.indexOf(performance.accounts['drew.review'].gmv.en));
});

test('clean GMV displays appear across hero, totals and cards without altering exact offer prices', () => {
  for (const file of ['index.html', 'zh/index.html']) {
    const html = read('preview', file);
    assert.doesNotMatch(html, /(?:About|约)\s*\$/);
    const hero = html.match(/<div class="hero-case">([\s\S]*?)<\/div>/)[1];
    assert.ok(hero.includes(performance.products.astaxanthin.gmv.en));
    assert.match(hero, /Estimated|估算/);
    const ytd = html.match(/<div class="ytd-strip">([\s\S]*?)<div class="brand-strip">/)[1];
    assert.ok(ytd.includes(performance.metrics.janAugGmv.value.en));
    assert.match(ytd, /Estimated|估算/i);
    for (const price of ['$5,000', '$9,500', '$13,500', '$25,000']) {
      assert.ok(html.includes(`<strong>${price}</strong>`));
      assert.ok(html.includes(`<div class="package-price">${price}</div>`));
      assert.ok(!html.includes(price + '+'));
    }
    assert.match(html, /\$50,000 USD per precisely defined|\$50,000 美元／每个明确界定/);
    const exclusivity = html.match(/<div class="exclusive">([\s\S]*?)<\/section>/)[1];
    assert.ok(!exclusivity.includes('$50,000+'));
  }
});

test('documented partial products use matching GMV and unit labels without implying complete January-August coverage', () => {
  for (const [locale, file] of [['en','index.html'], ['zh','zh/index.html']]) {
    const html = read('preview', file);
    for (const key of ['nmn','magnesium']) {
      const card = html.match(new RegExp(`<article class="product-card" data-product-key="${key}">([\\s\\S]*?)<\\/article>`))[1];
      const metric = performance.products[key];
      assert.ok(card.includes(metric.gmvLabel[locale]));
      assert.ok(card.includes(metric.unitsLabel[locale]));
      assert.ok(card.includes(metric.period[locale]));
      assert.match(card, /partial coverage|部分时段数据/);
      assert.doesNotMatch(card, /Jan 1–Aug 31|2026年1月1日至8月31日/);
    }
  }
});

test('large unit and view numbers omit approximation prefixes while adjacent labels preserve estimate and partial status', () => {
  for(const [locale,file] of [['en','index.html'],['zh','zh/index.html']]){
    const html=read('preview',file);
    for(const key of ['allTimeVideoViews','janAugUnits','historicalProductViews']){
      const metric=performance.metrics[key];
      assert.doesNotMatch(metric.value[locale],/^(About|约)\s|\+/);
      const block=[...html.matchAll(/<div class="metric">([\s\S]*?)<\/div>/g)].find(match=>match[1].includes(metric.label[locale]))[1];
      assert.ok(block.includes(`<strong>${metric.value[locale]}</strong>`));
      assert.match(block,/Estimated|估算/);
      assert.ok(block.includes(metric.note[locale]));
    }
    for(const product of Object.values(performance.products))assert.doesNotMatch(product.units[locale],/^(About|约)\s|\+/);
    for(const account of Object.values(performance.accounts))assert.doesNotMatch(account.units[locale],/^(About|约)\s|\+/);
    assert.doesNotMatch(html, /<span class="(?:product|profile)-qualifier">/);
    assert.match(html, /Estimated units sold|估算售出件数/);
    assert.match(html, /Documented units sold|已记录售出件数/);
    assert.match(html, /partial coverage|部分时段数据/);
  }
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
    'assets/brands/cata-kor.svg', 'assets/award-summit.webp','assets/og-partnership-gmv-20260908.jpg','assets/redesign/site.css','assets/redesign/site.js','assets/redesign/analytics.js','assets/redesign/engagement.js','assets/redesign/thanks.js','assets/redesign/attribution.js','assets/redesign/logo-light.svg','assets/redesign/logo-dark.svg','assets/redesign/astaxanthin-hero.webp','assets/redesign/hero-atelier-light.webp',
    'assets/fonts/manrope.woff2','assets/fonts/fraunces-roman.woff2','assets/fonts/fraunces-italic.woff2',
    ...content.brands.flatMap(b=>[b.logo,b.logo.replace('.png','-original-20260908.png')]),...content.accounts.map(a=>a.avatar),...content.receipts.items.flatMap(p=>[p.image,p.imageDark].filter(Boolean))]);
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
    assert.deepEqual(choices.slice().sort(), ENGAGEMENTS.slice().sort());
    assert.deepEqual(choices.slice(0,4), ['15 videos','30 videos','5 videos','10 videos']);
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

test('bilingual public policies preserve paid-only qualification, creative control, included Spark authorization and old-content exclusivity', () => {
  const en = read('preview'), zh = read('preview','zh/index.html');
  for (const text of ['100% upfront', 'Commission-only and gifted-only campaigns are not accepted', 'creative control stays on our side', '365 days of Spark Ads authorization', 'Ad spend and campaign management are not included', 'Existing content stays live', 'includes no videos', 'does not book a campaign or commit you to payment', 'not Hammad Media revenue or commission']) assert.ok(en.includes(text), text);
  for (const text of ['100%预付', '不接受纯佣金或仅赠送样品', '创作控制权保留在我方', '365天 Spark Ads 广告授权', '不含广告预算与投放管理', '已有内容继续保留', '不含视频', '不产生付款义务', '并非 Hammad Media 的营收或佣金']) assert.ok(zh.includes(text), text);
  for (const file of ['privacy/index.html','zh/privacy/index.html']) {
    const privacy = read('preview',file);
    for (const provider of ['Vercel','Turnstile','Supabase','Notion','Resend','Google Analytics']) assert.ok(privacy.includes(provider));
  }
  for (const file of ['404.html']) {
    assert.match(read('preview',file), /does not confirm an inquiry was received/);
    assert.match(read('preview',file), /noindex/);
  }
});

test('all four video packages consistently include 365-day Spark authorization without granting unrestricted advertising services', () => {
  for (const mode of ['preview','production']) for (const locale of ['en','zh']) {
    const html=read(mode,locale==='en'?'index.html':'zh/index.html');
    const included=locale==='en'?'365-day Spark Ads authorization included':'含365天 Spark Ads 广告授权';
    const cards=[...html.matchAll(/<article class="package[^"]*" data-package-videos="(\d+)">([\s\S]*?)<\/article>/g)];
    assert.deepEqual(cards.map(m=>Number(m[1])),[15,30,5,10]);
    for (const [,quantity,card] of cards) assert.ok(card.includes(included),`${locale}: ${quantity} videos`);
    for (const marker of ['hero','price-ribbon','packages section-space']) {
      const section=[...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].find(m=>m[0].includes(`class="${marker}`))?.[0];
      assert.ok(section?.includes('365'),`${locale}: ${marker}`);
    }
    for (const marker of ['form-intro','contact-facts','package-terms']) {
      const block=html.match(new RegExp(`<[^>]+class="${marker}"[^>]*>([\\s\\S]*?)<\\/(?:p|ul)>`))?.[1];
      assert.ok(block?.includes('365'),`${locale}: ${marker}`);
    }
    const answer=html.match(/<details data-faq-key="advertising_rights">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(answer?.includes('365'));
    for (const text of locale==='en'?[
      'Ad spend and campaign management are not included',
      'Other usage rights require separate agreement',
      'GMV Max use still depends on TikTok eligibility and the necessary account permissions',
      'posts, accounts and authorization dates'
    ]:[
      '费用不含广告预算与投放管理', '其他使用权须另行约定',
      'GMV Max 使用仍须满足 TikTok 的适用条件并具备所需账号权限', '视频、账号与授权起止日期'
    ]) assert.ok(answer.includes(text),`${locale}: ${text}`);
    const exclusivity=html.match(/<div class="exclusive">([\s\S]*?)<\/section>/)?.[1];
    assert.ok(exclusivity.includes(locale==='en'?'No videos included':'费用不含视频'));
    assert.ok(!exclusivity.includes('365'));
    assert.doesNotMatch(html,/Advertising use requires separate agreement\.|广告使用须另行约定。|not automatically included in the package price|不自动包含在套餐价格内/);
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


test('15 and 30 lead bilingual package cards and selectors with unchanged fees and engagements', () => {
  for (const file of ['index.html','zh/index.html']) {
    const html=read('preview',file), zh=file.startsWith('zh/');
    const primary=html.match(/<div class="package-grid package-grid-primary">([\s\S]*?)<div class="smaller-packages">/)[1];
    const secondary=html.match(/<div class="package-grid package-grid-secondary">([\s\S]*?)<p class="package-terms">/)[1];
    const cards=section=>[...section.matchAll(/<article[^>]*data-package-videos="(\d+)"/g)].map(m=>Number(m[1]));
    assert.deepEqual(cards(primary),[15,30]);assert.deepEqual(cards(secondary),[5,10]);
    for(const label of zh?['最受欢迎','全面推广方案']:['MOST POPULAR','FULL-SCALE CAMPAIGN'])assert.ok(primary.includes(label));
    assert.doesNotMatch(html,/BREAKOUT CAMPAIGN|突破增长方案|Start with a focused test/);
    assert.ok(html.includes(zh?'根据我们的经验':'In our experience'));
    assert.ok(html.includes(zh?'并非销量或广告回报保证':'not a sales or ROAS guarantee'));
    for(const ad of ['GMV Max','Spark Ads'])assert.ok(html.includes(ad));
    assert.deepEqual([...html.matchAll(/data-faq-key="([^"]+)"/g)].map(m=>m[1]),['paid_partnership','profile_allocation','creative_control','sales_expectations','advertising_rights','timing','commission','international_teams','exclusivity']);
    const select=html.match(/<select[^>]*name="engagement"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.doesNotMatch(select,/\bselected\b/);
    assert.deepEqual([...select.matchAll(/value="(\d+ videos)"/g)].map(m=>m[1]),['15 videos','30 videos','5 videos','10 videos']);
  }
});

test('shopping performance keeps its April-August denominator separate from January-August GMV', () => {
  for(const mode of ['preview','production']) for(const file of ['index.html','zh/index.html']){
    const locale=file.startsWith('zh/')?'zh':'en',html=read(mode,file);
    const strip=html.match(/<div class="ytd-strip">([\s\S]*?)<div class="brand-strip">/)[1];
    const feature=strip.match(/<div class="ytd-feature">([\s\S]*?)<div class="ytd-heading">/)[1];
    const shopping=strip.slice(strip.indexOf('<div class="ytd-heading">'));
    assert.ok(feature.includes(performance.metrics.janAugGmv.value[locale]));
    assert.ok(feature.includes(performance.metrics.janAugGmv.period[locale]));
    assert.ok(feature.includes(performance.metrics.janAugGmv.label[locale]));
    assert.ok(shopping.includes(performance.shoppingPerformance.period[locale]));
    assert.ok(shopping.includes('GMT-8'));
    assert.ok(shopping.includes(locale==='en'?'Estimated':'估算'));
    assert.ok(!shopping.includes(performance.metrics.janAugGmv.period[locale]));
    const keys=['productClicks','productCtr','gmvPerThousandImpressions','unitsPerHundredClicks'];
    assert.deepEqual([...shopping.matchAll(/data-shopping-metric="([^"]+)"/g)].map(m=>m[1]),keys);
    for(const key of keys){
      const metric=performance.shoppingPerformance.metrics[key];
      const card=shopping.match(new RegExp(`data-shopping-metric="${key}">([\\s\\S]*?)<\\/dd>`))[1];
      assert.ok(card.includes(metric.value[locale]));assert.ok(card.includes(metric.label[locale]));
    }
    assert.ok(shopping.includes(performance.shoppingPerformance.note[locale]));
    assert.doesNotMatch(strip,/402,574|235,289|Profile views|Shares|主页浏览量|分享数|3\.81%|ROAS|conversion rate|转化率/);
  }
});

test('buyer FAQs clarify execution and commercial steps without changing the form contract or inventing client endorsements', () => {
  for(const file of ['index.html','zh/index.html']){
    const zh=file.startsWith('zh/'),html=read('preview',file);
    const answers=Object.fromEntries([...html.matchAll(/<details data-faq-key="([^"]+)">([\s\S]*?)<\/details>/g)].map(m=>[m[1],m[2]]));
    for(const [key,text] of zh?[
      ['creative_control','自主选择适合的表达、场景和服装'],
      ['creative_control','标准合作不包含品牌审批、修改或重拍'],
      ['timing','书面协议和账单'],['timing','签约主体与产品品牌不同'],
      ['timing','按约收到款项与样品后开始制作'],['timing','更换产品或商品链接'],
      ['commission','自然流量订单与广告订单的佣金比例'],['commission','定向合作邀请'],
      ['advertising_rights','发布后由我们手动提供授权码'],['advertising_rights','包括 Meta 广告及转载'],
      ['international_teams','官方 TikTok 账号']
    ]:[
      ['creative_control','choosing the delivery, setting and wardrobe'],
      ['creative_control','Standard campaigns do not include brand approval, revisions or re-filming'],
      ['timing','written agreement and invoice'],['timing','legal entity for the agreement'],
      ['timing','payment and samples are received'],['timing','product substitution or Shop link change'],
      ['commission','organic and ads commission rates separately'],['commission','targeted collaboration invitation'],
      ['advertising_rights','manual authorization codes after publication'],['advertising_rights','including Meta advertising or reposting'],
      ['international_teams','official TikTok profiles']
    ])assert.ok(answers[key].includes(text),text);
    assert.doesNotMatch(html,/48 hours|48小时|guaranteed ROAS|unlimited revisions|无限修改/);
  }
});

test('public authored text assets contain no em dash in either build mode', () => {
  for(const mode of ['preview','production'])for(const file of files(outputs[mode]).filter(f=>/\.(html|js|css|svg|xml|txt)$/.test(f)))assert.ok(!read(mode,file).includes(String.fromCharCode(8212)),`${mode}/${file}`);
});

test('brand hover has one accessible brand name, decorative original artwork and no fake interactive controls', () => {
  for(const file of ['index.html','zh/index.html']){
    const html=read('preview',file),items=[...html.matchAll(/<span class="brand-logo-item">([\s\S]*?)<\/span>/g)];
    assert.equal(items.length,content.brands.length);
    items.forEach((item,i)=>{
      assert.doesNotMatch(item[0],/tabindex|role="button"|<a\b/);
      const images=[...item[1].matchAll(/<img\b[^>]*>/g)].map(m=>attrs(m[0]));
      assert.equal(images[0].alt,esc(content.brands[i].name));
      assert.equal(images[1].alt,'');assert.equal(images[1]['aria-hidden'],'true');
      assert.equal(images[1].src,'/'+content.brands[i].logo.replace('.png','-original-20260908.png'));
      assert.ok(fs.existsSync(path.join(outputs.preview,images[1].src)));
    });
  }
  const css=read('preview','assets/redesign/site.css');
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.brand-logos/);
});
