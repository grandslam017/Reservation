'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
test('Google runtime harness embeds the exact verifier and completes synthetic cases locally',()=>{
 const {build}=require('../production/scripts/build-gas-runtime-tests.cjs');
 const source=fs.readFileSync(path.join(__dirname,'../production/gas/SignedGateway.gs'),'utf8');
 const template=fs.readFileSync(path.join(__dirname,'../production/gas/CandidateRuntimeTests.template.gs'),'utf8');
 const output=build(source,template),logs=[];
 const bytes=b=>[...b].map(x=>x>127?x-256:x);
 const ctx={console:{log:s=>logs.push(JSON.parse(s))},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF-8'},getUuid:()=>crypto.randomUUID(),
   computeDigest:(algorithm,text)=>bytes(crypto.createHash(algorithm).update(text).digest()),
   computeHmacSha256Signature:(text,key)=>bytes(crypto.createHmac('sha256',key).update(text).digest())},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(text){return {getContent:()=>text,setMimeType(){return this;}};}}};
 vm.createContext(ctx);vm.runInContext(output,ctx);const result=ctx.runGatewayCandidateSelfTest();
 assert.equal(result.tests,21);assert.equal(result.passed,21);assert.equal(result.all_pass,true);
 assert.equal(result.candidate_sha256,crypto.createHash('sha256').update(source).digest('hex'));
 assert.equal(result.production_keys_read,false);assert.equal(result.external_business_effects,0);assert.equal(logs.length,1);
 assert.ok(!/\b(?:SpreadsheetApp|CalendarApp|UrlFetchApp|MailApp|GmailApp|DriveApp)\b/.test(output));
 assert.throws(()=>build(source+'\nSpreadsheetApp.getActive();',template),/BUSINESS_SERVICE_REFERENCE/);
});
