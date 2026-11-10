-- Staging only: accept a non-blank single-character customer name.
CREATE OR REPLACE FUNCTION public.staging_confirm_hold_line_v4(p_owner uuid, p_line_user_id text, p_token uuid, p_request_id uuid, p_name text, p_phone text, p_email text, p_car_plate text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb; v_booking_ids uuid[]; v_count integer; v_date date;
        v_slots text[]; v_total numeric; v_event text;
BEGIN
 IF p_owner IS NULL OR p_line_user_id IS NULL OR p_line_user_id !~ '^U[0-9a-fA-F]{32}$'
 THEN RAISE EXCEPTION 'INVALID_LINE_IDENTITY'; END IF;
 -- Mandatory customer contact + vehicle for all new Staging bookings.
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100
   OR p_phone IS NULL OR regexp_replace(p_phone,'[[:space:]()-]','','g') !~ '^[0-9]{9,15}$'
   OR p_email IS NULL OR length(btrim(p_email)) NOT BETWEEN 5 AND 254
   OR btrim(p_email) !~ '^[^ @]+@[^ @]+[.][^ @]+$'
   OR p_car_plate IS NULL OR length(btrim(p_car_plate)) NOT BETWEEN 2 AND 40
   OR btrim(p_car_plate) !~ '^[[:alnum:][:space:]ก-๙-]+$'
 THEN RETURN jsonb_build_object('success',false,'error','INVALID_CUSTOMER'); END IF;
 IF NOT EXISTS (SELECT 1 FROM booking_internal.hold_groups g
   WHERE g.token=p_token AND g.owner_id=p_owner) THEN
   RETURN jsonb_build_object('success',false,'error','INVALID_HOLD');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM booking_internal.hold_groups g
   JOIN booking_internal.hold_slips s ON s.hold_id=g.id
   WHERE g.token=p_token AND g.owner_id=p_owner) THEN
   RETURN jsonb_build_object('success',false,'error','SLIP_REQUIRED');
 END IF;
 v_result := public.staging_confirm_hold_v2(
   p_owner,p_token,p_request_id,p_name,p_phone,p_email
 );
 IF (v_result->>'success') IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
 SELECT array_agg(value::uuid) INTO v_booking_ids
   FROM jsonb_array_elements_text(v_result->'booking_ids');
 IF v_booking_ids IS NULL OR cardinality(v_booking_ids) < 1
 THEN RAISE EXCEPTION 'EMPTY_CONFIRM_RESULT'; END IF;
 UPDATE public.bookings b
   SET line_user_id=p_line_user_id, car_plate=btrim(p_car_plate),
       payment_status=CASE WHEN b.payment_status='unpaid' THEN 'pending_verification' ELSE b.payment_status END
   WHERE b.id=ANY(v_booking_ids) AND b.status='confirmed'
   AND (b.line_user_id IS NULL OR b.line_user_id=p_line_user_id)
   AND (b.car_plate IS NULL OR b.car_plate=btrim(p_car_plate));
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count <> cardinality(v_booking_ids)
 THEN RAISE EXCEPTION 'LINE_IDENTITY_CONFLICT'; END IF;
 SELECT min(b.booking_date),array_agg(b.time_slot ORDER BY b.time_slot),sum(b.fee)
   INTO v_date,v_slots,v_total
   FROM public.bookings b WHERE b.id=ANY(v_booking_ids);
 v_event := 'booking_confirmed:'||p_token::text;
 INSERT INTO booking_internal.line_notification_outbox(
   event_key,line_user_id,booking_ids,payload
 ) VALUES(
   v_event,p_line_user_id,v_booking_ids,
   jsonb_build_object('kind','booking_confirmed','invoice_no',v_result->>'invoice_no',
     'booking_date',v_date,'slots',to_jsonb(v_slots),'amount',v_total,
     'booking_status','confirmed','payment_status','pending_verification')
 )
 ON CONFLICT(event_key) DO NOTHING;
 RETURN v_result || jsonb_build_object('line_notification','queued','payment_verified',false);
END; $function$;

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
 v_clean_phone text;
 v_clean_email text;
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
 v_clean_phone := nullif(regexp_replace(coalesce(p_phone,''),'[[:space:]()-]','','g'),'');
 v_clean_email := nullif(btrim(coalesce(p_email,'')),'');
 if p_name is null or length(btrim(p_name)) < 1 or length(p_name)>100
    or (v_clean_phone is not null and v_clean_phone !~ '^[0-9]{9,15}$')
    or (v_clean_email is not null and
        (length(v_clean_email)>254 or v_clean_email !~ '^[^ @]+@[^ @]+[.][^ @]+$'))
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
 v_receipt := 'UNPAID.'||v_month||lpad(v_number::text,3,'0');

 for v_row in
    select b.* from booking_internal.hold_slots hs
    join public.bookings b on b.id=hs.booking_id
    where hs.hold_id=v_group.id order by b.time_slot for update of b
 loop
    if v_row.status <> 'pending_hold' then raise exception 'HOLD_INCONSISTENT'; end if;
    v_fee := booking_internal.slot_fee(v_row.booking_date,booking_internal.assert_slot(v_row.time_slot));
    update public.bookings set status='confirmed',customer_name=btrim(p_name),
       phone=v_clean_phone,email=v_clean_email,fee=v_fee,invoice_no=v_invoice,receipt_no=v_receipt
      where id=v_row.id;
    -- Financial income is recorded ONLY after admin-verified payment, not on booking.
    v_ids := array_append(v_ids,v_row.id);
 end loop;
 v_result := jsonb_build_object('success',true,'booking_ids',to_jsonb(v_ids),
                                'invoice_no',v_invoice,'receipt_no',null,'payment_verified',false);
 update booking_internal.hold_groups set state='confirmed',
   confirm_request_id=p_request_id,result=v_result where id=v_group.id;
 return v_result;
end; $function$;
