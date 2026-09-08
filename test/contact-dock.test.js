'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-contact-dock-'));
test.before(() => execFileSync(process.execPath, [path.join(ROOT, 'build.js')], {
  cwd: ROOT, env: {...process.env, HM_BUILD_OUTPUT_DIR: output, VERCEL_ENV: 'preview', PUBLIC_LAUNCH_APPROVED: 'false'}, stdio: 'pipe'
}));
test.after(() => fs.rmSync(output, {recursive:true, force:true}));
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'")]));

test('each localized landing page has one persistent two-action dock and a separate attributed WhatsApp contact link', () => {
  for (const [file, labels, source] of [
    ['index.html', ['Start a Partnership', 'WhatsApp'], ['EN', 'floating CTA', 'contact section']],
    ['zh/index.html', ['洽谈合作', 'WhatsApp'], ['中文', '悬浮入口', '联系板块']]
  ]) {
    const html = fs.readFileSync(path.join(output, file), 'utf8');
    const docks = [...html.matchAll(/<nav class="conversion-dock"[^>]*>([\s\S]*?)<\/nav>/g)];
    assert.equal(docks.length, 1, `${file}: one dock replaces the mobile-only strip`);
    assert.doesNotMatch(html, /class="sticky-mobile"/);
    const links = [...docks[0][1].matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)];
    assert.equal(links.length, 2);
    assert.equal(attributes(links[0][0]).href, '#contact');
    assert.match(links[0][0], /data-inquiry-cta/);
    labels.forEach(label => assert.ok(docks[0][1].includes(label)));
    const contact = html.match(/<section id="contact"[\s\S]*?<\/section>/)[0];
    const whatsApp = [...contact.matchAll(/<a\b[^>]*href="https:\/\/wa.me\/[^>]+>/g)];
    assert.equal(whatsApp.length, 1);
    for (const [link, position] of [[links[1][0], source[1]], [whatsApp[0][0], source[2]]]) {
      const a = attributes(link), url = new URL(a.href);
      assert.equal(url.origin, 'https://wa.me');
      assert.equal(url.pathname, '/19297709434');
      assert.deepEqual([...url.searchParams.keys()], ['text']);
      assert.ok(url.searchParams.get('text').includes(source[0]));
      assert.ok(url.searchParams.get('text').includes(position));
      assert.doesNotMatch(url.searchParams.get('text'), /submission_id|HM-WEB-|utm_|email=/);
      assert.equal(a.target, '_blank');
      assert.ok(a.rel.split(' ').includes('noopener'));
    }
  }
  for (const file of ['thanks/index.html', 'zh/thanks/index.html', 'privacy/index.html']) {
    assert.doesNotMatch(fs.readFileSync(path.join(output, file), 'utf8'), /class="conversion-dock"/);
  }
});

test('the header keeps FAQ and an explicit inquiry action alongside the main sections in both languages', () => {
  for (const [file, home, inquiry] of [['index.html','/','Start a Partnership'], ['zh/index.html','/zh/','洽谈合作']]) {
    const html = fs.readFileSync(path.join(output, file), 'utf8');
    const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
    const navigation = header.match(/<nav class="main-nav"[\s\S]*?<\/nav>/)[0];
    for (const section of ['results','packages','process','faq','contact']) assert.ok(navigation.includes(`href="${home}#${section}"`), section);
    assert.ok(navigation.includes(inquiry));
    assert.match(navigation, /data-inquiry-cta/);
    assert.match(header, /data-language-switch/);
    assert.match(header, /class="theme-toggle"/);
    assert.match(html, /class="hero-label-title"/);
  }
});

function clickHarness({preview = false, locale = 'en', analytics = true} = {}) {
  const events = [];
  const anchor = (href, location) => ({
    href, dataset: {ctaLocation:'private visitor text'}, textContent:'private@example.com', handlers: {},
    closest: selector => (selector === '.conversion-dock' && location === 'sticky') || (selector === '.site-header' && location === 'header') ? {} : null,
    addEventListener(name, handler) { this.handlers[name] = handler; }
  });
  const sticky = anchor('https://wa.me/19297709434?text=private-should-not-enter-analytics', 'sticky');
  const contact = anchor('https://wa.me/19297709434?text=private-should-not-enter-analytics', 'contact');
  const inquiry = anchor('#contact', 'sticky');
  const header = anchor('/#contact', 'header');
  const context = {
    document: {documentElement: {lang:locale}, body:{dataset:{preview:String(preview)}},
      querySelector: () => null, getElementById: () => null,
      querySelectorAll: selector => selector.includes('a[href^="mailto:') ? [sticky, contact] : selector === '[data-inquiry-cta]' ? [inquiry, header] : []},
    location: new URL('https://hammadmedia.com/?email=private@example.com&text=private'),
  };
  context.window = context;
  if (analytics) context.gtag = (...args) => events.push(args);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/redesign/site.js'), 'utf8'), context);
  return {events, sticky, contact, inquiry, header};
}

test('WhatsApp and inquiry clicks use separate fixed events and never count an anonymous click as a lead', () => {
  for (const locale of ['en', 'zh-CN']) {
    const app = clickHarness({locale});
    assert.equal(typeof app.inquiry.handlers.click, 'function', 'inquiry action has its own click listener');
    app.sticky.handlers.click(); app.contact.handlers.click(); app.inquiry.handlers.click(); app.header.handlers.click();
    assert.deepEqual(app.events.map(e => e[1]), ['contact_click', 'contact_click', 'inquiry_cta_click', 'inquiry_cta_click']);
    assert.deepEqual(app.events.map(e => e[2].cta_location), ['sticky', 'contact', 'sticky', 'header']);
    assert.deepEqual(app.events.slice(0,2).map(e => e[2].contact_method), ['whatsapp', 'whatsapp']);
    app.events.forEach(e => {
      assert.equal(e[2].site_language, locale === 'en' ? 'en' : 'zh');
      assert.equal(e[2].page_location, 'https://hammadmedia.com/');
    });
    assert.doesNotMatch(JSON.stringify(app.events), /generate_lead|private|19297709434|wa\.me|HM-WEB/);
  }
});

test('preview and blocked Analytics keep the contact actions independent of tracking', () => {
  for (const settings of [{preview:true}, {analytics:false}]) {
    const app = clickHarness(settings);
    assert.equal(typeof app.inquiry.handlers.click, 'function', 'inquiry navigation is wired without requiring Analytics');
    app.sticky.handlers.click(); app.contact.handlers.click(); app.inquiry.handlers.click();
    assert.equal(app.events.length, 0);
  }
});
