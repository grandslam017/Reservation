'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const mod = import('../staging/functions/liff-booking-gateway/line-security.mjs');
const userId='U1234567890abcdef1234567890abcdef';
const channelId='2010398825';
const rawToken='header.payload.signature.'+'x'.repeat(150);
const valid=()=>({iss:'https://access.line.me',sub:userId,aud:channelId,exp:Math.floor(Date.now()/1000)+300,iat:Math.floor(Date.now()/1000)-10});
const fake=(claims,status=200)=>async(_url,options)=>({ok:status===200,status,json:async()=>claims,params:options.body});

test('reject short, malformed or missing LINE ID token without contacting LINE',async()=>{
 const {verifyLineIDToken}=await mod;let called=0;
 const r=await verifyLineIDToken('bad',channelId,async()=>{called++;throw Error('must not call')});
 assert.equal(r.ok,false);assert.equal(called,0);
});
test('accept only verified channel, expiry, issuer and subject claims',async()=>{
 const {verifyLineIDToken}=await mod;
 const good=await verifyLineIDToken(rawToken,channelId,fake(valid()));
 assert.deepEqual(good,{ok:true,lineUserId:userId});
 for(const claims of [{...valid(),aud:'00000000'},{...valid(),exp:0},{...valid(),iss:'https://attacker.example'},{...valid(),sub:'U123'},{...valid(),iat:Math.floor(Date.now()/1000)+900}]){
   const bad=await verifyLineIDToken(rawToken,channelId,fake(claims));
   assert.equal(bad.ok,false);
 }
});
test('send token to LINE server for verification and expected server-only channel',async()=>{
 const {verifyLineIDToken}=await mod;let url,body,method;
 await verifyLineIDToken(rawToken,channelId,async(u,o)=>{url=u;body=o.body;method=o.method;return{ok:true,json:async()=>valid()}});
 assert.equal(method,'POST');
 assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');
 assert.equal(new URLSearchParams(body).get('client_id'),channelId);
 assert.equal(new URLSearchParams(body).get('id_token'),rawToken);
});
test('reject LINE endpoint failure and unreachable LINE endpoint',async()=>{
 const {verifyLineIDToken}=await mod;
 assert.equal((await verifyLineIDToken(rawToken,channelId,fake({},400))).ok,false);
 assert.equal((await verifyLineIDToken(rawToken,channelId,async()=>{throw Error('timeout')})).error,'LINE_VERIFICATION_UNAVAILABLE');
});
test('deterministic owner UUID must change with verified LINE identity',async()=>{
 const {actorIdFromVerifiedLineId}=await mod;
 const a=await actorIdFromVerifiedLineId(userId),b=await actorIdFromVerifiedLineId(userId);
 assert.equal(a,b);assert.match(a,/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
 const c=await actorIdFromVerifiedLineId('Uffffffffffffffffffffffffffffffff');
 assert.notEqual(a,c);
 await assert.rejects(()=>actorIdFromVerifiedLineId('attacker'));
});
