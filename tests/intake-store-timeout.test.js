'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../lib/intake-store');
const { createIntakeHandler, createRetryHandler } = require('../lib/intake-http');

const config = {
  enabled: true, ready: true, heartbeatEnabled: true, cronSecret: 'synthetic-cron-secret',
  origins: ['https://hammadmedia.com'], vercel: false,
  supabaseUrl: 'https://synthetic.supabase.co', supabaseKey: 'sb_secret_synthetic'
};
function delayedFetch(ms, calls) {
  return async (_url, { signal }) => {
    calls.push(signal);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve(new Response('null'));
      }, ms);
      function abort() { clearTimeout(timer); reject(signal.reason); }
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
  };
}
function resultSink() {
  return { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
}

test('a configurable store tolerates a slow database call within its larger timeout', async () => {
  const calls = [];
  const store = createStore(config, delayedFetch(30, calls), { timeoutMs: 100 });
  assert.equal(await store.claim('synthetic-lease'), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].aborted, false);
});

test('a timed-out mutation is attempted once and exposes only a safe error', async () => {
  for (const operation of [store => store.claim('lease'), store => store.save('id', 'lease', {}),
    store => store.release('id', 'lease', 60), store => store.prune(), store => store.completedCycle()]) {
    const calls = [];
    const store = createStore(config, delayedFetch(100, calls), { timeoutMs: 15 });
    await assert.rejects(operation(store), { code: 'storage_unavailable', status: 503 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].aborted, true);
  }
});

test('the shared deadline aborts an in-flight RPC and prevents later mutations', async () => {
  const calls = [];
  const controller = new AbortController();
  const store = createStore(config, delayedFetch(100, calls), { timeoutMs: 1000, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 15);
  try {
    await assert.rejects(store.claim('lease'), { code: 'storage_unavailable' });
    await assert.rejects(store.prune(), { code: 'storage_unavailable' });
    assert.equal(calls.length, 1);
  } finally { clearTimeout(timer); }
});

test('expiry during response parsing cannot report a successful database operation', async () => {
  const controller = new AbortController();
  const store = createStore(config, async () => ({ ok: true, async json() { controller.abort(); return true; } }),
    { timeoutMs: 1000, signal: controller.signal });
  await assert.rejects(store.completedCycle(), { code: 'storage_unavailable' });
});

test('public intake keeps four-second storage calls and each private worker gets a new fifty-second budget', async () => {
  const originalTimeout = AbortSignal.timeout, originalFetch = global.fetch;
  const timeouts = [], signals = [], calls = [];
  AbortSignal.timeout = ms => { timeouts.push(ms); const signal = new AbortController().signal; signals.push(signal); return signal; };
  global.fetch = async (url, request) => {
    calls.push({ url, signal: request.signal });
    const value = url.endsWith('hm_intake_receipt') ? { status: 'received' }
      : url.endsWith('hm_intake_claim') ? null
      : url.endsWith('hm_intake_health') ? { pending: 0, manual: 0, overdue: 0 } : true;
    return new Response(JSON.stringify(value));
  };
  try {
    const publicResult = resultSink();
    await createIntakeHandler({ config, services: {} })({ method: 'POST', socket: { remoteAddress: '127.0.0.1' },
      headers: { origin: 'https://hammadmedia.com', 'content-type': 'application/json' },
      body: { submission_id: '44444444-4444-4444-8444-444444444444', brand: 'Example brand', email: 'person@example.com',
        product: 'Example product', engagement: '5 videos', paid_partnership_ack: true, locale: 'en',
        turnstile_token: 'synthetic-token', website: '', attribution: { page_path: '/' } } }, publicResult);
    assert.equal(publicResult.statusCode, 202);
    assert.deepEqual(timeouts, [4000]);
    timeouts.length = 0; signals.length = 0;
    const handler = createRetryHandler({ config, services: {} });
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = resultSink();
      await handler({ method: 'GET', headers: { authorization: `Bearer ${config.cronSecret}` } }, res);
      assert.equal(res.statusCode, 200);
    }
    assert.deepEqual(timeouts, [50000, 15000, 15000, 15000, 15000, 50000, 15000, 15000, 15000, 15000]);
    assert.notEqual(signals[0], signals[5], 'the overall budget is created for each invocation');
    assert.equal(calls.length, 9);
  } finally { AbortSignal.timeout = originalTimeout; global.fetch = originalFetch; }
});
