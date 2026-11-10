CREATE OR REPLACE FUNCTION public.staging_check_rate_limit(p_actor uuid, p_action text, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_count integer; v_window timestamptz := date_trunc('minute',now());
BEGIN
 IF p_actor IS NULL OR p_action NOT IN ('availability','pricing','create','confirm','release','verify-payment','admin-pricing')
    OR p_limit<1 OR p_limit>120 THEN RAISE EXCEPTION 'INVALID_RATE_LIMIT'; END IF;
 INSERT INTO booking_internal.api_rate_limits(actor_id,action,window_start,used)
 VALUES(p_actor,p_action,v_window,1)
 ON CONFLICT(actor_id,action,window_start) DO UPDATE
 SET used=booking_internal.api_rate_limits.used+1
 WHERE booking_internal.api_rate_limits.used < p_limit
 RETURNING used INTO v_count;
 IF v_count IS NULL THEN RETURN jsonb_build_object('allowed',false); END IF;
 RETURN jsonb_build_object('allowed',true,'remaining',p_limit-v_count);
END; $function$
;