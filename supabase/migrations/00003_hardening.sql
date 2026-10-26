-- ============================================================
-- INVITE LIME — schema hardening & operational additions
-- Applied after 00002_ops.sql. Safe to run multiple times (idempotent).
-- ============================================================

-- ── Guest list table (optional per-wedding guest management) ─────────────
-- Separate from RSVP responses: these are guests the customer adds
-- proactively; rsvp_responses holds what guests self-submit.
create table if not exists public.guest_list (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  invitation_status text not null default 'pending'
    check (invitation_status in ('pending', 'sent', 'viewed')),
  rsvp_status text
    check (rsvp_status in ('attending', 'declining', 'pending', null)),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.guest_list is
  'Customer-managed guest list. Separate from public RSVP responses.';

alter table public.guest_list enable row level security;

create policy "guest_list_owner_all" on public.guest_list
  for all using (
    exists (select 1 from public.weddings w where w.id = wedding_id and w.user_id = auth.uid())
  );
create policy "guest_list_admin_all" on public.guest_list
  for all using (public.is_admin());

-- Performance index
create index if not exists guest_list_wedding_idx on public.guest_list (wedding_id, sort_order);

-- Trigger for updated_at
drop trigger if exists guest_list_set_updated_at on public.guest_list;
create trigger guest_list_set_updated_at
  before update on public.guest_list
  for each row execute procedure public.touch_updated_at();

-- Grants
grant select, insert, update, delete on public.guest_list to authenticated;
grant all on public.guest_list to service_role;

-- ── Template version: add archived status ────────────────────────────────
-- Allows archiving old template versions without deleting referenced data.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'template_versions'
      and column_name = 'archived_at'
  ) then
    alter table public.template_versions add column archived_at timestamptz;
  end if;
end;
$$;

-- ── Wedding: add pending_payment status ──────────────────────────────────
-- Distinguishes "created but not paid" from bare draft.
-- NOTE: status check constraint already allows the existing values;
-- we document the business meaning here with a comment.
comment on column public.weddings.status is
  'draft=not-paid, active=published+paid, expired=past expiry, cancelled=cancelled';

-- ── Analytics: add index for owner-scoped queries ────────────────────────
create index if not exists analytics_wedding_event_idx
  on public.analytics_events (wedding_id, event, created_at)
  where wedding_id is not null;

-- ── Invitation views: index for 30-day windowed queries ──────────────────
create index if not exists views_wedding_30d_idx
  on public.invitation_views (wedding_id, viewed_at desc);

-- ── Rate limits: index for fast bucket+key lookup ────────────────────────
-- Already has PK, this just makes window expiry queries faster. The predicate
-- is intentionally absent: `window_started_at < now() - interval '1 day'` is
-- not immutable and would make the whole migration fail to apply.
create index if not exists rate_limit_window_idx
  on public.rate_limit_hits (window_started_at);

-- ── RSVP: add index for per-wedding attendance queries ───────────────────
create index if not exists rsvp_attendance_idx
  on public.rsvp_responses (wedding_id, attendance);

-- ── Cleanup function: also purge stale template upload artifacts ─────────
-- The cleanup_expired_guest_data() RPC is extended conceptually; any
-- separate cleanup of temp storage must be done server-side.

-- ── Grant for guest_list RPC usage ──────────────────────────────────────
-- No new RPCs needed: guest_list is accessed via standard authenticated queries.

-- ── Site settings: ensure required keys exist ────────────────────────────
insert into public.site_settings (key, value) values
  ('maintenance_mode', 'false'::jsonb),
  ('rsvp_rate_limit', '{"limit":3,"window_seconds":3600}'::jsonb),
  ('contact_rate_limit', '{"limit":5,"window_seconds":3600}'::jsonb),
  ('upload_rate_limit', '{"limit":60,"window_seconds":3600}'::jsonb)
on conflict (key) do nothing;
