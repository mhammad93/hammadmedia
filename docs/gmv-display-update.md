# Rounded GMV display update — September 8, 2026

The website uses the user's selected clean dollar headlines in both English and Simplified Chinese. The figures are presentations of source-based estimates, with small estimate labels and the relevant reporting periods. Package prices and all CSS are unchanged.

| Placement | Display | Scope |
| --- | --- | --- |
| All-time GMV | $9.1M+ | Estimated through August 31, 2026; accepted historical baseline plus non-overlapping extension |
| 2026 combined GMV | $3.9M+ | January 1–August 31, 2026 estimate |
| @drew.review | $1.4M+ | January 1–August 31, 2026 estimate |
| @drew.review1 | $2.5M+ | January 1–August 31, 2026 estimate |
| Astaxanthin | $400K+ | January 1–August 31, 2026 estimate; also used in the hero |
| NMN | $240K+ | Documented records through August 31, 2026; partial coverage |
| Collagen | $250K+ | January 1–August 31, 2026 estimate |
| Magnesium | $170K+ | Documented records through August 31, 2026; partial coverage |
| Liposomal Glutathione | $140K+ | April 1–August 31, 2026 estimate |
| Testosterone+ | $100K+ | May 1–August 31, 2026 estimate |

## Precision and partial coverage

The “+” notation is not a claim of an exact raw-platform minimum. Astaxanthin is the explicit rounded-presentation case: its central displayed-source sum is $400,266, while a reserve for the source displays' rounding can put the estimate below $400,000. Its visible label says **Estimated attributed GMV**. The private audit retains this uncertainty; tests explicitly prevent describing the chosen $400K+ as a reserve-certified lower threshold. The lifetime figure retains its separate historical-baseline assumption and visible estimate note.

NMN includes five of six account/period extension cells; Magnesium includes three of six. Their matching documented unit subtotals are **7,864** and **13,956**, respectively. Missing account/month rows remain unknown and are never inserted as zero. Each card uses **Documented attributed GMV**, **Documented units sold**, and **Records through Aug 31, 2026 · partial coverage**, with natural Chinese equivalents. Neither card claims a complete January–August total.

The remaining units, views, followers, likes, comments and shares are unchanged. The offer remains $5,000 / $9,500 / $13,500 / $25,000, and category exclusivity remains $50,000 with its original terms. Historical asset-kit references retain their dated approximate figures; signatures and asset packages were not changed by this display update.

## Verification

- All **73 frontend tests pass**, including independent source arithmetic, unique source-cell coverage, missing-data semantics, bilingual rendering, unchanged exact fees, preview Analytics gates, consent and receipt behavior.
- An isolated local Chromium checked English and Chinese, dark and light themes, at **320, 390, 768 and 1440 pixels**: 16 combinations, no script errors, page overflow or overflowing metric figures.
- The CSS hash and every checked metric font size/weight are identical to the before-change baseline. The prior 320-pixel English hero overflow from “About $400K” is resolved by the shorter display.
- Actual rendered screenshots cover the hero, totals, product and profile sales areas. No form was submitted; external requests were blocked during this local review.

Private source records remain outside the public build: `monetary-display-floors-2026-09-08.json`, `partial-product-subtotals-2026-09-08.json`, and the selected presentation / before-and-after browser evidence in `private/gmv-display-qa-2026-09-08/`. The earlier conservative-floor audit remains historical and is not overwritten to make the selected rounder display appear more precise.

This is a local, reviewable change. No commit, push or deployment was performed by this task.

## Launch review follow-up

The shared Open Graph image was regenerated from the existing editable `tools/make_og.py` text/vector template using the selected **$3.9M+ estimated attributed GMV** and the original period. Both languages now reference the new `assets/og-partnership-gmv-20260908.jpg` URL; the old JPEG is excluded from the generated public bundle. The new 1200 × 630 JPEG was visually checked. Production privacy text no longer refers to itself as a design preview; that sentence remains only in review builds. Two focused production/preview and Open Graph regressions bring the frontend suite to 73 passing tests.
