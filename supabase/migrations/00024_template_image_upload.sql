-- ============================================================
-- INVITE LIME — per-template image uploads
-- Applied after 00023_template_version_uploading.sql.
-- Safe to run multiple times (idempotent).
--
-- Some template designs are details-and-soundtrack only. This flag lets the
-- admin decide, per template, whether the customer's create form asks for
-- photos. Existing templates default to true so their behaviour is unchanged.
-- ============================================================

alter table if exists public.templates
  add column if not exists allows_image_upload boolean not null default true;

comment on column public.templates.allows_image_upload is
  'When false, the customer create form hides all photo uploads and photo toggles for this template.';
