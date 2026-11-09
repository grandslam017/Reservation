import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { verifyLineIDToken, actorIdFromVerifiedLineId } from "./line-security.mjs";

const PROJECT_REF = "kssxxizhpoxxlbsehymk";
// Existing LIFF ID begins 2010398825-...; this MUST be checked with LINE Developers console
// before customer end-to-end testing. Never accept channel id from browser.
const EXPECTED_LINE_LOGIN_CHANNEL_ID = "2010398825";
const ORIGINS = new Set(["https://kssxxizhpoxxlbsehymk.supabase.co","https://illustrious-alfajores-364eb8.netlify.app","https://grandslam017.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
const VALID_ACTIONS = new Set(["availability","pricing","create","confirm","release"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function respond(status,body,origin){
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};
  if(origin&&ORIGINS.has(origin))Object.assign(headers,{"Access-Control-Allow-Origin":origin,
    "Access-Control-Allow-Headers":"content-type,apikey,x-client-info",
    "Access-Control-Allow-Methods":"POST,OPTIONS"});
  return new Response(status===204?null:JSON.stringify(body),{status,headers});
}
function validDate(v){
  if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+"T00:00:00Z");
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
}
Deno.serve(async (req)=>{
  const origin=req.headers.get("Origin");
  if(origin&&!ORIGINS.has(origin))return respond(403,{error:"ORIGIN_NOT_ALLOWED"},null);
  if(req.method==="OPTIONS")return respond(204,null,origin);
  if(req.method!=="POST")return respond(405,{error:"METHOD_NOT_ALLOWED"},origin);
  const url=Deno.env.get("SUPABASE_URL")??"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(url!=="https://"+PROJECT_REF+".supabase.co"||!key)
    return respond(503,{error:"STAGING_ONLY"},origin);
  try{
    const size=Number(req.headers.get("content-length")??0);
    if(size>6000)return respond(413,{error:"REQUEST_TOO_LARGE"},origin);
    const raw=await req.text();
    if(raw.length>6000)return respond(413,{error:"REQUEST_TOO_LARGE"},origin);
    let data;
    try{data=JSON.parse(raw)}catch{return respond(400,{error:"INVALID_JSON"},origin)}
    if(!data||typeof data!=="object"||Array.isArray(data)||!VALID_ACTIONS.has(data.action))
      return respond(400,{error:"INVALID_ACTION"},origin);

    // Verify with LINE's server on EVERY request. There is NO Supabase customer sign-in screen.
    const verified=await verifyLineIDToken(data.line_id_token,EXPECTED_LINE_LOGIN_CHANNEL_ID);
    if(!verified.ok)return respond(verified.error==="LINE_VERIFICATION_UNAVAILABLE"?503:401,{error:verified.error},origin);
    const owner=await actorIdFromVerifiedLineId(verified.lineUserId);
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const quota={availability:30,pricing:30,create:5,confirm:8,release:15}[data.action];
    const throttle=await db.rpc("staging_check_rate_limit",{p_actor:owner,p_action:data.action,p_limit:quota});
    if(throttle.error)return respond(503,{error:"RATE_LIMIT_UNAVAILABLE"},origin);
    if(!throttle.data?.allowed)return respond(429,{error:"TOO_MANY_REQUESTS"},origin);
    let call;
    if(data.action==="availability"){
      if(!validDate(data.date))return respond(400,{error:"INVALID_DATE"},origin);
      call=await db.rpc("staging_get_availability",{p_date:data.date,p_court:"Main Court"});
    }else if(data.action==="pricing"){
      if(!validDate(data.date))return respond(400,{error:"INVALID_DATE"},origin);
      call=await db.rpc("staging_get_pricing",{p_date:data.date});
    }else if(data.action==="create"){
      if(!validDate(data.date)||!Array.isArray(data.slots)||data.slots.length<1||data.slots.length>8||
          !data.slots.every(x=>typeof x==="string"&&x.length<=20))
        return respond(400,{error:"INVALID_INPUT"},origin);
      call=await db.rpc("staging_create_hold_v2",{p_owner:owner,p_date:data.date,p_slots:data.slots,p_court:"Main Court"});
    }else if(data.action==="confirm"){
      if(!UUID.test(data.hold_token??"")||!UUID.test(data.request_id??"")||
         typeof data.name!=="string"||typeof data.phone!=="string"||
         typeof data.email!=="string"||typeof data.car_plate!=="string"||
         data.name.trim().length<2||data.name.length>100||
         !/^[0-9]{9,15}$/.test(data.phone.replace(/[\\s()-]/g,""))||
         !/^[^ @]+@[^ @]+\\.[^ @]+$/.test(data.email.trim())||data.email.length>254||
         data.car_plate.trim().length<2||data.car_plate.length>40)
        return respond(400,{error:"INVALID_CUSTOMER"},origin);
      call=await db.rpc("staging_confirm_hold_line_v4",{
        p_owner:owner,p_line_user_id:verified.lineUserId,
        p_token:data.hold_token,p_request_id:data.request_id,
        p_name:data.name.trim(),p_phone:data.phone,p_email:data.email.trim(),
        p_car_plate:data.car_plate.trim()
      });
    }else{
      if(!UUID.test(data.hold_token??""))return respond(400,{error:"INVALID_INPUT"},origin);
      call=await db.rpc("staging_release_hold_v2",{p_owner:owner,p_token:data.hold_token});
    }
    if(call.error){console.error("Staging LINE RPC error",data.action,call.error.code);
      return respond(400,{error:"BOOKING_REQUEST_REJECTED"},origin)}
    return respond(200,{...call.data,environment:"staging",payment_verified:false},origin);
  }catch(e){console.error("Staging LIFF gateway error",e instanceof Error?e.name:"unknown");
    return respond(500,{error:"INTERNAL_ERROR"},origin)}
});
