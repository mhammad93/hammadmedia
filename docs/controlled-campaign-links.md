# Controlled public campaign links

Only the exact lowercase values below are accepted by the browser's campaign attribution and Analytics helpers. Unknown values are dropped, even when they look like harmless alphanumeric labels. Repeated instances of the same UTM parameter are ambiguous and are dropped. No campaign ID (`utm_id`), search term, click ID, visitor identifier or arbitrary query parameter is accepted.

| Parameter | Approved public values |
|---|---|
| `utm_source` | `tiktok`, `brand_kit`, `agency_outreach` |
| `utm_medium` | `organic_social`, `referral`, `email` |
| `utm_campaign` | `paid_partnerships` |
| `utm_content` | `drew_review_bio`, `drew_review1_bio`, `en_overview`, `zh_overview`, `agency_overview` |

These values describe public Hammad Media placements, including its own published creator accounts. They must never encode a visitor's identity, individual brand/deal, email, phone, receipt UUID, private inquiry or product submission. Do not replace this registry with a syntax-only regular expression.

Prepared link templates, not published campaigns:

- Primary creator bio: `https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio`
- Second creator bio: `https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review1_bio`
- English brand kit: `https://hammadmedia.com/?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=en_overview`
- Chinese brand kit, after that route launches: `https://hammadmedia.com/zh/?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=zh_overview`
- Agency material: `https://hammadmedia.com/?utm_source=agency_outreach&utm_medium=email&utm_campaign=paid_partnerships&utm_content=agency_overview`

## Behavior and extension

The redesign stores only registered campaign values in `hm-attribution-v1`, including when reading older saved attribution. The first recognized landing path and external HTTPS referrer origin remain fixed in the tab. The most recent incoming set containing approved labels replaces earlier campaign fields as a group; fields from different campaigns are not merged. An entirely rejected incoming campaign leaves an earlier valid campaign intact. Without storage, only current-page safe attribution survives.

The existing form receives this safe attribution for new inquiry envelopes and email fallback. Already-pending private inquiry envelopes remain frozen for safe same-UUID retries; changing an old envelope's attribution would break the receipt identity contract. Their fields are not sent to GA. The backend remains private and is not a second browser analytics sender.

To extend: record the proposed public placement, owner, URL, start and retirement dates; review it for identity/private-data content; add exact field-specific values to `assets/redesign/analytics.js` and `assets/redesign/attribution.js`; add positive placement and negative identifier tests. Coordinate the matching registry change in the separate current-production Analytics patch only if that patch is still intended for release. Keep the two releases independent. Do not publish links or change bios merely because a value is registered.

The released current-design FormSubmit Analytics module retains the same approved campaign labels in its own tab-scoped store so privacy/hash navigation does not lose them. Actual production network verification is recorded in `../../private/analytics/production-network-2026-09-08T02-50-20-878Z/README.md`. It does not gain the redesign's landing/referrer history or intake system. Basic Analytics consent remains required. The registry does not replace the GA Admin review of automatic measurement, user-provided-data settings, custom/modified events, or actual production request verification.

`site_version` is a fixed Analytics design label, not a UTM field: `current_design` for the released design and `partnership_redesign` for the staged redesign. The public creator profile parameter `profile_key` and this version parameter were registered as event-scoped dimensions on September 8, 2026 UTC. The GA-created `whatsapp_contact_click` key event measures contact intent, once per session without a default monetary value; it neither records a sent message nor joins a WhatsApp person to a CRM lead. The full rule and source evidence are in `../../docs/measurement-contract.md`.

Keep exact source/medium in acquisition reports. Google maintains its default channel classifications; the current published source list classifies `tiktok` as social even though the help page gives TikTok as an Organic Video example. Do not change this approved link convention based only on a channel label, or promise the processed default channel without checking the report. Tab-preserved campaign metadata is not a GA session or cross-device identity. [Google channel rules and source list](https://support.google.com/analytics/answer/9756891?hl=en).
