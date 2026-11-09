-- STAGING-ONLY rollback-safe test of verified LINE identity persistence and atomic message outbox.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE d date:=((now() at time zone 'Asia/Bangkok')::date+5);
 owner uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid();
 line_id text:='U1234567890abcdef1234567890abcdef';
 h jsonb;c jsonb;retry jsonb;foreign_response jsonb;n integer;saved_line text;
BEGIN
 h:=public.staging_create_hold_v2(owner,d,ARRAY['09:00 - 10:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'Hold failed: %',h;END IF;
 IF (public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,
   'staging/test/'||(h->>'hold_token')||'.png',repeat('a',64))->>'success')<>'true'
   THEN RAISE EXCEPTION 'synthetic slip registration failed'; END IF;
 c:=public.staging_confirm_hold_line_v3(owner,line_id,(h->>'hold_token')::uuid,request_id,'Synthetic LINE','0812345678',null);
 IF c->>'success'<>'true' OR c->>'line_notification'<>'queued' OR c->>'payment_verified'<>'false'
 THEN RAISE EXCEPTION 'Confirmed booking or notification not queued: %',c;END IF;
 SELECT count(*) INTO n FROM booking_internal.line_notification_outbox WHERE event_key='booking_confirmed:'||(h->>'hold_token');
 IF n<>1 THEN RAISE EXCEPTION 'Expected one outbox message';END IF;
 SELECT line_user_id INTO saved_line FROM public.bookings WHERE id=(c->'booking_ids'->>0)::uuid;
 IF saved_line<>line_id THEN RAISE EXCEPTION 'LINE ID not persisted';END IF;
 retry:=public.staging_confirm_hold_line_v3(owner,line_id,(h->>'hold_token')::uuid,request_id,'Synthetic LINE','0812345678',null);
 IF retry->>'success'<>'true' THEN RAISE EXCEPTION 'Retry rejected';END IF;
 SELECT count(*) INTO n FROM booking_internal.line_notification_outbox WHERE event_key='booking_confirmed:'||(h->>'hold_token');
 IF n<>1 THEN RAISE EXCEPTION 'Duplicate outbox created';END IF;
 SELECT count(*) INTO n FROM public.transactions WHERE booking_id=(c->'booking_ids'->>0)::uuid;
 IF n<>0 THEN RAISE EXCEPTION 'Created paid transaction without SCB verification';END IF;
 foreign_response:=public.staging_confirm_hold_line_v3(gen_random_uuid(),line_id,(h->>'hold_token')::uuid,request_id,'Synthetic LINE','0812345678',null);
 IF foreign_response->>'error'<>'INVALID_HOLD' THEN RAISE EXCEPTION 'Foreign owner accepted';END IF;
END $$;
ROLLBACK;