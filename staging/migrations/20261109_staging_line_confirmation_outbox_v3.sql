-- STAGING ONLY: retain confirmed bookings even while SCB payment verification is pending.
-- Notification outbox is written atomically with booking confirmation, not with payment verification.
CREATE TABLE booking_internal.line_notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_key text NOT NULL UNIQUE,
 line_user_id text NOT NULL CHECK(line_user_id ~ '^U[0-9a-fA-F]{32}$'),
 booking_ids uuid[] NOT NULL CHECK(cardinality(booking_ids) > 0),
 payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 last_error_code text
);
CREATE INDEX line_outbox_pending_idx ON booking_internal.line_notification_outbox(created_at)
 WHERE state IN ('pending','failed');
REVOKE ALL ON booking_internal.line_notification_outbox FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON booking_internal.line_notification_outbox TO service_role;

-- Source of line_user_id is server-verified LINE token, NEVER client submitted LINE user ID.
CREATE OR REPLACE FUNCTION public.staging_confirm_hold_line_v3(
 p_owner uuid,p_line_user_id text,p_token uuid,p_request_id uuid,
 p_name text,p_phone text,p_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
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
   SET line_user_id=p_line_user_id
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
END; $$;
REVOKE ALL ON FUNCTION public.staging_confirm_hold_line_v3(uuid,text,uuid,uuid,text,text,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_confirm_hold_line_v3(uuid,text,uuid,uuid,text,text,text)
 TO service_role;

-- Ensure backend cannot bypass the LINE notification outbox on the original V2 confirmation.
REVOKE EXECUTE ON FUNCTION public.staging_confirm_hold_v2(uuid,uuid,uuid,text,text,text)
 FROM service_role;
