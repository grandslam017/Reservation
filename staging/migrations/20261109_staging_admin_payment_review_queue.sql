-- STAGING ONLY, private review queue and non-destructive payment dispute control.
CREATE TABLE IF NOT EXISTS booking_internal.payment_review_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL REFERENCES public.bookings(id),
 admin_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('dispute','note')),
 note text,
 at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON booking_internal.payment_review_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON booking_internal.payment_review_audit TO service_role;

CREATE OR REPLACE FUNCTION public.staging_admin_pending_review()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v FROM (
  SELECT b.id AS booking_id,b.booking_date,b.time_slot,b.court,b.customer_name,
   b.phone,b.invoice_no,b.fee,b.payment_status,b.slip_url AS slip_path
  FROM public.bookings b
  WHERE b.status='confirmed' AND b.payment_status IN ('unpaid','pending_verification','disputed')
  ORDER BY b.booking_date,b.time_slot LIMIT 100
 ) x;
 RETURN jsonb_build_object('success',true,'review_queue',v);
END; $$;
REVOKE ALL ON FUNCTION public.staging_admin_pending_review() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_admin_pending_review() TO service_role;

CREATE OR REPLACE FUNCTION public.staging_flag_unpaid_booking(
 p_admin uuid,p_booking_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v public.bookings%rowtype;
BEGIN
 IF p_admin IS NULL OR p_booking_id IS NULL OR length(coalesce(p_note,''))>250
 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTION'; END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 IF v.status<>'confirmed' THEN RETURN jsonb_build_object('success',false,'error','NOT_CONFIRMED'); END IF;
 IF v.payment_status='paid' THEN RETURN jsonb_build_object('success',false,'error','ALREADY_PAID'); END IF;
 IF v.payment_status='disputed' THEN
  RETURN jsonb_build_object('success',true,'already_disputed',true); END IF;
 UPDATE public.bookings SET payment_status='disputed' WHERE id=p_booking_id;
 INSERT INTO booking_internal.payment_review_audit(booking_id,admin_id,action,note)
 VALUES(p_booking_id,p_admin,'dispute',p_note);
 RETURN jsonb_build_object('success',true,'booking_status','confirmed','payment_status','disputed');
END;$$;
REVOKE ALL ON FUNCTION public.staging_flag_unpaid_booking(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_flag_unpaid_booking(uuid,uuid,text) TO service_role;
