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
  assert.strictEqual(content.hero.headline, "I turn supplements into bestsellers.");
  assert.ok(content.hero.subheadline.length > 10);
  assert.ok(!/2026 so far/i.test(content.hero.subheadline), "hero must use the dated June 8 window");
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

test("receipts: 6 items sorted by descending YTD with valid fields", () => {
  const items = content.receipts.items;
  assert.strictEqual(items.length, 6);
  for (let i = 0; i < items.length; i++) {
    const c = items[i];
    assert.ok(c.title.length > 0);
    assert.ok(Number.isInteger(c.ytd) && c.ytd > 0, `ytd invalid: ${c.title}`);
    assert.ok(Number.isInteger(c.units) && c.units > 0, `units invalid: ${c.title}`);
    assert.ok(c.image.startsWith("assets/products/"), `image path invalid: ${c.title}`);
    if (c.videoUrl) assert.ok(c.videoUrl.startsWith("https://www.tiktok.com/"));
    if (i > 0) assert.ok(items[i - 1].ytd >= c.ytd, `not sorted descending at index ${i}`);
  }
  // top 3 (podium) carry the dual-proof best-month line where known
  assert.ok(items[0].bestMonth && items[1].bestMonth && items[2].bestMonth, "podium items need bestMonth");
});

test("services has 3 steps with title and text", () => {
  assert.strictEqual(content.services.steps.length, 3);
  for (const s of content.services.steps) {
    assert.ok(s.title.length > 0 && s.text.length > 0);
  }
});

test("contact has valid primary email and FormSubmit destination", () => {
  assert.strictEqual(content.contact.email, "contact@hammadmedia.com");
  assert.strictEqual(content.contact.formSubmitEmail, "contact@hammadmedia.com");
});

test("authorized package prices are unchanged", () => {
  assert.ok(content.partnership.starter.price.includes("$5,000"));
  const prices = content.partnership.volume.packages.map((p) => p.price);
  assert.ok(prices[0].includes("$9,500") && prices[0].includes("Save $500"));
  assert.ok(prices[1].includes("$13,500") && prices[1].includes("Save $1,500"));
  assert.ok(prices[2].includes("$25,000") && prices[2].includes("Save $5,000"));
  assert.ok(content.exclusivity.price.includes("$50,000"));
  assert.strictEqual(content.partnership.volume.packages.length, 3);
});
