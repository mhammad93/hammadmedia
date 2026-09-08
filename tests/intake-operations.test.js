'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configuration } = require('../lib/intake-config');
const { createRetryHandler } = require('../lib/intake-http');
const { createStore } = require('../lib/intake-store');
const { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

test('heartbeat requires explicit opt-in and the Vercel production environment', () => {
  for (const env of [{}, { INTAKE_HEARTBEAT_ENABLED: 'true' }, { INTAKE_HEARTBEAT_ENABLED: 'true', VERCEL_ENV: 'preview', VERCEL: '1' }, { VERCEL_ENV: 'production', VERCEL: '1' }]) {
    assert.equal(configuration(env).heartbeatEnabled, false);
  }
  assert.equal(configuration({ INTAKE_HEARTBEAT_ENABLED: 'true', VERCEL_ENV: 'production', VERCEL: '1' }).heartbeatEnabled, true);
});

async function cycle({ heartbeatEnabled = true, health = { pending: 0, manual: 0, overdue: 0 }, failAt } = {}) {
  const calls = [];
  const step = name => async () => { calls.push(name); if (failAt === name) throw new Error('Synthetic dependency failure'); return name === 'claim' ? null : name === 'health' ? health : true; };
  const handler = createRetryHandler({
    config: { ready: true, cronSecret: 'synthetic-cron-test-only', heartbeatEnabled }, services: {},
    store: { claim: step('claim'), prune: step('prune'), health: step('health'), completedCycle: step('heartbeat') }
  });
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'GET', headers: { authorization: 'Bearer synthetic-cron-test-only' } }, res);
  return { calls, res };
}
test('empty completed cycle persists heartbeat after prune and health', async () => {
  const { calls, res } = await cycle();
  assert.deepEqual(calls, ['claim', 'prune', 'health', 'heartbeat']);
  assert.equal(res.statusCode, 200);
});
test('attention is a completed cycle, not a missing worker', async () => {
  const { calls, res } = await cycle({ health: { pending: 1, manual: 1, overdue: 1 } });
  assert.equal(res.statusCode, 503);
  assert.equal(calls.at(-1), 'heartbeat');
});
test('failure or default-off monitoring cannot fabricate a completed cycle', async () => {
  for (const failAt of ['claim', 'prune', 'health']) {
    const { calls, res } = await cycle({ failAt });
    assert.equal(res.statusCode, 503);
    assert.equal(calls.includes('heartbeat'), false);
  }
  assert.equal((await cycle({ heartbeatEnabled: false })).calls.includes('heartbeat'), false);
  assert.equal((await cycle({ failAt: 'heartbeat' })).res.statusCode, 503);
});
test('heartbeat RPC supplies no browser time, inquiry contents or credentials in its body', async () => {
  const calls = [];
  const store = createStore({ supabaseUrl: 'https://synthetic.supabase.co', supabaseKey: 'synthetic-key' }, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => true };
  });
  assert.equal(typeof store.completedCycle, 'function');
  await store.completedCycle();
  assert.deepEqual(calls, [{ url: 'https://synthetic.supabase.co/rest/v1/rpc/hm_intake_ops_worker_completed', body: {} }]);
});

const env = {
  HM_INTAKE_WATCHDOG_ENABLED: 'true', HM_INTAKE_WATCHDOG_SECRET: 'synthetic-watchdog-secret-only-0123456789',
  INTAKE_SUPABASE_URL: 'https://synthetic.supabase.co', INTAKE_SUPABASE_SECRET_KEY: 'sb_secret_synthetic_test_only_0123456789',
  RESEND_OPS_API_KEY: 're_synthetic_test_only', RESEND_FROM_EMAIL: 'intake@notifications.hammadmedia.com'
};
const notice = () => ({ id: '44444444-4444-4444-8444-444444444444', incident_id: '55555555-5555-4555-8555-555555555555',
  kind: 'opened', created_at: '2026-09-08T12:00:00Z', snapshot: { conditions: 4, pending: 0, manual: 0, overdue: 0, worker_age_seconds: null }, email_payload: null });
async function watchdog(options = {}) {
  const path = join(__dirname, '../supabase/functions/intake-watchdog/core.mjs');
  assert.equal(existsSync(path), true, 'the independent watchdog implementation exists');
  const { createWatchdog } = await import(pathToFileURL(path));
  const calls = []; let count = 0;
  const fetcher = async (url, request) => {
    const body = JSON.parse(request.body); calls.push({ url, headers: request.headers, body });
    if (options.failRpc && url.endsWith(options.failRpc)) throw new Error('PRIVATE_RAW_PROVIDER_FAILURE');
    if (url === 'https://api.resend.com/emails') {
      if (options.sendThrows) throw new Error('PRIVATE_PROVIDER_DETAIL');
      return new Response(JSON.stringify(options.sendBody || { id: 'provider-notice-1' }), { status: options.sendStatus || 200 });
    }
    let value;
    if (url.endsWith('/hm_intake_ops_claim')) value = count++ < (options.items ?? 1) ? { enabled: true, item: options.notice || notice() } : { enabled: options.sqlEnabled !== false, item: null };
    else if (url.endsWith('/hm_intake_ops_prepare')) value = { ...(options.notice || notice()), email_payload: options.frozen || body.p_payload };
    else if (url.endsWith('/hm_intake_ops_health')) value = options.notificationHealth ?? { enabled: true, notification_pending: 0, notification_manual: 0 };
    else value = options.malformedRpc && url.endsWith(options.malformedRpc) ? {} : true;
    return new Response(JSON.stringify(value));
  };
  const handler = createWatchdog({ env: { ...env, ...options.env }, fetcher });
  const response = await handler(new Request('https://synthetic.supabase.co/functions/v1/intake-watchdog', { method: options.method || 'POST', headers: { 'x-hm-watchdog-secret': options.auth ?? env.HM_INTAKE_WATCHDOG_SECRET } }));
  return { calls, status: response.status, body: await response.json() };
}
test('watchdog is authenticated and default-off before any network request', async () => {
  for (const options of [{ auth: '' }, { auth: 'wrong' }, { method: 'GET' }, { env: { HM_INTAKE_WATCHDOG_ENABLED: '' } }, { env: { INTAKE_SUPABASE_SECRET_KEY: '' } }]) {
    const result = await watchdog(options);
    assert.ok(result.status >= 400);
    assert.deepEqual(result.calls, []);
  }
});
test('idle watchdog only checks operations and records its own completion', async () => {
  const result = await watchdog({ items: 0 });
  assert.equal(result.status, 200);
  assert.equal(result.body.processed, 0);
  assert.deepEqual(result.body.notifications, { pending: 0, manual: 0 });
  assert.equal(result.calls.length, 3);
  assert.equal(result.calls.at(-1).url.endsWith('/hm_intake_ops_watchdog_completed'), true);
  assert.equal(result.calls.some(x => /intake-retry|hm_intake_claim$|notion\.com/.test(x.url)), false);
  const disabled = await watchdog({ items: 0, sqlEnabled: false });
  assert.equal(disabled.body.enabled, false);
  assert.equal(disabled.calls.length, 1);
});
test('persisted manual or deferred notification work stays visible even with nothing due', async () => {
  for (const [pending, manual] of [[0, 1], [1, 0], [2, 3]]) {
    const result = await watchdog({ items: 0, notificationHealth: { enabled: true, notification_pending: pending, notification_manual: manual } });
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.processed, 0);
    assert.deepEqual(result.body.notifications, { pending, manual });
    assert.equal(result.calls.some(x => x.url === 'https://api.resend.com/emails'), false);
    assert.equal(result.calls.at(-1).url.endsWith('/hm_intake_ops_watchdog_completed'), true, 'liveness remains separate from alert delivery health');
  }
});
test('unconfirmed or malformed notification health cannot report a clean completion', async () => {
  for (const notificationHealth of [true, {}, { enabled: true, notification_pending: -1, notification_manual: 0 }, { enabled: true, notification_pending: 0, notification_manual: '1' }, { enabled: false, notification_pending: 0, notification_manual: 0 }]) {
    const result = await watchdog({ items: 0, notificationHealth });
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    assert.equal(result.calls.some(x => x.url.endsWith('/hm_intake_ops_watchdog_completed')), false);
  }
  const failed = await watchdog({ items: 0, failRpc: '/hm_intake_ops_health' });
  assert.equal(failed.status, 503);
});
test('alert sends only fixed counts after a durable frozen envelope, then records acceptance', async () => {
  const item = notice(); Object.defineProperty(item, 'payload', { get() { throw new Error('Must not read inquiry'); } });
  const result = await watchdog({ notice: item });
  assert.equal(result.status, 200);
  const send = result.calls.find(x => x.url === 'https://api.resend.com/emails');
  assert.deepEqual(send.body.to, ['contact@hammadmedia.com']);
  assert.deepEqual(Object.keys(send.body).sort(), ['from', 'subject', 'text', 'to']);
  assert.match(send.body.text, /worker.*missing|No completed worker/i);
  assert.match(send.body.text, /Pending: 0/);
  assert.match(send.body.text, /https:\/\/supabase.com\/dashboard\/project\/synthetic\/editor/);
  assert.equal(send.headers['Idempotency-Key'], 'hm-ops-44444444-4444-4444-8444-444444444444');
  assert.equal(result.calls[1].url.endsWith('/hm_intake_ops_prepare'), true);
  const outcome = result.calls.find(x => x.url.endsWith('/hm_intake_ops_finish')).body;
  assert.equal(outcome.p_state, 'accepted');
  assert.equal(outcome.p_provider_id, 'provider-notice-1');
});
test('retry uses persisted envelope unchanged even after sender/template changes', async () => {
  const frozen = { from: 'intake@hammadmedia.com', to: ['contact@hammadmedia.com'], subject: 'Previously frozen notice', text: 'Original count snapshot' };
  const result = await watchdog({ frozen });
  assert.deepEqual(result.calls.find(x => x.url === 'https://api.resend.com/emails').body, frozen);
});
test('uncertain, rejected and malformed sends remain distinct from accepted alerts', async () => {
  for (const [options, expected] of [[{ sendThrows: true }, 'retry'], [{ sendStatus: 429 }, 'retry'], [{ sendStatus: 400, sendBody: { message: 'PRIVATE_RECIPIENT' } }, 'manual'], [{ sendBody: {} }, 'retry']]) {
    const result = await watchdog(options);
    assert.equal(result.status, 503);
    const outcome = result.calls.find(x => x.url.endsWith('/hm_intake_ops_finish')).body;
    assert.equal(outcome.p_state, expected);
    assert.equal(outcome.p_provider_id, null);
    assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE|RECIPIENT|synthetic-watchdog|sb_secret|re_synthetic/);
  }
});
test('storage failures do not send before checkpoint or falsely record acceptance afterward', async () => {
  const before = await watchdog({ failRpc: '/hm_intake_ops_prepare' });
  assert.equal(before.status, 503);
  assert.equal(before.calls.some(x => x.url === 'https://api.resend.com/emails'), false);
  const after = await watchdog({ failRpc: '/hm_intake_ops_finish' });
  assert.equal(after.status, 503);
  assert.equal(after.calls.some(x => x.url.endsWith('/hm_intake_ops_watchdog_completed')), false);
  assert.doesNotMatch(JSON.stringify(after.body), /PRIVATE/);
  for (const malformedRpc of ['/hm_intake_ops_finish', '/hm_intake_ops_watchdog_completed']) {
    assert.equal((await watchdog({ malformedRpc })).status, 503, 'only a literal persisted true confirms an operations write');
  }
});
test('a single watchdog invocation has a strict three-notification work bound', async () => {
  const result = await watchdog({ items: 100 });
  assert.equal(result.body.processed, 3);
  assert.equal(result.calls.filter(x => x.url === 'https://api.resend.com/emails').length, 3);
});
test('an operational delivery test is clearly labeled and makes no live failure claim', async () => {
  const result = await watchdog({ notice: { ...notice(), kind: 'test', snapshot: { conditions: 0, pending: 0, manual: 0, overdue: 0, worker_age_seconds: null } } });
  assert.equal(result.status, 200);
  const sent = result.calls.find(x => x.url === 'https://api.resend.com/emails').body;
  assert.match(sent.subject, /test/i);
  assert.match(sent.text, /No production failure is asserted/);
  assert.doesNotMatch(sent.text, /conditions have recovered|review is required/);
});
test('generated public website excludes operations source, schema, runbooks and secret settings', () => {
  const output = mkdtempSync(join(tmpdir(), 'hm-ops-public-test-'));
  try {
    execFileSync(process.execPath, [join(__dirname, '../build.js')], { env: { ...process.env, HM_BUILD_OUTPUT_DIR: output }, stdio: 'pipe' });
    const paths = readdirSync(output, { recursive: true });
    assert.equal(paths.some(path => /(?:^|\/)(?:supabase|db|docs|lib|tests)(?:\/|$)/.test(path)), false);
    for (const path of paths.filter(path => /\.(?:js|html|json|sql|toml|md)$/.test(path))) {
      assert.doesNotMatch(readFileSync(join(output, path), 'utf8'), /HM_INTAKE_WATCHDOG|RESEND_OPS_API_KEY|hm_intake_ops_|x-hm-watchdog-secret/);
    }
  } finally { rmSync(output, { recursive: true, force: true }); }
});
