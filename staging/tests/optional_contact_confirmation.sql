BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 day date:=((now() at time zone 'Asia/Bangkok')::date+9);
 owner uuid:=gen_random_uuid();h jsonb; a jsonb;confirm_result jsonb; booking_uuid uuid; t int;
BEGIN
 -- optional blank phone and email exactly as sent by original customer form
 h:=public.staging_create_hold_v2(owner,day,ARRAY['12:00 - 13:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'CREATE_FAILED %',h;END IF;
 a:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,'staging/optional-test.png',repeat('c',64));
 IF a->>'success'<>'true' THEN RAISE EXCEPTION 'ATTACH_FAILED %',a;END IF;
 confirm_result:=public.staging_confirm_hold_line_v3(owner,'U1234567890abcdef1234567890abcdef',(h->>'hold_token')::uuid,gen_random_uuid(),'test','','');
 IF confirm_result->>'success'<>'true' THEN RAISE EXCEPTION 'OPTIONAL_CONTACT_REJECTED %',confirm_result;END IF;
 booking_uuid:=(confirm_result->'booking_ids'->>0)::uuid;
 IF (SELECT phone IS NOT NULL OR email IS NOT NULL FROM public.bookings WHERE id=booking_uuid)
 THEN RAISE EXCEPTION 'BLANK_CONTACT_NOT_NORMALIZED';END IF;
 IF (SELECT payment_status FROM public.bookings WHERE id=booking_uuid)<>'pending_verification'
 THEN RAISE EXCEPTION 'PAYMENT_STATUS_WRONG'; END IF;
 SELECT COUNT(*) INTO t FROM public.transactions WHERE booking_id=booking_uuid;
 IF t<>0 THEN RAISE EXCEPTION 'TRANSACTION_CREATED_PRE_VERIFICATION'; END IF;
END $$;
DO $$
DECLARE
 day date:=((now() at time zone 'Asia/Bangkok')::date+10);
 owner uuid:=gen_random_uuid();h jsonb;a jsonb;res jsonb;booking_uuid uuid;
BEGIN
 h:=public.staging_create_hold_v2(owner,day,ARRAY['12:00 - 13:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'CREATE_FAILED %',h;END IF;
 a:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,'staging/formatted-test.png',repeat('d',64));
 IF a->>'success'<>'true' THEN RAISE EXCEPTION 'ATTACH_FAILED %',a;END IF;
 res:=public.staging_confirm_hold_line_v3(owner,'U1234567890abcdef1234567890abcdef',(h->>'hold_token')::uuid,gen_random_uuid(),'test','081-234-5678',' test@example.com ');
 IF res->>'success'<>'true' THEN RAISE EXCEPTION 'FORMATTED_CONTACT_REJECTED %',res;END IF;
 booking_uuid:=(res->'booking_ids'->>0)::uuid;
 IF (SELECT phone FROM public.bookings WHERE id=booking_uuid)<>'0812345678' THEN RAISE EXCEPTION 'PHONE_NOT_NORMALIZED';END IF;
 IF (SELECT email FROM public.bookings WHERE id=booking_uuid)<>'test@example.com' THEN RAISE EXCEPTION 'EMAIL_NOT_NORMALIZED';END IF;
END $$;
DO $$
DECLARE
 day date:=((now() at time zone 'Asia/Bangkok')::date+11);
 owner uuid:=gen_random_uuid();h jsonb;a jsonb;res jsonb;
BEGIN
 h:=public.staging_create_hold_v2(owner,day,ARRAY['12:00 - 13:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'CREATE_FAILED %',h;END IF;
 a:=public.staging_register_hold_slip(owner,(h->>'hold_token')::uuid,'staging/rejected-test.png',repeat('e',64));
 IF a->>'success'<>'true' THEN RAISE EXCEPTION 'ATTACH_FAILED %',a;END IF;
 res:=public.staging_confirm_hold_line_v3(owner,'U1234567890abcdef1234567890abcdef',(h->>'hold_token')::uuid,gen_random_uuid(),'test','not-a-phone','');
 IF res->>'error'<>'INVALID_CUSTOMER' THEN RAISE EXCEPTION 'INVALID_PHONE_ACCEPTED %',res;END IF;
 res:=public.staging_confirm_hold_line_v3(owner,'U1234567890abcdef1234567890abcdef',(h->>'hold_token')::uuid,gen_random_uuid(),'test','','not-an-email');
 IF res->>'error'<>'INVALID_CUSTOMER' THEN RAISE EXCEPTION 'INVALID_EMAIL_ACCEPTED %',res;END IF;
END $$;
ROLLBACK;