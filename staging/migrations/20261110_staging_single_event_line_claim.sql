-- Staging ONLY: explicit one-event, one-recipient, freshly-created LINE queue claim.
-- Never automatically drain earlier test notifications.
CREATE OR REPLACE FUNCTION public.staging_claim_specific_line_notification(
  p_event_key text, p_recipient text
) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v booking_internal.line_notification_outbox%rowtype;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^booking_confirmed:[0-9a-fA-F-]{36}$'
    OR p_recipient IS NULL OR p_recipient !~ '^U[0-9a-fA-F]{32}$'
 THEN RETURN jsonb_build_object('found',false,'error','INVALID_DELIVERY_TARGET'); END IF;
 SELECT * INTO v FROM booking_internal.line_notification_outbox o
 WHERE o.event_key=p_event_key AND o.line_user_id=p_recipient
   AND o.state IN ('pending','failed') AND o.next_attempt_at<=now()
   AND o.attempts<5 AND o.created_at>now()-interval '10 minutes'
   AND o.payload->>'kind'='booking_confirmed'
   AND o.payload->>'booking_status'='confirmed'
 ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 UPDATE booking_internal.line_notification_outbox
 SET state='sending', attempts=attempts+1, claimed_at=now()
 WHERE id=v.id;
 RETURN jsonb_build_object('found',true,'id',v.id,'attempt',v.attempts+1,
    'line_user_id',v.line_user_id,'payload',v.payload);
END; $function$;
REVOKE ALL ON FUNCTION public.staging_claim_specific_line_notification(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_claim_specific_line_notification(text,text) TO service_role;
