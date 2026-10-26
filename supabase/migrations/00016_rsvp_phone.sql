-- Guest phone number for RSVP follow-up.
--
-- The guest form now asks for a phone number on a Yes RSVP. The number is
-- stored with the response and is also included in the prefilled WhatsApp
-- message the guest sends to the couple.
alter table public.rsvp_responses
  add column if not exists phone text;

-- The old seven-argument function cannot be replaced by a function with a new
-- signature, so remove it before installing the phone-aware version.
drop function if exists public.submit_rsvp(uuid, text, text, text, int, text, text);

create or replace function public.submit_rsvp(
  p_wedding_id uuid,
  p_name text,
  p_email text,
  p_phone text,
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
  v_phone text;
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

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    raise exception 'Guest phone number is invalid' using errcode = '22023';
  end if;

  v_guests := greatest(coalesce(p_guests, 1), 1);

  -- Idempotent path: an email-identified guest changing their mind updates the
  -- row they already own instead of adding a second response.
  if v_email is not null then
    update public.rsvp_responses r
       set name = v_name,
           phone = v_phone,
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
      insert into public.rsvp_responses (wedding_id, name, email, phone, attendance, guests, dietary, message, source)
      values (p_wedding_id, v_name, v_email, v_phone, p_attendance, v_guests, p_dietary, p_message, 'public')
      returning * into v_row;
    exception
      when unique_violation then
        -- Concurrent submission for the same email won the race. Fold into it so
        -- the caller still gets a success response and one row.
        update public.rsvp_responses r
           set name = v_name,
               phone = v_phone,
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

grant execute on function public.submit_rsvp(uuid, text, text, text, text, int, text, text)
  to anon, authenticated, service_role;
