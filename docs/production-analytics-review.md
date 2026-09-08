# Current-production Analytics patch — review only

This is an isolated, uncommitted patch. It has not been pushed, merged, deployed or submitted to FormSubmit. It does not activate the redesign or modify its worktree.

## Verified source

The original verification below records worktree creation. The integration comparison was refreshed against favicon production commit `7178f374be574238eb50dbeed724d0e7106626e7` on September 8, 2026; this step did not perform a new live deployment/API check.

- Repository: `https://github.com/mhammad93/hammadmedia.git`.
- GitHub `main`, local `main` and the Vercel production deployment all matched `8daa34c40500f961cff1e2ad2e90c9cedb174d44` when this worktree was created.
- Vercel deployment: `dpl_2sMCccCbwNnQRQSTikyCt8Kv9wsi`, `READY`, production, aliases include `hammadmedia.com` and `www.hammadmedia.com`.
- Review branch: `codex/production-analytics-review`.
- Worktree: the isolated sibling directory `website-analytics`.

The source eagerly loaded `G-NEX74824JL` on the homepage and thanks page, without a consent or hostname gate. Its identical bundle could collect visits from Vercel aliases or the GitHub Pages mirror. The native form posts to FormSubmit and redirects to `/thanks.html`; this is not an authenticated receipt or proof of inbox delivery.

## Scope

The homepage offer, statistics, content file, generated main section, existing CSS, images, form fields, FormSubmit action, hidden options and native validation/navigation are preserved. The only homepage additions are scoped consent controls and privacy clarification. The thanks copy is corrected to distinguish a recent local handoff from an unverified direct visit; neither state claims inbox delivery.

The local module runs only at the exact HTTPS origins `hammadmedia.com` and `www.hammadmedia.com`. Alternate ports, lookalikes, HTTP, Vercel aliases, GitHub Pages and local hosts remain inactive even if consent has been stored. The 404 page remains unmeasured.

## Consent and private data

- Google is not requested and `gtag` is not exposed before valid explicit acceptance. Saving/readback of the choice must work; corrupt, future, expired or restricted storage fails closed.
- `hm-analytics-consent-v1` in localStorage stores only version, accepted/declined choice and timestamp. It expires after 180 days. Settings can reopen the controls.
- On withdrawal, the property is disabled before clearing queued commands and suppressing deferred callbacks. Only `_ga` and `_ga_NEX74824JL` cookies are removed across host/parent and applicable paths. The page reloads to remove the loaded tracker. Expiry and other-tab withdrawal also stop it.
- Google signals and advertising personalization are disabled; ad consent remains denied. No visitor names, email addresses, messages, commission selections, product URLs, user IDs or enhanced-conversion data are supplied by this module.
- Page queries/fragments and referrer paths/queries are stripped. Campaign fields accept only the exact public values in `controlled-campaign-links.md`; unknown/wrong-field/duplicated values and `utm_id` are dropped. The Google script request sends no referrer header.
- `hm-legacy-campaign-v1` in sessionStorage retains only approved public campaign labels in this tab before or after a consent choice. This preserves attribution across privacy/hash navigation without loading Google or replaying interactions. It holds no URL, referrer, timestamp, visitor ID or inquiry values. A new valid campaign replaces prior fields as a group; untagged or wholly invalid navigation preserves the last valid campaign. Corrupt/contaminated storage is sanitized, blocked storage falls back to current-page labels, and preview hosts do not capture it. The record lasts until the tab closes; this patch does not add first-landing/referrer history or the redesign intake system.

## Event meanings

Events are emitted only with accepted Analytics consent. No prior declined interaction is replayed. Native links and form navigation are never delayed for tracking.

| Event | Meaning |
| --- | --- |
| `page_view` | One manual view from this module after acceptance; default config page view is disabled. |
| `contact_cta_click` | Click on an existing contact anchor, with a fixed placement label. |
| `package_select` | Click on a known package CTA, with a fixed package label. |
| `contact_click` | Email/WhatsApp intent, not an email sent or inquiry received. |
| `proof_video_click` | Click on a known creator-video URL, without sending its URL. |
| `partnership_form_start` | First consented focus interaction with the form on this page. |
| `partnership_form_error` | Browser validation failure; no entered value is included. |
| `partnership_form_handoff` | Valid, unprevented native submit event. This does not prove network or provider acceptance. |
| `formsubmit_return_view` | One recent same-tab return after a handoff that was eligible for Analytics, with consent still present. This does not prove email delivery. |

This patch never emits `generate_lead`, `qualify_lead`, `close_convert_lead` or `purchase`, and assigns no monetary value. A thank-you URL, form handoff or contact click must not be configured as a confirmed-lead key event.

For the functional thanks experience, sessionStorage holds `hm-formsubmit-handoff-v1`: version, submission timestamp, Analytics-eligibility flag and return-viewed flag. It contains no form contents or visitor ID. Recognition is limited to 30 minutes and the current tab; refresh retains the neutral recent-handoff state without another return event. Invalid/expired context is removed when read; otherwise it may remain until the tab closes. This functional recognition also works when Analytics is declined. Storage restrictions simply leave the page unverified and do not interfere with submission.

## Verification

- All 42 original baseline tests passed before editing.
- The final suite has 62 passing tests, including executed module tests for consent, production hosts, private-field access guards, native form behavior, invalid submissions, direct thanks visits, contextual return deduplication, withdrawal, expiry, the explicit campaign value registry, same-tab campaign navigation, group replacement, invalid stored values and unavailable storage.
- The generated homepage main section, complete FormSubmit form, original inline CSS in all three templates, structured data, content, builder, deployment settings and all pre-existing assets compare byte-for-byte with commit `7178f374be574238eb50dbeed724d0e7106626e7`, preserving the complete form and visible offer. All 62 tests passed again after the favicon integration.
- No provider submission, email, browser-based live tracking test or deployment was performed.

## Favicon production update integrated

The favicon and hosted signature asset refresh from `7178f374be574238eb50dbeed724d0e7106626e7` is now present in this isolated patch. All 13 `assets/brand-v3` files and root `favicon.ico` were copied from the immutable commit and verified byte for byte. Homepage, thanks and 404 icon links match that commit exactly. Only the icon links were edited in the existing homepage/thanks templates; the previously authorized uncommitted Analytics sources, consent styles, tests and campaign documentation were preserved without changes.

A temporary clean build of `7178f37` was compared with the candidate build. The only differing existing deployed files are `index.html` and `thanks.html`, containing the reviewed consent/privacy and contextual-thanks changes. The only additional deployed files are `assets/analytics-consent-v1.js` and `.css`. The 404, favicon, signature assets and every other existing deployed file are identical. No legacy content or redesign files were imported.

The local review branch still points at its original `8daa34c` base; no merge, rebase, commit, push or deployment was performed. Before release, use the current production branch as the release base and preserve these integrated assets. `docs/production-baseline-comparison.json` records exact source/deployed comparisons, asset hashes, candidate fingerprints and the 62-test result. GA Admin and actual-request release gates below still need the root task's final verification; this source integration does not establish that property settings or production tracking are complete.

## Release gates

1. Independently review this patch and verify production `main` has not moved. Keep it separate from the redesign branch.
2. Inspect GA custom/modified-event rules, including older rules, to ensure `/thanks` or automatic `form_submit` cannot be transformed into a confirmed lead. The newly created code-triggered `generate_lead` was reported as having no URL condition; the exhaustive older-rule audit is still pending.
3. Verify/disable Enhanced Measurement history-based page views. Google documents that these can still fire despite `send_page_view:false`; module tests alone cannot certify property-side behavior. Review automatic form, outbound-click and site-search collection as well so those settings do not bypass fixed labels and query stripping. [Google page-view guidance](https://developers.google.com/analytics/devguides/collection/ga4/views?hl=en), [Enhanced Measurement settings](https://support.google.com/analytics/answer/9216061?hl=en).
4. After approval, inspect actual requests on production for one page view, no query/form details, no Google requests before acceptance, clean withdrawal, and correct host exclusion. Verify the unchanged real FormSubmit integration through a separately authorized identified test if required.
5. Annotate the release date in reporting. Opt-in collection changes measured coverage; historical preview traffic and historical automatic form events are not retroactively repaired or equivalent to these events.

The existing `/assets/*` response is immutable for one year. These are new versioned asset filenames; increment the filename and both HTML references whenever their contents are changed after release. Do not overwrite a previously released versioned path.

Primary consent references: [Google basic consent mode](https://support.google.com/analytics/answer/10000067?hl=en), [Google privacy settings and opt-out flag](https://developers.google.com/tag-platform/security/guides/privacy).
