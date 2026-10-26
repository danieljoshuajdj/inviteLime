-- ============================================================
-- INVITE LIME — shared music library
-- Applied after 00008_admin_invitations_indexes.sql.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── Music library table ───────────────────────────────────────────────────
--
-- Admin-uploaded audio that guests may choose for their invitation instead of
-- supplying their own file. Rows point at objects in the `weddings` bucket under
-- the `library/music/` prefix; /api/media authorizes that prefix so the guest
-- picker can preview a track before it is attached to a wedding.
--
-- Couples who pick a library track still get their own copy: publishing copies
-- the object into `{weddingId}/music/` rather than moving it, so deleting a
-- track from the library can never break an already-published invitation.

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  storage_key text not null,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint,
  duration_ms int,
  -- Hidden tracks stay in storage and keep working for invitations already
  -- using them, but disappear from the guest picker.
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.music_tracks is
  'Admin-managed audio library offered to guests alongside their own uploads.';

alter table public.music_tracks enable row level security;

-- Admins manage the catalogue. create policy has no "if not exists" form, so
-- drop first: re-running this file must not abort on the existing policy.
drop policy if exists "music_tracks_admin_all" on public.music_tracks;
create policy "music_tracks_admin_all" on public.music_tracks
  for all using (public.is_admin());

-- Only active tracks are offered to guests.
drop policy if exists "music_tracks_public_read" on public.music_tracks;
create policy "music_tracks_public_read" on public.music_tracks
  for select using (is_active);

-- Trigger for updated_at
drop trigger if exists music_tracks_set_updated_at on public.music_tracks;
create trigger music_tracks_set_updated_at
  before update on public.music_tracks
  for each row execute procedure public.touch_updated_at();

-- Grants
grant select on public.music_tracks to authenticated;
grant select on public.music_tracks to anon;
grant all on public.music_tracks to service_role;

-- The admin list is ordered by title; the picker orders by newest first.
create index if not exists music_tracks_title_idx on public.music_tracks (title);
create index if not exists music_tracks_active_created_idx
  on public.music_tracks (created_at desc)
  where is_active;

-- A storage key is the identity of an object in the bucket, so it must not be
-- reusable across two rows: deleting a track and re-uploading the same file
-- would otherwise collide.
create unique index if not exists music_tracks_storage_key_idx
  on public.music_tracks (storage_key);