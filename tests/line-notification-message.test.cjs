'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const mod=import('../staging/functions/liff-line-notification-worker/message.mjs');
test('queued booking uses Booking Confirmed but not paid',async()=>{
 const {formatBookingConfirmedMessage}=await mod;
 const s=formatBookingConfirmedMessage({kind:'booking_confirmed',
  booking_status:'confirmed',payment_status:'pending_verification',
  invoice_no:'INV.202611015',booking_date:'2026-11-15',
  slots:['18:00 - 19:00','19:00 - 20:00'],amount:700});
 assert.match(s,/Booking Confirmed/);
 assert.match(s,/INV.202611015/);
 assert.match(s,/700/);
 assert.match(s,/รอตรวจสอบยอดโอน/);
 assert.doesNotMatch(s,/ชำระเงินสำเร็จ/);
});
test('refuse to send event when not confirmed',async()=>{
 const {formatBookingConfirmedMessage}=await mod;
 assert.throws(()=>formatBookingConfirmedMessage({kind:'booking_confirmed',
  booking_status:'pending_hold'}),/INVALID_BOOKING_EVENT/);
});
