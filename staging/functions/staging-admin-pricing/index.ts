import { createClient } from "npm:@supabase/supabase-js@2.95.0";
// Secure administrator-only STAGING API. Never supply admin identity in browser request.
const REF="kssxxizhpoxxlbsehymk";
const ORIGINS=new Set(["https://grandslam017.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
const respond=(status,data,origin)=>new Response(status===204?null:JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",
 ...(origin&&ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin,
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS"}:{})}});
const date=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
Deno.serve(async(req)=>{
 const origin=req.headers.get("Origin");
 if(origin&&!ORIGINS.has(origin))return respond(403,{error:"ORIGIN_NOT_ALLOWED"},null);
 if(req.method==="OPTIONS")return respond(204,null,origin);
 if(req.method!=="POST")return respond(405,{error:"METHOD_NOT_ALLOWED"},origin);
 const url=Deno.env.get("SUPABASE_URL")??"",pub=Deno.env.get("SUPABASE_ANON_KEY")??"",
 secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 if(url!=="https://"+REF+".supabase.co"||!pub||!secret)
   return respond(503,{error:"STAGING_ONLY"},origin);
 const token=req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return respond(401,{error:"AUTH_REQUIRED"},origin);
 try{
  // Use fresh Auth profile, never user-editable metadata to determine administrator access.
  const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user)return respond(401,{error:"INVALID_SESSION"},origin);
  if(user.is_anonymous||user.app_metadata?.role!=="admin")
    return respond(403,{error:"ADMIN_REQUIRED"},origin);
  const raw=await req.text();
  if(raw.length>4096)return respond(413,{error:"TOO_LARGE"},origin);
  let body;try{body=JSON.parse(raw)}catch{return respond(400,{error:"INVALID_JSON"},origin)}
  const action=body?.action;
  if(!["list","set-hour","save-promo"].includes(action))
    return respond(400,{error:"INVALID_ACTION"},origin);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const throttle=await db.rpc("staging_check_rate_limit",{
   p_actor:user.id,p_action:"admin-pricing",p_limit:20
  });
  if(throttle.error)return respond(503,{error:"RATE_LIMIT_UNAVAILABLE"},origin);
  if(!throttle.data?.allowed)return respond(429,{error:"TOO_MANY_REQUESTS"},origin);
  if(action==="list"){
   const listing=await db.rpc("staging_list_pricing_rules");
   if(listing.error)return respond(503,{error:"PRICE_LIST_UNAVAILABLE"},origin);
   return respond(200,{...listing.data,environment:"staging"},origin);
  }
  let dbResult;
  if(action==="set-hour"){
   if(!Number.isInteger(body.hour)||body.hour<8||body.hour>22||
      typeof body.price!=="number"||!Number.isFinite(body.price)||body.price<0||body.price>100000)
     return respond(400,{error:"INVALID_PRICE"},origin);
   dbResult=await db.rpc("staging_set_hour_price",{
    p_admin:user.id,p_hour:body.hour,p_price:body.price
   });
  } else {
   if(typeof body.code!=="string"||!/^\w{3,49}$/.test(body.code)||
     !date(body.start)||!date(body.end)||body.start>body.end||
     !Array.isArray(body.weekdays)||!body.weekdays.length||body.weekdays.length>7||
     !body.weekdays.every(x=>Number.isInteger(x)&&x>=1&&x<=7)||
     !Number.isInteger(body.start_hour)||body.start_hour<8||
     !Number.isInteger(body.end_hour)||body.end_hour>23||body.end_hour<=body.start_hour||
     typeof body.price!=="number"||!Number.isFinite(body.price)||body.price<0||body.price>100000||
     !Number.isInteger(body.priority)||body.priority<0||body.priority>1000||
     typeof body.active!=="boolean")
     return respond(400,{error:"INVALID_PROMOTION"},origin);
   dbResult=await db.rpc("staging_save_promo",{
    p_admin:user.id,p_code:body.code,p_start:body.start,p_end:body.end,
    p_weekdays:body.weekdays,p_from_hour:body.start_hour,
    p_to_hour:body.end_hour,p_price:body.price,
    p_priority:body.priority,p_active:body.active
   });
  }
  if(dbResult.error){console.error("Admin pricing RPC",dbResult.error.code);
    return respond(400,{error:"PRICE_UPDATE_REJECTED"},origin)}
  return respond(200,{...dbResult.data,environment:"staging"},origin);
 }catch(e){console.error("Admin pricing gateway error",e instanceof Error?e.name:"unknown");
   return respond(500,{error:"INTERNAL_ERROR"},origin)}
});
