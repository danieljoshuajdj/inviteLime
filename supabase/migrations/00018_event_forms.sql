-- ============================================================
-- EVENT FORMS (ENGAGEMENT, BIRTHDAY CELEBRATION, BIRTHDAY WISHES)
-- ============================================================
--
-- A template now belongs to exactly one event category. That category decides
-- which builder form the template opens and which fields publishing requires:
--
--   wedding              → the original wedding form (unchanged)
--   engagement           → the wedding form, labelled "Engagement date"
--   birthday-celebration → birthday person, celebration date/time, venue, media
--   birthday-wishes      → birthday person, age and a special message
--
-- `templates.form_type` is derived from the category on the server and stored
-- so checkout/runtime never need a join to know the form. `weddings.form_type`
-- is frozen when the draft is created, so changing a template's category later
-- cannot silently change the form of an invitation already sold.
--
-- The old style/religion taxonomy is removed. Deleting those categories only
-- removes the labels: every template is linked to Wedding first, then the
-- legacy links cascade away. Templates and invitations themselves are kept.

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
alter table public.categories add column if not exists form_type text;
alter table public.templates add column if not exists form_type text;
alter table public.weddings add column if not exists form_type text;
alter table public.weddings add column if not exists celebrant_name text;

-- ------------------------------------------------------------
-- 2. The four event categories
-- ------------------------------------------------------------
insert into public.categories (name, slug, description, form_type)
values
  ('Wedding', 'wedding', 'Classic wedding ceremonies and receptions.', 'wedding'),
  ('Engagement', 'engagement', 'Engagement announcements and ring ceremonies.', 'engagement'),
  ('Birthday Celebration', 'birthday-celebration', 'Birthday party invitations with date, venue and photos.', 'birthday_celebration'),
  ('Birthday Wishes', 'birthday-wishes', 'A birthday greeting with an age and a personal message.', 'birthday_wishes')
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    form_type = excluded.form_type;

-- ------------------------------------------------------------
-- 3. Preserve every existing template under Wedding
-- ------------------------------------------------------------
-- A template that somehow already points at one of the new event categories
-- keeps that category. Everything else (legacy-only or uncategorised) becomes a
-- Wedding template, which is exactly how it behaved before this migration.
insert into public.template_categories (template_id, category_id)
select t.id, c.id
from public.templates t
cross join public.categories c
where c.slug = 'wedding'
  and not exists (
    select 1
    from public.template_categories tc
    join public.categories existing on existing.id = tc.category_id
    where tc.template_id = t.id
      and existing.slug in ('engagement', 'birthday-celebration', 'birthday-wishes')
  )
on conflict do nothing;

-- Legacy categories are no longer part of the taxonomy. Their links cascade.
delete from public.categories
where slug not in ('wedding', 'engagement', 'birthday-celebration', 'birthday-wishes');

-- ------------------------------------------------------------
-- 4. Derive the stored form type
-- ------------------------------------------------------------
update public.templates t
set form_type = c.form_type
from public.template_categories tc
join public.categories c on c.id = tc.category_id
where tc.template_id = t.id
  and c.form_type is not null;

-- Any row the join somehow missed behaves as a wedding, like before.
update public.templates set form_type = 'wedding' where form_type is null;

update public.weddings w
set form_type = coalesce(t.form_type, 'wedding')
from public.templates t
where t.id = w.template_id;

update public.weddings
set form_type = 'wedding'
where form_type is null;

update public.weddings
set celebrant_name = nullif(btrim(wedding_data ->> 'celebrantName'), '')
where celebrant_name is null
  and wedding_data ? 'celebrantName';

-- ------------------------------------------------------------
-- 5. Constraints and the one-category-per-template rule
-- ------------------------------------------------------------
alter table public.categories alter column form_type set not null;
alter table public.categories drop constraint if exists categories_form_type_check;
alter table public.categories add constraint categories_form_type_check
  check (form_type in ('wedding', 'engagement', 'birthday_celebration', 'birthday_wishes'));

alter table public.templates alter column form_type set default 'wedding';
alter table public.templates alter column form_type set not null;
alter table public.templates drop constraint if exists templates_form_type_check;
alter table public.templates add constraint templates_form_type_check
  check (form_type in ('wedding', 'engagement', 'birthday_celebration', 'birthday_wishes'));

alter table public.weddings alter column form_type set default 'wedding';
alter table public.weddings alter column form_type set not null;
alter table public.weddings drop constraint if exists weddings_form_type_check;
alter table public.weddings add constraint weddings_form_type_check
  check (form_type in ('wedding', 'engagement', 'birthday_celebration', 'birthday_wishes'));

-- One event category per template. The admin API re-derives `form_type` from
-- this single link, so a second category can never make the form ambiguous.
drop index if exists public.template_categories_template_unique_idx;
create unique index template_categories_template_unique_idx
  on public.template_categories (template_id);

comment on column public.templates.form_type is
  'Derived from the template''s single event category; decides which builder form and publish checks apply.';
comment on column public.weddings.form_type is
  'Frozen from the template when the draft is created, so later template changes cannot alter a sold invitation.';
comment on column public.weddings.celebrant_name is
  'Birthday person''s name. NULL for couple-based forms.';
