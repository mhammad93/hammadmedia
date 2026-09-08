# Creator profiles and conversion navigation

Status: implemented and checked locally on the review branch. No commit or deployment was made by this change. All 16 approved English/Chinese copy replacements in the workspace’s `docs/website-copy-premium-review.json` were applied, including truthful receipt wording; form state conditions and all nine substantive FAQs remain unchanged.

Both original profile portraits now sit in large framed, fully clickable cards below the creator introduction. Each card opens only its exact TikTok profile in a new tab, has a named accessible link, and retains its original image mapping. Both accounts remain visible on tablet and phone layouts. Light and dark themes use the existing palette and locally hosted fonts.

## Evidence and dates

`performance.json` is the source for displayed figures; `content.json` maps each handle to its public profile URL and existing portrait. Sales retain their own period and approximation qualifiers. Social snapshots are separate from the August sales cutoff.

| Account | Social evidence | Sales evidence |
| --- | --- | --- |
| `drew.review` | 190.1K followers; 2.5M likes. Official public profile observed September 7, 2026 at 22:55 EDT (`2026-09-08T02:55:12Z`). | About $1.41M attributed GMV; about 57.7K units, January 1–August 31, 2026. |
| `drew.review1` | 155K followers, last reported June 8, 2026. The current public page is restricted, so missing likes are omitted. | About $2.53M attributed GMV; about 101.8K units, January 1–August 31, 2026. |

`accounts[handle].social` contains the value, visible dated note, `asOf`, status and source classification; the fresh observation also records its UTC timestamp and display timezone. The restricted second account records `refreshStatus=public_profile_restricted`. No combined video-view total is split between accounts. Historic product views are not displayed in these cards while the requested August update is being reconciled. No older metric is relabeled as current August evidence. That reconciliation remains a separate unfinished acceptance criterion.

The verified public profile screenshot and text are retained privately under `private/sales-evidence/profile-verification-2026-09-08/`. No new portraits were generated or substituted.

## Interaction and accessibility

The whole card is one link, with its handle as the accessible name and a new-tab hint. Decorative portraits have empty alt text because the visible handle names the destination. `profile_click` is a non-conversion event with an allowlisted `profile_key` (`drew.review` or `drew.review1`), `cta_location=creator`, existing site language and a query-free page location. Unknown keys are ignored. No URL, profile text, visitor text or lead event is collected, and preview Analytics remains off.

Navigation adds FAQ and **Start a Partnership / 洽谈合作**, with an opaque theme-matched header and bordered controls. On narrow screens navigation wraps into its own row. Hero profile links have their own solid panels, with 44-pixel targets. The floating dock keeps **Start a Partnership** and WhatsApp accessible throughout the landing page. Its behavior and canonical CRM handoff are documented in `contact-dock.md`.

Product-card headings use shared grid rows where supported, allowing longer names to set the row height naturally while aligning the divider and sales figures. The title-to-sales-label spacing is now 27 pixels for the current products at tested sizes. Older browsers retain a two-line heading allowance. Sales, units, dates, policy and provider behavior remain unchanged by this spacing update. The visible methodology disclosure and its link were removed as requested; concise periods, approximation labels and the GMV definition remain beside the figures. Full source notes stay in the data source and private evidence records. The award caption and alt text now say TikTok Shop Summit / Health Creators of the Year / Short Video, without an unsupported year or location.

## Verification

All 60 frontend tests pass. Focused coverage checks exact profile/portrait assignment, dates, omission of unavailable metrics, source-to-account mapping, allowlisted click events, preview silence, bilingual navigation and the inquiry/WhatsApp distinction.

An isolated bundled Chromium browser checked English and Chinese in both themes at 1440×1100, 1024×900, 768×1024, 390×844, 320×780 and 844×390. Both profile cards remain present, with no horizontal document or metric overflow. Header controls and hero chips meet 44-pixel targets; dock buttons meet 50 pixels. Product figures align within rows and stay inside their cards. Keyboard focus on the form and footer remains above the dock. No runtime errors were observed. Measured text contrast for header controls, hero chips and profile links was at least 4.66:1 in both themes. A deliberately longer test product title still aligned the sales rows without overlap. Thirty hover/return/keyboard-focus checks across six language/theme/viewport cases passed. A separate 16-case local production fixture checked the consent panel at desktop, phone and short landscape sizes: its controls remained separate from the dock, keyboard focus was visible, declining hid the panel, and no external Analytics request occurred. All fixture requests were served from local files; no live production site or provider was contacted. Screenshot and numeric evidence is retained at `private/design-qa/profile-cards-2026-09-08/` outside the deployment project.

Browser inspection of the next hosted preview is still required after the review branch is deployed. This local visual verification is separate from the already completed controlled intake delivery test and does not establish production launch approval.
