# The Grand Slam — Isolated customer UI preview

Last staged: 2026-11-09 (Thailand). **STAGING ONLY. NOT A CUSTOMER BOOKING LINK.**

## URL

https://kssxxizhpoxxlbsehymk.supabase.co/functions/v1/staging-original-ui-preview/

Served from `staging-original-ui-preview` Supabase Edge Function in staging project `kssxxizhpoxxlbsehymk`, using a snapshot of source from branch `security-hardening-2026-11-09`.

### Hosted files

The function serves four snapshot assets:
- `index.html` blob SHA `fdc5b532f6b5e622c16d16a4e6877a7c8b2f6010` — byte identical to main
- `style.css` blob SHA `95adf6316f05bb0408e161b199abaf9275a64d41` — byte identical to main
- `charts.js` blob SHA `6f691e14ddc887aab08cb36a9ecf0d2cb7d5de65` — byte identical to main
- `app.js` blob SHA `decf25ee304471046e79b99d848456da8282ce4d` — pinned to Staging and with LIFF adapter integration

This is **not** GitHub Pages, a new public production site, or a change to the original LINE LIFF endpoint. Static assets are public but no service-role secrets or LINE Channel Access Tokens are embedded.

## What the preview can do

- Display original customer UI from the same markup, styles and chart file.
- Attempt Staging API access only after the LINE Login SDK provides an ID token for the permitted channel. A plain browser not authorized for the LIFF channel may show disabled/unknown booking slots. This is expected, not a successful booking test.
- Use the owner-bound Staging API to check slots/rates and book after private slip upload, **only after valid LINE token verification**. Staging bookings do **not** reserve real courts or sync Production.
- Any confirmation message in Staging is queued only. Real LINE OA delivery is not yet connected.

## Verification

The GitHub Actions workflow `.github/workflows/security-staging.yml` fetches `index.html`, `style.css`, `charts.js`, `app.js` from the Staging URL and compares them byte-for-byte with the branch. **Wait for the CI result before claiming that the actual HTTP deployment works.** No browser E2E or actual LINE message delivery has been verified yet.

## Operational boundaries

Never change production LIFF Endpoint URL, Production Supabase, Production GAS URL, Google Sheets, calendars or GitHub Pages settings to make this test work. Testing LIFF requires a separately authorized test LIFF endpoint/channel configured by the owner under the correct LINE Provider. There is no paid hosting plan upgrade authorized. If the site cannot be opened under a valid test LIFF, test only markup/static assets and keep backend booking blocked.

This preview is a snapshot. When `app.js` is updated in GitHub, the Edge Function must be rebuilt from the branch files, and CI must verify asset equality before using the preview.

## Staging preview routing correction

The first Edge preview version returned the wrong asset for subpaths in the GitHub Actions HTTP parity check. Version 2 handles both the full `/functions/v1/...` pathname and the function-relative pathname returned by the Supabase Edge runtime. The HTTP parity check remains a required gate, not a warning. The production LIFF URL and GitHub Pages were not modified.

## HTTP path variant support (v3)

The Staging Edge preview now resolves static assets by their final pathname segment, whether the platform passes a full function path or a function-relative path. This is isolated to the Staging preview and is subject to the same HTTP byte-parity CI gate. No Production frontend or backend deployment is changed.

## Payment safety exception — preview only

The layout, markup and styling remain unchanged; however, **when the Staging JavaScript starts** it masks the real PromptPay QR/number and replaces bank transfer instructions with **"ทดสอบเท่านั้น ไม่ต้องโอนเงินจริง"**. No real SCB funds should be sent to test a booking. This is an intentional and necessary exception to identical runtime text in the payment panel. Production main is unchanged.

The hosted static `app.js` was refreshed in the Staging Edge preview to include this safeguard. CI verifies byte-parity of the deployed JS and tests the stage-only masking function. Real LINE Login and Messaging API end-to-end remain unverified.
