-- ============================================================
-- INVITE LIME — demo details packs + per-template demo content
-- Applied after 00012_retention_purge.sql.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── Demo detail packs ────────────────────────────────────────────────────
--
-- Admin-curated sample wedding details (couple, venue, events, dress code,
-- RSVP contact) that a template renders while people preview its demo.
--
-- Demo-only: a customer's own builder data always replaces these values on a
-- live invitation. Packs are read through the service role at render time.

create table if not exists public.demo_detail_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  bride_name text not null,
  groom_name text not null,
  bride_designation text,
  groom_designation text,
  bride_bio text,
  groom_bio text,
  couple_bio text,
  story text,
  wedding_date text,
  wedding_time text,
  venue text,
  address text,
  maps_url text,
  latitude double precision,
  longitude double precision,
  dress_bride_color text,
  dress_bride_color_name text,
  dress_groom_color text,
  dress_groom_color_name text,
  rsvp_deadline text,
  rsvp_contact_name text,
  rsvp_contact_phone text,
  rsvp_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.demo_detail_packs is
  'Admin-managed sample wedding details used when templates are previewed.';

create table if not exists public.demo_detail_pack_events (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.demo_detail_packs (id) on delete cascade,
  name text not null,
  date text,
  time text,
  venue text,
  address text,
  maps_url text,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.demo_detail_pack_events is
  'Ordered ceremony/event cards belonging to a demo detail pack.';

alter table public.demo_detail_packs enable row level security;
alter table public.demo_detail_pack_events enable row level security;

-- Admins manage the packs. Demos resolve them server-side with the service
-- role, and live invitations never read them.
drop policy if exists "demo_detail_packs_admin_all" on public.demo_detail_packs;
create policy "demo_detail_packs_admin_all" on public.demo_detail_packs
  for all using (public.is_admin());

drop policy if exists "demo_detail_pack_events_admin_all" on public.demo_detail_pack_events;
create policy "demo_detail_pack_events_admin_all" on public.demo_detail_pack_events
  for all using (public.is_admin());

-- Trigger for updated_at
drop trigger if exists demo_detail_packs_set_updated_at on public.demo_detail_packs;
create trigger demo_detail_packs_set_updated_at
  before update on public.demo_detail_packs
  for each row execute procedure public.touch_updated_at();

-- Grants: reads for signed-in admins (RLS filters), writes for the server only.
grant select on public.demo_detail_packs to authenticated;
grant select on public.demo_detail_pack_events to authenticated;
grant all on public.demo_detail_packs to service_role;
grant all on public.demo_detail_pack_events to service_role;

-- Event cards are always listed in authored order for a pack.
create index if not exists demo_detail_pack_events_pack_sort_idx
  on public.demo_detail_pack_events (pack_id, sort_order);

-- ── Templates: assigned demo content ─────────────────────────────────────
--
-- ON DELETE SET NULL: deleting a pack detaches every template that used it,
-- which then falls back to the platform's stock demo data.
alter table public.templates
  add column if not exists demo_detail_pack_id uuid references public.demo_detail_packs (id) on delete set null,
  add column if not exists music_track_id uuid references public.music_tracks (id) on delete set null;

comment on column public.templates.demo_detail_pack_id is
  'Demo detail pack (names, venue, events, dress code) used when this template is previewed. NULL → stock demo data.';

comment on column public.templates.music_track_id is
  'Background song from the shared music library used in this template''s demo. NULL → silent demo.';

create index if not exists templates_demo_detail_pack_id_idx
  on public.templates (demo_detail_pack_id)
  where demo_detail_pack_id is not null;

create index if not exists templates_music_track_id_idx
  on public.templates (music_track_id)
  where music_track_id is not null;
