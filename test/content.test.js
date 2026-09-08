'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const content = require('../content.json');
const performance = require('../performance.json');
const ROOT = path.resolve(__dirname, '..');

function bilingual(value) {
  assert.deepEqual(Object.keys(value).sort(), ['en', 'zh']);
  for (const text of Object.values(value)) assert.ok(typeof text === 'string' && text.trim());
}

test('public content contains only active portfolio metadata and stable performance references', () => {
  assert.deepEqual(Object.keys(content).sort(), ['accounts', 'brands', 'receipts']);
  assert.deepEqual(content.accounts.map(a => a.handle).sort(), ['drew.review', 'drew.review1']);
  for (const account of content.accounts) {
    assert.deepEqual(Object.keys(account).sort(), ['avatar', 'handle', 'url']);
    assert.equal(account.url, `https://www.tiktok.com/@${account.handle}`);
    assert.ok(performance.accounts[account.handle]);
  }
  const keys = content.receipts.items.map(p => p.performanceKey);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys.slice().sort(), Object.keys(performance.products).sort());
  for (const product of content.receipts.items) {
    assert.deepEqual(Object.keys(product).sort(), ['image', 'performanceKey', 'title', 'videoUrl']);
    assert.equal(product.title, performance.products[product.performanceKey].title);
    assert.match(product.videoUrl, /^https:\/\/www\.tiktok\.com\/@drew\.review1?\/video\/\d+$/);
  }
  for (const asset of [...content.brands.map(b => b.logo), ...content.accounts.map(a => a.avatar), ...content.receipts.items.map(p => p.image)]) {
    assert.match(asset, /^assets\/(brands|products)\/[\w.-]+$/);
    assert.ok(fs.existsSync(path.join(ROOT, asset)), asset);
  }
});

test('all displayed metrics retain a bilingual period and a truthful estimate or historic status', () => {
  assert.deepEqual(Object.keys(performance.metrics).sort(), ['allTimeGmv', 'allTimeVideoViews', 'historicalProductViews', 'janAugGmv', 'janAugUnits']);
  for (const metric of Object.values(performance.metrics)) {
    bilingual(metric.value); bilingual(metric.label);
    if (metric.note) bilingual(metric.note);
    if (metric.period) bilingual(metric.period);
    assert.ok(['estimated_rollforward', 'approximate_derived_update', 'historic_not_updated'].includes(metric.status));
    assert.match(metric.end || metric.asOf, /^2026-\d\d-\d\d$/);
  }
  assert.equal(performance.metrics.allTimeGmv.status, 'estimated_rollforward');
  assert.match(performance.metrics.allTimeGmv.note.en, /Estimated/);
  assert.equal(performance.metrics.allTimeVideoViews.asOf, '2026-06-08');
  assert.equal(performance.metrics.historicalProductViews.end, '2026-06-08');
  assert.equal(performance.metrics.janAugUnits.start, '2026-01-01');
  assert.equal(performance.metrics.janAugUnits.end, '2026-08-31');
  assert.match(performance.metrics.janAugUnits.value.en, /^About /);
  assert.match(performance.metrics.janAugGmv.value.en, /^About /);
  assert.equal(performance.methodology.productTotalsAreSubsets, true);
  assert.match(performance.methodology.notes.join(' '), /timezone.*not recorded/);
  assert.match(performance.methodology.notes.join(' '), /impressions are not substituted for views/);
  assert.equal(performance.methodology.allTimeBaselineAssumedAsOf, '2026-06-08');
});

test('product rows keep incomplete extensions at June 8; two matched products advance to August', () => {
  for (const [key, p] of Object.entries(performance.products)) {
    bilingual(p.gmv); bilingual(p.units); bilingual(p.period);
    const updated = ['astaxanthin', 'collagen'].includes(key);
    assert.equal(p.end, updated ? '2026-08-31' : '2026-06-08');
    assert.equal(p.status, updated ? 'approximate_derived_update' : 'historic_not_updated');
    assert.equal(p.gmv.en.startsWith('About '), updated);
    assert.equal(p.units.en.startsWith('About '), updated);
  }
});

test('public metric values match the approved evidence draft when that private audit is available', t => {
  // The Vercel project builds without private evidence. Local audit runs additionally verify provenance.
  const file = path.join(ROOT, '../private/sales-evidence/public-performance-draft.json');
  if (!fs.existsSync(file)) return t.skip('Private evidence is intentionally outside the deployment project.');
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(performance.metrics.allTimeGmv.value.en, source.all_time_gmv.display);
  assert.equal(performance.metrics.allTimeVideoViews.value.en, source.historic_all_time_video_views.display);
  assert.equal(performance.metrics.janAugGmv.value.en, source.hero_gmv.display);
  assert.equal(performance.metrics.janAugUnits.value.en, source.items.display);
  assert.equal(performance.metrics.historicalProductViews.value.en, source.historic_2026_product_views.display);
  for (const a of source.accounts) {
    const actual = performance.accounts[a.handle.slice(1)];
    assert.equal(actual.gmv.en, a.gmv); assert.equal(actual.units.en, a.items);
  }
  for (const p of source.updated_products) {
    const actual = Object.values(performance.products).find(v => v.title === p.title);
    assert.equal(actual.gmv.en, p.gmv); assert.equal(actual.units.en, p.items);
    assert.equal(actual.end, p.as_of);
  }
  for (const p of source.products_to_keep_at_prior_date) {
    const actual = Object.values(performance.products).find(v => v.title === p.title);
    assert.equal(actual.gmv.en, '$' + p.gmv_claim.toLocaleString('en-US'));
    assert.equal(actual.units.en, p.units_claim.toLocaleString('en-US'));
    assert.equal(actual.end, p.as_of);
  }
});

test('public metric source contains no earnings, contact details, private evidence references, or unsupported lifetime metrics', () => {
  const text = JSON.stringify(performance);
  assert.doesNotMatch(text, /(?:private\/|sales-evidence|IMG_\d|\.heic|estimatedCommission|commission_amount|bank_account|access_token|service_role|@[^" ]+\.[a-z]{2,})/i);
  assert.ok(!('allTimeUnits' in performance.metrics));
  assert.ok(!('allTimeProductViews' in performance.metrics));
  assert.ok(!('productImpressions' in performance.metrics));
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      assert.doesNotMatch(key, /commission|earnings|payout|email|phone|followers|approximate_value/i);
      walk(item);
    }
  };
  walk(performance);
});
