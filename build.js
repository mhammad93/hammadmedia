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
  .map((a) => {
    const avatar = a.avatar
      ? `<img class="avatar" src="${esc(a.avatar)}" alt="@${esc(a.handle)} TikTok profile picture" width="320" height="320" loading="lazy">`
      : "";
    return `      <div class="card account-card">
        ${avatar}
        <div class="meta">${esc(a.niche)}${a.followers ? ` &middot; ${esc(a.followers)}` : ""}</div>
        <h3><a class="handle" href="${esc(a.url)}" target="_blank" rel="noopener">@${esc(a.handle)}</a></h3>
        <p>${esc(a.blurb)}</p>
      </div>`;
  })
  .join("\n");

const money = (n) => "$" + n.toLocaleString("en-US");
const receipts = content.receipts;
const maxYtd = receipts ? Math.max(...receipts.items.map((i) => i.ytd)) : 1;
const barPct = (ytd) => Math.max(4, Math.round((ytd / maxYtd) * 100));

const podiumCards = receipts
  ? receipts.items
      .map((c, i) => {
        const video = c.videoUrl
          ? `\n        <a class="watch" href="${esc(c.videoUrl)}" target="_blank" rel="noopener">&#9654; Watch the ${esc(c.videoViews)}-view video &rarr;</a>`
          : "";
        const meta = [
          `<b>${c.units.toLocaleString("en-US")}</b> units sold`,
          c.bestMonth ? `<span class="best">best month ${money(c.bestMonth)}</span>` : null,
        ]
          .filter(Boolean)
          .join(" &middot; ");
        return `      <div class="pod">
        <span class="pod-rank">0${i + 1}</span>
        <div class="product-shot"><img src="${esc(c.image)}" alt="${esc(c.title)} product" width="800" height="800" loading="lazy"></div>
        <h3>${esc(c.title)}</h3>
        <div class="pod-ytd">${money(c.ytd)}</div>
        <div class="bar"><span style="width:${barPct(c.ytd)}%"></span></div>
        <div class="pod-meta">${meta}</div>${video}
      </div>`;
      })
      .join("\n")
  : "";

const caseStudiesSection = receipts
  ? `<section id="results" class="light light-alt">
  <div class="wrap">
    <h2 class="section-title">The receipts</h2>
    <p class="section-sub">I put ${esc(receipts.tested)} products through the same test this year. ${esc(receipts.past10k)} cleared $10K. These eight broke out &mdash; combined attributed GMV across both accounts, ${esc(receipts.asOf)}.</p>
    <div class="podium">
${podiumCards}
    </div>
  </div>
</section>`
  : "";

const serviceSteps = content.services.steps
  .map(
    (s) => `      <div class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`,
  )
  .join("\n");

const partnershipSection = content.partnership
  ? `<section id="partner" class="light">
  <div class="wrap">
    <h2 class="section-title">${esc(content.partnership.heading)}</h2>
    <p class="section-sub">${esc(content.partnership.sub)}</p>
    <div class="cards tiers">
${content.partnership.tiers
  .map(
    (t) => `      <div class="card tier">
        <div class="meta">${esc(t.tag)}</div>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.text)}</p>
      </div>`,
  )
  .join("\n")}
    </div>
    <div class="note">${esc(content.partnership.note)}</div>
  </div>
</section>`
  : "";

const brandWall = (content.brands || []).length
  ? `<div class="brandwall" aria-label="Brands whose products I have sold">
${content.brands
  .map(
    (b) => `      <img src="${esc(b.logo)}" alt="${esc(b.name)} logo" height="34" loading="lazy">`,
  )
  .join("\n")}
    </div>`
  : "";

const faqSection = content.faq
  ? `<section id="faq" class="light light-alt">
  <div class="wrap">
    <h2 class="section-title">${esc(content.faq.heading)}</h2>
    <div class="faq-list">
${content.faq.items
  .map(
    (f) => `      <details>
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>`,
  )
  .join("\n")}
    </div>
  </div>
</section>`
  : "";

const contactBlock = content.contact.formSubmitEmail
  ? `    <form action="https://formsubmit.co/${esc(content.contact.formSubmitEmail)}" method="POST">
      <input type="hidden" name="_subject" value="New brand inquiry — HammadMedia.com">
      <input type="hidden" name="_template" value="table">
      <input type="hidden" name="_captcha" value="false">
      <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="form-row">
        <div><label for="f-brand">Brand name</label><input id="f-brand" name="brand" required placeholder="Acme Wellness Co."></div>
        <div><label for="f-email">Work email</label><input id="f-email" type="email" name="email" required placeholder="you@brand.com"></div>
      </div>
      <div class="form-row">
        <div><label for="f-category">Product category</label>
          <select id="f-category" name="category" required>
            <option value="" disabled selected>Choose one&hellip;</option>
            <option>Supplements</option>
            <option>Wellness</option>
            <option>Beauty &amp; personal care</option>
            <option>Other</option>
          </select>
        </div>
        <div><label for="f-tier">Engagement interest</label>
          <select id="f-tier" name="engagement" required>
            <option value="" disabled selected>Choose one&hellip;</option>
            <option>Performance (boosted commission)</option>
            <option>Retainer + Performance</option>
            <option>Exclusive (category exclusivity)</option>
            <option>Not sure yet</option>
          </select>
        </div>
      </div>
      <div><label for="f-shop">TikTok Shop product link <span class="optional">(optional)</span></label><input id="f-shop" name="shop_link" placeholder="https://shop.tiktok.com/&hellip;"></div>
      <div><label for="f-msg">Tell me about your product</label><textarea id="f-msg" name="message" required placeholder="What is it, what makes it sell, and what does success look like for you?"></textarea></div>
      <button type="submit">Send inquiry &rarr;</button>
    </form>
    <p class="alt-contact">Prefer email? <a href="mailto:${esc(content.contact.email)}?subject=Brand%20partnership%20inquiry%20%E2%80%94%20HammadMedia.com">${esc(content.contact.email)}</a></p>`
  : `    <a class="mail-cta" href="mailto:${esc(content.contact.email)}?subject=Brand%20partnership%20inquiry%20%E2%80%94%20HammadMedia.com">Email me: ${esc(content.contact.email)}</a>`;

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
  partnershipSection,
  contactBlock,
  brandWall,
  faqSection,
  "legal.disclaimer": esc(content.legal.disclaimer),
  "legal.privacy": esc(content.legal.privacy),
  "site.ogImage": esc(content.site.ogImage),
  "site.url": esc(content.site.url),
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
