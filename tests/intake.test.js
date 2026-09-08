'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { validate, MAX_BYTES } = require('../lib/intake-validation');
const { configuration, RECIPIENT } = require('../lib/intake-config');
const { createServices, ProviderError, notionPage, emailEnvelope } = require('../lib/intake-services');
const { createStore } = require('../lib/intake-store');
const { processRow, EMAIL_RETRY_WINDOW_MS } = require('../lib/intake-worker');
const { createIntakeHandler, createConfigHandler, createRetryHandler } = require('../lib/intake-http');

const NOW = Date.parse('2026-09-08T12:00:00Z');
const config = {
  enabled: true, ready: true, origins: ['https://hammadmedia.com'], hostnames: ['hammadmedia.com'],
  action: 'brand_inquiry', turnstileSiteKey: 'public-site-key', turnstileSecret: 'test-secret',
  hashSecret: 'test-hash-secret-never-a-production-key', cronSecret: 'test-cron-secret-never-a-production-key',
  dataSourceId: '44e3142d-8357-4e5c-8cbb-8c3303a3b062', notionVersion: '2025-09-03',
  notionToken: 'test-notion', recipient: RECIPIENT, sender: 'intake@notifications.hammadmedia.com',
  resendKey: 're_test', vercel: true, supabaseUrl: 'https://test.supabase.co', supabaseKey: 'test-service-key'
};
function requestBody(extra = {}) {
  return { submission_id: randomUUID(), brand: 'Example brand', email: 'person@example.com',
    product: 'Example product', engagement: '5 videos', paid_partnership_ack: true,
    locale: 'en', turnstile_token: 'test-token', website: '', attribution: { page_path: '/' }, ...extra };
}
function row(extra = {}) {
  const payload = validate(requestBody()).payload;
  return { id: payload.submission_id, payload, created_at: new Date(NOW).toISOString(), attempts: 1,
    notion_state: 'pending', notion_reconcile_count: 0, email_state: 'pending', email_started_at: null,
    email_payload: null, ...extra };
}
function workerDeps(initial, overrides = {}) {
  let saved = structuredClone(initial);
  const calls = [];
  const store = {
    async save(id, lease, changes) { calls.push(['save', structuredClone(changes)]); saved = { ...saved, ...structuredClone(changes) }; return structuredClone(saved); },
    async release() { calls.push(['release']); return true; }
  };
  const services = {
    async findNotion() { calls.push(['find']); return []; },
    async createNotion() { calls.push(['create']); return 'b96f8270-f795-4f65-9bfe-95d7198c1e79'; },
    async sendEmail(value) { calls.push(['email', structuredClone(value.email_payload)]); return 'email-test-id'; },
    ...overrides
  };
  return { store, services, config, now: () => NOW, calls, saved: () => saved };
}
async function invoke(handler, { method = 'POST', body, headers = {}, raw } = {}) {
  const req = Readable.from(raw === undefined ? [] : [raw]);
  Object.assign(req, { method, headers: { 'content-type': 'application/json', origin: 'https://hammadmedia.com', 'x-vercel-forwarded-for': '203.0.113.4', ...headers }, socket: { remoteAddress: '127.0.0.1' } });
  if (body !== undefined) req.body = body;
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(text) { this.body = JSON.parse(text); } };
  await handler(req, res);
  return res;
}

test('required fields, paid acknowledgement, exclusivity, URLs and unknown keys are enforced', () => {
  for (const field of ['brand', 'email', 'product', 'engagement']) assert.throws(() => validate(requestBody({ [field]: '' })));
  assert.throws(() => validate(requestBody({ paid_partnership_ack: 'true' })));
  assert.throws(() => validate(requestBody({ engagement: 'Exclusivity' })));
  assert.equal(validate(requestBody({ engagement: 'Exclusivity', exact_category: 'Coffee machines' })).payload.exact_category, 'Coffee machines');
  for (const shop_link of ['http://example.com', 'javascript:alert(1)', 'https://user:password@example.com']) assert.throws(() => validate(requestBody({ shop_link })));
  assert.throws(() => validate(requestBody({ email: 'one@example.com\r\nBcc: other@example.com' })));
  assert.throws(() => validate(requestBody({ brand: 'Example\nBcc: person@example.com' })));
  assert.throws(() => validate(requestBody({ product: 'x'.repeat(1001) })));
  assert.throws(() => validate(requestBody({ product: '\ud800' })));
  assert.throws(() => validate(requestBody({ to: 'attacker@example.com' })));
  assert.throws(() => validate(requestBody({ website: 'spam' })));
});

test('Chinese input is accepted and canonical hash excludes captcha while preserving material differences', () => {
  const body = requestBody({ brand: '示例品牌', product: '护肤产品', locale: 'zh', email: 'PERSON@EXAMPLE.COM', message: '合作咨询\n第二行' });
  const a = validate(body), b = validate({ ...body, turnstile_token: 'replacement-token' });
  assert.equal(a.hash, b.hash);
  assert.equal(a.payload.email, 'person@example.com');
  assert.notEqual(a.hash, validate({ ...body, product: '另一个产品' }).hash);
  assert.equal(validate(requestBody({ attribution: { referrer: 'https://example.com/path?email=private#fragment' } })).payload.attribution.referrer, 'https://example.com/path');
});

test('configuration fails closed and does not need browser access to any service secret', () => {
  assert.equal(configuration({ INTAKE_ENABLED: 'true' }).enabled, false);
  const env = { INTAKE_ENABLED: 'true', INTAKE_PROVISIONED: 'true', INTAKE_ALLOWED_ORIGINS: 'https://hammadmedia.com', INTAKE_SUPABASE_URL: config.supabaseUrl,
    INTAKE_SUPABASE_SECRET_KEY: 'sb_secret_' + 's'.repeat(40), INTAKE_NOTION_TOKEN: 'n'.repeat(30), RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: config.sender,
    TURNSTILE_SITE_KEY: 't'.repeat(20), TURNSTILE_SECRET_KEY: 's'.repeat(30), INTAKE_HASH_SECRET: 'h'.repeat(40), CRON_SECRET: 'c'.repeat(40) };
  assert.equal(configuration(env).enabled, true);
  for (const key of Object.keys(env)) assert.equal(configuration({ ...env, [key]: '' }).enabled, false, key);
  assert.equal(configuration({ ...env, RESEND_FROM_EMAIL: 'attacker@example.com' }).enabled, false);
  assert.equal(configuration({ ...env, INTAKE_ALLOWED_ORIGINS: '*' }).enabled, false);
  assert.equal(configuration({ ...env, INTAKE_SUPABASE_SECRET_KEY: 'sb_publishable_' + 'p'.repeat(40) }).enabled, false);
});

test('Turnstile validates success, hostname, action, submission binding and five-minute age', async () => {
  const id = randomUUID();
  const valid = { success: true, hostname: 'hammadmedia.com', action: 'brand_inquiry', cdata: id, challenge_ts: new Date(NOW - 1000).toISOString() };
  let calls = 0;
  const fetcher = async (url, options) => { calls++; assert.equal(new URL(url).hostname, 'challenges.cloudflare.com'); assert.equal(JSON.parse(options.body).response, 'token'); return Response.json(valid); };
  await createServices(config, fetcher, () => NOW).verify('token', id, '203.0.113.4');
  assert.equal(calls, 1);
  for (const patch of [{ success: false }, { hostname: 'evil.example' }, { action: 'login' }, { cdata: randomUUID() }, { challenge_ts: new Date(NOW - 300001).toISOString() }, { challenge_ts: 'invalid' }]) {
    await assert.rejects(createServices(config, async () => Response.json({ ...valid, ...patch }), () => NOW).verify('token', id, '203.0.113.4'), /verification_failed/);
  }
  await assert.rejects(createServices(config, fetcher).verify('', id, '203.0.113.4'), /verification_required/);
  await assert.rejects(createServices(config, async () => { throw new Error('network'); }).verify('token', id, '203.0.113.4'), /verification_unavailable/);
});

test('intake returns a durable receipt and a replay cannot enqueue or send again', async () => {
  let storedHash; let captcha = 0; let accepts = 0;
  const store = { async receipt(id, hash) { return { status: storedHash ? storedHash === hash ? 'received' : 'conflict' : 'missing' }; },
    async accept(payload, hash, ipHash, emailHash) { assert.match(ipHash, /^[a-f0-9]{64}$/); assert.notEqual(ipHash, emailHash); storedHash = hash; accepts++; return { status: 'received' }; } };
  const handler = createIntakeHandler({ config, store, services: { async verify() { captcha++; } } });
  const body = requestBody();
  const first = await invoke(handler, { body });
  assert.equal(first.statusCode, 202); assert.equal(first.body.status, 'received');
  assert.equal((await invoke(handler, { body: { ...body, turnstile_token: '' } })).statusCode, 202);
  assert.equal(accepts, 1); assert.equal(captcha, 1);
  assert.equal((await invoke(handler, { body: { ...body, brand: 'Different content' } })).statusCode, 409);
  assert.equal(first.headers['Cache-Control'], 'no-store');
});

test('request guardrails reject cross-origin, oversized, malformed, rate-limited and unverified submissions', async () => {
  const store = { async receipt() { return { status: 'missing' }; }, async accept() { return { status: 'limited' }; } };
  const handler = createIntakeHandler({ config, store, services: { async verify() {} } });
  assert.equal((await invoke(handler, { body: requestBody(), headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await invoke(handler, { body: requestBody(), headers: { 'x-vercel-forwarded-for': 'spoofed, 1.2.3.4' } })).statusCode, 503);
  assert.equal((await invoke(handler, { body: requestBody(), headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await invoke(handler, { raw: '{invalid' })).statusCode, 400);
  assert.equal((await invoke(handler, { raw: 'x'.repeat(MAX_BYTES + 1) })).statusCode, 413);
  assert.equal((await invoke(handler, { body: requestBody(), method: 'GET' })).statusCode, 405);
  assert.equal((await invoke(handler, { body: requestBody() })).statusCode, 429);
  const unverified = createIntakeHandler({ config, store: { ...store, async accept() { assert.fail('must not enqueue'); } }, services: { async verify() { throw new (require('../lib/intake-validation').IntakeError)('verification_failed'); } } });
  assert.equal((await invoke(unverified, { body: requestBody() })).statusCode, 400);
  const down = createIntakeHandler({ config, store: { async receipt() { throw new Error('private diagnostic'); } } });
  const failure = await invoke(down, { body: requestBody() });
  assert.equal(failure.statusCode, 503); assert.doesNotMatch(JSON.stringify(failure.body), /private diagnostic/);
});

test('public config never reveals secrets and disabled intake does no storage work', async () => {
  const result = await invoke(createConfigHandler({ config }), { method: 'GET' });
  assert.deepEqual(Object.keys(result.body).sort(), ['action', 'enabled', 'turnstileSiteKey']);
  const disabled = { ...config, enabled: false };
  const response = await invoke(createIntakeHandler({ config: disabled, store: { async receipt() { assert.fail(); } } }), { body: requestBody() });
  assert.equal(response.statusCode, 503);
  assert.equal((await invoke(createConfigHandler({ config: disabled }), { method: 'GET' })).body.turnstileSiteKey, null);
});

test('Notion mapping preserves existing qualification rules; notification recipient is fixed with visitor Reply-To', () => {
  const item = row();
  const page = notionPage(item, config), email = emailEnvelope(item, config);
  assert.equal(page.parent.data_source_id, config.dataSourceId);
  for (const [field, value] of Object.entries({ Stage: 'New', Status: 'new', Disposition: 'Active', 'Sticky Bot': 'Nour', 'Who owes': 'HM', 'Follow-up policy': 'Review first', 'Channel origin': 'other' })) assert.equal(page.properties[field].select.name, value);
  assert.equal(page.properties['Deal ID'].rich_text[0].text.content, `HM-WEB-${item.id}`);
  assert.equal(page.properties.Fee, undefined);
  assert.deepEqual(email.to, ['contact@hammadmedia.com']); assert.equal(email.reply_to, item.payload.email);
  assert.match(email.text, /not an agreed fee or contract/);
  const large = notionPage(row({ payload: validate(requestBody({ message: '中'.repeat(4000) })).payload }), config);
  assert.ok(large.properties.Notes.rich_text.every(part => part.text.content.length <= 2000));
  assert.ok(large.properties.Notes.rich_text.map(part => part.text.content).join('').includes('中'.repeat(4000)));
  const emoji = notionPage(row({ payload: validate(requestBody({ message: '🙂'.repeat(2000) })).payload }), config);
  assert.ok(emoji.properties.Notes.rich_text.every(part => part.text.content.length <= 2000 && part.text.content.isWellFormed()));
});

test('worker checkpoints side effects before calls and marks email accepted only after provider acceptance', async () => {
  const item = row(), deps = workerDeps(item);
  const result = await processRow(item, randomUUID(), deps);
  assert.deepEqual(result, { notion: 'synced', email: 'accepted' });
  const createIndex = deps.calls.findIndex(c => c[0] === 'create');
  assert.equal(deps.calls[createIndex - 1][1].notion_state, 'creating');
  const emailIndex = deps.calls.findIndex(c => c[0] === 'email');
  assert.equal(deps.calls[emailIndex - 1][1].email_state, 'sending');
  assert.equal(deps.calls.at(-1)[0], 'release');
});

test('Notion timeout still notifies team; repeated uncertain lookup with zero results never creates again', async () => {
  const item = row(), deps = workerDeps(item, { async createNotion() { throw new ProviderError('notion'); } });
  await processRow(item, randomUUID(), deps);
  assert.equal(deps.saved().notion_state, 'uncertain'); assert.equal(deps.saved().email_state, 'accepted');
  for (let i = 0; i < 10; i++) {
    const next = workerDeps(deps.saved(), { async createNotion() { assert.fail('ambiguous create must not repeat'); } });
    await processRow(deps.saved(), randomUUID(), next);
    Object.assign(deps.saved(), next.saved());
  }
  assert.equal(deps.saved().notion_state, 'manual');
});

test('crashed creating checkpoint reconciles existing Deal ID and multiple matches require review', async () => {
  for (const matches of [['b96f8270-f795-4f65-9bfe-95d7198c1e79'], [randomUUID(), randomUUID()]]) {
    const item = row({ notion_state: 'creating', email_state: 'accepted', email_id: 'accepted-already' });
    const deps = workerDeps(item, { async findNotion() { return matches; }, async createNotion() { assert.fail(); }, async sendEmail() { assert.fail(); } });
    await processRow(item, randomUUID(), deps);
    assert.equal(deps.saved().notion_state, matches.length === 1 ? 'synced' : 'manual');
  }
});

test('explicit Notion rejection is handled separately from ambiguous server failures', async () => {
  for (const [status, expected] of [[429, 'pending'], [400, 'manual'], [403, 'manual'], [503, 'uncertain']]) {
    const item = row(), deps = workerDeps(item, { async createNotion() { throw new ProviderError('notion', status); } });
    await processRow(item, randomUUID(), deps);
    assert.equal(deps.saved().notion_state, expected); assert.equal(deps.saved().email_state, 'accepted');
  }
});

test('email retries preserve the original envelope across sender/config changes; TTL expiry holds for review', async () => {
  const item = row({ notion_state: 'synced', notion_page_id: randomUUID() });
  const deps = workerDeps(item, { async sendEmail() { throw new ProviderError('resend'); } });
  await processRow(item, randomUUID(), deps);
  const firstPayload = structuredClone(deps.saved().email_payload);
  const retry = workerDeps(deps.saved()); retry.config = { ...config, sender: 'different@hammadmedia.com' };
  await processRow(deps.saved(), randomUUID(), retry);
  assert.deepEqual(retry.calls.find(c => c[0] === 'email')[1], firstPayload);
  const expired = { ...deps.saved(), email_started_at: new Date(NOW - EMAIL_RETRY_WINDOW_MS).toISOString() };
  const held = workerDeps(expired, { async sendEmail() { assert.fail('must not resend beyond retention'); } });
  await processRow(expired, randomUUID(), held);
  assert.equal(held.saved().email_state, 'manual'); assert.equal(held.saved().email_error, 'idempotency_window_elapsed');
});

test('Resend idempotency conflict is manual; concurrent request is retryable', async () => {
  for (const [code, expected] of [['invalid_idempotent_request', 'manual'], ['concurrent_idempotent_requests', 'retry']]) {
    const item = row({ notion_state: 'synced', notion_page_id: randomUUID() });
    const deps = workerDeps(item, { async sendEmail() { throw new ProviderError('resend', 409, code); } });
    await processRow(item, randomUUID(), deps); assert.equal(deps.saved().email_state, expected);
  }
});

test('storage failure before create prevents side effect; after create preserves uncertain checkpoint for reconciliation', async () => {
  for (const failState of ['creating', 'synced']) {
    const item = row(), deps = workerDeps(item);
    const save = deps.store.save;
    deps.store.save = async (id, lease, changes) => { if (changes.notion_state === failState) throw new Error('db offline'); return save(id, lease, changes); };
    await assert.rejects(processRow(item, randomUUID(), deps), /db offline/);
    assert.equal(deps.calls.filter(c => c[0] === 'create').length, failState === 'creating' ? 0 : 1);
    assert.equal(deps.saved().notion_state, failState === 'creating' ? 'pending' : 'creating');
  }
});

test('lost storage acknowledgement after email acceptance keeps frozen request for safe idempotent retry', async () => {
  const item = row({ notion_state: 'synced', notion_page_id: randomUUID() });
  const deps = workerDeps(item);
  const save = deps.store.save;
  deps.store.save = async (id, lease, changes) => {
    if (changes.email_state === 'accepted') throw new Error('storage response lost');
    return save(id, lease, changes);
  };
  await assert.rejects(processRow(item, randomUUID(), deps), /storage response lost/);
  assert.equal(deps.saved().email_state, 'sending');
  const sent = deps.calls.find(call => call[0] === 'email')[1];
  const retry = workerDeps(deps.saved());
  await processRow(deps.saved(), randomUUID(), retry);
  assert.deepEqual(retry.calls.find(call => call[0] === 'email')[1], sent);
  assert.equal(retry.saved().email_state, 'accepted');
});

test('provider adapters use server authorization, canonical endpoints, exact stored email and stable key', async () => {
  const item = row(); item.email_payload = emailEnvelope(item, config);
  const requests = [];
  const services = createServices(config, async (url, options) => { requests.push({ url, ...options }); return Response.json(url.endsWith('/query') ? { results: [] } : { id: randomUUID() }); });
  await services.findNotion(item.id); await services.createNotion(item); await services.sendEmail(item);
  assert.equal(requests[0].headers['Notion-Version'], '2025-09-03');
  assert.equal(requests[0].url, `https://api.notion.com/v1/data_sources/${config.dataSourceId}/query`);
  assert.equal(requests[2].headers['Idempotency-Key'], `hm-web-${item.id}`);
  assert.deepEqual(JSON.parse(requests[2].body), item.email_payload);
  const store = createStore(config, async (url, options) => { assert.equal(options.headers.apikey, config.supabaseKey); assert.match(url, /\/rpc\/hm_intake_receipt$/); return Response.json({ status: 'missing' }); });
  assert.deepEqual(await store.receipt(item.id, 'a'.repeat(64)), { status: 'missing' });
});

test('cron requires exact bearer secret and keeps draining when only new intake is disabled', async () => {
  let claims = 0;
  const store = { async claim() { claims++; return null; }, async prune() {}, async health() { return { pending: 0, manual: 0, overdue: 0 }; } };
  const handler = createRetryHandler({ config: { ...config, enabled: false }, store });
  assert.equal((await invoke(handler, { method: 'GET' })).statusCode, 401);
  assert.equal((await invoke(handler, { method: 'GET', headers: { authorization: 'Bearer wrong' } })).statusCode, 401);
  assert.equal(claims, 0);
  const result = await invoke(handler, { method: 'GET', headers: { authorization: `Bearer ${config.cronSecret}` } });
  assert.equal(result.statusCode, 200); assert.equal(claims, 1);
});
