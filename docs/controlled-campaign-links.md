# Controlled public campaign links

The current-production Analytics patch accepts only these exact lowercase public labels:

| Parameter | Approved values |
|---|---|
| `utm_source` | `tiktok`, `brand_kit`, `agency_outreach` |
| `utm_medium` | `organic_social`, `referral`, `email` |
| `utm_campaign` | `paid_partnerships` |
| `utm_content` | `drew_review_bio`, `drew_review1_bio`, `en_overview`, `zh_overview`, `agency_overview` |

Unknown, wrong-field and repeated parameter values are dropped. `utm_id`, search terms, ad/click IDs and arbitrary query parameters are not sent by this helper. This is an explicit value registry, not a regex-based promise that arbitrary text cannot identify someone.

Prepared examples, not sent messages or changed bios:

- `https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio`
- `https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review1_bio`
- `https://hammadmedia.com/?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=en_overview`
- `https://hammadmedia.com/?utm_source=agency_outreach&utm_medium=email&utm_campaign=paid_partnerships&utm_content=agency_overview`

`zh_overview` is a public material label; this legacy site does not gain a Chinese route. Do not link to `/zh/` until that separate redesign is launched.

Never encode a visitor name, contact information, brand/deal identity, receipt UUID or private submission into campaign labels. The creator-account labels describe Hammad Media's own public publishing placements, not visitor IDs. To extend this registry, review the public placement and its owner/start/retirement dates, add exact field-specific values to `assets/analytics-consent-v1.js`, and add positive placement plus negative identifier tests. Coordinate the same reviewed values in the separate redesign's Analytics/attribution helpers without merging releases.

On the exact production HTTPS hosts, the patch retains only these public campaign labels in `sessionStorage` under `hm-legacy-campaign-v1`, including before an Analytics choice. This small record survives same-tab privacy/hash navigation and reloads until the tab closes. It contains no URL, referrer, timestamp, visitor ID or inquiry values. A new URL with any approved campaign fields replaces the prior campaign as a group; an untagged or wholly invalid URL preserves the last valid campaign. Stored values are revalidated and any unrecognized fields are discarded. Hash/popstate capture emits no Analytics events. If session storage is unavailable, only current-page attribution remains available. This does not alter FormSubmit or send anything to Google before consent. Its thank-you observation is not a confirmed lead. Basic consent, GA Admin automatic-measurement controls and actual request verification remain required. The new versioned assets have not been released; if they change after a release, increment filenames and both HTML references because `/assets/*` is immutable for one year.
