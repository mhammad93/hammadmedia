/* A receipt is presentation state, never an authorization token or a GA conversion. */
(function(scope){
  'use strict';
  const key='hm-inquiry-receipt-v1';
  function validReceipt(receipt,now=Date.now()){
    return Boolean(receipt&&receipt.version===1&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.reference)&&Number.isFinite(receipt.receivedAt)&&receipt.receivedAt<=now&&now-receipt.receivedAt<86400000&&['en','zh'].includes(receipt.locale));
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={validReceipt};return;}
  const received=document.getElementById('confirmation-received');if(!received)return;
  let receipt;try{receipt=JSON.parse(sessionStorage.getItem(key));}catch{}
  if(!validReceipt(receipt))return;
  document.getElementById('confirmation-reference').textContent=receipt.reference;
  document.getElementById('confirmation-missing').hidden=true;received.hidden=false;
  // The separate generate_lead event is emitted only by the accepted form POST.
  // Refreshing or directly opening this page never emits another lead.
  if(!receipt.confirmationViewed){
    receipt.confirmationViewed=true;
    try{sessionStorage.setItem(key,JSON.stringify(receipt));}catch{return;}
    if(document.body.dataset.preview==='false'&&typeof scope.gtag==='function')scope.gtag('event','inquiry_confirmation_view',{site_language:document.documentElement.lang==='zh-CN'?'zh':'en',page_location:location.origin+location.pathname});
  }
})(typeof window==='undefined'?globalThis:window);
