# Creator profiles and conversion navigation

Status: implemented and checked locally on the review branch. No commit or deployment was made by this change. All 16 approved English/Chinese copy replacements in the workspace’s `docs/website-copy-premium-review.json` were applied, including truthful receipt wording; form state conditions and all nine substantive FAQs remain unchanged.

Both original profile portraits now sit in large framed, fully clickable cards below the creator introduction. Each card opens only its exact TikTok profile in a new tab, has a named accessible link, and retains its original image mapping. Both accounts remain visible on tablet and phone layouts. Light and dark themes use the existing palette and locally hosted fonts.

## Evidence and dates

`performance.json` is the source for displayed figures; `content.json` maps each handle to its public profile URL and existing portrait. Sales retain their own period and approximation qualifiers. Social snapshots are separate from the August sales cutoff.

| Account | Social evidence | Sales evidence |
| --- | --- | --- |
| `drew.review` | 190.1K followers; 2.5M likes. Official profile observed in an authenticated browser September 7, 2026 at 23:40:19 EDT (`2026-09-08T03:40:19.868Z`). | $1.4M+ estimated attributed GMV; about 57.7K units, January 1–August 31, 2026. |
| `drew.review1` | 164.1K followers; 2.6M likes. Official profile observed in an authenticated browser September 7, 2026 at 23:37:53 EDT (`2026-09-08T03:37:53.146Z`). | $2.5M+ estimated attributed GMV; about 101.8K units, January 1–August 31, 2026. |

`accounts[handle].social` contains the values, visible dated note, `asOf`, status, source classification, UTC timestamp and display timezone. Both accounts now have verified September 7 profile snapshots; abbreviated follower/like counts remain rounded displays. The earlier unauthenticated restriction on the second account no longer blocks this authenticated observation, and its old `refreshStatus` is removed. These snapshots are separate from the August sales cutoff. No combined video-view total is split between accounts.

The combined 2026 product-view proof metric is now **About 147M**, January 1–August 31, after the user explicitly approved displaying product impressions as views. It preserves the original combined 105M+ baseline and adds only about 42M for June 9–August 31. Source rounding and the account-baseline difference remain in `private/sales-evidence/product-views-owner-mapping-2026-09-08.{json,md}`. No per-account product-view field was added. The all-time headline is **About 455M · All-time video views · Estimated through Aug 31, 2026**. It rolls forward the rounded 416M+ video-only baseline with only the June 9–August 31 video-view export rows. The exact extension and baseline limitations are retained in `private/sales-evidence/video-views-export-rollforward-2026-09-08.{json,md}`. This supersedes the earlier provisional 458M mixed-series headline.

Each profile also has a separate **Content performance · January 1–August 31, 2026** group. All five figures are exact comma-formatted export totals, including signed daily adjustments. These are period counts, not unique reach or the public profile's lifetime likes. The exported timezone was not supplied; no timezone is inferred for the daily series.

| Account | Video views | Profile views | Period likes | Comments | Shares |
| --- | ---: | ---: | ---: | ---: | ---: |
| `drew.review` | 51,282,687 | 156,431 | 796,504 | 14,232 | 91,901 |
| `drew.review1` | 85,624,535 | 246,143 | 1,115,288 | 26,552 | 143,388 |

The complete 243-day exports per account were independently reconciled. Central `accounts[handle].engagement` contains each exact integer, bilingual label/display value and dated period. Private evidence is `private/sales-evidence/tiktok-studio-exports-2026-09-08/independent-five-metric-recheck-2026-09-08.json`. Current profile followers/lifetime likes, dated content performance, and attributed Shop GMV/units remain three distinct visual groups. Video views use a large full-width inset; the four other content metrics use two columns. Thin SVG icons are decorative and inherit theme colors; no icon library or extra network request was added.


Both fresh profile JSON, screenshot and accessibility records are retained privately under `private/sales-evidence/profile-verification-2026-09-08-authenticated/drew.review.{json,png,txt}` and `drew.review1.{json,png,txt}`. Earlier observations, including the restricted second-account page, remain preserved separately. No new portraits were generated or substituted.

## Interaction and accessibility

The whole card is one link, with its handle as the accessible name and a new-tab hint. Decorative portraits have empty alt text because the visible handle names the destination. `profile_click` is a non-conversion event with an allowlisted `profile_key` (`drew.review` or `drew.review1`), `cta_location=creator` for the large cards or `hero` for the compact hero links, existing site language and a query-free page location. Unknown keys are ignored. No URL, profile text, visitor text or lead event is collected, and preview Analytics remains off.

Navigation adds FAQ and **Start a Partnership / 洽谈合作**, with an opaque theme-matched header and bordered controls. On narrow screens navigation wraps into its own row. Hero profile links have their own solid panels, with 44-pixel targets. The floating dock keeps **Start a Partnership** and WhatsApp accessible throughout the landing page. Its behavior and canonical CRM handoff are documented in `contact-dock.md`.

Product-card headings use shared grid rows where supported, allowing longer names to set the row height naturally while aligning the divider and sales figures. The title-to-sales-label spacing is now 27 pixels for the current products at tested sizes. Older browsers retain a two-line heading allowance. Sales, units, dates, policy and provider behavior remain unchanged by this spacing update. The visible methodology disclosure and its link were removed as requested; concise periods, approximation labels and the GMV definition remain beside the figures. Full source notes stay in the data source and private evidence records. The award caption and alt text now say TikTok Shop Summit / Health Creators of the Year / Short Video, without an unsupported year or location.

## Verification

All 66 current frontend tests pass. Focused coverage checks exact profile/portrait assignment, both official snapshot timestamps, the video-only baseline rollforward, all five daily-export sums, current-versus-period likes separation, exact unabridged metric rendering, source-to-account mapping, allowlisted click events, preview silence, bilingual navigation and the inquiry/WhatsApp distinction.

An isolated bundled Chromium browser checked English and Chinese in both themes at 1440×1100, 1024×900, 768×1024, 390×844, 320×780 and 844×390. Both profile cards remain present, with no horizontal document or metric overflow. Header controls and hero chips meet 44-pixel targets; dock buttons meet 50 pixels. Product figures align within rows and stay inside their cards. Keyboard focus on the form and footer remains above the dock. No runtime errors were observed. Measured text contrast for header controls, hero chips and profile links was at least 4.66:1 in both themes. A deliberately longer test product title still aligned the sales rows without overlap. Thirty hover/return/keyboard-focus checks across six language/theme/viewport cases passed. A separate 16-case local production fixture checked the consent panel at desktop, phone and short landscape sizes: its controls remained separate from the dock, keyboard focus was visible, declining hid the panel, and no external Analytics request occurred. All fixture requests were served from local files; no live production site or provider was contacted. Screenshot and numeric evidence is retained at `private/design-qa/profile-cards-2026-09-08/` outside the deployment project.

The content-performance expansion additionally passed 32 isolated layout cases: English/Chinese, light/dark, at 1440, 1024, 768, 390, 375, 361, 320 and 844 landscape widths. All ten exact content figures remain within their cards; secondary content figures are at least 24 pixels and video figures at least 34 pixels. The full card links, hero profile links, inquiry dock and visible keyboard focus remain intact. Component screenshot exports temporarily hide the fixed dock solely to show the complete cards; separate viewport screenshots retain the real dock. Evidence is `private/design-qa/profile-engagement-2026-09-08/`.

Browser inspection of the next hosted preview is still required after the review branch is deployed. This local visual verification is separate from the already completed controlled intake delivery test and does not establish production launch approval.
