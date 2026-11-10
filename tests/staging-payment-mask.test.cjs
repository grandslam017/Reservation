'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=src.indexOf('function stagingMaskRealPaymentDetails()');
const end=src.indexOf('// Helper: Calculate price',start);
assert.ok(start>=0&&end>start);
const snippet=src.slice(start,end);
function run(stage){
 let removed=false,prepended=false;
 const child=(text)=>({textContent:text,children:[]});
 const elements=[child('บัญชีสำหรับโอนเงิน'),child('0894932242'),child('ชื่อบัญชี: Example')];
 const qr={removeAttribute:key=>{assert.equal(key,'src');removed=true},style:{},alt:''};
 const panel={
  querySelector:key=>key==='img'?qr:null,
  querySelectorAll:()=>elements,
  prepend:()=>{prepended=true}
 };
 const sandbox={GRANDSLAM_STAGING_ONLY:stage,document:{
  getElementById:()=>panel,
  createElement:()=>({style:{},setAttribute(){}})
 }};
 vm.createContext(sandbox);vm.runInContext(snippet,sandbox);
 sandbox.stagingMaskRealPaymentDetails();
 return{elements,qr,removed,prepended};
}
test('Staging masks live bank number/QR and displays test-only instructions',()=>{
 const x=run(true);
 assert.equal(x.removed,true);
 assert.equal(x.qr.style.visibility,'hidden');
 assert.equal(x.elements[1].textContent,'TEST ONLY');
 assert.match(x.elements[2].textContent,/ไม่รับโอนเงินจริง/);
 assert.equal(x.prepended,true);
});
test('the masking function leaves Production behavior untouched',()=>{
 const x=run(false);
 assert.equal(x.removed,false);
 assert.equal(x.elements[1].textContent,'0894932242');
 assert.equal(x.prepended,false);
});
