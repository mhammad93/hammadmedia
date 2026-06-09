#!/usr/bin/env node
/** Build dist/index.html from template.html + content.json. Zero dependencies. */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "content.json"), "utf8"));
let html = fs.readFileSync(path.join(ROOT, "template.html"), "utf8");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Composite fragments ──────────────────────────────────────

const statsCards = content.stats
  .map(
    (s) => `      <div class="stat"><div class="num">${esc(s.value)}</div><div class="lbl">${esc(s.label)}</div></div>`,
  )
  .join("\n");

const accountCards = content.accounts
  .map(
    (a) => `      <div class="card">
        <div class="meta">${esc(a.niche)}</div>
        <h3><a class="handle" href="${esc(a.url)}" target="_blank" rel="noopener">@${esc(a.handle)}</a></h3>
        <p>${esc(a.blurb)}</p>
      </div>`,
  )
  .join("\n");

const caseStudiesSection = content.caseStudies.length
  ? `<section id="results" class="light" style="border-top: 1px solid var(--line-light);">
  <div class="wrap">
    <h2 class="section-title">The receipts</h2>
    <p class="section-sub">Real products, real single-month results — straight from our TikTok Shop dashboards.</p>
    <div class="cards">
${content.caseStudies
  .map((c) => {
    const link = c.videoUrl
      ? `\n        <p style="margin-top:10px;"><a class="handle" href="${esc(c.videoUrl)}" target="_blank" rel="noopener">Watch the video &rarr;</a></p>`
      : "";
    return `      <div class="card">
        <h3>${esc(c.title || "Campaign")}</h3>
        <p>${esc(c.result)}</p>${link}
      </div>`;
  })
  .join("\n")}
    </div>
  </div>
</section>`
  : "";

const serviceSteps = content.services.steps
  .map(
    (s) => `      <div class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`,
  )
  .join("\n");

const contactBlock = content.contact.formspreeId
  ? `    <form action="https://formspree.io/f/${esc(content.contact.formspreeId)}" method="POST">
      <div><label for="f-brand">Brand name</label><input id="f-brand" name="brand" required></div>
      <div><label for="f-email">Work email</label><input id="f-email" type="email" name="email" required></div>
      <div><label for="f-category">Product category</label><input id="f-category" name="category" required></div>
      <div><label for="f-shop">TikTok Shop link (optional)</label><input id="f-shop" name="shop_link"></div>
      <div><label for="f-msg">Tell us about your product</label><textarea id="f-msg" name="message" required></textarea></div>
      <button type="submit">Send &rarr;</button>
    </form>`
  : `    <a class="mail-cta" href="mailto:${esc(content.contact.email)}?subject=Brand%20partnership%20inquiry%20%E2%80%94%20HammadMedia.com">Email us: ${esc(content.contact.email)}</a>`;

// ── Token replacement ────────────────────────────────────────

const tokens = {
  "site.title": esc(content.site.title),
  "site.description": esc(content.site.description),
  "site.brandName": esc(content.site.brandName),
  "site.statsUpdated": esc(content.site.statsUpdated),
  "hero.headline": esc(content.hero.headline),
  "hero.subheadline": esc(content.hero.subheadline),
  "services.heading": esc(content.services.heading),
  "services.note": esc(content.services.note),
  "contact.heading": esc(content.contact.heading),
  "contact.subheading": esc(content.contact.subheading),
  "contact.email": esc(content.contact.email),
  year: String(new Date().getFullYear()),
  statsCards,
  accountCards,
  caseStudiesSection,
  serviceSteps,
  contactBlock,
};

for (const [key, value] of Object.entries(tokens)) {
  html = html.split(`{{${key}}}`).join(value);
}

const leftover = html.match(/\{\{[^}]+\}\}/g);
if (leftover) {
  console.error("Unresolved template tokens:", leftover);
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist", "index.html"), html);

// Copy static assets (logo etc.) into dist
const assetsSrc = path.join(ROOT, "assets");
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, path.join(ROOT, "dist", "assets"), { recursive: true });
}
console.log(`Built dist/index.html (${html.length} bytes)`);
