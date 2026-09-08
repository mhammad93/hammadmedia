/*
 * Basic Analytics consent: this file itself performs no network requests until
 * an explicit, valid acceptance has been read back from localStorage.
 * hm-analytics-consent-v1 = {version:1, choice:'accepted'|'declined', timestamp:ms}.
 * Choices expire after 180 days. Unavailable storage fails closed, including
 * saved choices that cannot be safely updated or withdrawn in this browser.
 *
 * UI contract: #analytics-consent, #analytics-accept, #analytics-decline and
 * [data-analytics-settings]. The banner starts hidden in HTML. No preview
 * initializes this module. hmAnalyticsConsent exposes current()/openSettings();
 * CommonJS exports campaignFields only, for the existing campaign tests.
 *
 * Withdrawal disables this property before deleting only its two GA cookies,
 * clears queued commands, suppresses deferred callbacks and reloads to remove
 * the loaded tracker. Other-tab withdrawal and expiry follow the same path.
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
  if(!scope.document||scope.document.body.dataset.preview!=='false'||!['hammadmedia.com','www.hammadmedia.com'].includes(scope.location.hostname)||scope.hmAnalyticsConsent)return;
  const document=scope.document, measurement='G-NEX74824JL', disableKey='ga-disable-'+measurement;
  const storageKey='hm-analytics-consent-v1', lifetime=180*86400000;
  const banner=document.getElementById('analytics-consent');
  const accept=document.getElementById('analytics-accept'), decline=document.getElementById('analytics-decline');
  let choice=null, active=false, initialized=false, unloading=false, tracker=null, expiryTimer=null;
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
    let attribution=null;try{attribution=scope.hmAttribution?.current();}catch{}
    const query=attribution?new URLSearchParams(Object.entries(attribution).filter(([key])=>['utm_source','utm_medium','utm_campaign','utm_content'].includes(key))).toString():scope.location.search;
    const paths=new Set(['/','/zh/','/privacy/','/zh/privacy/','/thanks/','/zh/thanks/','/thanks.html','/zh/thanks.html','/404.html']);
    const path=paths.has(scope.location.pathname)?scope.location.pathname:'/404.html';
    const page={page_location:scope.location.origin+path,page_referrer:origin(attribution?.referrer||document.referrer),site_version:'partnership_redesign'};
    scope.gtag('config',measurement,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,...page,...campaignFields(query)});
    scope.gtag('event','page_view',{...page,page_title:document.title});
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
  document.querySelectorAll('[data-analytics-settings]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();show();}));
  scope.hmAnalyticsConsent=Object.freeze({current:()=>choice?.choice||null,openSettings:show});
  scope.addEventListener('storage',event=>{
    if(event.key!==storageKey&&event.key!==null)return;
    const saved=read();
    if(saved?.choice==='accepted')return; // Acceptance in another tab waits for navigation here.
    choice=saved;if(choice)hide();else show();stop();
  });
  choice=read();
  if(choice?.choice==='accepted'){
    // A read-only/blocked store cannot reliably preserve a withdrawal later.
    if(save(choice)){hide();start();}else{choice=null;show();}
  }else if(choice){hide();}else{show();}
})(typeof window==='undefined'?globalThis:window);
