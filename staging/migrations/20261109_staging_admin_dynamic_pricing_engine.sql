-- STAGING ONLY: configurable hourly base prices and dated promotions.
-- Admin writes must go through verified backend; no anonymous table grants.
CREATE TABLE IF NOT EXISTS booking_internal.price_segments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 start_hour integer NOT NULL CHECK(start_hour BETWEEN 8 AND 22),
 end_hour integer NOT NULL CHECK(end_hour BETWEEN 9 AND 23),
 amount numeric(12,2) NOT NULL CHECK(amount BETWEEN 0 AND 100000),
 active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(start_hour<end_hour)
);
INSERT INTO booking_internal.price_segments(name,start_hour,end_hour,amount)
SELECT v.name,v.start_hour,v.end_hour,v.amount
FROM (VALUES ('Day',8,16,250::numeric),('Evening',16,23,350::numeric))
v(name,start_hour,end_hour,amount)
WHERE NOT EXISTS (SELECT 1 FROM booking_internal.price_segments);
ALTER TABLE booking_internal.pricing_rules
 ADD COLUMN IF NOT EXISTS weekdays integer[] DEFAULT NULL,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE booking_internal.pricing_rules
 ADD CONSTRAINT pricing_rule_weekdays_valid
 CHECK (weekdays IS NULL OR (cardinality(weekdays) BETWEEN 1 AND 7
   AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::integer[]));
CREATE TABLE IF NOT EXISTS booking_internal.pricing_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL,
 action text NOT NULL,
 target_id uuid NOT NULL,
 old_value jsonb,
 new_value jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON booking_internal.price_segments, booking_internal.pricing_rules,
 booking_internal.pricing_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE,INSERT ON booking_internal.price_segments,booking_internal.pricing_rules,
 booking_internal.pricing_audit TO service_role;

CREATE OR REPLACE FUNCTION booking_internal.slot_fee(p_date date,p_start_hour integer)
RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_amount numeric; v_isodow integer:=extract(isodow from p_date)::integer;
BEGIN
 IF p_date IS NULL OR p_start_hour IS NULL OR p_start_hour<8 OR p_start_hour>=23
 THEN RAISE EXCEPTION 'INVALID_SLOT'; END IF;
 SELECT p.price INTO v_amount FROM booking_internal.pricing_rules p
 WHERE p.active AND p_date BETWEEN p.begins_on AND p.ends_on
   AND p_start_hour>=p.start_hour AND p_start_hour<p.end_hour
   AND (p.weekdays IS NULL AND (NOT p.weekday_only OR v_isodow BETWEEN 1 AND 5)
       OR p.weekdays IS NOT NULL AND v_isodow=ANY(p.weekdays))
 ORDER BY p.priority DESC,p.rule_code LIMIT 1;
 IF FOUND THEN RETURN v_amount; END IF;
 SELECT s.amount INTO v_amount FROM booking_internal.price_segments s
 WHERE s.active AND p_start_hour>=s.start_hour AND p_start_hour<s.end_hour
 ORDER BY s.updated_at DESC,s.id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_NOT_CONFIGURED'; END IF;
 RETURN v_amount;
END; $$;
REVOKE ALL ON FUNCTION booking_internal.slot_fee(date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION booking_internal.slot_fee(date,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.staging_get_pricing(p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_slots jsonb;
BEGIN
 PERFORM booking_internal.assert_booking_window(p_date);
 SELECT jsonb_agg(jsonb_build_object('slot',
   lpad(h::text,2,'0')||':00 - '||lpad((h+1)::text,2,'0')||':00',
   'fee',booking_internal.slot_fee(p_date,h)) ORDER BY h)
 INTO v_slots FROM generate_series(8,22) h;
 RETURN jsonb_build_object('success',true,'date',p_date,'prices',v_slots);
END; $$;
REVOKE ALL ON FUNCTION public.staging_get_pricing(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_get_pricing(date) TO service_role;

CREATE OR REPLACE FUNCTION public.staging_save_promo(
 p_admin uuid,p_code text,p_start date,p_end date,p_weekdays integer[],
 p_from_hour integer,p_to_hour integer,p_price numeric,p_priority integer,p_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_old jsonb; v_row booking_internal.pricing_rules%rowtype;
BEGIN
 IF p_admin IS NULL OR p_code IS NULL OR p_code !~ '^[a-z][a-z0-9_]{2,48}$'
 OR p_start IS NULL OR p_end IS NULL OR p_start>p_end
 OR p_from_hour<8 OR p_to_hour>23 OR p_to_hour<=p_from_hour
 OR p_price IS NULL OR p_price<0 OR p_price>100000
 OR p_priority IS NULL OR p_priority<0 OR p_priority>1000
 OR p_active IS NULL OR p_weekdays IS NULL OR cardinality(p_weekdays)<1
 OR NOT p_weekdays <@ ARRAY[1,2,3,4,5,6,7]::integer[] THEN
 RAISE EXCEPTION 'INVALID_PRICE_RULE'; END IF;
 SELECT to_jsonb(p) INTO v_old FROM booking_internal.pricing_rules p WHERE rule_code=p_code FOR UPDATE;
 INSERT INTO booking_internal.pricing_rules(
 rule_code,begins_on,ends_on,weekday_only,start_hour,end_hour,price,priority,active,weekdays,updated_at
 ) VALUES(p_code,p_start,p_end,false,p_from_hour,p_to_hour,p_price,p_priority,p_active,p_weekdays,now())
 ON CONFLICT(rule_code) DO UPDATE SET
 begins_on=EXCLUDED.begins_on,ends_on=EXCLUDED.ends_on,weekday_only=false,
 start_hour=EXCLUDED.start_hour,end_hour=EXCLUDED.end_hour,price=EXCLUDED.price,
 priority=EXCLUDED.priority,active=EXCLUDED.active,weekdays=EXCLUDED.weekdays,updated_at=now()
 RETURNING * INTO v_row;
 INSERT INTO booking_internal.pricing_audit(admin_id,action,target_id,old_value,new_value)
 VALUES(p_admin,'upsert_promo',v_row.id,v_old,to_jsonb(v_row));
 RETURN jsonb_build_object('success',true,'rule_id',v_row.id);
END; $$;
REVOKE ALL ON FUNCTION public.staging_save_promo(uuid,text,date,date,integer[],integer,integer,numeric,integer,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_save_promo(uuid,text,date,date,integer[],integer,integer,numeric,integer,boolean)
 TO service_role;

CREATE OR REPLACE FUNCTION public.staging_set_hour_price(p_admin uuid,p_hour integer,p_price numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_row booking_internal.price_segments%rowtype; v_old jsonb;
BEGIN
 IF p_admin IS NULL OR p_hour IS NULL OR p_hour<8 OR p_hour>=23
 OR p_price IS NULL OR p_price<0 OR p_price>100000
 THEN RAISE EXCEPTION 'INVALID_HOUR_PRICE'; END IF;
 -- Split legacy segment into per-hour rows on first granular edit, preserving existing prices.
 IF (SELECT count(*) FROM booking_internal.price_segments WHERE active) <> 15 THEN
   INSERT INTO booking_internal.price_segments(name,start_hour,end_hour,amount)
   SELECT 'Hour '||h,h,h+1,booking_internal.slot_fee(current_date,h)
   FROM generate_series(8,22) h;
   UPDATE booking_internal.price_segments SET active=false WHERE end_hour-start_hour>1;
 END IF;
 SELECT * INTO v_row FROM booking_internal.price_segments
 WHERE start_hour=p_hour AND end_hour=p_hour+1 AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_NOT_CONFIGURED'; END IF;
 v_old:=to_jsonb(v_row);
 UPDATE booking_internal.price_segments SET amount=p_price,updated_at=now()
 WHERE id=v_row.id RETURNING * INTO v_row;
 INSERT INTO booking_internal.pricing_audit(admin_id,action,target_id,old_value,new_value)
 VALUES(p_admin,'set_hour_price',v_row.id,v_old,to_jsonb(v_row));
 RETURN jsonb_build_object('success',true,'hour',p_hour,'price',p_price);
END; $$;
REVOKE ALL ON FUNCTION public.staging_set_hour_price(uuid,integer,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_set_hour_price(uuid,integer,numeric) TO service_role;
