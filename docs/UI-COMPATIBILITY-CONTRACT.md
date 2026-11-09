# UI compatibility contract — The Grand Slam

**Owner requirement (2026-11-09): Customer-facing Web App must look and behave the same.**

## Source of truth

Use the **existing** production UI files as the only customer-facing design source:
- `index.html` — markup, existing booking and payment modals, Admin navigation
- `style.css` — original typography, spacing, colors, responsive layout
- `charts.js` — existing reports
- `app.js` — UI event flows, translations, DOM manipulation, legacy data operations

The standalone `staging/preview/index.html` is an **engineering harness only**, NOT the replacement for the user-facing Web App. It must never be substituted for `index.html`.

At creation time, GitHub `main` and `security-hardening-2026-11-09` had exactly identical blob SHAs for:
- `index.html`: `fdc5b532f6b5e622c16d16a4e6877a7c8b2f6010`
- `style.css`: `95adf6316f05bb0408e161b199abaf9275a64d41`
- `charts.js`: `6f691e14ddc887aab08cb36a9ecf0d2cb7d5de65`

GitHub Actions **compares these three files byte-for-byte against `origin/main`** on every staged change. A UI file change will fail the workflow instead of silently shipping a design change.

## Integration strategy: data adapters, no UI redesign

1. Keep existing page, date calendar, hourly slots, booking summary, customer information modal, QR/slip modal, success display, navbar, chart and Admin layout.
2. Replace only the underlying data providers for:
   - `fetchBookingsFromSupabase` → PII-free `getAvailability` API
   - `createSlotHold` → authenticated staging gateway create action
   - `confirmBatchBookingsInSupabase` → authenticated staging gateway confirm action
   - `releaseSlotHold` → authenticated staging gateway release action
   - server-owned pricing results → populate **the same** existing price labels and summary components
   - notification → server-side queued LINE/GAS delivery **after atomic commit**, never direct browser secret
3. Preserve booking success behavior: **Booking Confirmed immediately when database confirms**, while payment verification is independently pending. Never wait for Admin approval to allocate slot.
4. Do not display client PII to anonymous visitors; the existing calendar already uses generic booked/held status, so PII removal should not alter slot appearance.
5. The existing client LIFF identity is not automatically a Supabase Auth JWT. The stage gateway currently requires Supabase Auth. This must be solved securely before wiring the actual customer flow, without adding a confusing sign-in screen.
6. Keep the existing 3-minute Hold user experience. Retain a customer's confirmed slot while SCB payment review takes place, with a separate debt/dispute workflow.
7. Avoid installing duplicate client SDKs, replacing modals, or changing their visible order. If a functional change **necessarily** needs new UI, request explicit approval before altering visuals.

## Mandatory regression gates

- Check original HTML, CSS and chart JS are byte-for-byte unchanged against main (CI).
- Verify App JS syntax, existing CSS selector IDs and event handler binding.
- Browser visual comparison using the same test dates and viewport on desktop and mobile (not yet done).
- Customer walkthrough: slot select → existing booking modal → existing invoice/slip modal → Booking Confirmed → LINE message; price displayed must equal backend price (not yet done).
- Admin walkthrough: booking remains confirmed, payment pending; SCB reconciliation later, no double income entry (not yet done).
- No unauthorized direct SQL/Data API access or leak of phone/email/LINE IDs.
- CI status and UI acceptance review required before recommending Production. Never merge PR automatically.

## Existing staging restrictions

**No Production changes were authorized.** Edge gateway is active only for Staging `kssxxizhpoxxlbsehymk`. The original page remains served from the `main` branch. The new API is **not yet integrated into the original app.js**. The standalone engineering preview is not a visual-equivalence test.
