'use strict';

const { createHash } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENGAGEMENTS = ['5 videos', '10 videos', '15 videos', '30 videos', 'Exclusivity', 'Help me choose'];
const FIELDS = new Set(['submission_id', 'brand', 'name', 'email', 'product', 'engagement', 'category', 'commission', 'timing', 'exact_category', 'shop_link', 'message', 'locale', 'paid_partnership_ack', 'turnstile_token', 'website', 'attribution']);
const ATTRIBUTION = ['page_path', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer'];
const MAX_BYTES = 16384;

class IntakeError extends Error {
  constructor(code, status = 400, fields) { super(code); this.code = code; this.status = status; this.fields = fields; }
}
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value, field, max, required = false, multiline = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new IntakeError('invalid_fields', 400, [field]);
  const result = value.normalize('NFC').trim();
  // Reject control characters and line breaks in all single-line values (including email headers).
  const control = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if ((required && !result) || result.length > max || control.test(result) || !result.isWellFormed()) throw new IntakeError('invalid_fields', 400, [field]);
  return result;
}
function httpsUrl(value, field) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) throw new Error();
    return url.href;
  } catch { throw new IntakeError('invalid_fields', 400, [field]); }
}
function validate(body) {
  if (!plainObject(body) || Object.keys(body).some(key => !FIELDS.has(key))) throw new IntakeError('invalid_request');
  if (!UUID.test(body.submission_id || '')) throw new IntakeError('invalid_fields', 400, ['submission_id']);
  if (body.website !== undefined && body.website !== '') throw new IntakeError('invalid_request');
  if (body.paid_partnership_ack !== true) throw new IntakeError('paid_partnership_required', 400, ['paid_partnership_ack']);
  const payload = {
    submission_id: body.submission_id.toLowerCase(),
    brand: text(body.brand, 'brand', 160, true),
    name: text(body.name, 'name', 120),
    email: text(body.email, 'email', 254, true).toLowerCase(),
    product: text(body.product, 'product', 1000, true),
    engagement: text(body.engagement, 'engagement', 40, true),
    exact_category: text(body.exact_category, 'exact_category', 160),
    category: text(body.category, 'category', 160),
    commission: text(body.commission, 'commission', 120),
    timing: text(body.timing, 'timing', 200),
    shop_link: httpsUrl(text(body.shop_link, 'shop_link', 1000), 'shop_link'),
    message: text(body.message, 'message', 4000, false, true),
    locale: body.locale || 'en',
    paid_partnership_ack: true,
    attribution: {}
  };
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(payload.email)) throw new IntakeError('invalid_fields', 400, ['email']);
  if (!ENGAGEMENTS.includes(payload.engagement)) throw new IntakeError('invalid_fields', 400, ['engagement']);
  if (payload.engagement === 'Exclusivity' && !payload.exact_category) throw new IntakeError('invalid_fields', 400, ['exact_category']);
  if (!['en', 'zh'].includes(payload.locale)) throw new IntakeError('invalid_fields', 400, ['locale']);
  const attribution = body.attribution === undefined ? {} : body.attribution;
  if (!plainObject(attribution) || Object.keys(attribution).some(key => !ATTRIBUTION.includes(key))) throw new IntakeError('invalid_fields', 400, ['attribution']);
  for (const key of ATTRIBUTION) {
    let value = text(attribution[key], `attribution.${key}`, key === 'referrer' ? 1000 : 200);
    if (key === 'page_path' && value && (!value.startsWith('/') || value.startsWith('//'))) throw new IntakeError('invalid_fields', 400, ['attribution.page_path']);
    // Keep referring origin/path, never third-party query strings or fragments with possible personal data.
    if (key === 'referrer' && value) {
      value = httpsUrl(value, 'attribution.referrer');
      const url = new URL(value); value = url.origin + url.pathname;
    }
    payload.attribution[key] = value;
  }
  const token = text(body.turnstile_token, 'turnstile_token', 2048);
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { payload, hash, token };
}
module.exports = { validate, IntakeError, MAX_BYTES, UUID, ENGAGEMENTS };
