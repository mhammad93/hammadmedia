# Website intake: setup and operations

This is local, reviewable code. Writing these files has not provisioned a service, changed production, created a CRM record, or sent an email. The existing production FormSubmit form is unaffected until the reviewed website deployment is promoted.

The website functions can run in the existing Vercel project and Pro team. Supabase, Resend and Cloudflare are separate services with their own quotas and any applicable charges; a Vercel integration listing does not prove that a project or credentials exist.

## Intended flow

1. A visitor chooses a paid partnership and explicitly acknowledges that partnerships start at $5,000. The browser submits to the website's own `/api/intake` endpoint.
2. The server validates fields, allowed origin and a Turnstile challenge bound to the submission UUID. A private Supabase operational outbox atomically stores the inquiry and receipt. Only then does the browser receive `202 received`.
3. A protected Vercel cron claims one inquiry each minute. It creates one new opportunity in the **existing Notion Lead Ledger** and independently asks Resend to send the inquiry to **contact@hammadmedia.com**. The visitor's email is Reply-To. There is no visitor autoresponse, automated follow-up, qualification decision, agreed fee or commitment.
4. Partial failures retry with backoff. Uncertain Notion creates are reconciled by exact Deal ID and held for human review when necessary. They are never blindly created again. Email retries reuse the frozen request and key within a conservative 23-hour window.

Notion is the sole business CRM. Supabase stores delivery state and a temporary copy needed to recover failed delivery; it is not a second pipeline.

## Provision before enabling

Keep `INTAKE_ENABLED=false` and `INTAKE_PROVISIONED=false` while doing the following. Use `.env.example` as the name reference, and put secret values only in the appropriate Vercel server environment settings. Do not paste secrets into chat, files intended for publication, command arguments or logs. No secret is needed by the static build.

### 1. Dedicated Supabase outbox

- Select or create a **dedicated Hammad Media website intake project** in the correct organization after reviewing its region and plan. Do not reuse an unrelated application's data or assume an installed team integration created a project.
- Apply `db/intake-schema.sql` once through the project's authenticated SQL editor or an approved migration workflow. It creates only the `hm_intake_private` schema and namespaced `public.hm_intake_*` RPC functions. Reapplying the script is supported for the same schema version; future schema changes require reviewed migrations.
- Leave `hm_intake_private` out of Data API exposed schemas. The `public` RPC schema must be exposed. Table RLS is enabled with no anonymous/user policies. Schema/table access and every RPC's default `PUBLIC`, `anon` and `authenticated` privileges are revoked. Only the `service_role` can use the RPCs. Explicit grants are included for the new Supabase Data API defaults.
- Set `INTAKE_SUPABASE_URL` to the project's `https://…supabase.co` origin. Create a dedicated server secret and set `INTAKE_SUPABASE_SECRET_KEY` to its `sb_secret_…` value. Modern keys go in the `apikey` header, not a Bearer JWT. The implementation also accepts a legacy service-role JWT through `INTAKE_SUPABASE_SERVICE_ROLE_KEY`. Never use a publishable/anon key here.
- Check Security Advisor, backups, access membership and operational notifications for this dedicated project. The service credential bypasses RLS by design and must never be shipped to a browser.

### 2. Existing Notion CRM

- Create a dedicated internal Notion connection for website intake with **Read content + Insert content**. It does not require Update content or user profile access. Share only the existing Lead Ledger with that connection.
- Set `INTAKE_NOTION_TOKEN` in Vercel. Do not repurpose the CRM dashboard's existing token or change its access controls.
- Canonical database: `59d06373-8480-4f6e-83bb-1e0e2c817758`. Canonical data source: `44e3142d-8357-4e5c-8cbb-8c3303a3b062`, fixed in server code. The implementation pins the supported `Notion-Version: 2025-09-03` data-source API rather than depending on a moving default.
- Verify the live schema still matches this mapping before setting the provisioning acknowledgement. Do not rename existing properties or create select options automatically during setup.

| Notion property | Type | Website intake value |
|---|---|---|
| Name | title | Brand — Website inquiry |
| Company | rich_text | Submitted brand |
| Contact name | rich_text | Optional contact name |
| Email | email | Submitted email |
| Deal ID | rich_text | `HM-WEB-{submission UUID}` |
| Stage | select | `New` |
| Status | select | `new` |
| Disposition | select | `Active` |
| Sticky Bot | select | `Nour` |
| Who owes | select | `HM` |
| Follow-up policy | select | `Review first` |
| Channel origin | select | `other` |
| Notes | rich_text | Complete inquiry, UTC receipt time and website attribution |

Package, proposed commission and timing are inquiry details in Notes, not accepted commercial terms. No existing opportunities are updated. Separate submissions from the same email create separate opportunities; only retries of the same immutable submission ID are deduplicated. The established Stage/Status roles, sticky ownership and review-before-outreach rules remain in place.

### 3. Resend to the existing contact inbox

- Create/select the correct Resend account and review its plan. Verify a sending subdomain such as `notifications.hammadmedia.com` using Resend's current DNS instructions.
- Preserve the existing inbox's root-domain MX records and mail routing. A sending subdomain does not require migrating `contact@hammadmedia.com` to Resend. Add only the records required for the selected sending subdomain; inspect SPF/DKIM/DMARC alignment before enabling.
- Set `RESEND_API_KEY` to a key restricted to sending from that verified domain when supported. Set `RESEND_FROM_EMAIL=intake@notifications.hammadmedia.com` (or another verified sender under hammadmedia.com).
- Recipient is fixed in server code as `contact@hammadmedia.com`; visitors cannot supply To, Cc, Bcc, From or arbitrary email headers. All email content is plain text. Reply-To is the validated visitor email. A reply is a human action in the inbox; no reply is sent automatically.
- Confirm Resend account/domain readiness. A provider `id` means **accepted**, not delivered. This implementation deliberately has no unsigned webhook and makes no inbox-delivery claim. Use Resend's delivery/bounce events and account alerts operationally. A signed webhook can be added separately if automatic delivery-state tracking is needed.

### 4. Turnstile and origin controls

- Create a managed Turnstile widget restricted to `hammadmedia.com` and `www.hammadmedia.com`. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel.
- Set `INTAKE_ALLOWED_ORIGINS=https://hammadmedia.com,https://www.hammadmedia.com`. Origins are exact HTTPS origins with no trailing slash, wildcard or path. Do not add arbitrary preview domains to production or allow cross-site submissions.
- The browser renders Turnstile with `action: "brand_inquiry"` and `cData: submission_id`. The server checks success, hostname, action, UUID binding and challenge age. Tokens are single-use and expire after five minutes. Reset the challenge for each new attempt; retrying an already received identical UUID can return its receipt without reusing a challenge.
- Generate a cryptographically random `INTAKE_HASH_SECRET` of at least 32 characters for HMAC IP/email rate identifiers. Keep it stable; rotating it also resets those identifiers' rate buckets.
- Atomic limits: 5 new submissions per IP per rolling hour, 5 per email per rolling day, 200 overall per rolling day. Same-ID retries do not consume another slot. Only Vercel's normalized client IP headers are trusted in production. The honeypot must remain empty.

### 5. Vercel functions, cron and activation

- Use Node **22.x** (declared in package.json), existing build command `node build.js`, output directory `dist`, framework `null`. The root `/api/*.js` files are Vercel Node functions and are not copied into the static site.
- Merge these entries into the existing `vercel.json` without discarding its headers or redirects:

```json
{
  "functions": { "api/*.js": { "maxDuration": 60 } },
  "crons": [{ "path": "/api/intake-retry", "schedule": "* * * * *" }]
}
```

- Generate a **different** random `CRON_SECRET` of at least 32 characters. Vercel sends it as `Authorization: Bearer …` for cron invocations. The route rejects other methods and missing or incorrect authorization. Do not put it in a URL. Cron runs on production deployments; preview deployment alone does not prove retries are scheduled.
- Configure monitoring for function/cron failures and inspect the authenticated queue-health result. Vercel cron does not provide a durable retry guarantee itself; the database holds work until a later successful invocation. An overdue queue (15 minutes) or any manual-review item causes the authenticated cron response to return 503 and log only counts.
- Complete the checks below, then set `INTAKE_PROVISIONED=true`. This is an explicit acknowledgement that live connection/schema/domain checks have succeeded, not an automatic inference from nonempty environment variables.
- Enable `INTAKE_ENABLED=true` only in the approved environment and redeploy. Keep production credentials out of public/untrusted preview deployments. Use a separate test project, test Notion ledger via an isolated test harness and test mailbox for any later end-to-end staging work; this production code intentionally fixes the real Notion destination and recipient.
- When disabled or incomplete, `/api/intake-config` returns `enabled:false` and no site key. The frontend must present a working email action instead of an unusable submit button. A failed submission must never display the received screen.

## Frontend contract

`GET /api/intake-config` returns `{ "enabled": false, "turnstileSiteKey": null, "action": "brand_inquiry" }`, with `no-store`. Enabled responses include only the public site key. Never request a service credential from the browser.

`POST /api/intake` accepts `application/json`, at most 16 KB. Unknown fields are rejected. Required fields:

- `submission_id`: browser-generated UUID v4. Keep the same ID and identical inquiry/attribution for a retry after an uncertain response; persist the pending envelope in session storage. Generate a new ID after a material edit or intentional new inquiry.
- `brand`: 1–160 characters; `email`: validated email; `product`: product name or link, 1–1,000 characters.
- `engagement`: exactly `5 videos`, `10 videos`, `15 videos`, `30 videos`, `Exclusivity`, or `Help me choose`.
- `paid_partnership_ack`: boolean `true`, from a deliberate visible checkbox.
- `turnstile_token`: current challenge token, max 2,048 characters. `website`: empty honeypot.

Optional fields: `name` (120), `category` (160), `commission` (120), `timing` (200), `exact_category` (160, **required for Exclusivity**), `shop_link` (HTTPS URL, 1,000), `message` (4,000, multiline), `locale` (`en` default or `zh`). The server never fetches visitor-supplied links.

Optional `attribution`: `page_path`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (each 200), and `referrer` (HTTPS URL, 1,000). Referrer query/fragment are removed on the server. Capture attribution once for the pending inquiry so it does not change on a retry. Do not add advertising cookies or tracking identifiers without a separate decision.

Response semantics:

| HTTP | Body / meaning | Browser behavior |
|---|---|---|
| 202 | `ok:true, status:"received", submission_id` | Inquiry is durably received. Clear pending draft and show received confirmation. Do not say email delivered. |
| 400 | Validation/challenge error, optionally `fields` | Keep entered details; point to fields or reset challenge. |
| 409 | `submission_conflict` | The ID already belongs to different content. Generate a new ID for the edited inquiry and new challenge; do not silently change existing record. |
| 429 | `rate_limited` | Keep draft, explain to try later, offer contact email. |
| 503 / network interruption | Not confirmed received | Keep the exact pending envelope and UUID; allow retry and email alternative. A lost database response may still have committed the receipt. |

The endpoint accepts no cookies or browser authentication. Origin checks, strict JSON, Turnstile and durable limits protect this intentionally public inquiry channel. Origin checks alone are not proof of a human.

## Verification before production

Already runnable locally without credentials, network submissions or email:

```sh
npm test
INTAKE_TEST_POSTGRES=1 npm run test:intake:postgres
npm run build
```

The PostgreSQL test requires Docker and the pinned Supabase Postgres image `public.ecr.aws/supabase/postgres:17.6.1.167`. It starts an isolated disposable container with no network, host ports or mounts, checks real privileges/concurrency/leases/retention, and removes the container. The normal unit suite skips this opt-in test. Provider tests replace network adapters; they never contact Notion, Resend or Turnstile.

Before activation, read-only live checks should verify: correct Supabase project; expected RPC functions; service-role health RPC succeeds; anon/authenticated lack execution and table/schema access; Notion data-source access and exact property names/types/options; Resend domain verified and send permissions; Turnstile hostname restrictions; Vercel environment scope, cron definition and Node version. Confirm the disabled frontend's email fallback and browser field/error behavior.

A real end-to-end production test creates a real CRM opportunity and emails the contact inbox. Perform it only as an explicit, identified test after that action is authorized, then verify the durable receipt, exact one Deal ID, provider accepted ID and actual inbox arrival independently. Do not silently run it as a page check.

## Recovery and ongoing operations

Use [the executable operations and manual-resolution runbook](intake-operations.md) and [the rollback/restore procedure](intake-rollback-restore.md). Alerting is staged until a real notification channel and missing-heartbeat detection are configured and delivery-verified; a 503 response or count-only log is not a notification by itself.

The authenticated cron response includes counts only: pending, manual and overdue. No public endpoint lists leads, delivery outcomes or private queue contents. The database's operational view can be checked by an authorized operator with this narrow query:

```sql
select id, created_at, notion_state, notion_page_id, notion_error,
       email_state, email_id, email_error, attempts, next_attempt_at
from hm_intake_private.submissions
where notion_state <> 'synced' or email_state <> 'accepted'
order by created_at;
```

- **Notion uncertain/manual:** query the canonical data source by exact `Deal ID = HM-WEB-{UUID}`. One match can be reconciled; more than one requires human comparison. Zero matches after a timeout never authorize a blind automated create. Check provider/Notion evidence and the immutable original inquiry. A human must decide whether one new record is warranted. Record the verified Notion page ID and resolution against that same outbox row; do not merge by email or overwrite another opportunity. A known 429 rejection is safe to retry; ambiguous network/5xx outcomes are not.
- **Email retry/manual:** retain the frozen email payload and key `hm-web-{UUID}`. Provider timeouts and 5xx responses retry inside 23 hours. At or after that cutoff, check Resend for the original request before any human-authorized resend. Do not reset `email_started_at`, mutate the envelope or generate a new automatic key to get around the hold. Store the verified provider email ID if accepted. Investigate bounces/delivery failures in Resend separately; `accepted` is not `delivered`.
- **Database outage:** no positive receipt is returned unless storage confirms it. If acceptance committed but its response was lost, retrying the same content/UUID finds the original receipt. In-flight worker markers and 120-second leases survive function termination. An expired `creating` marker triggers reconciliation, not a new create.
- **Disable new intake:** set `INTAKE_ENABLED=false` and redeploy. Keep provisioning/credentials and a compatible worker/cron route working while existing inquiries drain. Use the prepared intake-disabled rollback build, not an older static-only deployment that lacks the worker. Vercel Instant Rollback does not update active cron schedules; verify the actual destination and route after rollback. Freeze processing before any database restore, then reconcile external Notion/email outcomes before resuming.
- **Retention:** after both Notion sync and email acceptance are complete for 30 days, cron removes the stored inquiry/email envelope and hashed rate identifiers. Minimal UUID/hash/status tombstones remain to prevent old retries from duplicating records. Unresolved inquiries are retained for human review rather than silently deleted; review these regularly and use the business retention policy for final resolution. Review service backups and logs separately.

The code logs no submitted fields, tokens, headers, IP addresses or raw provider errors. Avoid adding those to Vercel logs or monitoring. The form and privacy notice should accurately describe processing by Hammad Media, Notion, Supabase, Cloudflare and Resend.

## Current primary references

- [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [cron management and CRON_SECRET](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [normalized client IP request headers](https://vercel.com/docs/headers/request-headers).
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api), [explicit grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [24-hour idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [domain verification](https://resend.com/docs/dashboard/domains/introduction).
- [Cloudflare Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation).
- [Notion's official 2025-09-03 API collection](https://www.postman.com/notionhq/notion-s-api-workspace/collection/52041987-03f70d8f-b6e5-4306-805c-f95f7cdf05b9/notion-api-2025-09-03).

Implementation references were checked against the installed Vercel email and Supabase skills, current primary documentation and Context7. Setup facts about the user's service accounts must be verified in those accounts; code and documentation are not evidence of live provisioning.
