# Controlled public campaign links

Only the exact lowercase values below are accepted by the browser's campaign attribution and Analytics helpers. Unknown values are dropped, even when they look like harmless alphanumeric labels. Repeated instances of the same UTM parameter are ambiguous and are dropped. No campaign ID (`utm_id`), search term, click ID, visitor identifier or arbitrary query parameter is accepted.

| Parameter | Approved public values |
|---|---|
| `utm_source` | `tiktok`, `brand_kit`, `agency_outreach`, `instagram`, `linkedin`, `email_signature`, `qr_code` |
| `utm_medium` | `organic_social`, `referral`, `email` |
| `utm_campaign` | `paid_partnerships` |
| `utm_content` | `drew_review_bio`, `drew_review1_bio`, `en_overview`, `zh_overview`, `agency_overview`, `instagram_bio`, `linkedin_profile`, `email_signature`, `printed_qr` |

These values describe public Hammad Media placements, including its own published creator accounts. They must never encode a visitor's identity, individual brand/deal, email, phone, receipt UUID, private inquiry or product submission. Do not replace this registry with a syntax-only regular expression.

## Ready-to-copy placement registry

These are prepared links. Registration makes their attribution measurable; it does not publish them, change a bio, edit a PDF, or prove a campaign has launched. As of October 12, 2026 Eastern, no placement launch or owner assignment was verified by this change. Owner and dates below must be recorded when someone actually publishes or retires the placement.

| Placement | Owner | Publication status | Start date | Retirement date |
|---|---|---|---|---|
| Primary TikTok creator bio | Unassigned | Publication not verified | Not recorded | Not recorded |
| Second TikTok creator bio | Unassigned | Publication not verified | Not recorded | Not recorded |
| English brand-kit PDF | Unassigned | Publication not verified | Not recorded | Not recorded |
| Chinese brand-kit PDF | Unassigned | Publication not verified | Not recorded | Not recorded |
| Agency outreach email | Unassigned | Publication not verified | Not recorded | Not recorded |
| Instagram bio | Unassigned | Prepared, not published by this change | Not recorded | Not recorded |
| LinkedIn profile | Unassigned | Prepared, not published by this change | Not recorded | Not recorded |
| Email signature | Unassigned | Prepared, not published by this change | Not recorded | Not recorded |
| Printed QR | Unassigned | Prepared, not published by this change | Not recorded | Not recorded |

- Primary TikTok creator bio: `https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio`
- Second TikTok creator bio: `https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review1_bio`
- English brand-kit PDF: `https://hammadmedia.com/?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=en_overview`
- Chinese brand-kit PDF: `https://hammadmedia.com/zh/?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=zh_overview`
- Agency outreach email: `https://hammadmedia.com/?utm_source=agency_outreach&utm_medium=email&utm_campaign=paid_partnerships&utm_content=agency_overview`
- Instagram bio: `https://hammadmedia.com/?utm_source=instagram&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=instagram_bio`
- LinkedIn profile: `https://hammadmedia.com/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=linkedin_profile`
- Email signature: `https://hammadmedia.com/?utm_source=email_signature&utm_medium=email&utm_campaign=paid_partnerships&utm_content=email_signature`
- Printed QR: `https://hammadmedia.com/?utm_source=qr_code&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=printed_qr`

Use the complete link in a placement. Do not add a private brand name, recipient, visitor email, inquiry UUID, or custom campaign ID. A public channel alone does not identify a specific customer. These links can be used for Chinese placements by changing the landing path to `/zh/` while keeping the corresponding approved labels. Record any separate placement in this registry before publishing it.

## Behavior and extension

The redesign stores only registered campaign values in `hm-attribution-v1`, including when reading older saved attribution. The first recognized landing path and external HTTPS referrer origin remain fixed in the tab. The most recent incoming set containing approved labels replaces earlier campaign fields as a group; fields from different campaigns are not merged. An entirely rejected incoming campaign leaves an earlier valid campaign intact. Without storage, only current-page safe attribution survives.

The existing form receives this safe attribution for new inquiry envelopes and email fallback. Already-pending private inquiry envelopes remain frozen for safe same-UUID retries; changing an old envelope's attribution would break the receipt identity contract. Their fields are not sent to GA. The backend remains private and is not a second browser analytics sender.

To extend: record the proposed public placement, owner, URL, start and retirement dates; review it for identity/private-data content; add exact field-specific values to `assets/redesign/analytics.js` and `assets/redesign/attribution.js`; add positive placement and negative identifier tests. Do not publish links or change bios merely because a value is registered.

The September 8 current-design FormSubmit Analytics module retained its then-approved campaign labels in its own tab-scoped store so privacy/hash navigation did not lose them. Historical production network verification is recorded in `../../private/analytics/production-network-2026-09-08T02-50-20-878Z/README.md`. That historical module did not include the redesign's landing/referrer history or intake system. Basic Analytics consent remains required. The registry does not replace the GA Admin review of automatic measurement, user-provided-data settings, custom/modified events, or actual production request verification.

`site_version` is a fixed Analytics design label, not a UTM field: `current_design` for the released design and `partnership_redesign` for the staged redesign. The public creator profile parameter `profile_key` and this version parameter were registered as event-scoped dimensions on September 8, 2026 UTC. The GA-created `whatsapp_contact_click` key event measures contact intent, once per session without a default monetary value; it neither records a sent message nor joins a WhatsApp person to a CRM lead. The full rule and source evidence are in `../../docs/measurement-contract.md`.

Keep exact source/medium in acquisition reports. Google maintains its default channel classifications; the current published source list classifies `tiktok` as social even though the help page gives TikTok as an Organic Video example. Do not change this approved link convention based only on a channel label, or promise the processed default channel without checking the report. Tab-preserved campaign metadata is not a GA session or cross-device identity. [Google channel rules and source list](https://support.google.com/analytics/answer/9756891?hl=en).
