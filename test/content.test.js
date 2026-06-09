const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const content = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "content.json"), "utf8"),
);

test("site block has required fields", () => {
  for (const key of ["title", "description", "brandName", "statsUpdated"]) {
    assert.ok(content.site[key], `site.${key} missing`);
  }
});

test("hero has headline and subheadline", () => {
  assert.ok(content.hero.headline.length > 10);
  assert.ok(content.hero.subheadline.length > 10);
});

test("stats: at least 3, each with value and label", () => {
  assert.ok(Array.isArray(content.stats) && content.stats.length >= 3);
  for (const s of content.stats) {
    assert.ok(typeof s.value === "string" && s.value.length > 0);
    assert.ok(typeof s.label === "string" && s.label.length > 0);
  }
});

test("accounts: non-empty, each with handle and tiktok url", () => {
  assert.ok(Array.isArray(content.accounts) && content.accounts.length >= 1);
  for (const a of content.accounts) {
    assert.ok(a.handle.length > 0);
    assert.ok(a.url.startsWith("https://www.tiktok.com/@"));
    assert.ok(a.niche.length > 0);
  }
});

test("caseStudies is an array (may be empty); entries need title and result; videoUrl optional", () => {
  assert.ok(Array.isArray(content.caseStudies));
  for (const c of content.caseStudies) {
    assert.ok(c.title.length > 0);
    assert.ok(c.result.length > 0);
    if (c.videoUrl) assert.ok(c.videoUrl.startsWith("https://"));
  }
});

test("services has 3 steps with title and text", () => {
  assert.strictEqual(content.services.steps.length, 3);
  for (const s of content.services.steps) {
    assert.ok(s.title.length > 0 && s.text.length > 0);
  }
});

test("contact has valid primary email and FormSubmit destination", () => {
  assert.ok(content.contact.email.includes("@"));
  assert.ok(content.contact.formSubmitEmail.includes("@"));
});
