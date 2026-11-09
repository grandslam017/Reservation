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
 IF v.payment_status NOT IN ('unpaid','pending_verification','disputed') THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_STATE_INVALID'); END IF;
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