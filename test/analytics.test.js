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
