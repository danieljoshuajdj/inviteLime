-- ============================================================
-- INVITE LIME — template version retention, rollback & purge
-- Applied after 00024_template_image_upload.sql. Safe to run multiple times.
--
-- Publishing a version makes it the single current release and repoints every
-- invitation of that template to it. The replaced version is kept for 72
-- hours (status "previous") so an admin can restore it, then it is retired
-- (status "retired") and its row + storage prefix are permanently deleted.
--
-- A rollback makes the chosen previous version current again and immediately
-- retires the rejected version. A retired row is never served by the runtime;
-- it is only a retry record until its files and row are removed.
--
-- All switches happen inside security-definer functions so the version state,
-- invitation repointing and retention metadata change atomically.
-- ============================================================

-- ── Retention metadata ──────────────────────────────────────────────────
alter table if exists public.template_versions
  add column if not exists published_at timestamptz,
  add column if not exists replaced_at timestamptz,
  add column if not exists delete_after timestamptz,
  add column if not exists retired_at timestamptz,
  add column if not exists retirement_reason text;

comment on column public.template_versions.published_at is
  'When this version last became the current published release.';
comment on column public.template_versions.replaced_at is
  'When this version stopped being current. Null while current/draft.';
comment on column public.template_versions.delete_after is
  'End of the previous-version retention window. Null while current/draft.';
comment on column public.template_versions.retired_at is
  'When the version became unavailable. A retired row is a cleanup retry record only.';
comment on column public.template_versions.retirement_reason is
  'replaced | rollback | expired | manual';

-- ── Statuses ────────────────────────────────────────────────────────────
alter table if exists public.template_versions
  drop constraint if exists template_versions_status_check;

alter table if exists public.template_versions
  add constraint template_versions_status_check
  check (status in ('published', 'draft', 'uploading', 'previous', 'retired'));

comment on column public.template_versions.status is
  'published = current servable release; previous = retained replaced release; retired = unavailable, pending permanent deletion; draft = uploaded and reviewable; uploading = claim held while package objects are written.';

-- ── Backfill existing data ──────────────────────────────────────────────
-- Versions that were published before this migration and are no longer
-- current become "previous". Their replacement time is the current version's
-- publish/creation time; if there is no current version we start the 72-hour
-- window now so nothing is deleted immediately.
with current_versions as (
  select distinct on (template_id)
    template_id,
    coalesce(published_at, created_at) as current_since
  from public.template_versions
  where status = 'published' and is_current = true
  order by template_id, coalesce(published_at, created_at) desc, created_at desc
)
update public.template_versions v
set
  status = 'previous',
  is_current = false,
  published_at = coalesce(v.published_at, v.created_at),
  replaced_at = coalesce(v.replaced_at, c.current_since, now()),
  delete_after = coalesce(v.delete_after, coalesce(c.current_since, now()) + interval '72 hours'),
  retired_at = null,
  retirement_reason = null
from current_versions c
where v.template_id = c.template_id
  and v.status = 'published'
  and v.is_current = false;

update public.template_versions v
set
  status = 'previous',
  is_current = false,
  published_at = coalesce(v.published_at, v.created_at),
  replaced_at = coalesce(v.replaced_at, now()),
  delete_after = coalesce(v.delete_after, now() + interval '72 hours'),
  retired_at = null,
  retirement_reason = null
where v.status = 'published'
  and v.is_current = false
  and not exists (
    select 1
    from public.template_versions c
    where c.template_id = v.template_id
      and c.status = 'published'
      and c.is_current = true
  );

update public.template_versions
set
  published_at = coalesce(published_at, created_at),
  replaced_at = null,
  delete_after = null,
  retired_at = null,
  retirement_reason = null
where status = 'published' and is_current = true;

update public.template_versions
set
  replaced_at = null,
  delete_after = null,
  retired_at = null,
  retirement_reason = null
where status in ('draft', 'uploading');

-- ── Retention indexes ───────────────────────────────────────────────────
create index if not exists template_versions_retention_idx
  on public.template_versions (delete_after)
  where status = 'previous' and delete_after is not null;

create index if not exists template_versions_retired_idx
  on public.template_versions (retired_at)
  where status = 'retired';

-- ============================================================
-- Publish a draft version
-- ============================================================
create or replace function public.publish_template_version(
  p_template_id uuid,
  p_version_id uuid,
  p_retention_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_target public.template_versions;
  v_current public.template_versions;
  v_retention_hours integer := greatest(coalesce(p_retention_hours, 72), 1);
  v_previous_delete_after timestamptz;
  v_invitations integer := 0;
  v_drafts integer := 0;
  v_previous jsonb := null;
begin
  perform 1 from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.template_versions
  where id = p_version_id and template_id = p_template_id
  for update;

  if not found then
    raise exception 'Template version not found' using errcode = 'P0002';
  end if;

  if v_target.status = 'uploading' then
    raise exception 'UPLOAD_IN_PROGRESS' using errcode = 'P0001';
  end if;

  if v_target.status = 'retired' then
    raise exception 'VERSION_RETIRED' using errcode = 'P0001';
  end if;

  if v_target.status = 'published' and v_target.is_current then
    return jsonb_build_object(
      'ok', true,
      'alreadyCurrent', true,
      'versionId', v_target.id,
      'version', v_target.version,
      'previous', null,
      'repointedInvitations', 0,
      'repointedDrafts', 0,
      'retentionHours', v_retention_hours
    );
  end if;

  if v_target.status <> 'draft' then
    raise exception 'Only a draft version can be published' using errcode = 'P0001';
  end if;

  select * into v_current
  from public.template_versions
  where template_id = p_template_id
    and is_current = true
    and status = 'published'
  order by coalesce(published_at, created_at) desc, created_at desc
  limit 1
  for update;

  if found then
    update public.template_versions
    set
      is_current = false,
      status = 'previous',
      published_at = coalesce(published_at, created_at),
      replaced_at = coalesce(replaced_at, v_now),
      delete_after = coalesce(delete_after, v_now + make_interval(hours => v_retention_hours)),
      retired_at = null,
      retirement_reason = null
    where id = v_current.id
    returning delete_after into v_previous_delete_after;

    v_previous := jsonb_build_object(
      'id', v_current.id,
      'version', v_current.version,
      'deleteAfter', v_previous_delete_after
    );
  end if;

  update public.template_versions
  set
    status = 'published',
    is_current = true,
    published_at = v_now,
    replaced_at = null,
    delete_after = null,
    retired_at = null,
    retirement_reason = null
  where id = v_target.id;

  update public.weddings
  set template_version_id = v_target.id
  where template_id = p_template_id
    and (template_version_id is distinct from v_target.id);
  get diagnostics v_invitations = row_count;

  update public.guest_drafts
  set template_version_id = v_target.id
  where template_id = p_template_id
    and (template_version_id is distinct from v_target.id);
  get diagnostics v_drafts = row_count;

  update public.templates
  set status = 'active'
  where id = p_template_id and status = 'draft';

  return jsonb_build_object(
    'ok', true,
    'alreadyCurrent', false,
    'versionId', v_target.id,
    'version', v_target.version,
    'previous', v_previous,
    'repointedInvitations', v_invitations,
    'repointedDrafts', v_drafts,
    'retentionHours', v_retention_hours
  );
end;
$$;

-- ============================================================
-- Roll a previous version back to current
-- ============================================================
create or replace function public.rollback_template_version(
  p_template_id uuid,
  p_target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_target public.template_versions;
  v_current public.template_versions;
  v_invitations integer := 0;
  v_drafts integer := 0;
  v_rejected jsonb := null;
begin
  perform 1 from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.template_versions
  where id = p_target_version_id and template_id = p_template_id
  for update;

  if not found then
    raise exception 'Template version not found' using errcode = 'P0002';
  end if;

  if v_target.status <> 'previous' then
    raise exception 'Only a retained previous version can be restored' using errcode = 'P0001';
  end if;

  if v_target.retired_at is not null then
    raise exception 'VERSION_RETIRED' using errcode = 'P0001';
  end if;

  if v_target.delete_after is not null and v_target.delete_after <= v_now then
    raise exception 'VERSION_RETENTION_EXPIRED' using errcode = 'P0001';
  end if;

  select * into v_current
  from public.template_versions
  where template_id = p_template_id
    and is_current = true
    and status = 'published'
  order by coalesce(published_at, created_at) desc, created_at desc
  limit 1
  for update;

  if found then
    update public.template_versions
    set
      status = 'retired',
      is_current = false,
      retired_at = v_now,
      retirement_reason = 'rollback',
      delete_after = coalesce(delete_after, v_now)
    where id = v_current.id;

    v_rejected := jsonb_build_object(
      'id', v_current.id,
      'version', v_current.version
    );
  end if;

  update public.template_versions
  set
    status = 'published',
    is_current = true,
    published_at = v_now,
    replaced_at = null,
    delete_after = null,
    retired_at = null,
    retirement_reason = null
  where id = v_target.id;

  update public.weddings
  set template_version_id = v_target.id
  where template_id = p_template_id
    and (template_version_id is distinct from v_target.id);
  get diagnostics v_invitations = row_count;

  update public.guest_drafts
  set template_version_id = v_target.id
  where template_id = p_template_id
    and (template_version_id is distinct from v_target.id);
  get diagnostics v_drafts = row_count;

  update public.templates
  set status = 'active'
  where id = p_template_id and status = 'draft';

  return jsonb_build_object(
    'ok', true,
    'versionId', v_target.id,
    'version', v_target.version,
    'rejected', v_rejected,
    'repointedInvitations', v_invitations,
    'repointedDrafts', v_drafts
  );
end;
$$;

-- ============================================================
-- Retire an expired previous version (move its invitations first)
-- ============================================================
create or replace function public.retire_template_version(
  p_template_id uuid,
  p_version_id uuid,
  p_reason text default 'expired'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_target public.template_versions;
  v_current public.template_versions;
  v_invitations integer := 0;
  v_drafts integer := 0;
begin
  perform 1 from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.template_versions
  where id = p_version_id and template_id = p_template_id
  for update;

  if not found then
    raise exception 'Template version not found' using errcode = 'P0002';
  end if;

  if v_target.status = 'retired' then
    return jsonb_build_object(
      'ok', true,
      'alreadyRetired', true,
      'versionId', v_target.id,
      'version', v_target.version,
      'currentVersionId', null,
      'currentVersion', null,
      'repointedInvitations', 0,
      'repointedDrafts', 0
    );
  end if;

  if v_target.is_current or v_target.status = 'published' then
    raise exception 'Cannot retire the current published version' using errcode = 'P0001';
  end if;

  if v_target.status <> 'previous' then
    raise exception 'Only a previous version can be retired' using errcode = 'P0001';
  end if;

  select * into v_current
  from public.template_versions
  where template_id = p_template_id
    and is_current = true
    and status = 'published'
  order by coalesce(published_at, created_at) desc, created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'NO_CURRENT_VERSION' using errcode = 'P0001';
  end if;

  update public.template_versions
  set
    status = 'retired',
    is_current = false,
    retired_at = v_now,
    retirement_reason = coalesce(nullif(p_reason, ''), 'expired'),
    delete_after = coalesce(delete_after, v_now)
  where id = v_target.id;

  update public.weddings
  set template_version_id = v_current.id
  where template_version_id = v_target.id;
  get diagnostics v_invitations = row_count;

  update public.guest_drafts
  set template_version_id = v_current.id
  where template_version_id = v_target.id;
  get diagnostics v_drafts = row_count;

  return jsonb_build_object(
    'ok', true,
    'alreadyRetired', false,
    'versionId', v_target.id,
    'version', v_target.version,
    'currentVersionId', v_current.id,
    'currentVersion', v_current.version,
    'repointedInvitations', v_invitations,
    'repointedDrafts', v_drafts
  );
end;
$$;

-- ── Permissions: only the service role may switch versions ──────────────
revoke all on function public.publish_template_version(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.rollback_template_version(uuid, uuid) from public, anon, authenticated;
revoke all on function public.retire_template_version(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.publish_template_version(uuid, uuid, integer) to service_role;
grant execute on function public.rollback_template_version(uuid, uuid) to service_role;
grant execute on function public.retire_template_version(uuid, uuid, text) to service_role;
