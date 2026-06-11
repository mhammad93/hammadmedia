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
  assert.ok(html.includes("Your product, and anything you want me to know."), "textarea single-ask placeholder missing");
  assert.ok(html.includes("I reply within 24 hours."), "24-hour reply microcopy missing");
  assert.ok(html.includes("$1,000 per video"), "per-video retainer floor missing");
  assert.ok(html.includes("$18,000"), "20-video package price missing");
  assert.ok(html.includes("$9,000"), "10-video package price missing");
  assert.ok(html.includes("$13,500"), "15-video package price missing");
  assert.ok(html.includes("$50,000 per month"), "niche-exclusivity floor missing");
  assert.ok(/bonuses move you to the top/i.test(html), "bonus-priority line missing");
  assert.ok(/no fixed number of videos/i.test(html), "boosted no-guarantee line missing");
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
  assert.ok(html.includes("Health Creators of the Year, 2025"), "award caption missing");
  assert.ok(html.includes("ranked first in the Short Video category by TikTok Shop itself"), "award attribution line missing");
  assert.ok(!/official proof/i.test(html), "self-referential proof language must stay gone");
});

test("panel synthesis: tier prices, commission select, new FAQs, WhatsApp, nav links", () => {
  // tier prices are split into stacked spans, so compare against tag-stripped text
  const flatText = html.replace(/<[^>]+>/g, "");
  for (const price of ["$0 upfront — commission only", "From $1,000 per video", "From $50,000 per month"]) {
    assert.ok(flatText.includes(price), `tier price line missing: ${price}`);
  }
  assert.strictEqual((html.match(/class="tier-price"/g) || []).length, 3, "tier price lines");
  assert.strictEqual((html.match(/class="tp-figure"/g) || []).length, 3, "lead price figures");
  assert.strictEqual((html.match(/class="tier-cta"/g) || []).length, 3, "per-tier CTAs");
  assert.strictEqual((html.match(/data-tier="/g) || []).length, 3, "tier preselect data attrs");
  assert.ok((html.match(/Total sales (&mdash;|—) 2026 so far/g) || []).length >= 6, "2026-so-far sales kickers");
  assert.ok((html.match(/Views &mdash; all time|Views — all time/g) || []).length >= 5, "all-time views labels");
  assert.ok(html.includes('name="commission" required'), "commission select missing");
  assert.ok(html.includes("30% or higher"), "commission options missing");
  assert.ok(html.includes("How do you want to work together?"), "engagement label rename missing");
  assert.strictEqual(content.faq.items.length, 9, "FAQ count");
  assert.ok(html.includes("GMV Max"), "GMV Max mention missing");
  assert.ok(html.includes("Hammad Media LLC, a registered US company"), "cross-border FAQ missing");
  assert.ok(html.includes("wa.me/12015520786"), "WhatsApp link missing");
  assert.ok(html.includes("See the proof"), "ghost CTA rename missing");
  assert.ok(html.includes('class="nav-links"'), "desktop nav links missing");
  assert.ok(html.includes('class="midflow"'), "sticky wrapper missing");
  assert.ok(!html.includes("padding-bottom: 76px"), "old fixed-bar body padding still present");
  assert.ok(html.includes('autocomplete="organization"'), "autocomplete attrs missing");
  assert.ok(html.includes('class="form-hint"'), "form hint missing");
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

test("partnership tiers render; commission-only positioning is gone", () => {
  for (const t of content.partnership.tiers) {
    assert.ok(html.includes(t.name), `tier missing: ${t.name}`);
  }
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
  assert.ok(html.includes("#1 TikTok Shop Health &amp; Wellness Affiliate 2025"), "ranked title missing");
  assert.ok((html.match(/#1<\/b> Health/g) || []).length >= 2, "marquee #1 ranking missing");
});

test("og/social meta present with absolute image URL", () => {
  assert.ok(html.includes('property="og:image" content="https://hammadmedia.com/assets/og.jpg"'));
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(html.includes('rel="canonical" href="https://hammadmedia.com/"'), "canonical must include trailing slash");
  assert.ok(html.includes('property="og:url" content="https://hammadmedia.com/"'), "og:url must include trailing slash");
  assert.ok(html.includes('property="og:image:width" content="1200"'), "og:image:width missing");
  assert.ok(html.includes('property="og:image:height" content="630"'), "og:image:height missing");
  assert.ok(html.includes('property="og:image:alt"'), "og:image:alt missing");
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

test("Boosted Commission eligibility threshold is stated", () => {
  assert.ok((html.match(/10,000\+ units/g) || []).length >= 2, "10K-units eligibility missing from tier card or FAQ");
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
  assert.strictEqual(ps.priceRange, "$1,000 - $50,000+");
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
  assert.ok(track.includes(`<b>${content.hero.gmvYtd}</b> GMV in 2026`), "marquee GMV must come from hero.gmvYtd");
  for (const kw of ["UNITS SOLD", "PRODUCT VIEWS", "VIDEO VIEWS"]) {
    const s = content.stats.find((x) => x.label.includes(kw));
    assert.ok(track.includes(`<b>${s.value}</b>`), `marquee missing stat ${s.value}`);
  }
  const top = "$" + Math.max(...content.receipts.items.map((i) => i.ytd)).toLocaleString("en-US");
  assert.ok(track.includes(`<b>${top}</b> from one product`), "marquee top-product figure must match receipts max");
  const dup = html.match(/\{\{marquee\}\}/g);
  assert.strictEqual(dup, null, "marquee token unresolved");
});

test("boosted qualification branch: hidden 10k-units follow-up with reroute note", () => {
  assert.ok(html.includes('id="f-units-row" hidden'), "qualification row must ship hidden");
  assert.ok(html.includes('name="boosted_10k_units"'), "qualification select missing");
  assert.ok(html.includes("Has this product already sold 10,000+ units on TikTok Shop?"), "qualification question missing");
  assert.ok(html.includes('id="f-units-switch"'), "switch-to-retainer button missing");
  assert.ok(/Retainer \+ Commission<\/b> is the right way to start/.test(html), "reroute note missing");
  assert.ok(!html.includes('id="f-units" name="boosted_10k_units" required'), "must not be required while hidden (JS toggles it)");
  assert.ok(html.includes("syncBoostedQual"), "qualification JS missing");
});
