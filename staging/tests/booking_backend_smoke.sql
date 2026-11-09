-- STAGING-ONLY transactional smoke test. All writes are rolled back.
-- Run only in isolated granslam-staging SQL Editor (not Production).
BEGIN;
DO $test$
DECLARE
 d date := ((now() at time zone 'Asia/Bangkok')::date + 2);
 h jsonb; c jsonb; f jsonb; x jsonb; r jsonb; req uuid := gen_random_uuid(); token uuid;
 n integer; total numeric;
BEGIN
 h := public.staging_create_hold(d,ARRAY['09:00 - 10:00','10:00 - 11:00'],'Main Court');
 IF h->>'success' <> 'true' THEN RAISE EXCEPTION 'create hold failed: %',h; END IF;
 token := (h->>'hold_token')::uuid;
 c := public.staging_create_hold(d,ARRAY['09:00 - 10:00'],'Main Court');
 IF c->>'error' <> 'COLLISION' THEN RAISE EXCEPTION 'double booking was accepted'; END IF;
 f := public.staging_confirm_hold(token,req,'Synthetic Regression','0812345678','test@example.invalid');
 IF f->>'success' <> 'true' THEN RAISE EXCEPTION 'confirm failed: %',f; END IF;
 x := public.staging_confirm_hold(token,req,'Synthetic Regression','0812345678','test@example.invalid');
 IF x IS DISTINCT FROM f THEN RAISE EXCEPTION 'idempotent retry changed outcome'; END IF;
 x := public.staging_confirm_hold(token,gen_random_uuid(),'Synthetic Regression','0812345678',null);
 IF x->>'error' <> 'ALREADY_CONFIRMED' THEN RAISE EXCEPTION 'different idempotency key accepted'; END IF;
 SELECT count(*),sum(amount) INTO n,total FROM public.transactions
  WHERE booking_id IN (SELECT value::uuid FROM jsonb_array_elements_text(f->'booking_ids'));
 IF n<>2 OR total<>500 THEN RAISE EXCEPTION 'wrong booked transactions %, %',n,total; END IF;
 r := public.staging_release_hold(token);
 IF r->>'error' <> 'ALREADY_CONFIRMED' THEN RAISE EXCEPTION 'confirmed booking released'; END IF;
 h := public.staging_create_hold(d,ARRAY['13:00 - 14:00'],'Main Court');
 token := (h->>'hold_token')::uuid;
 UPDATE booking_internal.hold_groups SET expires_at=now()-interval '1 second' WHERE booking_internal.hold_groups.token=token;
 x := public.staging_confirm_hold(token,gen_random_uuid(),'Synthetic Regression','0812345678',null);
 IF x->>'error' <> 'HOLD_EXPIRED' THEN RAISE EXCEPTION 'expired hold confirmed'; END IF;
 h := public.staging_create_hold(d,ARRAY['13:00 - 14:00'],'Main Court');
 IF h->>'success'<>'true' THEN RAISE EXCEPTION 'expired hold cannot be reclaimed'; END IF;
 r := public.staging_release_hold((h->>'hold_token')::uuid);
 IF r->>'released'<>'1' THEN RAISE EXCEPTION 'released count wrong'; END IF;
END;
$test$;
ROLLBACK;
-- Passing means the SQL returned no exception. Does NOT replace concurrent load, web, payment or security tests.
