# Inquiry and WhatsApp contact dock

Status: implemented locally for the reviewed website branch; no production deployment or new business message was sent by this change.

Both English and Simplified Chinese landing pages now have one persistent contact dock. Desktop uses a compact floating bar; narrow layouts use two responsive buttons with a 50-pixel minimum height. The primary **Start a Partnership / 洽谈合作** action targets `#contact`; the secondary WhatsApp action opens the existing public 929 destination. The contact section also has a WhatsApp link. The previous mobile-only strip is removed, so the two bars cannot overlap.

The dock uses the current light/dark palette, device safe-area spacing, bottom page clearance and focus scroll margins. The optional Analytics panel sits above it and scrolls if the viewport is short. Secondary confirmation/privacy pages do not show a new-inquiry dock. The header also offers FAQ and Start a Partnership, with an opaque theme-matched surface and bordered controls; all navigation remains visible on narrow screens. The actual form submission button reads Send My Campaign Brief / 提交合作需求.

## Attribution and measurement

WhatsApp opens with a short, fixed message stating paid-partnership interest and a source note: Hammad Media website, language and either floating CTA or contact section. It never includes visitor-entered form data, inquiry references, campaign query parameters or hidden identifiers. The visitor can edit or remove this note before sending.

| Action | Browser event | Fixed parameters |
| --- | --- | --- |
| Header inquiry link | `inquiry_cta_click` | `cta_location=header` |
| Dock inquiry link | `inquiry_cta_click` | `cta_location=sticky` |
| Dock WhatsApp link | `contact_click` | `contact_method=whatsapp`, `cta_location=sticky` |
| Contact-section WhatsApp link | `contact_click` | `contact_method=whatsapp`, `cta_location=contact` |

The existing tracker adds `site_language` and a query-free page location. It never records the WhatsApp URL, phone number, message text or link text. Review previews remain silent and Analytics consent does not gate contact navigation.

These clicks are contact intent, not proof of a received message or an accepted form inquiry. Neither action emits `generate_lead`; that event remains tied to a matching durable API receipt. Counting a WhatsApp click as a separate contact conversion must not inflate canonical CRM opportunity or revenue counts.

## CRM handoff after a real received WhatsApp message

An anonymous click creates no CRM row, qualification, automatic reply or assignment. A real message received on WhatsApp 929 follows the existing **Lina → approved Lead Pipeline → canonical Notion Lead Ledger** process. The source note supports website attribution in the canonical record if the visitor retains it. Preserve the WhatsApp channel and existing sticky owner; do not reassign it to Nour merely because the visitor came from the website. Separate real business opportunities remain separate, and existing no-chase and outbound-approval rules remain binding.

The earlier Grok handoff was not resent for this preview change. Include the finalized CTA behavior once in the eventual production handoff.

## Verification

`test/contact-dock.test.js` checks the generated bilingual links, exactly one dock, source notes, correct 929 destination, contact placement labels, no lead event on click and silent preview/blocked Analytics. All 60 frontend tests pass, including existing metrics, policy, receipt, consent and attribution checks. Isolated browser checks cover 24 combinations of English/Chinese, dark/light and desktop/tablet/phone/landscape widths. The dock stays within the viewport, both buttons remain at least 50 pixels tall, and form/footer keyboard focus stays above it. The local QA report is `../private/design-qa/profile-cards-2026-09-08/layout-checks.json`; a separate 16-case local consent check also passed without touching production. Hosted review remains a release step.
