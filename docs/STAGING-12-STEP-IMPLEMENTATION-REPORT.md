# The Grand Slam — 12-Step Staging Implementation and Release Gates

**Date:** 2026-11-09 (Asia/Bangkok). **Scope:** Supabase Staging `kssxxizhpoxxlbsehymk` and GitHub branch `security-hardening-2026-11-09` / Draft PR #1 ONLY.
**Production:** Supabase `eqwmodrhorcbwsshbepg` and GitHub `main`; DO NOT MODIFY, MERGE, DEPLOY, CHANGE GAS/LINE OR UPGRADE without a new explicit owner approval.

## Feature parity matrix

| Original customer feature | Staging target | Verification |
|---|---|---|
| Same Thai/English headers, navigation and CSS | `index.html`, `style.css`, `charts.js` byte-identical | GitHub Actions check passed |
| Monthly calendar, 08:00–23:00 hourly court slots | PII-free availability API | SQL and adapter tests; browser E2E pending |
| Slot hold timer | 3-minute owner-bound hold with atomic DB uniqueness | SQL tests pass |
| Booking wizard, name/phone/email, coach toggle | Same wizard visually; secure backend data validation | Existing UI unchanged, adapter not wired yet; coach migration pending |
| QR/slip workflow | Private JPEG/PNG ≤1MB, magic-byte validation, LINE-verified owner/hold binding | SQL and source tests; actual HTTP file upload pending |
| Booking Confirmed immediately | Confirm on DB commit even if payment pending | SQL tests pass; customer UI E2E pending |
| LINE confirmation | Outbox in same DB transaction; prepared test-recipient-only worker | SQL tests; real LINE delivery NOT tested or enabled |
| Admin booking management | Server-side verified admin authorization needed | Protected admin pricing gateway exists; booking cancellation/admin UI parity pending |
| Dynamic pricing | Per-hour settings and dated day-of-week promotions; 99 THB example preserved | SQL regression pass; isolated admin UI implemented |
| SCB reconciliation | Pure candidate matcher; Admin confirms actual bank credit | Mock tests; real statement formats not validated |
| Google Sheets/Calendar and GAS | No-network mock integration; no live endpoints | Mock tests pass; isolated real Google test resources pending |
| Finance & reporting | Booking/payment status split; receipt on manual verification | SQL pass; deposits/advance revenue and FlowAccount integration pending |
| Calendar week view, search, user notes and notifications | Preserve existing interactions | No E2E completed; feature parity gate open |

## 12-step status

1. **Audit original workflow — IN PROGRESS:** reviewed `app.js` source including LIFF identity, booking/hold, slip upload and GAS notification. Need exhaustive regression inventory and admin feature walk-through.
2. **Secure LIFF verification — PARTIAL:** deployed `staging-liff-booking-gateway`; verifies ID token with LINE, maps to owner UUID. No staging LINE console credential/provider audit, HTTP E2E or invalid-token load testing completed. LINE channel ID inferred from LIFF ID and **MUST be independently confirmed** before customer test.
3. **New backend + unchanged customer UI — PARTIAL:** headless LIFF adapter created, independent from original UI; `app.js` has NOT been fully wired because existing synchronous direct DB flows require controlled migration and test URL.
4. **Confirmed booking, pending payment — SQL VERIFIED:** owner-bound hold + slip required, confirmed slot locked, payment pending, no income before verification.
5. **LINE OA confirmation — PARTIAL:** outbox / claim / delivery result functions and formatting + tests; worker is a **source artifact, NOT DEPLOYED**. Do not send real customer messages.
6. **Dynamic Pricing — PARTIAL:** per-hour prices, weekly/date promotions, priority, audit trail, service-role-only API, Admin-only Edge Function deployed, isolated Staging Admin pricing page written. Live Admin credentials, browser interactions and existing frontend price labels not yet tested.
7. **SCB Semi-Auto — PARTIAL:** private slip storage and staging upload Edge Function deployed; no-fee pure JavaScript statement candidate matcher added; SCB statement importer and bank proof review UI remain pending. Never auto-mark paid from OCR.
8. **Accounting — PARTIAL:** unpaid booking separate from manual verification with transaction deduplication. Accounting policy for advance receipts vs recognized court income needs accountant review; existing app may show receipt prematurely.
9. **GAS / Sheets / Calendar — MOCKED ONLY:** created network-free `staging/integrations/google-gas-mock.cjs`; no contact with or modification of real GAS, Google Sheets, Calendar. True staging Google integration requires separate test-only resources and permissions.
10. **Security/End-to-End — PARTIAL:** SQL rollback tests for collision, owner boundary, idempotency, slip, payments, promo; Node mocked CI tests. Real LINE login, mobile/desktop browser, upload HTTP test, failure injection and concurrent HTTP test still pending.
11. **UI parity — STATIC PASS, VISUAL PENDING:** exact `index.html`, `style.css`, `charts.js` match main, verified by CI. Dynamic DOM and screenshot comparisons still needed. Isolated `staging/preview` and `staging/admin` are *engineering tools*, NOT customer UI replacements.
12. **Release/rollback — PLAN WRITTEN, RELEASE BLOCKED:** feature branch and Draft PR ready for review; no merge/deployment approval. Production backups, restore rehearsal, secret rotation and controlled migration not yet done.

## Deployment safeguards — Mandatory before any Production authorization

1. Verify staging LIFF ID Token's actual LINE Login channel, provider and `openid` scope. Confirm Messaging API channel shares the same provider and can reach only authorized staging test recipient.
2. Use **server-held secrets** in project settings; NEVER place service-role, LINE OA token or GAS HMAC secret in GitHub Pages, browser source, code repository or chat. Secret rotation for Production is a separate deployment decision.
3. Verify original customer frontend functionality and pixel parity with Playwright/manual screenshots on desktop, iOS and Android and across English/Thai; Admin changes must not affect customer UI.
4. Confirm server pricing appears in the *existing* summary label and matches final booking fee. Confirm the existing app does not generate `R.` receipt before verified payment.
5. Verify slip format/size, owner authentication, hold expiration and happy-path HTTP with synthetic images. Confirm private storage access rules and no URL/PII leaks.
6. Stress test concurrent bookings, duplicate retries, late slip, mobile refresh, LINE unavailable, SCB unpaid, repeat GAS events and storage failures. Confirm idempotent notification delivery and appropriate retry limits.
7. Validate actual booking confirmation through a **test-only** LINE user with informed consent, and never assert delivery solely from an accepted API response.
8. Isolate test Google Calendar, Sheets and GAS project IDs completely. Verify read/write boundaries and retry behavior using synthetic records. Do not use existing Production GAS URL for tests.
9. Agree on future-date advance payment accounting rules, receipt timing, tax document retention and PDPA data minimization. Admin must manually verify actual SCB credits.
10. Final security advisors and scope review, backup/restore verification, database migration diff, traffic/cost capacity checks and an explicit Production cutover+rollback rehearsal.
11. Present owner with PASS/FAIL and open risks. **Stop** before GitHub merge or production deployment; seek a separate explicit signed-off approval.

## Reversible Staging rollback

- GitHub: revert feature branch commits or close Draft PR; `main` remains unchanged.
- Staging: migrations are additive; prefer restore/recreate only the dedicated staging project from versioned migration files when an isolated reset is necessary. Never run generic DROP statements against Production.
- If a Staging Edge Function fails: redeploy prior verified version or disable the Staging test endpoint. Production still uses its existing endpoint/credentials.
- Paid resources: none authorized. Project must stay on Supabase Free and existing LINE OA plan; do not request upgrades.
