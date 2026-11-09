# Isolated Supabase staging

**Environment:** `grandslam-staging` — project ref `kssxxizhpoxxlbsehymk`, organization `grandslam`, region `ap-southeast-2`.

**Cost confirmation:** tool quoted project creation at **USD 0 per month** on Free plan. This is not a promise of zero cost for any future upgrade or optional add-ons.

**Production:** `eqwmodrhorcbwsshbepg`. DO NOT modify its schema, policies, RPCs, secrets or live bookings without explicit production deployment approval.

## Current staging baseline

Migration: `20261109125906_staging_initial_bookings_transactions_secure_baseline` applied **only to staging**.

- `public.bookings`: core columns and checks aligned with the live app; active bookings unique on `(booking_date,time_slot,court)`.
- `public.transactions`: core columns and checks aligned; FK to bookings and an FK index.
- Both tables use RLS, with **no public SELECT/INSERT/UPDATE/DELETE policies**; explicit grants for `anon` and `authenticated` were revoked.
- Both tables are empty (0 rows), no customer data imported.
- **No triggers, bookkeeping functions, or public RPCs exist in this baseline**. This is deliberately NOT an operational clone of production and cannot yet run the website booking flow.
- Supabase Security Advisor reports two informational `rls_enabled_no_policy` notices, expected until vetted server-side endpoints are available.

## Next development stages

1. Implement server-verified availability and hold/confirm/release RPCs or Edge Functions.
2. Validate phone/email/input, calendar policy, coach flag, court, price rules, overlap, hold token, expiry and retry idempotency on the server.
3. Build admin authorization in backend (never assume `authenticated` is admin).
4. Repoint a separate test frontend ONLY to staging keys; never put a service-role key into browser code.
5. Create **synthetic** bookings and test concurrent access; verify no PII leaks; integrate transaction and notification actions after tests.
6. Add transactional migrations to source control and verify rollbacks; do not release until explicit owner approval.

## Links

- Staging: https://supabase.com/dashboard/project/kssxxizhpoxxlbsehymk
- Existing draft PR: https://github.com/grandslam017/Reservation/pull/1
