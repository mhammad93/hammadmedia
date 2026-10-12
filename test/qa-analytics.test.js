'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
function clientHarness({store = new Map(), post, locale = 'en', preview = false, enabled = true, query='', brand='Actual Brand', qa=false} = {}) {
  const calls = [], analytics = [], scripts = [], renders = [];
  const consentStore=new Map([['hm-analytics-consent-v1',JSON.stringify({version:1,choice:'accepted',timestamp:Date.now()-1000})]]);
  let resizeObserver, tokenWidth=330;
  class Element {
    constructor(value='') {this.value=value;this.checked=false;this.disabled=false;this.required=false;this.hidden=false;this.textContent='';this.dataset={};this.handlers={};this.children=[];this.classList={toggle(){}};}
    addEventListener(name,handler){(this.handlers[name] ||= []).push(handler);}
    setAttribute(name,value){this[name]=value;}
    remove(){this.removed=true;}
    append(...values){this.children.push(...values);}
    async fire(name){for(const handler of this.handlers[name]||[])await handler({preventDefault(){}});}
  }
  const fields = Object.fromEntries(['brand','name','email','product','engagement','message','commission','timing','exact_category','website','paid_partnership_ack'].map(k=>[k,new Element()]));
  Object.assign(fields.brand,{value:brand,required:true});Object.assign(fields.email,{value:'private@example.com',required:true});Object.assign(fields.product,{value:'Private product detail',required:true});
  fields.engagement.value='5 videos';fields.message.value='Private campaign message';fields.commission.value='Private offered commission';fields.name.value='Private person name';fields.paid_partnership_ack.checked=true;
  const form = new Element();form.elements=fields;
  const button = new Element(), status = new Element(), category = new Element(), token = new Element();
  token.getBoundingClientRect=()=>({width:tokenWidth});
  form.reportValidity=()=>Object.values(fields).every(f=>f.disabled||!f.required||Boolean(f.value));
  form.querySelectorAll=()=>[...Object.values(fields),button];
  const nodes={'inquiry-form':form,'category-field':category,'inquiry-submit':button,'form-status':status,'turnstile-container':token,'confirmation-received':new Element(),'confirmation-reference':new Element(),'confirmation-missing':new Element()};
  const tiers=['5 videos','Exclusivity'].map(value=>{const a=new Element();a.dataset.tier=value;return a;});
  const document={documentElement:{lang:locale==='zh'?'zh-CN':'en',dataset:{theme:'dark'}},body:{dataset:{preview:String(preview)}},referrer:'https://referrer.example/path?email=private@example.com',
    getElementById:id=>nodes[id],querySelector:()=>null,querySelectorAll:selector=>selector==='[data-tier]'?tiers:[],createElement:()=>new Element(),head:{append(script){scripts.push(script);},appendChild(script){scripts.push(script);}}};
  let uuid=0, challenge, widget=0;
  const context={document,location:{origin:'https://hammadmedia.com',hostname:'hammadmedia.com',reload(){throw new Error('QA exclusion must not reload');},pathname:locale==='zh'?'/zh/':'/',search:query,href:'https://hammadmedia.com/'+(locale==='zh'?'zh/':'')+query},URL,URLSearchParams,AbortController,
    localStorage:{getItem:key=>consentStore.get(key)??null,setItem:(key,value)=>consentStore.set(key,value),removeItem:key=>consentStore.delete(key)},addEventListener(){},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`},
    FormData:class{get(k){const f=fields[k];return !f||f.disabled?null:k==='paid_partnership_ack'?(f.checked?'on':null):f.value;}},
    setTimeout:(callback,delay)=>{if(delay===1200)callback();return 1;},clearTimeout(){},gtag:(...args)=>{analytics.push(args);args[2]?.event_callback?.();},
    fetch:async(url,options={})=>{if(url==='/api/intake-config')return {ok:true,json:async()=>({enabled,turnstileSiteKey:enabled?'public-site-key':null})};
      const body=JSON.parse(options.body);calls.push(body);if(post)return post(body,calls.length);return {status:202,json:async()=>({ok:true,status:'received',submission_id:body.submission_id})};},
    ResizeObserver:class{constructor(callback){resizeObserver=callback;}observe(){}},
    turnstile:{render(container,options){challenge=options;renders.push(options);return ++widget;},remove(){}},
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/attribution.js'),'utf8'),context);
  if(qa)context.location.search='?hm_qa=1';
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/analytics.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/site.js'),'utf8'),context);
  const ready=(async()=>{for(let i=0;i<8;i++)await Promise.resolve();if(context.hmTurnstileReady){context.hmTurnstileReady();challenge.callback('ephemeral-token');}})();
  return {store,calls,analytics,scripts,events:()=>Array.from(context.dataLayer||[],args=>Array.from(args)),thanks(){vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/redesign/thanks.js'),'utf8'),context);},fields,status,button,category,form,tiers,context,ready,renders,resize(width){tokenWidth=width;resizeObserver();},verify(){challenge.callback('fresh-ephemeral-token');},submit:()=>form.fire('submit')};
}

test('explicit QA still submits the real intake with its unchanged receipt but emits no Google events',async()=>{
  const app=clientHarness({qa:true});await app.ready;
  await app.form.fire('focusin');await app.submit();app.thanks();
  assert.equal(app.calls.length,1);
  assert.equal(app.calls[0].brand,'Actual Brand');
  const receipt=JSON.parse(app.store.get('hm-inquiry-receipt-v1'));
  assert.equal(receipt.reference,app.calls[0].submission_id);
  assert.match(app.context.location.href,/^\/thanks\/\?hm_qa=1$/);
  assert.deepEqual(app.events(),[]);
  assert.ok(app.scripts.every(script=>!String(script.src).includes('googletagmanager')));
});

test('TEST ONLY labeled submissions stop GA before attempts, accepted lead, and confirmation',async()=>{
  const app=clientHarness({brand:'TEST ONLY - analytics verification'});await app.ready;
  // Consent may already have produced a page view before the visitor types the label.
  assert.equal(app.events().filter(e=>e[1]==='page_view').length,1);
  await app.submit();app.thanks();
  assert.equal(app.calls.length,1);
  assert.equal(app.calls[0].brand,'TEST ONLY - analytics verification');
  assert.equal(app.context['ga-disable-G-NEX74824JL'],true);
  assert.equal(app.context.gtag,undefined);
  assert.deepEqual(app.events(),[]);
  assert.equal(app.store.get('hm-analytics-qa-v1'),'1');
  assert.match(app.context.location.href,/hm_qa=1/);
  assert.ok(app.scripts.find(script=>String(script.src).includes('googletagmanager')).removed);
});

test('an ordinary accepted partnership stays distinct from contact intent with one lead and one confirmation',async()=>{
  const app=clientHarness();await app.ready;
  await app.form.fire('focusin');await app.form.fire('focusin');await app.submit();app.thanks();app.thanks();
  const names=app.events().filter(e=>e[0]==='event').map(e=>e[1]);
  assert.equal(names.filter(name=>name==='partnership_form_start').length,1);
  assert.equal(names.filter(name=>name==='partnership_form_attempt').length,1);
  assert.equal(names.filter(name=>name==='generate_lead').length,1);
  assert.equal(names.filter(name=>name==='inquiry_confirmation_view').length,1);
  assert.equal(names.filter(name=>name==='contact_click').length,0);
  assert.equal(app.context.location.href,'/thanks/');
  assert.doesNotMatch(JSON.stringify(app.events()),/Actual Brand|Private|private@example|submission_id/);
});

test('restored TEST ONLY payloads and duplicate receipts remain suppressed with the same intake identity',async()=>{
  const store=new Map();
  const first=clientHarness({store,brand:'TEST ONLY - recovered',post:async()=>({status:503,json:async()=>({})})});await first.ready;await first.submit();
  store.delete('hm-analytics-qa-v1');
  const restored=clientHarness({store});await restored.ready;await restored.submit();restored.thanks();
  assert.equal(restored.calls[0].submission_id,first.calls[0].submission_id);
  assert.equal(restored.calls[0].brand,'TEST ONLY - recovered');
  assert.deepEqual(restored.events(),[]);
  // Simulate recovering the same uncertain envelope after receipt was already stored.
  const {turnstile_token,...payload}=restored.calls[0];
  store.set('hm-pending-inquiry-v1',JSON.stringify({version:1,payload}));store.delete('hm-analytics-qa-v1');
  const duplicate=clientHarness({store});await duplicate.ready;await duplicate.submit();duplicate.thanks();
  assert.equal(duplicate.calls[0].submission_id,restored.calls[0].submission_id);
  assert.deepEqual(duplicate.events(),[]);
  assert.match(duplicate.context.location.href,/hm_qa=1/);
});

test('form start waits for consent and is recorded once when focus returns after acceptance',async()=>{
  const app=clientHarness();await app.ready;
  const tag=app.context.gtag;delete app.context.gtag;
  await app.form.fire('focusin');
  app.context.gtag=tag;
  await app.form.fire('focusin');await app.form.fire('focusin');
  assert.equal(app.events().filter(e=>e[1]==='partnership_form_start').length,1);
});


test('direct email fallback for a TEST ONLY brand excludes contact intent before opening the draft',async()=>{
  // An unavailable POST offers a direct fallback whose click bypasses submit.
  // Restore GA to model someone changing a real inquiry to a test after an error.
  const ordinary=clientHarness({post:async()=>({status:503,json:async()=>({})})});await ordinary.ready;await ordinary.submit();
  ordinary.fields.brand.value='TEST ONLY - direct email';
  // A material edit unfreezes the earlier payload before choosing the fallback.
  await ordinary.form.fire('input');
  const fallback=ordinary.status.children.find(element=>element?.href==='mailto:contact@hammadmedia.com');
  assert.ok(fallback);
  await fallback.fire('click');
  assert.equal(ordinary.context.gtag,undefined);
  assert.equal(ordinary.context['ga-disable-G-NEX74824JL'],true);
  assert.deepEqual(ordinary.events(),[]);
  assert.match(ordinary.context.location.href,/^mailto:contact@hammadmedia.com/);
});
