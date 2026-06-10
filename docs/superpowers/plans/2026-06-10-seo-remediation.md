# SEO Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift mobile Lighthouse performance from 84 to ≥95 (LCP 4.3s → <2.5s), close duplicate-URL and backup-mirror indexing gaps, and harden response headers — based on the 2026-06-10 audit of the live site.

**Architecture:** Static site — `content.json` → `build.js` → `dist/`, tested with `node --test` (31 tests passing at plan time, after the Boosted-Commission copy change), deployed with `npx vercel deploy --prod --yes`. Every task is test-first: add the assertion to `test/build.test.js`, watch it fail, implement, watch it pass, commit.

**Tech Stack:** Node 22+ (no deps), ImageMagick 6 (`convert`, WebP delegate confirmed: libwebp 1.3.2), Vercel static hosting, GitHub Actions → Pages backup mirror.

---

## Audit summary (what this plan fixes)

| # | Finding | Severity | Task |
|---|---------|----------|------|
| 0 | Google has the homepage as URL-only — "No information is available for this page" (not crawled; no GSC property, no sitemap submitted, zero backlinks) | **Critical — user-side** | Task 0 |
| 1 | Mobile LCP 4.3s (perf 84): Google Fonts CSS render-blocks 790ms; Fraunces woff2 arrives late on throttled mobile and the swap repaint sets LCP; hero text starts `opacity: 0` via `rise … both` | **High** | Tasks 1–2 |
| 2 | ~290 KiB image waste: `award-summit.jpg` 168KB JPEG, `logo-v2.png` 46KB at 46px display, avatars 63KB combined; 6 brand logos have `height="28"` but no `width` (unsized-images flag) | Medium | Task 3 |
| 3 | `/index.html` serves 200 — duplicate homepage URL (canonical mitigates) | Low | Task 4 |
| 4 | Missing `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` (HSTS already present) | Low | Task 4 |
| 5 | GitHub Pages backup (`mhammad93.github.io/hammadmedia/`) serves an indexable mirror — canonical points home (correct) but noindex is the belt-and-suspenders | Low | Task 5 |
| 6 | JSON-LD `ProfessionalService` lacks `areaServed` and `priceRange` (address intentionally absent — no public office) | Low | Task 6 |

**Clean (no action):** desktop perf 100, a11y 100, best-practices 100, SEO 100; one H1 + logical H2 outline; 17/17 alts; 15/17 lazy; canonical absolute; robots.txt + sitemap consistent; 404 returns 404; redirect matrix correct (www→apex 308, http→https); FAQPage JSON-LD valid 8/8. **Accepted costs:** gtag.js ≈67KB unused JS (GA4 is a business requirement); title 73 chars (truncates ~60 in SERPs but front-loaded, user-approved); `http://www` double-hop (unavoidable on Vercel).

---

## Task 0: Google Search Console (USER-SIDE — gates everything else)

No code. The site is invisible in Google regardless of on-page quality until this happens:

- [ ] In GSC, add property `hammadmedia.com` (Domain property) → copy the TXT verification record → add it in Namecheap PremiumDNS (Host `@`, Type TXT). **Never touch the MX rows.**
- [ ] Submit sitemap: enter `sitemap.xml` in GSC → Sitemaps.
- [ ] URL Inspection on `https://hammadmedia.com/` → Request Indexing.
- [ ] (Off-page, from the v36 audit, still open: drew.review1 bio link → hammadmedia.com; UGC Roster listing; r/TikTokshop presence.)

---

## Task 1: Self-host fonts (kills the 790ms render-block + late LCP swap)

**Files:**
- Create: `assets/fonts/fraunces-roman.woff2`, `assets/fonts/fraunces-italic.woff2`, `assets/fonts/manrope.woff2`
- Modify: `template.html:33-35` (the two preconnects + css2 stylesheet link), top of its `<style>` block
- Modify: `thanks.html:9-11` (same three lines there)
- Test: `test/build.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/build.test.js`:

```js
test("fonts are self-hosted with preload", () => {
  assert.ok(!html.includes("fonts.googleapis.com"), "Google Fonts CSS still referenced");
  assert.ok(!html.includes("fonts.gstatic.com"), "gstatic preconnect still referenced");
  assert.strictEqual((html.match(/rel="preload" href="assets\/fonts\/[a-z-]+\.woff2" as="font" type="font\/woff2" crossorigin/g) || []).length, 3, "3 font preloads expected");
  assert.strictEqual((html.match(/@font-face/g) || []).length, 3, "3 @font-face blocks expected");
  for (const f of ["fraunces-roman", "fraunces-italic", "manrope"]) {
    assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "fonts", `${f}.woff2`)), `${f}.woff2 missing from dist`);
  }
  const thanks = fs.readFileSync(path.join(ROOT, "dist", "thanks.html"), "utf8");
  assert.ok(!thanks.includes("fonts.googleapis.com"), "thanks.html still uses Google Fonts");
});
```

- [ ] **Step 2: Run to verify it fails** — `cd ~/hammadmedia && node --test > /tmp/t.log 2>&1; RC=$?; tail -3 /tmp/t.log; echo RC=$RC` → expect FAIL (fonts.googleapis.com present).

- [ ] **Step 3: Download the three variable woff2 files** (latin subset, full weight ranges — variable fonts are one file per style):

```bash
cd ~/hammadmedia && mkdir -p assets/fonts && python3 - <<'EOF'
import re, urllib.request
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'}
url = ("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900"
       "&family=Manrope:wght@200..800&display=swap")
css = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read().decode()
names = {('Fraunces','normal'): 'fraunces-roman', ('Fraunces','italic'): 'fraunces-italic', ('Manrope','normal'): 'manrope'}
got = 0
for block in re.findall(r'/\* latin \*/\s*@font-face\s*\{([^}]+)\}', css):
    fam = re.search(r"font-family: '([^']+)'", block).group(1)
    sty = re.search(r"font-style: (\w+)", block).group(1)
    src = re.search(r"src: url\((https://[^)]+)\)", block).group(1)
    out = f"assets/fonts/{names[(fam, sty)]}.woff2"
    urllib.request.urlretrieve(src, out)
    print(out, "OK"); got += 1
assert got == 3, f"expected 3 latin font files, got {got}"
EOF
ls -la assets/fonts/
```

Expected: three files, roughly 25–80 KB each. If the regex finds ≠3 blocks, print `css` and adjust — Google occasionally reformats; the latin block is always the one whose comment is exactly `/* latin */`.

- [ ] **Step 4: Replace the Google Fonts lines in `template.html`** — delete lines 33–35:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
```

and put in their place:

```html
<link rel="preload" href="assets/fonts/fraunces-roman.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/fraunces-italic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin>
```

(`crossorigin` is required on font preloads even same-origin — fonts are always fetched in CORS mode; omitting it double-downloads.)

- [ ] **Step 5: Add @font-face at the very top of the template's `<style>` block** (immediately after `<style>`):

```css
  @font-face { font-family: "Fraunces"; src: url(assets/fonts/fraunces-roman.woff2) format("woff2-variations"); font-style: normal; font-weight: 100 900; font-display: swap; }
  @font-face { font-family: "Fraunces"; src: url(assets/fonts/fraunces-italic.woff2) format("woff2-variations"); font-style: italic; font-weight: 100 900; font-display: swap; }
  @font-face { font-family: "Manrope"; src: url(assets/fonts/manrope.woff2) format("woff2-variations"); font-style: normal; font-weight: 200 800; font-display: swap; }
```

No `unicode-range` needed — missing glyphs (e.g. ▶ U+25B6) fall back per-glyph to system fonts exactly as before.

- [ ] **Step 6: Mirror the same change in `thanks.html`** — replace its lines 9–11 (`preconnect` ×2 + css2 link for `Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,400&family=Manrope:wght@400;700;800`) with the same three preloads, and add the same three `@font-face` lines at the top of its `<style>` (after the `:root` line is fine, before any rule that uses the families).

- [ ] **Step 7: Run tests** — same RC-gated command → expect PASS (32 tests).

- [ ] **Step 8: Visual check** — `node build.js && npx serve dist` (or open the Vercel preview later): Fraunces serif renders in hero, italic `em` renders italic, Manrope body intact. Check one mobile width (390px).

- [ ] **Step 9: Commit**

```bash
git add assets/fonts template.html thanks.html test/build.test.js
git commit -m "perf: self-host Fraunces + Manrope variable fonts with preload

Removes the render-blocking fonts.googleapis.com CSS (790ms on mobile
lab) and the late woff2 swap that pushed LCP to 4.3s."
```

---

## Task 2: Hero text entrance — transform-only (no opacity gate on the LCP element)

The hero kicker/h1/sub animate `rise … both` from `opacity: 0`, so the largest text paints late. Slide-without-fade keeps the motion but makes the text contentful at first paint. `.actions` (buttons, not LCP candidates) keep the fade.

**Files:**
- Modify: `template.html:70` (keyframes), `:121` (.hero .kicker), `:127` (h1), `:132` (sub)
- Test: `test/build.test.js`

- [ ] **Step 1: Write the failing test:**

```js
test("hero text animations are transform-only (LCP not opacity-gated)", () => {
  assert.ok(html.includes("@keyframes rise-move"), "rise-move keyframes missing");
  assert.strictEqual((html.match(/rise-move \.7s/g) || []).length, 3, "kicker, h1 and sub should use rise-move");
  assert.ok(html.includes("animation: rise .7s .24s ease both"), "actions should keep the fade entrance");
});
```

- [ ] **Step 2: Run to verify it fails** (rise-move not defined).

- [ ] **Step 3: Implement in `template.html`** — after line 70's

```css
  @keyframes rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
```

add:

```css
  @keyframes rise-move { from { transform: translateY(26px); } to { transform: none; } }
```

Then three exact swaps (each string is unique in the file):
- line 121: `animation: rise .7s ease both;` → `animation: rise-move .7s ease both;`
- line 127: `animation: rise .7s .08s ease both;` → `animation: rise-move .7s .08s ease both;`
- line 132: `animation: rise .7s .16s ease both;` → `animation: rise-move .7s .16s ease both;`

Line 134 (`.hero .actions … rise .7s .24s`) stays untouched. Do NOT touch line 422 (`animation: rise backwards` with `view()` timeline — the scroll-entrance system for cards; changing that one re-opens the Chromium hover-transform bug fixed in v25).

- [ ] **Step 4: Run tests** → PASS (33). **Step 5: Visual check** — hero should slide up without fading. **Step 6: Commit** (`perf: hero text entrance is transform-only so LCP paints at FCP`).

---

## Task 3: Image optimization (WebP + intrinsic sizes; og.jpg stays JPG)

**Files:**
- Create: `assets/award-summit.webp`, `assets/logo-v2.webp`, `assets/products/avatar-drew-review.webp`, `assets/products/avatar-drew-review1.webp`
- Modify: `template.html:506,550,588`, `content.json:37,47` (avatar paths) and brand entries (`width` field), `build.js:155` (brand renderer)
- Test: `test/build.test.js`

- [ ] **Step 1: Write the failing test:**

```js
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
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Generate the WebP files** (display sizes: award ≤ card width ~1100px is generous; logo shows at 46px height → 560px wide = 3×; avatars show at 72px → 216px = 3×):

```bash
cd ~/hammadmedia
convert assets/award-summit.jpg -resize 1100x -quality 82 assets/award-summit.webp
convert assets/logo-v2.png -resize 560x -define webp:lossless=true assets/logo-v2.webp
convert assets/products/avatar-drew-review.jpg  -resize 216x216 -quality 85 assets/products/avatar-drew-review.webp
convert assets/products/avatar-drew-review1.jpg -resize 216x216 -quality 85 assets/products/avatar-drew-review1.webp
identify -format "%f %wx%h %B bytes\n" assets/award-summit.webp assets/logo-v2.webp assets/products/avatar-drew-review*.webp
```

Expected: award ≈ 50–70KB (from 168KB), logo ≈ 8–15KB (from 46KB), avatars ≈ 5–9KB each (from 28/34KB). Keep the originals on disk (raw masters policy) — they just stop being referenced.

- [ ] **Step 4: Update references.**

`template.html:506` and `:588` (nav + footer logo — note new intrinsic dims 560×138):

```html
<img class="logo-img" src="assets/logo-v2.webp" alt="Hammad Media" width="560" height="138">
```

`template.html:550` (award; 1100×854 after resize — verify with the identify output and use the real height):

```html
<img src="assets/award-summit.webp" alt="TikTok Shop Summit stage slide naming the Health Creators of the Year, with @drew.review1 listed first in the Short Video category" width="1100" height="854" loading="lazy">
```

`content.json:37` → `"avatar": "assets/products/avatar-drew-review.webp"`, `content.json:47` → `"avatar": "assets/products/avatar-drew-review1.webp"`.

- [ ] **Step 5: Brand logo widths.** In `content.json`, each of the six brand entries gains a `width` field (intrinsic ratio × 28px height): micro-ingredients **138**, neocell **156**, nutricost **99**, toplux **105**, snap-supplements **157**, natures-sunshine **98**. Then `build.js:155`:

```js
    (b) => `      <img src="${esc(b.logo)}" alt="${esc(b.name)} logo" width="${b.width}" height="28" loading="lazy">`,
```

- [ ] **Step 6: Run tests** → PASS (34). **Step 7: Visual check** — logo crisp at nav size on a retina/zoomed view; award photo clean; avatars sharp in their 72px circles. **Step 8: Commit** (`perf: webp logo/award/avatars + intrinsic brand-logo dimensions (~250KB saved)`).

---

## Task 4: vercel.json — /index.html redirect + security headers

Do NOT use `cleanUrls: true` — it would also rewrite `/thanks.html` → `/thanks`, breaking the FormSubmit `_next` URL and the robots.txt disallow line. One scoped redirect instead.

**Files:**
- Modify: `vercel.json` (complete new content below)
- Test: deploy-time only (curl in Task 7) — Vercel config is not exercised by the local suite.

- [ ] **Step 1: Replace `vercel.json` with:**

```json
{
  "buildCommand": "node build.js",
  "outputDirectory": "dist",
  "framework": null,
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ],
  "redirects": [
    { "source": "/index.html", "destination": "/", "permanent": true },
    {
      "source": "/:path*",
      "has": [ { "type": "host", "value": "www.hammadmedia.com" } ],
      "destination": "https://hammadmedia.com/:path*",
      "permanent": true
    }
  ]
}
```

No CSP on purpose: it would need a maintained allowlist for googletagmanager/google-analytics and the risk of silently killing GA outweighs the benefit on a static site with no inputs of value. Revisit only if a header-injection vector ever appears.

- [ ] **Step 2: `python3 -m json.tool vercel.json`** → valid JSON. **Step 3: Commit** (`seo: 308 /index.html duplicate to /, add security headers`).

---

## Task 5: Noindex the GitHub Pages backup mirror

Canonical already points home; this removes the mirror from index eligibility entirely. Injection happens ONLY in the Pages workflow — production must stay indexable, and a local test enforces that.

**Files:**
- Modify: `.github/workflows/deploy.yml` (between "Build site" and `upload-pages-artifact`)
- Test: `test/build.test.js`

- [ ] **Step 1: Write the failing-proof test** (this one must pass immediately — it guards the invariant):

```js
test("production build is indexable (no robots meta on index)", () => {
  assert.ok(!html.includes('name="robots"'), "dist/index.html must never carry a robots meta — noindex is injected only in the Pages workflow");
});
```

Run the suite → PASS (35). (Not a red-first test; it pins the invariant the workflow edit could violate if someone later moves the sed into build.js.)

- [ ] **Step 2: Add the workflow step** in `.github/workflows/deploy.yml` after `- name: Build site` / `run: node build.js` and before `- uses: actions/configure-pages@v5`:

```yaml
      - name: Noindex backup mirror (canonical host is hammadmedia.com)
        run: sed -i 's|<meta charset="utf-8">|<meta charset="utf-8"><meta name="robots" content="noindex">|' dist/index.html
```

(`dist/thanks.html` already ships `noindex` everywhere by design — leave it alone.)

- [ ] **Step 3:** `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('yaml OK')"` (or push and watch the Action). **Step 4: Commit** (`seo: noindex the GitHub Pages backup mirror`).

---

## Task 6: JSON-LD enrichment (areaServed + priceRange)

**Files:**
- Modify: `build.js` — the ProfessionalService node (near `build.js:247`, the object containing `logo`/`award`/`telephone`)
- Test: `test/build.test.js`

- [ ] **Step 1: Write the failing test** — extend with:

```js
test("ProfessionalService declares service area and price range", () => {
  const m = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
  const graph = JSON.parse(m[1])["@graph"];
  const ps = graph.find((n) => n["@type"] === "ProfessionalService");
  assert.strictEqual(ps.areaServed, "United States");
  assert.strictEqual(ps.priceRange, "$1,000 - $50,000+");
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3:** In the ProfessionalService object in `build.js`, after the `telephone` property add:

```js
      areaServed: "United States",
      priceRange: "$1,000 - $50,000+",
```

(Both values mirror visible page content — tier prices and "TikTok Shop US" — per the structured-data parity rule. `address` stays absent deliberately: no public office; Google's LocalBusiness rich result won't trigger without it, which is fine — the FAQ/WebSite nodes are the useful ones.)

- [ ] **Step 4: Run tests** → PASS (36). **Step 5: Commit** (`seo: areaServed + priceRange on ProfessionalService`).

---

## Task 7: Ship + verify end-to-end

- [ ] **Step 1: Full gate:** `cd ~/hammadmedia && node --test > /tmp/t.log 2>&1; RC=$?; grep -E '^ℹ (tests|pass|fail)' /tmp/t.log; echo RC=$RC; [ $RC -eq 0 ] || exit 1` → 36/36.
- [ ] **Step 2: Deploy:** `npx vercel deploy --prod --yes`.
- [ ] **Step 3: Live curls:**

```bash
curl -s https://hammadmedia.com/ | grep -c 'fonts.googleapis'                # → 0
curl -s https://hammadmedia.com/ | grep -c 'assets/fonts/.*woff2'            # → ≥3 (preloads + @font-face)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://hammadmedia.com/index.html   # → 308 https://hammadmedia.com/
curl -sI https://hammadmedia.com/ | grep -i x-content-type-options           # → nosniff
curl -s https://hammadmedia.com/ | grep -c 'logo-v2.webp'                    # → 2
curl -s -o /dev/null -w "%{http_code}\n" https://hammadmedia.com/assets/fonts/fraunces-roman.woff2  # → 200
```

- [ ] **Step 4: Lighthouse re-run (acceptance):**

```bash
cd /tmp && CHROME_PATH=/home/mhammad/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
npx -y lighthouse@12 https://hammadmedia.com/ --output=json --output-path=/tmp/lh-after.json \
--only-categories=performance,seo --chrome-flags="--headless=new --no-sandbox" --quiet
python3 -c "import json; d=json.load(open('/tmp/lh-after.json')); print({k: round(v['score']*100) for k,v in d['categories'].items()}); print('LCP:', d['audits']['largest-contentful-paint']['displayValue'])"
```

Accept: mobile performance ≥ 95, LCP < 2.5s, SEO 100. Also re-run `--preset=desktop` → still 100.

- [ ] **Step 5: Push** (`git push`) → watch the Pages Action turn green → `curl -s https://mhammad93.github.io/hammadmedia/ | grep -c 'noindex'` → 1, and `curl -s https://hammadmedia.com/ | grep -c 'name="robots"'` → 0.
- [ ] **Step 6: Memory update** — `hammadmedia-site.md`: fonts self-hosted (3 woff2 + preload, no Google Fonts), rise-move hero pattern, WebP asset set + brand widths, vercel.json headers/redirect, Pages noindex injection, JSON-LD areaServed/priceRange, new test count, Lighthouse before/after numbers.

---

## Self-review notes

- Spec coverage: every audit finding maps to a task (0→0, 1→1+2, 2→3, 3+4→4, 5→5, 6→6); accepted-cost items documented as no-action with reasons.
- Type/name consistency: `rise-move` keyframes name matches in CSS and tests; font filenames `fraunces-roman|fraunces-italic|manrope` consistent across download script, preloads, @font-face, and tests; brand `width` field name matches renderer.
- Order matters only for Task 7 (last). Tasks 1–6 are independent and each ends in its own commit; if executing selectively, Tasks 1–2 carry ~90% of the measurable win.
