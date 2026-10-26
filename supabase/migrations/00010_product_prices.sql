-- ============================================================
-- 00010 product_prices — explicit per-currency storefront pricing
-- ============================================================
-- public.products stays the home-market base price (INR). product_prices adds
-- the *explicit* price shown and charged in each other settlement currency
-- (USD, EUR, GBP, ...) that the Razorpay account is approved for.
--
-- Amounts are integer minor units (paise / cents), matching
-- products.price_paise and orders.amount_paise — money is never stored as a
-- float. Currency is an ISO-4217 alpha-3 code; the allowed set is enforced in
-- the application from RAZORPAY_ALLOWED_CURRENCIES.

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, currency)
);

-- Foreign keys are not indexed by Postgres; the storefront embeds prices by
-- product_id on every listing query.
create index product_prices_product_id_idx on public.product_prices (product_id);

-- Hot path only ever reads active rows for a currency.
create index product_prices_active_currency_idx
  on public.product_prices (currency)
  where active;

alter table public.product_prices enable row level security;

-- Storefront (anon) may read active prices; admins manage every row.
create policy "product_prices_read" on public.product_prices
  for select using (active = true or public.is_admin());
create policy "product_prices_admin_all" on public.product_prices
  for all using (public.is_admin());

drop trigger if exists product_prices_set_updated_at on public.product_prices;
create trigger product_prices_set_updated_at
  before update on public.product_prices
  for each row execute procedure public.touch_updated_at();

-- ------------------------------------------------------------
-- Baseline backfill
-- ------------------------------------------------------------
-- Gives every existing product a starting price in each supported currency so
-- the storefront never shows an empty price. These are *derived* from the INR
-- base at the reference rates below and rounded to whole currency units — they
-- are a starting point to be reviewed, not live FX. Edit rows in
-- product_prices (or the admin UI) to set final international prices.
--
-- Idempotent: `on conflict do nothing` means an existing (possibly edited)
-- price is never overwritten.

insert into public.product_prices (product_id, currency, amount_minor)
select p.id, 'INR', p.price_paise
from public.products p
on conflict (product_id, currency) do nothing;

with rates (currency, rate) as (
  values
    ('USD', 0.0120::numeric),
    ('EUR', 0.0110::numeric),
    ('GBP', 0.0095::numeric),
    ('AED', 0.0440::numeric),
    ('AUD', 0.0180::numeric),
    ('CAD', 0.0160::numeric),
    ('SGD', 0.0160::numeric)
)
insert into public.product_prices (product_id, currency, amount_minor)
select
  p.id,
  r.currency,
  -- INR base is minor units; convert to whole units in the target currency,
  -- round to the nearest unit, then back to minor units.
  (round((p.price_paise / 100.0) * r.rate) * 100)::bigint
from public.products p
cross join rates r
on conflict (product_id, currency) do nothing;
