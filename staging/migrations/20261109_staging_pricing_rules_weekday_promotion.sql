
-- STAGING ONLY price policy. No change to production or its configuration.
CREATE TABLE booking_internal.pricing_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 rule_code text NOT NULL UNIQUE,
 begins_on date NOT NULL,
 ends_on date NOT NULL,
 weekday_only boolean NOT NULL DEFAULT false,
 start_hour integer NOT NULL CHECK(start_hour BETWEEN 8 AND 22),
 end_hour integer NOT NULL CHECK(end_hour BETWEEN 9 AND 23),
 price numeric NOT NULL CHECK(price>=0),
 priority integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 CHECK(begins_on<=ends_on),
 CHECK(start_hour<end_hour)
);
REVOKE ALL ON booking_internal.pricing_rules FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON booking_internal.pricing_rules TO service_role;
INSERT INTO booking_internal.pricing_rules
 (rule_code,begins_on,ends_on,weekday_only,start_hour,end_hour,price,priority)
VALUES ('weekday_99_oct_nov_2026',date '2026-10-21',date '2026-11-30',true,12,14,99,100);

CREATE OR REPLACE FUNCTION booking_internal.slot_fee(p_date date, p_start_hour integer)
RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_promo numeric;
BEGIN
 IF p_date IS NULL OR p_start_hour < 8 OR p_start_hour >= 23
 THEN RAISE EXCEPTION 'INVALID_SLOT'; END IF;
 SELECT r.price INTO v_promo FROM booking_internal.pricing_rules r
 WHERE r.active AND p_date BETWEEN r.begins_on AND r.ends_on
   AND (NOT r.weekday_only OR extract(isodow from p_date) BETWEEN 1 AND 5)
   AND p_start_hour >= r.start_hour AND p_start_hour < r.end_hour
 ORDER BY r.priority DESC,r.rule_code LIMIT 1;
 IF FOUND THEN RETURN v_promo; END IF;
 RETURN CASE WHEN p_start_hour<16 THEN 250 ELSE 350 END;
END; $$;
REVOKE ALL ON FUNCTION booking_internal.slot_fee(date,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION booking_internal.slot_fee(date,integer) TO service_role;
