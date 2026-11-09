-- Staging-only V2 regression suite; no data persists.
BEGIN;
DO $$
DECLARE
  d date := date '2026-11-10';
  actor uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  admin uuid := gen_random_uuid();
  hold_data jsonb; result jsonb; paid jsonb; again jsonb;
  book_id uuid; n integer; amt numeric;
BEGIN
  hold_data:=public.staging_create_hold_v2(actor,d,ARRAY['12:00 - 13:00'],'Main Court');
  IF hold_data->>'success' <> 'true' THEN RAISE EXCEPTION 'hold failed: %', hold_data; END IF;
  result:=public.staging_confirm_hold_v2(stranger,(hold_data->>'hold_token')::uuid,gen_random_uuid(),'Staging Test','0812345678',null);
  IF result->>'error'<>'INVALID_HOLD' THEN RAISE EXCEPTION 'foreign confirmation succeeded'; END IF;
  result:=public.staging_release_hold_v2(stranger,(hold_data->>'hold_token')::uuid);
  IF result->>'error'<>'INVALID_HOLD' THEN RAISE EXCEPTION 'foreign release succeeded'; END IF;
  result:=public.staging_confirm_hold_v2(actor,(hold_data->>'hold_token')::uuid,gen_random_uuid(),'Staging Test','0812345678',null);
  IF result->>'success'<>'true' OR result->>'payment_verified'<>'false' THEN RAISE EXCEPTION 'confirmation failed: %',result; END IF;
  book_id:=(result->'booking_ids'->>0)::uuid;
  SELECT fee INTO amt FROM public.bookings WHERE id=book_id;
  IF amt<>99 THEN RAISE EXCEPTION 'weekday promo price incorrect: %',amt; END IF;
  SELECT count(*) INTO n FROM public.transactions WHERE booking_id=book_id;
  IF n<>0 THEN RAISE EXCEPTION 'unpaid booking has income'; END IF;
  paid:=public.staging_verify_booking_payment(book_id,admin,'STAGING-MOCK');
  IF paid->>'success'<>'true' OR (paid->>'amount')::numeric<>99 THEN RAISE EXCEPTION 'payment verification failed: %',paid; END IF;
  again:=public.staging_verify_booking_payment(book_id,admin,'STAGING-MOCK');
  IF again->>'already_paid'<>'true' THEN RAISE EXCEPTION 'duplicate payment not idempotent'; END IF;
  SELECT count(*) INTO n FROM public.transactions WHERE booking_id=book_id;
  IF n<>1 THEN RAISE EXCEPTION 'financial duplication'; END IF;
  result:=public.staging_check_rate_limit(actor,'verify-payment',1);
  IF result->>'allowed'<>'true' THEN RAISE EXCEPTION 'rate first request blocked'; END IF;
  result:=public.staging_check_rate_limit(actor,'verify-payment',1);
  IF result->>'allowed'<>'false' THEN RAISE EXCEPTION 'rate exceeded not blocked'; END IF;
END $$;
ROLLBACK;