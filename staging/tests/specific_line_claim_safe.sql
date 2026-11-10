BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
 v jsonb; old_count integer;
BEGIN
 SELECT count(*) INTO old_count FROM booking_internal.line_notification_outbox;
 v:=public.staging_claim_specific_line_notification('booking_confirmed:00000000-0000-4000-8000-000000000001','U1234567890abcdef1234567890abcdef');
 IF v->>'found'<>'false' THEN RAISE EXCEPTION 'NONEXISTENT_EVENT_CLAIMED %',v; END IF;
 v:=public.staging_claim_specific_line_notification('wrong-prefix:00000000-0000-4000-8000-000000000001','U1234567890abcdef1234567890abcdef');
 IF v->>'error'<>'INVALID_DELIVERY_TARGET' THEN RAISE EXCEPTION 'MALFORMED_KEY_ACCEPTED %',v;END IF;
 IF (SELECT count(*) FROM booking_internal.line_notification_outbox)<>old_count THEN RAISE EXCEPTION 'QUEUE_MUTATED';END IF;
END $$;
ROLLBACK;