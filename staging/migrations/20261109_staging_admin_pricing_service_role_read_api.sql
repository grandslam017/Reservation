-- STAGING-ONLY: API-safe configuration retrieval, service_role only.
CREATE OR REPLACE FUNCTION public.staging_list_pricing_rules()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_segments jsonb;v_promos jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',s.id,'name',s.name,'start_hour',s.start_hour,'end_hour',s.end_hour,
 'amount',s.amount,'active',s.active) ORDER BY s.start_hour), '[]'::jsonb)
 INTO v_segments FROM booking_internal.price_segments s WHERE s.active;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',p.id,'rule_code',p.rule_code,'begins_on',p.begins_on,'ends_on',p.ends_on,
 'weekdays',p.weekdays,'weekday_only',p.weekday_only,'start_hour',p.start_hour,
 'end_hour',p.end_hour,'price',p.price,'priority',p.priority,'active',p.active)
 ORDER BY p.priority DESC,p.rule_code), '[]'::jsonb)
 INTO v_promos FROM booking_internal.pricing_rules p;
 RETURN jsonb_build_object('success',true,'segments',v_segments,'promotions',v_promos);
END;$$;
REVOKE ALL ON FUNCTION public.staging_list_pricing_rules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staging_list_pricing_rules() TO service_role;