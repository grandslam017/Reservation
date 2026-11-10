import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { formatBookingConfirmedMessage } from "./message.mjs";
// STAGING ONLY. Safe to deploy with delivery disabled; DO NOT enable until the
// owner-configured LINE recipient, channel token and runner secret are verified.
// JWT verification MUST stay on, plus a server-only worker secret.
const STAGING_REF="kssxxizhpoxxlbsehymk";
Deno.serve(async(req)=>{
 if(req.method!=="POST")return new Response("method not allowed",{status:405});
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const lineKey=Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")||"";
 const testUser=Deno.env.get("LINE_STAGING_TEST_USER_ID")||"";
 const workerKey=Deno.env.get("STAGING_LINE_WORKER_SECRET")||"";
 // Explicit opt-in is separate from configuring secrets. No push traffic unless enabled.
 if(Deno.env.get("STAGING_LINE_SEND_ENABLED")!=="YES_ONE_TEST_RECIPIENT")
  return new Response(JSON.stringify({error:"STAGING_LINE_SENDING_DISABLED"}),{status:503});
 if(url!=="https://"+STAGING_REF+".supabase.co"||!key||!lineKey||
    !/^U[0-9a-fA-F]{32}$/.test(testUser)||workerKey.length<32)
  return new Response(JSON.stringify({error:"STAGING_WORKER_NOT_CONFIGURED"}),{status:503});
 if(req.headers.get("x-worker-secret")!==workerKey)return new Response("forbidden",{status:403});
 // Require a deliberate single-event request. No default queue draining.
 let requestBody;
 try { requestBody=await req.json(); } catch { return Response.json({error:"INVALID_JSON"},{status:400}); }
 const eventKey=requestBody?.event_key;
 if(typeof eventKey!=="string"||!/^booking_confirmed:[0-9a-fA-F-]{36}$/.test(eventKey))
  return Response.json({error:"SPECIFIC_EVENT_REQUIRED"},{status:400});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:job,error}=await db.rpc("staging_claim_specific_line_notification",{
  p_event_key:eventKey,p_recipient:testUser
 });
 if(error)return new Response(JSON.stringify({error:"CLAIM_FAILED"}),{status:503});
 if(!job?.found)return Response.json({state:"empty"});
 const id=job.id,attempt=job.attempt;
 let sent=false,code="UNKNOWN";
 try{
  if(job.line_user_id!==testUser){code="NOT_STAGING_TEST_RECIPIENT"}
  else {
   const text=formatBookingConfirmedMessage(job.payload);
   const res=await fetch("https://api.line.me/v2/bot/message/push",{
    method:"POST",
    headers:{"Authorization":"Bearer "+lineKey,"Content-Type":"application/json",
             "X-Line-Retry-Key":id},
    body:JSON.stringify({to:testUser,messages:[{type:"text",text}]}),
    signal:AbortSignal.timeout(8000),
   });
   sent=res.ok||(res.status===409&&!!res.headers.get("x-line-accepted-request-id"));
   code=sent?"ACCEPTED":"LINE_HTTP_"+res.status;
  }
 }catch { code="DELIVERY_UNAVAILABLE"; }
 const completed=await db.rpc("staging_complete_line_notification",{
  p_id:id,p_attempt:attempt,p_sent:sent,p_error:code
 });
 if(completed.error||!completed.data?.updated)
  return Response.json({state:"STATE_UPDATE_FAILED"},{status:503});
 return Response.json({state:sent?"accepted":"failed",reason:code});
});
