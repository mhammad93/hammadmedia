'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {validReceipt}=require('../assets/redesign/thanks');
const key='hm-inquiry-receipt-v1';
const receipt=()=>({version:1,reference:'00000000-0000-4000-8000-000000000001',locale:'en',receivedAt:Date.now(),confirmationViewed:false});
function visit(store,preview=false){
  const nodes=Object.fromEntries(['confirmation-received','confirmation-missing','confirmation-reference'].map(id=>[id,{hidden:id==='confirmation-received',textContent:''}]));
  const events=[];const context={document:{getElementById:id=>nodes[id],body:{dataset:{preview:String(preview)}},documentElement:{lang:'en'}},location:new URL('https://hammadmedia.com/thanks/?success=true&email=private@example.com'),sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},gtag:(...e)=>events.push(e)};context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/redesign/thanks.js'),'utf8'),context);return {nodes,events};
}
test('missing, invalid, future or expired receipt cannot claim receipt or emit a confirmation event',()=>{
  for(const r of [null,{...receipt(),reference:'fake'},{...receipt(),receivedAt:Date.now()+99999},{...receipt(),receivedAt:Date.now()-86400001}]){
    assert.equal(validReceipt(r),false);const app=visit(new Map([[key,JSON.stringify(r)]]));assert.equal(app.nodes['confirmation-received'].hidden,true);assert.deepEqual(app.events,[]);
  }
});
test('confirmed thank-you renders receipt and one non-key confirmation event; refresh does not emit a lead',()=>{
  const store=new Map([[key,JSON.stringify(receipt())]]);const first=visit(store),refresh=visit(store);
  assert.equal(first.nodes['confirmation-received'].hidden,false);assert.equal(first.nodes['confirmation-missing'].hidden,true);
  assert.equal(first.events.length,1);assert.equal(first.events[0][1],'inquiry_confirmation_view');assert.equal(refresh.events.length,0);
  assert.doesNotMatch(JSON.stringify(first.events),/private@example|00000000|generate_lead|success=true/);
  const preview=visit(new Map([[key,JSON.stringify(receipt())]]),true);assert.equal(preview.nodes['confirmation-received'].hidden,false);assert.deepEqual(preview.events,[]);
});
