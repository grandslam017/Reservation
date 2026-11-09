-- STAGING ONLY. V2 owners and rate-limits; not reviewed for production.
ALTER TABLE booking_internal.hold_groups ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS hold_groups_owner_idx ON booking_internal.hold_groups(owner_id,expires_at);
CREATE TABLE IF NOT EXISTS booking_internal.api_rate_limits (
 actor_id uuid NOT NULL,
 action text NOT NULL,
 window_start timestamptz NOT NULL,
 used integer NOT NULL DEFAULT 1 CHECK(used >= 1),
 PRIMARY KEY(actor_id,action,window_start)
);
REVOKE ALL ON booking_internal.api_rate_limits FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON booking_internal.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.staging_check_rate_limit(p_actor uuid,p_action text,p_limit integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_count integer; v_window timestamptz := date_trunc('minute',now());
BEGIN
 IF p_actor IS NULL OR p_action NOT IN ('availability','create','confirm','release')
    OR p_limit<1 OR p_limit>120 THEN RAISE EXCEPTION 'INVALID_RATE_LIMIT'; END IF;
 INSERT INTO booking_internal.api_rate_limits(actor_id,action,window_start,used)
 VALUES(p_actor,p_action,v_window,1)
 ON CONFLICT(actor_id,action,window_start) DO UPDATE
 SET used=booking_internal.api_rate_limits.used+1
 WHERE booking_internal.api_rate_limits.used < p_limit
 RETURNING used INTO v_count;
 IF v_count IS NULL THEN RETURN jsonb_build_object('allowed',false); END IF;
 RETURN jsonb_build_object('allowed',true,'remaining',p_limit-v_count);
END; $$;
REVOKE ALL ON FUNCTION public.staging_check_rate_limit(uuid,text,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_check_rate_limit(uuid,text,integer) TO service_role;


CREATE OR REPLACE FUNCTION public.staging_create_hold_v2(p_owner uuid, p_date date, p_slots text[], p_court text DEFAULT 'Main Court'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid; v_token uuid; v_exp timestamptz;
  v_slot text; v_start integer; v_now timestamp := (now() at time zone 'Asia/Bangkok');
  v_slots text[]; v_booking_id uuid;
begin
  if p_owner is null then raise exception 'MISSING_OWNER'; end if;
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
    insert into booking_internal.hold_groups(expires_at,owner_id)
      values(v_exp,p_owner) returning id,token into v_group_id,v_token;
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.staging_confirm_hold_v2(p_owner uuid, p_token uuid, p_request_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text)
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
 if p_owner is null then raise exception 'MISSING_OWNER'; end if;
 if p_token is null or p_request_id is null then raise exception 'MISSING_TOKEN_OR_IDEMPOTENCY_KEY'; end if;
 select * into v_group from booking_internal.hold_groups where token=p_token for update;
 if not found then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.owner_id IS DISTINCT FROM p_owner then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.staging_release_hold_v2(p_owner uuid,p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_group booking_internal.hold_groups%rowtype; v_deleted integer;
begin
 if p_owner is null then raise exception 'MISSING_OWNER'; end if;
 if p_token is null then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 select * into v_group from booking_internal.hold_groups where token=p_token for update;
 if not found then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.owner_id IS DISTINCT FROM p_owner then return jsonb_build_object('success',false,'error','INVALID_HOLD'); end if;
 if v_group.state='confirmed' then return jsonb_build_object('success',false,'error','ALREADY_CONFIRMED'); end if;
 if v_group.state='released' then return jsonb_build_object('success',true,'released',0); end if;
 delete from public.bookings b where b.status='pending_hold'
   and b.id in (select hs.booking_id from booking_internal.hold_slots hs where hs.hold_id=v_group.id);
 get diagnostics v_deleted = row_count;
 update booking_internal.hold_groups set state='released' where id=v_group.id;
 return jsonb_build_object('success',true,'released',v_deleted);
end; $function$
;


REVOKE ALL ON FUNCTION public.staging_create_hold_v2(uuid,date,text[],text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.staging_confirm_hold_v2(uuid,uuid,uuid,text,text,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.staging_release_hold_v2(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_create_hold_v2(uuid,date,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staging_confirm_hold_v2(uuid,uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.staging_release_hold_v2(uuid,uuid) TO service_role;
-- Remove service_role API use of the earlier unaffiliated V1 functions; retained for staging history.
REVOKE EXECUTE ON FUNCTION public.staging_create_hold(date,text[],text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.staging_confirm_hold(uuid,uuid,text,text,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.staging_release_hold(uuid) FROM service_role;
