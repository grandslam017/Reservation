'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ADMIN='11111111-1111-4111-8111-111111111111',BOOKING='22222222-2222-4222-8222-222222222222';
const REQUEST='33333333-3333-4333-8333-333333333333',HASH='a1'.repeat(32);
async function fixture(overrides={}){
 const {createHandler,STAGING_URL}=await import('../staging/functions/staging-admin-bookings/handler.mjs');
 const calls=[];const deps={url:STAGING_URL,
  getUser:async()=>({id:ADMIN,app_metadata:{role:'admin'}}),rateLimit:async()=>true,
  snapshot:async(...args)=>{calls.push(['snapshot',...args]);return {success:true,booking:{id:BOOKING},snapshot_hash:HASH};},
  command:async args=>{calls.push(['command',args]);return {success:true,booking_id:BOOKING,sync_state:'pending',external_effects_performed:false};},...overrides};
 const handler=createHandler(deps);
 const send=async(body={action:'snapshot',booking_id:BOOKING},headers={Authorization:'Bearer session'},method='POST')=>{
  const res=await handler(new Request('https://example.com',{method,headers,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  return {status:res.status,body:res.status===204?null:await res.json(),headers:res.headers};};
 return {send,calls,deps};
}
const command=()=>({action:'notes',booking_id:BOOKING,request_id:REQUEST,expected_hash:HASH,patch:{admin_notes:'Synthetic'}});
test('no session, expired session, ordinary customer and anonymous admin are denied before DB access',async()=>{
 let f=await fixture();assert.equal((await f.send(undefined,{})).status,401);
 for(const user of [null,{id:ADMIN,user_metadata:{role:'admin'},app_metadata:{}},{id:ADMIN,is_anonymous:true,app_metadata:{role:'admin'}}]){
  f=await fixture({getUser:async()=>user});assert.ok([401,403].includes((await f.send()).status));assert.equal(f.calls.length,0);
 }
});
test('live app metadata role is checked again on every request',async()=>{
 let role='admin';const f=await fixture({getUser:async()=>({id:ADMIN,app_metadata:{role}})});
 assert.equal((await f.send()).status,200);role='customer';assert.equal((await f.send()).status,403);assert.equal(f.calls.length,1);
});
test('production project, foreign origins and unsupported methods are refused',async()=>{
 let f=await fixture({url:'https://eqwmodrhorcbwsshbepg.supabase.co'});assert.equal((await f.send()).status,503);
 f=await fixture();assert.equal((await f.send(undefined,{Authorization:'Bearer session',Origin:'https://example.com'})).status,403);
 assert.equal((await f.send(undefined,{},'GET')).status,405);assert.equal(f.calls.length,0);
});
test('snapshot uses authenticated admin rather than an actor supplied by browser',async()=>{
 const f=await fixture();const r=await f.send({action:'snapshot',booking_id:BOOKING,p_admin:BOOKING});
 assert.equal(r.status,200);assert.equal(r.body.environment,'staging');assert.deepEqual(f.calls[0],['snapshot',ADMIN,BOOKING]);
});
test('mutations forward only the explicit command and verified actor',async()=>{
 const f=await fixture();const r=await f.send({...command(),p_admin:BOOKING,fee:0,gasUrl:'https://attacker.test',recipient:'attacker'});
 assert.equal(r.status,200);assert.equal(r.body.sync_state,'pending');assert.equal(r.body.external_effects_performed,false);
 assert.deepEqual(f.calls[0],['command',{p_admin:ADMIN,p_request_id:REQUEST,p_booking_id:BOOKING,p_action:'notes',p_patch:{admin_notes:'Synthetic'},p_expected_hash:HASH}]);
});
test('unknown action, invalid ID, missing version/request and array patch are refused',async()=>{
 for(const input of [{...command(),action:'backup'},{...command(),booking_id:'bad'},{...command(),request_id:''},{...command(),expected_hash:''},{...command(),patch:[]},[]]){
  const f=await fixture();assert.equal((await f.send(input)).status,400);assert.equal(f.calls.length,0);
 }
});
test('oversize UTF-8 and malformed JSON never reach DB',async()=>{
 const f=await fixture();assert.equal((await f.send('x'.repeat(8193))).status,413);
 assert.equal((await f.send('ก'.repeat(3000))).status,413);
 assert.equal((await f.send('{')).status,400);assert.equal(f.calls.length,0);
});
test('rate limiting fails closed without mutating bookings',async()=>{
 const f=await fixture({rateLimit:async()=>false});assert.equal((await f.send(command())).status,429);assert.equal(f.calls.length,0);
});
test('stale edits, collisions, payment review and idempotency conflicts receive HTTP 409',async()=>{
 for(const error of ['STALE_BOOKING','COLLISION','PAYMENT_REVIEW_REQUIRED','IDEMPOTENCY_CONFLICT']){
  const f=await fixture({command:async()=>({success:false,error})});const r=await f.send(command());assert.equal(r.status,409);assert.equal(r.body.error,error);
 }
});
test('unknown database errors and exception details never leak',async()=>{
 let f=await fixture({command:async()=>({success:false,error:'PRIVATE_DETAILS'})});assert.equal((await f.send(command())).body.error,'BOOKING_COMMAND_REJECTED');
 f=await fixture({command:async()=>{throw Error('PRIVATE_DETAILS');}});assert.deepEqual((await f.send(command())).body,{error:'ADMIN_BOOKING_UNAVAILABLE'});
});
test('only the trusted staging origin receives CORS permissions',async()=>{
 const f=await fixture();const r=await f.send(undefined,{Origin:'https://illustrious-alfajores-364eb8.netlify.app'},'OPTIONS');assert.equal(r.status,204);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://illustrious-alfajores-364eb8.netlify.app');
});
