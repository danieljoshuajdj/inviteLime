-- ============================================================
-- INVITE LIME — category-aware music library + detail packs
-- Applied after 00018_event_forms.sql.
-- Safe to run multiple times (idempotent).
-- ============================================================
--
-- Two related changes:
--
--   1. A music track can belong to any number of event categories. Admins pick
--      one or more while uploading, and the template wizard only offers tracks
--      that belong to the template's category.
--
--   2. A demo detail pack now belongs to exactly one event form, mirroring the
--      builder form its category uses. Wedding/engagement packs keep the couple,
--      venue, ceremony and dress fields; birthday packs use the celebrant,
--      date/venue or age/message fields instead.

-- ------------------------------------------------------------
-- 1. Music ↔ categories (many-to-many)
-- ------------------------------------------------------------
create table if not exists public.music_track_categories (
  music_track_id uuid not null references public.music_tracks (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (music_track_id, category_id)
);

comment on table public.music_track_categories is
  'Which event categories a shared music track is offered in. A track may belong to several.';

alter table public.music_track_categories enable row level security;

-- Admins manage assignments. The public picker reads through the service role,
-- but the read policy keeps direct authenticated reads consistent with the
-- active-only rule on music_tracks.
drop policy if exists "music_track_categories_admin_all" on public.music_track_categories;
create policy "music_track_categories_admin_all" on public.music_track_categories
  for all using (public.is_admin());

drop policy if exists "music_track_categories_public_read" on public.music_track_categories;
create policy "music_track_categories_public_read" on public.music_track_categories
  for select using (
    exists (
      select 1
      from public.music_tracks t
      where t.id = music_track_categories.music_track_id
        and t.is_active
    )
  );

grant select on public.music_track_categories to authenticated;
grant select on public.music_track_categories to anon;
grant all on public.music_track_categories to service_role;

create index if not exists music_track_categories_category_idx
  on public.music_track_categories (category_id);

-- Backfill existing tracks into every current category, matching the previous
-- "one library for everyone" behaviour. The NOT EXISTS guard means re-running
-- this file never re-expands categories an admin has deliberately narrowed.
insert into public.music_track_categories (music_track_id, category_id)
select m.id, c.id
from public.music_tracks m
cross join public.categories c
where not exists (
  select 1
  from public.music_track_categories mtc
  where mtc.music_track_id = m.id
)
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Demo detail packs belong to one event form
-- ------------------------------------------------------------
alter table public.demo_detail_packs
  add column if not exists form_type text,
  add column if not exists celebrant_name text,
  add column if not exists birthday_number int,
  add column if not exists special_message text;

-- Every pre-existing pack described a wedding, which is what the demo rendered.
update public.demo_detail_packs
set form_type = 'wedding'
where form_type is null;

alter table public.demo_detail_packs alter column form_type set default 'wedding';
alter table public.demo_detail_packs alter column form_type set not null;

alter table public.demo_detail_packs drop constraint if exists demo_detail_packs_form_type_check;
alter table public.demo_detail_packs add constraint demo_detail_packs_form_type_check
  check (form_type in ('wedding', 'engagement', 'birthday_celebration', 'birthday_wishes'));

alter table public.demo_detail_packs drop constraint if exists demo_detail_packs_birthday_number_check;
alter table public.demo_detail_packs add constraint demo_detail_packs_birthday_number_check
  check (birthday_number is null or birthday_number between 1 and 150);

-- Birthday packs have no couple. The service validates which fields each form
-- requires, so the columns stay nullable at the database level.
alter table public.demo_detail_packs alter column bride_name drop not null;
alter table public.demo_detail_packs alter column groom_name drop not null;

comment on column public.demo_detail_packs.form_type is
  'The builder form this demo pack mirrors: wedding, engagement, birthday_celebration or birthday_wishes.';
comment on column public.demo_detail_packs.bride_name is
  'Couple forms only. NULL for birthday detail packs.';
comment on column public.demo_detail_packs.groom_name is
  'Couple forms only. NULL for birthday detail packs.';
comment on column public.demo_detail_packs.wedding_date is
  'Primary event date. Used by wedding, engagement and birthday-celebration packs.';
comment on column public.demo_detail_packs.wedding_time is
  'Primary event time. Used by wedding, engagement and birthday-celebration packs.';
comment on column public.demo_detail_packs.celebrant_name is
  'Birthday person''s name for birthday celebration/wishes packs.';
comment on column public.demo_detail_packs.birthday_number is
  'Age shown by a birthday-wishes pack, from 1 to 150.';
comment on column public.demo_detail_packs.special_message is
  'Birthday-wishes message shown by the demo.';

create index if not exists demo_detail_packs_form_type_idx
  on public.demo_detail_packs (form_type);
