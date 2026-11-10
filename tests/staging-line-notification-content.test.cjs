'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formatBookingConfirmedMessage}=require('../staging/functions/liff-line-notification-worker/message.mjs');
const valid={kind:'booking_confirmed',booking_status:'confirmed',payment_status:'pending_verification',invoice_no:'INV.TEST',booking_date:'2026-11-15',slots:['08:00 - 09:00'],amount:250};
test('LINE message contains booking info but never marks SCB payment verified',()=>{
 const s=formatBookingConfirmedMessage(valid);
 assert.match(s,/Booking Confirmed/);
 assert.match(s,/2026-11-15/);
 assert.match(s,/08:00 - 09:00/);
 assert.match(s,/250/);
 assert.match(s,/รอตรวจสอบยอดโอน/);
 assert.doesNotMatch(s,/ชำระเงินสำเร็จ|ตรวจสอบยอดโอนแล้ว/);
});
test('invalid notification payload is never formatted for delivery',()=>{
 for(const p of [null,{}, {...valid,kind:'test'}, {...valid,booking_status:'pending_hold'}, {...valid,slots:[]}, {...valid,amount:'not-a-number'}]){
  assert.throws(()=>formatBookingConfirmedMessage(p));
 }
});
test('worker is fail-closed and fixed to one staging recipient',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const s=fs.readFileSync(path.join(__dirname,'../staging/functions/liff-line-notification-worker/index.ts'),'utf8');
 assert.match(s,/STAGING_LINE_SEND_ENABLED/);
 assert.match(s,/YES_ONE_TEST_RECIPIENT/);
 assert.match(s,/STAGING_LINE_SENDING_DISABLED/);
 assert.match(s,/job\.line_user_id!==testUser/);
 assert.match(s,/to:testUser/);
 assert.match(s,/X-Line-Retry-Key/);
 assert.match(s,/kssxxizhpoxxlbsehymk/);
});
