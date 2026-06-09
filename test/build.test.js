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

test("case studies render when present", () => {
  if (content.caseStudies.length > 0) {
    for (const c of content.caseStudies) {
      assert.ok(html.includes(c.result), `case study result missing: ${c.result}`);
    }
  } else {
    assert.ok(!html.includes('id="results"'));
  }
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
});

test("stacked brand wordmark present in nav and footer with accessible labels", () => {
  const brandLinks = html.match(/class="brand"[^>]*aria-label="[^"]{5,}"/g) || [];
  assert.ok(brandLinks.length >= 2, "expected brand wordmark links in nav and footer");
  assert.ok(html.includes('class="brand-top">HAMMAD<'), "HAMMAD top line missing");
  assert.ok(html.includes('class="brand-sub">MEDIA<'), "MEDIA sub line missing");
  assert.ok(!html.includes("logo-web.png\" alt"), "old image logo still in page");
});

test("product images + avatars render with alts and exist in dist", () => {
  for (const c of content.caseStudies) {
    if (!c.image) continue;
    assert.ok(html.includes(`src="${c.image}"`), `case study image missing: ${c.image}`);
    assert.ok(fs.existsSync(path.join(ROOT, "dist", c.image)), `dist missing ${c.image}`);
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
  for (const figure of ["$898", "$13,888", "$357,262", "$147,412", "$19,622", "$716.55"]) {
    assert.ok(!html.includes(figure), `private commission figure ${figure} leaked`);
  }
});
