'use strict';

const DATA_SOURCE_ID = '44e3142d-8357-4e5c-8cbb-8c3303a3b062';
const RECIPIENT = 'contact@hammadmedia.com';
const ACTION = 'brand_inquiry';

function configuration(env = process.env) {
  const origins = (env.INTAKE_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const validOrigins = origins.length > 0 && origins.every(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; } catch { return false; }
  });
  const sender = env.RESEND_FROM_EMAIL || '';
  const supabaseUrl = env.INTAKE_SUPABASE_URL || '';
  const supabaseKey = env.INTAKE_SUPABASE_SECRET_KEY || env.INTAKE_SUPABASE_SERVICE_ROLE_KEY || '';
  let validServiceKey = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(supabaseKey);
  if (!validServiceKey && supabaseKey.startsWith('eyJ')) {
    try { validServiceKey = JSON.parse(Buffer.from(supabaseKey.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { /* invalid key stays disabled */ }
  }
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl);
  // Requiring explicit provisioning acknowledgement prevents a partially configured form from going live.
  const ready = env.INTAKE_PROVISIONED === 'true' && validOrigins && validUrl &&
    validServiceKey &&
    (env.INTAKE_NOTION_TOKEN || '').length >= 20 &&
    (env.RESEND_API_KEY || '').startsWith('re_') &&
    /^[a-z0-9._+-]+@(?:[a-z0-9-]+\.)?hammadmedia\.com$/i.test(sender) &&
    (env.TURNSTILE_SECRET_KEY || '').length >= 20 && (env.TURNSTILE_SITE_KEY || '').length >= 10 &&
    (env.INTAKE_HASH_SECRET || '').length >= 32 && (env.CRON_SECRET || '').length >= 32;
  return {
    ready: Boolean(ready), enabled: Boolean(ready && env.INTAKE_ENABLED === 'true'),
    origins, hostnames: origins.flatMap(origin => { try { return [new URL(origin).hostname]; } catch { return []; } }),
    supabaseUrl, supabaseKey,
    notionToken: env.INTAKE_NOTION_TOKEN, dataSourceId: DATA_SOURCE_ID, notionVersion: '2025-09-03',
    resendKey: env.RESEND_API_KEY, sender, recipient: RECIPIENT,
    turnstileSecret: env.TURNSTILE_SECRET_KEY, turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    hashSecret: env.INTAKE_HASH_SECRET, cronSecret: env.CRON_SECRET,
    action: ACTION, vercel: env.VERCEL === '1'
  };
}
module.exports = { configuration, DATA_SOURCE_ID, RECIPIENT, ACTION };
