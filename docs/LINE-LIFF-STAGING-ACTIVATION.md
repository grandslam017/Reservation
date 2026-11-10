# LINE LIFF staging activation checklist (owner action required)

**Scope:** The Grand Slam test frontend only. **Do NOT edit the existing customer LIFF app or its Endpoint URL**.

## Verified technical facts

- LINE Login supports multiple LIFF apps under the same Login channel (up to 30); each LIFF app has its own LIFF ID and Endpoint URL. Official docs: https://developers.line.biz/en/docs/liff/registering-liff-apps/
- `openid` scope is required for `liff.getIDToken()`. https://developers.line.biz/en/reference/liff/
- LINE Login and Messaging API channels should belong to the same LINE Provider for a consistent user ID. https://developers.line.biz/en/docs/liff/getting-started
- Verified raw ID tokens are sent to Staging Backend; no decoded profile or browser-supplied LINE User ID is trusted.

## Owner tasks (LINE Developers Console)

1. Open https://developers.line.biz/console/ and locate the existing **LINE Login** channel for the live The Grand Slam LIFF app. **Confirm its numeric Channel ID** and the LINE Provider name; the current Staging Backend expects Channel ID `2010398825` but this has not been independently verified in the console.
2. Verify that this LINE Login channel and the desired LINE OA **Messaging API** channel belong to the same Provider. If they are different, STOP and report this before any LINE messaging test. Do not move or replace the existing channels.
3. In the LINE Login channel's **LIFF** tab, select **Add** (do not edit the existing LIFF app). Give the new LIFF a clearly temporary name, e.g. "The Grand Slam — STAGING TEST".
4. Use `Full` display size (or the live app's existing size) and enable scopes `profile` and especially `openid`.
5. Set the new LIFF **Endpoint URL** to
   `https://kssxxizhpoxxlbsehymk.supabase.co/functions/v1/staging-original-ui-preview/`.
   Create the LIFF app, and copy its **new public LIFF ID** (not a secret).
6. Edit **only the newly created test LIFF** Endpoint URL and add the exact query parameter:
   `https://kssxxizhpoxxlbsehymk.supabase.co/functions/v1/staging-original-ui-preview/?testLiffId=NEW_TEST_LIFF_ID`
   Replace the placeholder with the actual new ID. The Staging UI accepts this explicit value only if its prefix matches the configured Login channel.
7. Open the **new test LIFF URL** (such as `https://liff.line.me/NEW_TEST_LIFF_ID`) from a consenting tester's LINE app. Do not replace any OA rich menu item, official reservation link or live LIFF endpoint.
8. Confirm LIFF login/profile appears and the Staging availability/pricing API returns results. Make a synthetic booking using a **sample slip image** (not a bank transfer). The Staging payment UI is masked and warns not to transfer money.
9. Separately validate LINE OA messaging with an explicitly permitted **test recipient** using approved test-only channel access credentials in **Supabase Staging secrets**. The worker is deliberately not deployed/enabled yet.
10. After the experiment, remove the temporary test LIFF if no longer needed; the customer's original LIFF remains unchanged.

## Important warnings

- Do **NOT** share LINE Channel Secrets, LINE OA Access Tokens, Supabase Service Role Keys or banking credentials in chat or GitHub.
- The public test LIFF ID is not a password; it is okay to supply the ID alone for test configuration/review.
- The Staging Preview URL by itself is not a valid LIFF entry point. Without `testLiffId` and the LINE consent/login flow, the booking UI intentionally stays unavailable.
- The original payment panel's visual placement is unchanged, but Staging masks live PromptPay information and says not to make a real payment.
- Staging bookings are NOT real court reservations. Do not invite regular customers to use the test LIFF.
- If a browser test fails, do not modify Production LIFF endpoint as a workaround.

## Acceptance tests to record

| Test case | Expected result |
| --- | --- |
| Existing customer LIFF URL | Opens live Production unchanged |
| Separate LIFF test URL | Opens staging original UI |
| LIFF ID not configured in Staging | Booking blocked; no fallback to live LIFF |
| Wrong LINE channel or malformed token | Staging API rejects |
| Valid test LINE token | PII-free availability and server pricing returned |
| Unpaid booking without slip | Rejected |
| Valid sample slip submitted by hold owner | Confirmed Booking, pending payment verification |
| Same hold/request retried | No duplicated booking or notification event |
| LINE OA message | Only authorized test recipient, when separately enabled |
| SCB/Sheets/Calendar | No real-world bank/Google writes from Staging |

## Current implementation status

The Stage frontend accepts a test LIFF ID as the `testLiffId` query parameter, requiring prefix `2010398825-`. This is a public configuration value; Backend verifies tokens via LINE and always checks the expected Login Channel. No separate LIFF app has been created via this repository or through the assistant. Owner's LINE Developer Console access is required.

GitHub Actions negative HTTP tests verify that invalid tokens, forged user IDs, unauthorized browser origins and unauthenticated Admin requests are rejected. All checks require no authentic LINE login and make no real booking.
