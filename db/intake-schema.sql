-- Operational delivery outbox only. The existing Notion Lead Ledger remains the CRM.
-- Apply once to a dedicated, reviewed Supabase project. Never add this schema to Data API exposed schemas.
begin;

create schema if not exists hm_intake_private;
revoke all on schema hm_intake_private from public, anon, authenticated;
grant usage on schema hm_intake_private to service_role;

create table if not exists hm_intake_private.submissions (
  id uuid primary key,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb,
  ip_hash text,
  email_hash text,
  created_at timestamptz not null default now(),
  notion_state text not null default 'pending' check (notion_state in ('pending','creating','uncertain','synced','manual')),
  notion_page_id uuid,
  notion_reconcile_count integer not null default 0,
  notion_error text,
  email_state text not null default 'pending' check (email_state in ('pending','sending','retry','accepted','manual')),
  email_started_at timestamptz,
  email_payload jsonb,
  email_id text,
  email_error text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  check (notion_state <> 'synced' or notion_page_id is not null),
  check (email_state <> 'accepted' or email_id is not null),
  check (email_started_at is null or email_payload is not null or completed_at is not null)
);
alter table hm_intake_private.submissions enable row level security;
-- No anon/authenticated policies. service_role bypasses RLS and is only used by Vercel server functions.
revoke all on hm_intake_private.submissions from public, anon, authenticated;
grant select, insert, update on hm_intake_private.submissions to service_role;
create index if not exists hm_intake_due on hm_intake_private.submissions (next_attempt_at) where completed_at is null;
create index if not exists hm_intake_ip_rate on hm_intake_private.submissions (ip_hash, created_at);
create index if not exists hm_intake_email_rate on hm_intake_private.submissions (email_hash, created_at);
create index if not exists hm_intake_created on hm_intake_private.submissions (created_at);

create or replace function hm_intake_private.guard_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.content_hash is distinct from old.content_hash or new.created_at is distinct from old.created_at then
    raise exception 'receipt identity is immutable';
  end if;
  -- An unresolved row has completed_at = NULL. Explicitly require completion so
  -- SQL's three-valued logic cannot turn this guard into IF NULL and allow erasure.
  if new.payload is distinct from old.payload and not (new.payload is null and old.completed_at is not null and old.completed_at < now() - interval '30 days') then
    raise exception 'submission content is immutable';
  end if;
  if old.email_payload is not null and new.email_payload is distinct from old.email_payload and not (new.email_payload is null and old.completed_at is not null and old.completed_at < now() - interval '30 days') then
    raise exception 'email envelope is immutable';
  end if;
  if old.email_started_at is not null and new.email_started_at is distinct from old.email_started_at then
    raise exception 'email retry window is immutable';
  end if;
  return new;
end; $$;
revoke all on function hm_intake_private.guard_immutable() from public, anon, authenticated;
drop trigger if exists hm_intake_immutable on hm_intake_private.submissions;
create trigger hm_intake_immutable before update on hm_intake_private.submissions
  for each row execute function hm_intake_private.guard_immutable();

create or replace function public.hm_intake_receipt(p_id uuid, p_hash text)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce((select jsonb_build_object('status', case when content_hash = p_hash then 'received' else 'conflict' end)
    from hm_intake_private.submissions where id = p_id), '{"status":"missing"}'::jsonb);
$$;

create or replace function public.hm_intake_accept(p_id uuid, p_hash text, p_payload jsonb, p_ip_hash text, p_email_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare previous text;
begin
  -- Low-volume intake: serialize the short acceptance transaction so counts and idempotency are atomic.
  perform pg_advisory_xact_lock(728541662);
  select content_hash into previous from hm_intake_private.submissions where id = p_id;
  if found then return jsonb_build_object('status', case when previous = p_hash then 'received' else 'conflict' end); end if;
  if p_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' or (p_payload->>'submission_id') is distinct from p_id::text
    or p_hash is null or p_ip_hash is null or p_email_hash is null
    or p_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid intake envelope';
  end if;
  if (select count(*) from hm_intake_private.submissions where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5
    or (select count(*) from hm_intake_private.submissions where email_hash = p_email_hash and created_at > now() - interval '1 day') >= 5
    or (select count(*) from hm_intake_private.submissions where created_at > now() - interval '1 day') >= 200 then
    return '{"status":"limited"}'::jsonb;
  end if;
  insert into hm_intake_private.submissions(id, content_hash, payload, ip_hash, email_hash)
    values (p_id, p_hash, p_payload, p_ip_hash, p_email_hash);
  return '{"status":"received"}'::jsonb;
end; $$;

create or replace function public.hm_intake_claim(p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item hm_intake_private.submissions;
begin
  if p_lease is null then raise exception 'lease required'; end if;
  select * into item from hm_intake_private.submissions
    where payload is not null and (notion_state not in ('synced','manual') or email_state not in ('accepted','manual'))
      and next_attempt_at <= now() and (lease_until is null or lease_until <= now())
    order by next_attempt_at, created_at for update skip locked limit 1;
  if not found then return null; end if;
  update hm_intake_private.submissions set lease_id = p_lease, lease_until = now() + interval '120 seconds', attempts = attempts + 1
    where id = item.id returning * into item;
  return to_jsonb(item);
end; $$;

create or replace function public.hm_intake_save(p_id uuid, p_lease uuid, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item hm_intake_private.submissions;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_changes) as k where k not in ('notion_state','notion_page_id','notion_reconcile_count','notion_error','email_state','email_started_at','email_payload','email_id','email_error')
  ) then raise exception 'invalid state patch'; end if;
  select * into item from hm_intake_private.submissions where id = p_id and lease_id = p_lease and lease_until > now() for update;
  if not found then return '{"lost_lease":true}'::jsonb; end if;
  if item.email_payload is not null and p_changes ? 'email_payload' and item.email_payload is distinct from p_changes->'email_payload' then raise exception 'email envelope is immutable'; end if;
  if item.email_started_at is not null and p_changes ? 'email_started_at' and item.email_started_at is distinct from (p_changes->>'email_started_at')::timestamptz then raise exception 'email retry window is immutable'; end if;
  update hm_intake_private.submissions set
    notion_state = coalesce(p_changes->>'notion_state', notion_state),
    notion_page_id = coalesce((p_changes->>'notion_page_id')::uuid, notion_page_id),
    notion_reconcile_count = coalesce((p_changes->>'notion_reconcile_count')::integer, notion_reconcile_count),
    notion_error = case when p_changes ? 'notion_error' then p_changes->>'notion_error' else notion_error end,
    email_state = coalesce(p_changes->>'email_state', email_state),
    email_started_at = coalesce((p_changes->>'email_started_at')::timestamptz, email_started_at),
    email_payload = coalesce(p_changes->'email_payload', email_payload),
    email_id = coalesce(p_changes->>'email_id', email_id),
    email_error = case when p_changes ? 'email_error' then p_changes->>'email_error' else email_error end
    where id = p_id returning * into item;
  return to_jsonb(item);
end; $$;

create or replace function public.hm_intake_release(p_id uuid, p_lease uuid, p_delay_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update hm_intake_private.submissions set lease_id = null, lease_until = null,
    next_attempt_at = now() + make_interval(secs => greatest(60, least(3600, p_delay_seconds))),
    completed_at = case when notion_state = 'synced' and email_state = 'accepted' then coalesce(completed_at, now()) else null end
    where id = p_id and lease_id = p_lease;
  return found;
end; $$;

create or replace function public.hm_intake_health()
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'pending', count(*) filter (where notion_state not in ('synced','manual') or email_state not in ('accepted','manual')),
    'manual', count(*) filter (where notion_state = 'manual' or email_state = 'manual'),
    'overdue', count(*) filter (where created_at < now() - interval '15 minutes' and (notion_state not in ('synced','manual') or email_state not in ('accepted','manual')))
  ) from hm_intake_private.submissions;
$$;

create or replace function public.hm_intake_prune()
returns integer language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  -- Keep UUID/hash tombstones so an old browser retry never creates a second opportunity.
  -- Unresolved submissions are preserved for human review; no silent lead deletion.
  update hm_intake_private.submissions set payload = null, email_payload = null, ip_hash = null, email_hash = null
    where completed_at < now() - interval '30 days' and payload is not null;
  get diagnostics changed = row_count;
  return changed;
end; $$;

-- Functions are callable through public RPC, but default PUBLIC EXECUTE is explicitly removed.
revoke all on function public.hm_intake_receipt(uuid,text) from public, anon, authenticated;
revoke all on function public.hm_intake_accept(uuid,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.hm_intake_claim(uuid) from public, anon, authenticated;
revoke all on function public.hm_intake_save(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.hm_intake_release(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.hm_intake_health() from public, anon, authenticated;
revoke all on function public.hm_intake_prune() from public, anon, authenticated;
grant execute on function public.hm_intake_receipt(uuid,text), public.hm_intake_accept(uuid,text,jsonb,text,text),
  public.hm_intake_claim(uuid), public.hm_intake_save(uuid,uuid,jsonb), public.hm_intake_release(uuid,uuid,integer),
  public.hm_intake_health(), public.hm_intake_prune() to service_role;

commit;
