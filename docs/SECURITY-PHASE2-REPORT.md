# Security development status — 9 November 2026

## What was changed (STAGING + Draft PR only)

- Created isolated Supabase Staging project `kssxxizhpoxxlbsehymk` under Free plan, independently from Production `eqwmodrhorcbwsshbepg`.
- Built `booking_internal` schema and service-role-only staging RPCs to manage 3-minute holds and atomic booking confirmation.
- Introduced V2 owner enforcement: each hold is linked to the verified Supabase user ID (the Edge Function derives it from Auth).
- Rate limiter protects user action quotas in PostgreSQL. This does **not** yet provide comprehensive anti-abuse protection against mass registration.
- Server-side pricing: standard 250/350 THB and existing weekday 99 THB/1h 12:00–14:00 through 2026-11-30.
- Split reservation confirmation from payment verification: no income transaction on initial unpaid reservation; only a verified admin action creates income, with duplicate protection.
- Created private `grandslam-staging-slips` storage bucket accepting JPEG/PNG up to 1MB; owner/admin READ policies and owner-folder INSERT policy. Real slip-upload UI and admin review are not yet wired.
- Deployed Edge Function `staging-booking-gateway` (v3, `verify_jwt=true`), pinned npm dependency and restricted to staging URL at runtime.
- Added a separate static preview page and GitHub Actions security regression workflow to the Draft PR.

## Verified checks

- SQL with rollback: hold/create/confirm/release, collision, expired hold, different-owner rejection, idempotency, pricing, request rate limit, unpaid booking has no income, verified admin accounting creates exactly one income item.
- Two simultaneously sent SQL hold requests for the same slot returned one success and one collision.
- Live Staging permission metadata confirmed `anon`/`authenticated` cannot execute staging RPCs; `service_role` can invoke designated V2 RPCs; old V1 is no longer granted to the backend.
- Staging Security Advisor: 2 expected INFO, **no WARN in latest check**. Performance Advisor: 1 INFO about initially unused owner index.
- GitHub Actions Node regression job reported **success** after adding the staging workflow.
- Production Supabase project remained `ACTIVE_HEALTHY` at last status check. No Production migrations/secrets/RLS changes; PR remains Draft, unmerged.

## Not yet completed / MUST NOT DEPLOY

1. HTTP end-to-end authentication and booking path is **not yet verified** with real test-user tokens. Anonymous Supabase Auth may be disabled in Staging; the connector cannot change that setting. Staging preview has not been hosted or browser-tested. The Edge Function deployment status ACTIVE is not equivalent to end-to-end success.
2. Payment slip upload and **admin review UI** still need integration; backend can mark verified payments but no validated real-payment proof mechanism exists.
3. Admin role must be explicitly provisioned in Staging Auth app_metadata; no admin user has been configured via this workflow.
4. GAS HMAC secret is visible in public production JavaScript. Rotation and migration to trusted backend are pending explicit Production approval and compatible GAS changes.
5. LINE OA and Google Apps Script notifications need authorized access/integration testing, and special conditions (refunds, coach, cancellation) need feature parity review.
6. Backups and restoration must be verified for Production (including object Storage), with rehearsed deployment/rollback and monitoring plan. No Production deployment may occur before separate explicit owner authorization.
7. Test against mobile/desktop browsers, multiple concurrent clients, attacker/anonymous traffic, network failures, timeout and quota/abuse scenarios. Server pricing and campaign semantics must be owner-reviewed before production.

## Links

- Draft PR: https://github.com/grandslam017/Reservation/pull/1
- Staging project: https://supabase.com/dashboard/project/kssxxizhpoxxlbsehymk
- Staging gateway: https://supabase.com/dashboard/project/kssxxizhpoxxlbsehymk/functions
