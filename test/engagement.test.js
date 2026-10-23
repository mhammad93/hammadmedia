'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real consent gate and observer together without network requests.
function browser({ accepted = false, qa = false } = {}) {
  const store = new Map(), session = new Map(), scripts = [], unobserved = [];
  if (accepted) store.set('hm-analytics-consent-v1', JSON.stringify({ version: 1, choice: 'accepted', timestamp: Date.now() - 1000 }));
  function element() {
    const handlers = new Map();
    return { hidden: true, addEventListener: (name, fn) => handlers.set(name, fn),
      click: () => handlers.get('click')?.(), focus() {}, remove() {} };
  }
  const controls = Object.fromEntries(['analytics-consent', 'analytics-accept', 'analytics-decline'].map(id => [id, element()]));
  const heading = { closest: () => ({ id: 'packages' }) };
  let intersect;
  const document = {
    documentElement: { lang: 'en' }, body: { dataset: { preview: 'false' } },
    title: 'Hammad Media', referrer: '',
    getElementById: id => controls[id],
    querySelector: selector => selector === '#packages h2' ? heading : null,
    querySelectorAll: () => [], createElement: element,
    head: { appendChild: script => scripts.push(script) },
  };
  const context = {
    document, URL, URLSearchParams, Date,
    location: { origin: 'https://hammadmedia.com', hostname: 'hammadmedia.com', pathname: '/', search: qa ? '?hm_qa=1' : '' },
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) },
    setTimeout: () => 1, clearTimeout() {}, addEventListener() {},
    IntersectionObserver: class {
      constructor(callback) { intersect = callback; }
      observe() {}
      unobserve(target) { unobserved.push(target); }
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['analytics', 'engagement']) vm.runInContext(fs.readFileSync(require.resolve(`../assets/redesign/${file}.js`), 'utf8'), context);
  return {
    enter: () => intersect([{ isIntersecting: true, target: heading }]),
    leave: () => intersect([{ isIntersecting: false, target: heading }]),
    accept: () => controls['analytics-accept'].click(), scripts, unobserved,
    events: () => Array.from(context.dataLayer || [], args => Array.from(args)),
    sections: () => Array.from(context.dataLayer || []).filter(args => args[0] === 'event' && args[1] === 'section_view'),
  };
}

test('an unconsented section remains eligible for a new consented entry without replay', () => {
  const b = browser();
  b.enter(); b.leave();
  assert.deepEqual(b.events(), []);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.unobserved.length, 0);
  b.accept();
  assert.equal(b.sections().length, 0); // Acceptance alone never replays the earlier view.
  b.enter();
  assert.equal(b.sections().length, 1);
  assert.equal(b.sections()[0][2].section_id, 'packages');
  assert.equal(b.unobserved.length, 1);
  b.leave(); b.enter(); b.enter();
  assert.equal(b.sections().length, 1);
});

test('saved consent records a section only once', () => {
  const b = browser({ accepted: true });
  b.enter(); b.leave(); b.enter();
  assert.equal(b.sections().length, 1);
  assert.equal(b.unobserved.length, 1);
});

test('QA exclusion suppresses section events even with saved or newly accepted consent', () => {
  for (const accepted of [false, true]) {
    const b = browser({ accepted, qa: true });
    b.enter(); b.accept(); b.leave(); b.enter();
    assert.deepEqual(b.events(), []);
    assert.equal(b.scripts.length, 0);
    assert.equal(b.unobserved.length, 0);
  }
});
