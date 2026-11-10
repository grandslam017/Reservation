-- STAGING ONLY: preview the effect of a payment verification, without any write.
-- This is a projection, NOT proof of a transfer or SCB bank balance.
CREATE OR REPLACE FUNCTION public.staging_simulate_booking_payment_verification(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $fn$
DECLARE v public.bookings%rowtype; pre jsonb; ready boolean;
BEGIN
 IF p_booking_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','INVALID_BOOKING_ID'); END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 pre:=public.staging_preview_booking_payment_verification(p_booking_id);
 ready:=COALESCE((pre->>'eligible_for_manual_review')::boolean,false);
 IF v.invoice_no IS NULL OR v.invoice_no NOT LIKE 'INV.%' THEN
   ready:=false;
   pre:=jsonb_set(pre,'{blocker}',to_jsonb('INVALID_INVOICE'::text));
 END IF;
 RETURN jsonb_build_object(
   'success',true,'environment','staging','is_simulation',true,
   'writes_performed',false,'actual_bank_credit_verified',false,
   'booking_id',v.id,'current_payment_status',v.payment_status,
   'would_change_payment_status_to',CASE WHEN ready THEN 'paid' ELSE NULL END,
   'would_create_receipt_no',CASE WHEN ready THEN replace(v.invoice_no,'INV.','R.') ELSE NULL END,
   'would_record_income_thb',CASE WHEN ready THEN v.fee ELSE 0 END,
   'would_create_income_transaction',ready,
   'eligible_for_manual_review',ready,'blocker',pre->>'blocker',
   'requires_actual_bank_confirmation',true);
END; $fn$;
REVOKE ALL ON FUNCTION public.staging_simulate_booking_payment_verification(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_simulate_booking_payment_verification(uuid) TO service_role;