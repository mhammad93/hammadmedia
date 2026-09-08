'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const asset = path.join(__dirname, '../assets/analytics-consent-v1.js');
const source = fs.existsSync(asset) ? fs.readFileSync(asset, 'utf8') : '';
const consentKey = 'hm-analytics-consent-v1';
const handoffKey = 'hm-formsubmit-handoff-v1';
const campaignKey = 'hm-legacy-campaign-v1';
const now = Date.UTC(2026, 8, 8);
const accepted = JSON.stringify({ version: 1, choice: 'accepted', timestamp: now - 1000 });

function browser(options = {}) {
  const scripts = [], cookies = [], timers = new Map();
  const local = options.local || new Map(options.accepted ? [[consentKey, accepted]] : []);
  const session = options.session || new Map();
  let clock = now, reloads = 0, timerId = 0;
  function target() {
    const handlers = new Map();
    return { hidden: true, removed: false, focused: false,
      addEventListener(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); },
      dispatch(name, extras = {}) { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extras }; for (const fn of handlers.get(name) || []) fn(event); return event; },
      click() { return this.dispatch('click'); }, focus() { this.focused = true; }, remove() { this.removed = true; },
    };
  }
  const banner = target(), accept = target(), decline = target(), settings = target(), recent = target(), unverified = target();
  unverified.hidden = false;
  const form = target(); form.checkValidity = () => options.valid !== false;
  // The getters catch accidental collection of text fields or selected commission.
  form.elements = { engagement: { value: options.engagement || 'Starter (5 videos)' } };
  for (const field of ['brand', 'email', 'message', 'commission', 'shop_link']) Object.defineProperty(form.elements, field, { get() { throw new Error('Private field read: ' + field); } });
  const formPresent = options.path !== '/thanks.html';
  const elements = { 'analytics-consent': banner, 'analytics-accept': accept, 'analytics-decline': decline, 'inquiry-recent-handoff': recent, 'inquiry-unverified': unverified };
  const document = Object.assign(target(), {
    body: { dataset: {} }, documentElement: { lang: 'en' }, title: 'Hammad Media',
    referrer: options.referrer || 'https://partner.example/personal?email=secret@example.com',
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) { return selector === '.contact form' && formPresent ? form : null; },
    querySelectorAll(selector) { return selector === '[data-analytics-settings]' ? [settings] : []; },
    createElement() { return target(); }, head: { appendChild(script) { scripts.push(script); } },
  });
  Object.defineProperty(document, 'cookie', { get: () => '_ga=old; _ga_NEX74824JL=old; other=keep', set: value => cookies.push(value) });
  const location = new URL(options.url || 'https://hammadmedia.com' + (options.path || '/') + '?utm_source=tiktok&utm_campaign=paid_partnerships&email=secret@example.com&gclid=opaque');
  location.reload = () => reloads++;
  const scope = Object.assign(target(), { document, location,
    localStorage: { getItem: k => { if (options.blocked) throw Error('blocked'); return local.get(k) ?? null; }, setItem: (k, v) => { if (options.blocked) throw Error('blocked'); local.set(k, v); }, removeItem: k => local.delete(k) },
    sessionStorage: { getItem: k => { if (options.sessionBlocked) throw Error('blocked'); return session.get(k) ?? null; }, setItem: (k, v) => { if (options.sessionBlocked) throw Error('blocked'); session.set(k, v); }, removeItem: k => { if (options.sessionBlocked) throw Error('blocked'); session.delete(k); } },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); },
  });
  const context = vm.createContext({ window: scope, document, location, URL, URLSearchParams, Date: class extends Date { static now() { return clock; } }, setTimeout: scope.setTimeout, clearTimeout: scope.clearTimeout });
  const run = () => vm.runInContext(source, context); run();
  return { scope, document, form, banner, accept, decline, settings, recent, unverified, scripts, cookies, local, session, run,
    events: () => Array.from(scope.dataLayer || [], item => Array.from(item)),
    get reloads() { return reloads; },
    expire() { clock += 181 * 86400000; for (const [id, timer] of Array.from(timers)) { timers.delete(id); timer.fn(); } },
    link(href, tier = null) {
      const link = { href: new URL(href, location).href, getAttribute: key => key === 'href' ? href : key === 'data-tier' ? tier : null,
        closest: selector => selector === 'a[href]' ? link : null };
      return document.dispatch('click', { target: link });
    },
  };
}

test('production consent starts off and never queues pre-consent intent or form information', () => {
  const b = browser();
  b.form.dispatch('focusin'); b.form.dispatch('submit'); b.link('mailto:contact@hammadmedia.com');
  assert.equal(b.banner.hidden, false);
  assert.equal(b.scope.gtag, undefined);
  assert.equal(b.scripts.length, 0);
  assert.deepEqual(b.events(), []);
  assert.ok(b.session.has(handoffKey)); // Public campaign labels and timestamp-only return recognition need no Analytics tag.
  assert.equal(JSON.parse(b.session.get(handoffKey)).analyticsEligible, false);
});

test('saved or fresh explicit acceptance loads once and emits one sanitized page view', () => {
  for (const stored of [false, true]) {
    const b = browser({ accepted: stored }); if (!stored) b.accept.click();
    b.accept.click(); b.run();
    assert.equal(b.scripts.length, 1);
    assert.equal(b.scripts[0].referrerPolicy, 'no-referrer');
    assert.equal(b.events().filter(e => e[0] === 'event' && e[1] === 'page_view').length, 1);
    const config = b.events().find(e => e[0] === 'config')[2];
    assert.equal(config.send_page_view, false);
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.allow_ad_personalization_signals, false);
    assert.equal(config.page_location, 'https://hammadmedia.com/');
    assert.equal(config.page_referrer, 'https://partner.example');
    assert.equal(config.campaign_source, 'tiktok');
    assert.doesNotMatch(JSON.stringify(b.events()), /secret@example|opaque|personal\?|"(?:user_id|user_data)":/);
  }
});

test('preview, mirror, local, insecure and lookalike hosts never initialize even with consent', () => {
  for (const url of ['https://hammadmedia-test.vercel.app/', 'https://mhammad93.github.io/hammadmedia/', 'http://localhost:3000/', 'http://hammadmedia.com/', 'https://hammadmedia.com.attacker.test/', 'https://hammadmedia.com:8443/']) {
    const b = browser({ url, accepted: true }); b.accept.click();
    assert.equal(b.scripts.length, 0, url);
    assert.equal(b.scope.gtag, undefined, url);
    assert.equal(b.banner.hidden, true, url);
  }
  assert.equal(browser({ url: 'https://www.hammadmedia.com/', accepted: true }).scripts.length, 1);
});

test('decline, expired, malformed and restricted storage remain inactive', () => {
  const decline = browser(); decline.decline.click();
  assert.equal(decline.banner.hidden, true);
  assert.equal(JSON.parse(decline.local.get(consentKey)).choice, 'declined');
  decline.settings.click(); assert.equal(decline.banner.hidden, false);
  for (const raw of ['{', JSON.stringify({ version: 1, choice: 'accepted', timestamp: now - 180 * 86400000 }), JSON.stringify({ version: 1, choice: 'accepted', timestamp: now + 1 })]) {
    const b = browser({ local: new Map([[consentKey, raw]]) }); assert.equal(b.scripts.length, 0); assert.equal(b.banner.hidden, false);
  }
  const blocked = browser({ accepted: true, blocked: true }); blocked.accept.click(); assert.equal(blocked.scripts.length, 0);
});

test('withdrawal disables the property, cancels queued callbacks and only deletes GA cookies', () => {
  const b = browser({ accepted: true }); let callbacks = 0;
  const tag = b.scope.gtag; assert.equal(typeof tag, 'function');
  tag('event', 'test', { event_callback: () => callbacks++ });
  const callback = b.events().find(e => e[1] === 'test')[2].event_callback;
  b.decline.click(); tag('event', 'late'); callback();
  assert.equal(b.scope['ga-disable-G-NEX74824JL'], true);
  assert.equal(b.scope.gtag, undefined); assert.equal(callbacks, 0);
  assert.equal(b.reloads, 1); assert.equal(b.scripts[0].removed, true);
  assert.deepEqual(b.events(), []);
  assert.ok(b.cookies.length); assert.ok(b.cookies.every(value => /^_ga(?:_NEX74824JL)?=;/.test(value)));
});

test('accepted native form handoff remains unblocked, has no private values, and is not a lead', () => {
  const b = browser({ accepted: true });
  b.form.dispatch('focusin'); b.form.dispatch('focusin');
  const event = b.form.dispatch('submit');
  assert.equal(event.defaultPrevented, false);
  assert.equal(b.events().filter(e => e[1] === 'partnership_form_start').length, 1);
  const handoff = b.events().filter(e => e[1] === 'partnership_form_handoff');
  assert.equal(handoff.length, 1);
  assert.equal(handoff[0][2].partnership_package, 'starter_5_videos');
  const marker = JSON.parse(b.session.get(handoffKey));
  assert.deepEqual(Object.keys(marker).sort(), ['analyticsEligible', 'returnViewed', 'submittedAt', 'version']);
  assert.equal(b.events().some(e => e[1] === 'generate_lead'), false);
});

test('invalid or prevented submissions do not receive a handoff marker', () => {
  for (const options of [{ valid: false }, { valid: true }]) {
    const b = browser({ accepted: true, ...options });
    b.form.dispatch('submit', { defaultPrevented: options.valid });
    assert.equal(b.session.has(handoffKey), false);
    assert.equal(b.events().some(e => e[1] === 'partnership_form_handoff'), false);
  }
});

test('thank-you URL alone never becomes a confirmed submission or contextual return', () => {
  const b = browser({ path: '/thanks.html', accepted: true, referrer: 'https://formsubmit.co/' });
  assert.equal(b.events().some(e => ['generate_lead', 'formsubmit_return_view'].includes(e[1])), false);
  assert.equal(b.events().filter(e => e[1] === 'page_view').length, 1);
  assert.equal(b.events().find(e => e[0] === 'config')[2].ignore_referrer, true);
  assert.equal(b.recent.hidden, true); assert.equal(b.unverified.hidden, false);
});

test('a recent same-tab handoff supports one contextual return without claiming inbox delivery', () => {
  const first = browser({ accepted: true }); first.form.dispatch('submit');
  const returned = browser({ accepted: true, path: '/thanks.html', session: first.session });
  assert.equal(returned.events().filter(e => e[1] === 'formsubmit_return_view').length, 1);
  assert.equal(JSON.parse(returned.session.get(handoffKey)).returnViewed, true);
  assert.equal(returned.recent.hidden, false); assert.equal(returned.unverified.hidden, true);
  const refreshed = browser({ accepted: true, path: '/thanks.html', session: first.session });
  assert.equal(refreshed.events().some(e => ['generate_lead', 'formsubmit_return_view'].includes(e[1])), false);
  assert.equal(refreshed.recent.hidden, false);
});

test('functional confirmation works without Analytics consent and is never replayed as a tracked handoff', () => {
  const first = browser(); first.form.dispatch('submit');
  const returned = browser({ path: '/thanks.html', session: first.session });
  assert.equal(returned.recent.hidden, false); assert.equal(returned.scripts.length, 0);
  returned.accept.click();
  assert.equal(returned.events().some(e => ['generate_lead', 'formsubmit_return_view', 'partnership_form_handoff'].includes(e[1])), false);
});

test('old, corrupt or inaccessible handoff markers cannot create a return event', () => {
  for (const raw of ['{', JSON.stringify({ version: 1, submittedAt: now - 31 * 60000 }), JSON.stringify({ version: 1, submittedAt: now + 1 })]) {
    const b = browser({ accepted: true, path: '/thanks.html', session: new Map([[handoffKey, raw]]) });
    assert.equal(b.events().some(e => e[1] === 'formsubmit_return_view'), false);
  }
  const b = browser({ accepted: true, sessionBlocked: true });
  assert.equal(b.form.dispatch('submit').defaultPrevented, false);
});

test('contact and package intent use fixed labels without copying target URLs or form data', () => {
  const b = browser({ accepted: true });
  assert.equal(b.link('mailto:contact@hammadmedia.com?body=private-message').defaultPrevented, false);
  b.link('https://wa.me/19297709434?text=private-message');
  b.link('#contact', 'Starter (5 videos)');
  b.link('#contact', 'attacker-entered-private-text');
  b.link('#contact', '__proto__'); b.link('#contact', 'constructor');
  assert.equal(b.events().filter(e => e[1] === 'contact_click').length, 2);
  assert.equal(b.events().filter(e => e[1] === 'package_select').length, 1);
  assert.doesNotMatch(JSON.stringify(b.events()), /private-message|attacker-entered|mailto:|wa\.me/);
});

test('unexpected package values cannot escape the fixed Analytics label list', () => {
  const b = browser({ accepted: true, engagement: '__proto__' }); b.form.dispatch('submit');
  const handoff = b.events().find(e => e[1] === 'partnership_form_handoff');
  assert.equal(handoff[2].partnership_package, undefined);
});

test('consent expiry stops an open production page', () => {
  const b = browser({ accepted: true }); b.expire();
  assert.equal(b.scope.gtag, undefined); assert.equal(b.reloads, 1);
});

test('only approved public campaign labels reach the consented GA configuration', () => {
  const b=browser({accepted:true,url:'https://hammadmedia.com/?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=zh_overview&utm_id=receipt_123'});
  const config=b.events().find(e=>e[0]==='config')[2];
  assert.equal(config.campaign_source,'brand_kit');assert.equal(config.campaign_medium,'referral');
  assert.equal(config.campaign_name,'paid_partnerships');assert.equal(config.campaign_content,'zh_overview');
  assert.equal(config.campaign_id,undefined);
  assert.doesNotMatch(JSON.stringify(b.events()),/receipt_123|utm_id/);
});

test('PII-shaped, unknown, wrong-field and duplicated campaign labels fail closed', () => {
  const {campaignFields}=require('../assets/analytics-consent-v1.js');
  for(const value of ['jane.doe','12125550123','customer-938475','receipt_123','newsletter','TIKTOK','__proto__']){
    const query=new URLSearchParams(Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_id'].map(key=>[key,value])));
    assert.deepEqual(campaignFields(query.toString()),{},value);
  }
  assert.deepEqual(campaignFields('?utm_source=tiktok&utm_source=jane.doe&utm_medium=tiktok&utm_content=drew_review1_bio'),{campaign_content:'drew_review1_bio'});
  const b=browser({accepted:true,url:'https://hammadmedia.com/?utm_source=jane.doe&utm_medium=12125550123&utm_campaign=customer-938475&utm_content=receipt_123'});
  assert.doesNotMatch(JSON.stringify(b.events()),/jane\.doe|12125550123|customer-938475|receipt_123/);
});

test('approved campaign survives privacy navigation before consent without recording a visitor or event', () => {
  const first=browser({url:'https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio&utm_id=receipt_123&email=private@example.com'});
  assert.equal(first.scripts.length,0);assert.deepEqual(first.events(),[]);
  assert.ok(first.session.has(campaignKey));
  assert.doesNotMatch(first.session.get(campaignKey),/receipt_123|private@example|utm_id|submittedAt|page_path|referrer/);
  const privacy=browser({url:'https://hammadmedia.com/#analytics-privacy',session:first.session});
  assert.equal(privacy.scripts.length,0);privacy.accept.click();
  const config=privacy.events().find(e=>e[0]==='config')[2];
  assert.equal(config.campaign_source,'tiktok');assert.equal(config.campaign_medium,'organic_social');
  assert.equal(config.campaign_name,'paid_partnerships');assert.equal(config.campaign_content,'drew_review_bio');
  assert.equal(privacy.events().filter(e=>e[1]==='page_view').length,1);
});

test('same-tab campaign changes replace earlier fields and hash/popstate never create a page view', () => {
  const first=browser({accepted:true,url:'https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio'});
  first.scope.location.search='?utm_source=agency_outreach&utm_medium=email';
  first.scope.dispatch('popstate');first.scope.dispatch('hashchange');
  assert.equal(first.events().filter(e=>e[1]==='page_view').length,1);
  const later=browser({accepted:true,url:'https://hammadmedia.com/thanks.html',session:first.session});
  const config=later.events().find(e=>e[0]==='config')[2];
  assert.equal(config.campaign_source,'agency_outreach');assert.equal(config.campaign_medium,'email');
  assert.equal(config.campaign_name,undefined);assert.equal(config.campaign_content,undefined);
  const invalid=browser({accepted:true,url:'https://hammadmedia.com/?utm_source=jane.doe',session:first.session});
  assert.equal(invalid.events().find(e=>e[0]==='config')[2].campaign_source,'agency_outreach');
});

test('corrupt and older contaminated campaign storage is sanitized; storage failure leaves current-page attribution usable', () => {
  for(const raw of ['{',JSON.stringify({version:1,campaign:{campaign_source:'jane.doe',campaign_medium:'12125550123',campaign_name:'paid_partnerships',campaign_id:'receipt_123'},email:'private@example.com'})]){
    const session=new Map([[campaignKey,raw]]);
    const b=browser({accepted:true,url:'https://hammadmedia.com/',session});
    assert.doesNotMatch(JSON.stringify(b.events()),/jane\.doe|12125550123|receipt_123|private@example/);
    assert.doesNotMatch(session.get(campaignKey),/jane\.doe|12125550123|receipt_123|private@example/);
  }
  const blocked=browser({accepted:true,sessionBlocked:true,url:'https://hammadmedia.com/?utm_source=tiktok'});
  assert.equal(blocked.events().find(e=>e[0]==='config')[2].campaign_source,'tiktok');
  assert.equal(blocked.form.dispatch('submit').defaultPrevented,false);
  const preview=browser({accepted:true,url:'https://preview.vercel.app/?utm_source=tiktok'});
  assert.equal(preview.session.has(campaignKey),false);assert.equal(preview.scripts.length,0);
});
