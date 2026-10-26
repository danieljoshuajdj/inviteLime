-- ============================================================
-- INVITE LIME — template tags support
-- Applied after 00003_hardening.sql. Safe to run multiple times (idempotent).
-- ============================================================

-- ── templates: add tags column ────────────────────────────────────────────

alter table if exists public.templates
  add column if not exists tags text[] not null default '{}';

comment on column public.templates.tags is
  'Optional user-defined tags for template discovery and filtering.';

-- Optional index for GIN search on tags
create index if not exists templates_tags_gin_idx
  on public.templates using gin (tags);