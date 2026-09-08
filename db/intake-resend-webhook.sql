-- Additive delivery evidence only; no inquiry, Notion, worker or watchdog writes.
-- Reviewed source proposal. Do not expose hm_intake_private in the Data API.
begin;

create table if not exists hm_intake_private.resend_webhook_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  last_recorded_at timestamptz
);
insert into hm_intake_private.resend_webhook_control(singleton) values(true) on conflict do nothing;
alter table hm_intake_private.resend_webhook_control enable row level security;
revoke all on hm_intake_private.resend_webhook_control from public, anon, authenticated, service_role;
grant select, update(last_recorded_at) on hm_intake_private.resend_webhook_control to service_role;

create table if not exists hm_intake_private.resend_events (
  event_id text primary key check (event_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  email_id uuid not null,
  event_type text not null check (event_type in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.failed','email.suppressed','email.complained')),
  occurred_at timestamptz not null check (occurred_at >= '2000-01-01T00:00:00Z'),
  received_at timestamptz not null default clock_timestamp(),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  conflicted boolean not null default false
);
create index if not exists resend_events_email_id on hm_intake_private.resend_events(email_id);
alter table hm_intake_private.resend_events enable row level security;
revoke all on hm_intake_private.resend_events from public, anon, authenticated, service_role;
grant select, insert, update(conflicted) on hm_intake_private.resend_events to service_role;

create or replace function public.hm_intake_resend_record(p_event_id text,p_email_id uuid,p_type text,p_occurred_at timestamptz,p_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing hm_intake_private.resend_events; changed integer; active boolean;
begin
  -- A DB gate prevents a stale deployment from resuming writes after rollback.
  -- Serialize the short record transaction before inserting: shared locks here
  -- would deadlock when concurrent duplicate inserts later advance the timestamp.
  select enabled into active from hm_intake_private.resend_webhook_control where singleton for update;
  if active is distinct from true then return jsonb_build_object('status','disabled'); end if;
  if p_event_id is null or p_event_id !~ '^[A-Za-z0-9_-]{1,200}$' or p_email_id is null or
     p_type is null or p_type not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.failed','email.suppressed','email.complained') or
     p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at < '2000-01-01T00:00:00Z' or p_occurred_at > now()+interval '5 minutes' or
     p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid delivery event'; end if;
  insert into hm_intake_private.resend_events(event_id,email_id,event_type,occurred_at,payload_hash)
    values(p_event_id,p_email_id,p_type,p_occurred_at,p_hash) on conflict(event_id) do nothing;
  get diagnostics changed = row_count;
  if changed = 0 then
    select * into existing from hm_intake_private.resend_events where event_id=p_event_id;
    if existing.email_id is distinct from p_email_id or existing.event_type is distinct from p_type or
       existing.occurred_at is distinct from p_occurred_at or existing.payload_hash is distinct from p_hash then
      update hm_intake_private.resend_events set conflicted=true where event_id=p_event_id;
      return jsonb_build_object('status','conflict');
    end if;
    return jsonb_build_object('status','duplicate');
  end if;
  update hm_intake_private.resend_webhook_control set last_recorded_at=clock_timestamp() where singleton;
  return jsonb_build_object('status','recorded');
end; $$;

-- Derive the projection from immutable event facts. Arrival order never wins.
-- No foreign key: a signed event may precede the worker's email_id checkpoint.
-- Only exact, already recorded provider IDs join; never match by email/subject.
create or replace view hm_intake_private.resend_delivery_status with (security_invoker=true) as
with known as (
  select lower(email_id) as email_id, count(*) as linked_submissions, bool_or(email_state='accepted') as provider_accepted
  from hm_intake_private.submissions where email_id is not null group by lower(email_id)
), facts as (
  select email_id::text,
    min(occurred_at) filter(where event_type='email.sent') as sent_at,
    min(occurred_at) filter(where event_type='email.delivered') as delivered_at,
    min(occurred_at) filter(where event_type='email.delivery_delayed') as delayed_at,
    min(occurred_at) filter(where event_type='email.bounced') as bounced_at,
    min(occurred_at) filter(where event_type='email.failed') as failed_at,
    min(occurred_at) filter(where event_type='email.suppressed') as suppressed_at,
    min(occurred_at) filter(where event_type='email.complained') as complained_at,
    bool_or(conflicted) as event_conflict
  from hm_intake_private.resend_events group by email_id
), combined as (
  select k.*, f.sent_at,f.delivered_at,f.delayed_at,f.bounced_at,f.failed_at,f.suppressed_at,f.complained_at,
    coalesce(f.event_conflict,false) as event_conflict,
    k.linked_submissions>1 or coalesce(f.event_conflict,false) or
      (f.delivered_at is not null and (f.bounced_at is not null or f.failed_at is not null or f.suppressed_at is not null)) as conflicting
  from known k left join facts f using(email_id)
)
select *, case
  when conflicting then 'conflicting'
  when bounced_at is not null then 'bounced'
  when failed_at is not null then 'failed'
  when suppressed_at is not null then 'suppressed'
  when delivered_at is not null then 'delivered'
  when delayed_at is not null then 'delayed'
  when sent_at is not null then 'sent'
  else 'unknown' end as state,
  conflicting or bounced_at is not null or failed_at is not null or suppressed_at is not null or complained_at is not null as attention
from combined;
revoke all on hm_intake_private.resend_delivery_status from public, anon, authenticated, service_role;
grant select on hm_intake_private.resend_delivery_status to service_role;

-- Private server/owner-only consumers may fetch this aggregate. It deliberately
-- returns no message IDs, inquiry IDs, contacts, payloads or provider diagnostics.
-- An absent event is unknown, not an inbox success or failed webhook heartbeat.
create or replace function public.hm_intake_resend_health()
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'database_enabled', coalesce((select enabled from hm_intake_private.resend_webhook_control where singleton),false),
    'last_recorded_at', (select last_recorded_at from hm_intake_private.resend_webhook_control where singleton),
    'known_messages', count(*),
    'provider_accepted_messages', count(*) filter(where provider_accepted),
    'delivery_reported_messages', count(*) filter(where delivered_at is not null),
    'bounced_messages', count(*) filter(where bounced_at is not null),
    'failed_messages', count(*) filter(where failed_at is not null),
    'suppressed_messages', count(*) filter(where suppressed_at is not null),
    'complained_messages', count(*) filter(where complained_at is not null),
    'delayed_messages', count(*) filter(where state='delayed'),
    'delivery_unconfirmed_messages', count(*) filter(where delivered_at is null and bounced_at is null and failed_at is null and suppressed_at is null),
    'attention_messages', count(*) filter(where attention),
    'conflicting_messages', count(*) filter(where conflicting),
    'duplicate_message_links', count(*) filter(where linked_submissions>1),
    'event_conflicts', (select count(*) from hm_intake_private.resend_events where conflicted),
    'unmatched_provider_messages', (select count(distinct e.email_id) from hm_intake_private.resend_events e
      where not exists(select 1 from hm_intake_private.submissions s where lower(s.email_id)=e.email_id::text))
  ) from hm_intake_private.resend_delivery_status;
$$;
revoke all on function public.hm_intake_resend_record(text,uuid,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.hm_intake_resend_health() from public, anon, authenticated;
grant execute on function public.hm_intake_resend_record(text,uuid,text,timestamptz,text), public.hm_intake_resend_health() to service_role;

commit;
