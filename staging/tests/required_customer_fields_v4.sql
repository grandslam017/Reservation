BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  d date:=((now() AT TIME ZONE 'Asia/Bangkok')::date+7);
  owner uuid:=gen_random_uuid(); h jsonb; attach jsonb; result jsonb; b_id uuid;
BEGIN
  h:=public.staging_create_hold_v2(owner,d,ARRAY['12:00 - 13:00'],'Main Court');
  IF h->>'success'<>'true' THEN RAISE EXCEPTION 'HOLD_FAILED %',h; END IF;
  attach:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,
    'staging/required-fields-good.png',repeat('a',64));
  IF attach->>'success'<>'true' THEN RAISE EXCEPTION 'ATTACH_FAILED %',attach; END IF;
  result:=public.staging_confirm_hold_line_v4(owner,'U1234567890abcdef1234567890abcdef',
    (h->>'hold_token')::uuid,gen_random_uuid(),'Test Customer','081-234-5678',
    'sample@example.com','กก 1234');
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'VALID_CUSTOMER_REJECTED %',result; END IF;
  b_id:=(result->'booking_ids'->>0)::uuid;
  IF (SELECT customer_name<>'Test Customer' OR phone<>'0812345678'
    OR email<>'sample@example.com' OR car_plate<>'กก 1234'
    OR payment_status<>'pending_verification'
    FROM public.bookings WHERE id=b_id)
  THEN RAISE EXCEPTION 'REQUIRED_FIELD_PERSISTENCE_FAILED'; END IF;
END $$;
DO $$
DECLARE
 d date:=((now() AT TIME ZONE 'Asia/Bangkok')::date+8);
 owner uuid:=gen_random_uuid();h jsonb;attached jsonb;r jsonb;bad text;
BEGIN
 h:=public.staging_create_hold_v2(owner,d,ARRAY['12:00 - 13:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'HOLD_FAILED %',h; END IF;
 attached:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,
   'staging/required-fields-reject.png',repeat('b',64));
 IF attached->>'success'<>'true' THEN RAISE EXCEPTION 'ATTACH_FAILED %',attached; END IF;
 FOREACH bad IN ARRAY ARRAY['name','phone','email','plate'] LOOP
  r:=public.staging_confirm_hold_line_v4(owner,'U1234567890abcdef1234567890abcdef',
    (h->>'hold_token')::uuid,gen_random_uuid(),
    CASE WHEN bad='name' THEN '' ELSE 'Test Customer' END,
    CASE WHEN bad='phone' THEN '' ELSE '0812345678' END,
    CASE WHEN bad='email' THEN '' ELSE 'sample@example.com' END,
    CASE WHEN bad='plate' THEN '' ELSE 'กก 1234' END);
  IF r->>'error'<>'INVALID_CUSTOMER' THEN RAISE EXCEPTION 'MISSING_FIELD_ACCEPTED % %',bad,r; END IF;
 END LOOP;
 IF (SELECT state FROM booking_internal.hold_groups WHERE token=(h->>'hold_token')::uuid)<>'pending'
 THEN RAISE EXCEPTION 'INVALID_CUSTOMER_CONSUMED_HOLD'; END IF;
END $$;
ROLLBACK;