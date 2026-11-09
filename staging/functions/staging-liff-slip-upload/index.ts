import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { verifyLineIDToken, actorIdFromVerifiedLineId } from "./line-security.mjs";
// Staging-only private proof-of-transfer storage; NOT bank verification.
const REF="kssxxizhpoxxlbsehymk";
const CHANNEL="2010398825"; // Verify in LINE Developers before E2E.
const BUCKET="grandslam-staging-slips";
const ORIGINS=new Set(["https://kssxxizhpoxxlbsehymk.supabase.co","https://grandslam017.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function result(status,data,origin){
 const h={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
 if(origin&&ORIGINS.has(origin))Object.assign(h,{
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"content-type,apikey,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
 });
 return new Response(status===204?null:JSON.stringify(data),{status,headers:h});
}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin");
 if(origin&&!ORIGINS.has(origin))return result(403,{error:"ORIGIN_NOT_ALLOWED"},null);
 if(req.method==="OPTIONS")return result(204,null,origin);
 if(req.method!=="POST")return result(405,{error:"METHOD_NOT_ALLOWED"},origin);
 const url=Deno.env.get("SUPABASE_URL")??"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 if(url!=="https://"+REF+".supabase.co"||!key)return result(503,{error:"STAGING_ONLY"},origin);
 if(Number(req.headers.get("content-length")??0)>1450000)
  return result(413,{error:"UPLOAD_TOO_LARGE"},origin);
 if(!/^multipart\/form-data(?:;|$)/i.test(req.headers.get("content-type")||""))
  return result(415,{error:"MULTIPART_FORM_REQUIRED"},origin);
 try{
  let form: FormData;
  try { form=await req.formData(); }
  catch { return result(400,{error:"INVALID_MULTIPART_FORM"},origin); }
  const idToken=form.get("line_id_token"),holdToken=form.get("hold_token"),file=form.get("file");
  if(typeof idToken!=="string"||typeof holdToken!=="string"||!UUID.test(holdToken)||
     !(file instanceof File)||file.size<16||file.size>1048576)
   return result(400,{error:"INVALID_UPLOAD"},origin);
  const identity=await verifyLineIDToken(idToken,CHANNEL);
  if(!identity.ok)return result(401,{error:identity.error},origin);
  const owner=await actorIdFromVerifiedLineId(identity.lineUserId);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rate=await db.rpc("staging_check_rate_limit",{
   p_actor:owner,p_action:"upload-slip",p_limit:5
  });
  if(rate.error)return result(503,{error:"RATE_LIMIT_UNAVAILABLE"},origin);
  if(!rate.data?.allowed)return result(429,{error:"TOO_MANY_UPLOADS"},origin);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const mime=png?"image/png":jpeg?"image/jpeg":null;
  if(!mime||file.type!==mime)return result(400,{error:"INVALID_IMAGE_TYPE"},origin);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  const hash=[...digest].map(n=>n.toString(16).padStart(2,"0")).join("");
  const path="staging/"+owner+"/"+holdToken+"/"+crypto.randomUUID()+(png?".png":".jpg");
  // Upload with service-role access only. No publicly accessible URL is generated.
  const uploaded=await db.storage.from(BUCKET).upload(path,bytes,{
   contentType:mime,cacheControl:"no-store",upsert:false
  });
  if(uploaded.error)return result(503,{error:"PRIVATE_UPLOAD_FAILED"},origin);
  const attached=await db.rpc("staging_register_hold_slip",{
   p_owner:owner,p_token:holdToken,p_path:path,p_hash:hash
  });
  if(attached.error||!attached.data?.success){
   await db.storage.from(BUCKET).remove([path]).catch(()=>{});
   return result(400,{error:attached.data?.error??"ATTACH_FAILED"},origin);
  }
  return result(200,{success:true,environment:"staging",slip_received:true,
   payment_verified:false},origin);
 }catch(e){
  console.error("Staging slip upload",e instanceof Error?e.name:"unknown");
  return result(500,{error:"UPLOAD_FAILED"},origin);
 }
});
