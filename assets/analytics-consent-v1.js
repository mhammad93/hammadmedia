/*
 * Basic Analytics consent: this file itself performs no network requests until
 * an explicit, valid acceptance has been read back from localStorage.
 * hm-analytics-consent-v1 = {version:1, choice:'accepted'|'declined', timestamp:ms}.
 * Choices expire after 180 days. Unavailable storage fails closed, including
 * saved choices that cannot be safely updated or withdrawn in this browser.
 *
 * UI contract: #analytics-consent, #analytics-accept, #analytics-decline and
 * [data-analytics-settings]. The banner starts hidden in HTML. Only the exact
 * HTTPS production origins initialize; Vercel/GitHub previews and local copies
 * stay inert. hmAnalyticsConsent exposes current()/openSettings();
 * CommonJS exports campaignFields only, for the existing campaign tests.
 *
 * Withdrawal disables this property before deleting only its two GA cookies,
 * clears queued commands, suppresses deferred callbacks and reloads to remove
 * the loaded tracker. Other-tab withdrawal and expiry follow the same path.
 *
 * Legacy FormSubmit has no authenticated delivery receipt. Form handoff and a
 * recent same-tab return are navigation observations, never generate_lead or
 * proof of provider acceptance/inbox delivery. No form text is collected.
 * Approved public campaign labels survive navigation in sessionStorage only;
 * this attribution never creates events or bypasses Analytics consent.
 */
(function(scope){
  'use strict';
  function campaignFields(search){
    const query=new URLSearchParams(search), fields={};
    // Exact public labels, not a permissive syntax check. Extend only through
    // the reviewed controlled-campaign-links.md convention and matching tests.
    const allowed={utm_source:['tiktok','brand_kit','agency_outreach'],utm_medium:['organic_social','referral','email'],utm_campaign:['paid_partnerships'],utm_content:['drew_review_bio','drew_review1_bio','en_overview','zh_overview','agency_overview']};
    const mapping={utm_source:'campaign_source',utm_medium:'campaign_medium',utm_campaign:'campaign_name',utm_content:'campaign_content'};
    for(const [key,target] of Object.entries(mapping)){
      const values=query.getAll(key);
      if(values.length===1&&allowed[key].includes(values[0]))fields[target]=values[0];
    }
    return fields;
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={campaignFields};return;}
  if(!scope.document||!['https://hammadmedia.com','https://www.hammadmedia.com'].includes(scope.location?.origin)||scope.hmAnalyticsConsent)return;
  const document=scope.document, measurement='G-NEX74824JL', disableKey='ga-disable-'+measurement;
  const storageKey='hm-analytics-consent-v1', lifetime=180*86400000;
  const handoffKey='hm-formsubmit-handoff-v1';
  const campaignKey='hm-legacy-campaign-v1';
  const isThanks=['/thanks','/thanks.html'].includes(scope.location.pathname);
  const banner=document.getElementById('analytics-consent');
  const accept=document.getElementById('analytics-accept'), decline=document.getElementById('analytics-decline');
  let choice=null, active=false, initialized=false, unloading=false, tracker=null, expiryTimer=null;
  let returnEventPending=false;
  let campaign=restoreCampaign();
  scope[disableKey]=true;
  delete scope.gtag;

  function parse(raw){
    try{
      if(typeof raw!=='string'||raw.length>256)return null;
      const value=JSON.parse(raw);
      if(!value||value.version!==1||!['accepted','declined'].includes(value.choice)||!Number.isSafeInteger(value.timestamp)||value.timestamp>Date.now()||Date.now()-value.timestamp>=lifetime)return null;
      return {version:1,choice:value.choice,timestamp:value.timestamp};
    }catch{return null;}
  }
  function read(){try{return parse(scope.localStorage.getItem(storageKey));}catch{return null;}}
  function save(value){
    try{
      scope.localStorage.setItem(storageKey,JSON.stringify(value));
      const stored=read();
      return stored?.choice===value.choice&&stored.timestamp===value.timestamp;
    }catch{return false;}
  }
  function removeChoice(){try{scope.localStorage.removeItem(storageKey);}catch{}}
  function show(){if(banner){banner.hidden=false;decline?.focus();}}
  function hide(){if(banner)banner.hidden=true;}
  function clearCookies(){
    const hostname=scope.location.hostname;
    const domains=new Set(['']);
    if(/^[a-z0-9.-]+$/i.test(hostname)){
      const parts=hostname.split('.');
      for(let i=0;i<Math.max(1,parts.length-1);i++){
        const domain=parts.slice(i).join('.');domains.add(domain);domains.add('.'+domain);
      }
    }
    const paths=new Set(['/','/zh','/zh/','/privacy','/privacy/','/zh/privacy','/zh/privacy/','/thanks','/thanks/','/zh/thanks','/zh/thanks/']);
    // Include each ancestor path for a cookie set before the current route map.
    if(/^\/[a-z0-9/_-]*$/i.test(scope.location.pathname)){
      const parts=scope.location.pathname.split('/').filter(Boolean);let path='';
      for(const part of parts){path+='/'+part;paths.add(path);paths.add(path+'/');}
    }
    for(const name of ['_ga','_ga_NEX74824JL'])for(const domain of domains)for(const path of paths){
      try{document.cookie=name+'=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path='+path+(domain?'; Domain='+domain:'')+'; SameSite=Lax; Secure';}catch{}
    }
  }
  function stop(){
    const wasActive=active;
    active=false;scope[disableKey]=true;delete scope.gtag;
    if(expiryTimer!==null)scope.clearTimeout(expiryTimer);
    if(Array.isArray(scope.dataLayer))scope.dataLayer.length=0;
    tracker?.remove();clearCookies();
    if(wasActive&&!unloading){unloading=true;scope.location.reload();}
  }
  function scheduleExpiry(){
    if(expiryTimer!==null)scope.clearTimeout(expiryTimer);
    if(!choice)return;
    const remaining=choice.timestamp+lifetime-Date.now();
    if(remaining<=0){choice=null;removeChoice();stop();show();return;}
    expiryTimer=scope.setTimeout(scheduleExpiry,Math.min(remaining,2147483647));
  }
  function origin(value){try{const url=new URL(value);return url.protocol==='https:'?url.origin:'';}catch{return '';}}
  function restoreCampaign(){
    try{
      const raw=scope.sessionStorage.getItem(campaignKey);
      if(typeof raw!=='string'||raw.length>2048)return {};
      const saved=JSON.parse(raw);
      if(saved?.version!==1||!saved.campaign||typeof saved.campaign!=='object'||Array.isArray(saved.campaign))return {};
      const keys={campaign_source:'utm_source',campaign_medium:'utm_medium',campaign_name:'utm_campaign',campaign_content:'utm_content'};
      const query=new URLSearchParams();
      for(const [field,key] of Object.entries(keys))if(typeof saved.campaign[field]==='string')query.set(key,saved.campaign[field]);
      return campaignFields(query.toString());
    }catch{return {};}
  }
  function captureCampaign(){
    const incoming=campaignFields(scope.location.search);
    if(Object.keys(incoming).length)campaign=incoming;
    // Store only approved public labels, never the URL, form, user ID or dates.
    try{scope.sessionStorage.setItem(campaignKey,JSON.stringify({version:1,campaign}));}catch{}
  }
  function start(){
    if(active||initialized||unloading||choice?.choice!=='accepted')return;
    initialized=true;active=true;scope[disableKey]=false;scope.dataLayer=[];
    scope.gtag=function(...args){
      if(!active||unloading)return;
      // Already-queued form callbacks must also respect a later withdrawal.
      if(args[2]&&typeof args[2].event_callback==='function'){
        const callback=args[2].event_callback;
        args[2]={...args[2],event_callback:(...values)=>{if(active&&!unloading)callback(...values);}};
      }
      // gtag consumes an arguments object, not a custom network transport.
      (function(){scope.dataLayer.push(arguments);})(...args);
    };
    const consent={analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'};
    scope.gtag('consent','default',consent);
    scope.gtag('consent','update',{...consent,analytics_storage:'granted'});
    scope.gtag('js',new Date());
    captureCampaign();
    const paths=new Set(['/','/index.html','/thanks','/thanks.html','/404.html']);
    const path=paths.has(scope.location.pathname)?scope.location.pathname:'/404.html';
    const page={page_location:scope.location.origin+path,page_referrer:origin(document.referrer)};
    scope.gtag('config',measurement,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,ignore_referrer:isThanks,...page,...campaign});
    scope.gtag('event','page_view',{...page,page_title:document.title});
    recordReturn();
    tracker=document.createElement('script');tracker.async=true;tracker.referrerPolicy='no-referrer';
    tracker.src='https://www.googletagmanager.com/gtag/js?id='+measurement;
    document.head.appendChild(tracker);
    scheduleExpiry();
  }
  accept?.addEventListener('click',()=>{
    if(unloading)return;
    const accepted={version:1,choice:'accepted',timestamp:Date.now()};
    if(!save(accepted)){choice=null;removeChoice();stop();show();return;}
    choice=accepted;hide();start();scheduleExpiry();
  });
  decline?.addEventListener('click',()=>{
    choice={version:1,choice:'declined',timestamp:Date.now()};
    if(!save(choice))removeChoice();
    hide();stop();
  });
  document.querySelectorAll('[data-analytics-settings]').forEach(button=>{button.hidden=false;button.addEventListener('click',event=>{event.preventDefault();show();});});
  scope.hmAnalyticsConsent=Object.freeze({current:()=>choice?.choice||null,openSettings:show});

  const packages=Object.freeze({
    'Starter (5 videos)':'starter_5_videos',
    'Retainer + Commission':'retainer_commission',
    'Exclusive (own the category)':'category_exclusivity',
    'Not sure yet — recommend one':'help_me_choose',
  });
  const packageName=value=>Object.hasOwn(packages,value)?packages[value]:undefined;
  function track(name,params={}){
    if(!active||unloading)return false;
    scope.gtag('event',name,{...params,site_version:'current_design',page_location:scope.location.origin+(isThanks?'/thanks.html':'/')});
    return true;
  }
  function recordReturn(){
    if(!returnEventPending||!active)return;
    returnEventPending=false;
    track('formsubmit_return_view',{submission_context:'recent_handoff'});
  }
  function prepareReturn(){
    if(!isThanks)return;
    try{
      const raw=scope.sessionStorage.getItem(handoffKey);
      if(!raw)return;
      if(raw.length>256)throw Error('Invalid local context');
      const saved=JSON.parse(raw),age=Date.now()-saved?.submittedAt;
      if(saved?.version!==1||!Number.isSafeInteger(saved.submittedAt)||age<0||age>30*60000||typeof saved.analyticsEligible!=='boolean'||typeof saved.returnViewed!=='boolean')throw Error('Invalid local context');
      const recent=document.getElementById('inquiry-recent-handoff'),unverified=document.getElementById('inquiry-unverified');
      if(recent&&unverified){recent.hidden=false;unverified.hidden=true;}
      const updated=JSON.stringify({version:1,submittedAt:saved.submittedAt,analyticsEligible:saved.analyticsEligible,returnViewed:true});
      scope.sessionStorage.setItem(handoffKey,updated);
      // No replay of an interaction that occurred before Analytics was accepted.
      returnEventPending=saved.analyticsEligible&&!saved.returnViewed&&read()?.choice==='accepted'&&scope.sessionStorage.getItem(handoffKey)===updated;
    }catch{try{scope.sessionStorage.removeItem(handoffKey);}catch{}}
  }
  document.addEventListener('click',event=>{
    const link=event.target?.closest?.('a[href]');if(!link)return;
    const packageKey=packageName(link.getAttribute('data-tier'));
    if(packageKey)track('package_select',{partnership_package:packageKey});
    const href=link.getAttribute('href');
    const placement=isThanks?'thank_you':link.closest('footer')?'footer':link.closest('nav')?'navigation':link.closest('.hero')?'hero':link.closest('#partner')?'packages':link.closest('#results')?'results':'contact';
    if(href==='#contact')track('contact_cta_click',{cta_location:placement});
    let url;try{url=new URL(link.href,scope.location.origin);}catch{return;}
    if(url.protocol==='mailto:')track('contact_click',{contact_method:'email',cta_location:placement});
    else if(url.protocol==='https:'&&url.hostname==='wa.me')track('contact_click',{contact_method:'whatsapp',cta_location:placement});
    else if(url.protocol==='https:'&&['www.tiktok.com','tiktok.com'].includes(url.hostname)&&/^\/@drew\.review1?\/video\/\d+\/?$/.test(url.pathname))track('proof_video_click',{cta_location:'results'});
  });
  const form=document.querySelector('.contact form');
  if(form){
    let started=false;
    form.addEventListener('focusin',()=>{if(!started)started=track('partnership_form_start');});
    form.addEventListener('invalid',()=>track('partnership_form_error',{form_error_reason:'browser_validation'}),true);
    form.addEventListener('submit',event=>{
      if(event.defaultPrevented||!form.checkValidity())return;
      // Functional, timestamp-only recognition also works when Analytics is off.
      try{scope.sessionStorage.setItem(handoffKey,JSON.stringify({version:1,submittedAt:Date.now(),analyticsEligible:active,returnViewed:false}));}catch{}
      if(!active)return;
      const packageKey=packageName(form.elements.engagement?.value);
      track('partnership_form_handoff',packageKey?{partnership_package:packageKey}:{});
      // Deliberately leave native validation, POST, _next and navigation intact.
    });
  }
  scope.addEventListener('storage',event=>{
    if(event.key!==storageKey&&event.key!==null)return;
    const saved=read();
    if(saved?.choice==='accepted')return; // Acceptance in another tab waits for navigation here.
    choice=saved;if(choice)hide();else show();stop();
  });
  captureCampaign();
  scope.addEventListener('hashchange',captureCampaign);
  scope.addEventListener('popstate',captureCampaign);
  prepareReturn();
  choice=read();
  if(choice?.choice==='accepted'){
    // A read-only/blocked store cannot reliably preserve a withdrawal later.
    if(save(choice)){hide();start();}else{choice=null;show();}
  }else if(choice){hide();}else{show();}
})(typeof window==='undefined'?globalThis:window);
