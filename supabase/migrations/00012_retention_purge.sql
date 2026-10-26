-- ============================================================
-- INVITE LIME — retention & purge support
-- Applied after 00011_media_packs.sql. Safe to run multiple times.
--
-- Expired / cancelled invitations and abandoned checkout drafts are purged
-- from the database AND from object storage (see src/lib/services/ops.ts and
-- src/lib/services/wedding-purge.ts). Financial history must survive that:
-- orders already keep their row with wedding_id set to NULL, and this
-- migration gives payments the same behaviour. The partial indexes below keep
-- the purge scans cheap.
-- ============================================================

-- ── Payments: survive a wedding purge ────────────────────────────────────
-- The admin dashboard's revenue figure is computed from `payments`, so a
-- cascading delete would silently rewrite past revenue whenever a wedding is
-- purged. Captured payment rows are accounting history: the link to the
-- wedding goes, the row stays.
alter table if exists public.payments
  alter column wedding_id drop not null;

alter table if exists public.payments
  drop constraint if exists payments_wedding_id_fkey;

alter table if exists public.payments
  add constraint payments_wedding_id_fkey
  foreign key (wedding_id) references public.weddings (id) on delete set null;

comment on column public.payments.wedding_id is
  'Payment history is retained after the invitation is purged; NULL once the wedding row is gone.';

-- ── Purge-scan indexes ───────────────────────────────────────────────────
-- Each is partial on the status the retention job selects, so the scan only
-- touches rows that can actually become purge candidates.
create index if not exists weddings_expired_purge_idx
  on public.weddings (expiration_date)
  where status = 'expired';

create index if not exists weddings_cancelled_purge_idx
  on public.weddings (updated_at)
  where status = 'cancelled';

create index if not exists weddings_draft_purge_idx
  on public.weddings (created_at)
  where status = 'draft';
