'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
// Synthetic fixtures only. No user secret, production booking or network access.
const SECRET = 'a1'.repeat(32);
const ID = '11111111-1111-4111-8111-111111111111';
const BOOKING = '22222222-2222-4222-8222-222222222222';
const GAS = 'https://script.google.com/macros/s/STAGING-TEST-ONLY/exec';
const NOW = 1794300000000;
const source = fs.readFileSync(path.join(__dirname,'../staging/gas/Gateway.gs'),'utf8');
async function sign(payload,options) {
  const {signEnvelope} = await import('../staging/integrations/gas-envelope.mjs');
  return signEnvelope(payload,SECRET,{now:NOW,...options});
}
function receiver(overrides={}) {
  const props = new Map(Object.entries({GAS_GATEWAY_SECRET:SECRET,GAS_GATEWAY_ENVIRONMENT:'staging',...overrides}));
  let locked=false;
  const ctx={Date:class extends Date {static now(){return NOW;}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return {text,setMimeType(){return this;}};}},
    PropertiesService:{getScriptProperties(){return {
      getProperty:key=>props.get(key)||null,setProperty:(key,value)=>props.set(key,value)};}},
    LockService:{getScriptLock(){return {
      tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}};}},
    Utilities:{Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature(text,key){
      return [...crypto.createHmac('sha256',key).update(text,'utf8').digest()].map(x=>x>127?x-256:x);}},
    // Any accidental business side effect is a failing test.
    SpreadsheetApp:new Proxy({}, {get(){throw Error('UNEXPECTED_SHEETS_CALL');}}),
    CalendarApp:new Proxy({}, {get(){throw Error('UNEXPECTED_CALENDAR_CALL');}}),
    UrlFetchApp:new Proxy({}, {get(){throw Error('UNEXPECTED_NETWORK_CALL');}}),
    MailApp:new Proxy({}, {get(){throw Error('UNEXPECTED_EMAIL_CALL');}}),
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {props,ctx,send:e=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(e)}}).text)};
}
test('WebCrypto envelope verifies against Apps Script signed-byte HMAC implementation',async()=>{
  const r=receiver(),e=await sign({action:'health',requestId:ID});
  assert.equal(r.send(e).status,'success');
  assert.equal(r.send(e).error,'REPLAY_REJECTED');
});
test('raw legacy commands and LINE events cannot bypass authentication',()=>{
  for(const payload of [{action:'backup',bookings:[{}]},{action:'cancelBooking'},
    {action:'getAdminLogs'},{events:[{type:'message'}]}])
    assert.equal(receiver().send(payload).error,'INVALID_ENVELOPE');
});
test('signed payload changes, signature changes, wrong key and wrong audience are rejected',async()=>{
  const e=await sign({action:'health',requestId:ID});
  for(const candidate of [{...e,payload:e.payload+' '},{...e,signature:'0'.repeat(64)},
    {...e,audience:'production'}]) assert.equal(receiver().send(candidate).status,'error');
  assert.equal(receiver({GAS_GATEWAY_SECRET:'b2'.repeat(32)}).send(e).error,'INVALID_SIGNATURE');
});
test('stale/future/noninteger timestamps rejected before nonce writes',async()=>{
  for(const timestamp of [NOW-120001,NOW+120001,'1794300000000',NaN]){
    const e=await sign({action:'health',requestId:ID}); e.timestamp=timestamp;
    const r=receiver();assert.equal(r.send(e).status,'error');assert.equal(r.props.has('GAS_GATEWAY_NONCES'),false);
  }
});
test('clock-skew boundary does not allow replay after nonce cleanup',async()=>{
  const r=receiver(),e=await sign({action:'health',requestId:ID},{now:NOW+120000});
  assert.equal(r.send(e).status,'success');
  assert.equal(JSON.parse(r.props.get('GAS_GATEWAY_NONCES'))[e.nonce],NOW+240000);
});
test('missing secret and wrong environment fail closed',async()=>{
  const e=await sign({action:'health',requestId:ID});
  for(const overrides of [{GAS_GATEWAY_SECRET:''},{GAS_GATEWAY_ENVIRONMENT:'production'}])
    assert.equal(receiver(overrides).send(e).error,'STAGING_CONFIGURATION_REQUIRED');
});
test('unknown signed actions cannot reach original handlers',async()=>{
  for(const action of ['sendConfirmation','cancelBooking','backup','getAdminLogs'])
    assert.equal(receiver().send(await sign({action,requestId:ID})).error,'ACTION_NOT_ALLOWED');
});
test('nonce survives receiver invocation and lock enforces exclusive consumption',async()=>{
  const r=receiver(),e=await sign({action:'health',requestId:ID});
  assert.equal(r.send(e).status,'success');
  const second=receiver({GAS_GATEWAY_NONCES:r.props.get('GAS_GATEWAY_NONCES')});
  assert.equal(second.send(e).error,'REPLAY_REJECTED');
  r.ctx.LockService.getScriptLock=()=>({tryLock:()=>false});
  assert.equal(r.send(await sign({action:'health',requestId:ID})).error,'GATEWAY_BUSY');
});
test('nonce capacity rejects rather than evicts active entries',async()=>{
  const entries=Object.fromEntries(Array.from({length:60},(_,i)=>['nonce-'+i,NOW+120000]));
  const r=receiver({GAS_GATEWAY_NONCES:JSON.stringify(entries)});
  assert.equal(r.send(await sign({action:'health',requestId:ID})).error,'GATEWAY_RATE_LIMIT');
  assert.equal(Object.keys(JSON.parse(r.props.get('GAS_GATEWAY_NONCES'))).length,60);
});
test('invalid nonce store fails closed, oversize input rejected, no detailed errors leaked',async()=>{
  const r=receiver({GAS_GATEWAY_NONCES:'not-json'});
  assert.equal(r.send(await sign({action:'health',requestId:ID})).error,'REQUEST_REJECTED');
  assert.equal(JSON.parse(r.ctx.doPost({postData:{contents:'x'.repeat(16385)}}).text).error,'INVALID_REQUEST');
});
test('simulation returns zero business effects and never calls Google/LINE APIs',async()=>{
  const r=receiver(),out=r.send(await sign({action:'simulateConfirmation',requestId:ID,
    booking:{id:BOOKING,date:'2026-11-15',slot:'18:00 - 19:00',fee:350}}));
  assert.equal(out.status,'success');assert.equal(out.mode,'simulation-only');
  assert.ok(Object.values(out.effects).every(x=>x===0));
});
async function edgeFixture(overrides={}) {
  const {createHandler,STAGING_URL}=await import('../staging/functions/staging-gas-gateway/handler.mjs');
  const received=[];
  const deps={env:{url:STAGING_URL,enabled:'SIMULATION_ONLY',secret:SECRET,gasUrl:GAS},
    getUser:async()=>({id:ID,app_metadata:{role:'admin'}}),rateLimit:async()=>true,
    loadBooking:async()=>({id:BOOKING,booking_date:'2026-11-15',time_slot:'18:00 - 19:00',fee:'350',status:'confirmed'}),
    forward:async(target,e)=>{received.push({target,e});return receiver().send(e);},...overrides};
  return {deps,received,send:async(input={action:'health',request_id:ID},headers={Authorization:'Bearer test-session'})=>{
    const response=await createHandler(deps)(new Request('https://staging.test/',{
      method:'POST',headers,body:JSON.stringify(input)}));
    return {status:response.status,body:await response.json()};}};
}
test('Edge rejects unauthenticated and non-admin users including user_metadata spoofing',async()=>{
  let f=await edgeFixture();assert.equal((await f.send(undefined,{})).status,401);
  f=await edgeFixture({getUser:async()=>null});assert.equal((await f.send()).status,401);
  f=await edgeFixture({getUser:async()=>({id:ID,user_metadata:{role:'admin'},app_metadata:{}})});
  assert.equal((await f.send()).status,403);assert.equal(f.received.length,0);
  f=await edgeFixture({getUser:async()=>({id:ID,is_anonymous:true,app_metadata:{role:'admin'}})});
  assert.equal((await f.send()).status,403);
});
test('Edge rejects production Supabase, arbitrary GAS hosts, query strings and disabled config',async()=>{
  for(const env of [{url:'https://eqwmodrhorcbwsshbepg.supabase.co'},
    {gasUrl:'https://attacker.test/exec'}, {gasUrl:GAS+'?secret=bad'}, {enabled:'ENABLED'}, {secret:''}]){
    const f=await edgeFixture();Object.assign(f.deps.env,env);
    assert.equal((await f.send()).status,503);assert.equal(f.received.length,0);
  }
});
test('browser-injected amounts, recipients, signatures and URLs never enter signed booking',async()=>{
  const f=await edgeFixture();
  // Align the mocked GAS clock with the real Edge clock for this protocol test.
  f.deps.forward=async(target,e)=>{f.received.push({target,e});return {status:'success',environment:'staging',mode:'simulation-only'};};
  const r=await f.send({action:'simulate-confirmation',request_id:ID,booking_id:BOOKING,
    fee:0,lineUserId:'attacker',gasUrl:'https://attacker.test',signature:'forged'});
  assert.equal(r.status,200);
  const p=JSON.parse(f.received[0].e.payload);
  assert.equal(p.booking.fee,350);assert.equal(p.booking.lineUserId,undefined);
  assert.equal(f.received[0].target,GAS);assert.equal(r.body.business_effects_performed,false);
  assert.equal(r.body.signature,undefined);assert.equal(r.body.payload,undefined);
});
test('rate-limit failure, database failure and cancellation cannot be forwarded',async()=>{
  let f=await edgeFixture({rateLimit:async()=>false});assert.equal((await f.send()).status,429);
  f=await edgeFixture({loadBooking:async()=>{throw Error('SECRET_DATABASE_DETAILS');}});
  assert.equal((await f.send({action:'simulate-confirmation',request_id:ID,booking_id:BOOKING})).body.error,'GATEWAY_UNAVAILABLE');
  f=await edgeFixture();assert.equal((await f.send({action:'cancelBooking',request_id:ID})).status,400);
  assert.equal(f.received.length,0);
});
test('invalid, nonconfirmed or missing booking rejected without forwarding',async()=>{
  for(const row of [null,{status:'cancelled'}, {status:'confirmed',fee:-1}]){
    const f=await edgeFixture({loadBooking:async()=>row});
    assert.ok((await f.send({action:'simulate-confirmation',request_id:ID,booking_id:BOOKING})).status>=400);
    assert.equal(f.received.length,0);
  }
});
test('unexpected upstream result cannot masquerade as a successful staging test',async()=>{
  const f=await edgeFixture({forward:async()=>({status:'success',environment:'production'})});
  assert.equal((await f.send()).status,502);
});
test('authenticated Edge request completes through the actual GAS receiver with no business writes',async()=>{
  const gas=receiver();gas.ctx.Date.now=()=>Date.now();
  const f=await edgeFixture({forward:async(target,e)=>gas.send(e)});
  const result=await f.send({action:'simulate-confirmation',request_id:ID,booking_id:BOOKING});
  assert.equal(result.status,200);assert.equal(result.body.gas_reachable,true);
  assert.equal(result.body.business_effects_performed,false);
});
test('Edge blocks untrusted origins, bad references and oversize bodies',async()=>{
  const f=await edgeFixture();
  assert.equal((await f.send(undefined,{Authorization:'Bearer test-session',Origin:'https://attacker.test'})).status,403);
  assert.equal((await f.send({action:'health',request_id:'guessable'})).status,400);
  assert.equal((await f.send({action:'health',request_id:ID,padding:'x'.repeat(5000)})).status,413);
  assert.equal(f.received.length,0);
});
