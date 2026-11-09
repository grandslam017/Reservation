BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE d date:=((now() at time zone 'Asia/Bangkok')::date+6);
 owner uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
 h jsonb; c jsonb; pay jsonb; bid uuid; state text; n integer;
BEGIN
 h:=public.staging_create_hold_v2(owner,d,ARRAY['11:00 - 12:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'hold failed: %',h; END IF;
 c:=public.staging_confirm_hold_line_v3(owner,'U1234567890abcdef1234567890abcdef',
   (h->>'hold_token')::uuid,req,'Synthetic Customer','0812345678',NULL);
 IF c->>'success'<>'true' THEN RAISE EXCEPTION 'booking confirmation failed: %',c; END IF;
 bid:=(c->'booking_ids'->>0)::uuid;
 SELECT payment_status INTO state FROM public.bookings WHERE id=bid;
 IF state<>'pending_verification' THEN RAISE EXCEPTION 'wrong payment status: %',state; END IF;
 SELECT count(*) INTO n FROM public.transactions WHERE booking_id=bid;
 IF n<>0 THEN RAISE EXCEPTION 'income booked without SCB confirmation'; END IF;
 pay:=public.staging_verify_booking_payment(bid,gen_random_uuid(),'FAKE-TRANSFER-TEST');
 IF pay->>'success'<>'true' THEN RAISE EXCEPTION 'payment verification failed: %',pay; END IF;
 SELECT payment_status INTO state FROM public.bookings WHERE id=bid;
 IF state<>'paid' THEN RAISE EXCEPTION 'failed paid transition'; END IF;
 SELECT count(*) INTO n FROM public.transactions WHERE booking_id=bid;
 IF n<>1 THEN RAISE EXCEPTION 'double/missing booked income'; END IF;
END $$;
ROLLBACK;