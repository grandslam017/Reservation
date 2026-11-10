# Admin booking commands — Staging only

Adds a separate authenticated backend for booking snapshots, admin notes, customer
details, coach flag, unpaid cancellation and unpaid rescheduling. Existing customer
and Admin screens are unchanged; this endpoint is not wired into those screens yet.

## Security and data flow

- Keep verify_jwt enabled. The handler additionally calls Auth getUser for each
  request and requires app_metadata.role=admin, refusing anonymous identities and
  user_metadata role claims. The verified actor ID is passed to service-only RPCs.
- Browser payloads cannot choose the actor or forwarding URL. Patch keys are an
  exact allowlist. Customer details cannot rewrite the LINE recipient identity.
- A snapshot hash protects against overwriting another administrator's update.
  A request UUID identifies one intent. Same intent/retry returns the saved result;
  a reused ID with a changed actor or payload receives a conflict.
- The booking change, audit snapshot and pending sync entry commit in one database
  transaction. Pending entries contain immutable before/after rows from the server.
- These functions do not send LINE, email or GAS requests, and do not edit Calendar
  or Sheets. No delivery worker consumes the new outbox yet. Pending sync is not
  evidence that an external update has been delivered.
- The private tables enable RLS and grant no browser access. RPC execution is
  restricted to service_role. The RPCs rely on the trusted Edge boundary for actor
  verification; do not grant execution to authenticated or anon.

## Commands

POST to staging-admin-bookings with an existing authenticated admin session:

- Snapshot: action=snapshot, booking_id=UUID.
- Mutation: action, booking_id, request_id=UUID, expected_hash, patch.

| Action | Exact patch fields |
|---|---|
| notes | admin_notes (string, up to 2000 characters) |
| coach | require_coach (boolean) |
| customer-details | customer_name, phone, email, car_plate |
| cancel | empty object |
| reschedule | booking_date, time_slot |

Cancellation and rescheduling refuse paid/disputed/refunded bookings and bookings
with linked financial entries. They return PAYMENT_REVIEW_REQUIRED rather than
silently deleting income or changing an already collected amount. Completing those
financial flows requires a separate reviewed refund/adjustment design.

Rescheduling enforces the existing server booking window and hourly slot rules;
price comes from the server tariff. The database unique index arbitrates conflicts
with holds and existing bookings. Expired holds may still block a destination until
the normal hold-cleanup path removes them; no hold is deleted by this endpoint.

## Frontend adapter

`staging/frontend/admin-booking-api.mjs` requires the Staging Supabase client and an
existing session. `snapshot(id)` fetches the current row/version. `prepare(snapshot,
action,patch)` copies the patch and creates one request ID. Retry execute() on the
same prepared object after uncertain network failures. Do not recreate the intent
automatically after a timeout, and do not silently overwrite STALE_BOOKING conflicts.
The adapter is headless and has not been connected to the existing screens.

## Verification

- Run node --test tests/*.test.cjs for mocked HTTP, client adapter and existing tests.
- staging/tests/admin_booking_commands_rollback.sql tests real PostgreSQL state
  transitions using synthetic rows and rolls back fixtures, audit and pending sync.
- Live authenticated HTTP checks must use disposable Staging accounts/fixtures,
  revoke/delete those accounts, reconcile and remove fixture operations, then
  disable the temporary test runner. Never put test credentials in this repository.
- Concurrent HTTP/SQL contention has not yet been tested for this endpoint. Sequential
  retries and stale edits are covered; do not label those concurrency proof.

The migration was created by Supabase CLI and is stored under staging/migrations.
Do not apply it to Production. The rollback helper refuses to drop the new tables
while operations or pending sync entries exist; reconcile their data first.
