/* Meaningful content engagement. Only fixed content keys enter Analytics. */
(()=>{
  'use strict';
  if(document.body.dataset.preview!=='false')return;
  const track=(event,params)=>{if(typeof window.gtag==='function')window.gtag('event',event,{...params,site_language:document.documentElement.lang==='zh-CN'?'zh':'en',page_location:location.origin+location.pathname});};
  const seen=new Set();
  const sections=['results','creator','packages','process','faq','contact'];
  if(typeof IntersectionObserver==='function'){
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const section=entry.target.closest('section')?.id;if(sections.includes(section)&&!seen.has(section)){seen.add(section);track('section_view',{section_id:section});observer.unobserve(entry.target);}}},{threshold:.6});
    for(const section of sections){const heading=document.querySelector('#'+section+' h2');if(heading)observer.observe(heading);}
  }
  const faqKeys=new Set(['paid_partnership','profile_allocation','creative_control','sales_expectations','advertising_rights','timing','commission','international_teams','exclusivity']);
  document.querySelectorAll('[data-faq-key]').forEach(detail=>detail.addEventListener('toggle',()=>{if(detail.open&&faqKeys.has(detail.dataset.faqKey))track('faq_open',{faq_key:detail.dataset.faqKey});}));
})();
