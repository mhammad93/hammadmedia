// Private operations worker. Never imported by the public website build.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECIPIENT = 'contact@hammadmedia.com';
const SENDER = /^[a-z0-9._+-]+@(?:[a-z0-9-]+\.)?hammadmedia\.com$/i;

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function secretMatches(given, expected) {
  if (!given || given.length > 256) return false;
  const bytes = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(value => crypto.subtle.digest('SHA-256', bytes.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b); let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
function envelope(item, sender, project) {
  const s = item.snapshot;
  if (!UUID.test(item.id) || !UUID.test(item.incident_id) || !['opened', 'updated', 'reminder', 'recovered', 'test'].includes(item.kind) ||
      !s || !Number.isInteger(s.conditions) || s.conditions < 0 || s.conditions > 7 ||
      !['pending', 'manual', 'overdue'].every(key => Number.isSafeInteger(s[key]) && s[key] >= 0) ||
      !(s.worker_age_seconds === null || (Number.isSafeInteger(s.worker_age_seconds) && s.worker_age_seconds >= 0)) ||
      !Number.isFinite(Date.parse(item.created_at))) throw new Error('invalid_operation');
  const conditions = [];
  if (item.kind === 'test') conditions.push('This is a controlled test of the intake operations alert route. No production failure is asserted. Counts below are a synthetic fixture.');
  else {
    if (s.conditions & 1) conditions.push('Manual review is required.');
    if (s.conditions & 2) conditions.push('An unresolved inquiry is older than 15 minutes.');
    if (s.conditions & 4) conditions.push('No completed worker cycle was recorded within the heartbeat threshold.');
    if (!s.conditions) conditions.push('The monitored queue and worker conditions have recovered.');
  }
  return {
    from: sender, to: [RECIPIENT], subject: `Hammad Media intake: ${item.kind === 'test' ? 'alert delivery test' : item.kind === 'recovered' ? 'recovered' : 'attention needed'}`,
    text: [
      'Mohammed,', '', ...conditions, '',
      `Pending: ${s.pending}`, `Manual review: ${s.manual}`, `Overdue: ${s.overdue}`,
      'Counts can overlap; they are not separate inquiry totals.',
      `Last completed worker age: ${s.worker_age_seconds === null ? 'not recorded' : `${s.worker_age_seconds} seconds`}`,
      '', `Incident: ${item.incident_id}`, `Notice: ${item.kind}`, `Snapshot (UTC): ${new Date(item.created_at).toISOString()}`,
      `Private console: https://supabase.com/dashboard/project/${project}/editor`, '',
      'Use the private intake operations runbook to inspect this incident. This notice does not authorize a new inquiry send, a CRM edit or an automatic resend.',
      'Email API acceptance is not proof of inbox delivery.'
    ].join('\n')
  };
}
function validEnvelope(payload) {
  return payload && typeof payload === 'object' && Object.keys(payload).sort().join(',') === 'from,subject,text,to' &&
    SENDER.test(payload.from) && Array.isArray(payload.to) && payload.to.length === 1 && payload.to[0] === RECIPIENT &&
    typeof payload.subject === 'string' && payload.subject.length > 0 && payload.subject.length <= 200 &&
    typeof payload.text === 'string' && payload.text.length > 0 && payload.text.length <= 8000;
}

export function createWatchdog({ env, fetcher = fetch }) {
  return async request => {
    if (request.method !== 'POST') return response(405, { ok: false, error: 'method_not_allowed' });
    const secret = env.HM_INTAKE_WATCHDOG_SECRET || '';
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return response(503, { ok: false, error: 'watchdog_unavailable' });
    if (!await secretMatches(request.headers.get('x-hm-watchdog-secret'), secret)) return response(401, { ok: false, error: 'unauthorized' });
    if (env.HM_INTAKE_WATCHDOG_ENABLED !== 'true') return response(503, { ok: false, error: 'watchdog_disabled' });
    const url = env.INTAKE_SUPABASE_URL || '', key = env.INTAKE_SUPABASE_SECRET_KEY || '';
    const project = /^https:\/\/([a-z0-9-]+)\.supabase\.co$/.exec(url)?.[1];
    if (!project || !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key) || !SENDER.test(env.RESEND_FROM_EMAIL || '') ||
        !/^re_[A-Za-z0-9_-]+$/.test(env.RESEND_OPS_API_KEY || '')) return response(503, { ok: false, error: 'watchdog_unavailable' });
    async function rpc(name, body = {}) {
      const result = await fetcher(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000),
        headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!result.ok) throw new Error('operations_storage_unavailable');
      return result.json();
    }
    let processed = 0, needsAttention = false;
    try {
      // The SQL operation only evaluates health and claims notification work. It never runs intake delivery.
      for (; processed < 3; processed++) {
        const lease = crypto.randomUUID();
        const claimed = await rpc('hm_intake_ops_claim', { p_lease: lease });
        if (!claimed || typeof claimed.enabled !== 'boolean') throw new Error('invalid_operations_response');
        if (!claimed.enabled) return response(200, { ok: true, enabled: false, processed });
        if (claimed.item === null) break;
        const item = claimed.item;
        const prepared = await rpc('hm_intake_ops_prepare', {
          p_id: item.id, p_lease: lease, p_payload: item.email_payload || envelope(item, env.RESEND_FROM_EMAIL, project)
        });
        if (!UUID.test(item.id) || !validEnvelope(prepared?.email_payload)) throw new Error('invalid_operations_envelope');
        let state = 'retry', providerId = null, errorCode = 'send_unconfirmed';
        try {
          const sent = await fetcher('https://api.resend.com/emails', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
            headers: { Authorization: `Bearer ${env.RESEND_OPS_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `hm-ops-${item.id}` },
            body: JSON.stringify(prepared.email_payload)
          });
          const result = await sent.json().catch(() => null);
          if (sent.ok && typeof result?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(result.id)) {
            state = 'accepted'; providerId = result.id; errorCode = null;
          } else if (sent.status >= 400 && sent.status < 500 && sent.status !== 429 && result?.name !== 'concurrent_idempotent_requests') {
            state = 'manual'; errorCode = result?.name === 'invalid_idempotent_request' ? 'payload_conflict' : 'send_rejected';
          }
        } catch { /* an uncertain transport result retains the same frozen request and key */ }
        if (await rpc('hm_intake_ops_finish', { p_id: item.id, p_lease: lease, p_state: state, p_provider_id: providerId, p_error_code: errorCode }) !== true) throw new Error('operation_lease_lost');
        if (state !== 'accepted') needsAttention = true;
      }
      // Due claims omit deferred/in-flight/manual work. Persisted delivery health
      // must survive into later ticks, independently of this worker's liveness.
      const health = await rpc('hm_intake_ops_health');
      if (health?.enabled !== true || !['notification_pending', 'notification_manual'].every(key => Number.isSafeInteger(health[key]) && health[key] >= 0)) {
        throw new Error('invalid_operations_health');
      }
      const notifications = { pending: health.notification_pending, manual: health.notification_manual };
      needsAttention ||= notifications.pending > 0 || notifications.manual > 0;
      if (await rpc('hm_intake_ops_watchdog_completed') !== true) throw new Error('watchdog_completion_unconfirmed');
      return response(needsAttention ? 503 : 200, { ok: !needsAttention, enabled: true, processed, notifications });
    } catch {
      // No exception strings, headers, provider bodies or inquiry content enter logs/responses.
      return response(503, { ok: false, error: 'watchdog_unavailable', processed });
    }
  };
}
