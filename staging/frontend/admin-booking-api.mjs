const URL='https://kssxxizhpoxxlbsehymk.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const MUTATIONS=new Set(['notes','customer-details','coach','cancel','reschedule']);
const ERRORS=new Set(['NOT_FOUND','STALE_BOOKING','NOT_CONFIRMED','INVALID_COMMAND','IDEMPOTENCY_CONFLICT',
 'INVALID_PATCH','INVALID_RESCHEDULE','PAYMENT_REVIEW_REQUIRED','COLLISION','ADMIN_REQUIRED','INVALID_SESSION','RATE_LIMIT_REJECTED']);
export function createAdminBookingAPI(client){
 if(client?.supabaseUrl!==URL)throw Error('STAGING_CLIENT_REQUIRED');
 async function call(body){
  const session=await client.auth.getSession();
  if(session.error||!session.data?.session)throw Error('ADMIN_LOGIN_REQUIRED');
  const {data,error}=await client.functions.invoke('staging-admin-bookings',{body});
  if(error){
   let code;try{code=(await error.context.clone().json())?.error;}catch{}
   throw Error(ERRORS.has(code)?code:'ADMIN_BOOKING_UNAVAILABLE');
  }
  if(data?.environment!=='staging'||data.success!==true||data.booking?.id!==body.booking_id||!HASH.test(data.snapshot_hash||''))
   throw Error('INVALID_ADMIN_RESPONSE');
  if(body.action!=='snapshot'&&(data.operation_id!==body.request_id||data.sync_state!=='pending'||data.external_effects_performed!==false))
   throw Error('INVALID_ADMIN_RESPONSE');
  return data;
 }
 return {
  async snapshot(bookingId){if(!UUID.test(bookingId||''))throw Error('INVALID_BOOKING_ID');return call({action:'snapshot',booking_id:bookingId});},
  prepare(snapshot,action,patch){
   if(!UUID.test(snapshot?.booking?.id||'')||!HASH.test(snapshot?.snapshot_hash||'')||!MUTATIONS.has(action)||
      !patch||typeof patch!=='object'||Array.isArray(patch))throw Error('INVALID_COMMAND');
   // Create one ID per user intent; callers retry execute() on the SAME prepared object.
   // Copy patch now so UI changes cannot mutate a retry's payload after a timeout.
   const body=JSON.stringify({action,booking_id:snapshot.booking.id,expected_hash:snapshot.snapshot_hash,
     request_id:crypto.randomUUID(),patch:JSON.parse(JSON.stringify(patch))});
   return {execute:()=>call(JSON.parse(body))};
  },
 };
}
