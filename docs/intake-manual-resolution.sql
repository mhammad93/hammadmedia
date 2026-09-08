-- Operator-only reconciliation. Read intake-operations.md first.
-- Default inputs deliberately abort. Run in the authenticated Supabase SQL editor.
-- This script sends no email, creates no Notion page, and never requeues a channel.
begin;
set local role service_role;
do $resolution$
declare
  submission_uuid uuid := null;              -- Exact UUID from the private queue.
  incident_reference text := null;           -- Example: HM-INC-20260908-001; no PII.
  verified_notion_page_uuid uuid := null;     -- Only after exact Deal ID verification.
  verified_resend_email_id text := null;      -- Only after provider acceptance verification.
  hold_notion boolean := false;              -- Hold an unresolved channel for review.
  hold_email boolean := false;
  item hm_intake_private.submissions;
  operator_lease uuid := gen_random_uuid();
  patch jsonb := '{}'::jsonb;
  saved jsonb;
begin
  if submission_uuid is null or incident_reference is null
     or incident_reference !~ '^[A-Za-z0-9_.:-]{6,80}$' then
    raise exception 'Exact submission UUID and non-PII incident reference required';
  end if;
  if verified_notion_page_uuid is null and verified_resend_email_id is null
     and not hold_notion and not hold_email then
    raise exception 'Choose a verified resolution or an unresolved-channel hold';
  end if;
  if (hold_notion and verified_notion_page_uuid is not null)
     or (hold_email and verified_resend_email_id is not null) then
    raise exception 'Do not resolve and hold the same channel';
  end if;
  if verified_resend_email_id is not null
     and (length(verified_resend_email_id) < 6 or length(verified_resend_email_id) > 300
       or verified_resend_email_id !~ '^[A-Za-z0-9_-]+$') then
    raise exception 'Invalid provider ID';
  end if;

  -- NOWAIT fails safely if a worker currently holds the row lock. The recorded
  -- lease check also prevents changing a row while the worker is calling a provider.
  select * into item from hm_intake_private.submissions
    where id = submission_uuid for update nowait;
  if not found then raise exception 'Submission not found'; end if;
  if item.lease_until is not null and item.lease_until > now() then
    raise exception 'Worker lease active; wait for it to expire and inspect again';
  end if;
  if item.notion_state = 'synced' and (hold_notion or
     (verified_notion_page_uuid is not null and verified_notion_page_uuid is distinct from item.notion_page_id)) then
    raise exception 'Cannot downgrade or replace a verified Notion result';
  end if;
  if item.email_state = 'accepted' and (hold_email or
     (verified_resend_email_id is not null and verified_resend_email_id is distinct from item.email_id)) then
    raise exception 'Cannot downgrade or replace a verified email acceptance';
  end if;

  if verified_notion_page_uuid is not null then
    patch := patch || jsonb_build_object('notion_state','synced',
      'notion_page_id',verified_notion_page_uuid,'notion_error',null);
  elsif hold_notion then
    patch := patch || jsonb_build_object('notion_state','manual',
      'notion_error','operator_hold:' || incident_reference);
  end if;
  if verified_resend_email_id is not null then
    patch := patch || jsonb_build_object('email_state','accepted',
      'email_id',verified_resend_email_id,'email_error',null);
  elsif hold_email then
    patch := patch || jsonb_build_object('email_state','manual',
      'email_error','operator_hold:' || incident_reference);
  end if;

  -- The public claim RPC chooses the next due row and does not target a UUID or
  -- fully manual row. Acquire only this operator-selected row's lease privately,
  -- then use the existing checked save/release functions. No public admin API.
  update hm_intake_private.submissions
    set lease_id = operator_lease, lease_until = now() + interval '120 seconds'
    where id = submission_uuid;
  saved := public.hm_intake_save(submission_uuid, operator_lease, patch);
  if coalesce((saved->>'lost_lease')::boolean,false) then
    raise exception 'Resolution lease lost';
  end if;
  if not public.hm_intake_release(submission_uuid, operator_lease, 60) then
    raise exception 'Resolution lease release failed';
  end if;
  -- Do not return the RPC's full row: it contains the inquiry payload.
  raise notice 'Resolved metadata for submission %, incident %', submission_uuid, incident_reference;
end;
$resolution$;
commit;
