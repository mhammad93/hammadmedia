'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {campaignFields}=require('../assets/redesign/analytics');
test('approved campaign labels retain acquisition attribution without copying the URL',()=>{
assert.deepEqual(campaignFields('?utm_source=tiktok&utm_medium=creator_bio&utm_campaign=wellness_2026&utm_content=drew-review&utm_id=hm42'),{campaign_source:'tiktok',campaign_medium:'creator_bio',campaign_name:'wellness_2026',campaign_content:'drew-review',campaign_id:'hm42'});
});
test('contact data and arbitrary queries never become Analytics campaign fields',()=>{
assert.deepEqual(campaignFields('?email=private@example.com&name=Private&utm_source=person%40example.com&utm_campaign=https%3A%2F%2Fexample.com%2Fprivate&utm_term=personal+health+question&gclid=opaque'),{});
});
