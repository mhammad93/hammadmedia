# Intake watchdog — staged, not activated

Primary operator: **Mohammed**. Authorized private destination: **contact@hammadmedia.com**. Backup: **unassigned**. No 24-hour staffing or response-time commitment is implied. This is a Phase 5 intake reliability gate; Notion remains the business CRM.

Staging readback on September 8, 2026: the additive migration `20260908024530` is applied and the exact reviewed Edge Function is deployed as version 1. Both private tables have RLS; all six RPCs deny client roles. The database enable flag is false, its activation/worker/watchdog timestamps are null, and there are zero notices. No Supabase Cron table/job exists. The function remains disabled. A separate Resend Sending-access key restricted to notifications.hammadmedia.com and all six Edge secrets were provisioned and their UI digests matched the private configuration. The September 8 04:10 UTC runtime check returned 401 for absent/wrong credentials, 405 for GET, and 503 watchdog_disabled for an authenticated POST, with unchanged private health. Production heartbeat is not yet enabled. The same-session Pro usage and spend-cap readback is recorded below. Retain the private staging record before continuing; do not repeat first-install steps that are already complete.

The chosen mechanism uses the existing dedicated Supabase Pro project and Resend account; no additional project, subscription or monitoring account is part of this procedure. A five-minute cadence adds about **8,640 Edge Function invocations per 30 days** (0.432% of the published 2 million Pro organization allowance), before tests or extra invocations. Failed/authentication-rejected invocations also count. Overage is $2 per additional million, rounded up by package; the organization's other usage shares that allowance. September 8 provider readback: spend cap enabled; 2 of 2,000,000 Edge invocations displayed before subsequent tests, with dashboard lag up to one hour. The Sep 8–Oct 8 cycle showed a $25 current invoice and $27.22 projected invoice. Those are provider estimates at capture time, not a future cost guarantee. [Supabase invocation pricing](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations).

The heartbeat adds up to 43,200 small database writes per 30 days at the existing one-minute worker cadence. Idle watchdog ticks make three small RPCs (25,920 per 30 days), plus existing database compute, storage and network usage. A healthy idle system sends no alert email; an accepted unresolved incident can send roughly one hourly reminder, plus its opening/updates/recovery. Resend readback showed the existing Free transactional allowance at 2/3,000 monthly and 2/100 daily; paid overage was disabled. Alert emails use that shared allowance. Vercel's existing scheduled worker continues to consume its team's function usage. These are workload estimates, not a promise of zero marginal charges. Do not buy an add-on, disable a spend cap, create another project or change a plan as part of activation.

Local source verification on September 8, 2026: **94 tests passed, none skipped**, including actual isolated PostgreSQL tests. The controlled preview inquiry separately proved one Notion record, actual delivery through contact@hammadmedia.com, and no duplicate after replaying the exact receipt. Its private release evidence is retained by the operator. This establishes the preview inquiry path; it does not establish production scheduling or operations-alert delivery.

## What runs where

1. The existing Vercel worker continues every minute. After claim, any provider work/release, prune and health inspection complete, it records a database-clock heartbeat. Empty cycles count. A cycle that returns 503 because a queue needs attention also counts as completed. A thrown storage/worker failure does not record completion.
2. Independent Supabase Cron invokes the protected `intake-watchdog` Edge Function every five minutes. The watchdog reads health and the last completed worker time. It never invokes the Vercel worker, changes an inquiry, creates a Notion opportunity or resends an inquiry email.
3. A private operations outbox stores one aggregate incident and count-only notices. A stable notification UUID supplies the Resend idempotency key; the sender, recipient, subject and text are frozen before the first send. The monitor uses a separate send-only, domain-scoped Resend key.

Vercel documents best-effort delivery: missed invocations can produce no runtime log, and failed cron requests are not retried. Error logs alone cannot detect this case. Its anomaly alerts require Observability Plus and do not replace this check. [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Vercel Alerts](https://vercel.com/docs/alerts).

Supabase's scheduler supports SQL/HTTP jobs, records scheduler runs and can invoke an Edge Function through `pg_net`. A successful SQL job only proves that the HTTP request was queued; verify the HTTP result and the completed watchdog timestamp. [Supabase Cron](https://supabase.com/docs/guides/cron), [scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [asynchronous HTTP results](https://supabase.com/docs/guides/database/extensions/pg_net).

## Alert contract

| Condition | Meaning |
| --- | --- |
| Manual review count > 0 | At least one inquiry channel needs a human decision. |
| Overdue count > 0 | At least one independently pending channel belongs to an inquiry older than 15 minutes. |
| No completed worker cycle for > 5 minutes | Includes an empty queue and a worker invocation that never produced a function log. A five-minute grace begins at monitor activation. |

The five-minute polling cadence normally detects a missing cycle after roughly 5–10 minutes and an unresolved item after roughly 15–20 minutes. These are design thresholds, not delivery or response guarantees. Queue counts overlap and must not be summed.

One notice opens an incident. A change in the set of conditions can produce an update once earlier notices are accepted. Unchanged conditions produce at most an hourly reminder. Recovery queues one notice only after every condition clears **and all earlier notices in that incident are accepted**. In-flight, delayed retry and manual notices hold recovery. An older unresolved automatic notice also holds later automatic notices across recurring incidents, so an old recovery cannot be sent after a new opening. A manual automatic notice requires an evidence-based human resolution; a fresh key must not hide the unresolved outcome. Explicit `kind='test'` route checks are independent of automatic incident ordering and remain clearly labeled. Three notifications at most are attempted per invocation. This orders API requests; actual inbox delivery/order is not guaranteed.

The authenticated response includes `notifications: { pending, manual }`, containing counts only. Any unresolved notification work keeps HTTP health at **503**, even when nothing is due on the current tick. A valid completed evaluation can still advance `last_watchdog_completed_at`: it proves watchdog liveness, not successful alert delivery. Invalid/unavailable aggregate health returns 503 without claiming a completed evaluation. HTTP 200 with `enabled=true` means the observed notification counts were zero; it does not imply the intake incident is resolved or the inbox has received earlier accepted notices. SQL-disabled monitoring reports `enabled=false` separately.

Each notice contains fixed condition labels, counts, an incident UUID, snapshot UTC and a private Supabase console link. It has no inquiry name, email address, product, message, visitor identifier, credentials or raw provider response. A notification `accepted` state means only a valid Resend provider ID was received and recorded. It does not establish delivery to the inbox.

Ambiguous transport results retry the same frozen envelope/key with backoff. After 23 hours the notice moves to manual review; the retry window is not reset. A definite rejection also becomes manual. Do not replay an old uncertain notice with a new key. [Resend's 24-hour idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Files and privilege assumptions

- `db/intake-operations.sql` is an additive setup script after `db/intake-schema.sql`. It creates only private operations state/outbox tables and narrowly named RPCs. Applying it does not enable monitoring, schedule a job or send an email.
- Apply with the authenticated database owner/admin able to create the tables/functions and grant to `service_role`. The existing `hm_intake_private` schema and `public.hm_intake_health()` must already exist. SQL functions use `SECURITY INVOKER`, an empty search path and explicit grants. `PUBLIC`, `anon` and `authenticated` are denied access; RLS is on without client policies. Do not expose the private schema through the Data API.
- The Edge Function uses a modern server-only Supabase secret key. Its `apikey` header is distinct from the watchdog's private invocation header. No service key belongs in a public client.
- The function's platform `verify_jwt` setting is false because its caller uses a private machine credential, not a Supabase user JWT. The handler verifies `x-hm-watchdog-secret` before any data or email request. An absent/wrong secret receives 401; missing setup/default-off settings cannot run work. [Supabase function authentication](https://supabase.com/docs/guides/functions/auth-headers).
- Cron configuration requires an authenticated operator with permission to enable/use `pg_cron`, `pg_net` and Vault. Store the invocation secret in Vault and the matching Edge Function secret store. Do not place secret values in this repository or a committed SQL script. Schedule through `cron.schedule`, not direct writes to `cron.job`. Do not pin extension versions; current Supabase installs the approved default. [Cron privilege change](https://supabase.com/changelog/19298-directly-updating-rows-in-the-cron-job-table-is-no-longer-allowed), [extension version change](https://supabase.com/changelog/extension-version-pinning-ignored).

## Safe pre-launch state — retain until the production release gate

| Setting | Required pre-launch state |
| --- | --- |
| Vercel Production `INTAKE_ENABLED` | `false`; no new public submissions |
| Vercel Production `INTAKE_PROVISIONED` | `false` until the production provider/readiness gate is complete |
| Vercel Production `INTAKE_HEARTBEAT_ENABLED` | Unset or `false` |
| Vercel Preview heartbeat | Unset/false; the code also rejects preview context |
| Edge `HM_INTAKE_WATCHDOG_ENABLED` | Unset or `false` |
| Database `operations.enabled` | `false` |
| Supabase `hm-intake-watchdog` schedule | Absent or explicitly inactive |

These are required settings to verify, not a claim that this document changed any provider. Do not enable the heartbeat merely to pass a test: `createRetryHandler` requires full production readiness before reaching its heartbeat. Before the reviewed worker exists in production, an absent timestamp is expected and must not trigger an alert. A preview's one-off worker invocation is not proof of production scheduling. Keep monitoring disabled while preparing schema and the private function. Preserve current public-site release locks.

## Gated procedure — use the staging readback above to resume

1. **Record the exact release.** Retain the reviewed source commit and hashes of `db/intake-operations.sql`, `supabase/functions/intake-watchdog/index.ts` and `core.mjs`. Record dedicated project `mftfdyuxyoibmioyonft`, current Pro usage/spend-cap state, current production deployment and the safe settings above. Retain the already verified preview inquiry/inbox/replay evidence; do not generate another inquiry just to restate that proof.
2. Run `INTAKE_TEST_POSTGRES=1 npm test` from the website checkout. The reviewed revision passed 94/94. No source test uses live credentials or a real inbox. The Node tests import the actual `core.mjs`; the thin `Deno.serve` wrapper still needs the gated private-runtime check below.
3. **Apply only the operations migration.** Inspect existing migrations, functions and operations table presence in the intended project first. Use the connected Supabase `apply_migration` operation with `project_id=mftfdyuxyoibmioyonft`, name `intake_operations_watchdog`, and the exact reviewed `db/intake-operations.sql` contents. Retain the returned migration identifier; do not invent a timestamped local migration filename. Do not reapply the base inquiry schema or alter canonical Notion. If operations tables already exist or are enabled, stop this first-install procedure and reconcile that state rather than resetting it. Verify the schema/permissions with the read-only checks below and confirm `enabled=false`.
4. **Provision private machine credentials while disabled.** Use the authenticated project's Edge Secrets settings for the exact names/values described below. Generate a new invocation secret; do not reuse the Vercel cron secret. Create a separate send-only Resend key restricted to the already verified sending domain. Keep `HM_INTAKE_WATCHDOG_ENABLED=false`. Edge secrets are project-level server configuration, not browser variables or a claim of per-function isolation. Keep secret values out of CLI arguments, committed files, screenshots and tool output. An approved private environment file outside the checkout with mode 0600 is an alternative for `supabase secrets set --env-file`; remove that temporary file afterward. [Supabase secret management](https://supabase.com/docs/guides/functions/secrets).
5. **Deploy only the private watchdog.** Through the connected `deploy_edge_function` operation, set project `mftfdyuxyoibmioyonft`, name `intake-watchdog`, `entrypoint_path=index.ts`, and upload `index.ts` plus its relative dependency `core.mjs` from the reviewed source. Set `verify_jwt=false` because the reviewed handler implements custom machine authentication before work. Do not upload the repository, private evidence, an environment file or unrelated functions. Record the returned function version and read back its configuration/files. The expected endpoint is `https://mftfdyuxyoibmioyonft.supabase.co/functions/v1/intake-watchdog`. [Supabase function deployment](https://supabase.com/docs/guides/functions/deploy).
6. **Prove the disabled runtime.** With a valid server invocation secret provisioned, POST without it and with a wrong value must return 401; GET must return 405. Correct authentication while the Edge flag is false must return 503 `watchdog_disabled`. Compare operations table counts and timestamps before/after: no notice, email or completed heartbeat should be created. Never log the private header. If configuration is incomplete, 503 `watchdog_unavailable` is a failed setup check, not successful authentication proof.
7. **Wait for the production release gate.** Only after the reviewed production worker/routes and all provider settings are deployed may the owner set full readiness (`INTAKE_PROVISIONED=true`) and `INTAKE_HEARTBEAT_ENABLED=true` for Vercel Production. `INTAKE_ENABLED` is a separate public-launch choice and may remain false while the worker drains already accepted work. Vercel setting changes need the corresponding reviewed deployment. The existing one-minute schedule can process due inquiries, so inspect the queue before deployment; this is not a read-only heartbeat probe. Observe two distinct genuine scheduled completions and fresh `last_worker_completed_at` values. Do not fabricate timestamps, invoke the heartbeat RPC manually as proof, or enable either watchdog gate if readiness/scheduling is still unproven.
8. **Open the controlled monitor window.** Verify the latest worker completion is fresh, inspect existing inquiry health and pending/manual notification work, and record current counts. Unexpected unresolved work needs an explicit operator decision before activation. Set the Edge enable flag true, then set the private singleton `enabled=true, activated_at=now()` once. Keep the Supabase schedule absent/inactive for the one-off test. Do not reset the worker timestamp, inquiry history or existing incidents. Setting secrets can take effect without redeploying, so treat this enable flag as a live change. [Supabase environment behavior](https://supabase.com/docs/guides/functions/secrets).
9. **Send one clearly labeled alert test.** Insert one `kind='test'` notice using the snippet below and retain its returned UUID. Invoke the authenticated watchdog once using a secret-safe request. Confirm that exact notice has a recorded provider ID and that exactly one matching test email appears in the actual contact@hammadmedia.com inbox route. Record inbox message ID, UTC, subject, destination, notification UUID and function version privately. Invoke again only after the prior result is reconciled; confirm no additional matching email/provider request. The notice is an operations fixture and must not create a CRM opportunity, public lead event or inquiry. Never insert a replacement after an uncertain response. A 503 can coexist with a successful test notice if other notification work remains unresolved; inspect exact state, do not infer test failure from status alone.
10. **Schedule after test evidence is complete.** Store the matching invocation secret in Vault under `hm_intake_watchdog_secret` through the authenticated secret interface. Check that exactly one secret with that name exists without selecting its value. Inspect any existing `hm-intake-watchdog` job; reuse an explicitly reviewed existing job or create one, never duplicate it. Enable approved `pg_cron`, `pg_net` and Vault extensions if absent, without version pinning. Use `cron.schedule` and the Vault-name-only snippet below. Record job ID/schedule/active state and the job definition hash; never record a resolved secret.
11. **Verify genuine scheduler execution.** Observe two five-minute intervals with no manual invocation. Record the matching named job's run metadata and two advancing `last_watchdog_completed_at` values. For a controlled `net.http_post` check, retain its returned request ID and inspect only that HTTP response's status/timing; scheduler enqueue success alone is insufficient. Do not dump request headers, Vault decrypted values or all project HTTP responses. A 503 with positive notification counts is an alert-delivery attention state even if scheduler/heartbeat checks succeed. Preserve response metadata promptly: pg_net responses have a documented default six-hour retention. [HTTP response inspection](https://supabase.com/docs/guides/database/extensions/pg_net).
12. Record Mohammed as operator, backup unassigned, sender/destination, migration and function/deployment revisions, enable-state readbacks, usage assumptions, actual inbox test evidence, scheduler evidence and rollback steps. Keep alerting described as staged until all applicable checks are complete. No controlled live failure injection is needed to repeat the isolated failure/concurrency/23-hour tests; any later live interruption needs its own maintenance record and must not strand accepted inquiries.

### Exact Edge secret names

| Name | Required value/source |
| --- | --- |
| `HM_INTAKE_WATCHDOG_ENABLED` | Literal `false` during staging; `true` only at step 8 |
| `HM_INTAKE_WATCHDOG_SECRET` | New random URL-safe 32–256-character secret; same value later stored in Vault |
| `INTAKE_SUPABASE_URL` | `https://mftfdyuxyoibmioyonft.supabase.co` |
| `INTAKE_SUPABASE_SECRET_KEY` | Modern `sb_secret_...` credential for that dedicated project, transferred privately from the approved credential store |
| `RESEND_OPS_API_KEY` | New separate `re_...` send-only key limited to the verified sender domain |
| `RESEND_FROM_EMAIL` | Verified `intake@notifications.hammadmedia.com` |

No Notion token, public analytics credential, visitor data or Vercel cron secret belongs in this function's setup. The Supabase secret is privileged despite the worker's narrow RPC usage; this procedure does not claim the key itself is restricted to these six RPCs.

### Read-only schema and baseline verification

```sql
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='hm_intake_private'
  and c.relname in ('operations','operation_notifications');

select roles.role_name,p.proname,
       has_function_privilege(roles.role_name,p.oid,'EXECUTE') as may_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
cross join (values ('anon'),('authenticated'),('service_role')) roles(role_name)
where n.nspname='public' and p.proname like 'hm_intake_ops_%'
order by p.proname,roles.role_name;

select public.hm_intake_ops_health();
```

Expect both tables with RLS true, all six operations functions denied to `anon` and `authenticated`, allowed to `service_role`, and `enabled=false` before activation. Verify the private schema remains outside the browser Data API's exposed-schema list. Keep all baseline evidence private and record counts/times, not inquiry payloads.

Only after step 8's live prerequisites are satisfied, the exact first enable mutation is:

```sql
update hm_intake_private.operations
set enabled=true,activated_at=now()
where singleton and not enabled
returning enabled,activated_at,last_worker_completed_at;
```

Expect one row. Zero rows requires inspecting the existing state; do not reset it or silently rerun an activation. This statement itself does not send an email, but a correctly authenticated enabled function can send on its next invocation.

The following snippet inserts one **clearly labeled test notice only**. It does not change health or inquiry records. Run only during the controlled authorized alert-delivery test, once; retain the returned UUID and do not rerun after an uncertain result.

```sql
insert into hm_intake_private.operation_notifications(incident_id,kind,snapshot)
values(gen_random_uuid(),'test','{"conditions":0,"pending":0,"manual":0,"overdue":0,"worker_age_seconds":null}')
returning id,incident_id,created_at;
```

Schedule only after the secrets and function have been verified. This contains a Vault **name**, never a secret value:

```sql
select cron.schedule('hm-intake-watchdog','*/5 * * * *',$job$
  select net.http_post(
    url:='https://mftfdyuxyoibmioyonft.supabase.co/functions/v1/intake-watchdog',
    headers:=jsonb_build_object('Content-Type','application/json',
      'x-hm-watchdog-secret',(select decrypted_secret from vault.decrypted_secrets where name='hm_intake_watchdog_secret')),
    body:='{}'::jsonb,
    timeout_milliseconds:=90000
  );
$job$);
```

## Inspection and stopping

```sql
select public.hm_intake_health();
select public.hm_intake_ops_health();
select id,incident_id,kind,created_at,state,provider_id,accepted_at,error_code,attempts,next_attempt_at,lease_until
from hm_intake_private.operation_notifications order by created_at desc limit 50;

select j.jobid,j.jobname,j.schedule,j.active,d.runid,d.status,d.start_time,d.end_time
from cron.job j left join cron.job_run_details d on d.jobid=j.jobid
where j.jobname='hm-intake-watchdog'
order by d.start_time desc nulls last limit 10;
```

If alert delivery enters `manual`, investigate the exact provider request before any further send. That automatic notice holds subsequent automatic incident notices; aggregate HTTP health stays 503 even if the watchdog continues to complete evaluations. Do not reset `send_started_at`, alter a frozen envelope, delete a notice or fabricate an accepted ID. The current source deliberately has no automatic re-open operation; retain evidence of any human resolution. A labeled route test does not resolve this hold.

To stop **new** alerts, disable the named Cron job through `cron.unschedule`, set the Edge enable flag false and set the private monitor `enabled=false`. Let any already-running function finish its bounded work; disabling flags cannot recall a provider request already sent. Do not disable the intake retry worker while accepted inquiries remain unresolved. Removing the production heartbeat flag is optional and should not affect inquiry delivery. Preserve the operations tables for incident evidence.

The owner's named-job stop statements are below. They do not drop tables, discard alert evidence, alter inquiry rows or disable the existing Vercel inquiry worker. Disable the Edge flag through its secret store as well, then verify `enabled=false` and the absence of an active named job.

```sql
select cron.unschedule(jobid)
from cron.job where jobname='hm-intake-watchdog';

update hm_intake_private.operations set enabled=false
where singleton returning enabled,last_watchdog_completed_at;
```

## Explicit remaining limits

- This minimum does not independently monitor the Supabase scheduler, a complete Supabase outage or a combined Vercel/Supabase outage. The stored watchdog timestamp is for operator inspection. No reciprocal scheduler or new monitoring account was added.
- Alerts share Resend and the receiving inbox. A Resend account/domain outage, blocked recipient or unavailable inbox can prevent both inquiry and alert delivery. The separate key isolates a revoked application key, not the provider/account/domain. Backup remains unassigned; an independent channel requires a separate choice, not a claim that this email route covers it.
- Rejected API credentials can surface as pending/manual work or absent completed cycles. The watchdog does not exercise CAPTCHA or submit synthetic inquiries, so an intake-only failure with no accepted queue record is not continuously probed by this design.
- Resend API acceptance stays separate from delivery/bounce evidence. Signed delivery-webhook code is now reviewed and its private migration 20260908041200 is applied with database enablement false. Endpoint deployment, provider subscription and genuine signed evidence remain separate gates; do not claim it is solved by this watchdog. If added, verify signatures on the raw request, deduplicate event IDs, allow out-of-order arrival and avoid automatic inquiry resends. [Resend event meanings](https://resend.com/docs/webhooks/event-types), [signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [delivery/retry behavior](https://resend.com/docs/webhooks/introduction).
- No new user input is required to implement and test this existing-provider route. Naming a second operator or independent destination remains an explicit follow-up, not an inferred authorization.

Operational notices contain no inquiry payload and are retained for review; this addition does not create an automatic retention/pruning policy for incident evidence. Existing 30-day completed-inquiry payload pruning is unchanged.
