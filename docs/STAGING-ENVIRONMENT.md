# Isolated Supabase staging

**Environment:** `grandslam-staging` — project ref `kssxxizhpoxxlbsehymk`, organization `grandslam`, region `ap-southeast-2`.

**Cost confirmation:** tool quoted project creation at **USD 0 per month** on Free plan. This is not a promise of zero cost for any future upgrade or optional add-ons.

**Production:** `eqwmodrhorcbwsshbepg`. DO NOT modify its schema, policies, RPCs, secrets or live bookings without explicit production deployment approval.

## Current staging baseline

Migration: `20261109125906_staging_initial_bookings_transactions_secure_baseline` applied **only to staging**.

- `public.bookings`: core columns and checks aligned with the live app; active bookings unique on `(booking_date,time_slot,court)`.
- `public.transactions`: core columns and checks aligned; FK to bookings and an FK index.
- Both tables use RLS, with **no public SELECT/INSERT/UPDATE/DELETE policies**; explicit grants for `anon` and `authenticated` were revoked.
- Initially both tables were empty; **synthetic-only test bookings and matching transactions now exist**. No customer data was imported.
- The second staging-only migration adds private hold-token tables and four service-role-only invoker RPCs, with bookkeeping inserts performed by the confirmation RPC. It is still NOT an operational clone of production and the website is not connected to staging.
- Supabase Security Advisor reports two informational `rls_enabled_no_policy` notices, expected until vetted server-side endpoints are available.

## Second staging migration applied

- `20261109133641_staging_backend_hold_atomic_booking_v1` applied only to staging.
- `staging_get_availability`: returns only busy slot labels, no PII.
- `staging_create_hold`: server-generated opaque token, 3-minute expiration, collision check enforced by the unique index, limited to canonical one-hour slots.
- `staging_confirm_hold`: validates token, expiry, customer input, atomically confirms slots and creates transactions; repeat request with same UUID returns the stored result.
- `staging_release_hold`: deletes only pending holds and refuses to release confirmed bookings.
- All four functions are **SECURITY INVOKER** with fixed search_path. Verified: anon/authenticated cannot EXECUTE; service_role can.
- Both tables remain RLS-enabled with no public row policies. Two expected INFO notices remain; no security WARN were returned for this staging snapshot.

## Staging-only test results (2026-11-09)

1. Two-slot hold created successfully; a second request for the same slot returns COLLISION.
2. Atomic confirmation created two bookings and two rental transactions totaling 700 THB.
3. Same request UUID returned unchanged receipt and booking IDs with no duplicate income; a different UUID returned ALREADY_CONFIRMED.
4. Releasing a confirmed hold returned ALREADY_CONFIRMED.
5. Release of a pending hold worked; second release returned released=0.
6. Rebooking a released slot worked.
7. Invalid customer details returned INVALID_CUSTOMER.
8. Staging daytime pricing returned 250 THB for an 11:00–12:00 slot.
9. Expired token returned HOLD_EXPIRED; expired hold's slot became available on the next request.
10. Two create-hold requests dispatched concurrently for the same slot returned one success and one COLLISION; successful pending hold was released afterward.
11. Availability returned only slot labels, without customer PII.

These are database-level tests and do not prove browser compatibility, load resistance or complete payment/accounting integration.

## Known blockers before staging website integration and production

- No Edge Function or authenticated end-user endpoint has been deployed. Never pass service_role key to the browser. Need secure identity, rate-limiting, abuse protection and trusted backend gateway.
- Promo pricing (e.g. weekday 99 THB campaign through 2026-11-30), coach charges, cancellation economics, date/slot granularity, and configurable server-side pricing must be explicitly aligned before deploying.
- This prototype only supports full one-hour slots for `Main Court`; does not yet handle half-hour or overlapping free-form intervals.
- Holds are not bound to an authenticated customer identity at the public API layer; token secrecy alone is not sufficient for a complete customer authorization design.
- Receipt numbering is staged and simplified; not yet verified against accounting and external Google Sheet integration.
- No verified payment slip validation, email notifications, GAS secret rotation or admin authorization yet.
- No staging public frontend or end-to-end mobile/device tests, and no final verified rollback.
- Never merge this branch or change production before explicit separate owner approval.

## Next development stages

1. Build customer identity and backend gateway (with service-only database access), plus request throttling.
2. Align configurable prices, business hours, current promotion, supported slots and coach workflow.
3. Implement secure admin backend, private slip storage and notification workflows.
4. Point a separate test website to staging; conduct device, concurrent, failed-payment and account-isolation end-to-end tests.
5. Validate migrations and rollback; owner approval is required for production deployment.

## Links

- Staging: https://supabase.com/dashboard/project/kssxxizhpoxxlbsehymk
- Existing draft PR: https://github.com/grandslam017/Reservation/pull/1
