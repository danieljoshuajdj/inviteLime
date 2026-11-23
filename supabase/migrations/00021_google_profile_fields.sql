-- Persist the profile fields Google supplies during OAuth sign-in.
--
-- Supabase Auth stores Google's `name`, `full_name`, `picture` and `avatar_url`
-- claims on `auth.users.raw_user_meta_data`, and the stable Google account ID
-- (the `sub` claim) on `auth.identities.provider_id`. The original sign-up
-- trigger only copied the name; this version also copies the profile picture,
-- and a `google_id` column keeps the provider account ID alongside the profile.

alter table public.profiles
  add column if not exists google_id text;

create unique index if not exists profiles_google_id_key
  on public.profiles (google_id)
  where google_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    'customer',
    'active'
  )
  on conflict (id) do update
    set full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;

-- Backfill existing rows that were created before profile pictures were copied.
update public.profiles p
set full_name = coalesce(
      p.full_name,
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    ),
    avatar_url = coalesce(
      p.avatar_url,
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture'
    )
from auth.users u
where u.id = p.id
  and (
    (
      p.full_name is null
      and coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') is not null
    )
    or (
      p.avatar_url is null
      and coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') is not null
    )
  );

-- The provider account ID is held on the identity, not on auth.users.
update public.profiles p
set google_id = i.provider_id
from auth.identities i
where i.user_id = p.id
  and i.provider = 'google'
  and i.provider_id is not null
  and p.google_id is null;
