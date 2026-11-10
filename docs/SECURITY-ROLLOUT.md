# The Grand Slam security hardening — deployment gate

**Status:** IN PROGRESS / NOT APPROVED FOR PRODUCTION. Do not merge this PR to `main`.

## Verified live system (2026-11-09)
- Supabase project: `eqwmodrhorcbwsshbepg`; project healthy; public tables `bookings` and `transactions` have RLS enabled.
- Live table estimates reported 2,028 `bookings` and 1,941 `transactions` rows (not a data backup).
- RLS: `bookings` grants unconditional SELECT/INSERT/UPDATE/DELETE policies to public and/or anon. `transactions` grants unconditional SELECT/INSERT/UPDATE/DELETE to `authenticated`. These do not enforce admin authorization.
- `confirm_booking_batch` remains callable by `anon` and `authenticated` as a SECURITY DEFINER RPC. Its authorization, server-side price validation, idempotency, hold ownership and search_path need a separate migration.
- The production database has **no recorded migrations** in the Supabase migration-history tool. The existing Supabase branch has `MIGRATIONS_FAILED`. Do not reset it or use it as a trustworthy test environment until the migration history is reconciled.
- No Edge Functions were deployed at audit time.
- The public frontend contains a shared Google Apps Script HMAC secret. Treat that secret as compromised and plan server-side rotation; do not publish replacement secrets in GitHub.

## Phase 1 — code-only safety patch in this draft PR
- Hold creation fails closed on missing Supabase, unsuccessful availability reads, failed inserts or exceptions.
- An unavailable batch-booking RPC no longer triggers the sequential write fallback.
- Client hold release filters `status = pending_hold` before attempting DELETE.
- Static regression tests are in `tests/security-regression.test.cjs`:
  `node --check app.js && node --test tests/security-regression.test.cjs`.

**Limits:** static tests do not prove concurrency correctness, token ownership, admin authorization or safe personal-data access. The old direct-to-table flows are not secured by this patch.

## Blocking issues before any production deployment
1. Obtain a restorable PostgreSQL schema+data backup and verify recovery (CSV alone is insufficient); separately back up private storage files and configuration as appropriate.
2. Create an isolated staging Supabase project/branch with known migration baseline and synthetic records. Obtain explicit permission for any charge.
3. Build server-owned booking availability, create-hold, confirm-booking, release-hold, admin operations. Validate price and advance-window server-side, prevent duplicate/overlapping slots atomically, enforce hold ownership and expiry, and implement request idempotency.
4. Remove direct public access to customer PII and client-generated HMAC signatures. Restrict RPC EXECUTE, table GRANTs and RLS only after all corresponding frontend code paths have migrated.
5. Ensure admin authorization is enforced in backend/RLS using a role the user cannot self-edit (never assume authenticated = admin).
6. Rotate exposed Apps Script signing secret, then move signing behind a trusted backend; check Google Apps Script action authorization.
7. Make receipts/slips private or otherwise access-controlled; carefully test migration from existing public URLs.
8. Run tests on staging: concurrent holds, competing confirmations, multi-slot atomicity, invalid fees, expired/foreign tokens, idempotent retries, admin vs customer isolation, invoices, GAS/email, receipts/slips.
9. Recheck Supabase Security/Performance Advisors, confirm no new high-risk policies, perform pre-production review, and obtain owner's explicit production deployment approval.

## Rollback
- Reverting GitHub `main` alone is not sufficient if database constraints, grants or function signatures have changed.
- Prepare and test a database migration rollback, storage URL migration plan, and restore procedure **before** any production migration.
- Never execute `DROP POLICY`, `REVOKE`, change RPC signatures or rotate secrets against live production without a coordinated release window.

## References
- https://supabase.com/docs/guides/deployment/branching
- https://supabase.com/kb/troubleshooting/branch-in-migrations-failed-status
- https://supabase.com/docs/guides/database/database-linter
