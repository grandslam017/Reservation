BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 day date:=((now() at time zone 'Asia/Bangkok')::date+7);
 customer uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();
 token uuid; h jsonb;r jsonb;c jsonb;bid uuid;before_income integer;
BEGIN
 h:=public.staging_create_hold_v2(customer,day,ARRAY['14:00 - 15:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'Could not hold: %',h;END IF;
 token:=(h->>'hold_token')::uuid;
 c:=public.staging_confirm_hold_line_v3(customer,'U1234567890abcdef1234567890abcdef',
   token,gen_random_uuid(),'Synthetic Test','0812345678',NULL);
 IF c->>'error'<>'SLIP_REQUIRED' THEN RAISE EXCEPTION 'Booking without slip accepted: %',c; END IF;
 r:=public.staging_register_hold_slip(stranger,token,'staging/fake.png',repeat('a',64));
 IF r->>'error'<>'INVALID_OR_EXPIRED_HOLD'
 THEN RAISE EXCEPTION 'Foreign slip accepted: %',r;END IF;
 r:=public.staging_register_hold_slip(customer,token,'staging/synthetic.png',repeat('a',64));
 IF r->>'success'<>'true' THEN RAISE EXCEPTION 'Owner slip registration failed: %',r;END IF;
 c:=public.staging_confirm_hold_line_v3(customer,'U1234567890abcdef1234567890abcdef',
   token,gen_random_uuid(),'Synthetic Test','0812345678',NULL);
 IF c->>'success'<>'true' OR c->>'payment_verified'<>'false'
 THEN RAISE EXCEPTION 'Booking after slip failed: %',c;END IF;
 bid:=(c->'booking_ids'->>0)::uuid;
 SELECT count(*) INTO before_income FROM public.transactions WHERE booking_id=bid;
 IF before_income<>0 THEN RAISE EXCEPTION 'Income recorded before payment review';END IF;
END $$;
ROLLBACK;