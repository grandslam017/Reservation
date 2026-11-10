'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create, STAGING_PROJECT } = require('../staging/frontend/booking-api-adapter.js');

function mock({ authenticated = true, output = {}, invocationError = null } = {}) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: authenticated ? { access_token: 'fake-testing-token' } : null } }) },
    functions: { invoke: async (name, payload) => {
      calls.push({ name, payload });
      if (invocationError) return { data: null, error: invocationError };
      return { data: { success: true, environment: 'staging', ...output } };
    } },
  };
  return { api: create(client), calls };
}

test('adapter is explicitly restricted to staging', () => {
  assert.equal(STAGING_PROJECT, 'kssxxizhpoxxlbsehymk');
});
test('availability maps occupied slots without customer personal data', async () => {
  const { api, calls } = mock({ output: { busy_slots: [{ slot: '18:00 - 19:00' }] } });
  const r = await api.availability('2026-11-12');
  assert.equal(r.bookings.length, 1);
  assert.equal(r.bookings[0].name, '');
  assert.equal(r.bookings[0].phone, '');
  assert.equal(r.bookings[0].email, '');
  assert.deepEqual(r.busySlots, ['18:00 - 19:00']);
  assert.equal(calls[0].name, 'staging-booking-gateway');
  assert.equal(calls[0].payload.body.action, 'availability');
});
test('confirmed booking never implies bank payment verified', async () => {
  const { api, calls } = mock({ output: { booking_ids: ['fake-id'], invoice_no: 'INV.202611002', payment_verified: true } });
  const r = await api.confirm({ holdToken: 'fake-token', requestId: 'fake-request', name: 'Test', phone: '0812345678' });
  assert.equal(r.status, 'confirmed');
  assert.equal(r.paymentStatus, 'pending_verification');
  assert.equal(r.paymentVerified, false);
  assert.equal(calls[0].payload.body.action, 'confirm');
});
test('hold and release use staging gateway actions', async () => {
  const { api, calls } = mock({ output: { hold_token: 'fake-token', expires_at: '2026-11-12T18:00:00+07:00' } });
  await api.hold('2026-11-12', ['18:00 - 19:00']);
  await api.release('fake-token');
  assert.deepEqual(calls.map(x => x.payload.body.action), ['create', 'release']);
});
test('unauthenticated client does not call the gateway', async () => {
  const { api, calls } = mock({ authenticated: false });
  const r = await api.availability('2026-11-12');
  assert.equal(r.success, false);
  assert.equal(r.error, 'AUTH_REQUIRED');
  assert.equal(calls.length, 0);
});
test('rejects results from the wrong environment', async () => {
  const { api } = mock({ output: { environment: 'production' } });
  const r = await api.hold('2026-11-12', ['18:00 - 19:00']);
  assert.equal(r.success, false);
  assert.equal(r.error, 'UNTRUSTED_ENVIRONMENT');
});
test('fails safely on network error', async () => {
  const { api } = mock({ invocationError: { message: 'connection failed' } });
  const r = await api.hold('2026-11-12', ['18:00 - 19:00']);
  assert.equal(r.success, false);
  assert.equal(r.error, 'NETWORK_OR_GATEWAY_ERROR');
});
