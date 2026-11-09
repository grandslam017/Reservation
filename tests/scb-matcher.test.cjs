'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcile}=require('../staging/reconciliation/scb-matcher.cjs');
const date='2026-11-10T11:00:00+07:00';
test('candidate is suggested but never accepted as bank payment',()=>{
 const a=reconcile([{bookingId:'B-1',amount:350,slipTimestamp:date,
  slipReference:'TX-1'}],[{id:'bank-1',creditAmount:350,timestamp:date,reference:'TX-1'}]);
 assert.equal(a[0].status,'strong_candidate');
 assert.deepEqual(a[0].candidates,['bank-1']);
 assert.equal(a[0].requiresAdmin,true);
 assert.equal(a[0].paymentVerified,false);
});
test('equal credits for different customers are not auto-matched',()=>{
 const result=reconcile([{bookingId:'B-2',amount:350,slipTimestamp:date}],[
 {id:'bank-A',creditAmount:350,timestamp:date},
 {id:'bank-B',creditAmount:350,timestamp:date}]);
 assert.equal(result[0].status,'ambiguous_multiple_credits');
 assert.equal(result[0].candidates.length,2);
});
test('outbound debit and near-miss amount are never matches',()=>{
 const result=reconcile([{bookingId:'B-3',amount:350,slipTimestamp:date}],[
 {id:'d1',direction:'debit',creditAmount:350,timestamp:date},
 {id:'c1',direction:'credit',creditAmount:349.99,timestamp:date}]);
 assert.equal(result[0].status,'unmatched');
});
test('match window excludes unrelated days',()=>{
 const result=reconcile([{bookingId:'B-4',amount:700,slipTimestamp:date}],[
 {id:'c2',creditAmount:700,timestamp:'2026-11-11T14:00:00+07:00'}]);
 assert.equal(result[0].status,'unmatched');
});

test('one statement credit must not support two separate bookings',()=>{
 const result=reconcile([
 {bookingId:'B-A',amount:350,slipTimestamp:date},
 {bookingId:'B-B',amount:350,slipTimestamp:date}],
 [{id:'bank-1',creditAmount:350,timestamp:date}]);
 assert.equal(result[0].status,'ambiguous_shared_credit');
 assert.equal(result[1].status,'ambiguous_shared_credit');
});
test('same slip reference submitted for two bookings is flagged',()=>{
 const result=reconcile([
 {bookingId:'B-A',amount:350,slipTimestamp:date,slipReference:'TX-RPT'},
 {bookingId:'B-B',amount:350,slipTimestamp:date,slipReference:'TX-RPT'}],
 [{id:'bank-1',creditAmount:350,timestamp:date,reference:'TX-RPT'}]);
 assert.equal(result[0].status,'duplicate_slip_reference');
 assert.equal(result[1].status,'duplicate_slip_reference');
});
