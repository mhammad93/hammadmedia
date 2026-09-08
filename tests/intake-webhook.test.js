'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { Readable, PassThrough } = require('node:stream');
const { existsSync } = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '../lib/intake-webhook.js');
const api = existsSync(source) ? require(source) : {};
const NOW = Date.parse('2026-09-08T12:00:00Z');
const secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
const config = { enabled: true, secret, sender: 'intake@notifications.hammadmedia.com', recipient: 'contact@hammadmedia.com', supabaseUrl: 'https://mftfdyuxyoibmioyonft.supabase.co', supabaseKey: 'sb_secret_' + 'x'.repeat(30) };
const payload = (type = 'email.delivered', overrides = {}) => ({ type, created_at: '2026-09-08T11:59:00Z', data: { email_id: '56761188-7520-42d8-8898-ff6fc54ce618', created_at: '2026-09-08T11:58:00Z', from: 'Hammad Media Website <intake@notifications.hammadmedia.com>', to: ['contact@hammadmedia.com'], subject: 'Private synthetic brand', bounce: { message: 'Private synthetic diagnostic' }, ...overrides } });
function signed(raw, { id = 'msg_synthetic_123', timestamp = String(NOW / 1000), key = secret } = {}) {
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,' + createHmac('sha256', Buffer.from(key.slice(6), 'base64')).update(`${id}.${timestamp}.`).update(raw).digest('base64') };
}
async function invoke({ raw = Buffer.from(JSON.stringify(payload())), headers = {}, method = 'POST', settings = config, store, request } = {}) {
  assert.equal(typeof api.createWebhookHandler, 'function', 'signed webhook handler exists');
  const req = request || Readable.from([raw]);
  req.method = method;
  req.headers = { host: 'hammadmedia.com', 'content-type': 'application/json', ...signed(raw), ...headers };
  // Vercel exposes a lazy parsed-body helper. Reading it would destroy the signature contract.
  Object.defineProperty(req, 'body', { get() { throw new Error('must not read parsed body'); } });
  let body = ''; const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { body = value; } };
  const writes = [];
  await api.createWebhookHandler({ config: settings, now: () => NOW, store: store || { record: async event => { writes.push(event); return { status: 'recorded' }; } } })(req, response);
  return { status: response.statusCode, body: JSON.parse(body), headers: response.headers, writes };
}
test('Svix published known vector verifies independently of the fixture signer', () => {
  assert.equal(typeof api.verifySignature, 'function');
  const headers = { 'svix-id': 'msg_loFOjxBNrRLzqYUf', 'svix-timestamp': '1731705121', 'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=' };
  assert.equal(api.verifySignature(Buffer.from('{"event_type":"ping","data":{"success":true}}'), headers, 'whsec_plJ3nmyCDGBKInavdOK15jsl', 1731705121000), true);
});
test('raw signed Unicode/whitespace is accepted and only minimal fields reach storage', async () => {
  const raw = Buffer.from(JSON.stringify(payload('email.delivered', { subject: '私密 synthetic' }), null, 2));
  const result = await invoke({ raw });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { received: true });
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Object.keys(result.writes[0]).sort(), ['emailId', 'eventId', 'occurredAt', 'payloadHash', 'type']);
  assert.equal(result.writes[0].occurredAt, '2026-09-08T11:59:00.000Z', 'event time, not original email creation');
  assert.equal(result.writes[0].emailId, '56761188-7520-42d8-8898-ff6fc54ce618');
  assert.doesNotMatch(JSON.stringify(result), /Private synthetic|私密|diagnostic|@/);
});
test('tampering, wrong key, stale/future timestamps and duplicate signature headers never write', async () => {
  const raw = Buffer.from(JSON.stringify(payload()));
  const old = signed(raw, { timestamp: String(NOW / 1000 - 301) });
  const future = signed(raw, { timestamp: String(NOW / 1000 + 301) });
  for (const headers of [{ 'svix-signature': '' }, signed(Buffer.concat([raw, Buffer.from(' ')])), signed(raw, { key: 'whsec_' + Buffer.alloc(32, 9).toString('base64') }), old, future, { 'svix-id': ['msg_a', 'msg_b'] }, { 'svix-timestamp': '1e9' }, { 'svix-signature': ['v1,abc', 'v1,def'] }]) {
    const result = await invoke({ raw, headers });
    assert.equal(result.status, 401);
    assert.equal(result.writes.length, 0);
    assert.deepEqual(result.body, { error: 'invalid_signature' });
  }
});
test('signature rotation header accepts one valid v1 without accepting malformed lengths', async () => {
  const raw = Buffer.from(JSON.stringify(payload()));
  assert.equal((await invoke({ raw, headers: { 'svix-signature': 'v2,ignored v1,abcd ' + signed(raw)['svix-signature'] } })).status, 200);
  assert.equal((await invoke({ raw, headers: { 'svix-signature': 'v1,abcd v2,ignored' } })).status, 401);
});
test('disabled and non-production configuration do not touch storage', async () => {
  assert.equal(typeof api.webhookConfiguration, 'function');
  const env = { VERCEL: '1', VERCEL_ENV: 'production', RESEND_WEBHOOK_ENABLED: 'true', RESEND_WEBHOOK_SECRET: secret, RESEND_FROM_EMAIL: config.sender, INTAKE_SUPABASE_URL: config.supabaseUrl, INTAKE_SUPABASE_SECRET_KEY: config.supabaseKey };
  assert.equal(api.webhookConfiguration(env).enabled, true);
  for (const changes of [{ RESEND_WEBHOOK_ENABLED: undefined }, { VERCEL_ENV: 'preview' }, { VERCEL: undefined }, { RESEND_WEBHOOK_SECRET: 'bad' }, { INTAKE_SUPABASE_URL: 'https://other.supabase.co' }, { INTAKE_SUPABASE_SECRET_KEY: 'sb_publishable_bad' }]) {
    const settings = api.webhookConfiguration({ ...env, ...changes });
    const result = await invoke({ settings });
    assert.equal(result.status, 503); assert.equal(result.writes.length, 0);
  }
  assert.equal((await invoke({ headers: { host: 'preview.vercel.app' } })).status, 503);
});
test('method, content encoding, size and malformed signed JSON fail closed', async () => {
  for (const [options, status] of [[{ method: 'GET' }, 405], [{ headers: { 'content-type': 'text/plain' } }, 415], [{ headers: { 'content-encoding': 'gzip' } }, 415], [{ raw: Buffer.alloc(65537) }, 413], [{ headers: { 'content-length': '70000' } }, 413], [{ raw: Buffer.from('{') }, 400]]) {
    const result = await invoke(options); assert.equal(result.status, status); assert.equal(result.writes.length, 0);
  }
});
test('irrelevant events and different recipient/sender cannot enter intake delivery counts', async () => {
  for (const event of [payload('email.opened'), payload('email.clicked'), payload('email.delivered', { to: ['someone@example.test'] }), payload('email.delivered', { to: ['contact@hammadmedia.com', 'another@example.test'] }), payload('email.delivered', { from: 'other@hammadmedia.com' })]) {
    const result = await invoke({ raw: Buffer.from(JSON.stringify(event)) });
    assert.equal(result.status, 200); assert.equal(result.writes.length, 0);
  }
  for (const event of [payload('email.delivered', { email_id: 'not-an-id' }), { ...payload(), created_at: 'invalid' }, { ...payload(), created_at: '2027-01-01T00:00:00Z' }]) {
    const result = await invoke({ raw: Buffer.from(JSON.stringify(event)) }); assert.equal(result.status, 400); assert.equal(result.writes.length, 0);
  }
});
test('200 requires durable record or identical duplicate; outages/unknown results ask provider to retry', async () => {
  for (const status of ['recorded', 'duplicate']) assert.equal((await invoke({ store: { record: async () => ({ status }) } })).status, 200);
  assert.equal((await invoke({ store: { record: async () => ({ status: 'conflict' }) } })).status, 409);
  for (const result of [{ status: 'disabled' }, { status: 'unknown' }, null]) assert.equal((await invoke({ store: { record: async () => result } })).status, 503);
  const failure = await invoke({ store: { record: async () => { throw new Error('private provider/body error'); } } });
  assert.equal(failure.status, 503); assert.doesNotMatch(JSON.stringify(failure), /private provider/);
});
test('Vercel restored stream is read as raw bytes without relying on readableEnded or parsed body', async () => {
  const raw = Buffer.from(JSON.stringify(payload(), null, 1));
  const req = new Readable({ read() {} }); req.push(null); req.resume();
  await new Promise(resolve => req.on('end', resolve));
  const restored = new PassThrough(); const originalOn = req.on.bind(req);
  req.read = restored.read.bind(restored);
  req.on = req.addListener = (name, callback) => ['data', 'end'].includes(name) ? restored.on(name, callback) : originalOn(name, callback);
  restored.end(raw);
  const result = await invoke({ raw, request: req });
  assert.equal(result.status, 200); assert.equal(result.writes.length, 1);
});
test('storage request stays at private aggregate RPC boundary with no redirects or provider sends', async () => {
  assert.equal(typeof api.createWebhookStore, 'function');
  let called;
  const store = api.createWebhookStore(config, async (url, options) => { called = { url, options }; return { ok: true, json: async () => ({ status: 'recorded' }) }; });
  const result = await invoke({ store });
  assert.equal(result.status, 200);
  assert.equal(called.url, config.supabaseUrl + '/rest/v1/rpc/hm_intake_resend_record');
  assert.equal(called.options.redirect, 'error');
  assert.equal(called.options.headers.Authorization, undefined, 'modern secret is not a Bearer JWT');
  const args = JSON.parse(called.options.body);
  assert.deepEqual(Object.keys(args).sort(), ['p_email_id', 'p_event_id', 'p_hash', 'p_occurred_at', 'p_type']);
  assert.doesNotMatch(called.options.body, /contact@|brand|diagnostic/);
});
