# Partnership measurement and QA

Prepared October 12, 2026, Eastern time. This document defines website measurement and report configuration. It does not certify that a GA report or filter was saved, nor that a deployment completed. Use the release evidence for those outcomes.

## Distinct outcomes

| Metric | Source and definition | What it proves |
| --- | --- | --- |
| Confirmed website submissions | `generate_lead` from a successful `/api/intake` response whose submission reference matches the submitted immutable envelope | The intake service acknowledged receipt. Not CRM completion, inbox delivery, qualification, or revenue. |
| WhatsApp intent | `whatsapp_contact_click`, derived from `contact_click` with `contact_method` equal to `whatsapp` | A visitor clicked a WhatsApp contact link. Not a message or a received inquiry. |
| Email intent | `contact_click` with `contact_method` equal to `email` | An email link/draft opened. Not a sent or delivered message. |
| Confirmation views | `inquiry_confirmation_view` | A recent same-tab receipt was displayed. Not another submission. |
| Form attempts/errors | `partnership_form_attempt` / `partnership_form_error` | Client actions or observed failure categories. Retries can produce multiple attempts. |
| CRM receipt and email delivery | Intake processing records, Notion record, provider delivery evidence and inbox readback | Independently evidenced downstream delivery, regardless of browser consent or GA collection. |

Keep confirmed submissions and WhatsApp intent in separate cards and separate report tabs. A combined GA key-event count is not a lead count. Do not assign money or mark a WhatsApp click as a confirmed submission. Do not derive `generate_lead` from a thank-you URL, automatic `form_submit`, or a confirmation view.

The browser sends only controlled categorical parameters. It never sends brand/person names, email, message, product URL, proposed commercial terms or intake reference to GA. This release does not upload offline CRM conversions or join private inquiry identities to GA.

## Exclude QA before the first page view

1. Open `https://hammadmedia.com/?hm_qa=1`, or `https://hammadmedia.com/zh/?hm_qa=1`, before starting a production check. The exact query value `1` activates exclusion even with saved Analytics consent.
2. The tab saves only `hm-analytics-qa-v1=1` in sessionStorage. The tracker stays disabled throughout same-tab navigation. The successful receipt redirect also carries `hm_qa=1`, including when storage is restricted.
3. Label an authorized real integration submission's brand `TEST ONLY - <purpose>`. This adds a fallback that disables GA before the submission attempt and receipt events. It cannot retract a page view or form interaction already sent before the label was entered. Start from the QA URL for complete exclusion.
4. Verify that neither the Google tracker nor GA collection requests occur, while the real intake POST, receipt identity and redirect still work. Preserve ordinary duplicate protection. Do not submit a real inquiry merely to test Analytics when a mocked POST is sufficient.
5. Keep authorized test CRM records out of opportunity reporting using the existing Noise / No chase disposition. Do not delete evidence just to improve counts.
6. End QA by closing the test tab. Analytics consent is a separate preference and is not withdrawn by the QA marker. A browser may preserve tab state when restoring a closed tab; use a fresh tab and confirm the QA marker is absent for subsequent normal browsing.

The website's QA gate excludes tracking at source. It does not depend on GA's developer/internal filters. Activate those filters only after verifying their matching rules against the actual developer/internal traffic sent by this implementation. A filter in Testing mode does not exclude processed traffic, and exclusion cannot repair historical data.

## Recommended GA reports

Create a saved funnel exploration named **Partnership submission funnel** with a consistent date range:

1. Website visit: `page_view` on the production homepage or Chinese homepage.
2. Form start: `partnership_form_start`.
3. Submission attempt: `partnership_form_attempt`.
4. Confirmed receipt: `generate_lead`.

Use an open funnel for visitors who accept consent after arriving. Save a closed-funnel view separately when studying only measured users with all earlier steps. Break down by source/medium, device category and `site_language`. Compare error categories in a separate table using `form_error_reason`; errors are not a required successful-funnel step. Repeated events, consent timing, blockers and browser restrictions mean aggregate event totals cannot establish an exact person-level abandonment rate.

Create separate saved tabs/cards for **Confirmed submissions**, **WhatsApp intent**, **Form errors**, and **Package interest**. Use the event-specific filter for each card. Show session source/medium alongside session and user counts; keep package interest distinct from a selected package submitted with a received inquiry. Do not treat the global Key events card as the dashboard's lead total.

The report can use already registered event-scoped dimensions. Check existing registrations before adding another dimension for the same parameter. Custom dimension registration is prospective; it does not backfill older events. Annotate the QA-exclusion release date when comparing periods.

## Public campaign attribution

Use the exact public source, medium, campaign and placement labels in [the campaign registry](controlled-campaign-links.md). New placement labels must be added to both attribution and Analytics allowlists with tests. The registry contains prepared links, not evidence of published bios, emailed materials or distributed QR codes. No individual brand, deal, visitor identifier or inquiry reference belongs in a UTM.

Use tagged links for TikTok profiles, Instagram bio, LinkedIn profile, brand kits, agency outreach, email signatures and printed QR placements. Compare exact source/medium rather than assuming a default channel classification. The latest valid campaign set replaces earlier campaign fields as a group in the tab; first landing/referrer context remains controlled. Do not interpret tab-local attribution as a persistent person or cross-device identity.

## Qualified partnership reporting remains in the CRM

For an operational dashboard, group canonical records into **received**, **reviewed**, **qualified**, and **won** only when the CRM's actual fields and approved process support those states. Exclude labeled tests and Noise / No chase records. Treat a receipt as received; preserve owner review as the boundary for qualification and actual agreed/won evidence as the boundary for won business. A new Stage / Status is not permission to change an existing opportunity or assign a value.

Report CRM counts beside GA counts with their separate denominators. GA covers consenting measured browsers; the CRM intake ledger covers received inquiries. A mismatch is not by itself proof of lost submissions. This release supplies no automated GA qualification/won feed, CRM identity matching, revenue attribution or complete lead dashboard.
