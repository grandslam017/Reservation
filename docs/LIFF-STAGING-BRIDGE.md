# LINE LIFF identity bridge and Booking Confirmed — STAGING

## Status (2026-11-09)

- Customer UI `index.html`, `style.css`, `charts.js` unchanged.
- `staging-liff-booking-gateway` deployed **only** to Supabase project `kssxxizhpoxxlbsehymk`; `verify_jwt=false` intentionally because LINE ID tokens are not Supabase JWTs. **Every action independently POST-verifies the LINE ID token against LINE before any database read/write**. Requests without valid tokens are rejected.
- LIFF currently uses an ID beginning `2010398825-...`; expected LINE Login channel ID in the gateway is `2010398825`. Verify the actual channel ID, LIFF `openid` scope and Messaging API provider relationship in LINE Developers before live user testing.
- The gateway hashes the verified LINE user ID to obtain a stable UUID owner. The LINE user ID itself is stored server-side on confirmed bookings for later messaging; it is never accepted as an asserted user identity from browser input.
- `staging/frontend/liff-api-adapter.js` added, headless, no new login screen; **not wired to original app.js yet**.
- On successful atomic confirmation, database writes `confirmed` booking, payment still unverified, and a single pending LINE notification outbox row in the same transaction. Repeating the same request key does not duplicate the notification.
- Added retry-safe outbox claiming and completion functions; SQL smoke test passed using a rollback-only synthetic event.
- Prepared `staging/functions/liff-line-notification-worker` which formats a Booking Confirmed message and uses LINE Push API with an idempotency retry key. **NOT DEPLOYED** and will not send messages until explicit staging LINE OA credentials and test-only recipient are configured and provider compatibility is verified.

## Before deploying LINE notification worker

1. Confirm the LIFF's LINE Login channel and OA Messaging API channel are under the SAME LINE Provider; otherwise LINE User IDs differ.
2. In LINE Developers Console confirm LIFF has `openid` permission; check the server's expected Channel ID matches the deployed LIFF ID.
3. Provide Staging-only environment secrets `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_STAGING_TEST_USER_ID`, and a random `STAGING_LINE_WORKER_SECRET` of at least 32 characters. **Never put tokens in GitHub, browser source or chat.** Configure through secured Supabase settings after verifying scope, not by pasting secrets into repository.
4. When staging secrets are properly set, deploy worker with `verify_jwt=true`, and trigger it only from a trusted backend scheduler using the separate worker secret (not from customer browser).
5. Test exactly one authorized test LINE recipient, confirm the OA can message them and no paid/over-limit messaging is used; reconcile LINE delivery API accepted vs actually received.
6. Gate production rollout separately. Do not send staging messages to real customers.

## Security and limitations

- LINE officially recommends sending *raw tokens* to servers rather than trusting LIFF profile user IDs: https://developers.line.biz/en/tips/2026/08/13/send-token-to-server/
- The browser's LIFF ID token is verified using `POST https://api.line.me/oauth2/v2.1/verify` with the expected channel ID on every request. The token is never logged or stored. No persistent Supabase customer account is necessary for the design.
- `verify_jwt=false` at Supabase gateway is NOT anonymous authorization: the Edge function itself must reject invalid LINE tokens. Do not remove this server-side validation.
- Additional anti-abuse protection for repeated INVALID tokens and rigorous HTTP end-to-end tests are pending. SQL and mocked JS tests alone are not comprehensive security proof.
- Outbox state `pending` means message **NOT YET SENT**. Even a LINE API accepted response is not proof of user delivery (blocked OA or other restrictions).
- LINE Push API `X-Line-Retry-Key` prevents repeated accepted sends with the same UUID within its validity window: https://developers.line.biz/en/docs/messaging-api/retrying-api-request
- Messages may consume OA quota depending on channel account limits. The user has forbidden extra expenses; never upgrade any plan.
- The existing website `app.js` is untouched by this bridge and is not yet connected to it. Existing LINE/GAS production behavior is unchanged.
