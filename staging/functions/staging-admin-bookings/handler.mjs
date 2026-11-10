export const STAGING_URL='https://kssxxizhpoxxlbsehymk.supabase.co';
const ORIGIN='https://illustrious-alfajores-364eb8.netlify.app';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['snapshot','notes','customer-details','coach','cancel','reschedule']);
const ERRORS=new Set(['NOT_FOUND','STALE_BOOKING','NOT_CONFIRMED','INVALID_COMMAND',
  'IDEMPOTENCY_CONFLICT','INVALID_PATCH','INVALID_RESCHEDULE','PAYMENT_REVIEW_REQUIRED','COLLISION']);
export function createHandler(deps){
 return async req=>{
  const origin=req.headers.get('Origin');
  const reply=(status,body)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{
   'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
   ...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})}});
  if(origin&&origin!==ORIGIN)return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(req.method==='OPTIONS')return reply(204,null);
  if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(deps.url!==STAGING_URL)return reply(503,{error:'STAGING_CONFIGURATION_REQUIRED'});
  const token=req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!token)return reply(401,{error:'AUTH_REQUIRED'});
  try{
   // Fetch live user data so an old JWT cannot retain a removed app role.
   const user=await deps.getUser(token);
   if(!user)return reply(401,{error:'INVALID_SESSION'});
   if(user.is_anonymous||user.app_metadata?.role!=='admin')return reply(403,{error:'ADMIN_REQUIRED'});
   const raw=await req.text();
   if(new TextEncoder().encode(raw).length>8192)return reply(413,{error:'REQUEST_TOO_LARGE'});
   let input;try{input=JSON.parse(raw);}catch{return reply(400,{error:'INVALID_JSON'});}
   if(!input||Array.isArray(input)||!ACTIONS.has(input.action)||!UUID.test(input.booking_id||''))return reply(400,{error:'INVALID_COMMAND'});
   if(input.action!=='snapshot'&&(!UUID.test(input.request_id||'')||
      !/^[0-9a-f]{64}$/.test(input.expected_hash||'')||!input.patch||typeof input.patch!=='object'||Array.isArray(input.patch)))
    return reply(400,{error:'INVALID_COMMAND'});
   if(!await deps.rateLimit(user.id))return reply(429,{error:'RATE_LIMIT_REJECTED'});
   // Only these explicit fields reach the RPC. Actor and target URL are server-owned.
   const result=input.action==='snapshot'?
    await deps.snapshot(user.id,input.booking_id):
    await deps.command({p_admin:user.id,p_request_id:input.request_id,p_booking_id:input.booking_id,
      p_action:input.action,p_patch:input.patch,p_expected_hash:input.expected_hash});
   if(result?.success!==true){
    const code=ERRORS.has(result?.error)?result.error:'BOOKING_COMMAND_REJECTED';
    return reply(code==='NOT_FOUND'?404:['STALE_BOOKING','IDEMPOTENCY_CONFLICT','COLLISION','PAYMENT_REVIEW_REQUIRED'].includes(code)?409:400,{success:false,error:code,environment:'staging'});
   }
   return reply(200,{...result,environment:'staging'});
  }catch{return reply(503,{error:'ADMIN_BOOKING_UNAVAILABLE'});}
 };
}
