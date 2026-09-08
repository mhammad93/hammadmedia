'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(preview){
  let observer;const events=[],observed=[],handlers=[];const sections=Object.fromEntries(['results','creator','packages','process','faq','contact'].map(id=>['#'+id+' h2',{closest:()=>({id})}]));
  const detail={open:false,dataset:{faqKey:'creative_control'},addEventListener:(name,cb)=>handlers.push(cb)};
  const context={document:{body:{dataset:{preview:String(preview)}},documentElement:{lang:'zh-CN'},querySelector:s=>sections[s],querySelectorAll:()=>[detail]},location:new URL('https://hammadmedia.com/zh/?email=private@example.com'),gtag:(...args)=>events.push(args),IntersectionObserver:class{constructor(cb){observer=cb;}observe(h){observed.push(h);}unobserve(){}}};context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/redesign/engagement.js'),'utf8'),context);return {events,observed,detail,handlers,intersect:()=>observer([{isIntersecting:true,target:observed[0]}])};
}
test('section views count once per page and FAQ events use fixed keys without query text',()=>{
  const app=harness(false);assert.equal(app.observed.length,6);app.intersect();app.intersect();app.handlers[0]();app.detail.open=true;app.handlers[0]();
  assert.deepEqual(app.events.map(e=>e[1]),['section_view','faq_open']);assert.equal(app.events[0][2].section_id,'results');assert.equal(app.events[1][2].faq_key,'creative_control');assert.doesNotMatch(JSON.stringify(app.events),/private@example/);
});
test('review preview never starts engagement observers or events',()=>{const app=harness(true);assert.equal(app.observed.length,0);assert.equal(app.handlers.length,0);assert.equal(app.events.length,0);});
