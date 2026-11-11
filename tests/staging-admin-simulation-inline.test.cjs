'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','staging/admin/payments.html'),'utf8');
test('simulation result is displayed beside the booking that was clicked',()=>{
 assert.match(html,/simulateResult\.className='simulation-result'/);
 assert.match(html,/role','status'/);
 assert.match(html,/aria-live','polite'/);
 assert.match(html,/box\.append\(head,details,action,simulateResult\)/);
 assert.match(html,/simulateResult\.textContent=/);
});
test('simulation shows loading and errors without initiating verification or repeated clicks',()=>{
 assert.match(html,/simulate\.disabled=true/);
 assert.match(html,/กำลังจำลอง/);
 assert.match(html,/action:'simulate-verify'/);
 assert.match(html,/r\.writes_performed!==false/);
 assert.match(html,/\}finally\{/);
 assert.match(html,/simulate\.disabled=false/);
 assert.match(html,/simulation-result\[hidden\]\{display:none\}/);
});
