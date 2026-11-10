# The Grand Slam — staging test client

**For authorized testing only. Never use real customer details or production payment slips.**

The files under `staging/preview/` are NOT deployed to GitHub Pages automatically. They use the staging publishable key only (a public client key), never the privileged service-role key.

## Running locally

1. Download this branch to a separate directory, outside the live website checkout.
2. Start a local static server from the repository root: `python -m http.server 5173`.
3. Open `http://localhost:5173/staging/preview/`.
4. Sign in with a staging Supabase Auth test account. The preview currently offers `signInAnonymously`; if Staging Auth anonymous sign-ins are disabled, enable them **only for staging** in the dashboard, or develop an approved alternative test login. Do not change Production Auth settings.
5. Select a synthetic date/slot; inspect availability, create and release a Hold, then confirm using **fake** customer information.
6. Inspect Staging Table Editor to confirm booking and payment statuses. The Edge gateway returns `payment_verified: false` until a separately authorized admin manually verifies payment.

## Important current constraints

- No actual payment processing or slip review is connected to this test client.
- Staging admin users must be provisioned with trusted `app_metadata.role = 'admin'` by a privileged owner. **Never** use user-editable metadata for authorization.
- The gateway accepts only authenticated JWTs; anonymous Staging Auth may need to be enabled first. Use bot/CAPTCHA protections before any real public customer use.
- Pricing supports regular 250 THB (08:00–16:00), 350 THB (16:00–23:00) and the defined 99 THB weekday 12:00–14:00 promotion until November 30, 2026. Coach and new campaigns need separate review.
- Full one-hour slots only. Current website's time-slot generation matches 08:00–23:00 hourly; other clients must not assume support for half hours.
- The test gateway explicitly refuses to operate in the Production Supabase project.
- User-facing consent/PDPA information, payment verification, cancellations, GAS/LINE notifications, backup/rollback and complete browser E2E must pass before a Production proposal.

## Current artifacts

- [Staging gateway](../functions/booking-gateway/index.ts)
- [Staging SQL migrations](../migrations/)
- [Owner + finance SQL tests](../tests/booking_owner_payment_v2.sql)
- [Security rollout plan](../../docs/SECURITY-ROLLOUT.md)
