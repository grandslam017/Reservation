'use strict';
// Phase-1 static regression guards. These do NOT replace end-to-end security tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const section = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Could not locate ${start} ... ${end}`);
  return source.slice(a, b);
};

test('hold creation fails closed without a database connection', () => {
  const body = section('async function createSlotHold(', 'function startHoldTimer(');
  assert.match(body, /if\s*\(!supabaseClient\)\s*\{[\s\S]*?return false;/);
});

test('hold creation does not continue on availability-read errors', () => {
  const body = section('async function createSlotHold(', 'function startHoldTimer(');
  assert.match(body, /if\s*\(checkError\)\s*\{[\s\S]*?return false;/);
});

test('hold creation does not continue on insert or network errors', () => {
  const body = section('async function createSlotHold(', 'function startHoldTimer(');
  assert.match(body, /if\s*\(error\)\s*\{\s*console\.error\("Supabase Hold Insert Error:", error\);\s*return false;/);
  assert.match(body, /catch\s*\(err\)\s*\{\s*console\.error\("Failed to sync hold to Supabase:", err\);\s*return false;/);
});

test('RPC missing must not run sequential writes', () => {
  const body = section('async function confirmBatchBookingsInSupabase(', 'async function fallbackSequentialSync(');
  assert.doesNotMatch(body, /return\s+await\s+fallbackSequentialSync\s*\(/);
  assert.match(body, /Required atomic booking RPC is unavailable/);
});

test('releasing browser hold targets pending_hold only', () => {
  const body = section('async function releaseSlotHold(', 'function ');
  assert.match(body, /\.delete\(\)\s*\.eq\('status',\s*'pending_hold'\)/);
});
