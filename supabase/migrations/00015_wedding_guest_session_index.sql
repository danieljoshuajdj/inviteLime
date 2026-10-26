-- The builder now resolves a guest session's published wedding on every
-- autosave, preview and upload so it can keep media in the wedding folder.
-- Those lookups filter by guest_session_id and order by created_at; without
-- this index the wedding table is scanned each time.
create index if not exists weddings_guest_session_idx
  on public.weddings (guest_session_id, created_at desc)
  where guest_session_id is not null;
