BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_claim jsonb; v_done jsonb; v_count int; v_event text; v_id uuid; v_claim2 jsonb;
BEGIN
  SELECT count(*) INTO v_count FROM booking_internal.line_notification_outbox
    WHERE state='pending' AND attempts=0;
  IF v_count<1 THEN RAISE EXCEPTION 'NO_PENDING_TEST_EVENT'; END IF;
  v_claim:=public.staging_claim_line_notification();
  IF COALESCE(v_claim->>'found','false')<>'true' THEN RAISE EXCEPTION 'CLAIM_FAILED %',v_claim; END IF;
  v_id:=(v_claim->>'id')::uuid;
  IF (SELECT state FROM booking_internal.line_notification_outbox WHERE id=v_id)<>'sending'
     THEN RAISE EXCEPTION 'STATE_NOT_SENDING'; END IF;
  v_done:=public.staging_complete_line_notification(v_id,(v_claim->>'attempt')::int,true,NULL);
  IF v_done->>'updated'<>'true' THEN RAISE EXCEPTION 'COMPLETE_FAILED %',v_done; END IF;
  IF (SELECT state FROM booking_internal.line_notification_outbox WHERE id=v_id)<>'sent'
     THEN RAISE EXCEPTION 'STATE_NOT_SENT'; END IF;
  v_done:=public.staging_complete_line_notification(v_id,(v_claim->>'attempt')::int,true,NULL);
  IF v_done->>'updated'<>'false' THEN RAISE EXCEPTION 'DUPLICATE_COMPLETION_ACCEPTED'; END IF;
  IF (SELECT count(*) FROM booking_internal.line_notification_outbox WHERE id=v_id)<>1
    THEN RAISE EXCEPTION 'OUTBOX_DUPLICATED'; END IF;
END $$;
ROLLBACK;