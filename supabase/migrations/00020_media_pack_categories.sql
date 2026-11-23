-- ============================================================
-- INVITE LIME — category-aware media packs
-- Applied after 00019_library_categories.sql.
-- Safe to run multiple times (idempotent).
-- ============================================================
--
-- A media pack now belongs to exactly one event form, mirroring the category
-- of the templates whose demos it can decorate. The admin Media tab picks a
-- category when creating a pack, and the template wizard only offers packs
-- from the template's own category.
--
-- Existing packs were authored for the original wedding-only demo flow, so
-- they are backfilled to 'wedding' rather than becoming uncategorised.

alter table public.media_packs
  add column if not exists form_type text;

update public.media_packs
set form_type = 'wedding'
where form_type is null;

alter table public.media_packs alter column form_type set default 'wedding';
alter table public.media_packs alter column form_type set not null;

alter table public.media_packs drop constraint if exists media_packs_form_type_check;
alter table public.media_packs add constraint media_packs_form_type_check
  check (form_type in ('wedding', 'engagement', 'birthday_celebration', 'birthday_wishes'));

comment on column public.media_packs.form_type is
  'The builder form/category this demo media pack belongs to. Templates only offer packs from their own category.';

create index if not exists media_packs_form_type_idx
  on public.media_packs (form_type);
