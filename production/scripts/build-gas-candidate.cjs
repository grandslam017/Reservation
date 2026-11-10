'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
// Conservative, fail-closed transformation for the two reviewed legacy entrypoints.
// Template literals inside an entrypoint require review rather than a guessed edit.
function replaceEntrypoint(source,name,replacement){
 const re=new RegExp('^function '+name+'\\s*\\([^)]*\\)\\s*\\{','gm');
 const matches=[...source.matchAll(re)];
 if(matches.length!==1)throw Error('EXPECTED_ONE_'+name);
 const start=matches[0].index,open=start+matches[0][0].lastIndexOf('{');
 let depth=1,state='code',end=-1;
 for(let i=open+1;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(state==='line'){if(c==='\n')state='code';continue;}
  if(state==='block'){if(c==='*'&&n==='/'){state='code';i++;}continue;}
  if(state==='single'||state==='double'){
   if(c==='\\'){i++;continue;}
   if(c===(state==='single'?"'":'"'))state='code';continue;
  }
  if(c==='`')throw Error('ENTRYPOINT_TEMPLATE_REQUIRES_REVIEW');
  if(c==='/'&&n==='/'){state='line';i++;continue;}
  if(c==='/'&&n==='*'){state='block';i++;continue;}
  // Regex literals may contain braces. Reject slash syntax rather than misparse it.
  if(c==='/')throw Error('ENTRYPOINT_SLASH_REQUIRES_REVIEW');
  if(c==="'"){state='single';continue;}
  if(c==='"'){state='double';continue;}
  if(c==='{')depth++;
  if(c==='}'){depth--;if(depth===0){end=i+1;break;}}
 }
 if(end<0)throw Error('UNTERMINATED_'+name);
 return source.slice(0,start)+replacement+source.slice(end);
}
function buildCandidate(original,securitySource){
 new vm.Script(original);new vm.Script(securitySource);
 if(/function\s+secureGatewayDoPost\s*\(/.test(original))throw Error('ALREADY_PATCHED');
 let candidate=replaceEntrypoint(original,'doPost','function doPost(e) { return secureGatewayDoPost(e); }');
 candidate=replaceEntrypoint(candidate,'doGet','function doGet(e) { return secureGatewayDoGet(e); }');
 for(const name of ['GEMINI_API_KEY','WEBHOOK_SECRET']){
  // Property names in strings are valid and must remain. Only delete the global
  // declaration if there are no unquoted references elsewhere.
  const declaration=new RegExp('^const '+name+'\\s*=.*;\\r?\\n','m');
  if(declaration.test(candidate)){
   const without=candidate.replace(declaration,'');
   const remaining=without.replace(/(['"])(?:\\.|(?!\1).)*\1/g,'');
   if(new RegExp('\\b'+name+'\\b').test(remaining))throw Error('GLOBAL_KEY_REFERENCE_REQUIRES_REVIEW');
   candidate=without;
  }
 }
 candidate+='\n\n'+securitySource;
 new vm.Script(candidate);
 return candidate;
}
module.exports={replaceEntrypoint,buildCandidate};
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('USE_DISTINCT_INPUT_AND_OUTPUT');
 const original=fs.readFileSync(input,'utf8');
 const security=fs.readFileSync(path.join(__dirname,'../gas/SignedGateway.gs'),'utf8');
 const candidate=buildCandidate(original,security);
 fs.writeFileSync(output,candidate,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'candidate_created_not_deployed',source_sha256:crypto.createHash('sha256').update(original).digest('hex'),candidate_sha256:crypto.createHash('sha256').update(candidate).digest('hex')}));
}
