-- Authenticated builder sessions.
--
-- Template creation is no longer anonymous. Every builder session now belongs
-- to a Supabase Auth user, and the application checks that owner on every
-- draft read/write. The existing `guest_sessions` / `guest_drafts` tables are
-- retained so in-flight media folders and the checkout/publish pipeline keep
-- working; only the anonymous entry point has been removed.

alter table public.guest_sessions
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists guest_sessions_user_idx
  on public.guest_sessions (user_id);

-- Session metadata is only readable by the user who owns the session. Older
-- anonymous rows (user_id is null) become invisible to signed-in visitors.
drop policy if exists "guest_sessions_owner_select" on public.guest_sessions;
create policy "guest_sessions_owner_select" on public.guest_sessions
  for select using (auth.uid() = user_id);

-- The legacy guest RPCs were executable by browser roles and do not enforce
-- ownership internally. Application routes now call them with the service role
-- only after checking the Supabase session and the draft's owner, so direct
-- anonymous/authenticated execution is revoked here. Existing rows and the
-- checkout/publish pipeline are unaffected.
revoke execute on function public.create_guest_session() from public, anon, authenticated;
revoke execute on function public.get_guest_draft(text) from public, anon, authenticated;
revoke execute on function public.save_guest_draft(text, uuid, uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.create_guest_session() to service_role;
grant execute on function public.get_guest_draft(text) to service_role;
grant execute on function public.save_guest_draft(text, uuid, uuid, jsonb, text) to service_role;
