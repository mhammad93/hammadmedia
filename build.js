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
// TikTok Shop badge — trichrome note (official path) + stacked wordmark
const shopBadge =
  '<span class="shop-badge" aria-hidden="true">' +
  '<svg viewBox="0 0 24 24" class="sb-note">' +
  '<path fill="#25F4EE" transform="translate(-0.9,-0.45)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>' +
  '<path fill="#FE2C55" transform="translate(0.9,0.45)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>' +
  '<path fill="#161823" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>' +
  '</svg>' +
  '<span class="sb-text"><b>TikTok</b>Shop</span>' +
  '</span>';


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

function buildPodCard(c, i) {
  const cells = [];
  if (c.bestMonth)
    cells.push(`<div class="m"><span class="mv">${money(c.bestMonth)}</span><span class="ml">Best month</span></div>`);
  if (c.totalViews)
    cells.push(`<div class="m"><span class="mv">${esc(c.totalViews)}</span><span class="ml">Total views</span></div>`);
  if (c.videoUrl && c.videoViews)
    cells.push(`<div class="m"><a class="mv mv-link" href="${esc(c.videoUrl)}" target="_blank" rel="noopener">${esc(c.videoViews)} &#9654;</a><span class="ml">Top video</span></div>`);
  const metrics = cells.length ? `\n        <div class="pod-metrics">${cells.join("")}</div>` : "";
  return `      <div class="pod">
        <span class="pod-rank">0${i + 1}</span>
        <div class="product-shot">${shopBadge}<img src="${esc(c.image)}" alt="${esc(c.title)} product" width="800" height="800" loading="lazy"></div>
        <h3>${esc(c.title)}</h3>
        <div class="pod-ytd">${money(c.ytd)}</div>
        <div class="pod-ytd-lbl">Total sales &middot; <b>${c.units.toLocaleString("en-US")}</b> units sold</div>
        <div class="bar"><span style="width:${barPct(c.ytd)}%"></span></div>${metrics}
      </div>`;
}

const cardsArr = receipts ? receipts.items.map((c, i) => buildPodCard(c, i)) : [];

const caseStudiesSection = receipts
  ? `<section id="results" class="light light-alt">
  <div class="wrap">
    <h2 class="section-title">The receipts</h2>
    <p class="section-sub">${esc(receipts.sub)}</p>
    <div class="podium">
${cardsArr.slice(0, 3).join("\n")}
    </div>
    <div class="shelf" aria-label="More winning products — scroll horizontally">
${cardsArr.slice(3).join("\n")}
    </div>
    <a class="mail-cta" href="#contact">Slot 07 is open &mdash; put your product on this wall &rarr;</a>
  </div>
</section>`
  : "";

const serviceSteps = content.services.steps
  .map(
    (s) => `      <div class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`,
  )
  .join("\n");

const partnershipSection = content.partnership
  ? `<section id="partner" class="light light-alt">
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
    <a class="mail-cta" href="#contact">Claim a slot &rarr;</a>
  </div>
</section>`
  : "";

const brandWall = (content.brands || []).length
  ? `<div class="brandwall" aria-label="Brands whose products I have sold">
${content.brands
  .map(
    (b) => `      <img src="${esc(b.logo)}" alt="${esc(b.name)} logo" height="28" loading="lazy">`,
  )
  .join("\n")}
    </div>`
  : "";

const faqSection = content.faq
  ? `<section id="faq" class="light">
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
      <input type="hidden" name="_next" value="https://hammadmedia.com/thanks.html">
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
            <option>Boosted Commission (pay on sales only)</option>
            <option>Retainer + Commission</option>
            <option>Exclusive (own the category)</option>
            <option>Not sure yet &mdash; recommend one</option>
          </select>
        </div>
      </div>
      <div><label for="f-shop">TikTok Shop product link <span class="optional">(optional)</span></label><input id="f-shop" name="shop_link" placeholder="https://shop.tiktok.com/&hellip;"></div>
      <div><label for="f-msg">Tell me about your product</label><textarea id="f-msg" name="message" required placeholder="What's the product, what commission do you have in mind, and what does success look like for you?"></textarea></div>
      <button type="submit">Send inquiry &rarr;</button>
    </form>
    <p class="alt-contact">Prefer email? <a href="mailto:${esc(content.contact.email)}?subject=Brand%20partnership%20inquiry%20%E2%80%94%20HammadMedia.com">${esc(content.contact.email)}</a> &mdash; same 24-hour reply either way.</p>`
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
fs.copyFileSync(path.join(ROOT, "thanks.html"), path.join(ROOT, "dist", "thanks.html"));
console.log(`Built dist/index.html (${html.length} bytes)`);
