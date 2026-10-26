-- ============================================================
-- PLANNER PLANS, SUBSCRIPTIONS & BRANDING
-- ============================================================
--
-- A planner plan is an account-level entitlement. It is deliberately separate
-- from the one-time per-invitation order flow:
--
--   * the plan controls whether a planner may create *new* plan-covered
--     invitations;
--   * each invitation keeps its own expiration_date. A plan ending never takes
--     a live client invitation offline.
--
-- A planner's brand is stored once on their profile and snapshotted onto the
-- wedding at publish time. Editing the brand later therefore cannot silently
-- rewrite every invitation the studio has already delivered.

create table if not exists public.planner_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  monthly_price_paise bigint not null default 0 check (monthly_price_paise >= 0),
  yearly_price_paise bigint not null default 0 check (yearly_price_paise >= 0),
  currency text not null default 'INR',
  -- NULL means unlimited. These are limits per billing period.
  monthly_invitation_limit int check (monthly_invitation_limit is null or monthly_invitation_limit > 0),
  yearly_invitation_limit int check (yearly_invitation_limit is null or yearly_invitation_limit > 0),
  razorpay_monthly_plan_id text,
  razorpay_yearly_plan_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.planner_plans is
  'Admin-managed planner subscription packages. A NULL invitation limit means unlimited during the active period.';

create table if not exists public.planner_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.planner_plans (id) on delete restrict,
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancellation_requested_at timestamptz,
  cancel_at_period_end boolean not null default false,
  invitations_used int not null default 0 check (invitations_used >= 0),
  invitation_limit_override int check (invitation_limit_override is null or invitation_limit_override > 0),
  source text not null default 'admin' check (source in ('admin', 'razorpay')),
  provider_subscription_id text unique,
  created_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.planner_subscriptions.invitations_used is
  'Slots reserved in the current billing period. Reset when a new period starts; released if wedding creation fails.';

-- At most one live subscription per planner. Pending rows are excluded so a
-- self-serve checkout can be created before the provider confirms it.
create unique index if not exists planner_subscriptions_one_live_idx
  on public.planner_subscriptions (profile_id)
  where status in ('active', 'past_due');

create index if not exists planner_subscriptions_profile_idx
  on public.planner_subscriptions (profile_id, current_period_end desc);

create index if not exists planner_subscriptions_provider_idx
  on public.planner_subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.planner_branding (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  brand_name text not null check (length(btrim(brand_name)) > 0),
  contact_phone text not null check (length(btrim(contact_phone)) > 0),
  address text,
  maps_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.planner_branding is
  'Planner studio identity. Publicly shown on planner-created invitations through the runtime payload.';

-- ── Per-invitation planner ownership ────────────────────────────────
alter table public.guest_drafts
  add column if not exists planner_id uuid references public.profiles (id) on delete set null,
  add column if not exists planner_subscription_id uuid references public.planner_subscriptions (id) on delete set null;

alter table public.weddings
  add column if not exists planner_id uuid references public.profiles (id) on delete set null,
  add column if not exists planner_subscription_id uuid references public.planner_subscriptions (id) on delete set null,
  add column if not exists billing_source text not null default 'one_time'
    check (billing_source in ('one_time', 'planner_plan')),
  add column if not exists planner_brand_snapshot jsonb;

comment on column public.weddings.planner_brand_snapshot is
  'Immutable copy of the planner brand at publish time. Keeps delivered invitations stable if the studio edits its brand later.';

alter table public.orders
  add column if not exists planner_subscription_id uuid references public.planner_subscriptions (id) on delete set null;

create index if not exists guest_drafts_planner_idx
  on public.guest_drafts (planner_id)
  where planner_id is not null;

create index if not exists weddings_planner_idx
  on public.weddings (planner_id, created_at desc)
  where planner_id is not null;

create index if not exists weddings_planner_subscription_idx
  on public.weddings (planner_subscription_id)
  where planner_subscription_id is not null;

-- ── Updated-at triggers ─────────────────────────────────────────────
drop trigger if exists planner_plans_set_updated_at on public.planner_plans;
create trigger planner_plans_set_updated_at
  before update on public.planner_plans
  for each row execute procedure public.touch_updated_at();

drop trigger if exists planner_subscriptions_set_updated_at on public.planner_subscriptions;
create trigger planner_subscriptions_set_updated_at
  before update on public.planner_subscriptions
  for each row execute procedure public.touch_updated_at();

drop trigger if exists planner_branding_set_updated_at on public.planner_branding;
create trigger planner_branding_set_updated_at
  before update on public.planner_branding
  for each row execute procedure public.touch_updated_at();

-- ── Atomic slot reservation ─────────────────────────────────────────
-- Count-based checks in application code race when two tabs publish at once.
-- The row lock makes the cap authoritative. A release is exposed so a failed
-- wedding insert does not burn a slot.
create or replace function public.claim_planner_invitation(
  p_subscription_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.planner_subscriptions;
  v_limit int;
begin
  select * into v_sub
  from public.planner_subscriptions
  where id = p_subscription_id
  for update;

  if v_sub.id is null
     or v_sub.profile_id <> p_profile_id
     or v_sub.status <> 'active'
     or v_sub.current_period_end < now() then
    return false;
  end if;

  if v_sub.billing_cycle = 'monthly' then
    select monthly_invitation_limit into v_limit
    from public.planner_plans where id = v_sub.plan_id;
  else
    select yearly_invitation_limit into v_limit
    from public.planner_plans where id = v_sub.plan_id;
  end if;

  v_limit := coalesce(v_sub.invitation_limit_override, v_limit);

  if v_limit is not null and v_sub.invitations_used >= v_limit then
    return false;
  end if;

  update public.planner_subscriptions
     set invitations_used = invitations_used + 1
   where id = v_sub.id;

  return true;
end;
$$;

create or replace function public.release_planner_invitation(p_subscription_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.planner_subscriptions
     set invitations_used = greatest(invitations_used - 1, 0)
   where id = p_subscription_id;
$$;

revoke all on function public.claim_planner_invitation(uuid, uuid) from anon, authenticated;
revoke all on function public.release_planner_invitation(uuid) from anon, authenticated;
grant execute on function public.claim_planner_invitation(uuid, uuid) to service_role;
grant execute on function public.release_planner_invitation(uuid) to service_role;

-- ── Guest draft read/write RPCs now expose planner ownership ────────
create or replace function public.get_guest_draft(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_draft public.guest_drafts;
begin
  select s.id into v_session_id
  from public.guest_sessions s
  where s.access_token = p_token and s.expires_at > now();

  if v_session_id is null then
    return 'null'::jsonb;
  end if;

  select d.* into v_draft
  from public.guest_drafts d
  where d.session_id = v_session_id
    and d.expires_at > now()
  order by d.updated_at desc
  limit 1;

  if v_draft.id is null then
    return 'null'::jsonb;
  end if;

  return jsonb_build_object(
    'id', v_draft.id,
    'session_id', v_draft.session_id,
    'template_id', v_draft.template_id,
    'template_version_id', v_draft.template_version_id,
    'wedding_data', v_draft.wedding_data,
    'email', v_draft.email,
    'status', v_draft.status,
    'expires_at', v_draft.expires_at,
    'updated_at', v_draft.updated_at,
    'planner_id', v_draft.planner_id,
    'planner_subscription_id', v_draft.planner_subscription_id
  );
end;
$$;

create or replace function public.save_guest_draft(
  p_token text,
  p_template_id uuid,
  p_template_version_id uuid,
  p_wedding_data jsonb,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.guest_sessions;
  v_draft public.guest_drafts;
begin
  select * into v_session
  from public.guest_sessions s
  where s.access_token = p_token and s.expires_at > now();

  if v_session.id is null then
    raise exception 'Invalid or expired guest session' using errcode = '22023';
  end if;

  update public.guest_sessions set last_seen_at = now() where id = v_session.id;

  select d.* into v_draft
  from public.guest_drafts d
  where d.session_id = v_session.id
    and d.expires_at > now()
  order by d.updated_at desc
  limit 1
  for update;

  if v_draft.id is null then
    insert into public.guest_drafts (
      session_id, template_id, template_version_id, wedding_data, email, expires_at
    )
    values (
      v_session.id, p_template_id, p_template_version_id,
      coalesce(p_wedding_data, '{}'::jsonb), p_email, now() + interval '14 days'
    )
    returning * into v_draft;
  else
    update public.guest_drafts
    set template_id = p_template_id,
        template_version_id = p_template_version_id,
        wedding_data = coalesce(p_wedding_data, wedding_data),
        email = coalesce(p_email, email),
        expires_at = now() + interval '14 days',
        updated_at = now()
    where id = v_draft.id
    returning * into v_draft;
  end if;

  return jsonb_build_object(
    'id', v_draft.id,
    'session_id', v_draft.session_id,
    'template_id', v_draft.template_id,
    'template_version_id', v_draft.template_version_id,
    'wedding_data', v_draft.wedding_data,
    'email', v_draft.email,
    'status', v_draft.status,
    'expires_at', v_draft.expires_at,
    'updated_at', v_draft.updated_at,
    'planner_id', v_draft.planner_id,
    'planner_subscription_id', v_draft.planner_subscription_id
  );
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.planner_plans enable row level security;
alter table public.planner_subscriptions enable row level security;
alter table public.planner_branding enable row level security;

drop policy if exists "planner_plans_read" on public.planner_plans;
create policy "planner_plans_read" on public.planner_plans
  for select using (active = true or public.is_admin());

drop policy if exists "planner_plans_admin_all" on public.planner_plans;
create policy "planner_plans_admin_all" on public.planner_plans
  for all using (public.is_admin());

drop policy if exists "planner_subscriptions_owner_read" on public.planner_subscriptions;
create policy "planner_subscriptions_owner_read" on public.planner_subscriptions
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "planner_subscriptions_admin_all" on public.planner_subscriptions;
create policy "planner_subscriptions_admin_all" on public.planner_subscriptions
  for all using (public.is_admin());

drop policy if exists "planner_branding_owner_read" on public.planner_branding;
create policy "planner_branding_owner_read" on public.planner_branding
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "planner_branding_owner_write" on public.planner_branding;
create policy "planner_branding_owner_write" on public.planner_branding
  for insert with check (profile_id = auth.uid());

drop policy if exists "planner_branding_owner_update" on public.planner_branding;
create policy "planner_branding_owner_update" on public.planner_branding
  for update using (profile_id = auth.uid());

drop policy if exists "planner_branding_admin_all" on public.planner_branding;
create policy "planner_branding_admin_all" on public.planner_branding
  for all using (public.is_admin());

grant select on public.planner_plans to authenticated;
grant select on public.planner_subscriptions to authenticated;
grant select, insert, update on public.planner_branding to authenticated;
grant all on public.planner_plans to service_role;
grant all on public.planner_subscriptions to service_role;
grant all on public.planner_branding to service_role;
