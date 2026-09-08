'use strict';

const { randomUUID } = require('node:crypto');
const { IntakeError } = require('./intake-validation');

class ProviderError extends Error {
  constructor(provider, status = 0, code = 'unavailable') { super(`${provider}_${code}`); this.provider = provider; this.status = status; this.code = code; }
}
function richText(value) {
  // Notion text objects cap content at 2,000 characters. Preserve the complete inquiry in bounded chunks.
  const chunks = []; let chunk = '';
  for (const character of value) {
    if (chunk.length + character.length > 1900) { chunks.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map(content => ({ type: 'text', text: { content } }));
}
function inquiryText(row) {
  const p = row.payload;
  return [
    'Website partnership inquiry. Visitor supplied information; review before any outreach or commitment.',
    `Submission: HM-WEB-${row.id}`, `Received (UTC): ${row.created_at}`,
    `Brand: ${p.brand}`, `Contact: ${p.name || 'Not provided'}`, `Email: ${p.email}`,
    `Product: ${p.product}`, `Requested engagement: ${p.engagement}`,
    `Exact exclusivity category: ${p.exact_category || 'Not requested'}`,
    `Category: ${p.category || 'Not provided'}`, `Proposed commission: ${p.commission || 'Not provided'}`,
    `Timing: ${p.timing || 'Not provided'}`, `Shop link: ${p.shop_link || 'Not provided'}`,
    'Paid partnership starting at $5,000 acknowledged: yes. This is an inquiry, not an agreed fee or contract.',
    `Language: ${p.locale}`, '', `Message:\n${p.message || 'Not provided'}`, '',
    'Website attribution:', ...Object.entries(p.attribution).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)
  ].join('\n');
}
function notionPage(row, config) {
  const p = row.payload;
  return {
    parent: { type: 'data_source_id', data_source_id: config.dataSourceId },
    properties: {
      Name: { title: richText(`${p.brand}: Website inquiry`) },
      Company: { rich_text: richText(p.brand) },
      'Contact name': { rich_text: richText(p.name) }, Email: { email: p.email },
      'Deal ID': { rich_text: richText(`HM-WEB-${row.id}`) },
      Stage: { select: { name: 'New' } }, Status: { select: { name: 'new' } },
      Disposition: { select: { name: 'Active' } }, 'Sticky Bot': { select: { name: 'Nour' } },
      'Who owes': { select: { name: 'HM' } }, 'Follow-up policy': { select: { name: 'Review first' } },
      'Channel origin': { select: { name: 'other' } },
      Notes: { rich_text: richText(inquiryText(row)) }
    }
  };
}
function emailEnvelope(row, config) {
  return {
    from: `Hammad Media Website <${config.sender}>`, to: [config.recipient], reply_to: row.payload.email,
    subject: `Website partnership inquiry: ${row.payload.brand}`,
    text: inquiryText(row)
  };
}
function createServices(config, fetcher = fetch, now = Date.now) {
  async function request(provider, url, options) {
    let response;
    try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(6000) }); }
    catch { throw new ProviderError(provider); }
    let body;
    try { body = await response.json(); } catch { throw new ProviderError(provider, response.status, 'invalid_response'); }
    if (!response.ok) {
      // Provider messages can include request values. Keep only an allowlisted machine code.
      const safeCode = ['invalid_idempotent_request', 'concurrent_idempotent_requests'].includes(body.name) ? body.name : 'http_error';
      throw new ProviderError(provider, response.status, safeCode);
    }
    return body;
  }
  function notion(path, body) {
    return request('notion', `https://api.notion.com/v1/${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.notionToken}`, 'Notion-Version': config.notionVersion, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  }
  return {
    async verify(token, id, ip) {
      if (!token) throw new IntakeError('verification_required', 400, ['turnstile_token']);
      let result;
      try {
        result = await request('turnstile', 'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: config.turnstileSecret, response: token, remoteip: ip, idempotency_key: randomUUID() })
        });
      } catch { throw new IntakeError('verification_unavailable', 503); }
      const age = now() - Date.parse(result.challenge_ts);
      if (result.success !== true || !config.hostnames.includes(result.hostname) || result.action !== config.action || result.cdata !== id || !Number.isFinite(age) || age < -30000 || age > 300000) throw new IntakeError('verification_failed', 400, ['turnstile_token']);
    },
    async findNotion(id) {
      const result = await notion(`data_sources/${config.dataSourceId}/query`, {
        filter: { property: 'Deal ID', rich_text: { equals: `HM-WEB-${id}` } }, page_size: 2
      });
      if (!Array.isArray(result.results) || result.results.some(page => !validPageId(page.id))) throw new ProviderError('notion', 200, 'invalid_response');
      return result.results.map(page => page.id);
    },
    async createNotion(row) {
      const result = await notion('pages', notionPage(row, config));
      if (!validPageId(result.id)) throw new ProviderError('notion', 200, 'invalid_response');
      return result.id;
    },
    async sendEmail(row) {
      const result = await request('resend', 'https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `hm-web-${row.id}` },
        body: JSON.stringify(row.email_payload)
      });
      if (typeof result.id !== 'string' || !result.id || result.id.length > 200) throw new ProviderError('resend', 200, 'invalid_response');
      return result.id;
    }
  };
}
function validPageId(id) { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }
module.exports = { createServices, ProviderError, emailEnvelope, notionPage, inquiryText };
