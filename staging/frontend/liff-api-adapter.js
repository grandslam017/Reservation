/* Staging-only LINE LIFF bridge. This module does not alter the existing DOM or CSS.
 * The production Web App still loads the original app.js; integration is intentionally gated.
 */
(function (root,factory) {
 if(typeof module==="object"&&module.exports)module.exports=factory();
 else root.GrandSlamLiffStagingAdapter=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const URL="https://kssxxizhpoxxlbsehymk.supabase.co/functions/v1/staging-liff-booking-gateway";
 async function makeRequest(liff,action,args={},fetcher=fetch){
  if(!liff||!liff.isLoggedIn||!liff.isLoggedIn()||typeof liff.getIDToken!=="function")
   return {success:false,error:"LINE_LOGIN_REQUIRED"};
  const raw=liff.getIDToken();
  if(!raw)return {success:false,error:"LINE_OPENID_SCOPE_REQUIRED"};
  let res;
  try{
   res=await fetcher(URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,line_id_token:raw,...args})});
  }catch{return {success:false,error:"NETWORK_ERROR"}}
  let data;try{data=await res.json()}catch{return {success:false,error:"GATEWAY_RESPONSE_INVALID"}}
  if(!res.ok)return {success:false,error:data?.error||"GATEWAY_ERROR"};
  if(data?.environment!=="staging")return {success:false,error:"WRONG_ENVIRONMENT"};
  return data;
 }
 function create(liff,fetcher){
  return Object.freeze({
   availability:async date=>{
    const r=await makeRequest(liff,"availability",{date},fetcher);
    if(!r.success)return r;
    const slots=(r.busy_slots||[]).map(x=>x.slot);
    return {success:true,busySlots:slots,bookings:slots.map(slot=>({date,slot,
      status:"confirmed",name:"",phone:"",email:"",court:"Main Court"}))};
   },
   pricing:async date=>{
    const r=await makeRequest(liff,"pricing",{date},fetcher);
    if(!r.success)return r;
    return {success:true,date,prices:r.prices};
   },
   hold:async(date,slots)=> {
    const r=await makeRequest(liff,"create",{date,slots},fetcher);
    return r.success?{success:true,holdToken:r.hold_token,expiresAt:r.expires_at}:r;
   },
   confirm:async({holdToken,requestId,name,phone,email})=>{
    const r=await makeRequest(liff,"confirm",{
     hold_token:holdToken,request_id:requestId,name,phone,email
    },fetcher);
    return r.success?{success:true,status:"confirmed",paymentStatus:"pending_verification",
      bookingIds:r.booking_ids,invoiceNo:r.invoice_no,
      notificationQueued:r.line_notification==="queued",paymentVerified:false}:r;
   },
   release:holdToken=>makeRequest(liff,"release",{hold_token:holdToken},fetcher),
  });
 }
 return Object.freeze({create});
});
