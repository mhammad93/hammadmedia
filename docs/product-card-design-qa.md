# Product-card visual refinement — review proof

Prepared September 8, 2026. Local source only; no commit, push, provider change or deployment by this task.

## Result

The portfolio now uses a larger two-line heading, complete bordered forest cards in dark mode, and pale green/ivory cards in light mode. Attributed GMV and units sold have equal numeric size and weight: 64px on desktop, 68px on the checked tablet, 58.5px at 390px, and 48px at 320px. GMV is emerald and units use the principal text color. Each has its own readable label. Approximation wording stays adjacent to the value, and the reporting period stays inside each card.

The product grid is three columns above 1150px, two through tablet widths, and one at 650px or narrower. Image space reserves a separate clear area for company logos. NMN has a larger optical scale; light-mode Testosterone+ is also balanced against the neighboring packages. Product image files were not edited. No package labels are clipped in the inspected captures.

## Facts and accessibility preserved

- `content.json` and `performance.json` have no changes in this task; canonical values, periods, profile scope and historical/approximate status are preserved.
- Each metric uses semantic definition-list markup. An exact canonical string is retained for screen readers; the split visual approximation/number is hidden from duplicate announcement.
- Exactly one product image is displayed per card in each tested theme; existing image alt text and light/dark mappings are preserved.
- Existing verified review links remain unchanged; Cata-Kor and Testosterone+ still have no unverified review CTA.
- The historic affiliate-sales/endorsement distinction remains below the cards.

## Authentic company logos

Micro Ingredients, NeoCell and Toplux reuse the existing transparent public PNG originals. Their alpha ranges were checked as 0–255. Cata-Kor is an unchanged transparent vector downloaded from the current official header at https://catakor.com/:

https://catakor.com/cdn/shop/files/Logo_48944908-81e4-48c6-b982-3899eb9124c0.svg?v=1784053411&width=600

The downloaded source is 4,531 bytes, viewBox `0 0 167 30`, with paths and no background. It is explicitly allowlisted at `assets/brands/cata-kor.svg`. All company marks use the original silhouettes as CSS masks, displaying ivory on forest and forest on pale green; the source files remain unchanged. Brand names are also visible text, so decorative logo masks are hidden from assistive technology.

## Latest Hammad Media identity carried forward

All 13 files from `website-brand-live/assets/brand-v3` and its root `favicon.ico` were copied unchanged and verified byte for byte. The shared page shell now includes the same SVG, 64px PNG and 180px Apple icon references on every generated route. The explicit public asset allowlist includes only those named assets. This carry-forward does not import or merge the legacy page templates.

## Verification

- 27 focused build/content tests pass after the final CSS and icon changes. They cover both locales, preview/production Analytics gating, exact canonical metrics, verified review destinations, theme image mappings, local references, strict public output boundaries, form receipt handling and content-hash script/style URLs.
- Isolated local Chromium screenshots and layout probes cover EN/ZH at 1440px in both themes, EN/ZH at 390px in both themes, EN 320px dark, ZH 320px light, and EN 768px dark (11 states).
- No document or number overflow in any state. Every card displays one image and a resolved company-logo mask. No page errors occurred.
- Actual screenshots were inspected for dark/light desktop, Chinese desktop, narrow English/Chinese phones and tablet. Logos no longer crowd product tops; numbers, qualifiers and dates fit.
- The renderer blocks external requests and serves a disabled local intake configuration. It submits no form, emits no production Analytics, and does not use the user's Chrome or the root agent's browser session.

Private visual proof: `private/design-qa/product-cards-2026-09-08/` at the project root. `layout-checks.json` stores measured geometry. Full section captures can include browser fixed-element stitching artifacts (the offscreen skip link and mobile sticky CTA); the normal viewport capture confirms the skip link remains outside the viewport at top -100px when unfocused. Production CSS was not altered to hide accessible controls for screenshots.

Final stylesheet URL digest: `99f304d8f691c9b8`. Root should perform the final interactive preview check and control any deployment.
