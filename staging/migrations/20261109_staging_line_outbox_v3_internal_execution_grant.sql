-- STAGING ONLY: V3 uses V2 SECURITY INVOKER. The internal call requires EXECUTE for service_role.
-- The edge gateway never exposes V2 directly; API consumers cannot call it with anon credentials.
GRANT EXECUTE ON FUNCTION public.staging_confirm_hold_v2(uuid,uuid,uuid,text,text,text) TO service_role;