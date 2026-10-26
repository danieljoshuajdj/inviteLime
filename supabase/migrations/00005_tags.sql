-- ============================================================
-- INVITE LIME — admin-managed tags
-- Applied after 00004_template_tags.sql. Safe to run multiple times (idempotent).
-- ============================================================

-- ── Tags table (admin-managed, for template tagging) ────────────────────

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tags is
  'Admin-managed tags for template categorization and discovery.';

alter table public.tags enable row level security;

create policy "tags_admin_all" on public.tags
  for all using (public.is_admin());

create policy "tags_public_read" on public.tags
  for select using (true);

-- Trigger for updated_at
drop trigger if exists tags_set_updated_at on public.tags;
create trigger tags_set_updated_at
  before update on public.tags
  for each row execute procedure public.touch_updated_at();

-- Grants
grant select on public.tags to authenticated;
grant all on public.tags to service_role;

-- Performance index
create index if not exists tags_name_idx on public.tags (name);

-- ── Note on template tags ──────────────────────────────────────────────
-- The templates.tags column (text[]) stores tag *names* as free-form strings.
-- This table provides the canonical list of tags that admins can manage.
-- The template form's MultiSelect will use tags from this table.
-- No foreign key constraint to keep template tags flexible for import/legacy.