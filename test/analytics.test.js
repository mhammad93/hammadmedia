'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {campaignFields}=require('../assets/redesign/analytics');
test('registered public creator campaign labels retain attribution without campaign IDs',()=>{
assert.deepEqual(campaignFields('?utm_source=tiktok&utm_medium=organic_social&utm_campaign=paid_partnerships&utm_content=drew_review_bio&utm_id=hm42'),{campaign_source:'tiktok',campaign_medium:'organic_social',campaign_name:'paid_partnerships',campaign_content:'drew_review_bio'});
});
test('identifier-shaped and unregistered labels are rejected even when their syntax looks safe',()=>{
for(const value of ['jane.doe','12125550123','customer-938475','receipt_123','private-name','newsletter','wellness_2026','TIKTOK','__proto__']){
const query=new URLSearchParams(Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_id'].map(key=>[key,value])));
assert.deepEqual(campaignFields(query.toString()),{},value);
}
});
test('approved brand-kit and agency labels work while wrong-field and repeated tokens are omitted',()=>{
assert.deepEqual(campaignFields('?utm_source=brand_kit&utm_medium=referral&utm_campaign=paid_partnerships&utm_content=zh_overview'),{campaign_source:'brand_kit',campaign_medium:'referral',campaign_name:'paid_partnerships',campaign_content:'zh_overview'});
assert.deepEqual(campaignFields('?utm_source=agency_outreach&utm_medium=email&utm_campaign=paid_partnerships&utm_content=agency_overview'),{campaign_source:'agency_outreach',campaign_medium:'email',campaign_name:'paid_partnerships',campaign_content:'agency_overview'});
assert.deepEqual(campaignFields('?utm_source=tiktok&utm_source=jane.doe&utm_medium=tiktok&utm_content=drew_review1_bio'),{campaign_content:'drew_review1_bio'});
});
test('contact data and arbitrary queries never become Analytics campaign fields',()=>{
assert.deepEqual(campaignFields('?email=private@example.com&name=Private&utm_source=person%40example.com&utm_campaign=https%3A%2F%2Fexample.com%2Fprivate&utm_term=personal+health+question&gclid=opaque'),{});
});

test('new generic public placements are accepted without accepting arbitrary campaign names or identifiers',()=>{
  for(const [source,medium,content] of [
    ['instagram','organic_social','instagram_bio'], ['linkedin','organic_social','linkedin_profile'],
    ['email_signature','email','email_signature'], ['qr_code','referral','printed_qr'],
  ]){
    const query=new URLSearchParams({utm_source:source,utm_medium:medium,utm_campaign:'paid_partnerships',utm_content:content,utm_id:'private-receipt',utm_term:'private-product',email:'private@example.com'});
    assert.deepEqual(campaignFields(query.toString()),{campaign_source:source,campaign_medium:medium,campaign_name:'paid_partnerships',campaign_content:content});
  }
  for(const value of ['Instagram','LinkedIn','private_brand','client_123','campaign_2026','instagram_bio']){
    assert.deepEqual(campaignFields(new URLSearchParams({utm_source:value,utm_campaign:value,utm_id:value}).toString()),{});
  }
  assert.deepEqual(campaignFields('?utm_source=instagram&utm_source=linkedin&utm_medium=instagram&utm_campaign=printed_qr&utm_content=qr_code'),{});
});
