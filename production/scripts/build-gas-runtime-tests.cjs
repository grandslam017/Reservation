'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
function build(source,template){
 if(/\b(?:SpreadsheetApp|CalendarApp|UrlFetchApp|MailApp|GmailApp|DriveApp)\b/.test(source))
  throw Error('BUSINESS_SERVICE_REFERENCE_NOT_ALLOWED_IN_VERIFIER');
 const hash=crypto.createHash('sha256').update(source).digest('hex');
 const result=template.replace('__CANDIDATE_SOURCE__',JSON.stringify(source)).replace('__CANDIDATE_SHA256__',hash);
 new vm.Script(result);return result;
}
module.exports={build};
if(require.main===module){
 const output=process.argv[2];if(!output)throw Error('OUTPUT_REQUIRED');
 const source=fs.readFileSync(path.join(__dirname,'../gas/SignedGateway.gs'),'utf8');
 const template=fs.readFileSync(path.join(__dirname,'../gas/CandidateRuntimeTests.template.gs'),'utf8');
 fs.writeFileSync(output,build(source,template),{flag:'wx',mode:0o600});
 console.log('Built staging-only runtime harness; original verifier embedded without changes.');
}
