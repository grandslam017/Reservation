# Staging customer UI integration checkpoint

Date: 2026-11-09

The original customer Web App HTML, CSS and chart files are unchanged. The staging feature branch now includes a LIFF staging API adapter in app.js. The customer calendar, hold, price, slip upload and final confirmation actions route to Supabase Staging only.

The branch disables the production GAS endpoint and pins the Supabase Staging project. The UI shows payment review pending after a successful booking. Missing server availability or prices prevent a new booking. The weekly grid does not present unverified dates as available.

GitHub automated regression completed successfully at commit d295291fb94374e984985ccce667bcf65c026646. This verifies syntax, mocked behavior and byte-identical HTML/CSS/chart assets. It does not prove successful real-world LINE LIFF login, private file HTTP upload, browser layout, LINE OA message delivery, or existing Admin feature parity.

Do not merge to main, change the live LIFF URL, connect Google GAS Production or deploy Production. Browser and real LINE test account end-to-end testing remain pending.
