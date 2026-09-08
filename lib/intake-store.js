'use strict';

const { IntakeError } = require('./intake-validation');

function createStore(config, fetcher = fetch) {
  async function rpc(name, args = {}) {
    let response;
    const headers = { apikey: config.supabaseKey, 'Content-Type': 'application/json' };
    // Modern secret keys are not JWTs. Only legacy service_role JWTs belong in Authorization.
    if (config.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.supabaseKey}`;
    try {
      response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000),
        headers,
        body: JSON.stringify(args)
      });
    } catch { throw new IntakeError('storage_unavailable', 503); }
    if (!response.ok) throw new IntakeError('storage_unavailable', 503);
    try { return await response.json(); } catch { throw new IntakeError('storage_unavailable', 503); }
  }
  return {
    receipt: (id, hash) => rpc('hm_intake_receipt', { p_id: id, p_hash: hash }),
    accept: (payload, hash, ipHash, emailHash) => rpc('hm_intake_accept', { p_id: payload.submission_id, p_hash: hash, p_payload: payload, p_ip_hash: ipHash, p_email_hash: emailHash }),
    claim: (lease) => rpc('hm_intake_claim', { p_lease: lease }),
    save: (id, lease, changes) => rpc('hm_intake_save', { p_id: id, p_lease: lease, p_changes: changes }),
    release: (id, lease, delaySeconds) => rpc('hm_intake_release', { p_id: id, p_lease: lease, p_delay_seconds: delaySeconds }),
    health: () => rpc('hm_intake_health'),
    prune: () => rpc('hm_intake_prune')
  };
}
module.exports = { createStore };
