-- ============================================================
-- INVITE LIME — template version upload claims
-- Applied after 00022_authenticated_builder_sessions.sql.
-- Safe to run multiple times (idempotent).
--
-- A package upload claims its version row before writing objects, so the
-- unique (template_id, version) constraint serialises concurrent uploads.
-- The row is visible as "uploading" until every object is committed; failed
-- uploads delete the claim, and stale claims are removed by the upload route.
-- Published/draft semantics for every runtime query are unchanged.
-- ============================================================

alter table if exists public.template_versions
  drop constraint if exists template_versions_status_check;

alter table if exists public.template_versions
  add constraint template_versions_status_check
  check (status in ('published', 'draft', 'uploading'));

create index if not exists template_versions_uploading_idx
  on public.template_versions (template_id)
  where status = 'uploading';

comment on column public.template_versions.status is
  'published = servable; draft = uploaded and reviewable; uploading = claim held while package objects are written.';
