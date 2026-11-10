-- STAGING ONLY. Refuse removal while operations/outbox data still needs reconciliation.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM booking_internal.admin_booking_operations) OR
    EXISTS(SELECT 1 FROM booking_internal.admin_booking_sync_outbox)
 THEN RAISE EXCEPTION 'RECONCILE_ADMIN_OPERATIONS_BEFORE_ROLLBACK'; END IF;
END; $$;
DROP FUNCTION public.staging_admin_booking_command(uuid,uuid,uuid,text,jsonb,text);
DROP FUNCTION public.staging_admin_booking_snapshot(uuid,uuid);
DROP TABLE booking_internal.admin_booking_sync_outbox;
DROP TABLE booking_internal.admin_booking_operations;
COMMIT;
