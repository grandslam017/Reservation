// STAGING-ONLY HTTP negative tests: no real LINE token, no production requests.
const ROOT='https://kssxxizhpoxxlbsehymk.supabase.co/functions/v1';
const requests=[
 {name:'Booking GET disallowed',path:'/staging-liff-booking-gateway',method:'GET',allowed:[405]},
 {name:'Booking missing token rejected',path:'/staging-liff-booking-gateway',method:'POST',
  body:{action:'availability',date:'2026-11-12'},allowed:[401]},
 {name:'Booking forged user ID rejected',path:'/staging-liff-booking-gateway',method:'POST',
  body:{action:'confirm',hold_token:'00000000-0000-4000-8000-000000000001',
   request_id:'00000000-0000-4000-8000-000000000002',name:'Synthetic',phone:'0812345678',
   line_user_id:'U1234567890abcdef1234567890abcdef'},allowed:[401]},
 {name:'Slip no LINE identity rejected',path:'/staging-liff-slip-upload',method:'POST',
  body:{},allowed:[400,401]},
 {name:'Legacy booking confirmation unavailable',path:'/staging-booking-gateway',method:'POST',
  body:{action:'confirm'},allowed:[401,403,410]},
 {name:'Admin payment unauthenticated rejected',path:'/staging-admin-payments',method:'POST',
  body:{action:'list'},allowed:[401,403]},
 {name:'Cross-origin browser writes rejected',path:'/staging-liff-booking-gateway',method:'POST',
  body:{action:'availability',date:'2026-11-12'},origin:'https://not-authorized.example',allowed:[403]}
];
let failures=0;
for(const entry of requests){
 let response;
 try{
   response=await fetch(ROOT+entry.path,{
    method:entry.method,
    headers:{...(entry.origin?{'Origin':entry.origin}:{}),...(entry.body?{'Content-Type':'application/json'}:{})},
    body:entry.body?JSON.stringify(entry.body):undefined,
    signal:AbortSignal.timeout(10000)
   });
 }catch(e){console.error('FAIL '+entry.name+': '+e.message);failures++;continue}
 const valid=entry.allowed.includes(response.status);
 console.log((valid?'PASS':'FAIL')+' '+entry.name+': HTTP '+response.status);
 if(!valid)failures++;
}
if(failures)process.exit(1);
