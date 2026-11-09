-- STAGING ONLY. NOT A PRODUCTION MIGRATION. Generated from the verified staging database definitions.
create schema if not exists booking_internal;
revoke all on schema booking_internal from public,anon,authenticated;
grant usage on schema booking_internal to service_role;
create table booking_internal.hold_groups (
 id uuid primary key default gen_random_uuid(),
 token uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 state text not null default 'pending' check(state in ('pending','confirmed','released')),
 confirm_request_id uuid,
 result jsonb
);
create table booking_internal.hold_slots (
 hold_id uuid not null references booking_internal.hold_groups(id) on delete cascade,
 booking_id uuid not null unique references public.bookings(id) on delete cascade,
 primary key(hold_id,booking_id)
);
create table booking_internal.receipt_sequences (
 month_key text primary key,
 last_number integer not null check(last_number>=1)
);
create index hold_groups_expiry_idx on booking_internal.hold_groups(expires_at) where state='pending';
create index hold_slots_booking_idx on booking_internal.hold_slots(booking_id);
revoke all on all tables in schema booking_internal from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema booking_internal to service_role;
grant select,insert,update,delete on public.bookings,public.transactions to service_role;

-- booking_internal.assert_slot
CREATE OR REPLACE FUNCTION booking_internal.assert_slot(p_slot text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_start integer; v_end integer;
begin
  if p_slot is null or p_slot !~ '^([0-2][0-9]):00 - ([0-2][0-9]):00$' then
    raise exception 'INVALID_SLOT';
  end if;
  v_start := substring(p_slot from 1 for 2)::integer;
  v_end := substring(p_slot from 9 for 2)::integer;
  if v_start < 8 or v_start >= 23 or v_end <> v_start + 1 then
    raise exception 'INVALID_SLOT';
  end if;
  return v_start;
end; $function$;

-- booking_internal.slot_fee
CREATE OR REPLACE FUNCTION booking_internal.slot_fee(p_date date, p_start_hour integer)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Staging base tariff. Promotional rules must be modeled and verified before production.
  if p_start_hour < 8 or p_start_hour >= 23 then
    raise exception 'INVALID_SLOT';
  end if;
  return case when p_start_hour < 16 then 250 else 350 end;
end; $function$;

-- booking_internal.assert_booking_window
CREATE OR REPLACE FUNCTION booking_internal.assert_booking_window(p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamp := (now() at time zone 'Asia/Bangkok');
  v_today date;
  v_dow integer;
  v_sunday date;
begin
  v_today := v_now::date;
  v_dow := extract(dow from v_now)::integer;
  v_sunday := v_today - v_dow;
  if v_dow = 0 and v_now::time < time '09:00' then
     v_sunday := v_sunday - 7;
  end if;
  if p_date is null or p_date < v_today or p_date > v_sunday + 21 then
    raise exception 'OUTSIDE_BOOKING_WINDOW';
  end if;
end; $function$;

-- public.staging_confirm_hold
CREATE OR REPLACE FUNCTION public.staging_confirm_hold(p_token uuid, p_request_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_group booking_internal.hold_groups%rowtype; v_row record;
 v_month text; v_number integer; v_invoice text; v_receipt text;
 v_result jsonb; v_ids uuid[] := '{}'::uuid[];
 v_fee numeric;
begin
 if p_token is null or p_request_id is null then raise exception 'MISSING_TOKEN_OR_IDEMPOTENCY_KEY'; end if;
 select * into v_group from booking_internal.hold_groups where token=p_token for update;
 if not found then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.state='confirmed' then
   if v_group.confirm_request_id=p_request_id then return v_group.result; end if;
   return jsonb_build_object('success',false,'error','ALREADY_CONFIRMED');
 end if;
 if v_group.state <> 'pending' then return jsonb_build_object('success',false,'error','HOLD_RELEASED'); end if;
 if v_group.expires_at <= now() then return jsonb_build_object('success',false,'error','HOLD_EXPIRED'); end if;
 if p_name is null or length(btrim(p_name)) < 2 or length(p_name)>100
    or p_phone is null or p_phone !~ '^[0-9]{9,15}$'
    or (p_email is not null and (length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$'))
 then return jsonb_build_object('success',false,'error','INVALID_CUSTOMER'); end if;

 select to_char(b.booking_date,'YYYYMM') into v_month
 from booking_internal.hold_slots hs join public.bookings b on b.id=hs.booking_id
 where hs.hold_id=v_group.id limit 1;
 if v_month is null then raise exception 'EMPTY_HOLD'; end if;
 insert into booking_internal.receipt_sequences(month_key,last_number)
   values(v_month,1) on conflict(month_key) do update
   set last_number=booking_internal.receipt_sequences.last_number + 1
   returning last_number into v_number;
 v_invoice := 'INV.'||v_month||lpad(v_number::text,3,'0');
 v_receipt := 'R.'||v_month||lpad(v_number::text,3,'0');

 for v_row in
    select b.* from booking_internal.hold_slots hs
    join public.bookings b on b.id=hs.booking_id
    where hs.hold_id=v_group.id order by b.time_slot for update of b
 loop
    if v_row.status <> 'pending_hold' then raise exception 'HOLD_INCONSISTENT'; end if;
    v_fee := booking_internal.slot_fee(v_row.booking_date,booking_internal.assert_slot(v_row.time_slot));
    update public.bookings set status='confirmed',customer_name=btrim(p_name),
       phone=p_phone,email=p_email,fee=v_fee,invoice_no=v_invoice,receipt_no=v_receipt
      where id=v_row.id;
    insert into public.transactions(transaction_date,type,category,amount,description,booking_id)
      values(v_row.booking_date,'income','Court Rental',v_fee,
             'Court rental '||v_row.time_slot||' ['||v_receipt||']',v_row.id);
    v_ids := array_append(v_ids,v_row.id);
 end loop;
 v_result := jsonb_build_object('success',true,'booking_ids',to_jsonb(v_ids),
                                'invoice_no',v_invoice,'receipt_no',v_receipt);
 update booking_internal.hold_groups set state='confirmed',
   confirm_request_id=p_request_id,result=v_result where id=v_group.id;
 return v_result;
end; $function$;

-- public.staging_create_hold
CREATE OR REPLACE FUNCTION public.staging_create_hold(p_date date, p_slots text[], p_court text DEFAULT 'Main Court'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid; v_token uuid; v_exp timestamptz;
  v_slot text; v_start integer; v_now timestamp := (now() at time zone 'Asia/Bangkok');
  v_slots text[]; v_booking_id uuid;
begin
  perform booking_internal.assert_booking_window(p_date);
  if p_court is distinct from 'Main Court' then raise exception 'UNKNOWN_COURT'; end if;
  if p_slots is null or cardinality(p_slots) < 1 or cardinality(p_slots) > 8 then
    raise exception 'INVALID_SLOT_COUNT';
  end if;
  select array_agg(distinct v order by v) into v_slots from unnest(p_slots) v;
  if cardinality(v_slots) <> cardinality(p_slots) then raise exception 'DUPLICATE_SLOT'; end if;
  foreach v_slot in array v_slots loop
    v_start := booking_internal.assert_slot(v_slot);
    if p_date = v_now::date and make_time(v_start,0,0) <= v_now::time then
      raise exception 'PAST_SLOT';
    end if;
  end loop;

  -- Remove only genuinely expired pending holds for this date/court/slots.
  delete from public.bookings b
  using booking_internal.hold_slots hs, booking_internal.hold_groups hg
  where b.id=hs.booking_id and hs.hold_id=hg.id and hg.state='pending'
    and hg.expires_at <= now()
    and b.status='pending_hold' and b.booking_date=p_date and b.court=p_court
    and b.time_slot = any(v_slots);

  begin
    v_exp := now() + interval '3 minutes';
    insert into booking_internal.hold_groups(expires_at)
      values(v_exp) returning id,token into v_group_id,v_token;
    foreach v_slot in array v_slots loop
      v_start := booking_internal.assert_slot(v_slot);
      insert into public.bookings(
        booking_date,time_slot,customer_name,phone,email,invoice_no,receipt_no,
        court,require_coach,fee,status,admin_notes
      ) values(
        p_date,v_slot,'Pending payment',null,null,
        'HOLD.'||v_group_id::text,'HOLD.'||v_group_id::text,
        p_court,false,booking_internal.slot_fee(p_date,v_start),'pending_hold',null
      ) returning id into v_booking_id;
      insert into booking_internal.hold_slots(hold_id,booking_id) values(v_group_id,v_booking_id);
    end loop;
  exception when unique_violation then
    return jsonb_build_object('success',false,'error','COLLISION');
  end;
  return jsonb_build_object('success',true,'hold_token',v_token,'expires_at',v_exp,
                            'slots',to_jsonb(v_slots));
end; $function$;

-- public.staging_get_availability
CREATE OR REPLACE FUNCTION public.staging_get_availability(p_date date, p_court text DEFAULT 'Main Court'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  perform booking_internal.assert_booking_window(p_date);
  if p_court <> 'Main Court' then raise exception 'UNKNOWN_COURT'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('slot', b.time_slot) order by b.time_slot), '[]'::jsonb)
    into v_result
    from public.bookings b
    where b.booking_date = p_date and b.court = p_court
      and (b.status = 'confirmed'
       or (b.status = 'pending_hold' and exists (
         select 1 from booking_internal.hold_slots hs
         join booking_internal.hold_groups hg on hg.id=hs.hold_id
         where hs.booking_id=b.id and hg.state='pending' and hg.expires_at > now()
       )));
  return jsonb_build_object('success',true,'busy_slots',v_result);
end; $function$;

-- public.staging_release_hold
CREATE OR REPLACE FUNCTION public.staging_release_hold(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_group booking_internal.hold_groups%rowtype; v_deleted integer;
begin
 if p_token is null then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 select * into v_group from booking_internal.hold_groups where token=p_token for update;
 if not found then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.state='confirmed' then return jsonb_build_object('success',false,'error','ALREADY_CONFIRMED'); end if;
 if v_group.state='released' then return jsonb_build_object('success',true,'released',0); end if;
 delete from public.bookings b where b.status='pending_hold'
   and b.id in (select hs.booking_id from booking_internal.hold_slots hs where hs.hold_id=v_group.id);
 get diagnostics v_deleted = row_count;
 update booking_internal.hold_groups set state='released' where id=v_group.id;
 return jsonb_build_object('success',true,'released',v_deleted);
end; $function$;

-- RPC execution is exclusively for trusted server-side service_role.
revoke all on function public.staging_get_availability(date,text) from public,anon,authenticated;
revoke all on function public.staging_create_hold(date,text[],text) from public,anon,authenticated;
revoke all on function public.staging_confirm_hold(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.staging_release_hold(uuid) from public,anon,authenticated;
grant execute on function public.staging_get_availability(date,text) to service_role;
grant execute on function public.staging_create_hold(date,text[],text) to service_role;
grant execute on function public.staging_confirm_hold(uuid,uuid,text,text,text) to service_role;
grant execute on function public.staging_release_hold(uuid) to service_role;
revoke all on function booking_internal.assert_slot(text) from public,anon,authenticated;
revoke all on function booking_internal.slot_fee(date,integer) from public,anon,authenticated;
revoke all on function booking_internal.assert_booking_window(date) from public,anon,authenticated;
grant execute on all functions in schema booking_internal to service_role;
