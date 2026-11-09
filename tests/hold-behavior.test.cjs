'use strict';
// Isolated behavioral tests with mocked Supabase. No live database access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('async function createSlotHold(');
const end = source.indexOf('function startHoldTimer(', start);
assert.ok(start >= 0 && end > start);
const holdFunction = source.slice(start, end);

async function attemptHold({ connected = true, read = {}, inserted = {}, existing = [] } = {}) {
  const state = { bookings: [], currentHoldId: null, holdExpiresAt: null };
  const events = { reads: 0, inserts: 0, timer: 0, renders: 0 };
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    in: async () => {
      events.reads++;
      return { data: existing, error: read.error || null };
    },
    insert: async () => {
      events.inserts++;
      return { data: inserted.data || null, error: inserted.error || null };
    },
  };
  const sandbox = {
    supabaseClient: connected ? { from: () => query } : null,
    state,
    console: { error() {}, warn() {} },
    generateUUID: () => 'fixed-uuid',
    getRequireCoach: () => false,
    getSlotPrice: () => 350,
    startHoldTimer: () => { events.timer++; },
    renderTimeSlotsUI: () => { events.renders++; },
    Date,
  };
  vm.runInNewContext(holdFunction, sandbox);
  const result = await sandbox.createSlotHold('2026-12-01', ['18:00 - 19:00']);
  return { result, state, events };
}

test('without Supabase, no local hold is created', async () => {
  const r = await attemptHold({ connected: false });
  assert.equal(r.result, false);
  assert.equal(r.state.bookings.length, 0);
  assert.equal(r.events.timer, 0);
});

test('availability-read failure never becomes a successful hold', async () => {
  const r = await attemptHold({ read: { error: { message: 'network failure' } } });
  assert.equal(r.result, false);
  assert.equal(r.events.inserts, 0);
  assert.equal(r.state.bookings.length, 0);
});

test('database insert rejection never creates local hold', async () => {
  const r = await attemptHold({ inserted: { error: { code: '42501' } } });
  assert.equal(r.result, false);
  assert.equal(r.events.inserts, 1);
  assert.equal(r.state.bookings.length, 0);
});

test('active collision never inserts a second hold', async () => {
  const r = await attemptHold({ existing: [{ status: 'confirmed', time_slot: '18:00 - 19:00' }] });
  assert.equal(r.result, false);
  assert.equal(r.events.inserts, 0);
});

test('successful mock insert creates local display hold', async () => {
  const r = await attemptHold();
  assert.equal(r.result, true);
  assert.equal(r.events.inserts, 1);
  assert.equal(r.state.bookings.length, 1);
  assert.equal(r.events.timer, 1);
});
