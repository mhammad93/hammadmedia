'use strict';

const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const MAX_BYTES = 65536;
const TYPES = new Set(['email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.failed', 'email.suppressed', 'email.complained']);
const PROJECT_URL = 'https://mftfdyuxyoibmioyonft.supabase.co';
const EVENT_ID = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function header(headers, name) { return typeof headers[name] === 'string' ? headers[name] : ''; }
function secretBytes(secret) {
  if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/]{22,128}={0,2}$/.test(secret)) return null;
  const encoded = secret.slice(6), bytes = Buffer.from(encoded, 'base64');
  return bytes.length >= 16 && bytes.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '') ? bytes : null;
}
function webhookConfiguration(env = process.env) {
  const supabaseKey = env.INTAKE_SUPABASE_SECRET_KEY || env.INTAKE_SUPABASE_SERVICE_ROLE_KEY || '';
  let serviceKey = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(supabaseKey);
  if (!serviceKey && supabaseKey.startsWith('eyJ')) {
    try { serviceKey = JSON.parse(Buffer.from(supabaseKey.split('.')[1], 'base64url')).role === 'service_role'; } catch { /* fail closed */ }
  }
  const sender = env.RESEND_FROM_EMAIL || '';
  return {
    enabled: env.RESEND_WEBHOOK_ENABLED === 'true' && env.VERCEL === '1' && env.VERCEL_ENV === 'production' &&
      env.INTAKE_SUPABASE_URL === PROJECT_URL && serviceKey && Boolean(secretBytes(env.RESEND_WEBHOOK_SECRET)) &&
      sender === 'intake@notifications.hammadmedia.com',
    secret: env.RESEND_WEBHOOK_SECRET, sender, recipient: 'contact@hammadmedia.com',
    supabaseUrl: env.INTAKE_SUPABASE_URL, supabaseKey
  };
}

// Svix's documented v1 format: HMAC-SHA256(id.timestamp.rawBytes), with a
// base64-decoded endpoint secret. The published independent vector is tested.
function verifySignature(raw, headers, secret, now = Date.now()) {
  const key = secretBytes(secret), id = header(headers, 'svix-id'), timestamp = header(headers, 'svix-timestamp');
  const signatures = header(headers, 'svix-signature');
  if (!key || !Buffer.isBuffer(raw) || !EVENT_ID.test(id) || !/^[0-9]{10}$/.test(timestamp) ||
      !Number.isFinite(now) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !signatures || signatures.length > 4096) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(raw).digest();
  let valid = false;
  for (const item of signatures.split(' ')) {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(item)) continue;
    const candidate = Buffer.from(item.slice(3), 'base64');
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) valid = true;
  }
  return valid;
}

class WebhookError extends Error { constructor(code, status) { super(code); this.status = status; } }
function rawBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(header(req.headers, 'content-type')) ||
      !['', 'identity'].includes(header(req.headers, 'content-encoding').toLowerCase())) throw new WebhookError('json_required', 415);
  const declared = header(req.headers, 'content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new WebhookError('request_too_large', 413);
  // Never read req.body or stringify parsed JSON. Vercel Node helpers restore
  // raw data/end events after buffering; readableEnded may already be true.
  return new Promise((resolve, reject) => {
    let size = 0, finished = false; const chunks = [];
    const done = (error, value) => {
      if (finished) return; finished = true; clearTimeout(timer);
      req.removeListener('data', onData); req.removeListener('end', onEnd);
      req.removeListener('error', onError); req.removeListener('aborted', onError);
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      if (finished) return;
      if (!Buffer.isBuffer(chunk)) return done(new WebhookError('raw_body_required', 400));
      size += chunk.length;
      if (size > MAX_BYTES) return done(new WebhookError('request_too_large', 413));
      chunks.push(chunk);
    };
    const onEnd = () => done(null, Buffer.concat(chunks));
    const onError = () => done(new WebhookError('invalid_body', 400));
    const timer = setTimeout(() => done(new WebhookError('body_timeout', 408)), 5000);
    req.on('error', onError); req.on('aborted', onError); req.on('end', onEnd); req.on('data', onData);
  });
}
function minimalEvent(raw, headers, config, now) {
  let event;
  try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new WebhookError('invalid_event', 400); }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') throw new WebhookError('invalid_event', 400);
  // Unsubscribed engagement/domain events are authenticated but never stored.
  if (!TYPES.has(event.type)) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new WebhookError('invalid_event', 400);
  const match = typeof data.from === 'string' && data.from.match(/^[^<>\r\n]*<([^<>\s]+)>$/);
  const sender = match ? match[1] : data.from;
  if (sender !== config.sender || !Array.isArray(data.to) || data.to.length !== 1 || data.to[0] !== config.recipient) return null;
  const at = Date.parse(event.created_at);
  if (typeof data.email_id !== 'string' || !EMAIL_ID.test(data.email_id) || typeof event.created_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(event.created_at) ||
      !Number.isFinite(at) || at < Date.UTC(2000, 0, 1) || at > now + 300000 ||
      new Date(at).toISOString().slice(0, 19) !== event.created_at.slice(0, 19)) throw new WebhookError('invalid_event', 400);
  return { eventId: header(headers, 'svix-id'), emailId: data.email_id.toLowerCase(), type: event.type,
    occurredAt: new Date(at).toISOString(), payloadHash: createHash('sha256').update(raw).digest('hex') };
}
function createWebhookStore(config, fetcher = fetch) {
  return { async record(event) {
    const headers = { apikey: config.supabaseKey, 'Content-Type': 'application/json' };
    if (config.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.supabaseKey}`;
    const response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/hm_intake_resend_record`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000), headers,
      body: JSON.stringify({ p_event_id: event.eventId, p_email_id: event.emailId, p_type: event.type, p_occurred_at: event.occurredAt, p_hash: event.payloadHash })
    });
    if (!response.ok) throw new Error('storage_unavailable');
    return response.json();
  } };
}
function json(res, status, body) {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function createWebhookHandler({ config = webhookConfiguration(), store = createWebhookStore(config), now = Date.now } = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'method_not_allowed' }); }
    if (!config.enabled || header(req.headers, 'host') !== 'hammadmedia.com') return json(res, 503, { error: 'webhook_disabled' });
    try {
      const raw = await rawBody(req);
      if (!verifySignature(raw, req.headers, config.secret, now())) return json(res, 401, { error: 'invalid_signature' });
      const event = minimalEvent(raw, req.headers, config, now());
      if (!event) return json(res, 200, { received: true });
      const result = await store.record(event);
      if (result?.status === 'conflict') return json(res, 409, { error: 'event_conflict' });
      if (!['recorded', 'duplicate'].includes(result?.status)) return json(res, 503, { error: 'storage_unavailable' });
      return json(res, 200, { received: true });
    } catch (error) {
      // Never log request headers, payloads, addresses, provider text or secrets.
      return json(res, error instanceof WebhookError ? error.status : 503,
        { error: error instanceof WebhookError ? error.message : 'storage_unavailable' });
    }
  };
}
module.exports = { createWebhookHandler, createWebhookStore, verifySignature, webhookConfiguration };
