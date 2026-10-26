-- Guest session tokens were generated with gen_random_bytes() which lives in
-- the pgcrypto extension. On managed Postgres (Supabase) extensions install
-- into the `extensions` schema, so the function's `search_path = public` could
-- not resolve it at runtime (function gen_random_bytes(integer) does not
-- exist). gen_random_uuid() is built in since PostgreSQL 13 and needs no
-- extension, so use it instead. 48 hex chars -> 64 hex chars (two uuids).
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

-- get_guest_draft previously mixed jsonb_agg() with ORDER BY / LIMIT of a plain
-- column, which PostgreSQL rejects ("column d.updated_at must appear in the
-- GROUP BY clause"). Since we only ever need the single most-recent draft,
-- drop the aggregate entirely.
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