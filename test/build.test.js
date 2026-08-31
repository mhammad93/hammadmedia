const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist", "index.html");
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "content.json"), "utf8"));

// Build once before assertions
execFileSync("node", [path.join(ROOT, "build.js")], { stdio: "pipe" });
const html = fs.readFileSync(DIST, "utf8");

test("build produces non-trivial HTML document", () => {
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.length > 5000);
});

test("no unresolved template tokens remain", () => {
  assert.strictEqual(html.match(/\{\{[^}]+\}\}/g), null);
});

test("every headline stat appears in output", () => {
  for (const s of content.stats) {
    assert.ok(html.includes(s.value), `stat value ${s.value} missing`);
    assert.ok(html.includes(s.label), `stat label ${s.label} missing`);
  }
});

test("every account handle appears with its tiktok link", () => {
  for (const a of content.accounts) {
    assert.ok(html.includes(`@${a.handle}`), `handle ${a.handle} missing`);
    assert.ok(html.includes(a.url), `url for ${a.handle} missing`);
  }
});

test("receipts: 3 podium + 3 shelf cards, sexy-numbers sub, metric grid, sane bars", () => {
  assert.strictEqual(content.receipts.items.length, 6);
  assert.strictEqual((html.match(/class="pod"/g) || []).length, 6, "card count");
  assert.ok(html.includes('class="shelf"'), "scroll-snap shelf missing");
  assert.ok(!html.includes("ledger-row"), "ledger style must be gone");
  assert.ok(html.includes("$1.1M in sales"), "sexy-numbers sub missing");
  assert.ok(!html.includes("1,110"), "products-tested framing must be gone");
  for (const item of content.receipts.items) {
    const moneyStr = "$" + item.ytd.toLocaleString("en-US");
    assert.ok(html.includes(moneyStr), `YTD figure missing: ${moneyStr}`);
    assert.ok(fs.existsSync(path.join(ROOT, "dist", item.image)), `dist missing ${item.image}`);
  }
  for (const m of html.matchAll(/class="bar"><span style="width:(\d+)%"/g)) {
    const w = Number(m[1]);
    assert.ok(w >= 4 && w <= 100, `bar width out of range: ${w}%`);
  }
  assert.ok(html.includes(`width:100%`), "top product must have full-width bar");
  assert.strictEqual((html.match(/class="bar"/g) || []).length, 6, "every card carries a scale bar");
  assert.ok(html.includes(">Best single month</span>"), "Best single month metric label missing");
  assert.ok(html.includes(">Top video</span>"), "Top video metric label missing");
  assert.ok((html.match(/units sold/g) || []).length >= 6, "units must be spelled out on every card");
  assert.ok(!/\d u</.test(html), "cryptic 'u' abbreviation must not appear");
  assert.ok(!/gut health bundle/i.test(html), "dropped Gut Health entry still present");
});

test("contact: FormSubmit form with qualification fields, honeypot, and secondary email", () => {
  assert.ok(
    html.includes(`action="https://formsubmit.co/${content.contact.formSubmitEmail}"`),
    "FormSubmit action missing",
  );
  assert.ok(
    html.includes('action="https://formsubmit.co/contact@hammadmedia.com"'),
    "FormSubmit must post to contact@hammadmedia.com",
  );
  assert.ok(
    !html.includes("formsubmit.co/mohamed.hammad.reply@gmail.com"),
    "old Gmail FormSubmit destination must not remain",
  );
  for (const field of ['name="brand"', 'name="email"', 'name="category"', 'name="engagement"', 'name="message"']) {
    assert.ok(html.includes(field), `form field missing: ${field}`);
  }
  assert.ok(html.includes('name="_honey"'), "honeypot missing");
  assert.ok(html.includes('name="_subject"'), "_subject missing");
  assert.ok(html.includes('name="_captcha" value="true"'), "FormSubmit captcha must be enabled");
  assert.ok(!html.includes('name="_captcha" value="false"'), "FormSubmit captcha must not stay disabled");
  assert.ok(/FormSubmit processes/i.test(html), "privacy must disclose FormSubmit processing");
  assert.ok(/Google Analytics/i.test(html), "Google Analytics disclosure missing");
  assert.ok(html.includes(`mailto:${content.contact.email}`), "secondary email option missing");
  assert.ok(
    html.includes('name="_next" value="https://hammadmedia.com/thanks.html"'),
    "_next redirect missing",
  );
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "thanks.html")), "thanks.html missing from dist");
  assert.ok(html.includes("Starter (5 videos)"), "form options must match tier names");
  assert.ok(html.includes("Volume (10 videos)"), "10-video form option missing");
  assert.ok(html.includes("Volume (15 videos)"), "15-video form option missing");
  assert.ok(html.includes("Volume (30 videos)"), "30-video form option missing");
  assert.ok(html.includes("Category Exclusivity"), "exclusivity form option missing");
  assert.ok(!html.includes("Retainer + Commission"), "retired retainer form option still present");
  assert.ok(!html.includes("Exclusive (own the category)"), "retired exclusive form option still present");
  assert.ok(html.includes("function syncCategoryRequired"), "category-required handler missing");
  assert.ok(html.includes("Your product, and anything you want me to know."), "textarea single-ask placeholder missing");
  assert.ok(html.includes("I reply within 24 hours."), "24-hour reply microcopy missing");
  assert.ok(html.includes("$5,000"), "starter 5-video price missing");
  assert.ok(html.includes("$9,500"), "10-video package price missing");
  assert.ok(html.includes("$13,500"), "15-video package price missing");
  assert.ok(html.includes("$25,000"), "30-video package price missing");
  assert.ok(html.includes("$50,000 per 30-day period"), "category-reservation price missing");
  assert.ok(/bonuses move you to the top/i.test(html), "bonus-priority line missing");
  assert.ok(/no long-term contract/i.test(html), "month-to-month line missing");
});

test("TikTok Shop badge on every product box; play glyph on video links; account order", () => {
  assert.strictEqual(
    (html.match(/class="ti"/g) || []).length,
    content.accounts.length,
    "mono logomark belongs on handle cards only",
  );
  assert.strictEqual(
    (html.match(/class="shop-badge"/g) || []).length,
    content.receipts.items.length,
    "every product box carries the TikTok Shop badge",
  );
  const withVideo = content.receipts.items.filter((c) => c.videoUrl).length;
  assert.strictEqual(
    (html.match(/<span aria-hidden="true">&#9654;<\/span><\/a>/g) || []).length,
    withVideo,
    "decorative play glyph missing from Top-video links",
  );
  assert.strictEqual(
    (html.match(/aria-label="Top video for [^"]+ views on TikTok \(opens in new tab\)"/g) || []).length,
    withVideo,
    "accessible names missing from Top-video links",
  );
  assert.ok(html.includes('fill="#25F4EE"') && html.includes('fill="#FE2C55"'), "trichrome note colors missing");
  assert.strictEqual(content.accounts[0].handle, "Drew.Review", "Drew.Review must be the left card");
  assert.ok(
    html.indexOf("@Drew.Review<") < html.indexOf("@Drew.Review1<"),
    "Drew.Review card must render before Drew.Review1",
  );
});

test("funnel strip renders verified metrics with provenance caption", () => {
  for (const m of content.funnel.items) {
    assert.ok(html.includes(m.value), `funnel value missing: ${m.value}`);
  }
  assert.ok(html.includes(content.funnel.title), "funnel title missing");
  assert.ok(html.includes("TikTok Shop dashboards"), "provenance caption missing");
  assert.ok(html.includes("105M+ product views"), "efficiency-at-scale frame missing");
  assert.ok(!/completion/i.test(html), "completion % must never appear (unmeasured)");
});

test("summit award proof card renders with image and caption", () => {
  assert.ok(html.includes('src="assets/award-summit.webp"'), "award photo missing");
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "award-summit.webp")), "award photo missing from dist");
  assert.ok(html.includes("Health Creators of the Year, Short Video, 2025"), "award caption missing");
  assert.ok(html.includes("ranked first in the Short Video category by TikTok Shop itself"), "award attribution line missing");
  assert.ok(!/official proof/i.test(html), "self-referential proof language must stay gone");
});

test("panel synthesis: tier prices, commission select, new FAQs, WhatsApp, nav links", () => {
  // tier prices are split into stacked spans, so compare against tag-stripped text
  const flatText = html.replace(/<[^>]+>/g, "");
  for (const price of ["$5,000 for 5 videos", "$9,500 for 10 videos", "$13,500 for 15 videos", "$25,000 for 30 videos", "$50,000 per 30-day period"]) {
    assert.ok(flatText.includes(price), `tier price line missing: ${price}`);
  }
  assert.strictEqual((html.match(/class="tier-price"/g) || []).length, 5, "starter + 3 volume + exclusivity price lines");
  assert.strictEqual((html.match(/class="tp-figure"/g) || []).length, 5, "lead price figures");
  assert.strictEqual((html.match(/class="tier-cta"/g) || []).length, 5, "per-package CTAs");
  assert.strictEqual((html.match(/data-tier="/g) || []).length, 5, "tier preselect data attrs");
  assert.ok(html.includes("volume-cards"), "volume packages must share one equal-prominence row");
  assert.ok(html.includes('id="exclusivity"'), "exclusivity module missing");
  assert.ok(html.indexOf("volume-cards") < html.indexOf('id="exclusivity"'), "exclusivity must come after video packages");
  assert.ok(!html.includes('class="cards tiers"'), "exclusivity must not sit in the video-package row");
  assert.ok(html.includes("Creator-led production. No routine draft approvals, revision rounds, or reshoots unless expressly agreed in writing."), "production policy missing");
  assert.ok(html.includes("Invoices are issued by Hammad Media LLC and paid 100% upfront."), "invoice policy missing");
  assert.ok((html.match(/Total sales (&mdash;|—) Jan 1(&ndash;|–)Jun 8, 2026/g) || []).length >= 6, "dated Jan 1–Jun 8 sales kickers");
  assert.ok((html.match(/Views &mdash; all time|Views — all time/g) || []).length >= 5, "all-time views labels");
  assert.ok(html.includes('name="commission" required'), "commission select missing");
  assert.ok(html.includes("30% or higher"), "commission options missing");
  assert.ok(html.includes("How do you want to work together?"), "engagement label rename missing");
  assert.strictEqual(content.faq.items.length, 9, "FAQ count");
  assert.ok(html.includes("Spark authorization is available only for the specific videos"), "scoped Spark policy missing");
  assert.ok(html.includes("Hammad Media LLC, a registered US company"), "cross-border FAQ missing");
  assert.ok(html.includes("wa.me/19297709434"), "WhatsApp link missing");
  assert.ok(html.includes("See the proof"), "ghost CTA rename missing");
  assert.ok(html.includes('class="nav-links"'), "desktop nav links missing");
  assert.ok(html.includes('class="midflow"'), "sticky wrapper missing");
  assert.ok(!html.includes("padding-bottom: 76px"), "old fixed-bar body padding still present");
  assert.ok(html.includes('autocomplete="organization"'), "autocomplete attrs missing");
  assert.ok(html.includes('class="form-hint"'), "form hint missing");
});

test("conversion path: CTAs at peak-proof moments + sticky mobile bar", () => {
  assert.ok(html.includes("Your product could be next"), "post-receipts availability CTA missing");
  assert.ok(html.includes('href="#partner">Your product could be next'), "receipts availability CTA must go to packages, not skip to the form");
  assert.ok(html.includes("Check availability"), "post-tiers availability CTA missing");
  assert.ok(html.includes('class="mobile-cta"'), "sticky mobile CTA bar missing");
  const contactLinks = (html.match(/href="#contact"/g) || []).length;
  assert.ok(contactLinks >= 5, `expected ≥5 paths to #contact, got ${contactLinks}`);
  assert.ok(html.includes("@media (max-width: 360px)"), "360px CTA wrapping rules missing");
  assert.ok(html.includes(".mobile-cta.is-occluded"), "sticky occlusion hide-state missing");
  assert.ok(html.includes("scroll-padding-bottom"), "sticky scroll padding missing");
  assert.ok(html.includes("function focusHashTarget"), "anchor focus helper missing");
  assert.ok(!html.includes("padding-bottom: 76px"), "old fixed-bar body padding still present");
});

test("design integrity: bg alternation, animation fill mode, 416M stat", () => {
  assert.ok(html.includes('id="partner" class="light light-alt"'), "partner section must be cream");
  assert.ok(html.includes('id="faq" class="light"') && !html.includes('id="faq" class="light light-alt"'), "faq must be paper");
  assert.ok(!html.includes("#services.light"), "stale #services background clause still present");
  assert.ok(html.includes("animation: rise-move backwards"), "scroll animation must be transform-only with backwards fill (visible at rest)");
  assert.ok(!html.includes("animation: rise backwards"), "opacity-gated scroll animation reintroduced");
  assert.ok(!html.includes("animation: rise both"), "fill-mode bug reintroduced");
  assert.ok(html.includes("416M+"), "all-time views stat missing");
  assert.ok(html.includes("VIDEO VIEWS — ALL TIME"), "all-time label missing");
});

test("logo image present in nav and footer with accessible labels", () => {
  const brandLinks = html.match(/class="brand"[^>]*aria-label="[^"]{5,}"/g) || [];
  assert.ok(brandLinks.length >= 2, "expected brand links in nav and footer");
  assert.strictEqual(
    (html.match(/class="logo-img" src="assets\/logo-v2\.webp" alt="Hammad Media"/g) || []).length,
    2,
    "logo image must appear in nav and footer",
  );
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "logo-v2.webp")), "logo file missing from dist");
});

test("preview-only form checks do not post a live inquiry", () => {
  assert.ok(html.includes('action="https://formsubmit.co/contact@hammadmedia.com"'), "preview must still target the production inbox path");
  assert.ok(html.includes('id="f-tier"'), "engagement field missing");
  assert.ok(html.includes('id="f-category"'), "category field missing");
  assert.ok(html.includes("syncCategoryRequired"), "exclusivity category requirement is preview-tested in markup only");
  assert.ok(!html.includes("formsubmit.co/ajax"), "must not auto-post inquiries from tests");
});

test("product images + avatars render with alts and exist in dist", () => {
  for (const c of content.receipts.items) {
    assert.ok(html.includes(`src="${c.image}"`), `receipt image missing: ${c.image}`);
  }
  for (const a of content.accounts) {
    if (!a.avatar) continue;
    assert.ok(html.includes(`src="${a.avatar}"`), `avatar missing: ${a.avatar}`);
    assert.ok(html.includes(`<img class="avatar" src="${a.avatar}" alt=""`), `avatar must be decorative (alt="") for ${a.handle}`);
    assert.ok(fs.existsSync(path.join(ROOT, "dist", a.avatar)), `dist missing ${a.avatar}`);
  }
  assert.strictEqual((html.match(/width="216" height="216"/g) || []).length, 2, "both avatars should declare 216×216 intrinsic dims");
  // every non-decorative img must have non-empty alt
  const badImgs = (html.match(/<img(?![^>]*aria-hidden)[^>]*>/g) || []).filter(
    (t) => !/alt="[^"]+"/.test(t) && !t.includes('alt=""'),
  );
  assert.strictEqual(badImgs.length, 0, `imgs without alt: ${badImgs.join(" | ")}`);
});

test("recalled product (Rosabella Moringa) is not showcased", () => {
  assert.ok(!/moringa/i.test(html), "Moringa still on page — FDA-recalled product must not be showcased");
});

test("partnership packages render; commission-only positioning is gone", () => {
  assert.ok(html.includes(content.partnership.starter.name), "starter package missing");
  assert.ok(html.includes(content.partnership.volume.name), "volume heading missing");
  for (const p of content.partnership.volume.packages) {
    assert.ok(html.includes(p.name), `volume package missing: ${p.name}`);
    assert.ok(html.includes(`data-tier="${p.formValue}"`), `volume CTA missing: ${p.formValue}`);
  }
  assert.ok(html.includes(content.exclusivity.name), "exclusivity module title missing");
  assert.ok(/no videos included/i.test(html), "exclusivity must say no videos included");
  assert.ok(!/no retainers/i.test(html), "old no-retainers copy still present");
  assert.ok(/I do not offer commission-only or gifted-only campaigns/i.test(html), "must state commission-only and gifted-only are not offered");
});

test("brand wall, FAQ, and legal lines render", () => {
  for (const b of content.brands) {
    assert.ok(html.includes(`alt="${b.name} logo"`), `brand logo missing: ${b.name}`);
    assert.ok(fs.existsSync(path.join(ROOT, "dist", b.logo)), `dist missing ${b.logo}`);
  }
  assert.strictEqual((html.match(/<details>/g) || []).length, content.faq.items.length, "FAQ count mismatch");
  for (const f of content.faq.items) assert.ok(html.includes(f.q), `FAQ missing: ${f.q}`);
  assert.ok(html.includes("do not mean that any brand sponsors or endorses this site"), "trademark disclaimer missing");
  assert.ok(html.includes('id="privacy"'), "privacy note missing");
});

test("SEO: robots.txt, sitemap.xml, and valid JSON-LD structured data", () => {
  const robots = fs.readFileSync(path.join(ROOT, "dist", "robots.txt"), "utf8");
  assert.ok(robots.includes("Sitemap: https://hammadmedia.com/sitemap.xml"), "robots must point to sitemap");
  assert.ok(robots.includes("Disallow: /thanks.html"), "thanks page must be disallowed");
  const sitemap = fs.readFileSync(path.join(ROOT, "dist", "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("<loc>https://hammadmedia.com/</loc>"), "sitemap must list homepage");
  assert.ok(!sitemap.includes("thanks"), "noindex page must not be in sitemap");

  const m = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
  assert.ok(m, "JSON-LD script missing");
  const data = JSON.parse(m[1]);
  const types = data["@graph"].map((n) => n["@type"]);
  assert.deepStrictEqual(types.sort(), ["FAQPage", "ProfessionalService", "WebSite"]);
  const faq = data["@graph"].find((n) => n["@type"] === "FAQPage");
  assert.strictEqual(faq.mainEntity.length, content.faq.items.length, "FAQPage must mirror visible FAQ");
  const org = data["@graph"].find((n) => n["@type"] === "ProfessionalService");
  for (const a of content.accounts) {
    assert.ok(org.sameAs.includes(a.url), `sameAs missing ${a.url}`);
  }
  assert.ok(html.includes('property="og:site_name"'), "og:site_name missing");
  assert.ok(html.includes("Hammad Media | Creator-led TikTok Shop campaigns"), "creator-led title missing");
  assert.ok(
    (html.match(/TikTok Shop Summit/g) || []).length >= 2,
    "Summit award wording missing from page/metadata",
  );
  assert.ok(!html.includes("#1 TikTok Shop Health"), "retired #1 Health &amp; Wellness Affiliate title must be gone");
  assert.ok(!html.includes("#1 Health &amp; Wellness Affiliate"), "retired #1 Health &amp; Wellness Affiliate kicker must be gone");
});

test("og/social meta present with absolute image URL", () => {
  assert.ok(html.includes('property="og:image" content="https://hammadmedia.com/assets/og.jpg"'));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('rel="canonical" href="https://hammadmedia.com/"'), "canonical must include trailing slash");
  assert.ok(html.includes('property="og:url" content="https://hammadmedia.com/"'), "og:url must include trailing slash");
  assert.ok(html.includes('property="og:image:width" content="1200"'), "og:image:width missing");
  assert.ok(html.includes('property="og:image:height" content="630"'), "og:image:height missing");
  const authorizedOgAlt =
    "Creator-led TikTok Shop campaigns for supplement and wellness brands. Paid packages start at 5 videos for $5,000 upfront, plus TikTok Shop commission.";
  assert.ok(
    html.includes(`property="og:image:alt" content="${authorizedOgAlt}"`),
    "og:image:alt must be the authorized description only",
  );
  assert.ok(
    !/property="og:image:alt" content="I turn supplements into bestsellers/i.test(html),
    "og:image:alt must not lead with the H1",
  );
  assert.ok(html.includes('name="twitter:image" content="https://hammadmedia.com/assets/og.jpg"'), "twitter:image must use og.jpg");
});

test("og.jpg is the corrected 1200x630 share image and its generator dropped the #1 title", () => {
  const ogPath = path.join(ROOT, "assets", "og.jpg");
  const distOg = path.join(ROOT, "dist", "assets", "og.jpg");
  assert.ok(fs.existsSync(ogPath), "assets/og.jpg missing");
  assert.ok(fs.existsSync(distOg), "dist/assets/og.jpg missing — share chrome would still ship the old file");
  const buf = fs.readFileSync(ogPath);
  assert.strictEqual(buf[0], 0xff);
  assert.strictEqual(buf[1], 0xd8);
  let w = 0;
  let h = 0;
  for (let i = 2; i < Math.min(buf.length, 65536); ) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const seglen = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      h = buf.readUInt16BE(i + 5);
      w = buf.readUInt16BE(i + 7);
      break;
    }
    i += 2 + seglen;
  }
  assert.strictEqual(w, 1200);
  assert.strictEqual(h, 630);
  const generator = fs.readFileSync(path.join(ROOT, "tools", "make_og.py"), "utf8");
  assert.ok(!generator.includes("#1 Health & Wellness Affiliate"), "make_og.py still paints the retired #1 title");
  assert.ok(generator.includes("TikTok Shop Summit — Health Creators of the Year, Short Video, 2025"), "make_og.py must use Summit language");
  assert.ok(generator.includes("GMV, Jan 1–Jun 8, 2026"), "make_og.py must date the GMV line");
});

test("no personal names on the page outside the authorized WhatsApp prefill", () => {
  const withoutWa = html.replace(/https:\/\/wa\.me\/[^"'\s]+/gi, "");
  assert.ok(!/alison/i.test(withoutWa), "Alison name still present outside WhatsApp prefill");
  assert.ok(/Hi Alison/.test(decodeURIComponent((html.match(/https:\/\/wa\.me\/[^"'\s]+/i) || [""])[0])), "WhatsApp prefill must address Alison");
  assert.ok(!/mohamed|mohammed/i.test(html.replace(/formsubmit\.co\/[^"]+/g, "")), "Mohammed name present outside form action");
});

test("internal anchors resolve to real element ids", () => {
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  for (const a of anchors) {
    assert.ok(html.includes(`id="${a}"`), `anchor #${a} has no matching id`);
  }
});

test("commission figures are never published", () => {
  // Spec: Est. commission stays private. Guard against accidental inclusion.
  assert.ok(!/commission base/i.test(html));
  assert.ok(!/est\.? commission/i.test(html));
  for (const figure of ["$898", "$13,888", "$357,262", "$147,412", "$19,622", "$716.55", "$14,433", "$30,492", "$7,782"]) {
    assert.ok(!html.includes(figure), `private commission figure ${figure} leaked`);
  }
});

test("retired public prices and commission-only offer are gone", () => {
  assert.ok(!html.includes("$0 upfront — commission only"), "retired $0 commission-only price still present");
  assert.ok(!html.includes("10 for $9,000"), "retired 10-for-$9,000 package still present");
  assert.ok(!html.includes("$18,000"), "retired 20-video $18,000 package still present");
  assert.ok(!html.includes("complete health & wellness exclusivity"), "retired full-vertical exclusivity still present");
  assert.ok(!html.includes("complete health and wellness exclusivity"), "retired full-vertical exclusivity still present");
  assert.ok(!html.includes("Boosted Commission (pay on sales only)"), "retired commission-only form option still present");
});

test("Google tag present exactly once on every page", () => {
  // Google: one gtag per page, immediately after <head>. Never zero, never two.
  const thanks = fs.readFileSync(path.join(ROOT, "dist", "thanks.html"), "utf8");
  for (const [name, page] of [["index", html], ["thanks", thanks]]) {
    assert.strictEqual((page.match(/googletagmanager\.com\/gtag\/js\?id=G-NEX74824JL/g) || []).length, 1, `${name}: gtag loader count wrong`);
    assert.strictEqual((page.match(/gtag\('config', 'G-NEX74824JL'\)/g) || []).length, 1, `${name}: gtag config count wrong`);
  }
});

test("fonts are self-hosted with preload", () => {
  assert.ok(!html.includes("fonts.googleapis.com"), "Google Fonts CSS still referenced");
  assert.ok(!html.includes("fonts.gstatic.com"), "gstatic preconnect still referenced");
  assert.strictEqual((html.match(/rel="preload" href="assets\/fonts\/[a-z-]+\.woff2" as="font" type="font\/woff2" crossorigin/g) || []).length, 3, "3 font preloads expected");
  assert.strictEqual((html.match(/@font-face/g) || []).length, 3, "3 @font-face blocks expected");
  for (const f of ["fraunces-roman", "fraunces-italic", "manrope"]) {
    const fp = path.join(ROOT, "dist", "assets", "fonts", `${f}.woff2`);
    assert.ok(fs.existsSync(fp), `${f}.woff2 missing from dist`);
    const buf = fs.readFileSync(fp);
    assert.strictEqual(buf.subarray(0, 4).toString("latin1"), "wOF2", `${f}.woff2 is not a real woff2 file`);
    assert.ok(buf.length > 10000, `${f}.woff2 suspiciously small (${buf.length} bytes)`);
  }
  const thanks = fs.readFileSync(path.join(ROOT, "dist", "thanks.html"), "utf8");
  assert.ok(!thanks.includes("fonts.googleapis.com"), "thanks.html still uses Google Fonts");
  assert.strictEqual((thanks.match(/@font-face/g) || []).length, 3, "thanks.html should declare 3 font faces");
  assert.strictEqual((thanks.match(/rel="preload" href="assets\/fonts\/[a-z-]+\.woff2"/g) || []).length, 3, "thanks.html should preload 3 fonts");
});

test("hero text animations are transform-only (LCP not opacity-gated)", () => {
  assert.ok(html.includes("@keyframes rise-move"), "rise-move keyframes missing");
  for (const d of ["", " .08s", " .16s"]) {
    assert.ok(html.includes(`animation: rise-move .7s${d} ease both`), `rise-move${d} declaration missing`);
    assert.ok(!html.includes(`animation: rise .7s${d} ease both`), `opacity-gated rise${d} still present on hero text`);
  }
  assert.ok(html.includes("animation: rise .7s .24s ease both"), "actions should keep the fade entrance");
});

test("optimized image formats with intrinsic dimensions", () => {
  assert.strictEqual((html.match(/assets\/logo-v2\.webp/g) || []).length, 2, "nav + footer logo should be webp");
  assert.ok(html.includes('src="assets/award-summit.webp"'), "award photo should be webp");
  assert.strictEqual((html.match(/avatar-drew-review1?\.webp/g) || []).length, 2, "both avatars should be webp");
  assert.ok(!/assets\/(award-summit\.jpg|logo-v2\.png|products\/avatar-[^"]+\.jpg)/.test(html), "old heavy formats still referenced");
  const brandImgs = [...html.matchAll(/<img src="assets\/brands\/[^>]+>/g)];
  assert.strictEqual(brandImgs.length, 6, "6 brand logos expected");
  for (const m of brandImgs) {
    assert.ok(/width="\d+"/.test(m[0]) && /height="28"/.test(m[0]), `brand logo missing width: ${m[0]}`);
  }
  assert.ok(html.includes('property="og:image" content="https://hammadmedia.com/assets/og.jpg"'), "og:image must stay JPG for social crawlers");
  assert.ok((html.match(/width="480" height="480" loading="lazy" decoding="async"/g) || []).length >= 6, "packshots must be resized and lazy-loaded");
  assert.ok(!html.includes('loading="eager"'), "non-critical packshots must not force eager load");
  for (const item of content.receipts.items) {
    const bytes = fs.statSync(path.join(ROOT, item.image)).size;
    assert.ok(bytes < 50000, `${item.image} still oversized (${bytes} bytes)`);
  }
});

test("production build is indexable (no robots meta on index)", () => {
  assert.ok(!html.includes('name="robots"'), "dist/index.html must never carry a robots meta — noindex is injected only in the Pages workflow");
});

test("raw masters never ship to dist", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "dist", "assets", "raw")), "assets/raw must not be copied into dist");
});

test("ProfessionalService declares service area and price range", () => {
  const m = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
  assert.ok(m, "ld+json script missing");
  const graph = JSON.parse(m[1])["@graph"];
  const ps = graph.find((n) => n["@type"] === "ProfessionalService");
  assert.strictEqual(ps.areaServed, "United States");
  assert.strictEqual(ps.priceRange, "$5,000 - $50,000+");
});

test("vercel.json keeps the redirect and security headers", () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  assert.ok(v.redirects.some((r) => r.source === "/index.html" && r.destination === "/" && r.permanent === true), "/index.html redirect missing");
  const all = v.headers.flatMap((h) => h.headers.map((x) => x.key));
  for (const k of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy", "Cache-Control"]) {
    assert.ok(all.includes(k), `header ${k} missing from vercel.json`);
  }
});

test("infra: favicon.ico and 404.html ship in dist", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "favicon.ico")), "favicon.ico missing from dist");
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "404.html")), "404.html missing from dist");
  const nf = fs.readFileSync(path.join(ROOT, "dist", "404.html"), "utf8");
  assert.ok(nf.includes('name="robots" content="noindex"'), "404 page must be noindex");
  assert.ok(nf.includes('src="/assets/'), "404 assets must be root-absolute");
});

test("infra: marquee is generated from content.json sources (no drift)", () => {
  const m = html.match(/<div class="track">([\s\S]*?)<\/div>/);
  assert.ok(m, "marquee track missing");
  const track = m[1];
  assert.ok(track.includes(`<b>${content.hero.gmvYtd}</b> GMV Jan 1&ndash;Jun 8, 2026`), "marquee GMV must come from hero.gmvYtd with dated window");
  const views = content.stats.find((x) => x.label.includes("PRODUCT VIEWS"));
  const units = content.stats.find((x) => x.label.includes("UNITS SOLD"));
  assert.ok(track.includes(`<b>${views.value}</b> product views Jan 1&ndash;Jun 8, 2026`), "marquee product views must use the closed window");
  assert.ok(track.includes(`<b>${units.value}</b> units sold Jan 1&ndash;Jun 8, 2026`), "marquee units sold must use the closed window");
  for (const kw of ["UNITS SOLD", "PRODUCT VIEWS", "VIDEO VIEWS"]) {
    const s = content.stats.find((x) => x.label.includes(kw));
    assert.ok(track.includes(`<b>${s.value}</b>`), `marquee missing stat ${s.value}`);
  }
  const top = "$" + Math.max(...content.receipts.items.map((i) => i.ytd)).toLocaleString("en-US");
  assert.ok(track.includes(`<b>${top}</b> from one product`), "marquee top-product figure must match receipts max");
  const dup = html.match(/\{\{marquee\}\}/g);
  assert.strictEqual(dup, null, "marquee token unresolved");
});

test("audit corrections: banned claims absent; authorized copy present", () => {
  assert.ok(html.includes('href="#partner">View paid packages'), "hero CTA must go to pricing");
  assert.ok(html.includes("Paid video packages start at $5,000 upfront, plus TikTok Shop commission."), "hero price note missing");
  assert.ok(html.includes("Paid packages from $5,000"), "sticky bar wording missing");
  assert.ok(html.includes('class="mobile-cta" href="#contact"'), "sticky bar must go to inquiry");
  assert.ok(!html.includes("Let's make yours a bestseller"), "retired guaranteed-result CTA still present");
  assert.ok(!html.includes("Send your product"), "sample-starts-campaign CTA still present");
  assert.ok(!/I turn your product into a bestseller/i.test(html), "guaranteed-outcome metadata still present");
  assert.ok(!html.includes("I win only when you win."), "retired I-win-only line still present");
  assert.ok(!/48 hours/i.test(html), "48-hour publishing promise must be absent");
  assert.ok(!/48-hour/i.test(html), "48-hour publishing promise must be absent");
  assert.ok(!html.includes("Slot 07 is open"), "retired slot CTA still present");
  assert.ok(!/four new products/i.test(html), "fixed monthly capacity still published");
  assert.ok(!/I never promote competing products/i.test(html), "broad exclusivity claim still present");
  assert.ok(!/any of my videos/i.test(html), "unlimited Spark language still present");
  assert.ok(!/I give you an authorization code/i.test(html), "standing Spark authorization still present");
  assert.ok(html.includes("Spark authorization is available only for the specific videos"), "scoped Spark policy missing");
  assert.ok(!/2026 so far/i.test(html), "stale 2026-so-far label still present");
  assert.ok(html.includes("Jan 1–Jun 8, 2026") || html.includes("Jan 1&ndash;Jun 8, 2026"), "dated window missing");
  assert.ok(html.includes("$8M+"), "verified all-time GMV missing");
  assert.ok(html.includes('action="https://formsubmit.co/contact@hammadmedia.com"'), "FormSubmit destination drifted");
  assert.ok(!html.includes("$0 upfront"), "retired $0 offer still present");
  assert.ok(!html.includes("$9,000"), "retired $9,000 price still present");
  assert.ok(!html.includes("$18,000"), "retired $18,000 price still present");
  const desc = 'content="' + content.site.description.replace(/"/g, "&quot;") + '"';
  assert.ok(html.includes(desc), "meta description must match site.description");
  assert.ok(!/^Send the sample/i.test(content.site.description), "metadata must not begin with Send the sample");
  const m = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
  const graph = JSON.parse(m[1])["@graph"];
  const ps = graph.find((n) => n["@type"] === "ProfessionalService");
  assert.strictEqual(ps.award, "TikTok Shop Summit — Health Creators of the Year, Short Video, 2025");
  assert.strictEqual(ps.description, content.site.description);
  const faq = graph.find((n) => n["@type"] === "FAQPage");
  const faqText = faq.mainEntity.map((q) => q.acceptedAnswer.text).join(" ");
  assert.ok(!/48 hours/i.test(faqText), "JSON-LD FAQ still promises 48 hours");
  assert.ok(faqText.includes("first-video timing is confirmed in writing"), "JSON-LD first-video timing must match page");
});

test("commission-only 10k-units qualification branch is not required", () => {
  assert.ok(!html.includes("syncBoostedQual"), "retired Boosted qualification JS must be gone");
  assert.ok(!html.includes('name="boosted_10k_units"'), "retired 10k-units form field must be gone");
  assert.ok(!html.includes('id="f-units-row"'), "retired qualification row must be gone");
  assert.ok(!html.includes("Has this product already sold 10,000+ units on TikTok Shop?"), "retired 10k-units question must be gone");
});

test("public copy uses creator-led language and omits retired claims", () => {
  assert.ok(html.includes("Every campaign remains creator-led. I personally write, film, and appear in the content, while editing follows my direction and established production standards."), "creator-led production line missing");
  assert.ok(html.includes("You work directly with Hammad Media's creator-led team without agency account-manager layers."), "creator-led team line missing");
  assert.ok(html.includes("Choose and pay for a package"), "how-it-works step 1 missing");
  assert.ok(html.includes("Prepare for production"), "how-it-works step 2 missing");
  assert.ok(html.includes("Creator-led production and measurable sales"), "how-it-works step 3 missing");
  assert.ok(html.includes("no routine draft approvals, revision rounds, or reshoots unless expressly agreed in writing"), "FAQ/pricing draft policy must allow a written exception");
  assert.ok(!html.includes("I do not send drafts. I do not re-film after brand notes."), "absolute no-drafts FAQ still present");
  const thanks = fs.readFileSync(path.join(ROOT, "dist", "thanks.html"), "utf8");
  assert.ok(
    thanks.includes("Every campaign remains creator-led. I personally write, film, and appear in the content, while editing follows my direction and established production standards."),
    "thanks.html must use the full authorized creator-led sentence",
  );
  assert.ok(html.includes("After payment is confirmed, the product is in hand, TikTok Shop commission is active, and the campaign is scheduled, the first-video timing is confirmed in writing."), "first-video timing line missing");
  assert.ok(html.includes("For paid campaigns, Hammad Media LLC invoices 100% upfront. Payment can be bank transfer or PayPal invoice. TikTok Shop separately pays the agreed sales commission automatically."), "international invoice line missing");
  assert.ok(!html.includes("You pay upfront by bank transfer."), "leftover bank-transfer payment line still present");
  assert.ok(!html.includes("For retainers, Hammad Media LLC sends you an invoice."), "duplicate retainer-invoice sentence still present");
  assert.ok(!html.includes("No editors."), "retired no-editors claim still present");
  assert.ok(!html.includes("I plan, film, edit, and post everything myself."), "retired personally-edits claim still present");
  assert.ok(!html.includes("I make every review video myself"), "retired I-make-every-video claim still present");
  assert.ok(!html.includes("The person who replies is the person who makes your videos."), "retired person-who-replies claim still present");
  assert.ok(!html.includes("I write, film, and post every video myself."), "retired solo-production hero line still present");
  assert.ok(!/dedicated editor|video editor|cuts to my spec|finishes the cut/i.test(html), "editor disclosure must not appear");
  assert.ok(!html.includes("Commission-only deals need no payment setup at all."), "retired commission-only FAQ line still present");
});
