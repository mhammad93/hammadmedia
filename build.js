#!/usr/bin/env node
/** Build dist/index.html from template.html + content.json. Zero dependencies. */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "content.json"), "utf8"));
let html = fs.readFileSync(path.join(ROOT, "template.html"), "utf8");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// FAQ-only: escape, then allow **bold** emphasis
const emph = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const plain = (s) => String(s).replace(/\*\*/g, "");

// ── Composite fragments ──────────────────────────────────────
// Mono TikTok logomark for handle links
const tiktokIcon =
  '<svg class="ti" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';

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
      ? `<img class="avatar" src="${esc(a.avatar)}" alt="" width="216" height="216" loading="lazy">`
      : "";
    return `      <div class="card account-card">
        <div class="acct-head">
          ${avatar}
          <div class="acct-id">
            <h3><a class="handle" href="${esc(a.url)}" target="_blank" rel="noopener">${tiktokIcon}@${esc(a.handle)}<span class="sr-only"> (opens in new tab)</span></a></h3>
            <div class="meta">${esc(a.niche)}${a.followers ? ` &middot; ${esc(a.followers)}` : ""}</div>
          </div>
        </div>
        <div class="pod-metrics">
          <div class="m"><span class="mv">${esc(a.gmv)}</span><span class="ml">GMV &mdash; 2026 so far</span></div>
          <div class="m"><span class="mv">${esc(a.units)}</span><span class="ml">Units sold &mdash; 2026 so far</span></div>
          <div class="m"><span class="mv">${esc(a.views)}</span><span class="ml">Product views &mdash; 2026 so far</span></div>
        </div>
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
    cells.push(`<div class="m"><span class="mv">${money(c.bestMonth)}</span><span class="ml">Best single month</span></div>`);
  if (c.totalViews)
    cells.push(`<div class="m"><span class="mv">${esc(c.totalViews)}</span><span class="ml">Views &mdash; all time</span></div>`);
  if (c.videoUrl && c.videoViews)
    cells.push(`<div class="m"><a class="mv mv-link" href="${esc(c.videoUrl)}" target="_blank" rel="noopener" aria-label="Top video for ${esc(c.title)} — ${esc(c.videoViews)} views on TikTok (opens in new tab)">${esc(c.videoViews)} <span aria-hidden="true">&#9654;</span></a><span class="ml">Top video</span></div>`);
  const metrics = cells.length ? `\n        <div class="pod-metrics">${cells.join("")}</div>` : "";
  return `      <div class="pod">
        <span class="pod-rank">0${i + 1}</span>
        <div class="product-shot">${shopBadge}<img src="${esc(c.image)}" alt="${esc(c.alt || `${c.title} product`)}" width="800" height="800" loading="eager" fetchpriority="low"></div>
        <h3>${esc(c.title)}</h3>
        <div class="pod-kicker">Total sales &mdash; 2026 so far</div>
        <div class="pod-ytd">${money(c.ytd)}</div>
        <div class="pod-ytd-lbl"><b>${c.units.toLocaleString("en-US")}</b> units sold</div>
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
    <div class="shelf" role="region" aria-label="Products 4 to 6" tabindex="0">
${cardsArr.slice(3).join("\n")}
    </div>
    <a class="mail-cta" href="#contact">Slot 07 is open &mdash; put your product on this wall &rarr;</a>
  </div>
</section>`
  : "";


const funnelStrip = content.funnel
  ? `    <div class="funnel-card">
      <div class="funnel-intro">
        <h3>${esc(content.funnel.title)}</h3>
        <p class="funnel-frame">${esc(content.funnel.frame)}</p>
        <p class="funnel-prov">${esc(content.funnel.caption)}</p>
      </div>
${content.funnel.items
  .map(
    (m) => `      <div class="fm"><span class="fm-v">${esc(m.value)}</span><span class="fm-l">${esc(m.label)}</span></div>`,
  )
  .join("\n")}
    </div>`
  : "";

const serviceSteps = content.services.steps
  .map(
    (s) => `      <div class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`,
  )
  .join("\n");

// Tier price: split on ' · ' into stacked spans — lead figure big, qualifier as kicker, bundle lines small
const tierPrice = (price) => {
  const parts = String(price).split(" · ");
  const lead = parts.shift();
  const m = lead.match(/^((?:From )?\$[\d,]+)\s+(.*)$/);
  const leadHtml = m
    ? `<span class="tp-figure">${esc(m[1])}</span> <span class="tp-qual">${esc(m[2])}</span>`
    : `<span class="tp-figure">${esc(lead)}</span>`;
  return leadHtml + parts.map((p) => `<span class="tp-line">${esc(p)}</span>`).join("");
};

// Per-tier CTAs: data-tier preselects the #f-tier engagement select (inline JS in template); plain anchor is the no-JS fallback
const tierCtas = [
  { label: "$0 upfront &mdash; start here &rarr;", value: "Boosted Commission (pay on sales only)" },
  { label: "Book this month's videos &rarr;", value: "Retainer + Commission" },
  { label: "Ask if your category is still open &rarr;", value: "Exclusive (own the category)" },
];

const partnershipSection = content.partnership
  ? `<section id="partner" class="light light-alt">
  <div class="wrap">
    <h2 class="section-title">${esc(content.partnership.heading)}</h2>
    <p class="section-sub">${esc(content.partnership.sub)}</p>
    <div class="cards tiers">
${content.partnership.tiers
  .map(
    (t, i) => `      <div class="card tier">
        <div class="meta">${esc(t.tag)}</div>
        <h3>${esc(t.name)}</h3>
        <div class="tier-price">${tierPrice(t.price)}</div>
        <p>${esc(t.text)}</p>
        ${tierCtas[i] ? `<a class="tier-cta" href="#contact" data-tier="${esc(tierCtas[i].value)}">${tierCtas[i].label}</a>` : ""}
      </div>`,
  )
  .join("\n")}
    </div>
    <div class="note"><p>${esc(content.partnership.note)
      .replace("four new products each month, no more", "<b>four new products each month, no more</b>")
      .replace(" You could mail samples", "</p><p>You could mail samples")}</p></div>
    <a class="mail-cta" href="#contact">Claim a slot &rarr;</a>
  </div>
</section>`
  : "";

const brandWall = (content.brands || []).length
  ? `<div class="brandwall" role="group" aria-label="Brands whose products I have sold">
${content.brands
  .map(
    (b) => `      <img src="${esc(b.logo)}" alt="${esc(b.name)} logo" width="${b.width}" height="28" loading="lazy">`,
  )
  .join("\n")}
    </div>`
  : "";

const faqSection = content.faq
  ? `<section id="faq" class="light">
  <div class="wrap">
    <h2 class="section-title">${esc(content.faq.heading)}</h2>
    <p class="section-sub">${esc(content.faq.sub)}</p>
    <div class="faq-list">
${content.faq.items
  .map((f) => {
    const bullets = f.bullets
      ? `\n        <ul>${f.bullets.map((x) => `<li>${emph(x)}</li>`).join("")}</ul>`
      : "";
    const tail = f.tail ? `\n        <p>${emph(f.tail)}</p>` : "";
    return `      <details>
        <summary>${esc(f.q)}</summary>
        <p>${emph(f.a)}</p>${bullets}${tail}
      </details>`;
  })
  .join("\n")}
    </div>
  </div>
</section>`
  : "";

const contactBlock = content.contact.formSubmitEmail
  ? `    <p class="form-hint">All fields are required unless marked optional.</p>
    <form action="https://formsubmit.co/${esc(content.contact.formSubmitEmail)}" method="POST">
      <input type="hidden" name="_subject" value="New brand inquiry — HammadMedia.com">
      <input type="hidden" name="_template" value="table">
      <input type="hidden" name="_captcha" value="false">
      <input type="hidden" name="_next" value="https://hammadmedia.com/thanks.html">
      <input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="form-row">
        <div><label for="f-brand">Brand name</label><input id="f-brand" name="brand" required autocomplete="organization" placeholder="Your brand name" aria-describedby="f-brand-err"><p class="err" id="f-brand-err" hidden>Enter your brand name</p></div>
        <div><label for="f-email">Work email</label><input id="f-email" type="email" name="email" required autocomplete="email" placeholder="you@brand.com" aria-describedby="f-email-err"><p class="err" id="f-email-err" hidden>Enter a work email like you@brand.com</p></div>
      </div>
      <div class="form-row">
        <div><label for="f-category">Product category <span class="optional">(optional)</span></label>
          <select id="f-category" name="category">
            <option value="" disabled selected>Choose one&hellip;</option>
            <option>Supplements</option>
            <option>Wellness</option>
            <option>Beauty &amp; personal care</option>
            <option>Other</option>
          </select>
        </div>
        <div><label for="f-commission">Commission you can offer</label>
          <select id="f-commission" name="commission" required aria-describedby="f-commission-err">
            <option value="" disabled selected>Choose one&hellip;</option>
            <option>20&ndash;25%</option>
            <option>25&ndash;30%</option>
            <option>30% or higher</option>
            <option>Below 20%</option>
            <option>Not sure &mdash; recommend a rate</option>
          </select>
          <p class="err" id="f-commission-err" hidden>Choose a commission range</p>
        </div>
      </div>
      <div class="form-row">
        <div><label for="f-tier">How do you want to work together?</label>
          <select id="f-tier" name="engagement" required aria-describedby="f-tier-err">
            <option value="" disabled selected>Choose one&hellip;</option>
            <option>Boosted Commission (pay on sales only)</option>
            <option>Retainer + Commission</option>
            <option>Exclusive (own the category)</option>
            <option>Not sure yet &mdash; recommend one</option>
          </select>
          <p class="err" id="f-tier-err" hidden>Choose how you want to work together</p>
        </div>
        <div><label for="f-shop">TikTok Shop product link <span class="optional">(optional)</span></label><input id="f-shop" name="shop_link" inputmode="url" autocomplete="url" autocapitalize="none" spellcheck="false" placeholder="https://shop.tiktok.com/&hellip;"></div>
      </div>
      <div><label for="f-msg">Tell me about your product</label><textarea id="f-msg" name="message" required placeholder="Your product, and anything you want me to know." aria-describedby="f-msg-err"></textarea><p class="err" id="f-msg-err" hidden>Tell me about your product</p></div>
      <div class="form-ctas">
        <button type="submit">Send inquiry &rarr;</button>
        <a class="btn-secondary" href="https://wa.me/${String(content.contact.whatsapp).replace(/[^0-9]/g, "")}?text=Hi%20Hammad%20%E2%80%94%20I%20have%20a%20supplement%20brand%20on%20TikTok%20Shop%20and%20want%20to%20talk%20about%20a%20partnership" target="_blank" rel="noopener">Or message me on WhatsApp<span class="sr-only"> (opens in new tab)</span></a>
      </div>
      <p class="form-hint">I reply within 24 hours.</p>
    </form>
    <p class="alt-contact">Prefer email? <a href="mailto:${esc(content.contact.email)}?subject=Brand%20partnership%20inquiry%20%E2%80%94%20HammadMedia.com">${esc(content.contact.email)}</a> &mdash; same 24-hour reply either way.</p>`
  : `    <a class="mail-cta" href="mailto:${esc(content.contact.email)}?subject=Brand%20partnership%20inquiry%20%E2%80%94%20HammadMedia.com">Email me: ${esc(content.contact.email)}</a>`;

// ── Marquee: generated from content.json so the numbers can never drift from their sources ──

const statByLabel = (kw) => content.stats.find((s) => s.label.includes(kw));
const topProductYtd = money(Math.max(...content.receipts.items.map((i) => i.ytd)));
const productNames = content.receipts.items.map((i) => esc(i.title.split(" ")[0])).join(" &middot; ");
const followersTotalK = Math.round(
  content.accounts.reduce((sum, a) => sum + parseFloat(String(a.followers).replace(/[^\d.]/g, "")), 0),
);
const marquee = [
  `<span><b>${esc(content.hero.gmvYtd)}</b> GMV in 2026</span>`,
  `<span><b>${esc(statByLabel("PRODUCT VIEWS").value)}</b> product views</span>`,
  `<span><b>${esc(statByLabel("UNITS SOLD").value)}</b> units sold</span>`,
  `<span>${productNames}</span>`,
  `<span><b>${esc(statByLabel("VIDEO VIEWS").value)}</b> video views &middot; <b>${topProductYtd}</b> from one product</span>`,
  `<span><b>#1</b> Health &amp; Wellness affiliate &mdash; TikTok Shop 2025 &middot; <b>${followersTotalK}K+</b> followers</span>`,
  `<span>Boosted commissions &middot; retainers &middot; exclusivity</span>`,
].join("");

// ── SEO: JSON-LD structured data (generated from content.json so it can never drift from visible copy) ──

const jsonld = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ProfessionalService",
      "@id": `${content.site.url}/#org`,
      name: "Hammad Media",
      url: content.site.url,
      email: content.contact.email,
      description: content.site.description,
      logo: `${content.site.url}/assets/favicon-512.png`,
      image: content.site.ogImage,
      telephone: "+1-201-552-0786",
      areaServed: "United States",
      priceRange: "$1,000 - $50,000+",
      award: "TikTok Shop US #1 Health & Wellness affiliate, 2025",
      sameAs: content.accounts.map((a) => a.url),
    },
    {
      "@type": "WebSite",
      "@id": `${content.site.url}/#website`,
      name: "Hammad Media",
      url: content.site.url,
      publisher: { "@id": `${content.site.url}/#org` },
    },
    {
      "@type": "FAQPage",
      "@id": `${content.site.url}/#faqpage`,
      mainEntity: content.faq.items.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: plain([f.a, ...(f.bullets || []), f.tail].filter(Boolean).join(". ")).replace(/\.\s*\./g, "."),
        },
      })),
    },
  ],
}).replace(/</g, "\\u003c");
const jsonldTag = `<script type="application/ld+json">${jsonld}</script>`;

// ── Token replacement ────────────────────────────────────────

const tokens = {
  jsonld: jsonldTag,
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
  funnelStrip,
  caseStudiesSection,
  serviceSteps,
  partnershipSection,
  contactBlock,
  brandWall,
  faqSection,
  marquee,
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

// Copy static assets (logo etc.) into dist — raw/ masters never ship
const assetsSrc = path.join(ROOT, "assets");
const rawDir = path.join(assetsSrc, "raw");
fs.rmSync(path.join(ROOT, "dist", "assets"), { recursive: true, force: true });
if (fs.existsSync(assetsSrc)) {
  fs.cpSync(assetsSrc, path.join(ROOT, "dist", "assets"), {
    recursive: true,
    filter: (src) => src !== rawDir && !src.startsWith(rawDir + path.sep),
  });
}
fs.copyFileSync(path.join(ROOT, "thanks.html"), path.join(ROOT, "dist", "thanks.html"));
fs.copyFileSync(path.join(ROOT, "robots.txt"), path.join(ROOT, "dist", "robots.txt"));
fs.copyFileSync(path.join(ROOT, "404.html"), path.join(ROOT, "dist", "404.html"));
fs.copyFileSync(path.join(ROOT, "favicon.ico"), path.join(ROOT, "dist", "favicon.ico"));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${content.site.url}/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
fs.writeFileSync(path.join(ROOT, "dist", "sitemap.xml"), sitemap);
console.log(`Built dist/index.html (${html.length} bytes) + sitemap + robots`);
