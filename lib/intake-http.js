'use strict';

const { createHmac, timingSafeEqual, randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const { validate, IntakeError, MAX_BYTES } = require('./intake-validation');
const { configuration } = require('./intake-config');
const { createStore } = require('./intake-store');
const { createServices } = require('./intake-services');
const { processRow } = require('./intake-worker');

function header(req, name) { const value = req.headers[name]; return typeof value === 'string' ? value : ''; }
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
async function bodyOf(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type'))) throw new IntakeError('json_required', 415);
  if (Number(header(req, 'content-length')) > MAX_BYTES) throw new IntakeError('request_too_large', 413);
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_BYTES) throw new IntakeError('request_too_large', 413);
    try { return typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(raw); }
    catch { throw new IntakeError('invalid_json'); }
  }
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BYTES) throw new IntakeError('request_too_large', 413);
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new IntakeError('invalid_json'); }
}
function assertOrigin(req, config) {
  if (!config.origins.includes(header(req, 'origin')) || header(req, 'sec-fetch-site') === 'cross-site') throw new IntakeError('origin_not_allowed', 403);
}
function clientIp(req, config) {
  const ip = config.vercel ? header(req, 'x-vercel-forwarded-for') || header(req, 'x-forwarded-for') : req.socket?.remoteAddress;
  if (!ip || !isIP(ip)) throw new IntakeError('request_unavailable', 503);
  return ip;
}
function secretMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function dependencies(overrides = {}) {
  const config = overrides.config || configuration();
  return { ...overrides, config, store: overrides.store || createStore(config), services: overrides.services || createServices(config) };
}
function failure(res, error) {
  const safe = error instanceof IntakeError ? error : new IntakeError('temporarily_unavailable', 503);
  if (safe.status === 429) res.setHeader('Retry-After', '3600');
  json(res, safe.status, { ok: false, error: safe.code, ...(safe.fields ? { fields: safe.fields } : {}) });
}
function createIntakeHandler(overrides) {
  return async function intake(req, res) {
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new IntakeError('method_not_allowed', 405); }
      const { config, store, services } = dependencies(overrides);
      if (!config.enabled) throw new IntakeError('intake_unavailable', 503);
      assertOrigin(req, config);
      const { payload, hash, token } = validate(await bodyOf(req));
      const ip = clientIp(req, config);
      const previous = await store.receipt(payload.submission_id, hash);
      if (previous?.status === 'conflict') throw new IntakeError('submission_conflict', 409);
      if (previous?.status !== 'received') {
        await services.verify(token, payload.submission_id, ip);
        const digest = value => createHmac('sha256', config.hashSecret).update(value).digest('hex');
        const result = await store.accept(payload, hash, digest(`ip:${ip}`), digest(`email:${payload.email}`));
        if (result?.status === 'conflict') throw new IntakeError('submission_conflict', 409);
        if (result?.status === 'limited') throw new IntakeError('rate_limited', 429);
        if (result?.status !== 'received') throw new IntakeError('storage_unavailable', 503);
      }
      json(res, 202, { ok: true, status: 'received', submission_id: payload.submission_id });
    } catch (error) { failure(res, error); }
  };
}
function createConfigHandler(overrides) {
  return async function publicConfig(req, res) {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { ok: false, error: 'method_not_allowed' }); }
    const config = overrides?.config || configuration();
    json(res, 200, { enabled: config.enabled, turnstileSiteKey: config.enabled ? config.turnstileSiteKey : null, action: config.action });
  };
}
function createRetryHandler(overrides) {
  return async function retry(req, res) {
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); throw new IntakeError('method_not_allowed', 405); }
      const deps = dependencies(overrides);
      if (!secretMatches(header(req, 'authorization'), `Bearer ${deps.config.cronSecret || ''}`) || !deps.config.cronSecret) throw new IntakeError('unauthorized', 401);
      // Turning off new intake must not strand inquiries already received.
      if (!deps.config.ready) throw new IntakeError('intake_unavailable', 503);
      const lease = randomUUID();
      const row = await deps.store.claim(lease);
      let result = null;
      if (row) result = await processRow(row, lease, deps);
      await deps.store.prune();
      const health = await deps.store.health();
      const needsAttention = health.manual > 0 || health.overdue > 0;
      if (needsAttention) console.error(JSON.stringify({ event: 'intake_needs_attention', ...health }));
      json(res, needsAttention ? 503 : 200, { ok: !needsAttention, processed: row ? 1 : 0, result, health });
    } catch (error) { failure(res, error); }
  };
}
module.exports = { createIntakeHandler, createConfigHandler, createRetryHandler, bodyOf, secretMatches };
