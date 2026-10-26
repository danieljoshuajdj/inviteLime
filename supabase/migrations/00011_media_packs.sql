-- ============================================================
-- INVITE LIME — shared media packs
-- Applied after 00010_product_prices.sql.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── Media packs ───────────────────────────────────────────────────────────
--
-- Admin-curated sets of sample photos (bride, groom, couple, gallery) that a
-- template renders while people preview its demo. The same pack can be shared
-- by any number of templates, so a picture is uploaded once instead of being
-- bundled into every template ZIP.
--
-- Objects live in the private `weddings` bucket under the `library/media/`
-- prefix. /api/media authorizes that prefix by row lookup, the same way the
-- music library works, so a deleted pack item stops being servable without any
-- bucket policy change.

create table if not exists public.media_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.media_packs is
  'Admin-managed photo packs used as demo media when templates are previewed.';

create table if not exists public.media_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.media_packs (id) on delete cascade,
  -- bride/groom/couple hold at most one photo each; gallery accumulates.
  role text not null check (role in ('bride', 'groom', 'couple', 'gallery')),
  storage_key text not null,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.media_pack_items is
  'One photo in a media pack. bride/groom/couple are replaceable single photos; gallery is accumulative.';

alter table public.media_packs enable row level security;
alter table public.media_pack_items enable row level security;

-- Admins manage the packs. The public never reads these tables directly:
-- demo rendering goes through the server with the service role, and images are
-- authorized per-object by /api/media.
drop policy if exists "media_packs_admin_all" on public.media_packs;
create policy "media_packs_admin_all" on public.media_packs
  for all using (public.is_admin());

drop policy if exists "media_pack_items_admin_all" on public.media_pack_items;
create policy "media_pack_items_admin_all" on public.media_pack_items
  for all using (public.is_admin());

-- Trigger for updated_at
drop trigger if exists media_packs_set_updated_at on public.media_packs;
create trigger media_packs_set_updated_at
  before update on public.media_packs
  for each row execute procedure public.touch_updated_at();

-- Grants: reads for signed-in admins (RLS filters), writes for the server only.
grant select on public.media_packs to authenticated;
grant select on public.media_pack_items to authenticated;
grant all on public.media_packs to service_role;
grant all on public.media_pack_items to service_role;

-- A storage key identifies an object, so two rows must never share one:
-- deleting a photo and re-uploading the same file would otherwise collide.
create unique index if not exists media_pack_items_storage_key_idx
  on public.media_pack_items (storage_key);

-- Pack detail screens group items by role in upload order.
create index if not exists media_pack_items_pack_role_idx
  on public.media_pack_items (pack_id, role, sort_order);

-- ── Templates: assigned media pack ────────────────────────────────────────
--
-- ON DELETE SET NULL: deleting a pack detaches every template that used it,
-- which then falls back to the images bundled in its own package.
alter table public.templates
  add column if not exists media_pack_id uuid references public.media_packs (id) on delete set null;

comment on column public.templates.media_pack_id is
  'Demo media pack used when this template is previewed. NULL → the package''s own images are used.';

create index if not exists templates_media_pack_id_idx
  on public.templates (media_pack_id)
  where media_pack_id is not null;
