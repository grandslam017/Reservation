'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const a=source.indexOf('function stagingConfigureTestLiff()');
const b=source.indexOf('async function init()',a);
assert.ok(a>0&&b>a);
const snippet=source.slice(a,b);
function configure(url,staging=true){
 const state={config:{liffId:'2010398825-4Z3Ff2Gf'}};
 const sandbox={GRANDSLAM_STAGING_ONLY:staging,state,
  window:{location:{search:new URL(url).search}},URLSearchParams,
  console:{info(){}}
 };
 vm.createContext(sandbox);vm.runInContext(snippet,sandbox);sandbox.stagingConfigureTestLiff();
 return state.config.liffId;
}
test('Staging cannot use legacy Production LIFF ID by default',()=>{
 assert.equal(configure('https://example.org/'),'');
});
test('only explicitly specified same-channel test LIFF is allowed',()=>{
 assert.equal(configure('https://example.org/?testLiffId=2010398825-Abc1234x'),'2010398825-Abc1234x');
 assert.equal(configure('https://example.org/?testLiffId=1234567890-Abc1234x'),'');
 assert.equal(configure('https://example.org/?testLiffId=2010398825-invalid!'),'');
});
test('Production source behavior is not modified by Staging guard',()=>{
 assert.equal(configure('https://example.org/',false),'2010398825-4Z3Ff2Gf');
});
