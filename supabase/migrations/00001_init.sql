-- ============================================================
-- INVITE LIME — initial schema
-- One application, one database, one customer + admin system,
-- many templates and many customer invitations.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PROFILES (mirrors auth.users, safe to extend)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'planner', 'admin')),
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Customer & admin profiles bound 1:1 to auth.users.';

-- ------------------------------------------------------------
-- TAXONOMY / CATEGORIES
-- ------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PRODUCTS (server-side pricing source of truth)
-- ------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_paise bigint not null check (price_paise >= 0),
  currency text not null default 'INR',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TEMPLATES
-- ------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status text not null default 'active' check (status in ('active', 'disabled', 'draft')),
  thumbnail_path text,
  preview_gif_path text,
  product_id uuid references public.products (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.templates.thumbnail_path is 'Object key inside template storage bucket: templates/{templateId}/thumbnail.....';

-- many-to-many: templates <-> categories
create table public.template_categories (
  template_id uuid not null references public.templates (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (template_id, category_id)
);

-- immutable template versions
create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  version text not null,
  storage_prefix text not null,
  manifest jsonb not null default '{}'::jsonb,
  is_current boolean not null default false,
  status text not null default 'published' check (status in ('published', 'draft')),
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

comment on table public.template_versions is 'Immutable releases of a template package. Invitations pin the exact version.';

-- ------------------------------------------------------------
-- GUEST SESSIONS + DRAFTS (no-login creation flow)
-- ------------------------------------------------------------
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  access_token text not null unique,
  ip_address text,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.guest_drafts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guest_sessions (id) on delete cascade,
  template_id uuid not null references public.templates (id),
  template_version_id uuid not null references public.template_versions (id),
  wedding_data jsonb not null default '{}'::jsonb,
  email text,
  status text not null default 'active' check (status in ('active', 'converted', 'abandoned', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- WEDDINGS (a customer invitation = one row)
-- ------------------------------------------------------------
create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  guest_session_id uuid references public.guest_sessions (id) on delete set null,
  template_id uuid not null references public.templates (id),
  template_version_id uuid not null references public.template_versions (id),
  product_id uuid references public.products (id),
  slug text unique,
  bride_name text,
  groom_name text,
  couple_bio text,
  story text,
  wedding_date date,
  wedding_time time,
  venue text,
  address text,
  maps_url text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  wedding_data jsonb not null default '{}'::jsonb,
  email text,
  status text not null default 'draft' check (status in ('draft', 'active', 'expired', 'cancelled')),
  expiration_date date,
  rsvp_toggle boolean not null default true,
  rsvp_deadline date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.weddings.slug is 'Public URL: /w/[slug]. Stable across edits.';

create table public.wedding_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name text not null,
  date date,
  time time,
  venue text,
  address text,
  maps_url text,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.wedding_media (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  type text not null check (type in ('image', 'video', 'audio')),
  role text not null check (role in ('bride', 'groom', 'couple', 'gallery', 'music', 'video')),
  storage_key text not null,
  public_url text,
  mime_type text,
  width int,
  height int,
  duration_ms int,
  size_bytes bigint,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.favorite_templates (
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

-- ------------------------------------------------------------
-- ORDER / PAYMENT
-- ------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  guest_session_id uuid references public.guest_sessions (id) on delete set null,
  draft_id uuid references public.guest_drafts (id) on delete set null,
  wedding_id uuid references public.weddings (id) on delete set null,
  template_id uuid not null,
  template_version_id uuid not null,
  product_id uuid references public.products (id),
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text,
  provider text not null default 'razorpay',
  amount_paise bigint not null,
  currency text not null default 'INR',
  status text not null check (status in ('pending', 'captured', 'refunded', 'failed')),
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RSVP / VIEWS / EMAIL / AUDIT / ANALYTICS / SETTINGS
-- ------------------------------------------------------------
create table public.rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  name text not null,
  email text,
  attendance text not null check (attendance in ('attending', 'declining', 'pending')),
  guests int not null default 1 check (guests >= 1),
  dietary text,
  message text,
  source text not null default 'public',
  created_at timestamptz not null default now()
);

-- One RSVP per email per wedding. Emails are stored trimmed and lower-cased by
-- submit_rsvp(), so lower(email) makes the guarantee case-insensitive even if a
-- future writer forgets to normalize. Null emails are excluded: guests may RSVP
-- without an address, and NULL values are never equal anyway.
create unique index rsvp_responses_wedding_email_idx
  on public.rsvp_responses (wedding_id, lower(email))
  where email is not null;

create table public.invitation_views (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  referrer text,
  user_agent text,
  ip_address text
);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  template_key text not null,
  wedding_id uuid references public.weddings (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'delivered', 'bounced')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  wedding_id uuid references public.weddings (id) on delete set null,
  template_id uuid references public.templates (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'customer',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Block self-promotion: only admins may change role/status on profiles.
--
-- This must stay SECURITY INVOKER. Inside a SECURITY DEFINER function current_user
-- is the function *owner* (postgres), never the caller, so a definer version can
-- not observe a service_role caller: both the `current_user <> 'service_role'`
-- test and is_admin() (which reads auth.uid() from the JWT) come back false and
-- the trigger rejects every role change, including the platform's own admin
-- bootstrap via promote-admin. Being invoker is safe here because the function
-- only reads and raises; is_admin() is itself SECURITY DEFINER, so the profile
-- read inside it still elevates correctly.
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- service_role is this application's own server. The superuser roles own the
  -- database and already bypass RLS, so denying them buys nothing.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- Everyone else must already be an admin before changing roles or statuses.
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Role changes are not permitted';
  end if;
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Status changes are not permitted';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_no_escalation on public.profiles;
create trigger profiles_no_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_privilege_escalation();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute procedure public.touch_updated_at();

drop trigger if exists weddings_set_updated_at on public.weddings;
create trigger weddings_set_updated_at
  before update on public.weddings
  for each row execute procedure public.touch_updated_at();

drop trigger if exists drafts_set_updated_at on public.guest_drafts;
create trigger drafts_set_updated_at
  before update on public.guest_drafts
  for each row execute procedure public.touch_updated_at();

-- Admin check helper for RLS
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Mark invitations expired (background job + runtime safety)
create or replace function public.mark_expired_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.weddings
  set status = 'expired', updated_at = now()
  where status = 'active'
    and expiration_date is not null
    and expiration_date < current_date;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- Guest session creation is RPC-only so anon users never write directly.
create or replace function public.create_guest_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '')
                  || replace(gen_random_uuid()::text, '-', '');
  v_session public.guest_sessions;
begin
  insert into public.guest_sessions (access_token, ip_address, user_agent, expires_at)
  values (
    v_token,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''),
    nullif(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''),
    now() + interval '14 days'
  )
  returning * into v_session;
  return jsonb_build_object(
    'id', v_session.id,
    'access_token', v_session.access_token,
    'expires_at', v_session.expires_at
  );
end;
$$;

-- Get a draft by session access token.
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
    'updated_at', v_draft.updated_at
  );
end;
$$;

-- Save (insert or update) a draft belonging to the session token.
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

  if p_wedding_data is not null then
    insert into public.guest_drafts (
      session_id, template_id, template_version_id, wedding_data, email, expires_at
    )
    values (
      v_session.id, p_template_id, p_template_version_id, coalesce(p_wedding_data, '{}'::jsonb),
      p_email, now() + interval '14 days'
    )
    returning * into v_draft;
  else
    update public.guest_drafts
    set wedding_data = coalesce(p_wedding_data, wedding_data),
        email = coalesce(p_email, email),
        updated_at = now()
    where session_id = v_session.id
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
    'updated_at', v_draft.updated_at
  );
end;
$$;

-- RSVP write path. Guests vote without an account, so this is the single entry
-- point: it re-checks invitation state (reachable directly by anon) and is
-- idempotent per wedding + email, returning the winning row either way.
create or replace function public.submit_rsvp(
  p_wedding_id uuid,
  p_name text,
  p_email text,
  p_attendance text,
  p_guests int,
  p_dietary text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wedding public.weddings;
  v_name text;
  v_email text;
  v_guests int;
  v_row public.rsvp_responses;
begin
  select * into v_wedding
  from public.weddings w
  where w.id = p_wedding_id and w.status = 'active' and w.rsvp_toggle;

  if v_wedding.id is null then
    raise exception 'RSVP unavailable for this invitation' using errcode = 'P0001';
  end if;

  -- This function is executable by anon, so it cannot trust the route to have
  -- validated these.
  if v_wedding.rsvp_deadline is not null and v_wedding.rsvp_deadline < now() then
    raise exception 'RSVP deadline has passed' using errcode = '22023';
  end if;

  if p_attendance not in ('attending', 'declining', 'pending') then
    raise exception 'Invalid attendance value' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Guest name is required' using errcode = '22023';
  end if;

  -- Blank input is "no email", not an empty-string identity.
  v_email := nullif(btrim(coalesce(p_email, '')), '');
  if v_email is not null then
    v_email := lower(v_email);
  end if;

  v_guests := greatest(coalesce(p_guests, 1), 1);

  -- Idempotent path: an email-identified guest changing their mind updates the
  -- row they already own instead of adding a second response.
  if v_email is not null then
    update public.rsvp_responses r
       set name = v_name,
           attendance = p_attendance,
           guests = v_guests,
           dietary = p_dietary,
           message = p_message,
           source = 'public'
     where r.wedding_id = p_wedding_id
       and lower(r.email) = v_email
     returning r.* into v_row;
  end if;

  if v_row.id is null then
    begin
      insert into public.rsvp_responses (wedding_id, name, email, attendance, guests, dietary, message, source)
      values (p_wedding_id, v_name, v_email, p_attendance, v_guests, p_dietary, p_message, 'public')
      returning * into v_row;
    exception
      when unique_violation then
        -- Concurrent submission for the same email won the race. Fold into it so
        -- the caller still gets a success response and one row.
        update public.rsvp_responses r
           set name = v_name,
               attendance = p_attendance,
               guests = v_guests,
               dietary = p_dietary,
               message = p_message,
               source = 'public'
         where r.wedding_id = p_wedding_id
           and lower(r.email) = v_email
         returning r.* into v_row;
    end;
  end if;

  return to_jsonb(v_row);
end;
$$;

-- Record an invitation view (server calls this to keep anon writes safe).
create or replace function public.record_invitation_view(
  p_wedding_id uuid,
  p_referrer text default null,
  p_user_agent text default null,
  p_ip text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.invitation_views (wedding_id, referrer, user_agent, ip_address)
  values (p_wedding_id, p_referrer, p_user_agent, p_ip);
end;
$$;

-- Analytics event recorder (called server-side).
create or replace function public.record_analytics_event(
  p_event text,
  p_wedding_id uuid default null,
  p_template_id uuid default null,
  p_user_id uuid default null,
  p_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_events (event, wedding_id, template_id, user_id, session_id, metadata)
  values (p_event, p_wedding_id, p_template_id, p_user_id, p_session_id, p_metadata);
end;
$$;

-- ============================================================
-- RLS: enable + policies
-- ============================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.templates enable row level security;
alter table public.template_categories enable row level security;
alter table public.template_versions enable row level security;
alter table public.weddings enable row level security;
alter table public.wedding_events enable row level security;
alter table public.wedding_media enable row level security;
alter table public.favorite_templates enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.guest_drafts enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.rsvp_responses enable row level security;
alter table public.invitation_views enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.site_settings enable row level security;

-- profiles: owner self-service, admins full
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- categories: read for everyone, admin writes
create policy "categories_read" on public.categories
  for select using (true);
create policy "categories_admin_all" on public.categories
  for all using (public.is_admin());

-- products: read when active, admin writes
create policy "products_read" on public.products
  for select using (active = true or public.is_admin());
create policy "products_admin_all" on public.products
  for all using (public.is_admin());

-- templates: public can browse active, admin full
create policy "templates_read" on public.templates
  for select using (status = 'active' or public.is_admin());
create policy "templates_admin_all" on public.templates
  for all using (public.is_admin());

-- template_categories: read, admin writes
create policy "tc_read" on public.template_categories
  for select using (true);
create policy "tc_admin_all" on public.template_categories
  for all using (public.is_admin());

-- template_versions: read public (version metadata is not sensitive),
-- admin writes.
create policy "tv_read" on public.template_versions
  for select using (true);
create policy "tv_admin_all" on public.template_versions
  for all using (public.is_admin());

-- weddings:
--  - owner (user) can read/update own
--  - public can read ONLY active (published) invitations (needed by /w/[slug])
--  - admins full
--
-- Public visibility is decided by is_wedding_public() rather than
-- `status = 'active'` alone. mark_expired_invitations() only runs when an admin
-- opens the dashboard or the ops job fires, so a lapsed subscription would
-- otherwise keep serving rows through PostgREST with the public anon key --
-- including wedding_data and the couple's email.
create or replace function public.is_wedding_public(p_status text, p_expiration_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'active'
         and (p_expiration_date is null or p_expiration_date >= current_date);
$$;

create policy "weddings_owner_select" on public.weddings
  for select using (auth.uid() = user_id);
create policy "weddings_owner_update" on public.weddings
  for update using (auth.uid() = user_id);
create policy "weddings_public_active" on public.weddings
  for select using (public.is_wedding_public(status, expiration_date));
create policy "weddings_admin_all" on public.weddings
  for all using (public.is_admin());

-- wedding_events: public read for active weddings, owner writes, admin all
create policy "events_public" on public.wedding_events
  for select using (
    exists (
      select 1 from public.weddings w
      where w.id = wedding_id
        and public.is_wedding_public(w.status, w.expiration_date)
    )
  );
create policy "events_owner_all" on public.wedding_events
  for all using (
    exists (select 1 from public.weddings w where w.id = wedding_id and w.user_id = auth.uid())
  );
create policy "events_admin_all" on public.wedding_events
  for all using (public.is_admin());

-- wedding_media: public read for active weddings (signed URLs downstream),
-- owner writes, admin all
create policy "media_public" on public.wedding_media
  for select using (
    exists (
      select 1 from public.weddings w
      where w.id = wedding_id
        and public.is_wedding_public(w.status, w.expiration_date)
    )
  );
create policy "media_owner_all" on public.wedding_media
  for all using (
    exists (select 1 from public.weddings w where w.id = wedding_id and w.user_id = auth.uid())
  );
create policy "media_admin_all" on public.wedding_media
  for all using (public.is_admin());

-- favorites: owner only
create policy "fav_owner_all" on public.favorite_templates
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- guest data is managed exclusively through security-definer RPCs;
-- direct row access is denied for anon and reserved for admins.
create policy "guest_sessions_admin_all" on public.guest_sessions
  for all using (public.is_admin());
create policy "guest_sessions_owner_select" on public.guest_sessions
  for select using (auth.uid() is not null);  -- session metadata, non-sensitive
create policy "guest_drafts_admin_all" on public.guest_drafts
  for all using (public.is_admin());

-- orders/payments: owner read, admin all; never anon writable
create policy "orders_owner_select" on public.orders
  for select using (auth.uid() = user_id);
create policy "orders_admin_all" on public.orders
  for all using (public.is_admin());

create policy "payments_owner_select" on public.payments
  for select using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "payments_admin_all" on public.payments
  for all using (public.is_admin());

-- rsvp_responses: written via RPC only; owner & admin read
create policy "rsvp_owner_select" on public.rsvp_responses
  for select using (
    exists (select 1 from public.weddings w where w.id = wedding_id and w.user_id = auth.uid())
  );
create policy "rsvp_admin_all" on public.rsvp_responses
  for all using (public.is_admin());

-- invitation_views: written via RPC only; admin reads
create policy "views_owner_select" on public.invitation_views
  for select using (
    exists (select 1 from public.weddings w where w.id = wedding_id and w.user_id = auth.uid())
  );
create policy "views_admin_all" on public.invitation_views
  for all using (public.is_admin());

-- email_deliveries: owner read, admin all
create policy "email_owner_select" on public.email_deliveries
  for select using (user_id = auth.uid() or wedding_id in (
    select id from public.weddings w where w.user_id = auth.uid()
  ));
create policy "email_admin_all" on public.email_deliveries
  for all using (public.is_admin());

-- audit_logs & analytics: admin only (writes via server RPC/service)
create policy "audit_admin_all" on public.audit_logs
  for all using (public.is_admin());
create policy "analytics_admin_all" on public.analytics_events
  for all using (public.is_admin());
create policy "analytics_owner_select" on public.analytics_events
  for select using (user_id = auth.uid());

-- site_settings: public reads configured values, admin writes
create policy "settings_read" on public.site_settings
  for select using (true);
create policy "settings_admin_all" on public.site_settings
  for all using (public.is_admin());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('templates', 'templates', true, 104857600, null),
  ('weddings', 'weddings', false, 104857600, null)
on conflict (id) do nothing;

-- templates bucket: public read, write only via service role (server)
create policy "templates_bucket_read" on storage.objects
  for select using (bucket_id = 'templates');
create policy "templates_bucket_write_admin" on storage.objects
  for insert with check (bucket_id = 'templates' and public.is_admin());
create policy "templates_bucket_update_admin" on storage.objects
  for update using (bucket_id = 'templates' and public.is_admin());
create policy "templates_bucket_delete_admin" on storage.objects
  for delete using (bucket_id = 'templates' and public.is_admin());

-- weddings bucket: private. Owner full control; no public policy.
create policy "weddings_bucket_read_owner" on storage.objects
  for select using (
    bucket_id = 'weddings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "weddings_bucket_write_owner" on storage.objects
  for insert with check (
    bucket_id = 'weddings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "weddings_bucket_update_owner" on storage.objects
  for update using (
    bucket_id = 'weddings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "weddings_bucket_delete_owner" on storage.objects
  for delete using (
    bucket_id = 'weddings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "weddings_bucket_admin_all" on storage.objects
  for all using (bucket_id = 'weddings' and public.is_admin());

-- ============================================================
-- INDEXES (query performance)
-- ============================================================
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists templates_slug_idx on public.templates (slug);
create index if not exists templates_status_idx on public.templates (status);
create index if not exists template_categories_category_idx on public.template_categories (category_id);
create index if not exists template_versions_template_idx on public.template_versions (template_id);
create index if not exists template_versions_current_idx on public.template_versions (template_id) where is_current;
create index if not exists weddings_user_idx on public.weddings (user_id);
create index if not exists weddings_status_idx on public.weddings (status);
create index if not exists weddings_status_expiry_idx on public.weddings (status, expiration_date) where status = 'active';
create index if not exists weddings_slug_idx on public.weddings (slug);
create index if not exists wedding_events_wedding_idx on public.wedding_events (wedding_id, sort_order);
create index if not exists wedding_media_wedding_idx on public.wedding_media (wedding_id, sort_order);
create index if not exists favorites_template_idx on public.favorite_templates (template_id);
create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_session_idx on public.orders (guest_session_id);
create index if not exists orders_wedding_idx on public.orders (wedding_id);
create index if not exists orders_paid_at_idx on public.orders (paid_at);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_txn_idx on public.payments (razorpay_payment_id);

-- Razorpay retries webhooks, and two deliveries can overlap. The handler's
-- check-then-insert cannot see an uncommitted twin, so idempotency is enforced
-- here as well: one row per provider payment id.
create unique index if not exists payments_provider_txn_uniq
  on public.payments (razorpay_payment_id)
  where razorpay_payment_id is not null;
create index if not exists rsvp_wedding_idx on public.rsvp_responses (wedding_id);
create index if not exists views_wedding_idx on public.invitation_views (wedding_id, viewed_at);
create index if not exists email_wedding_idx on public.email_deliveries (wedding_id);
create index if not exists email_status_idx on public.email_deliveries (status);
create index if not exists audit_created_idx on public.audit_logs (created_at);
create index if not exists analytics_event_created_idx on public.analytics_events (event, created_at);
create index if not exists analytics_template_idx on public.analytics_events (template_id);
create index if not exists guest_sessions_token_idx on public.guest_sessions (access_token);
-- Plain column indexes, deliberately. A partial index predicated on
-- `expires_at < now()` is rejected with "functions in index predicate must be
-- marked IMMUTABLE", which breaks `supabase db reset`. The expiry sweeps in
-- 00002_ops.sql read the column through these indexes instead.
create index if not exists guest_sessions_expiry_idx on public.guest_sessions (expires_at);
create index if not exists guest_drafts_session_idx on public.guest_drafts (session_id);
create index if not exists guest_drafts_expiry_idx on public.guest_drafts (expires_at);

-- ============================================================
-- GRANTS
-- ============================================================
grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.categories to anon, authenticated;
grant all on public.categories to service_role;
grant select on public.products to anon, authenticated;
grant all on public.products to service_role;
grant select on public.templates to anon, authenticated;
grant all on public.templates to service_role;
grant select on public.template_categories to anon, authenticated;
grant all on public.template_categories to service_role;
grant select on public.template_versions to anon, authenticated;
grant all on public.template_versions to service_role;
grant select, insert, update, delete on public.weddings to authenticated;
grant select on public.weddings to anon;
grant all on public.weddings to service_role;
grant select, insert, update, delete on public.wedding_events to authenticated;
grant select on public.wedding_events to anon;
grant all on public.wedding_events to service_role;
grant select, insert, update, delete on public.wedding_media to authenticated;
grant select on public.wedding_media to anon;
grant all on public.wedding_media to service_role;
grant select, insert, delete on public.favorite_templates to authenticated;
grant all on public.favorite_templates to service_role;
grant all on public.guest_sessions to service_role;
grant all on public.guest_drafts to service_role;
grant select on public.guest_sessions to authenticated;
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
grant select, insert, update on public.payments to authenticated;
grant all on public.payments to service_role;
grant select, insert, update on public.rsvp_responses to authenticated;
grant all on public.rsvp_responses to service_role;
grant select, insert on public.invitation_views to authenticated;
grant all on public.invitation_views to service_role;
grant select on public.email_deliveries to authenticated;
grant all on public.email_deliveries to service_role;
grant all on public.audit_logs to service_role;
grant select, insert on public.audit_logs to authenticated;
grant all on public.analytics_events to service_role;
grant select on public.analytics_events to authenticated;
grant select on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;
grant execute on function public.is_admin() to anon, authenticated;
-- security definer and global in effect: only the service role (admin server
-- client) may flip statuses, never an ordinary signed-in customer.
grant execute on function public.mark_expired_invitations() to service_role;
grant execute on function public.create_guest_session() to anon, authenticated;
grant execute on function public.get_guest_draft(text) to anon, authenticated;
grant execute on function public.save_guest_draft(text, uuid, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.submit_rsvp(uuid, text, text, text, int, text, text) to anon, authenticated, service_role;
grant execute on function public.record_invitation_view(uuid, text, text, text) to anon, authenticated;
grant execute on function public.record_analytics_event(text, uuid, uuid, uuid, text, jsonb) to anon, authenticated, service_role;