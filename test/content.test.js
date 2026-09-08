'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const content = require('../content.json');
const performance = require('../performance.json');
const ROOT = path.resolve(__dirname, '..');
const numericDisplay = value => value.replace(/^(?:About|约)\s+/, '');
const numericPair = value => Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, numericDisplay(text)]));

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
    assert.deepEqual(Object.keys(product).sort(), ['image', ...(product.imageDark ? ['imageDark'] : []), 'performanceKey', 'title', 'videoUrl'].sort());
    assert.equal(product.title, performance.products[product.performanceKey].title);
    if (product.videoUrl !== null) assert.match(product.videoUrl, /^https:\/\/www\.tiktok\.com\/@drew\.review1?\/video\/\d+$/);
  }
  for (const asset of [...content.brands.map(b => b.logo), ...content.accounts.map(a => a.avatar), ...content.receipts.items.flatMap(p => [p.image, p.imageDark].filter(Boolean))]) {
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
  assert.equal(performance.metrics.allTimeVideoViews.asOf, '2026-08-31');
  assert.equal(performance.metrics.allTimeVideoViews.status, 'estimated_rollforward');
  assert.equal(performance.metrics.allTimeVideoViews.value.en, '455M');
  assert.match(performance.metrics.allTimeVideoViews.note.en, /Estimated/);
  assert.match(performance.metrics.allTimeVideoViews.label.en, /video views/i);
  assert.equal(performance.metrics.historicalProductViews.end, '2026-08-31');
  assert.equal(performance.metrics.historicalProductViews.status, 'approximate_derived_update');
  assert.equal(performance.metrics.historicalProductViews.value.en, '147M');
  assert.match(performance.metrics.historicalProductViews.note.en, /Estimated/);
  assert.equal(performance.metrics.janAugUnits.start, '2026-01-01');
  assert.equal(performance.metrics.janAugUnits.end, '2026-08-31');
  assert.equal(performance.metrics.janAugUnits.value.en, '159K');
  assert.match(performance.metrics.janAugUnits.note.en, /Estimated/);
  assert.match(performance.metrics.janAugGmv.value.en, /^\$\d+(?:\.\d+)?[KM]\+$/);
  assert.equal(performance.methodology.productTotalsAreSubsets, true);
  assert.match(performance.methodology.notes.join(' '), /timezone.*not recorded/);
  assert.equal(performance.methodology.allTimeBaselineAssumedAsOf, '2026-06-08');
});

test('product dates distinguish historical baselines, matched extensions and complete later-month windows', () => {
  const periods = {
    astaxanthin: ['2026-01-01', '2026-08-31', 'approximate_derived_update'],
    nmn: ['2026-01-01', '2026-08-31', 'documented_partial_subtotal_not_complete_period'],
    collagen: ['2026-01-01', '2026-08-31', 'approximate_derived_update'],
    magnesium: ['2026-01-01', '2026-08-31', 'documented_partial_subtotal_not_complete_period'],
    glutathione: ['2026-04-01', '2026-08-31', 'approximate_sum_of_complete_account_month_displays'],
    testosterone: ['2026-05-01', '2026-08-31', 'approximate_sum_of_complete_account_month_displays']
  };
  assert.deepEqual(Object.keys(performance.products).sort(), Object.keys(periods).sort());
  for (const [key, p] of Object.entries(performance.products)) {
    bilingual(p.gmv); bilingual(p.units); bilingual(p.period);
    assert.deepEqual([p.start, p.end, p.status], periods[key]);
    assert.match(p.gmv.en, /^\$\d+(?:\.\d+)?[KM]\+$/);
    assert.match(p.units.en, /^\d[\d,.]*[KM]?$/);
    assert.equal(p.gmv.zh, p.gmv.en);
    assert.equal(p.units.zh, p.units.en);
  }
});

test('non-monetary values and scopes preserve the approved evidence draft after dollar-display flooring', t => {
  // The Vercel project builds without private evidence. Local audit runs additionally verify provenance.
  const file = path.join(ROOT, '../private/sales-evidence/public-performance-draft.json');
  if (!fs.existsSync(file)) return t.skip('Private evidence is intentionally outside the deployment project.');
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(source.jan_aug_product_views, 'Owner-approved product-view update must have a separate dated audit; preserve its historic baseline.');
  assert.ok(source.all_time_video_views, 'The active lifetime estimate must use audited video exports, separately from the superseded mixed series.');
  assert.equal(performance.metrics.allTimeVideoViews.value.en, numericDisplay(source.all_time_video_views.display));
  assert.equal(performance.metrics.janAugUnits.value.en, numericDisplay(source.items.display));
  assert.equal(performance.metrics.historicalProductViews.value.en, numericDisplay(source.jan_aug_product_views.display));
  assert.equal(performance.metrics.historicalProductViews.end, source.jan_aug_product_views.end);
  for (const a of source.accounts) {
    const actual = performance.accounts[a.handle.slice(1)];
    assert.equal(actual.units.en, numericDisplay(a.items));
  }
  for (const p of source.updated_products) {
    const actual = Object.values(performance.products).find(v => v.title === p.title);
    assert.equal(actual.units.en, numericDisplay(p.items));
    assert.equal(actual.end, p.as_of);
  }
  for (const p of source.products_to_keep_at_prior_date) {
    const actual = Object.values(performance.products).find(v => v.title === p.title);
    // The active portfolio intentionally replaces two historical examples.
    if (!actual || actual.status === 'documented_partial_subtotal_not_complete_period') continue;
    assert.equal(actual.units.en, p.units_claim.toLocaleString('en-US'));
    assert.equal(actual.end, p.as_of);
  }
});

test('all public GMV displays use bilingual rounded figures with their dated estimate assumptions intact', () => {
  const values = [performance.metrics.allTimeGmv.value, performance.metrics.janAugGmv.value,
    ...Object.values(performance.accounts).map(a => a.gmv), ...Object.values(performance.products).map(p => p.gmv)];
  assert.equal(values.length, 10);
  for (const value of values) {
    assert.match(value.en, /^\$\d+(?:\.\d+)?[KM]\+$/);
    assert.equal(value.zh, value.en);
  }
  assert.match(performance.methodology.notes.join(' '), /not exact totals or certified raw-platform minimums/);
  assert.match(performance.methodology.notes.join(' '), /Astaxanthin.*uncertainty can cross the displayed threshold/);
  assert.match(performance.metrics.allTimeGmv.note.en, /Estimated/);
});

test('chosen dollar displays reconcile to independent arithmetic without certifying a rounded estimate as a minimum', t => {
  const file = path.join(ROOT, '../private/sales-evidence/monetary-display-floors-2026-09-08.json');
  if (!fs.existsSync(file)) return t.skip('Private monetary evidence is intentionally outside the deployment project.');
  const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  const selected = {allTimeGmv:'$9.1M+',janAugGmv:'$3.9M+','drew.review':'$1.4M+','drew.review1':'$2.5M+',astaxanthin:'$400K+',nmn:'$240K+',collagen:'$250K+',magnesium:'$170K+',glutathione:'$140K+',testosterone:'$100K+'};
  assert.equal(audit.fields.length, 10);
  assert.equal(new Set(audit.fields.map(row => row.jsonPointer)).size, 10);
  for (const source of audit.sourceFiles) {
    const local = path.join(path.dirname(file), path.basename(source.path));
    assert.equal(createHash('sha256').update(fs.readFileSync(local)).digest('hex'), source.sha256, source.path);
  }
  for (const row of audit.fields) {
    const actualDisplay = row.path.reduce((value, key) => value[key], performance);
    assert.deepEqual(actualDisplay, {en:selected[row.key],zh:selected[row.key]}, row.key);
    const match = /^\$(\d+(?:\.\d+)?)([KM])\+$/.exec(row.display.en);
    assert.equal(Number(match[1]) * (match[2] === 'M' ? 1e6 : 1e3), row.threshold, row.key);
    assert.equal(row.inputs.reduce((sum, input) => sum + input.expandedValue, 0), row.pointEstimate, row.key);
    assert.equal(row.inputs.reduce((sum, input) => sum + input.reserve, 0), row.roundingReserve, row.key);
    assert.equal(row.pointEstimate - row.roundingReserve, row.conservativeEstimatedLowerBound, row.key);
    assert.ok(row.threshold < row.conservativeEstimatedLowerBound, row.key);
    assert.equal(row.boundKind, 'conditional_estimated_presentation_not_raw_platform_certification');
    if (!['nmn','magnesium'].includes(row.key)) {
      const owner = row.path.slice(0, -1).reduce((value, key) => value[key], performance);
      assert.equal(owner.end || owner.asOf, row.end, row.key);
      if (row.start) assert.equal(owner.start, row.start, row.key);
      const selectedMatch = /^\$(\d+(?:\.\d+)?)([KM])\+$/.exec(actualDisplay.en);
      const displayedThreshold = Number(selectedMatch[1]) * (selectedMatch[2] === 'M' ? 1e6 : 1e3);
      assert.ok(displayedThreshold <= row.pointEstimate, row.key);
      if (row.key === 'astaxanthin') {
        assert.equal(displayedThreshold, 400000);
        assert.ok(displayedThreshold > row.conservativeEstimatedLowerBound, 'The chosen rounded estimate must not be misrepresented as a certified conservative floor.');
      } else assert.ok(displayedThreshold < row.conservativeEstimatedLowerBound, row.key);
    }
    const cells = row.inputs.map(input => [input.source, input.account || '', input.start || '', input.end || ''].join('|'));
    assert.equal(new Set(cells).size, cells.length, `${row.key}: duplicate source cells`);
    for (const input of row.inputs) {
      const display = /^\$([\d,]+)(?:\.(\d+))?([KM])?\+?$/.exec(input.display);
      assert.ok(display, input.display);
      const unit = display[3] === 'M' ? 1e6 : display[3] === 'K' ? 1e3 : 1;
      assert.equal(Number(display[1].replaceAll(',', '') + (display[2] ? '.' + display[2] : '')) * unit, input.expandedValue);
      if (input.reserve === 0) {
        assert.equal(row.key, 'allTimeGmv');
        assert.equal(input.display, '$8M+');
        assert.match(row.specialCaveat, /not.*audited lifetime minimum/);
      } else assert.equal(input.reserve, unit / 10 ** (display[2]?.length || 0), `${row.key}: full last displayed unit reserved`);
    }
  }
});

test('partial NMN and Magnesium cards sum only documented nonoverlapping rows and preserve unknown coverage', t => {
  const file = path.join(ROOT, '../private/sales-evidence/partial-product-subtotals-2026-09-08.json');
  if (!fs.existsSync(file)) return t.skip('Private partial-product evidence is intentionally outside the deployment project.');
  const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(audit.fields.map(row => row.key).sort(), ['magnesium','nmn']);
  const periods = [['2026-06-09','2026-06-30'],['2026-07-01','2026-07-31'],['2026-08-01','2026-08-31']];
  for (const row of audit.fields) {
    const actual = performance.products[row.key];
    assert.equal(row.inputs.length, row.verifiedExtensionCells);
    assert.equal(row.inputs.length + row.missingCoverage.length, 6);
    const known = row.inputs.map(input => `${input.account}|${input.start}`);
    const missing = row.missingCoverage.map(input => `${input.account}|${input.start}`);
    const expected = ['@drew.review','@drew.review1'].flatMap(account => periods.map(([start]) => `${account}|${start}`));
    assert.deepEqual([...known, ...missing].sort(), expected.sort(), 'No duplicated cell, zero-filled unknown, or overlapping full June.');
    row.inputs.forEach(input => assert.ok(periods.some(([start,end]) => input.start === start && input.end === end)));
    assert.equal(row.inputs.reduce((sum, input) => sum + input.attr_gmv_approximate_display_expansion, row.baselineGMV), row.pointEstimateDocumentedSubtotal);
    assert.equal(row.inputs.reduce((sum, input) => sum + input.attr_items_display_expansion, row.baselineUnits), row.documentedUnitsSubtotal);
    assert.equal(row.roundingReserve, 1 + row.inputs.length * 100);
    assert.equal(row.pointEstimateDocumentedSubtotal - row.roundingReserve, row.conservativeEstimatedDocumentedSubtotal);
    const expectedDisplay = row.key === 'nmn' ? '$240K+' : '$170K+';
    assert.deepEqual(actual.gmv, {en:expectedDisplay,zh:expectedDisplay});
    assert.ok(Number(expectedDisplay.slice(1,-2))*1000 < row.conservativeEstimatedDocumentedSubtotal);
    assert.deepEqual(actual.units, {en:row.documentedUnitsSubtotal.toLocaleString('en-US'),zh:row.documentedUnitsSubtotal.toLocaleString('en-US')});
    for (const field of ['start','end','status','period','gmvLabel','unitsLabel']) assert.deepEqual(actual[field], row[field]);
    assert.match(actual.period.en, /partial coverage/);
    assert.match(actual.status, /not_complete_period/);
  }
});

test('product-view extension reconciles only the six nonoverlapping source periods', t => {
  const file = path.join(ROOT, '../private/sales-evidence/product-views-owner-mapping-2026-09-08.json');
  if (!fs.existsSync(file)) return t.skip('Private evidence is intentionally outside the deployment project.');
  const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  const master = JSON.parse(fs.readFileSync(path.join(ROOT, '../private/sales-evidence/monthly-overview-master.json'), 'utf8'));
  const expectedPeriods = [['2026-06-09', '2026-06-30'], ['2026-07-01', '2026-07-31'], ['2026-08-01', '2026-08-31']];
  const expectedKeys = ['@drew.review', '@drew.review1'].flatMap(account => expectedPeriods.map(([start, end]) => `${account}|${start}|${end}`)).sort();
  const actualKeys = audit.extension_cells.map(row => `${row.account}|${row.start}|${row.end}`).sort();
  assert.deepEqual(actualKeys, expectedKeys, 'No full June, duplicate period, missing account or account/product double count.');
  for (const cell of audit.extension_cells) {
    const matches = [...master.bridge_overviews, ...master.monthly_overviews].filter(row => row.account === cell.account && row.start === cell.start && row.end === cell.end);
    assert.equal(matches.length, 1);
    const metric = matches[0].metrics.find(m => m.label === 'Product impressions');
    assert.equal(cell.source_label, metric.label);
    assert.equal(cell.source_display, metric.display);
    assert.equal(cell.display_expansion, metric.approximate_display_expansion);
    assert.equal(cell.source_png_sha256, matches[0].source_png_sha256);
  }
  const increment = audit.extension_cells.reduce((sum, row) => sum + row.display_expansion, 0);
  assert.equal(increment, 42000000);
  assert.equal(audit.calculation.combined_display_basis_expansion, 105000000);
  assert.equal(audit.calculation.account_baseline_display_sum, 105800000);
  assert.equal(audit.calculation.conservative_combined_display_expansion, 105000000 + increment);
  assert.equal(audit.calculation.account_display_basis_total, 105800000 + increment);
  assert.equal(audit.mapping.official_metric_equivalence_verified, false);
  assert.equal(audit.mapping.authorization_quote, 'Yes just use product impressions as views');
  assert.deepEqual(performance.metrics.historicalProductViews, {...audit.public_metric,
    value:numericPair(audit.public_metric.value),note:{en:'Estimated · Jan 1–Aug 31 · both profiles',zh:'估算 · 1月1日至8月31日 · 双账号合计'}});
});

test('all-time video views add only post-June8 video rows and preserve the rounded baseline', t => {
  const file = path.join(ROOT, '../private/sales-evidence/video-views-export-rollforward-2026-09-08.json');
  if (!fs.existsSync(file)) return t.skip('Private evidence is intentionally outside the deployment project.');
  const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
  const draft = JSON.parse(fs.readFileSync(path.join(ROOT, '../private/sales-evidence/public-performance-draft.json'), 'utf8'));
  assert.equal(draft.historic_all_time_video_views.display, '416M+');
  assert.equal(draft.historic_all_time_video_views.as_of, '2026-06-08');
  assert.equal(audit.baseline.source_label, 'All-time video views');
  assert.equal(audit.baseline.display, draft.historic_all_time_video_views.display);
  assert.equal(audit.baseline.scope_status, 'confirmed_legacy_website_both_accounts');
  let increment = 0;
  for (const handle of ['drew.review', 'drew.review1']) {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, `../private/sales-evidence/tiktok-studio-exports-2026-09-08/${handle}-overview-2026-01-01-to-2026-08-31.audit.json`), 'utf8'));
    const rows = source.daily.filter(row => row.date >= '2026-06-09' && row.date <= '2026-08-31');
    assert.equal(rows.length, 84);
    const count = rows.reduce((sum, row) => sum + row['Video Views'], 0);
    assert.equal(audit.calculation.account_increments[handle], count);
    increment += count;
  }
  assert.equal(increment, 38953750, 'Use the video export column, never the 42M product-impressions extension.');
  assert.equal(audit.calculation.video_increment, increment);
  assert.equal(audit.calculation.baseline_display_plus_increment, 416000000 + increment);
  assert.equal(audit.supersedes, 'all-time-views-owner-mapping-2026-09-08.json');
  assert.deepEqual(performance.metrics.allTimeVideoViews, {...audit.public_metric,value:numericPair(audit.public_metric.value)});
  assert.match(performance.metrics.allTimeVideoViews.label.en, /video views/i);
  assert.match(performance.metrics.allTimeVideoViews.note.en, /Estimated through Aug 31, 2026/);
});

test('dated engagement totals remain separate from current rounded public profile snapshots', () => {
  const keys = ['videoViews', 'profileViews', 'likes', 'comments', 'shares'];
  for (const handle of ['drew.review', 'drew.review1']) {
    const account = performance.accounts[handle], engagement = account.engagement;
    assert.ok(engagement, `${handle} needs its selected-period export totals`);
    assert.equal(engagement.start, '2026-01-01');
    assert.equal(engagement.end, '2026-08-31');
    assert.equal(engagement.status, 'verified_export_totals');
    assert.equal(engagement.timezone, null, 'CSV does not state the source bucketing timezone.');
    bilingual(engagement.period);
    for (const key of keys) {
      const metric = engagement[key];
      assert.ok(Number.isSafeInteger(metric.count));
      bilingual(metric.value); bilingual(metric.label);
      for (const value of Object.values(metric.value)) assert.equal(value.replaceAll(',', ''), String(metric.count));
    }
    assert.equal(account.social.asOf, '2026-09-07');
    assert.equal(account.social.status, 'verified_public_profile');
    assert.notEqual(engagement.likes.value.en, account.social.likes.en);
  }
  for (const key of keys) {
    const metric = performance.engagement[key];
    assert.equal(metric.count, performance.accounts['drew.review'].engagement[key].count + performance.accounts['drew.review1'].engagement[key].count);
    bilingual(metric.value); bilingual(metric.label);
    for (const value of Object.values(metric.value)) assert.equal(value.replaceAll(',', ''), String(metric.count));
  }
  assert.equal(performance.engagement.start, '2026-01-01');
  assert.equal(performance.engagement.end, '2026-08-31');
});

test('all five engagement metrics reconcile to every signed daily export value for each account', t => {
  const dir = path.join(ROOT, '../private/sales-evidence/tiktok-studio-exports-2026-09-08');
  if (!fs.existsSync(dir)) return t.skip('Private evidence is intentionally outside the deployment project.');
  const fields = { videoViews: 'Video Views', profileViews: 'Profile Views', likes: 'Likes', comments: 'Comments', shares: 'Shares' };
  for (const handle of ['drew.review', 'drew.review1']) {
    const source = JSON.parse(fs.readFileSync(path.join(dir, `${handle}-overview-2026-01-01-to-2026-08-31.audit.json`), 'utf8'));
    assert.equal(source.daily.length, 243);
    assert.equal(new Set(source.daily.map(row => row.date)).size, 243);
    assert.equal(source.daily[0].date, '2026-01-01');
    assert.equal(source.daily.at(-1).date, '2026-08-31');
    source.daily.forEach((row, index) => assert.equal(row.date, new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10), 'Every calendar day appears exactly once in order.'));
    for (const [key, label] of Object.entries(fields)) {
      const total = source.daily.reduce((sum, row) => sum + row[label], 0);
      assert.equal(total, source.exactExportTotals[label]);
      assert.equal(performance.accounts[handle].engagement[key].count, total, `${handle}.${key}`);
    }
    assert.ok(source.daily.some(row => row.Comments < 0), 'Signed source adjustments must not be clipped.');
  }
});

test('new period-scoped product values match the reviewed private draft when available', t => {
  const file = path.join(ROOT, '../private/sales-evidence/product-card-public-values.json');
  if (!fs.existsSync(file)) return t.skip('Private evidence is intentionally outside the deployment project.');
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of ['glutathione', 'testosterone']) {
    const actual = performance.products[key], approved = source.products[key];
    assert.deepEqual(actual.units, numericPair(approved.units));
    for (const field of ['period', 'start', 'end', 'status']) assert.deepEqual(actual[field], approved[field], `${key}.${field}`);
    assert.equal(content.receipts.items.find(p => p.performanceKey === key).videoUrl, null);
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
      assert.doesNotMatch(key, /commission|earnings|payout|email|phone|approximate_value/i);
      walk(item);
    }
  };
  walk(performance);
});
