# Intake operations and manual resolution

Status: runbook prepared. Provider activation, production schedule and alert delivery must be verified in the release record. These instructions do not authorize a test email, brand reply, new Notion opportunity, resend or production deployment on their own.

Notion remains the business CRM. The private Supabase queue records receipt and delivery progress. `email_state=accepted` means Resend accepted the request; check delivery/bounce events and the actual inbox separately.

## Read-only queue inspection

Use the authenticated SQL editor in dedicated Supabase project `mftfdyuxyoibmioyonft`. These queries return operational metadata without submitted names, email addresses, product descriptions or messages. Never expose this schema through the browser Data API.

```sql
select public.hm_intake_health();

select id, created_at, notion_state, notion_page_id, notion_error,
       email_state, email_id, email_error, email_started_at,
       attempts, next_attempt_at, lease_until, completed_at
from hm_intake_private.submissions
where notion_state <> 'synced' or email_state <> 'accepted'
order by created_at;
```

Pending work can include a row whose other channel is already manual. Manual rows are preserved. A payload disappearing after both channels have completed for 30 days is intentional retention; UUID/hash/status tombstones remain for duplicate prevention.

## Resolve one specific inquiry

1. Record a private incident reference, operator, UTC time, exact submission UUID and the channel being investigated. Store the evidence and final decision in a restricted incident record outside source control. Do not paste the inquiry or credentials into build logs or public tickets.
2. Check `lease_until`. Let an active 120-second worker lease finish/expire; do not edit around it. The resolution script also rejects an active lease or concurrent row lock.
3. For Notion, query the existing data source by exact `Deal ID = HM-WEB-{UUID}`. One matching opportunity with the expected inquiry can supply a verified page ID. Multiple matches require human comparison. Zero matches after a timeout do not prove that the create failed. Leave that channel in manual review until evidence supports a decision. Do not create a replacement automatically.
4. For email, inspect Resend's original request with key `hm-web-{UUID}`, recipient and timing. Only a confirmed accepted request supplies a verified provider ID. A 23-hour retry hold must not be defeated by resetting time, changing the frozen envelope or generating a new key. A bounce is separate from API acceptance. Any new send requires a distinct human decision.
5. Open [intake-manual-resolution.sql](intake-manual-resolution.sql) in the authenticated SQL editor. Replace the default `null` UUID and incident reference. Set only verified IDs for the channel(s) confirmed, or set the unresolved channel's `hold_*` value to `true`. All defaults intentionally abort. Keep the script private while it contains real incident identifiers.
6. Run the entire transaction. It locks only the exact row, creates a temporary operator lease, uses the existing `hm_intake_save` and `hm_intake_release` functions, and preserves identity, payload and email timestamps. It cannot create a Notion page or send an email. On an error, the transaction rolls back; reread before deciding the next action.
7. Rerun the metadata queries, confirm the intended one/two channel changes, no active lease, and the correct `completed_at` only when both channels are confirmed. Record the result and evidence in the incident record. The normal worker can continue the independently pending channel after release.

The script does not reopen terminal channels, replace an already verified provider ID, or convert a hold back to pending. A future retry/re-send feature requires a separate reviewed design; it is not hidden inside this runbook. Retain the evidence that justified a verified resolution because the database currently has no separate immutable operator audit table.

## Controlled worker invocation for an approved test

`POST /api/intake` returns a durable receipt and does not process providers itself. Review previews do not have the production cron schedule. A test must therefore explicitly invoke the deployed preview worker, then separately prove actual production scheduling at launch.

The command below can process **one due inquiry**. It is not a read-only health check, and its queue must contain only the expected test or already authorized production work. First record the exact approved deployment, the expected UUID and the queue's current contents. Confirm the matching branch-scoped credentials and exact allowed origin. Do not run an unbounded loop.

Use a current, signed-in Vercel CLI. Its `curl` command provides authenticated deployment-protection handling. Keep the cron header in the subprocess's stdin, rather than command arguments or shell history. Replace the three local placeholders; the target origin must also exist in that private configuration's `INTAKE_ALLOWED_ORIGINS`.

```sh
node - /ABSOLUTE/PRIVATE/intake-config.json https://APPROVED-DEPLOYMENT.vercel.app /ABSOLUTE/PATH/vercel/dist/vc.js <<'NODE'
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const target = new URL(process.argv[3]);
const allowed = (config.INTAKE_ALLOWED_ORIGINS || '').split(',').map(x => x.trim());
if (target.protocol !== 'https:' || target.origin !== target.href.replace(/\/$/, '') ||
    !allowed.includes(target.origin) || !/^[A-Za-z0-9_-]{32,256}$/.test(config.CRON_SECRET || '')) {
  throw new Error('Approved origin and valid private cron credential required');
}
const input = `header = "Authorization: Bearer ${config.CRON_SECRET}"\nsilent\nshow-error\nmax-time = 70\n`;
const result = spawnSync(process.execPath, [process.argv[4], 'curl', '/api/intake-retry',
  '--deployment', target.origin, '--', '--config', '-'],
  { input, encoding: 'utf8', timeout: 90000, maxBuffer: 65536 });
let body;
try { body = JSON.parse(result.stdout || ''); }
catch { throw new Error('Worker response unavailable; inspect private deployment logs, do not blindly retry'); }
console.log(JSON.stringify({ exitCode: result.status, ok: body.ok, processed: body.processed,
  result: body.result, health: body.health, error: body.error }));
NODE
```

Never add `--debug`, `--verbose` or `--trace` to a credential-bearing test. Read the private outbox and provider evidence after an uncertain command result before another action. An empty queue smoke check does not prove Notion Insert permission or actual email delivery.

## Alerts and accountable handoff

**Current status: staged, not configured or delivery-verified.** Returning 503 or writing a count-only log does not notify an operator by itself. Do not describe alerting as live until the selected channel receives a controlled test and the operator acknowledges it.

Primary operator: **Mohammed**. Authorized private alert destination: **contact@hammadmedia.com**. Backup: **unassigned**; no round-the-clock response commitment is implied. The source-only minimum is specified in [the watchdog setup and activation checklist](intake-watchdog-setup.md). It uses an independent Supabase schedule, a persisted production-worker completion heartbeat and deduplicated count-only Resend notices. It is default-off and has not been deployed or delivery-verified.

Before intake activation, the release record must name the primary operator, backup (or explicitly unassigned coverage), alert destination, response expectation and escalation path, and include evidence for:

- any manual-review item or unresolved item older than 15 minutes;
- intake/worker/database failures and rejected provider credentials;
- a missing successful scheduled-worker heartbeat, including the case where no function log exists;
- Resend delivery failures/bounces, distinct from acceptance;
- notification delivery and recovery/clear notification behavior.

Choose the existing platform/account notification capabilities where suitable; do not assume a Vercel or Supabase paid plan already configured these alerts. Failure-only log alerts cannot detect every missed cron invocation. Any heartbeat implementation, external monitor or notification integration remains staged until its configuration and delivery are verified. Notifications contain counts/incident references and a private console link, never submitted content, credentials or raw provider responses.

## References

- [Rollback and restore procedure](intake-rollback-restore.md)
- [Vercel cron management and best-effort delivery](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel authenticated curl](https://vercel.com/docs/cli/curl)
- [Resend idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
