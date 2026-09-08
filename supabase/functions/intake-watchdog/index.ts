import { createWatchdog } from './core.mjs';

const names = ['HM_INTAKE_WATCHDOG_ENABLED', 'HM_INTAKE_WATCHDOG_SECRET', 'INTAKE_SUPABASE_URL',
  'INTAKE_SUPABASE_SECRET_KEY', 'RESEND_OPS_API_KEY', 'RESEND_FROM_EMAIL'];
const env = Object.fromEntries(names.map(name => [name, Deno.env.get(name) || '']));
Deno.serve(createWatchdog({ env }));
