'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../staging/frontend/liff-api-adapter.js');
const token='signed.LINE.token';
const liff={isLoggedIn:()=>true,getIDToken:()=>token,getProfile:()=>({userId:'UATTACKER'})};
function mock(data={success:true,environment:'staging'}) {
 const calls=[];
 return {calls,fetcher:async(url,opts)=>{
  calls.push({url,body:JSON.parse(opts.body)});
  return {ok:true,json:async()=>data};
 }};
}
test('LIFF token is sent, never user ID from liff.getProfile',async()=>{
 const {calls,fetcher}=mock({success:true,environment:'staging',busy_slots:[{slot:'12:00 - 13:00'}]});
 const r=await create(liff,fetcher).availability('2026-11-12');
 assert.equal(calls[0].body.line_id_token,token);
 assert.equal(calls[0].body.userId,undefined);
 assert.equal(r.bookings[0].name,'');
 assert.equal(r.bookings[0].phone,'');
});
test('do not call server without logged in LIFF session',async()=>{
 const {calls,fetcher}=mock();
 const r=await create({isLoggedIn:()=>false,getIDToken:()=>token},fetcher).hold('2026-11-12',['12:00 - 13:00']);
 assert.equal(r.error,'LINE_LOGIN_REQUIRED');assert.equal(calls.length,0);
});
test('missing openid ID token fails closed',async()=>{
 const {calls,fetcher}=mock();
 const r=await create({isLoggedIn:()=>true,getIDToken:()=>null},fetcher).hold('2026-11-12',['12:00 - 13:00']);
 assert.equal(r.error,'LINE_OPENID_SCOPE_REQUIRED');assert.equal(calls.length,0);
});
test('booking confirmed independently of payment and message delivery',async()=>{
 const {fetcher}=mock({success:true,environment:'staging',
  booking_ids:['synthetic-1'],invoice_no:'INV.202611042',line_notification:'queued'});
 const r=await create(liff,fetcher).confirm({
  holdToken:'mock',requestId:'mock',name:'Synthetic',phone:'0812345678'
 });
 assert.equal(r.status,'confirmed');
 assert.equal(r.paymentVerified,false);
 assert.equal(r.paymentStatus,'pending_verification');
 assert.equal(r.notificationQueued,true);
});
test('different environment result refused',async()=>{
 const {fetcher}=mock({success:true,environment:'production'});
 const r=await create(liff,fetcher).hold('2026-11-12',['12:00 - 13:00']);
 assert.equal(r.error,'WRONG_ENVIRONMENT');
});
