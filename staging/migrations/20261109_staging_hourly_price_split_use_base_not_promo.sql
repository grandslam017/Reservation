CREATE OR REPLACE FUNCTION public.staging_set_hour_price(p_admin uuid, p_hour integer, p_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_row booking_internal.price_segments%rowtype; v_old jsonb;
BEGIN
 IF p_admin IS NULL OR p_hour IS NULL OR p_hour<8 OR p_hour>=23
 OR p_price IS NULL OR p_price<0 OR p_price>100000
 THEN RAISE EXCEPTION 'INVALID_HOUR_PRICE'; END IF;
 -- Split legacy segment into per-hour rows on first granular edit, preserving existing prices.
 IF (SELECT count(*) FROM booking_internal.price_segments WHERE active) <> 15 THEN
   INSERT INTO booking_internal.price_segments(name,start_hour,end_hour,amount)
   SELECT 'Hour '||h,h,h+1,(
     SELECT s.amount FROM booking_internal.price_segments s
     WHERE s.active AND h>=s.start_hour AND h<s.end_hour
     ORDER BY s.updated_at DESC,s.id LIMIT 1)
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
END; $function$
;