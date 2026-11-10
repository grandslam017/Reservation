-- STAGING ONLY. Read-only preflight; NEVER confirms payment or records revenue.
CREATE OR REPLACE FUNCTION public.staging_preview_booking_payment_verification(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO ''
AS $fn$
DECLARE v public.bookings%rowtype; v_income int; v_slip boolean; v_issue text;
BEGIN
 IF p_booking_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','INVALID_BOOKING_ID'); END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 SELECT count(*) INTO v_income FROM public.transactions t
 WHERE t.booking_id=v.id AND t.type='income';
 SELECT EXISTS(SELECT 1 FROM storage.objects o
 WHERE o.bucket_id='grandslam-staging-slips'
 AND o.name=v.slip_url AND v.slip_url LIKE 'staging/%') INTO v_slip;
 v_issue:= CASE
  WHEN v.status<>'confirmed' THEN 'BOOKING_NOT_CONFIRMED'
  WHEN v.payment_status='paid' THEN 'ALREADY_PAID'
  WHEN v.payment_status NOT IN ('pending_verification','unpaid','disputed') THEN 'PAYMENT_STATE_INVALID'
  WHEN NOT v_slip THEN 'SLIP_MISSING'
  WHEN v_income>0 THEN 'EXISTING_REVENUE_REQUIRES_RECONCILIATION'
  ELSE NULL END;
 RETURN jsonb_build_object('success',true,
  'booking_id',v.id,'payment_status',v.payment_status,
  'slip_exists',v_slip,'income_transactions',v_income,
  'eligible_for_manual_review',v_issue IS NULL,'blocker',v_issue,
  'requires_actual_bank_confirmation',true,
  'is_simulation',true);
END; $fn$;
REVOKE ALL ON FUNCTION public.staging_preview_booking_payment_verification(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_preview_booking_payment_verification(uuid) TO service_role;