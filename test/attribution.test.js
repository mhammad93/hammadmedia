'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validate } = require('../lib/intake-validation');
const source = fs.readFileSync(path.join(__dirname, '../assets/redesign/attribution.js'), 'utf8');
function page(url, {store = new Map(), referrer = '', unavailable = false} = {}) {
  const scope = {location: new URL(url), document: {referrer}, URL, URLSearchParams,
    sessionStorage: {getItem(key) {if (unavailable) throw new Error('Storage blocked');return store.get(key) || null;},setItem(key,value) {if (unavailable) throw new Error('Storage blocked');store.set(key,value);}}};
  scope.window = scope;
  vm.runInNewContext(source,scope);
  return {scope,store,current:()=>JSON.parse(JSON.stringify(scope.hmAttribution.current()))};
}

test('earliest landing and campaign survive language and privacy hops in the same tab', () => {
  const store = new Map();
  const first = page('https://hammadmedia.com/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio', {store, referrer:'https://www.tiktok.com/@drew.review?email=private@example.com#secret'});
  const expected = {page_path:'/',referrer:'https://www.tiktok.com',utm_source:'tiktok',utm_medium:'organic_social',utm_campaign:'paid_partnerships',utm_content:'drew_review_bio'};
  assert.deepEqual(first.current(),expected);
  assert.deepEqual(page('https://hammadmedia.com/zh/',{store,referrer:'https://hammadmedia.com/?utm_source=tiktok'}).current(),expected);
  assert.deepEqual(page('https://hammadmedia.com/zh/privacy/',{store,referrer:'https://hammadmedia.com/zh/'}).current(),expected);
  assert.deepEqual(page('https://hammadmedia.com/',{store,referrer:'https://hammadmedia.com/zh/privacy/'}).current(),expected);
});

test('the latest valid campaign replaces rather than merges campaign fields while keeping the first landing', () => {
  const store=new Map();
  page('https://hammadmedia.com/zh/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio',{store,referrer:'https://first.example/path'});
  const later=page('https://hammadmedia.com/?utm_source=agency_outreach&utm_campaign=paid_partnerships',{store,referrer:'https://later.example/path'});
  assert.deepEqual(later.current(),{page_path:'/zh/',referrer:'https://first.example',utm_source:'agency_outreach',utm_campaign:'paid_partnerships'});
  later.scope.location.search='?utm_source=brand_kit&utm_medium=referral';
  assert.deepEqual(later.current(),{page_path:'/zh/',referrer:'https://first.example',utm_source:'brand_kit',utm_medium:'referral'});
});

test('form values, free-text terms, ad IDs, arbitrary parameters and raw referrer paths never enter storage or payload', () => {
  const app=page('https://hammadmedia.com/?email=private@example.com&name=Private_Person&utm_source=person%40example.com&utm_medium=https%3A%2F%2Fprivate.example&utm_campaign=health+question&utm_content='+ 'a'.repeat(101)+'&utm_term=private_health_query&utm_id=opaque&gclid=opaque&fbclid=opaque#private-fragment',{referrer:'https://referrer.example/private?email=private@example.com#private-fragment'});
  assert.deepEqual(app.current(),{page_path:'/',referrer:'https://referrer.example'});
  assert.doesNotMatch(JSON.stringify([...app.store.values()]),/private@example|Private_Person|private_health|opaque|private-fragment|health\+question|utm_term|utm_id|gclid|fbclid/);
  assert.deepEqual(page('https://hammadmedia.com/zh/private@example.com').current(),{page_path:'/zh/'});
});

test('invalid incoming campaign tags do not erase a previously valid campaign', () => {
  const store=new Map();page('https://hammadmedia.com/?utm_source=tiktok',{store});
  assert.deepEqual(page('https://hammadmedia.com/zh/?utm_source=bad%40example.com&utm_term=query',{store}).current(),{page_path:'/',utm_source:'tiktok'});
});

test('corrupt or contaminated stored data is safely reduced to permitted fields', () => {
  const store=new Map([['hm-attribution-v1','not json']]);
  assert.deepEqual(page('https://hammadmedia.com/zh/',{store}).current(),{page_path:'/zh/'});
  store.set('hm-attribution-v1',JSON.stringify({version:1,landing:{page_path:'/private@example.com',referrer:'https://referrer.example/private?token=secret',email:'private@example.com'},campaign:{utm_source:'tiktok',utm_medium:'private@example.com',gclid:'secret',email:'private@example.com'},form:{name:'Private Person'}}));
  const app=page('https://hammadmedia.com/zh/',{store});
  assert.deepEqual(app.current(),{page_path:'/',referrer:'https://referrer.example',utm_source:'tiktok'});
  assert.doesNotMatch(store.get('hm-attribution-v1'),/private@example|Private Person|token|secret|gclid/);
});

test('storage restrictions, internal/non-HTTPS referrers and caller mutation do not break attribution', () => {
  const app=page('https://hammadmedia.com/zh/?utm_source=tiktok',{unavailable:true,referrer:'http://legacy.example/path'});
  assert.deepEqual(app.current(),{page_path:'/zh/',utm_source:'tiktok'});
  const mutable=app.scope.hmAttribution.current();mutable.utm_source='changed';
  assert.equal(app.current().utm_source,'tiktok');
  assert.deepEqual(page('https://hammadmedia.com/',{referrer:'https://hammadmedia.com/zh/'}).current(),{page_path:'/'});
});

test('returned attribution conforms to the existing backend without adding fields or changing the submission identity', () => {
  const app=page('https://hammadmedia.com/zh/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review1_bio',{referrer:'https://partner.example/path'});
  const result=validate({submission_id:'fce4ae44-a499-4c0e-a149-4ceda4a2992f',brand:'Example',email:'brand@example.com',product:'Product',engagement:'5 videos',locale:'zh',paid_partnership_ack:true,attribution:app.current()});
  assert.equal(result.payload.attribution.page_path,'/zh/');assert.equal(result.payload.attribution.utm_source,'tiktok');
  assert.equal(result.payload.locale,'zh');assert.equal(result.payload.submission_id,'fce4ae44-a499-4c0e-a149-4ceda4a2992f');
});

test('unregistered names, phone-shaped values and IDs cannot enter new or restored campaign attribution', () => {
  const url='https://hammadmedia.com/?utm_source=jane.doe&utm_medium=12125550123&utm_campaign=customer-938475&utm_content=receipt_123&utm_id=public_or_private_id';
  const fresh=page(url);
  assert.deepEqual(fresh.current(),{page_path:'/'});
  assert.doesNotMatch(JSON.stringify([...fresh.store.values()]),/jane|12125550123|customer|receipt_123|utm_id/);
  const store=new Map([['hm-attribution-v1',JSON.stringify({version:1,landing:{page_path:'/'},campaign:{utm_source:'jane.doe',utm_medium:'12125550123',utm_campaign:'customer-938475',utm_content:'receipt_123'}})]]);
  assert.deepEqual(page('https://hammadmedia.com/zh/',{store}).current(),{page_path:'/'});
  assert.doesNotMatch(store.get('hm-attribution-v1'),/jane|12125550123|customer|receipt_123/);
});

test('registry values stay field-specific and ambiguous repeated query values are rejected', () => {
  const app=page('https://hammadmedia.com/?utm_source=tiktok&utm_source=jane.doe&utm_medium=tiktok&utm_campaign=paid_partnerships&utm_content=drew_review1_bio');
  assert.deepEqual(app.current(),{page_path:'/',utm_campaign:'paid_partnerships',utm_content:'drew_review1_bio'});
});

test('registered public placements survive navigation and agree with Analytics campaign fields', () => {
  const {campaignFields} = require('../assets/redesign/analytics');
  const placements = [
    ['tiktok','organic_social','drew_review_bio'], ['tiktok','organic_social','drew_review1_bio'],
    ['brand_kit','referral','en_overview'], ['brand_kit','referral','zh_overview'],
    ['agency_outreach','email','agency_overview'], ['instagram','organic_social','instagram_bio'],
    ['linkedin','organic_social','linkedin_profile'], ['email_signature','email','email_signature'],
    ['qr_code','referral','printed_qr'],
  ];
  for (const [source,medium,content] of placements) {
    const query = new URLSearchParams({utm_source:source,utm_medium:medium,utm_campaign:'paid_partnerships',utm_content:content});
    const store = new Map();
    const expected = {page_path:'/',utm_source:source,utm_medium:medium,utm_campaign:'paid_partnerships',utm_content:content};
    assert.deepEqual(page('https://hammadmedia.com/?'+query,{store}).current(),expected);
    assert.deepEqual(page('https://hammadmedia.com/zh/privacy/',{store}).current(),expected);
    assert.deepEqual(campaignFields('?'+query),{campaign_source:source,campaign_medium:medium,campaign_name:'paid_partnerships',campaign_content:content});
    const result = validate({submission_id:'fce4ae44-a499-4c0e-a149-4ceda4a2992f',brand:'Example',email:'brand@example.com',product:'Product',engagement:'5 videos',locale:'en',paid_partnership_ack:true,attribution:expected});
    assert.deepEqual(result.payload.attribution,{...expected,utm_term:'',referrer:''});
  }
});

test('expanded registry still rejects private brands, mixed-case channels, arbitrary IDs and wrong-field labels', () => {
  for (const value of ['Instagram','LinkedIn','private_brand','client_123','receipt_123','private@example.com']) {
    const query = new URLSearchParams(Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_id'].map(key=>[key,value])));
    const app=page('https://hammadmedia.com/?'+query);
    assert.deepEqual(app.current(),{page_path:'/'},value);
    assert.equal(JSON.stringify([...app.store.values()]).includes(value),false);
  }
  assert.deepEqual(page('https://hammadmedia.com/?utm_source=instagram_bio&utm_medium=linkedin&utm_campaign=qr_code&utm_content=instagram').current(),{page_path:'/'});
  assert.deepEqual(page('https://hammadmedia.com/?utm_source=instagram&utm_source=linkedin&utm_content=printed_qr&utm_content=email_signature').current(),{page_path:'/'});
});
