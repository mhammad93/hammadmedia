# Performance Atelier — design QA

final result: passed

Scope: visual implementation and local interaction gate for the review preview. This does not claim production launch, real form delivery, live GA event receipt, native Safari/Android Webview coverage or conversion uplift.

## Source and comparison

- Source visual truth: `../design-concepts/03-performance-atelier.png`, selected concept 3.
- Source: 1440 × 1100 pixels. Browser comparison: 1440 × 1100 CSS pixels and screenshot pixels, density 1; no device frame. Both images were presented together in the same comparison input.
- Implementation: `http://localhost:4173/`, English dark, top of page; `../private/design-qa/desktop-dark-final.png`.
- The preview has an intentional 30-pixel review notice. The source is a concept for art direction, while the implementation is a complete scrolling website with dated evidence and operational states. The source's lower mini-footer is replaced by the full evidence/story/offer/contact journey.
- Focused areas read directly in the matched full-resolution pair: wordmark, three-line headline, CTA text, real product packaging, pricing labels and amounts. Additional browser crops/states below examine form controls, bilingual wraps and confirmation/consent; no important text was judged only from a page thumbnail.

## Findings resolved through iteration

| Priority | Earlier finding | Fix | Post-fix evidence |
|---|---|---|---|
| P1 | Light header tools had weak contrast against the green hero image | Solid ivory light header with dark tools and a green primary button | desktop-light-final.png |
| P2 | First hero was excessively inset and tall versus the chosen concept | 52/48 split, 746-pixel hero, aligned left column and corrected headline rhythm | desktop-dark-final.png, compared again with source |
| P2 | Chinese mobile headline left one character on an orphan line | Three explicit semantic lines and adjusted Chinese type sizing | mobile-zh-dark-final.png |
| P2 | Absolute homepage header overlapped secondary-page introduction | Secondary pages use an in-flow header; Chinese confirmation uses sans-serif text | mobile-zh-thanks-direct-final.png |
| P2 | A real confirmation state was absent | Added localized receipt/reference/next-steps layout and neutral direct-visit state | mobile-thanks-confirmed-layout.png, mobile-zh-thanks-direct-final.png |

No actionable P0/P1/P2 visual finding remains in the tested states. The correct published product identity is retained. The standalone reusable logo is the final vector family, replacing the concept's raster wordmark. The studio product scene intentionally follows the selected emerald art direction with an upright source product and a darker backdrop; it is presentation imagery, not sales evidence.

## Required fidelity surfaces

- **Fonts and typography:** self-hosted Manrope and Fraunces; stable display/body hierarchy and CJK system fallbacks. Three-line hero and Chinese wrapping verified; receipt UUID fits mobile without overflow. Prices remain serif for the editorial character. UI controls are clearly readable.
- **Spacing and layout:** matched desktop split and headline/CTA hierarchy; four-price strip; consistent section rhythm. Mobile stacks naturally at 390 × 844 with no horizontal overflow. Secondary pages and fixed consent controls do not overlap their headings.
- **Colors and tokens:** forest/emerald/ivory system; light mode has distinct readable surfaces. Focus outlines are visible. Consent options are both usable, and the inquiry is available with either choice.
- **Image quality:** outlined vector wordmarks; crisp product packaging and actual portfolio/award source imagery; appropriate responsive crop and explicit dimensions. Generated studio art is not substituted for evidence.
- **Copy/content:** revised paid offer, upfront fee plus commission, total video allocation, retained creative control, separately agreed usage/exclusivity, no sales guarantee. Public metrics use per-item dates and approximation labels. Preview and unconfigured form states are explicit.

## Browser and behavioral evidence

All image files are under `../private/design-qa/`:

- desktop-dark-final.png and desktop-light-final.png: 1440 × 1100.
- mobile-light-final.png, mobile-dark-final.png, mobile-zh-dark-final.png: 390 × 844.
- mobile-zh-thanks-direct-final.png: direct visit remains neutral.
- mobile-thanks-confirmed-layout.png: synthetic visual fixture labelled “No inquiry was sent”; it is layout evidence only.
- mobile-consent.png: production-mode local fixture with a restrictive self-only network policy, preventing Google traffic during QA.

Primary interactions verified: package selection/preselection, required category for exclusivity, paid acknowledgment and backend field alignment, theme toggle/persistence, language navigation, form configuration fallback, direct confirmation state, consent decline/persistence, settings reopen, acceptance loader and withdrawal/removal. Browser DOM showed zero Google loaders before consent and after decline, one only after acceptance, then zero after withdrawal. External tracking was blocked by the local QA server; live collection is a separate deployment check.

The combined website suite passes 67 tests with one optional PostgreSQL integration test skipped in the default run. The pinned actual PostgreSQL integration was separately run earlier and passed after the retention fix. Tests cover accepted/rejected receipt IDs, uncertain retry, refresh, same-reference replay, no false thank-you conversion, privacy-safe payloads, consent expiry/withdrawal and preview isolation. Browser error/warning log checks returned no application errors in the reviewed public pages.

## Remaining release gates and polish

- Real provider/inbox delivery and production GA collection are deliberately not inferred from local tests.
- Run deployed preview checks after build and verify the exact runtime/configuration.
- Native Safari/iOS and Android Webview checks remain a launch acceptance item; desktop responsive emulation is not that device coverage.
- The source concept does not specify light/mobile/Chinese/confirmation/consent states; these are reviewed extensions rather than pixel copies.
- Small future spacing refinements are P3 only and should be driven by actual use, not by unproven conversion claims.

## User-directed visual refinement — September 7 evening review

The user's supplied screenshots supersede the concept's pale bands for dark mode. The requested corrections were reviewed against their screenshots, then checked in the browser at 1440 × 1100, 650 × 1000 and 390 × 844.

- Dark pricing, results, exclusivity and preview-notice surfaces now use the forest palette. Green calls to action retain clear contrast.
- Brand marks are larger, evenly spaced, and readable in both themes. The white strip is removed; light mode uses dark marks. Mobile uses a three-column brand grid.
- The summit photograph keeps its native 1100 × 854 ratio. The circled @drew.review1 profile and entire award board remain visible at desktop and phone sizes; there is no object-fit crop.
- Light mode has a separate ivory studio hero. At phone/narrow-tablet widths both hero scenes retain their full 4:5 framing, including the pouch and pedestal.
- Product photography blends into each theme with no white image tiles. NeoCell and Cata-Kor use verified official transparent originals. Other dark variants are AI background edits with near-black backdrops, composited by the browser over the forest surface. Light variants retain original packshots with a subtle multiply blend. Failed fake-alpha/checkerboard outputs were rejected and are not public assets. These edits are presentation images, not evidence; major packaging identity was inspected, and tiny generated label text is not claimed pixel-identical.
- Seven new product assets are exported at up to 1200 pixels in WebP, about 658 KB combined; full-quality originals are archived privately. Active images load; inactive theme alternatives are display:none and excluded from the accessibility tree.
- Glutathione (about $142K / 6.3K units, April–August) and Testosterone+ (about $104K / 4.5K units, May–August) replace the smaller NAC/Saffron examples. Each combines both profiles over its stated complete period. No unverified video CTA is added.

Evidence in `../private/design-qa/`: desktop-dark-refined.png; desktop-dark-brands-refined.png; desktop-summit-refined.png; desktop-packages-dark-refined.png; narrow-tablet-dark-hero-refined.png; narrow-tablet-light-hero-refined.png; mobile-summit-refined.png; mobile-light-brands-refined.png; mobile-dark-products-refined.png; mobile-zh-products-refined.png.

The checked phone/desktop views had no horizontal overflow or broken active images. Browser error logs were empty; preview Google-script count remained zero. Independent review found no code blocker; the flagged 550–650 pixel hero crop was corrected and verified at 650 pixels. Final result remains passed for this review-preview scope.

Generated CSS and JavaScript URLs now include content hashes. This prevents an existing review session from retaining a previous visual or tracking script after a new deployment; changed/stable byte regression checks pass across every generated route.
