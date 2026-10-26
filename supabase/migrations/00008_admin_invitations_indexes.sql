-- Indexes backing the admin "Invitations" tab (sort/filter by date).
--
-- The tab lists every wedding with its contact email, creation date and expiry.
-- weddings_user_idx / weddings_status_idx already exist, but neither `created_at`
-- nor `expiration_date` was indexed, so the default ordering and the date
-- range filter would have to sequential-scan the table as live links accumulate.
--
-- Note on the search box: it matches `email ILIKE '%term%'`, and a leading
-- wildcard cannot use a btree index. The email index below therefore does NOT
-- accelerate that query; it only helps prefix lookups. Substring search needs
-- a pg_trgm GIN index if it ever needs to be index-backed.

-- Case-insensitive email lookups. Serves prefix/equality matches only.
create index if not exists weddings_email_idx
  on public.weddings (lower(email))
  where email is not null;

-- Default listing order is newest first, and the date-range filter narrows on
-- created_at. Descending order matches the common scan direction.
create index if not exists weddings_created_at_idx
  on public.weddings (created_at desc);

-- Backing index for the expiry column shown/sortable in the same table.
create index if not exists weddings_expiration_date_idx
  on public.weddings (expiration_date desc)
  where expiration_date is not null;

comment on index public.weddings_email_idx is
  'Supports prefix/equality lookups on customer email. Does not serve the admin search box, which uses a leading-wildcard ILIKE.';
comment on index public.weddings_created_at_idx is
  'Supports admin invitation listing order and created_at range filter.';
comment on index public.weddings_expiration_date_idx is
  'Supports admin invitation listing by host date (expiration_date).';