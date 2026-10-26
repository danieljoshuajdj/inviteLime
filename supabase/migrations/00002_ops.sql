-- ============================================================
-- INVITE LIME — operational helpers
--   * fixed-window rate limiting counters (server only)
--   * retention/cleanup for guest drafts + sessions
-- Applied after 00001_init.sql. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- RATE LIMITING
-- Counters are only ever touched through the security-definer RPC
-- below, so anon/authenticated clients cannot read or write them.
-- ------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  bucket text not null,
  key text not null,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0,
  primary key (bucket, key)
);

comment on table public.rate_limit_hits is 'Fixed-window rate limit counters. Server (service_role) only.';

alter table public.rate_limit_hits enable row level security;
-- intentionally no policies: RLS denies everything but service_role.

create or replace function public.consume_rate_limit(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_hits integer;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket, key, window_started_at, hits)
  values (p_bucket, left(p_key, 400), v_now, 1)
  on conflict (bucket, key) do update
    set hits = case
          when public.rate_limit_hits.window_started_at
               < v_now - make_interval(secs => greatest(p_window_seconds, 1))
            then 1
          else public.rate_limit_hits.hits + 1
        end,
        window_started_at = case
          when public.rate_limit_hits.window_started_at
               < v_now - make_interval(secs => greatest(p_window_seconds, 1))
            then v_now
          else public.rate_limit_hits.window_started_at
        end
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

comment on function public.consume_rate_limit(text, text, integer, integer) is
  'Returns true while the caller is under the limit for a fixed window. Server-side callers only.';

-- ------------------------------------------------------------
-- RETENTION
-- Guest drafts/sessions expire; paid orders and weddings are kept.
-- ------------------------------------------------------------
create or replace function public.cleanup_expired_guest_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drafts integer := 0;
  v_sessions integer := 0;
  v_counters integer := 0;
begin
  delete from public.guest_drafts where expires_at < now();
  get diagnostics v_drafts = row_count;

  delete from public.guest_sessions s
  where s.expires_at < now()
    and not exists (select 1 from public.guest_drafts d where d.session_id = s.id)
    and not exists (
      select 1 from public.orders o
      where o.guest_session_id = s.id and o.status in ('paid', 'refunded')
    );
  get diagnostics v_sessions = row_count;

  delete from public.rate_limit_hits where window_started_at < now() - interval '1 day';
  get diagnostics v_counters = row_count;

  return jsonb_build_object(
    'guest_drafts', v_drafts,
    'guest_sessions', v_sessions,
    'rate_limit_counters', v_counters
  );
end;
$$;

-- ------------------------------------------------------------
-- GRANTS (service_role only)
-- ------------------------------------------------------------
revoke all on table public.rate_limit_hits from anon, authenticated;
grant all on table public.rate_limit_hits to service_role;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

revoke all on function public.cleanup_expired_guest_data() from anon, authenticated;
grant execute on function public.cleanup_expired_guest_data() to service_role;
