'use strict';

const { IntakeError } = require('./intake-validation');

function createStore(config, fetcher = fetch, { timeoutMs = 4000, signal } = {}) {
  async function rpc(name, args = {}) {
    let response, requestSignal;
    const headers = { apikey: config.supabaseKey, 'Content-Type': 'application/json' };
    // Modern secret keys are not JWTs. Only legacy service_role JWTs belong in Authorization.
    if (config.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.supabaseKey}`;
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      requestSignal.throwIfAborted();
      response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', signal: requestSignal,
        headers,
        body: JSON.stringify(args)
      });
    } catch { throw new IntakeError('storage_unavailable', 503); }
    if (!response.ok) throw new IntakeError('storage_unavailable', 503);
    try {
      const result = await response.json();
      requestSignal.throwIfAborted();
      return result;
    } catch { throw new IntakeError('storage_unavailable', 503); }
  }
  return {
    receipt: (id, hash) => rpc('hm_intake_receipt', { p_id: id, p_hash: hash }),
    accept: (payload, hash, ipHash, emailHash) => rpc('hm_intake_accept', { p_id: payload.submission_id, p_hash: hash, p_payload: payload, p_ip_hash: ipHash, p_email_hash: emailHash }),
    claim: (lease) => rpc('hm_intake_claim', { p_lease: lease }),
    save: (id, lease, changes) => rpc('hm_intake_save', { p_id: id, p_lease: lease, p_changes: changes }),
    release: (id, lease, delaySeconds) => rpc('hm_intake_release', { p_id: id, p_lease: lease, p_delay_seconds: delaySeconds }),
    health: () => rpc('hm_intake_health'),
    completedCycle: () => rpc('hm_intake_ops_worker_completed'),
    prune: () => rpc('hm_intake_prune')
  };
}
module.exports = { createStore };
