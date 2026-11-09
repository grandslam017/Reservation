'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const gateway=fs.readFileSync(path.join(__dirname,'..','staging/functions/liff-booking-gateway/index.ts'),'utf8');
const start=src.indexOf('if (GRANDSLAM_STAGING_ONLY) {\n        const phoneDigits = phone.replace(');
const end=src.indexOf('      // Safe email pattern check (if provided)',start);
assert.ok(start>=0&&end>start);
const block=src.slice(start,end);
function validate({name='A',phone='0812345678',email='sample@example.com',carPlate='5245'}={}){
 const calls=[];
 const mk=()=>({focus(){calls.push('focus')}});
 const context={name,phone,email,carPlate,GRANDSLAM_STAGING_ONLY:true,
 nameInput:mk(),phoneInput:mk(),emailInput:mk(),carPlateInput:mk(),
 showToast:(message)=>calls.push(message)};
 const fn=Function(...Object.keys(context),block+'\nreturn true;');
 const result=fn(...Object.values(context));
 return{result,calls};
}
test('single-letter name is accepted with complete valid customer details',()=>{
 const r=validate();
 assert.equal(r.result,true);
 assert.deepEqual(r.calls,[]);
});
test('each invalid input reports its own field and focuses it',()=>{
 const cases=[
 [{name:''},'ชื่อลูกค้า'],
 [{phone:'123'},'เบอร์โทรศัพท์'],
 [{email:'bad'},'อีเมล'],
 [{carPlate:''},'ทะเบียนรถ'],
 ];
 for(const [input,field] of cases){
  const r=validate(input);
  assert.equal(r.result,undefined);
  assert.match(r.calls[0],new RegExp(field));
  assert.equal(r.calls[1],'focus');
 }
});
test('backend agrees on minimum one visible character and uses v4 only',()=>{
 assert.match(gateway,/data\.name\.trim\(\)\.length<1/);
 assert.doesNotMatch(gateway,/data\.name\.trim\(\)\.length<2/);
 assert.match(gateway,/staging_confirm_hold_line_v4/);
});
