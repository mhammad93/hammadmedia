-- SOURCE ONLY: apply after intake-schema.sql to the reviewed dedicated project.
-- No cron, secrets, emails or live monitoring are activated by this script.
begin;
create table if not exists hm_intake_private.operations (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  activated_at timestamptz,
  last_worker_completed_at timestamptz,
  last_watchdog_completed_at timestamptz,
  incident_id uuid,
  last_notice_conditions integer not null default 0 check (last_notice_conditions between 0 and 7),
  last_notice_queued_at timestamptz,
  check (not enabled or activated_at is not null)
);
insert into hm_intake_private.operations(singleton) values(true) on conflict do nothing;
create table if not exists hm_intake_private.operation_notifications (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  kind text not null check (kind in ('opened','updated','reminder','recovered','test')),
  created_at timestamptz not null default now(),
  snapshot jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','retry','accepted','manual')),
  email_payload jsonb,
  send_started_at timestamptz,
  provider_id text,
  accepted_at timestamptz,
  error_code text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  check (state <> 'accepted' or (provider_id is not null and accepted_at is not null)),
  check (send_started_at is null or email_payload is not null)
);
create index if not exists hm_ops_due on hm_intake_private.operation_notifications(next_attempt_at,created_at) where state in ('pending','sending','retry');
alter table hm_intake_private.operations enable row level security;
alter table hm_intake_private.operation_notifications enable row level security;
revoke all on hm_intake_private.operations, hm_intake_private.operation_notifications from public, anon, authenticated;
grant select, insert, update on hm_intake_private.operations, hm_intake_private.operation_notifications to service_role;

create or replace function public.hm_intake_ops_worker_completed()
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update hm_intake_private.operations set last_worker_completed_at=now() where singleton;
  return found;
end; $$;

create or replace function public.hm_intake_ops_claim(p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  control hm_intake_private.operations;
  item hm_intake_private.operation_notifications;
  health jsonb;
  conditions integer := 0;
  notice_kind text;
  incident uuid;
  outstanding boolean;
begin
  if p_lease is null then raise exception 'lease required'; end if;
  -- Serializes evaluation plus notification creation, not the inquiry worker.
  perform pg_advisory_xact_lock(728541663);
  select * into strict control from hm_intake_private.operations where singleton for update;
  if not control.enabled then return jsonb_build_object('enabled',false,'item',null); end if;
  health := public.hm_intake_health();
  if (health->>'manual')::bigint > 0 then conditions := conditions + 1; end if;
  if (health->>'overdue')::bigint > 0 then conditions := conditions + 2; end if;
  if greatest(control.activated_at,coalesce(control.last_worker_completed_at,control.activated_at)) < now()-interval '5 minutes' then conditions := conditions + 4; end if;
  incident := control.incident_id;
  select exists(select 1 from hm_intake_private.operation_notifications where incident_id=incident and state <> 'accepted') into outstanding;
  if conditions <> 0 then
    if incident is null then incident := gen_random_uuid(); notice_kind := 'opened';
    elsif not outstanding and conditions <> control.last_notice_conditions then notice_kind := 'updated';
    elsif not outstanding and control.last_notice_queued_at <= now()-interval '1 hour' then notice_kind := 'reminder';
    end if;
  -- Recovery cannot overtake an in-flight/backed-off notice. An ambiguous or
  -- manual outcome keeps the incident open; never replace its frozen request.
  elsif incident is not null and not outstanding then notice_kind := 'recovered';
  end if;
  if notice_kind is not null then
    insert into hm_intake_private.operation_notifications(incident_id,kind,snapshot) values(incident,notice_kind,
      jsonb_build_object('conditions',conditions,'pending',(health->>'pending')::bigint,'manual',(health->>'manual')::bigint,'overdue',(health->>'overdue')::bigint,
        'worker_age_seconds',case when control.last_worker_completed_at is null then null else greatest(0,floor(extract(epoch from now()-control.last_worker_completed_at))) end));
    update hm_intake_private.operations set
      incident_id=case when conditions=0 then null else incident end,
      last_notice_conditions=conditions,last_notice_queued_at=now() where singleton;
  end if;
  -- A new idempotency key must never replace an uncertain send after its safe window.
  update hm_intake_private.operation_notifications set state='manual',error_code='window_elapsed',lease_id=null,lease_until=null
    where state in ('pending','sending','retry') and send_started_at <= now()-interval '23 hours'
      and (lease_until is null or lease_until <= now());
  select n.* into item from hm_intake_private.operation_notifications n
    where n.state in ('pending','sending','retry') and n.next_attempt_at <= now() and (n.lease_until is null or n.lease_until <= now())
      -- Keep automatic notices ordered across recurring incidents as well.
      -- Explicitly labeled route tests are independent of incident history.
      and (n.kind='test' or not exists (
        select 1 from hm_intake_private.operation_notifications earlier
        where earlier.kind<>'test' and earlier.state<>'accepted'
          and (earlier.created_at,earlier.id)<(n.created_at,n.id)))
    order by n.created_at,n.id for update of n skip locked limit 1;
  if not found then return jsonb_build_object('enabled',true,'item',null); end if;
  update hm_intake_private.operation_notifications set lease_id=p_lease,lease_until=now()+interval '120 seconds',attempts=attempts+1
    where id=item.id returning * into item;
  return jsonb_build_object('enabled',true,'item',to_jsonb(item));
end; $$;

create or replace function public.hm_intake_ops_prepare(p_id uuid,p_lease uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item hm_intake_private.operation_notifications;
begin
  select * into item from hm_intake_private.operation_notifications where id=p_id and lease_id=p_lease and lease_until>now() for update;
  if not found then raise exception 'operation lease lost'; end if;
  if item.send_started_at <= now()-interval '23 hours' then raise exception 'operation retry window elapsed'; end if;
  if item.email_payload is null then
    if p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>12000
      or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('from','to','subject','text'))
      or p_payload->'to' is distinct from '["contact@hammadmedia.com"]'::jsonb
      or coalesce(p_payload->>'from','') !~* '^[a-z0-9._+-]+@([a-z0-9-]+\.)?hammadmedia\.com$'
      or coalesce(length(p_payload->>'subject'),0) not between 1 and 200
      or coalesce(length(p_payload->>'text'),0) not between 1 and 8000 then raise exception 'invalid operations envelope'; end if;
  end if;
  update hm_intake_private.operation_notifications set email_payload=coalesce(email_payload,p_payload),send_started_at=coalesce(send_started_at,now()),state='sending'
    where id=p_id returning * into item;
  return to_jsonb(item);
end; $$;

create or replace function public.hm_intake_ops_finish(p_id uuid,p_lease uuid,p_state text,p_provider_id text,p_error_code text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_state is null or p_state not in ('accepted','retry','manual')
    or (p_state='accepted' and (p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,128}$'))
    or (p_state<>'accepted' and (p_error_code is null or p_error_code not in ('send_unconfirmed','send_rejected','payload_conflict','window_elapsed')))
    then raise exception 'invalid operations outcome'; end if;
  update hm_intake_private.operation_notifications set state=p_state,
    provider_id=case when p_state='accepted' then p_provider_id else null end,
    accepted_at=case when p_state='accepted' then now() else null end,
    error_code=case when p_state='accepted' then null else p_error_code end,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*(2^least(attempts-1,6)))::integer),lease_id=null,lease_until=null
    where id=p_id and lease_id=p_lease and lease_until>now() and state='sending';
  return found;
end; $$;

create or replace function public.hm_intake_ops_watchdog_completed()
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update hm_intake_private.operations set last_watchdog_completed_at=now() where singleton and enabled;
  return found;
end; $$;

create or replace function public.hm_intake_ops_health()
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('enabled',o.enabled,'activated_at',o.activated_at,'last_worker_completed_at',o.last_worker_completed_at,
    'last_watchdog_completed_at',o.last_watchdog_completed_at,
    'notification_pending',(select count(*) from hm_intake_private.operation_notifications where state in ('pending','sending','retry')),
    'notification_manual',(select count(*) from hm_intake_private.operation_notifications where state='manual'))
  from hm_intake_private.operations o where singleton;
$$;

revoke all on function public.hm_intake_ops_worker_completed(),public.hm_intake_ops_claim(uuid),public.hm_intake_ops_prepare(uuid,uuid,jsonb),
  public.hm_intake_ops_finish(uuid,uuid,text,text,text),public.hm_intake_ops_watchdog_completed(),public.hm_intake_ops_health() from public,anon,authenticated;
grant execute on function public.hm_intake_ops_worker_completed(),public.hm_intake_ops_claim(uuid),public.hm_intake_ops_prepare(uuid,uuid,jsonb),
  public.hm_intake_ops_finish(uuid,uuid,text,text,text),public.hm_intake_ops_watchdog_completed(),public.hm_intake_ops_health() to service_role;
commit;
