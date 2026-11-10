-- Synthetic fixtures only. Every write is rolled back, including audit/outbox entries.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 paid uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); snap jsonb; result jsonb; again jsonb;
 before_tx bigint; d date:=(now() at time zone 'Asia/Bangkok')::date+1;
 t text; other_slot text; h integer; expected_fee numeric; before_row jsonb; counter integer;
BEGIN
 SELECT count(*) INTO before_tx FROM public.transactions;
 -- Use an isolated source date; reschedule destinations are selected from genuinely free slots.
 INSERT INTO public.bookings(id,booking_date,time_slot,customer_name,phone,email,car_plate,
   invoice_no,receipt_no,fee,status,payment_status)
 VALUES(b,'2099-01-01','08:00 - 09:00','Synthetic admin fixture','0812345678','fixture@example.com','TEST01',
   'TEST.'||b,'TEST.'||b,250,'confirmed','pending_verification'),
 (c,'2099-01-01','09:00 - 10:00','Synthetic cancel fixture','0812345678','fixture@example.com','TEST02',
   'TEST.'||c,'TEST.'||c,250,'confirmed','pending_verification'),
 (paid,'2099-01-01','10:00 - 11:00','Synthetic paid fixture','0812345678','fixture@example.com','TEST03',
   'TEST.'||paid,'TEST.'||paid,250,'confirmed','paid');
 snap:=public.staging_admin_booking_snapshot(a,b);
 IF snap->>'success'<>'true' OR length(snap->>'snapshot_hash')<>64 THEN RAISE EXCEPTION 'SNAPSHOT_FAILED'; END IF;
 result:=public.staging_admin_booking_command(a,r,b,'notes','{"admin_notes":"Synthetic updated note"}',snap->>'snapshot_hash');
 IF result->>'success'<>'true' OR result#>>'{booking,admin_notes}'<>'Synthetic updated note' OR
    result->>'external_effects_performed'<>'false' OR result->>'sync_state'<>'pending'
 THEN RAISE EXCEPTION 'NOTES_COMMAND_FAILED'; END IF;
 again:=public.staging_admin_booking_command(a,r,b,'notes','{"admin_notes":"Synthetic updated note"}',snap->>'snapshot_hash');
 IF again IS DISTINCT FROM result THEN RAISE EXCEPTION 'IDEMPOTENT_RETRY_FAILED'; END IF;
 IF (SELECT count(*) FROM booking_internal.admin_booking_sync_outbox WHERE operation_id=r)<>1 OR
    (SELECT count(*) FROM booking_internal.admin_booking_operations WHERE request_id=r)<>1
 THEN RAISE EXCEPTION 'DUPLICATE_AUDIT_OR_OUTBOX'; END IF;
 again:=public.staging_admin_booking_command(a,r,b,'notes','{"admin_notes":"Changed retry"}',snap->>'snapshot_hash');
 IF again->>'error'<>'IDEMPOTENCY_CONFLICT' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT_NOT_REJECTED'; END IF;
 again:=public.staging_admin_booking_command(gen_random_uuid(),r,b,'notes','{"admin_notes":"Synthetic updated note"}',snap->>'snapshot_hash');
 IF again->>'error'<>'IDEMPOTENCY_CONFLICT' THEN RAISE EXCEPTION 'CROSS_ACTOR_REPLAY_NOT_REJECTED'; END IF;
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),b,'notes','{"admin_notes":"Lost edit"}',snap->>'snapshot_hash');
 IF again->>'error'<>'STALE_BOOKING' THEN RAISE EXCEPTION 'STALE_EDIT_NOT_REJECTED'; END IF;
 snap:=public.staging_admin_booking_snapshot(a,b);
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),b,'notes','{"admin_notes":"Injected","fee":0}',snap->>'snapshot_hash');
 IF again->>'error'<>'INVALID_PATCH' THEN RAISE EXCEPTION 'PRICE_INJECTION_NOT_REJECTED'; END IF;
 result:=public.staging_admin_booking_command(a,gen_random_uuid(),b,'coach','{"require_coach":true}',snap->>'snapshot_hash');
 IF result#>>'{booking,require_coach}'<>'true' THEN RAISE EXCEPTION 'COACH_UPDATE_FAILED'; END IF;
 snap:=public.staging_admin_booking_snapshot(a,b);
 result:=public.staging_admin_booking_command(a,gen_random_uuid(),b,'customer-details',
   '{"customer_name":"ก","phone":"0898765432","email":"synthetic@example.com","car_plate":"TEST04"}',snap->>'snapshot_hash');
 IF result->>'success'<>'true' OR result#>>'{booking,customer_name}'<>'ก' THEN RAISE EXCEPTION 'CUSTOMER_UPDATE_FAILED'; END IF;
 snap:=public.staging_admin_booking_snapshot(a,b);
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),b,'customer-details',
   '{"customer_name":"x","phone":"123","email":"bad","car_plate":"T"}',snap->>'snapshot_hash');
 IF again->>'error'<>'INVALID_PATCH' THEN RAISE EXCEPTION 'BAD_CUSTOMER_NOT_REJECTED'; END IF;
 -- Find two free destinations in the open booking window.
 FOR h IN 8..22 LOOP
  t:=lpad(h::text,2,'0')||':00 - '||lpad((h+1)::text,2,'0')||':00';
  IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE booking_date=d AND time_slot=t AND court='Main Court' AND status<>'cancelled') THEN
   IF other_slot IS NULL THEN other_slot:=t; ELSE EXIT; END IF;
  END IF;
 END LOOP;
 IF other_slot IS NULL OR other_slot=t THEN RAISE EXCEPTION 'NO_FREE_TEST_DESTINATIONS'; END IF;
 expected_fee:=booking_internal.slot_fee(d,booking_internal.assert_slot(t));
 result:=public.staging_admin_booking_command(a,gen_random_uuid(),b,'reschedule',jsonb_build_object('booking_date',d,'time_slot',t),snap->>'snapshot_hash');
 IF result->>'success'<>'true' OR (result#>>'{booking,fee}')::numeric<>expected_fee OR
    (result#>>'{booking,booking_date}')::date<>d THEN RAISE EXCEPTION 'SERVER_PRICE_RESCHEDULE_FAILED'; END IF;
 snap:=public.staging_admin_booking_snapshot(a,c);before_row:=snap->'booking';
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),c,'reschedule',jsonb_build_object('booking_date',d,'time_slot',t),snap->>'snapshot_hash');
 IF again->>'error'<>'COLLISION' OR (public.staging_admin_booking_snapshot(a,c)->'booking') IS DISTINCT FROM before_row THEN RAISE EXCEPTION 'COLLISION_CHANGED_SOURCE_ROW'; END IF;
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),c,'reschedule','{"booking_date":"2099-02-30","time_slot":"12:00 - 13:00"}',snap->>'snapshot_hash');
 IF again->>'error'<>'INVALID_RESCHEDULE' THEN RAISE EXCEPTION 'INVALID_DATE_NOT_REJECTED'; END IF;
 result:=public.staging_admin_booking_command(a,gen_random_uuid(),c,'cancel','{}',snap->>'snapshot_hash');
 IF result->>'success'<>'true' OR result#>>'{booking,status}'<>'cancelled' THEN RAISE EXCEPTION 'UNPAID_CANCEL_FAILED'; END IF;
 snap:=public.staging_admin_booking_snapshot(a,paid);
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),paid,'cancel','{}',snap->>'snapshot_hash');
 IF again->>'error'<>'PAYMENT_REVIEW_REQUIRED' THEN RAISE EXCEPTION 'PAID_CANCEL_NOT_GATED'; END IF;
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),paid,'reschedule',jsonb_build_object('booking_date',d,'time_slot',other_slot),snap->>'snapshot_hash');
 IF again->>'error'<>'PAYMENT_REVIEW_REQUIRED' THEN RAISE EXCEPTION 'PAID_RESCHEDULE_NOT_GATED'; END IF;
 -- Legacy income is also a blocker even if payment_status says pending.
 UPDATE public.bookings SET payment_status='pending_verification' WHERE id=paid;
 INSERT INTO public.transactions(transaction_date,type,category,amount,description,booking_id)
 VALUES(d,'income','Synthetic',250,'Rollback-only test',paid);
 snap:=public.staging_admin_booking_snapshot(a,paid);
 again:=public.staging_admin_booking_command(a,gen_random_uuid(),paid,'cancel','{}',snap->>'snapshot_hash');
 IF again->>'error'<>'PAYMENT_REVIEW_REQUIRED' THEN RAISE EXCEPTION 'LEGACY_INCOME_NOT_GATED'; END IF;
 SELECT count(*) INTO counter FROM booking_internal.admin_booking_operations WHERE admin_id=a;
 IF counter<>5 OR (SELECT count(*) FROM booking_internal.admin_booking_sync_outbox WHERE operation_id IN
  (SELECT request_id FROM booking_internal.admin_booking_operations WHERE admin_id=a))<>5 THEN RAISE EXCEPTION 'FAILED_REQUEST_QUEUED_WORK'; END IF;
 IF EXISTS(SELECT 1 FROM booking_internal.admin_booking_sync_outbox WHERE state<>'pending') THEN RAISE EXCEPTION 'UNEXPECTED_DELIVERY'; END IF;
 IF (SELECT count(*) FROM public.transactions)<>before_tx+1 THEN RAISE EXCEPTION 'COMMAND_CHANGED_FINANCIAL_ROWS'; END IF;
END; $$;
RESET ROLE;
ROLLBACK;
SELECT 'passed; synthetic fixtures, operations and outbox rolled back' AS admin_command_sql_suite;
