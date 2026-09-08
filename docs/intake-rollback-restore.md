# Intake rollback and database restore

Status: executable operating steps prepared; rehearsal and exact deployment/backup identifiers are release requirements. No rollback, restore, deletion or resend has been performed by writing this document.

## Release record required before activation

Record the exact Vercel project/team, deployment and Git revision, database migration version, effective Node runtime, accepted backup recovery point/time targets, primary/backup operator, cron schedule/destination and verified alert channel. Preserve a private pre-change metadata snapshot and the previous application version.

Prepare an **intake-disabled rollback build that still contains the current compatible `/api/intake-retry` worker and cron route**. The older static website alone is not a complete rollback target for queued work. Vercel states that Instant Rollback leaves active cron schedules unchanged; a remaining schedule may hit a missing or incompatible route after rollback. Do not infer worker health from the schedule's presence.

## Stop new inquiries while draining accepted work

1. Inspect queue health and record counts/oldest pending age using [the read-only operating queries](intake-operations.md). Save the current deployment ID.
2. Set `INTAKE_ENABLED=false` in the affected production or explicitly scoped preview environment and create/promote the reviewed disabled build. Environment edits alone do not change an existing deployment. Keep `INTAKE_PROVISIONED=true`, working provider credentials and the compatible cron worker while the existing queue drains.
3. Verify `GET /api/intake-config` reports `enabled:false` and the browser offers the email alternative. A rejected form/disabled page must not emit a new-lead conversion.
4. Verify the worker route still exists, the cron's actual destination has no redirect, authorization is required, and scheduled invocations continue. Inspect queue counts until every received inquiry is either confirmed in both systems or explicitly held for human resolution. A manual hold is not a delivered inquiry.
5. If the visual site needs rollback, use the prepared build with the worker intact. After any Vercel Instant Rollback, recheck the route, environment compatibility and cron destination; do not assume the old deployment inherited today's settings or schedule.

This procedure stops new intake only. It intentionally preserves the processing of work the website already acknowledged. Removing credentials, switching the database or replacing the worker with a static-only deployment can strand those receipts.

## Full freeze before a database restore or uncertain replay

1. Record the incident and disable new intake as above.
2. Stop scheduled processing in Vercel and deploy a reviewed build with both `INTAKE_ENABLED=false` and `INTAKE_PROVISIONED=false`. The provisioning flag makes the authenticated worker fail closed. Keep credentials stored securely; deleting them is not the freeze mechanism. Disable any explicit/manual worker caller as well.
3. Verify the active deployment actually reports disabled configuration and authenticated worker requests fail closed. Do not expose the cron secret in an address bar. Inspect platform run history for in-flight invocations. A deployment change does not necessarily interrupt already running jobs: let all invocations end, and verify no unexpired 120-second lease remains. Do not forcibly clear a live lease.
4. Preserve the current database backup/snapshot and metadata before replacement. Verify the selected backup belongs to the dedicated intake project and note its cutoff. Restore into an isolated project first where the account's recovery tooling supports it, with no provider-processing worker attached. Avoid restoring over an unrelated app or silently enabling additional paid recovery features.
5. Use the provider's authenticated restore workflow and verify schema, functions, permissions and RLS afterward. Keep the private schema unexposed and anonymous/authenticated access denied. Confirm restored service/API credentials and project URL rather than assuming their values or behavior.

## Reconcile before resuming a restored queue

A backup can predate a receipt or an email-start checkpoint. Notion pages and sent emails do not roll back with Supabase. In particular, a restored row with an empty/older `email_started_at` must not be treated as proof that nothing was sent. The immutable-field trigger prevents ordinary edits but cannot reconstruct state lost by restoring an older backup.

1. Keep all processing frozen. Inventory every unresolved/restored row and compare the backup cutoff with pre-restore evidence and provider histories. Account for receipts newer than the backup; lack of a restored row is not evidence that no inquiry was received.
2. For each affected UUID, query Notion by exact `HM-WEB-{UUID}` and verify the original Resend request, ID, recipient and time. Never replay solely because a restored field is blank or a lookup returned no result. Uncertain cases stay on hold; email beyond the original provider idempotency window requires a human decision, not a reset timer.
3. Apply only verified state/ID repairs with [the manual-resolution script](intake-manual-resolution.sql), or hold the uncertain channel. Preserve original inquiry/hash identity, fixed recipient/envelope, provider IDs and earliest known email attempt time. Do not manufacture a new UUID to bypass duplicate protection.
4. If an acknowledged row/tombstone is missing after restore, preserve its external evidence and recover it through a separately reviewed reconciliation/import procedure. The current manual-resolution script deliberately refuses nonexistent UUIDs and is not a blind restoration importer. Do not turn the normal intake endpoint into an import tool.
5. Verify health and a disposable rehearsal fixture before lifting the freeze. Set `INTAKE_PROVISIONED=true` while leaving `INTAKE_ENABLED=false` in the reviewed deployment, enable the compatible cron, and verify the real route/schedule/authorization. Allow only reconciled work to drain; keep unknown outcomes explicitly manual.
6. Re-enable new intake only after the incident owner accepts the reconciled state and any gaps, the proper production release is authorized, and monitoring is operational. Record the exact final deployment and recovery evidence. A successful database restore is not proof that external effects were reconciled.

## Rehearsal acceptance

Use an isolated fixture and mocked provider responses; no brand outreach or live email is required to rehearse the local procedures. Verify:

- disabling new intake preserves worker processing;
- the selected rollback build retains the worker route;
- both flags false prevent processing even if a schedule remains;
- active leases reject manual edits;
- an old email checkpoint cannot be reset and uncertain outcomes stay held;
- verified IDs resolve only the selected UUID/channel;
- post-restore rows never resume automatically before reconciliation;
- alert delivery and missing-heartbeat detection are verified separately before launch.

[Vercel cron rollback and delivery behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Supabase backup and restore workflow](https://supabase.com/docs/guides/platform/backups).
