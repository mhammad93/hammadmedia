/*
 * Tab-scoped website attribution, independent of Analytics and visitor form fields.
 * The first recognized landing path and external HTTPS referring origin stay fixed.
 * A later URL with registered public labels replaces the campaign as a whole; fields
 * from separate campaigns are never merged. Internal hops without campaign tags
 * retain the saved campaign, including English/Chinese and privacy navigation.
 * Only the backend-supported page_path, referrer, utm_source, utm_medium,
 * utm_campaign and utm_content fields are returned. Free-text terms, campaign/ad
 * IDs, unknown URL parameters, fragments and visitor data are never collected.
 * Uses sessionStorage for this tab; if unavailable, only the current page's
 * sanitized attribution survives. current() always returns a fresh flat object.
 */
(function (scope) {
  'use strict';
  if (!scope.document || !scope.location) return;
  const storageKey = 'hm-attribution-v1';
  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  // Same reviewed registry as analytics.js; syntax alone cannot exclude PII.
  // See docs/controlled-campaign-links.md before extending these public labels.
  const allowed = {utm_source:['tiktok','brand_kit','agency_outreach'],utm_medium:['organic_social','referral','email'],utm_campaign:['paid_partnerships'],utm_content:['drew_review_bio','drew_review1_bio','en_overview','zh_overview','agency_overview']};
  const landingPaths = new Set(['/', '/zh/', '/privacy/', '/zh/privacy/', '/thanks/', '/zh/thanks/', '/thanks.html', '/zh/thanks.html', '/404.html']);
  const label = (key,value) => typeof value === 'string' && allowed[key].includes(value) ? value : '';
  const path = value => landingPaths.has(value) ? value : (typeof value === 'string' && /^\/zh(?:\/|$)/.test(value) ? '/zh/' : '/');
  function externalOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.origin !== scope.location.origin ? url.origin : '';
    } catch { return ''; }
  }
  function campaignFrom(value) {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const key of campaignKeys) {
      const valid = label(key,value[key]);
      if (valid) result[key] = valid;
    }
    return result;
  }
  let landing = { page_path: path(scope.location.pathname) };
  const referringOrigin = externalOrigin(scope.document.referrer);
  if (referringOrigin) landing.referrer = referringOrigin;
  let campaign = {};
  try {
    const raw = scope.sessionStorage.getItem(storageKey);
    if (raw && raw.length <= 4096) {
      const saved = JSON.parse(raw);
      if (saved && saved.version === 1 && saved.landing && typeof saved.landing.page_path === 'string') {
        landing = { page_path: path(saved.landing.page_path) };
        const origin = externalOrigin(saved.landing.referrer);
        if (origin) landing.referrer = origin;
        campaign = campaignFrom(saved.campaign);
      }
    }
  } catch { /* An unavailable or corrupt store must not prevent an inquiry. */ }
  let previousUrl = '';
  function captureCampaign() {
    const urlKey = scope.location.pathname + scope.location.search;
    if (urlKey === previousUrl) return;
    previousUrl = urlKey;
    const query = new URLSearchParams(scope.location.search);
    const incoming = campaignFrom(Object.fromEntries(campaignKeys.map(key => [key, query.getAll(key).length === 1 ? query.get(key) : null])));
    if (Object.keys(incoming).length) campaign = incoming;
    try { scope.sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, landing, campaign })); } catch { /* Current-page attribution still works. */ }
  }
  captureCampaign();
  scope.hmAttribution = Object.freeze({
    current() {
      captureCampaign();
      return { ...landing, ...campaign };
    },
  });
})(typeof window === 'undefined' ? globalThis : window);
