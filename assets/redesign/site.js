/* Hammad Media preview and production interactions. No visitor text is sent to Analytics. */
(()=>{'use strict';
const root=document.documentElement, zh=root.lang==='zh-CN';
const t=(en,cn)=>zh?cn:en;
const track=(event,params={})=>{if(document.body.dataset.preview==='false'&&typeof window.gtag==='function'){window.gtag('event',event,{...params,page_location:location.origin+location.pathname,site_language:zh?'zh':'en'});return true;}return false;};
const themeButton=document.querySelector('.theme-toggle');
function updateThemeButton(){if(!themeButton)return;const dark=root.dataset.theme!=='light';themeButton.textContent=dark?t('Light','浅色'):t('Dark','深色');themeButton.setAttribute('aria-label',dark?t('Switch to light theme','切换浅色模式'):t('Switch to dark theme','切换深色模式'));themeButton.setAttribute('aria-pressed',String(!dark));}
updateThemeButton();themeButton?.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('hm-theme',root.dataset.theme)}catch{}updateThemeButton();});
document.querySelector('[data-language-switch]')?.addEventListener('click',()=>track('language_select',{selected_language:zh?'en':'zh'}));
document.querySelectorAll('a[href^="mailto:"],a[href^="https://wa.me/"]').forEach(a=>a.addEventListener('click',()=>track('contact_click',{contact_method:a.href.startsWith('mailto:')?'email':'whatsapp',cta_location:a.closest('.conversion-dock')?'sticky':a.closest('.site-footer')?'footer':'contact'})));
document.querySelectorAll('[data-inquiry-cta]').forEach(a=>a.addEventListener('click',()=>track('inquiry_cta_click',{cta_location:a.closest('.site-header')?'header':'sticky'})));
document.querySelectorAll('[data-profile]').forEach(a=>a.addEventListener('click',()=>{const key=a.dataset.profile;if(['drew.review','drew.review1'].includes(key))track('profile_click',{profile_key:key,cta_location:a.closest('.hero-label')?'hero':'creator'});}));
document.querySelectorAll('[data-product]').forEach(a=>a.addEventListener('click',()=>track('proof_video_click',{product_key:a.dataset.product})));
const form=document.getElementById('inquiry-form');if(!form)return;
const select=form.elements.engagement, category=document.getElementById('category-field'), submit=document.getElementById('inquiry-submit'), status=document.getElementById('form-status');
let config=null, widget=null, challengeToken='', requestId=crypto.randomUUID(), busy=false, attemptMade=false, mode='checking', pending=null, draftStored=false;
const draftKey='hm-pending-inquiry-v1';
const receiptKey='hm-inquiry-receipt-v1';
const draftFields=['brand','name','email','product','engagement','message','commission','timing','exact_category','website'];
const restoredMessage=()=>t('Restored an inquiry with unconfirmed receipt. Retry with the saved reference to avoid duplicates. Reference: ','已恢复一份尚未确认收到的咨询。请使用已保存编号重试，以避免重复。编号：')+requestId;
const storageNotice=()=>draftStored?'':t(' Browser draft storage is unavailable; keep this page open while retrying.',' 浏览器草稿存储不可用，请保持此页面打开后重试。');
function clearPending(){pending=null;draftStored=false;try{sessionStorage.removeItem(draftKey)}catch{}}
function preservePending(payload){const {turnstile_token,...envelope}=payload;pending=envelope;try{sessionStorage.setItem(draftKey,JSON.stringify({version:1,payload:envelope}));draftStored=true;}catch{draftStored=false;}}
function confirmReceipt(p){
  mode='received';clearPending();
  statusText(t('Your inquiry has been received. Keep this reference: ','已收到您的咨询，请保留编号：')+p.submission_id);
  form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);submit.textContent=t('Inquiry received','已收到咨询');
  let stored=false,previous;try{previous=JSON.parse(sessionStorage.getItem(receiptKey));}catch{}
  const duplicate=previous?.reference===p.submission_id;
  const receipt=duplicate?previous:{version:1,reference:p.submission_id,receivedAt:Date.now(),locale:zh?'zh':'en',confirmationViewed:false};
  try{sessionStorage.setItem(receiptKey,JSON.stringify(receipt));stored=true;}catch{}
  let navigated=false;
  const next=()=>{if(stored&&!navigated){navigated=true;location.href=zh?'/zh/thanks/':'/thanks/';}};
  if(duplicate){next();return;}
  // Queue the event before leaving, and give the tag a bounded chance to dispatch.
  // A blocked tag must never prevent the visitor from seeing their confirmation.
  if(track('generate_lead',{partnership_package:p.engagement,lead_type:'paid_partnership',event_callback:next,event_timeout:1000}))setTimeout(next,1200);else next();
}
function restorePending(){try{const raw=sessionStorage.getItem(draftKey);if(!raw)return;const saved=JSON.parse(raw),p=saved?.payload;
if(saved.version!==1||!p||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.submission_id)||!['en','zh'].includes(p.locale)||p.paid_partnership_ack!==true||draftFields.some(k=>typeof p[k]!=='string')||!p.attribution||typeof p.attribution!=='object'||Array.isArray(p.attribution)||Object.values(p.attribution).some(v=>typeof v!=='string')||'turnstile_token' in p)throw new Error('Invalid saved draft');
const allowed=new Set([...draftFields,'submission_id','locale','paid_partnership_ack','attribution']);if(Object.keys(p).some(k=>!allowed.has(k)))throw new Error('Invalid saved fields');
for(const name of draftFields)if(form.elements[name])form.elements[name].value=p[name];form.elements.paid_partnership_ack.checked=true;
pending=p;requestId=p.submission_id;attemptMade=true;draftStored=true;
}catch{clearPending();}}
restorePending();
const tokenContainer=document.getElementById('turnstile-container');
function statusText(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
function offerEmailDraft(){const a=document.createElement('a');a.href='mailto:contact@hammadmedia.com';a.textContent=t('Prepare an email instead','改为准备邮件');a.addEventListener('click',event=>{event.preventDefault();emailDraft(getPayload());});status.append(' ',a);}
function emailFallback(reason){mode=attemptMade&&config?.enabled?'api':'email';statusText((pending?restoredMessage()+' ':'')+reason);offerEmailDraft();submit.disabled=false;submit.textContent=mode==='api'?t('Retry verification','重试验证'):t('Prepare inquiry by email','通过邮件准备咨询');}
function syncCategory(){const exclusive=select.value==='Exclusivity';category.hidden=!exclusive;form.elements.exact_category.required=exclusive;form.elements.exact_category.disabled=!exclusive;}
select.addEventListener('change',syncCategory);syncCategory();
document.querySelectorAll('[data-tier]').forEach(a=>a.addEventListener('click',()=>{select.value=a.dataset.tier;syncCategory();materialEdit();track('package_select',{partnership_package:a.dataset.tier});}));
document.querySelectorAll('[data-analytics]').forEach(a=>a.addEventListener('click',()=>track(a.dataset.analytics)));
let started=false;form.addEventListener('focusin',()=>{if(!started){started=true;track('partnership_form_start');}},{once:true});
function renderChallenge(){if(!window.turnstile||!config?.enabled)return;if(widget!==null)window.turnstile.remove(widget);challengeToken='';submit.disabled=true;widget=window.turnstile.render(tokenContainer,{sitekey:config.turnstileSiteKey,action:'brand_inquiry',cData:requestId,theme:root.dataset.theme==='light'?'light':'dark',callback:token=>{challengeToken=token;if(!busy)submit.disabled=false;},'expired-callback':()=>{challengeToken='';submit.disabled=true;},'error-callback':()=>{challengeToken='';emailFallback(t('Spam verification is unavailable. You can send your inquiry by email.','垃圾信息验证暂时不可用，可通过邮件发送咨询。'));}});}
function materialEdit(){if(attemptMade){clearPending();requestId=crypto.randomUUID();attemptMade=false;if(mode==='api')renderChallenge();}}
form.addEventListener('input',materialEdit);form.addEventListener('change',materialEdit);
function getPayload(){if(pending)return {...pending,turnstile_token:challengeToken};const fd=new FormData(form);const p={submission_id:requestId,brand:String(fd.get('brand')||'').trim(),name:String(fd.get('name')||'').trim(),email:String(fd.get('email')||'').trim(),product:String(fd.get('product')||'').trim(),engagement:String(fd.get('engagement')||''),message:String(fd.get('message')||'').trim(),commission:String(fd.get('commission')||'').trim(),timing:String(fd.get('timing')||'').trim(),exact_category:String(fd.get('exact_category')||'').trim(),paid_partnership_ack:fd.get('paid_partnership_ack')==='on',website:String(fd.get('website')||''),locale:zh?'zh':'en',turnstile_token:challengeToken};p.attribution=window.hmAttribution?.current()||{page_path:zh?'/zh/':'/'};return p;}
function emailDraft(p){track('contact_click',{contact_method:'email',cta_location:'form_fallback'});const rows=[[t('Inquiry reference','咨询编号'),p.submission_id],[t('Brand / agency','品牌／机构'),p.brand],[t('Name','姓名'),p.name],[t('Email','邮箱'),p.email],[t('Product','产品'),p.product],[t('Package','套餐'),p.engagement],[t('Category','品类'),p.exact_category],[t('Commission','佣金'),p.commission],[t('Timing','时间'),p.timing],[t('Details','详情'),p.message],...Object.entries(p.attribution||{}).map(([key,value])=>['Source / 来源: '+key,value])].filter(x=>x[1]);const body=rows.map(x=>`${x[0]}: ${x[1]}`).join('\n\n')+'\n\n'+t('I understand this is a paid partnership inquiry.','我已知悉这是付费合作咨询。');const url='mailto:contact@hammadmedia.com?subject='+encodeURIComponent('New brand inquiry: HammadMedia.com')+'&body='+encodeURIComponent(body);if(url.length>7500){statusText(t('This inquiry is too long for an email link. Please copy your details into an email to contact@hammadmedia.com.','咨询内容过长，请复制信息并发送至 contact@hammadmedia.com。'),true);return;}location.href=url;statusText(t('Your email app can prepare the inquiry for you to review and send. Opening an email draft does not submit it to the inquiry service.','邮件应用可为您准备咨询，请自行检查并发送。打开邮件草稿不会向咨询服务提交信息。'));}
form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const p=getPayload();if(mode==='email'){emailDraft(p);return;}if(mode!=='api'||!challengeToken){if(mode==='api')renderChallenge();statusText(t('Please complete the spam verification, or email contact@hammadmedia.com.','请完成验证，或发送邮件至 contact@hammadmedia.com。'),true);return;}
track('partnership_form_attempt',{partnership_package:p.engagement});busy=true;attemptMade=true;preservePending(p);submit.disabled=true;submit.textContent=t('Sending inquiry…','正在发送…');statusText(t('Saving your inquiry securely…','正在安全保存咨询…'));
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),22000);
try{const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),signal:controller.signal});let data={};try{data=await response.json()}catch{}if(response.status===202&&data.ok&&data.status==='received'&&data.submission_id===p.submission_id){confirmReceipt(p);return;}
if(response.status===503){track('partnership_form_error',{form_error_reason:'service_unavailable'});statusText(t('The service could not confirm receipt. Your draft and reference are retained. Retry here or prepare an email.','服务尚无法确认收到。草稿及编号已保留，您可以在此重试或准备邮件。')+storageNotice(),true);offerEmailDraft();return;}
track('partnership_form_error',{form_error_reason:response.status===429?'rate_limited':'rejected'});statusText(response.status===429?t('Please wait before trying again, or email contact@hammadmedia.com.','请稍后重试，或发送邮件至 contact@hammadmedia.com。'):t('The inquiry was not confirmed. Check your details and retry, or email contact@hammadmedia.com.','咨询尚未确认收到，请检查信息后重试，或发送邮件至 contact@hammadmedia.com。'),true);
}catch{track('partnership_form_error',{form_error_reason:'network'});statusText(t('We could not confirm receipt. Your details are still here. Retry with the same reference to avoid duplicates, or email contact@hammadmedia.com. Reference: ','尚无法确认收到。填写内容仍保留在页面中；请使用相同编号重试以避免重复，或发送邮件至 contact@hammadmedia.com。编号：')+requestId+storageNotice(),true);offerEmailDraft();}finally{clearTimeout(timeout);busy=false;if(mode==='api'){submit.textContent=t('Retry inquiry','重试发送');renderChallenge();}}});
fetch('/api/intake-config',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Unavailable');return r.json()}).then(c=>{config=c;if(!c.enabled||!c.turnstileSiteKey){emailFallback(document.body.dataset.preview==='true'?t('This is a review preview. Form delivery is not active yet. You can prepare an email inquiry instead.','这是审核预览，表单投递尚未启用。您可以改为准备邮件咨询。'):t('Please send your inquiry by email while the form is being updated.','表单更新期间，请通过邮件发送咨询。'));return;}mode='api';statusText(pending?restoredMessage():t('Ready for your partnership inquiry.','欢迎提交您的合作咨询。'));window.hmTurnstileReady=renderChallenge;const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=hmTurnstileReady';script.async=true;script.defer=true;script.onerror=()=>emailFallback(t('Spam verification could not load. Please send your inquiry by email.','验证功能未能加载，请通过邮件发送咨询。'));document.head.append(script);}).catch(()=>emailFallback(t('The form is unavailable right now. You can prepare an email inquiry instead.','表单目前不可用，您可以改为准备邮件咨询。')));
})();
