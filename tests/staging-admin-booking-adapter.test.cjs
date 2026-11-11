'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ID='22222222-2222-4222-8222-222222222222',HASH='a1'.repeat(32);
const snapshot={success:true,environment:'staging',booking:{id:ID},snapshot_hash:HASH};
async function fixture(overrides={}){
 const calls=[];const client={supabaseUrl:'https://kssxxizhpoxxlbsehymk.supabase.co',auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})},
  functions:{invoke:async(name,{body})=>{calls.push({name,body});return {data:{...snapshot,...(body.action==='snapshot'?{}:{operation_id:body.request_id,sync_state:'pending',external_effects_performed:false})},error:null};}},...overrides};
 const {createAdminBookingAPI}=await import('../staging/frontend/admin-booking-api.mjs');return {api:createAdminBookingAPI(client),calls,client};
}
test('admin adapter is locked to Staging and an existing authenticated session',async()=>{
 await assert.rejects(()=>fixture({supabaseUrl:'https://production.test'}),/STAGING_CLIENT_REQUIRED/);
 const f=await fixture({auth:{getSession:async()=>({data:{session:null}})}});await assert.rejects(f.api.snapshot(ID),/ADMIN_LOGIN_REQUIRED/);assert.equal(f.calls.length,0);
});
test('adapter snapshots through the authenticated backend rather than a direct table query',async()=>{
 const f=await fixture();assert.deepEqual(await f.api.snapshot(ID),snapshot);
 assert.deepEqual(f.calls[0],{name:'staging-admin-bookings',body:{action:'snapshot',booking_id:ID}});
});
test('prepared intent has a stable request ID and frozen payload across timeout retries',async()=>{
 const f=await fixture();const patch={admin_notes:'original'};const pending=f.api.prepare(snapshot,'notes',patch);patch.admin_notes='mutated';
 let first=true;const base=f.client.functions.invoke;
 f.client.functions.invoke=async(...args)=>{if(first){first=false;await base(...args);return {error:new Error('timeout')};}return base(...args);};
 await assert.rejects(pending.execute(),/ADMIN_BOOKING_UNAVAILABLE/);await pending.execute();
 assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.calls[1].body.patch.admin_notes,'original');
});
test('wrong booking, environment, request acknowledgement or claimed external delivery is refused',async()=>{
 for(const change of [{environment:'production'},{booking:{id:'wrong'}},{operation_id:'wrong'},{external_effects_performed:true}]){
  const f=await fixture();f.client.functions.invoke=async(name,{body})=>({data:{...snapshot,operation_id:body.request_id,sync_state:'pending',external_effects_performed:false,...change}});
  await assert.rejects(f.api.prepare(snapshot,'notes',{admin_notes:'test'}).execute(),/INVALID_ADMIN_RESPONSE/);
 }
});
test('stale edit is surfaced as a conflict and never silently retried with a fresh snapshot',async()=>{
 const f=await fixture();f.client.functions.invoke=async()=>({error:{context:new Response(JSON.stringify({error:'STALE_BOOKING'}),{status:409})}});
 await assert.rejects(f.api.prepare(snapshot,'coach',{require_coach:true}).execute(),/STALE_BOOKING/);
});
test('deadline preserves prepared request identity for checking an uncertain commit',async()=>{
 const f=await fixture();const {createAdminBookingAPI}=await import('../staging/frontend/admin-booking-api.mjs');
 const api=createAdminBookingAPI(f.client,{timeoutMs:10});const invoke=f.client.functions.invoke;let first=true;
 f.client.functions.invoke=async(...args)=>{if(first){first=false;await invoke(...args);return new Promise(()=>{});}return invoke(...args);};
 const intent=api.prepare(snapshot,'notes',{admin_notes:'timeout'});await assert.rejects(intent.execute(),/ADMIN_BOOKING_UNAVAILABLE/);
 await intent.execute();assert.deepEqual(f.calls[0],f.calls[1]);
});
