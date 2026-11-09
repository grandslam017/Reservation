BEGIN; SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=gen_random_uuid(); r jsonb; v numeric;
BEGIN
 IF booking_internal.slot_fee(date '2026-11-10',12)<>99 THEN RAISE EXCEPTION 'Promo baseline failed';END IF;
 IF booking_internal.slot_fee(date '2026-11-14',12)<>250 THEN RAISE EXCEPTION 'Weekend baseline failed';END IF;
 r:=public.staging_set_hour_price(actor,12,275);
 IF r->>'success'<>'true' THEN RAISE EXCEPTION 'Per-hour update failed';END IF;
 IF booking_internal.slot_fee(date '2026-11-10',12)<>99 THEN RAISE EXCEPTION 'Temporary promotion lost';END IF;
 IF booking_internal.slot_fee(date '2026-11-14',12)<>275 THEN RAISE EXCEPTION 'Hourly override ignored';END IF;
 IF booking_internal.slot_fee(date '2026-11-14',13)<>250 THEN RAISE EXCEPTION 'Other hour affected';END IF;
 r:=public.staging_save_promo(actor,'test_saturday',date '2026-11-01',date '2026-12-31',
 ARRAY[6],12,13,125,150,true);
 IF r->>'success'<>'true' THEN RAISE EXCEPTION 'Rule update failed';END IF;
 IF booking_internal.slot_fee(date '2026-11-14',12)<>125 THEN RAISE EXCEPTION 'Weekend promotion not applied';END IF;
 IF booking_internal.slot_fee(date '2026-11-15',12)<>275 THEN RAISE EXCEPTION 'Sunday incorrectly discounted';END IF;
 SELECT count(*) INTO v FROM booking_internal.pricing_audit WHERE admin_id=actor;
 IF v<>2 THEN RAISE EXCEPTION 'Pricing audit count wrong %',v;END IF;
END $$; ROLLBACK;