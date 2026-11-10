-- STAGING ONLY. Backend must derive p_admin from a freshly verified Auth user.
-- No network or GAS calls exist in these functions. All sync work remains queued.
CREATE TABLE booking_internal.admin_booking_operations (
 request_id uuid PRIMARY KEY,
 admin_id uuid NOT NULL,
 booking_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('notes','customer-details','coach','cancel','reschedule')),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 before_row jsonb NOT NULL,
 after_row jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking_internal.admin_booking_sync_outbox (
 operation_id uuid PRIMARY KEY REFERENCES booking_internal.admin_booking_operations(request_id),
 kind text NOT NULL CHECK(kind IN ('booking.updated','booking.cancelled','booking.rescheduled')),
 booking_id uuid NOT NULL,
 before_row jsonb NOT NULL,
 after_row jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE booking_internal.admin_booking_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_internal.admin_booking_sync_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_internal.admin_booking_operations,booking_internal.admin_booking_sync_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON booking_internal.admin_booking_operations,booking_internal.admin_booking_sync_outbox TO service_role;

CREATE FUNCTION public.staging_admin_booking_snapshot(p_admin uuid,p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v public.bookings%rowtype; v_row jsonb;
BEGIN
 IF p_admin IS NULL OR p_booking_id IS NULL THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 v_row:=to_jsonb(v);
 RETURN jsonb_build_object('success',true,'booking',v_row,
   'snapshot_hash',encode(sha256(convert_to(v_row::text,'UTF8')),'hex'));
END; $$;
REVOKE ALL ON FUNCTION public.staging_admin_booking_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_admin_booking_snapshot(uuid,uuid) TO service_role;

CREATE FUNCTION public.staging_admin_booking_command(
 p_admin uuid,p_request_id uuid,p_booking_id uuid,p_action text,p_patch jsonb,p_expected_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v public.bookings%rowtype; v_old jsonb; v_new jsonb; v_result jsonb;
 v_hash text; v_existing booking_internal.admin_booking_operations%rowtype;
 v_keys text[]; v_date date; v_slot text; v_start integer; v_fee numeric;
 v_kind text:='booking.updated'; v_now timestamp:=(now() at time zone 'Asia/Bangkok');
BEGIN
 IF p_admin IS NULL OR p_request_id IS NULL OR p_booking_id IS NULL OR
    p_action IS NULL OR p_action NOT IN ('notes','customer-details','coach','cancel','reschedule') OR
    p_expected_hash IS NULL OR p_expected_hash !~ '^[0-9a-f]{64}$' OR
    p_patch IS NULL OR jsonb_typeof(p_patch)<>'object'
 THEN RETURN jsonb_build_object('success',false,'error','INVALID_COMMAND'); END IF;
 v_hash:=encode(sha256(convert_to(jsonb_build_object('admin',p_admin,'booking',p_booking_id,
   'action',p_action,'patch',p_patch,'expected',p_expected_hash)::text,'UTF8')),'hex');
 -- Serialize identical request IDs, then serialize modifications to the target row.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO v_existing FROM booking_internal.admin_booking_operations WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_existing.request_hash=v_hash THEN RETURN v_existing.result; END IF;
  RETURN jsonb_build_object('success',false,'error','IDEMPOTENCY_CONFLICT');
 END IF;
 SELECT * INTO v FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 v_old:=to_jsonb(v);
 IF encode(sha256(convert_to(v_old::text,'UTF8')),'hex')<>p_expected_hash
 THEN RETURN jsonb_build_object('success',false,'error','STALE_BOOKING'); END IF;
 IF v.status<>'confirmed' THEN RETURN jsonb_build_object('success',false,'error','NOT_CONFIRMED'); END IF;
 SELECT array_agg(key ORDER BY key) INTO v_keys FROM jsonb_object_keys(p_patch) key;
 IF p_action='notes' THEN
  IF v_keys IS DISTINCT FROM ARRAY['admin_notes'] OR jsonb_typeof(p_patch->'admin_notes')<>'string'
    OR length(p_patch->>'admin_notes')>2000
  THEN RETURN jsonb_build_object('success',false,'error','INVALID_PATCH'); END IF;
  UPDATE public.bookings SET admin_notes=p_patch->>'admin_notes' WHERE id=v.id;
 ELSIF p_action='coach' THEN
  IF v_keys IS DISTINCT FROM ARRAY['require_coach'] OR jsonb_typeof(p_patch->'require_coach')<>'boolean'
  THEN RETURN jsonb_build_object('success',false,'error','INVALID_PATCH'); END IF;
  UPDATE public.bookings SET require_coach=(p_patch->>'require_coach')::boolean WHERE id=v.id;
 ELSIF p_action='customer-details' THEN
  IF v_keys IS DISTINCT FROM ARRAY['car_plate','customer_name','email','phone'] OR
     jsonb_typeof(p_patch->'customer_name')<>'string' OR jsonb_typeof(p_patch->'phone')<>'string' OR
     jsonb_typeof(p_patch->'email')<>'string' OR jsonb_typeof(p_patch->'car_plate')<>'string' OR
     length(btrim(p_patch->>'customer_name')) NOT BETWEEN 1 AND 100 OR
     (p_patch->>'phone') !~ '^[0-9]{9,15}$' OR length(p_patch->>'email')>254 OR
     (p_patch->>'email') !~ '^[^ @]+@[^ @]+\.[^ @]+$' OR
     length(btrim(p_patch->>'car_plate')) NOT BETWEEN 2 AND 40
  THEN RETURN jsonb_build_object('success',false,'error','INVALID_PATCH'); END IF;
  UPDATE public.bookings SET customer_name=btrim(p_patch->>'customer_name'),phone=p_patch->>'phone',
    email=p_patch->>'email',car_plate=btrim(p_patch->>'car_plate') WHERE id=v.id;
 ELSIF p_action='cancel' THEN
  IF p_patch<>'{}'::jsonb THEN RETURN jsonb_build_object('success',false,'error','INVALID_PATCH'); END IF;
  IF v.payment_status NOT IN ('unpaid','pending_verification') OR
     EXISTS(SELECT 1 FROM public.transactions WHERE booking_id=v.id)
  THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_REVIEW_REQUIRED'); END IF;
  UPDATE public.bookings SET status='cancelled' WHERE id=v.id;
  v_kind:='booking.cancelled';
 ELSE
  IF v_keys IS DISTINCT FROM ARRAY['booking_date','time_slot'] OR
     jsonb_typeof(p_patch->'booking_date')<>'string' OR jsonb_typeof(p_patch->'time_slot')<>'string' OR
     (p_patch->>'booking_date') !~ '^\d{4}-\d{2}-\d{2}$'
  THEN RETURN jsonb_build_object('success',false,'error','INVALID_PATCH'); END IF;
  BEGIN
   v_date:=(p_patch->>'booking_date')::date; v_slot:=p_patch->>'time_slot';
   PERFORM booking_internal.assert_booking_window(v_date);
   v_start:=booking_internal.assert_slot(v_slot);
   IF v_date=v_now::date AND make_time(v_start,0,0)<=v_now::time THEN RAISE EXCEPTION 'PAST_SLOT'; END IF;
   v_fee:=booking_internal.slot_fee(v_date,v_start);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error','INVALID_RESCHEDULE'); END;
  IF v.payment_status NOT IN ('unpaid','pending_verification') OR
     EXISTS(SELECT 1 FROM public.transactions WHERE booking_id=v.id)
  THEN RETURN jsonb_build_object('success',false,'error','PAYMENT_REVIEW_REQUIRED'); END IF;
  -- Unique index arbitrates races with concurrent holds and other reschedules.
  BEGIN
   UPDATE public.bookings SET booking_date=v_date,time_slot=v_slot,fee=v_fee WHERE id=v.id;
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'error','COLLISION'); END;
  v_kind:='booking.rescheduled';
 END IF;
 SELECT to_jsonb(b) INTO v_new FROM public.bookings b WHERE id=v.id;
 v_result:=jsonb_build_object('success',true,'operation_id',p_request_id,'booking_id',v.id,
   'snapshot_hash',encode(sha256(convert_to(v_new::text,'UTF8')),'hex'),
   'booking',v_new,'sync_state','pending','external_effects_performed',false);
 INSERT INTO booking_internal.admin_booking_operations(request_id,admin_id,booking_id,action,request_hash,before_row,after_row,result)
 VALUES(p_request_id,p_admin,v.id,p_action,v_hash,v_old,v_new,v_result);
 INSERT INTO booking_internal.admin_booking_sync_outbox(operation_id,kind,booking_id,before_row,after_row)
 VALUES(p_request_id,v_kind,v.id,v_old,v_new);
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.staging_admin_booking_command(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_admin_booking_command(uuid,uuid,uuid,text,jsonb,text) TO service_role;
