'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const SECRET='a1'.repeat(32),NOW=1794310000000,ID='11111111-1111-4111-8111-111111111111';
const source=fs.readFileSync(path.join(__dirname,'../production/gas/SignedGateway.gs'),'utf8');
async function signed(action='health',data,options={}){
 const {signProductionRequest}=await import('../production/server/gas-protocol.mjs');
 return signProductionRequest({action,requestId:ID,...(data?{data}:{})},SECRET,{now:NOW,...options});
}
function gas(overrides={}){
 const props=new Map(Object.entries({GAS_GATEWAY_ENVIRONMENT:'production',GAS_GATEWAY_MODE:'SIGNED_ONLY',GAS_GATEWAY_SECRET:SECRET,...overrides}));
 const calls=[];let locked=false;
 const context={Date:class extends Date {static now(){return NOW;}},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(text){return {text,setMimeType(){return this;}};}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
  LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},
  Utilities:{Charset:{UTF_8:'UTF-8'},computeHmacSha256Signature:(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()].map(b=>b>127?b-256:b)},
  validateInput(data){calls.push({handler:'validateInput',data});return null;},
 };
 for(const handler of ['handleSendConfirmation','handleCancelBooking','handleUpdateNotes','handleBackup','handleLogAdminAction','handleGetAdminLogs','handleGetExistingBookings','handleLineAiWebhook'])
  context[handler]=data=>{calls.push({handler,data});return context.secureGatewayJson({status:'success',handler});};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,props,calls,send:e=>JSON.parse(context.secureGatewayDoPost({postData:{contents:JSON.stringify(e)}}).text)};
}
test('production signer agrees with Apps Script HMAC and replay is rejected',async()=>{
 const g=gas(),e=await signed();assert.equal(g.send(e).mode,'signed-only');
 assert.equal(g.send(e).error,'REPLAY_REJECTED');assert.equal(g.calls.length,0);
});
test('legacy payload, raw LINE event and query-string action cannot bypass signature',()=>{
 for(const raw of [{action:'backup'},{action:'sendConfirmation'}, {events:[{type:'message'}]},null]){
  const g=gas();assert.equal(g.send(raw).status,'error');assert.equal(g.calls.length,0);
 }
 const g=gas();const r=g.context.secureGatewayDoPost({parameter:{action:'backup'},postData:{contents:'{}'}});
 assert.equal(JSON.parse(r.text).status,'error');assert.equal(g.calls.length,0);
});
test('staging audience, tampered payload and wrong key are denied before handlers',async()=>{
 for(const change of [e=>({...e,audience:'grand-slam-gas-staging-v1'}),e=>({...e,payload:e.payload+' '}),e=>({...e,signature:'0'.repeat(64)})]){
  const g=gas();assert.equal(g.send(change(await signed())).status,'error');assert.equal(g.calls.length,0);
 }
 const g=gas({GAS_GATEWAY_SECRET:'b2'.repeat(32)});assert.equal(g.send(await signed()).error,'INVALID_SIGNATURE');
});
test('missing production configuration stays closed including existing WEBHOOK_SECRET fallback',async()=>{
 for(const props of [{GAS_GATEWAY_ENVIRONMENT:'staging'},{GAS_GATEWAY_MODE:''},{GAS_GATEWAY_SECRET:'',WEBHOOK_SECRET:SECRET}]){
  const g=gas(props);assert.equal(g.send(await signed()).error,'GATEWAY_CONFIGURATION_REQUIRED');assert.equal(g.calls.length,0);
 }
});
test('valid signed expired and future requests are refused without writing nonces',async()=>{
 for(const now of [NOW-120001,NOW+120001]){
  const g=gas();assert.equal(g.send(await signed('health',null,{now})).error,'REQUEST_EXPIRED');assert.equal(g.props.has('GAS_PRODUCTION_NONCES'),false);
 }
});
test('each allowed business action dispatches only to its corresponding original handler',async()=>{
 const expected={sendConfirmation:'handleSendConfirmation',cancelBooking:'handleCancelBooking',updateNotes:'handleUpdateNotes',backup:'handleBackup',logAdminAction:'handleLogAdminAction',getAdminLogs:'handleGetAdminLogs',getExistingBookings:'handleGetExistingBookings'};
 for(const [action,handler] of Object.entries(expected)){
  const g=gas();const r=g.send(await signed(action,{name:'Synthetic',fee:350}));
  assert.equal(r.handler,handler);assert.deepEqual(g.calls.map(x=>x.handler),['validateInput',handler]);
 }
});
test('unknown signed action never falls back to backup',async()=>{
 const e=await signed();e.payload=JSON.stringify({action:'unknown',requestId:ID,data:{}});
 e.signature=crypto.createHmac('sha256',SECRET).update([e.version,e.audience,e.timestamp,e.nonce,e.payload].join('\n')).digest('hex');
 const g=gas();assert.equal(g.send(e).error,'ACTION_NOT_ALLOWED');assert.equal(g.calls.length,0);
});
test('mismatched data action, arrays and events cannot enter ordinary handlers',async()=>{
 for(const data of [{action:'cancelBooking'},{events:[]},[]]){
  const g=gas();assert.equal(g.send(await signed('backup',data)).error,'INVALID_DATA');assert.equal(g.calls.length,0);
 }
});
test('LINE events require explicit signed lineWebhook route',async()=>{
 const g=gas();assert.equal(g.send(await signed('lineWebhook',{events:[]})).handler,'handleLineAiWebhook');
 assert.deepEqual(g.calls.map(x=>x.handler),['handleLineAiWebhook']);
 assert.equal(gas().send(await signed('lineWebhook',{})).error,'INVALID_DATA');
});
test('validation failure and exception details never leak to response',async()=>{
 const g=gas();g.context.validateInput=()=> 'private details';
 assert.equal(g.send(await signed('backup',{})).error,'VALIDATION_FAILED');
 const g2=gas();g2.context.handleBackup=()=>{throw Error('SECRET_AND_CUSTOMER_DATA');};
 assert.deepEqual(g2.send(await signed('backup',{})),{status:'error',error:'REQUEST_REJECTED'});
});
test('persistent nonce store handles clock skew, corruption and bounded capacity safely',async()=>{
 const g=gas();const e=await signed('health',null,{now:NOW+120000});assert.equal(g.send(e).status,'success');
 assert.equal(JSON.parse(g.props.get('GAS_PRODUCTION_NONCES'))[e.nonce],NOW+240000);
 const second=gas({GAS_PRODUCTION_NONCES:g.props.get('GAS_PRODUCTION_NONCES')});assert.equal(second.send(e).error,'REPLAY_REJECTED');
 const full=Object.fromEntries(Array.from({length:60},(_,i)=>['x'+i,NOW+120000]));
 assert.equal(gas({GAS_PRODUCTION_NONCES:JSON.stringify(full)}).send(await signed()).error,'GATEWAY_RATE_LIMIT');
 assert.equal(gas({GAS_PRODUCTION_NONCES:'bad-json'}).send(await signed()).error,'REQUEST_REJECTED');
 const locked=gas();locked.context.LockService.getScriptLock=()=>({tryLock:()=>false});
 assert.equal(locked.send(await signed()).error,'GATEWAY_BUSY');
});
test('GET serves a minimal health response and refuses booking/admin retrieval',()=>{
 const g=gas();assert.deepEqual(JSON.parse(g.context.secureGatewayDoGet({}).text),{status:'online'});
 for(const action of ['getExistingBookings','getAdminLogs','backup'])
  assert.equal(JSON.parse(g.context.secureGatewayDoGet({parameter:{action}}).text).error,'SIGNED_POST_REQUIRED');
 assert.equal(g.calls.length,0);
});
test('oversize and malformed requests are controlled failures',()=>{
 const g=gas();assert.equal(JSON.parse(g.context.secureGatewayDoPost({postData:{contents:'x'.repeat(262145)}}).text).error,'INVALID_REQUEST');
 assert.equal(JSON.parse(g.context.secureGatewayDoPost({postData:{contents:'{'}}).text).error,'REQUEST_REJECTED');
});
test('LINE verification uses exact original bytes and rejects malformed/tampered signatures',async()=>{
 const {verifyLineWebhookSignature:verify}=await import('../production/server/line-webhook-signature.mjs');
 const raw=Buffer.from('{ "events": [] }\n'),secret='synthetic-line-channel-secret';
 const signature=crypto.createHmac('sha256',secret).update(raw).digest('base64');
 assert.equal(await verify(raw,signature,secret),true);
 assert.equal(await verify(Buffer.from('{"events":[]}'),signature,secret),false);
 for(const sig of ['',signature+'x','not-base64'])assert.equal(await verify(raw,sig,secret),false);
 assert.equal(await verify(raw,signature,'another-synthetic-secret'),false);
 assert.equal(await verify('not-bytes',signature,secret),false);
 assert.equal(await verify(new Uint8Array(131073),signature,secret),false);
});
test('candidate builder retains business handlers and Gemini Script Properties reads',()=>{
 const {buildCandidate}=require('../production/scripts/build-gas-candidate.cjs');
 const original=`const GEMINI_API_KEY = "unused-synthetic-value";\nconst WEBHOOK_SECRET = "unused-synthetic-secret";\nfunction doPost(e) { /* } */ const s="}"; return legacy(e); }\nfunction doGet(e) { return existing(e); }\nfunction askGeminiAi() { return getCleanScriptProperty("GEMINI_API_KEY"); }\nfunction checkAndSendReminders() { return 'same-reminder'; }\n`;
 const candidate=buildCandidate(original,source);
 assert.ok(candidate.includes('function askGeminiAi() { return getCleanScriptProperty("GEMINI_API_KEY"); }'));
 assert.ok(candidate.includes("function checkAndSendReminders() { return 'same-reminder'; }"));
 assert.ok(!candidate.includes('unused-synthetic-value'));assert.ok(!candidate.includes('unused-synthetic-secret'));
 assert.equal((candidate.match(/^function doPost\(/gm)||[]).length,1);
 assert.equal((candidate.match(/^function doGet\(/gm)||[]).length,1);
 assert.throws(()=>buildCandidate(candidate,source),/ALREADY_PATCHED/);
 assert.throws(()=>buildCandidate(original+'function doPost(e) {}\n',source),/EXPECTED_ONE/);
 assert.throws(()=>buildCandidate(original.replace('return legacy(e);','return `template`;'),source),/TEMPLATE_REQUIRES_REVIEW/);
 assert.throws(()=>buildCandidate(original+'function usesKey(){ return GEMINI_API_KEY; }',source),/GLOBAL_KEY_REFERENCE/);
});
test('release audit blocks legacy client routes without printing the shared secret',()=>{
 const {audit}=require('../production/scripts/audit-release.cjs');
 const result=audit(`const c={webhookSecret:'synthetic-private-value'}; async function sendGasRequest(x){}; sendGasRequest({}); crypto.subtle.sign(); db.from('bookings'); db.from('transactions'); db.rpc('confirm_booking_batch');`);
 assert.equal(result.gas_call_sites,1);assert.equal(result.client_gate_pass,false);
 assert.equal(result.blockers.length,5);assert.ok(!JSON.stringify(result).includes('synthetic-private-value'));
});
test('a client static gate can never grant production deployment approval',()=>{
 const {audit}=require('../production/scripts/audit-release.cjs');
 const result=audit('const publicAvailability = true;');
 assert.equal(result.client_gate_pass,true);assert.equal(result.production_deploy_approved,false);
});
