'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','staging/admin/payments.html'),'utf8');
test('staging admin disables slip button when no stored slip path exists',()=>{
 assert.match(html,/const hasSlip=typeof b\.slip_path==='string'/);
 assert.match(html,/slip\.disabled=!hasSlip/);
});
test('staging admin opens popup synchronously before fetching signed link',()=>{
 const clickStart=html.indexOf('slip.onclick=async()=>{');
 const openIndex=html.indexOf("window.open('about:blank','_blank')",clickStart);
 const fetchIndex=html.indexOf("api({action:'slip-link'",clickStart);
 assert.ok(clickStart>=0&&openIndex>clickStart&&fetchIndex>openIndex);
 assert.match(html,/popup\.location\.replace\(r\.url\)/);
 assert.match(html,/popup\.close\(\)/);
});
