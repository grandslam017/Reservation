'use strict';
const fs=require('node:fs');
function audit(source){
 const gasCalls=[...source.matchAll(/\bsendGasRequest\s*\(/g)].length-
   [...source.matchAll(/\bfunction\s+sendGasRequest\s*\(/g)].length;
 const literalSecret=/\bwebhookSecret\s*:\s*(['"])([^'"\r\n]+)\1/.test(source);
 const browserSigner=/\bcrypto\.subtle\.sign\s*\(/.test(source);
 const directBusinessTables=[...new Set([...source.matchAll(/\.from\(\s*['"](bookings|transactions)['"]\s*\)/g)].map(m=>m[1]))];
 const legacyBatchRpc=/\.rpc\(\s*['"]confirm_booking_batch['"]/.test(source);
 const blockers=[];
 if(gasCalls>0)blockers.push('LEGACY_GAS_CALLS_REQUIRE_SERVER_ROUTE_REVIEW');
 if(literalSecret)blockers.push('BROWSER_CONTAINS_NONEMPTY_SHARED_SECRET');
 if(browserSigner)blockers.push('BROWSER_STILL_SIGNS_REQUESTS');
 if(directBusinessTables.length)blockers.push('DIRECT_BUSINESS_TABLE_ACCESS_REQUIRES_MIGRATION');
 if(legacyBatchRpc)blockers.push('LEGACY_BOOKING_RPC_REQUIRES_AUTHORIZATION_REVIEW');
 return {scope:'static_client_gate_only',gas_call_sites:Math.max(0,gasCalls),nonempty_shared_secret_literal:literalSecret,
  browser_signer:browserSigner,direct_business_tables:directBusinessTables,legacy_batch_rpc:legacyBatchRpc,
  blockers,client_gate_pass:!blockers.length,production_deploy_approved:false};
}
module.exports={audit};
if(require.main===module){
 const file=process.argv[2];if(!file)throw Error('APP_SOURCE_PATH_REQUIRED');
 const result=audit(fs.readFileSync(file,'utf8'));console.log(JSON.stringify(result,null,2));
 process.exitCode=result.client_gate_pass?0:2;
}
