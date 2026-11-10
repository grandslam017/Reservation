'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','staging/functions/liff-line-notification-worker/index.ts'),'utf8');
test('notification worker never sends without explicit allow-to-send secret',()=>{
 assert.match(src,/STAGING_LINE_SEND_ENABLED/);
 assert.match(src,/YES_ONE_TEST_RECIPIENT/);
 assert.match(src,/STAGING_LINE_SENDING_DISABLED/);
});
test('notification worker is locked to one LINE user and same Staging project',()=>{
 assert.match(src,/kssxxizhpoxxlbsehymk/);
 assert.match(src,/LINE_STAGING_TEST_USER_ID/);
 assert.match(src,/job\.line_user_id!==testUser/);
 assert.match(src,/to:testUser/);
 assert.match(src,/STAGING_LINE_WORKER_SECRET/);
 assert.match(src,/x-worker-secret/);
});
test('worker uses idempotent LINE retry key and state-transition RPC',()=>{
 assert.match(src,/X-Line-Retry-Key/);
 assert.match(src,/staging_claim_specific_line_notification/);
 assert.match(src,/staging_complete_line_notification/);
});

test('worker cannot drain the old queue without an explicitly selected event key',()=>{
 assert.match(src,/SPECIFIC_EVENT_REQUIRED/);
 assert.match(src,/staging_claim_specific_line_notification/);
 assert.doesNotMatch(src,/db\.rpc\("staging_claim_line_notification"/);
 assert.match(src,/p_event_key:eventKey,p_recipient:testUser/);
});
