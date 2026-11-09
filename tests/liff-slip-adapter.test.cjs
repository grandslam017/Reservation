'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../staging/frontend/liff-api-adapter.js');
const liff={isLoggedIn:()=>true,getIDToken:()=> 'test.LINE.token'};
test('private slip is sent only to staging upload endpoint and is not marked paid',async()=>{
 let endpoint,body,method;
 const api=create(liff,async(url,options)=>{endpoint=url;body=options.body;method=options.method;
  return {ok:true,json:async()=>({success:true,environment:'staging',slip_received:true,payment_verified:false})}});
 const file=new Blob([new Uint8Array(20).fill(1)],{type:'image/png'});
 const res=await api.uploadSlip({holdToken:'synthetic-hold',file});
 assert.match(endpoint,/kssxxizhpoxxlbsehymk\.supabase\.co\/functions\/v1\/staging-liff-slip-upload$/);
 assert.equal(method,'POST');
 assert.equal(body.get('line_id_token'),'test.LINE.token');
 assert.equal(body.get('hold_token'),'synthetic-hold');
 assert.equal(res.payment_verified,false);
});
test('reject absent LINE session or oversized slip without network request',async()=>{
 let called=0;
 const api=create({isLoggedIn:()=>false,getIDToken:()=>null},async()=>{called++;throw Error('unexpected')});
 const res=await api.uploadSlip({holdToken:'synthetic',file:new Blob([new Uint8Array(20)])});
 assert.equal(res.error,'LINE_LOGIN_REQUIRED');
 const api2=create(liff,async()=>{called++;throw Error('unexpected')});
 const res2=await api2.uploadSlip({holdToken:'synthetic',file:new Blob([new Uint8Array(1048577)])});
 assert.equal(res2.error,'INVALID_SLIP');assert.equal(called,0);
});
