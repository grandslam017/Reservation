'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../staging/admin/payments.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
 .replace('client.auth.getSession().then(', 'window.testGasSimulation=createGasBookingSimulation;client.auth.getSession().then(');
function fixture(invoke=async()=>({data:{success:true,environment:'staging',mode:'simulation-only',
 gas_reachable:true,business_effects_performed:false},error:null})){
 let session=null;
 const elements=new Map(),calls=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,value:''});return elements.get(id)};
 const client={auth:{getSession:async()=>({data:{session},error:null})},functions:{
  invoke:async(...args)=>{calls.push(args);const response=await invoke(...args);
   if(response?.data&&response.data.request_id===undefined)response.data.request_id=args[1].body.request_id;
   return response;}}};
 const node=()=>({textContent:'',disabled:false,hidden:false,setAttribute(){}});
 const ctx={document:{getElementById:$,createElement:node},window:{supabase:{createClient:()=>client}},
  crypto,setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {$,calls,login(){session={access_token:'SYNTHETIC_TEST_TOKEN'}},click:()=>$('gasHealth').onclick(),
  simulation:booking=>ctx.window.testGasSimulation(booking)};
}
test('GAS button requires session before making a request',async()=>{
 const f=fixture();await f.click();assert.equal(f.calls.length,0);
 assert.match(f.$('gasHealthResult').textContent,/เข้าสู่ระบบ/);assert.equal(f.$('gasHealth').disabled,false);
});
test('GAS health button uses existing client and shows visible signed-staging success',async()=>{
 const f=fixture();f.login();await f.click();
 assert.equal(f.calls[0][0],'staging-gas-gateway');assert.equal(f.calls[0][1].body.action,'health');
 assert.match(f.calls[0][1].body.request_id,/^[0-9a-f-]{36}$/);
 assert.match(f.$('gasHealthResult').textContent,/เชื่อมต่อ GAS สำเร็จ/);
 assert.doesNotMatch(f.$('gasHealthResult').textContent,/SYNTHETIC_TEST_TOKEN/);
});
test('button displays a controlled error code without dumping error credentials',async()=>{
 const f=fixture(async()=>({error:{context:{json:async()=>({error:'INVALID_SIGNATURE',
  credentials:'DO_NOT_DISPLAY'})}}}));
 f.login();await f.click();assert.match(f.$('gasHealthResult').textContent,/INVALID_SIGNATURE/);
 assert.doesNotMatch(f.$('gasHealthResult').textContent,/DO_NOT_DISPLAY/);
});
test('unexpected production or business-writing response cannot be displayed as success',async()=>{
 for(const response of [{success:true,environment:'production'},
   {success:true,environment:'staging',mode:'simulation-only',gas_reachable:true,business_effects_performed:true}]){
  const f=fixture(async()=>({data:response}));f.login();await f.click();
  assert.match(f.$('gasHealthResult').textContent,/UNEXPECTED_GAS_RESULT/);
 }
});
const BOOKING='22222222-2222-4222-8222-222222222222';
function simulationResponse(change={}){
 return {data:{success:true,environment:'staging',mode:'simulation-only',gas_reachable:true,
  business_effects_performed:false,simulation:{booking_id:BOOKING,gas_confirmed:true,
   date:'2026-11-15',slot:'18:00 - 19:00',fee:350,
   effects:{sheetsRowsWritten:0,calendarEventsCreated:0,lineMessagesSent:0,emailsSent:0},...change}}};
}
test('booking simulation sends only booking ID and displays server-derived confirmation with zero effects',async()=>{
 const f=fixture(async()=>simulationResponse());f.login();
 const control=f.simulation({booking_id:BOOKING,fee:1});await control.button.onclick();
 assert.equal(f.calls[0][1].body.action,'simulate-confirmation');
 assert.equal(f.calls[0][1].body.booking_id,BOOKING);
 assert.equal(f.calls[0][1].body.fee,undefined);
 assert.match(control.result.textContent,/จำลองส่งยืนยันผ่าน GAS สำเร็จ/);
 assert.match(control.result.textContent,/350 บาท/);assert.match(control.result.textContent,/ส่ง LINE: 0/);
 assert.equal(control.result.hidden,false);
});
test('booking simulation requires session and blocks repeated click while pending',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r}));
 const control=f.simulation({booking_id:BOOKING});await control.button.onclick();
 assert.equal(f.calls.length,0);assert.match(control.result.textContent,/เข้าสู่ระบบ/);
 f.login();const pending=control.button.onclick();await Promise.resolve();
 await control.button.onclick();assert.equal(f.calls.length,1);
 resolve(simulationResponse());await pending;assert.equal(control.button.disabled,false);
});
test('UI rejects another booking, missing effects and nonzero effect counts',async()=>{
 for(const change of [{booking_id:'another'},{effects:{}},{effects:{lineMessagesSent:1}}]){
  const f=fixture(async()=>simulationResponse(change));f.login();
  const control=f.simulation({booking_id:BOOKING});await control.button.onclick();
  assert.match(control.result.textContent,/UNEXPECTED_GAS_SIMULATION/);
  assert.doesNotMatch(control.result.textContent,/จำลองส่งยืนยันผ่าน GAS สำเร็จ/);
 }
});
test('double click produces one request, with loading state and button recovery',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r}));f.login();
 const pending=f.click();await Promise.resolve();await f.click();
 assert.equal(f.calls.length,1);assert.equal(f.$('gasHealth').disabled,true);
 assert.match(f.$('gasHealthResult').textContent,/กำลังตรวจ/);
 resolve({error:{message:'SECRET_INTERNAL_DETAILS'}});await pending;
 assert.equal(f.$('gasHealth').disabled,false);
 assert.doesNotMatch(f.$('gasHealthResult').textContent,/SECRET_INTERNAL_DETAILS/);
});
