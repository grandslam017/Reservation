CREATE TABLE booking_internal.hold_slips (
 hold_id uuid PRIMARY KEY REFERENCES booking_internal.hold_groups(id),
 storage_path text NOT NULL UNIQUE CHECK(storage_path LIKE 'staging/%'),
 image_hash text NOT NULL CHECK(image_hash ~ '^[0-9a-f]{64}$'),
 uploaded_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON booking_internal.hold_slips FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON booking_internal.hold_slips TO service_role;

CREATE OR REPLACE FUNCTION public.staging_register_hold_slip(
 p_owner uuid,p_token uuid,p_path text,p_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v booking_internal.hold_groups%rowtype;
BEGIN
 IF p_owner IS NULL OR p_token IS NULL OR p_path IS NULL OR p_path NOT LIKE 'staging/%'
 OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'INVALID_SLIP_METADATA'; END IF;
 SELECT * INTO v FROM booking_internal.hold_groups WHERE token=p_token FOR UPDATE;
 IF NOT FOUND OR v.owner_id IS DISTINCT FROM p_owner OR v.state<>'pending'
 OR v.expires_at<=now() THEN
 RETURN jsonb_build_object('success',false,'error','INVALID_OR_EXPIRED_HOLD'); END IF;
 INSERT INTO booking_internal.hold_slips(hold_id,storage_path,image_hash)
 VALUES(v.id,p_path,p_hash)
 ON CONFLICT(hold_id) DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','SLIP_ALREADY_ATTACHED'); END IF;
 UPDATE public.bookings b SET slip_url=p_path
 WHERE b.status='pending_hold'
 AND b.id IN (SELECT booking_id FROM booking_internal.hold_slots WHERE hold_id=v.id);
 RETURN jsonb_build_object('success',true,'attached',true);
END; $$;
REVOKE ALL ON FUNCTION public.staging_register_hold_slip(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_register_hold_slip(uuid,uuid,text,text) TO service_role;
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
REVOKE ALL ON FUNCTION public.staging_confirm_hold_line_v3(uuid,text,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_confirm_hold_line_v3(uuid,text,uuid,uuid,text,text,text) TO service_role;
