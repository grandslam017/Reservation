-- STAGING ONLY: confirmed reservation and pending bank verification are independent.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
 CHECK(payment_status IN ('unpaid','pending_verification','paid','disputed','refunded'));
CREATE OR REPLACE FUNCTION public.staging_confirm_hold_line_v3(p_owner uuid, p_line_user_id text, p_token uuid, p_request_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb; v_booking_ids uuid[]; v_count integer; v_date date;
        v_slots text[]; v_total numeric; v_event text;
BEGIN
 IF p_owner IS NULL OR p_line_user_id IS NULL OR p_line_user_id !~ '^U[0-9a-fA-F]{32}$'
 THEN RAISE EXCEPTION 'INVALID_LINE_IDENTITY'; END IF;
 v_result := public.staging_confirm_hold_v2(
   p_owner,p_token,p_request_id,p_name,p_phone,p_email
 );
 IF (v_result->>'success') IS DISTINCT FROM 'true' THEN RETURN v_result; END IF;
 SELECT array_agg(value::uuid) INTO v_booking_ids
   FROM jsonb_array_elements_text(v_result->'booking_ids');
 IF v_booking_ids IS NULL OR cardinality(v_booking_ids) < 1
 THEN RAISE EXCEPTION 'EMPTY_CONFIRM_RESULT'; END IF;
 UPDATE public.bookings b
   SET line_user_id=p_line_user_id,
       payment_status=CASE WHEN b.payment_status='unpaid' THEN 'pending_verification' ELSE b.payment_status END
   WHERE b.id=ANY(v_booking_ids) AND b.status='confirmed'
   AND (b.line_user_id IS NULL OR b.line_user_id=p_line_user_id);
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
CREATE OR REPLACE FUNCTION public.staging_verify_booking_payment(p_booking_id uuid, p_admin_id uuid, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v public.bookings%rowtype; v_receipt text; v_tx uuid;
BEGIN
 IF p_admin_id IS NULL OR p_booking_id IS NULL THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 IF v.status <> 'confirmed' THEN RETURN jsonb_build_object('success',false,'error','NOT_CONFIRMED'); END IF;
 IF v.payment_status='paid' THEN RETURN jsonb_build_object('success',true,'already_paid',true,'receipt_no',v.receipt_no); END IF;
 IF v.payment_status NOT IN ('unpaid','pending_verification') THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_STATE_INVALID'); END IF;
 IF p_reference IS NOT NULL AND length(p_reference)>100 THEN RAISE EXCEPTION 'INVALID_REFERENCE'; END IF;
 v_receipt := replace(v.invoice_no,'INV.','R.');
 UPDATE public.bookings
   SET payment_status='paid',payment_verified_at=now(),receipt_no=v_receipt
   WHERE id=p_booking_id;
 INSERT INTO public.transactions(transaction_date,type,category,amount,description,booking_id)
   VALUES(v.booking_date,'income','Court Rental',v.fee,
          'Verified payment by admin '||p_admin_id::text||' '||coalesce(p_reference,''),v.id)
   RETURNING id INTO v_tx;
 RETURN jsonb_build_object('success',true,'receipt_no',v_receipt,'transaction_id',v_tx,'amount',v.fee);
END; $function$;
REVOKE ALL ON FUNCTION public.staging_confirm_hold_line_v3(uuid,text,uuid,uuid,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_confirm_hold_line_v3(uuid,text,uuid,uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.staging_verify_booking_payment(uuid,uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_verify_booking_payment(uuid,uuid,text) TO service_role;
