'use strict';

const { emailEnvelope } = require('./intake-services');

const EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000; // Stay safely inside Resend's 24-hour retention.
const NOTION_TERMINAL = new Set(['synced', 'manual']);
const EMAIL_TERMINAL = new Set(['accepted', 'manual']);

async function processRow(initialRow, lease, { store, services, config, now = Date.now }) {
  let row = initialRow;
  async function save(changes) {
    row = await store.save(row.id, lease, changes);
    if (!row || row.lost_lease) throw new Error('lease_lost');
  }
  try {
    if (!NOTION_TERMINAL.has(row.notion_state)) {
      const ambiguous = ['creating', 'uncertain'].includes(row.notion_state);
      let matches;
      try { matches = await services.findNotion(row.id); }
      catch {
        await save({ notion_state: row.attempts >= 12 ? 'manual' : ambiguous ? 'uncertain' : 'pending', notion_error: 'lookup_unavailable' });
      }
      if (matches) {
        if (matches.length > 1) {
          await save({ notion_state: 'manual', notion_error: 'multiple_deal_id_matches' });
        } else if (matches.length === 1) {
          await save({ notion_state: 'synced', notion_page_id: matches[0], notion_error: null });
        } else if (ambiguous) {
          // Notion has no documented create idempotency guarantee. Zero query results do NOT prove a timed-out create failed.
          const checks = row.notion_reconcile_count + 1;
          await save({ notion_state: checks >= 10 ? 'manual' : 'uncertain', notion_reconcile_count: checks, notion_error: 'create_outcome_unknown' });
        } else if (row.attempts >= 12) {
          await save({ notion_state: 'manual', notion_error: 'retry_limit' });
        } else {
          // This durable checkpoint precedes the network side effect, including the crash-before-response case.
          await save({ notion_state: 'creating', notion_error: null });
          try {
            const pageId = await services.createNotion(row);
            await save({ notion_state: 'synced', notion_page_id: pageId, notion_error: null });
          } catch (error) {
            if (!error.provider) throw error; // A storage failure must preserve the creating checkpoint.
            const rejected = error.status >= 400 && error.status < 500;
            await save({ notion_state: error.status === 429 ? 'pending' : rejected ? 'manual' : 'uncertain', notion_error: rejected ? `create_rejected_${error.status}` : 'create_outcome_unknown' });
          }
        }
      }
    }
    if (!EMAIL_TERMINAL.has(row.email_state)) {
      if (!row.email_started_at) {
        await save({ email_state: 'sending', email_started_at: new Date(now()).toISOString(), email_payload: emailEnvelope(row, config), email_error: null });
      }
      if (now() - Date.parse(row.email_started_at) >= EMAIL_RETRY_WINDOW_MS) {
        await save({ email_state: 'manual', email_error: 'idempotency_window_elapsed' });
      } else {
        try {
          const id = await services.sendEmail(row);
          await save({ email_state: 'accepted', email_id: id, email_error: null });
        } catch (error) {
          if (!error.provider) throw error;
          const retryable = !error.status || error.status >= 500 || error.status === 429 || error.code === 'concurrent_idempotent_requests' || (error.status === 200 && error.code === 'invalid_response');
          await save({ email_state: retryable ? 'retry' : 'manual', email_error: retryable ? 'acceptance_unconfirmed' : error.code === 'invalid_idempotent_request' ? 'idempotency_payload_conflict' : `send_rejected_${error.status}` });
        }
      }
    }
    return { notion: row.notion_state, email: row.email_state };
  } finally {
    // Failure to release is recoverable after the lease expires. Never start an unawaited task in a function.
    const seconds = Math.min(3600, 60 * (2 ** Math.min(row.attempts - 1, 6)));
    await store.release(row.id, lease, seconds);
  }
}
module.exports = { processRow, EMAIL_RETRY_WINDOW_MS };
