BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 d date:=((now() AT TIME ZONE 'Asia/Bangkok')::date+9);
 owner uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
 h jsonb; s jsonb; first_result jsonb; retry_result jsonb; changed_result jsonb;
 booking_id uuid; request_id uuid:=gen_random_uuid(); line_id text:='U1234567890abcdef1234567890abcdef';
 count_outbox integer;
BEGIN
 h:=public.staging_create_hold_v2(owner,d,ARRAY['11:00 - 12:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'HOLD_FAILED %',h;END IF;
 token:=(h->>'hold_token')::uuid;
 s:=public.staging_register_hold_slip(owner,token,'staging/retry-case.png',repeat('a',64));
 IF s->>'success'<>'true' THEN RAISE EXCEPTION 'SLIP_FAILED %',s;END IF;
 first_result:=public.staging_confirm_hold_line_v4(owner,line_id,token,request_id,
 'Test Customer','0812345678','test@example.com','กก 1234');
 IF first_result->>'success'<>'true' THEN RAISE EXCEPTION 'FIRST_CONFIRM_FAILED %',first_result;END IF;
 booking_id:=(first_result->'booking_ids'->>0)::uuid;
 retry_result:=public.staging_confirm_hold_line_v4(owner,line_id,token,request_id,
 'Test Customer','0812345678','test@example.com','กก 1234');
 IF retry_result->>'success'<>'true' THEN RAISE EXCEPTION 'SAME_RETRY_FAILED %',retry_result;END IF;
 BEGIN
   changed_result:=public.staging_confirm_hold_line_v4(owner,line_id,token,request_id,
     'Test Customer','0812345678','test@example.com','ขข 4321');
   RAISE EXCEPTION 'DIFFERENT_PLATE_ACCEPTED %',changed_result;
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM LIKE 'DIFFERENT_PLATE_ACCEPTED%' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE 'LINE_IDENTITY_CONFLICT%' THEN RAISE EXCEPTION 'UNEXPECTED_RETRY_ERROR %',SQLERRM; END IF;
 END;
 IF (SELECT car_plate FROM public.bookings WHERE id=booking_id)<>'กก 1234'
 THEN RAISE EXCEPTION 'PLATE_MUTATED';END IF;
 SELECT count(*) INTO count_outbox FROM booking_internal.line_notification_outbox
 WHERE event_key='booking_confirmed:'||token::text;
 IF count_outbox<>1 THEN RAISE EXCEPTION 'OUTBOX_NOT_IDEMPOTENT %',count_outbox;END IF;
END $$;
ROLLBACK;