BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  d date:=((now() AT TIME ZONE 'Asia/Bangkok')::date+7);
  owner uuid:=gen_random_uuid();h jsonb;receipt jsonb;r jsonb;bid uuid;
BEGIN
  h:=public.staging_create_hold_v2(owner,d,ARRAY['15:00 - 16:00'],'Main Court');
  IF h->>'success'<>'true' THEN RAISE EXCEPTION 'HOLD_FAILED %',h;END IF;
  receipt:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,'staging/single-name-test.png',repeat('c',64));
  IF receipt->>'success'<>'true' THEN RAISE EXCEPTION 'SLIP_FAILED %',receipt;END IF;
  r:=public.staging_confirm_hold_line_v4(owner,'U1234567890abcdef1234567890abcdef',
   (h->>'hold_token')::uuid,gen_random_uuid(),'A','0812345678','sample@example.com','5245');
  IF r->>'success'<>'true' THEN RAISE EXCEPTION 'SINGLE_LETTER_NAME_REJECTED %',r;END IF;
  bid:=(r->'booking_ids'->>0)::uuid;
  IF (SELECT customer_name<>'A' OR car_plate<>'5245' OR phone<>'0812345678'
      OR email<>'sample@example.com' OR payment_status<>'pending_verification'
     FROM public.bookings WHERE id=bid)
  THEN RAISE EXCEPTION 'PERSISTED_CUSTOMER_DATA_MISMATCH';END IF;
END $$;
DO $$
DECLARE
 d date:=((now() AT TIME ZONE 'Asia/Bangkok')::date+8);
 owner uuid:=gen_random_uuid();h jsonb;a jsonb;r jsonb;
BEGIN
 h:=public.staging_create_hold_v2(owner,d,ARRAY['15:00 - 16:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'HOLD_FAILED %',h;END IF;
 a:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,'staging/empty-name-test.png',repeat('d',64));
 IF a->>'success'<>'true' THEN RAISE EXCEPTION 'SLIP_FAILED %',a;END IF;
 r:=public.staging_confirm_hold_line_v4(owner,'U1234567890abcdef1234567890abcdef',
    (h->>'hold_token')::uuid,gen_random_uuid(),' ','0812345678','sample@example.com','5245');
 IF r->>'error'<>'INVALID_CUSTOMER' THEN RAISE EXCEPTION 'BLANK_NAME_ACCEPTED %',r;END IF;
END $$;
ROLLBACK;