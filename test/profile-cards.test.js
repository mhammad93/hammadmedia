'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const performance = require('../performance.json');
const content = require('../content.json');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-profile-cards-'));
test.before(() => execFileSync(process.execPath, [path.join(ROOT, 'build.js')], {
  cwd:ROOT, env:{...process.env, HM_BUILD_OUTPUT_DIR:output, VERCEL_ENV:'preview', PUBLIC_LAUNCH_APPROVED:'false'}, stdio:'pipe'
}));
test.after(() => fs.rmSync(output, {recursive:true, force:true}));

test('creator cards link each preserved portrait and dated evidence to the correct account in both languages', () => {
  for (const [locale, file] of [['en','index.html'], ['zh','zh/index.html']]) {
    const html = fs.readFileSync(path.join(output, file), 'utf8');
    assert.doesNotMatch(html, /Dates, sources &amp; what these figures mean|How the numbers are reported|href="#methodology"|id="methodology"|Summit US 2025|美国2025年峰会/);
    assert.match(html, /Health Creators of the Year<\/strong><br>Short Video/);
    const cards = [...html.matchAll(/<a class="profile-card" data-profile="([^"]+)"[\s\S]*?<\/a>/g)];
    assert.equal(cards.length, 2);
    for (const account of content.accounts) {
      const card = cards.find(c => c[1] === account.handle)[0], data = performance.accounts[account.handle];
      assert.ok(card.includes(`href="${account.url}"`));
      assert.ok(card.includes(`src="/${account.avatar}"`));
      assert.match(card, /target="_blank" rel="noopener noreferrer"/);
      assert.ok(card.includes(data.gmv[locale]));
      assert.ok(card.includes(data.units[locale]));
      assert.ok(card.includes(data.period[locale]));
      assert.ok(card.includes(data.social.followers[locale]));
      assert.ok(card.includes(data.social.note[locale]));
      assert.doesNotMatch(card, /416M|37\.3M|68\.5M|video views|视频播放量/i);
      if (data.social.likes) assert.ok(card.includes(data.social.likes[locale]));
      else assert.doesNotMatch(card, /Likes|获赞|2\.5M|>0</);
      assert.match(card, /profile-portrait/);
      assert.equal((card.match(/<a\b/g) || []).length, 1, 'the full card is one accessible link');
    }
  }
});

test('profile snapshots distinguish the fresh official observation from an older unavailable-to-refresh baseline', () => {
  const first = performance.accounts['drew.review'].social, second = performance.accounts['drew.review1'].social;
  assert.ok(first && second, 'profile evidence is centralized');
  assert.equal(first.followers.en, '190.1K');
  assert.equal(first.likes.en, '2.5M');
  assert.equal(first.observedAt, '2026-09-08T02:55:12Z');
  assert.equal(first.asOf, '2026-09-07');
  assert.equal(first.timezone, 'America/New_York');
  assert.equal(first.status, 'verified_public_profile');
  assert.equal(second.followers.en, '155K');
  assert.equal(second.asOf, '2026-06-08');
  assert.equal(second.status, 'historic_not_updated');
  assert.equal(second.refreshStatus, 'public_profile_restricted');
  assert.ok(!('likes' in second));
});

function clickHarness(preview = false) {
  const events = [];
  const profiles = ['drew.review','drew.review1','private@example.com'].map(profile => ({
    dataset:{profile}, href:'https://private.example/?email=private@example.com', textContent:'Private visitor text', handlers:{},
    addEventListener(name, fn) {this.handlers[name]=fn;}
  }));
  const context = {
    document:{documentElement:{lang:'zh-CN'}, body:{dataset:{preview:String(preview)}}, querySelector:()=>null, getElementById:()=>null,
      querySelectorAll:selector=>selector==='[data-profile]'?profiles:[]},
    location:new URL('https://hammadmedia.com/zh/?email=private@example.com#private')
  };
  context.window=context; context.gtag=(...args)=>events.push(args);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/site.js'),'utf8'),context);
  return {events, profiles};
}

test('profile clicks report only an allowlisted account and fixed location, never a lead or link details', () => {
  const app=clickHarness();
  for (const profile of app.profiles) profile.handlers.click?.();
  assert.equal(app.events.length, 2);
  assert.deepEqual(app.events.map(e=>e[1]), ['profile_click','profile_click']);
  assert.deepEqual(app.events.map(e=>e[2].profile_key), ['drew.review','drew.review1']);
  for (const event of app.events) {
    assert.deepEqual(Object.keys(event[2]).sort(), ['cta_location','page_location','profile_key','site_language']);
    assert.equal(event[2].cta_location, 'creator');
    assert.equal(event[2].page_location, 'https://hammadmedia.com/zh/');
    assert.equal(event[2].site_language, 'zh');
  }
  assert.doesNotMatch(JSON.stringify(app.events), /private|generate_lead|href|textContent/i);
  const preview=clickHarness(true);
  preview.profiles.forEach(p=>p.handlers.click?.());
  assert.equal(preview.events.length, 0);
});
