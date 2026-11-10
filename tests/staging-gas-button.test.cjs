'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../staging/admin/payments.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function fixture(invoke=async()=>({data:{success:true,environment:'staging',mode:'simulation-only',
 gas_reachable:true,business_effects_performed:false},error:null})){
 let session=null;
 const elements=new Map(),calls=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,value:''});return elements.get(id)};
 const client={auth:{getSession:async()=>({data:{session},error:null})},functions:{
  invoke:async(...args)=>{calls.push(args);return invoke(...args)}}};
 const ctx={document:{getElementById:$},window:{supabase:{createClient:()=>client}},
  crypto,setTimeout,clearTimeout};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {$,calls,login(){session={access_token:'SYNTHETIC_TEST_TOKEN'}},click:()=>$('gasHealth').onclick()};
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
  assert.match(f.$('gasHealthResult').textContent,/GAS_TEST_FAILED/);
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
