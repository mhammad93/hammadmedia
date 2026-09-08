'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/redesign/analytics.js'), 'utf8');
const key = 'hm-analytics-consent-v1';
const now = Date.UTC(2026, 8, 8);
const saved = (choice, timestamp = now - 1000) => JSON.stringify({ version: 1, choice, timestamp });

function browser(options = {}) {
  const listeners = new Map(), scripts = [], cookies = [], timers = new Map();
  let clock = now, reloads = 0, timerId = 0;
  const store = new Map(options.raw === undefined ? [] : [[key, options.raw]]);
  function element() {
    const events = new Map();
    return { hidden: true, focused: false, dataset: {},
      addEventListener(name, fn) { events.set(name, fn); },
      click() { events.get('click')?.({ preventDefault() {} }); },
      focus() { this.focused = true; },
      remove() { this.removed = true; },
    };
  }
  const banner = element(), accept = element(), decline = element(), settings = [element(), element()];
  const elements = { 'analytics-consent': banner, 'analytics-accept': accept, 'analytics-decline': decline };
  const document = {
    body: { dataset: { preview: options.preview ? 'true' : 'false' } },
    title: 'Hammad Media — Privacy', referrer: 'https://partner.example/path?email=private@example.com#secret',
    getElementById(id) { return elements[id] || null; },
    querySelectorAll(selector) { return selector === '[data-analytics-settings]' ? settings : []; },
    createElement() { return element(); },
    head: { appendChild(script) { scripts.push(script); } },
  };
  Object.defineProperty(document, 'cookie', {
    get() { return '_ga=GA1.1.123.456; _ga_NEX74824JL=GS1.1.123; unrelated=keep'; },
    set(value) { cookies.push(value); },
  });
  const scope = {
    document,
    location: {
      origin: 'https://www.hammadmedia.com', hostname: options.hostname || 'www.hammadmedia.com', pathname: '/zh/privacy/',
      search: '?utm_source=tiktok&utm_campaign=paid_partnerships&email=private@example.com&utm_term=sensitive&gclid=opaque',
      reload() { reloads++; },
    },
    localStorage: {
      getItem(k) { if (options.readBlocked) throw new Error('blocked'); return store.get(k) ?? null; },
      setItem(k, value) { if (options.writeBlocked) throw new Error('blocked'); store.set(k, value); },
      removeItem(k) { store.delete(k); },
    },
    addEventListener(name, callback) { listeners.set(name, callback); },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  if (options.attribution) scope.hmAttribution = { current: () => options.attribution };
  const context = vm.createContext({ window: scope, document, location: scope.location,
    URL, URLSearchParams, Date: class extends Date { static now() { return clock; } },
    setTimeout: scope.setTimeout, clearTimeout: scope.clearTimeout,
  });
  const run = () => vm.runInContext(source, context);
  run();
  return { scope, banner, accept, decline, settings, scripts, cookies, store, run,
    get reloads() { return reloads; },
    events: () => Array.from(scope.dataLayer || [], args => Array.from(args)),
    storage(raw) { if (raw === null) store.delete(key); else store.set(key, raw); listeners.get('storage')?.({ key, newValue: raw }); },
    expire() { clock = now + 181 * 86400000; for (const [id, { callback }] of Array.from(timers)) { timers.delete(id); callback(); } },
  };
}

test('no choice makes no Google request or event and offers the consent controls', () => {
  const b = browser();
  assert.equal(b.scripts.length, 0);
  assert.equal(b.scope.gtag, undefined);
  assert.deepEqual(b.events(), []);
  assert.equal(b.banner.hidden, false);
});

test('declining persists the choice without tracking and settings can reopen it', () => {
  const b = browser(); b.decline.click();
  assert.equal(JSON.parse(b.store.get(key)).choice, 'declined');
  assert.equal(b.banner.hidden, true);
  assert.equal(b.scope.gtag, undefined);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.reloads, 0);
  b.settings[1].click();
  assert.equal(b.banner.hidden, false);
});

test('a saved acceptance initializes one sanitized page view with a fixed design label and advertising disabled', () => {
  const b = browser({ raw: saved('accepted'), attribution: { page_path: '/', referrer: 'https://partner.example', utm_source: 'agency_outreach', utm_medium: 'email', utm_campaign: 'paid_partnerships', email: 'private@example.com', site_version: 'private@example.com' } });
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-NEX74824JL');
  assert.equal(b.scripts[0].referrerPolicy, 'no-referrer');
  assert.equal(b.banner.hidden, true);
  const events = b.events(), config = events.find(e => e[0] === 'config')[2];
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.campaign_source, 'agency_outreach');
  assert.equal(config.site_version, 'partnership_redesign');
  const page = events.filter(e => e[0] === 'event' && e[1] === 'page_view');
  assert.equal(page.length, 1);
  assert.equal(page[0][2].page_location, 'https://www.hammadmedia.com/zh/privacy/');
  assert.equal(page[0][2].page_referrer, 'https://partner.example');
  assert.equal(page[0][2].site_version, 'partnership_redesign');
  assert.doesNotMatch(JSON.stringify(events), /private@example|sensitive|opaque|"(?:user_id|user_data)":/);
  const consent = events.filter(e => e[0] === 'consent');
  assert.equal(consent[0][2].analytics_storage, 'denied');
  assert.equal(consent[1][2].analytics_storage, 'granted');
  for (const event of consent) {
    assert.equal(event[2].ad_storage, 'denied');
    assert.equal(event[2].ad_user_data, 'denied');
    assert.equal(event[2].ad_personalization, 'denied');
  }
});

test('explicit acceptance initializes once despite repeat clicks and duplicate script execution', () => {
  const b = browser(); b.accept.click(); b.accept.click(); b.run();
  assert.equal(JSON.parse(b.store.get(key)).choice, 'accepted');
  assert.equal(b.scripts.length, 1);
  assert.equal(b.events().filter(e => e[0] === 'event' && e[1] === 'page_view').length, 1);
});

test('expired, future, malformed and inaccessible saved choices fail closed', () => {
  for (const raw of [saved('accepted', now - 180 * 86400000), saved('accepted', now + 1), '{', saved('unknown'), '{"choice":"accepted"}', saved('declined')]) {
    const b = browser({ raw });
    assert.equal(b.scripts.length, 0, raw);
    assert.equal(b.scope.gtag, undefined, raw);
    assert.equal(b.banner.hidden, raw === saved('declined'));
  }
  const blocked = browser({ raw: saved('accepted'), readBlocked: true });
  assert.equal(blocked.scripts.length, 0);
  assert.equal(blocked.banner.hidden, false);
  const cannotSave = browser({ writeBlocked: true }); cannotSave.accept.click();
  assert.equal(cannotSave.scripts.length, 0);
  assert.equal(cannotSave.scope.gtag, undefined);
  assert.equal(cannotSave.banner.hidden, false);
  const cannotUpdate = browser({ raw: saved('accepted'), writeBlocked: true });
  assert.equal(cannotUpdate.scripts.length, 0);
});

test('review previews remain inert even with saved acceptance', () => {
  const b = browser({ preview: true, raw: saved('accepted') }); b.accept.click();
  assert.equal(b.scripts.length, 0);
  assert.equal(b.scope.gtag, undefined);
  assert.equal(b.banner.hidden, true);
});

test('withdrawal disables tracking, removes only Analytics cookies, and suppresses late callbacks', () => {
  const b = browser({ raw: saved('accepted') });
  const oldTag = b.scope.gtag;
  let callbacks = 0;
  oldTag('event', 'generate_lead', { event_callback() { callbacks++; } });
  const queuedCallback = b.events().find(e => e[1] === 'generate_lead')[2].event_callback;
  b.settings[0].click(); b.decline.click();
  assert.equal(b.scope['ga-disable-G-NEX74824JL'], true);
  assert.equal(b.scope.gtag, undefined);
  assert.equal(b.reloads, 1);
  assert.equal(b.scripts[0].removed, true);
  assert.equal(JSON.parse(b.store.get(key)).choice, 'declined');
  assert.deepEqual(b.events(), []);
  oldTag('event', 'late_event'); queuedCallback();
  assert.deepEqual(b.events(), []);
  assert.equal(callbacks, 0);
  assert.ok(b.cookies.length > 0);
  assert.ok(b.cookies.every(cookie => /^_ga(?:_NEX74824JL)?=;/.test(cookie)));
  assert.ok(b.cookies.every(cookie => /Max-Age=0/.test(cookie)));
  assert.ok(b.cookies.some(cookie => /Domain=www\.hammadmedia\.com/.test(cookie)));
  assert.ok(b.cookies.some(cookie => /Domain=hammadmedia\.com/.test(cookie)));
  assert.ok(b.cookies.some(cookie => /Path=\/zh\//.test(cookie)));
});

test('withdrawal in another tab or expiry also stops an active tracker', () => {
  const crossTab = browser({ raw: saved('accepted') }); crossTab.storage(saved('declined'));
  assert.equal(crossTab.scope['ga-disable-G-NEX74824JL'], true);
  assert.equal(crossTab.reloads, 1);
  const expired = browser({ raw: saved('accepted') }); expired.expire();
  assert.equal(expired.scope.gtag, undefined);
  assert.equal(expired.reloads, 1);
});

test('production-marked Vercel aliases and local hosts cannot pollute the production property',()=>{
  for(const hostname of ['localhost','127.0.0.1','hammadmedia-a92ju1wpx-mohammed-hammads-projects.vercel.app']){
    const b=browser({hostname,raw:saved('accepted')});assert.equal(b.scripts.length,0);assert.equal(b.scope.gtag,undefined);assert.deepEqual(b.events(),[]);
  }
});
