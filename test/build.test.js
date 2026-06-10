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
  assert.ok(html.includes("$1.1M in attributed sales"), "sexy-numbers sub missing");
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
  assert.ok(html.includes(">Best month</span>"), "Best month metric label missing");
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
  for (const field of ['name="brand"', 'name="email"', 'name="category"', 'name="engagement"', 'name="message"']) {
    assert.ok(html.includes(field), `form field missing: ${field}`);
  }
  assert.ok(html.includes('name="_honey"'), "honeypot missing");
  assert.ok(html.includes('name="_subject"'), "_subject missing");
  assert.ok(html.includes(`mailto:${content.contact.email}`), "secondary email option missing");
  assert.ok(
    html.includes('name="_next" value="https://hammadmedia.com/thanks.html"'),
    "_next redirect missing",
  );
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "thanks.html")), "thanks.html missing from dist");
  assert.ok(html.includes("Boosted Commission (pay on sales only)"), "form options must match tier names");
  assert.ok(html.includes("what commission do you have in mind"), "commission qualifier missing from textarea");
  assert.ok(html.includes("$1,000 per video"), "per-video retainer floor missing");
  assert.ok(html.includes("$25,000"), "30-video package price missing");
  assert.ok(html.includes("$13,500"), "15-video package price missing");
  assert.ok(html.includes("$50,000 per month"), "niche-exclusivity floor missing");
  assert.ok(html.includes("performance bonuses move you to the top"), "bonus-priority line missing");
  assert.ok(html.includes("No fixed number of videos"), "boosted no-guarantee line missing");
  assert.ok(html.includes("No long-term contract"), "month-to-month line missing");
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
    (html.match(/&#9654;<\/a>/g) || []).length,
    withVideo,
    "play glyph missing from Top-video links",
  );
  assert.ok(html.includes('fill="#25F4EE"') && html.includes('fill="#FE2C55"'), "trichrome note colors missing");
  assert.strictEqual(content.accounts[0].handle, "Drew.Review", "Drew.Review must be the left card");
  assert.ok(
    html.indexOf("@Drew.Review<") < html.indexOf("@Drew.Review1<"),
    "Drew.Review card must render before Drew.Review1",
  );
});

test("summit award proof card renders with image and caption", () => {
  assert.ok(html.includes('src="assets/award-summit.jpg"'), "award photo missing");
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "award-summit.jpg")), "award photo missing from dist");
  assert.ok(html.includes("Health Creators of the Year, 2025"), "award caption missing");
});

test("conversion path: CTAs at peak-proof moments + sticky mobile bar", () => {
  assert.ok(html.includes("Slot 07 is open"), "post-receipts slot CTA missing");
  assert.ok(html.includes("Claim a slot"), "post-tiers CTA missing");
  assert.ok(html.includes('class="mobile-cta"'), "sticky mobile CTA bar missing");
  const contactLinks = (html.match(/href="#contact"/g) || []).length;
  assert.ok(contactLinks >= 5, `expected ≥5 paths to #contact, got ${contactLinks}`);
});

test("design integrity: bg alternation, animation fill mode, 416M stat", () => {
  assert.ok(html.includes('id="partner" class="light light-alt"'), "partner section must be cream");
  assert.ok(html.includes('id="faq" class="light"') && !html.includes('id="faq" class="light light-alt"'), "faq must be paper");
  assert.ok(!html.includes("#services.light"), "stale #services background clause still present");
  assert.ok(html.includes("animation: rise backwards"), "scroll animation must use backwards fill");
  assert.ok(!html.includes("animation: rise both"), "fill-mode bug reintroduced");
  assert.ok(html.includes("416M+"), "all-time views stat missing");
  assert.ok(html.includes("VIDEO VIEWS — ALL TIME"), "all-time label missing");
});

test("stacked brand wordmark present in nav and footer with accessible labels", () => {
  const brandLinks = html.match(/class="brand"[^>]*aria-label="[^"]{5,}"/g) || [];
  assert.ok(brandLinks.length >= 2, "expected brand wordmark links in nav and footer");
  assert.ok(html.includes('class="brand-top">HAMMAD<'), "HAMMAD top line missing");
  assert.ok(html.includes('class="brand-sub">MEDIA<'), "MEDIA sub line missing");
  assert.ok(!html.includes("logo-web.png\" alt"), "old image logo still in page");
});

test("product images + avatars render with alts and exist in dist", () => {
  for (const c of content.receipts.items) {
    assert.ok(html.includes(`src="${c.image}"`), `receipt image missing: ${c.image}`);
  }
  for (const a of content.accounts) {
    if (!a.avatar) continue;
    assert.ok(html.includes(`src="${a.avatar}"`), `avatar missing: ${a.avatar}`);
    assert.ok(html.includes(`alt="@${a.handle} TikTok profile picture"`), `avatar alt missing for ${a.handle}`);
    assert.ok(fs.existsSync(path.join(ROOT, "dist", a.avatar)), `dist missing ${a.avatar}`);
  }
  // every non-decorative img must have non-empty alt
  const badImgs = (html.match(/<img(?![^>]*aria-hidden)[^>]*>/g) || []).filter(
    (t) => !/alt="[^"]+"/.test(t) && !t.includes('alt=""'),
  );
  assert.strictEqual(badImgs.length, 0, `imgs without alt: ${badImgs.join(" | ")}`);
});

test("recalled product (Rosabella Moringa) is not showcased", () => {
  assert.ok(!/moringa/i.test(html), "Moringa still on page — FDA-recalled product must not be showcased");
});

test("partnership tiers render; commission-only positioning is gone", () => {
  for (const t of content.partnership.tiers) {
    assert.ok(html.includes(t.name), `tier missing: ${t.name}`);
  }
  assert.ok(!/commission-only/i.test(html), "old commission-only copy still present");
  assert.ok(!/no retainers/i.test(html), "old no-retainers copy still present");
  assert.ok(/retainer/i.test(html), "retainer offering not mentioned");
});

test("brand wall, FAQ, and legal lines render", () => {
  for (const b of content.brands) {
    assert.ok(html.includes(`alt="${b.name} logo"`), `brand logo missing: ${b.name}`);
    assert.ok(fs.existsSync(path.join(ROOT, "dist", b.logo)), `dist missing ${b.logo}`);
  }
  assert.strictEqual((html.match(/<details>/g) || []).length, content.faq.items.length, "FAQ count mismatch");
  for (const f of content.faq.items) assert.ok(html.includes(f.q), `FAQ missing: ${f.q}`);
  assert.ok(html.includes("do not imply sponsorship or endorsement"), "trademark disclaimer missing");
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
  assert.ok(html.includes("#1 TikTok Shop Health &amp; Wellness Affiliate 2025"), "ranked title missing");
  assert.ok((html.match(/#1<\/b> Health/g) || []).length >= 2, "marquee #1 ranking missing");
});

test("og/social meta present with absolute image URL", () => {
  assert.ok(html.includes('property="og:image" content="https://hammadmedia.com/assets/og.jpg"'));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('rel="canonical" href="https://hammadmedia.com"'));
});

test("no personal names on the page", () => {
  assert.ok(!/alison/i.test(html), "Alison name still present");
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
