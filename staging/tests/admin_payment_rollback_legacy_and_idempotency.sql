BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE v_legacy uuid; v_new uuid; v_admin uuid := '00000000-0000-4000-8000-000000000001'; v jsonb; v2 jsonb; old_tx int; new_tx int;
BEGIN
 SELECT b.id INTO v_legacy FROM public.bookings b WHERE b.status='confirmed'
 AND b.payment_status='unpaid' AND EXISTS(SELECT 1 FROM public.transactions t WHERE t.booking_id=b.id AND t.type='income') ORDER BY b.created_at LIMIT 1;
 IF v_legacy IS NULL THEN RAISE EXCEPTION 'NO_LEGACY_TEST_BOOKING'; END IF;
 SELECT count(*) INTO old_tx FROM public.transactions WHERE booking_id=v_legacy;
 v:=public.staging_verify_booking_payment(v_legacy,v_admin,'ROLLBACK_LEGACY');
 IF v->>'error'<>'EXISTING_REVENUE_REQUIRES_RECONCILIATION' THEN RAISE EXCEPTION 'LEGACY_GUARD_FAILURE %',v; END IF;
 IF (SELECT payment_status FROM public.bookings WHERE id=v_legacy)<>'unpaid'
   OR (SELECT count(*) FROM public.transactions WHERE booking_id=v_legacy)<>old_tx
   THEN RAISE EXCEPTION 'LEGACY_STATE_MUTATED'; END IF;

 SELECT b.id INTO v_new FROM public.bookings b WHERE b.status='confirmed'
 AND b.payment_status='pending_verification' AND b.slip_url IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.transactions t WHERE t.booking_id=b.id AND t.type='income')
 ORDER BY b.created_at DESC LIMIT 1;
 IF v_new IS NULL THEN RAISE EXCEPTION 'NO_NEW_TEST_BOOKING'; END IF;
 SELECT count(*) INTO new_tx FROM public.transactions WHERE booking_id=v_new;
 v:=public.staging_verify_booking_payment(v_new,v_admin,'ROLLBACK_OK');
 IF v->>'success'<>'true' OR (SELECT payment_status FROM public.bookings WHERE id=v_new)<>'paid' THEN RAISE EXCEPTION 'NEW_VERIFICATION_FAILED %',v; END IF;
 IF (SELECT count(*) FROM public.transactions WHERE booking_id=v_new)<>new_tx+1 THEN RAISE EXCEPTION 'INCOME_NOT_RECORDED_ONCE'; END IF;
 v2:=public.staging_verify_booking_payment(v_new,v_admin,'ROLLBACK_REPEAT');
 IF v2->>'already_paid'<>'true' THEN RAISE EXCEPTION 'RETRY_NOT_IDEMPOTENT %',v2; END IF;
 IF (SELECT count(*) FROM public.transactions WHERE booking_id=v_new)<>new_tx+1 THEN RAISE EXCEPTION 'RETRY_DUPLICATED_INCOME'; END IF;
END $$;
ROLLBACK;