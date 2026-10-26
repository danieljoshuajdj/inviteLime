-- Guest autosave must update the session's draft, not append a new row.
--
-- `save_guest_draft` used to take the "data supplied" branch on every autosave
-- and INSERT a fresh guest_drafts row. A builder session therefore accumulated
-- one draft per pause in typing, all sharing a session. Besides the bloat, the
-- newest row could disagree with the media migration that runs at publish time:
-- the wedding and draft ended up pointing at different object folders.
--
-- Reuse the latest live draft for the session and update it in place. The row is
-- locked while it is rewritten so two autosaves racing from the same tab cannot
-- create a duplicate again.
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
    'updated_at', v_draft.updated_at
  );
end;
$$;
