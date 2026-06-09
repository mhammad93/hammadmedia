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

test("contact: form when formspreeId set, mailto fallback otherwise", () => {
  if (content.contact.formspreeId) {
    assert.ok(html.includes(`https://formspree.io/f/${content.contact.formspreeId}`));
    assert.ok(html.includes('name="brand"'));
    assert.ok(html.includes('name="message"'));
  } else {
    assert.ok(html.includes(`mailto:${content.contact.email}`));
  }
});

test("logo image present with meaningful alt text and asset file exists in dist", () => {
  assert.ok(html.includes('src="assets/logo-web.png"'), "logo img missing");
  const altMatch = html.match(/<img[^>]*logo-web\.png[^>]*alt="([^"]+)"/);
  assert.ok(altMatch && altMatch[1].length > 3, "logo alt text missing or trivial");
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "logo-web.png")), "logo asset not copied to dist");
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
