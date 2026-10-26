-- ============================================================
-- INVITE LIME — template lifecycle management
-- Applied after 00005_tags.sql. Safe to run multiple times (idempotent).
--
-- Lets an admin permanently delete a template. Non-active invitations that
-- reference the template are *detached* (their template refs become NULL) so
-- the NOT NULL FKs do not block deletion; active invitations still block
-- deletion server-side. Guest drafts referencing the template are deleted by
-- the app before the template row goes (they are throwaway session state).
-- Order/payment rows keep their template ids as plain data (no FK) and are
-- never touched.
-- ============================================================

-- ── Weddings: template references become detachable ─────────────────────
alter table if exists public.weddings
  alter column template_id drop not null;

alter table if exists public.weddings
  alter column template_version_id drop not null;

comment on column public.weddings.template_id is
  'Template pinned at purchase. NULL once the template is permanently deleted (non-active invitations are detached; active ones block deletion).';

comment on column public.weddings.template_version_id is
  'Immutable template version pinned at purchase. NULL once the template is permanently deleted and the invitation is non-active.';

-- Usage-count and detach lookups
create index if not exists weddings_template_id_idx
  on public.weddings (template_id)
  where template_id is not null;

create index if not exists weddings_template_version_id_idx
  on public.weddings (template_version_id)
  where template_version_id is not null;