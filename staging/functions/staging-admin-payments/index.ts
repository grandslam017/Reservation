import { createClient } from "npm:@supabase/supabase-js@2.95.0";
// STAGING ONLY: manual SCB verification; booking remains confirmed even when disputed.
const REF="kssxxizhpoxxlbsehymk";
const ORIGINS=new Set(["https://grandslam017.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond=(status,value,origin)=>new Response(status===204?null:JSON.stringify(value),
 {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",
  ...(origin&&ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin,
   "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
   "Access-Control-Allow-Methods":"POST,OPTIONS"}:{})}});
Deno.serve(async req=>{
 const origin=req.headers.get("Origin");
 if(origin&&!ORIGINS.has(origin))return respond(403,{error:"ORIGIN_NOT_ALLOWED"},null);
 if(req.method==="OPTIONS")return respond(204,null,origin);
 if(req.method!=="POST")return respond(405,{error:"METHOD_NOT_ALLOWED"},origin);
 const url=Deno.env.get("SUPABASE_URL")??"",pub=Deno.env.get("SUPABASE_ANON_KEY")??"",
 secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 if(url!=="https://"+REF+".supabase.co"||!pub||!secret)
   return respond(503,{error:"STAGING_CONFIGURATION_REQUIRED"},origin);
 const token=req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return respond(401,{error:"AUTH_REQUIRED"},origin);
 try{
  const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user)return respond(401,{error:"INVALID_SESSION"},origin);
  if(user.is_anonymous||user.app_metadata?.role!=="admin")
    return respond(403,{error:"ADMIN_REQUIRED"},origin);
  const raw=await req.text();
  if(raw.length>4096)return respond(413,{error:"REQUEST_TOO_LARGE"},origin);
  let data;try{data=JSON.parse(raw)}catch{return respond(400,{error:"INVALID_JSON"},origin)}
  if(!["list","verify","dispute","slip-link"].includes(data?.action))
    return respond(400,{error:"INVALID_ACTION"},origin);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const rate=await db.rpc("staging_check_rate_limit",{
   p_actor:user.id,p_action:"verify-payment",p_limit:12
  });
  if(rate.error)return respond(503,{error:"RATE_LIMIT_UNAVAILABLE"},origin);
  if(!rate.data?.allowed)return respond(429,{error:"TOO_MANY_REQUESTS"},origin);
  if(data.action==="list"){
   const list=await db.rpc("staging_admin_pending_review");
   if(list.error)return respond(503,{error:"REVIEW_QUEUE_UNAVAILABLE"},origin);
   return respond(200,{...list.data,environment:"staging"},origin);
  }
  if(!UUID.test(data.booking_id??""))return respond(400,{error:"INVALID_BOOKING_ID"},origin);
  let result;
  if(data.action==="verify"){
   // Admin must have independently checked SCB; do not auto-trust a slip.
   if(data.confirmed_bank_credit!==true)return respond(400,{error:"SCB_CHECK_REQUIRED"},origin);
   if(typeof data.reference!=="string"||data.reference.length<4||data.reference.length>100)
    return respond(400,{error:"BANK_REFERENCE_REQUIRED"},origin);
   result=await db.rpc("staging_verify_booking_payment",{
    p_booking_id:data.booking_id,p_admin_id:user.id,p_reference:data.reference
   });
  }else if(data.action==="dispute"){
   if(typeof data.note!=="string"||data.note.length>250)
    return respond(400,{error:"INVALID_NOTE"},origin);
   result=await db.rpc("staging_flag_unpaid_booking",{
    p_admin:user.id,p_booking_id:data.booking_id,p_note:data.note
   });
  }else{
   const lookup=await db.rpc("staging_admin_pending_review");
   const row=lookup.data?.review_queue?.find(x=>x.booking_id===data.booking_id);
   if(lookup.error||!row||!row.slip_path||!row.slip_path.startsWith("staging/"))
    return respond(404,{error:"SLIP_NOT_AVAILABLE"},origin);
   const link=await db.storage.from("grandslam-staging-slips")
     .createSignedUrl(row.slip_path,60);
   if(link.error)return respond(503,{error:"SIGNED_URL_FAILED"},origin);
   return respond(200,{success:true,environment:"staging",url:link.data.signedUrl,expires_in:60},origin);
  }
  if(result.error)return respond(400,{error:"PAYMENT_ACTION_REJECTED"},origin);
  return respond(200,{...result.data,environment:"staging"},origin);
 }catch(e){
  console.error("Staging admin payments error",e instanceof Error?e.name:"unknown");
  return respond(500,{error:"INTERNAL_ERROR"},origin);
 }
});
