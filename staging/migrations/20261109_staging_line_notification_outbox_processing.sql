-- Staging only: controlled LINE notification claiming and result recording.
ALTER TABLE booking_internal.line_notification_outbox
 ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
 ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.staging_claim_line_notification()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v booking_internal.line_notification_outbox%rowtype;
BEGIN
 SELECT * INTO v FROM booking_internal.line_notification_outbox o
 WHERE ((o.state IN ('pending','failed') AND o.next_attempt_at<=now())
      OR (o.state='sending' AND o.claimed_at<now()-interval '2 minutes'))
   AND o.attempts<5
   AND o.created_at>now()-interval '23 hours'
 ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 UPDATE booking_internal.line_notification_outbox
 SET state='sending',attempts=attempts+1,claimed_at=now()
 WHERE id=v.id;
 RETURN jsonb_build_object('found',true,'id',v.id,'attempt',v.attempts+1,
   'line_user_id',v.line_user_id,'payload',v.payload);
END; $$;

CREATE OR REPLACE FUNCTION public.staging_complete_line_notification(
 p_id uuid,p_attempt integer,p_sent boolean,p_error text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_rows integer;
BEGIN
 IF p_id IS NULL OR p_attempt IS NULL OR p_sent IS NULL THEN RAISE EXCEPTION 'INVALID_ATTEMPT'; END IF;
 UPDATE booking_internal.line_notification_outbox
 SET state=CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
     sent_at=CASE WHEN p_sent THEN now() ELSE sent_at END,
     last_error_code=CASE WHEN p_sent THEN NULL ELSE left(coalesce(p_error,'UNKNOWN'),60) END,
     next_attempt_at=CASE WHEN p_sent THEN now()
                          ELSE now()+make_interval(secs=>least(1800,15*power(2,least(attempts,6))::integer)) END
 WHERE id=p_id AND attempts=p_attempt AND state='sending';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('updated',v_rows=1);
END; $$;
REVOKE ALL ON FUNCTION public.staging_claim_line_notification() FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.staging_complete_line_notification(uuid,integer,boolean,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_claim_line_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.staging_complete_line_notification(uuid,integer,boolean,text)
 TO service_role;
