/* The Grand Slam: staging-only assisted SCB reconciliation.
 * No bank access, no automatic payment approval, no real funds transfer.
 * Inputs are normalized statement entries obtained by an authorized Admin.
 */
'use strict';
const CENTS = n => Number.isFinite(Number(n))&&Number(n)>=0?
  Math.round(Number(n)*100):NaN;
const isTimestamp = x => typeof x==='string' && Number.isFinite(Date.parse(x));
const minutesBetween=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/60000;
function reconcile(bookings,bankEntries,{windowMinutes=120}={}){
 if(!Array.isArray(bookings)||!Array.isArray(bankEntries))throw new TypeError('Lists required');
 if(!Number.isFinite(windowMinutes)||windowMinutes<0||windowMinutes>1440)
  throw new RangeError('Invalid matching window');
 const statements=bankEntries.map(x=>({
  id:String(x.id||''),
  cents:CENTS(x.creditAmount),time:x.timestamp,reference:String(x.reference||'').trim(),
  direction:x.direction||'credit'
 })).filter(x=>x.id&&Number.isFinite(x.cents)&&isTimestamp(x.time)&&x.direction==='credit');
 const referenceCounts=new Map();
 for(const x of statements)if(x.reference)
  referenceCounts.set(x.reference,(referenceCounts.get(x.reference)||0)+1);
 return bookings.map(b=>{
  const expected=CENTS(b.amount),at=b.slipTimestamp,ref=String(b.slipReference||'').trim();
  if(!b.bookingId||!Number.isFinite(expected)||!isTimestamp(at))
    return {bookingId:b.bookingId||null,status:'invalid_booking',candidates:[],requiresAdmin:true};
  const possible=statements.filter(e=>e.cents===expected&&
   minutesBetween(e.time,at)<=windowMinutes&&
   (!ref||!e.reference||ref===e.reference));
  const exact=ref&&referenceCounts.get(ref)===1?
   possible.filter(e=>e.reference===ref):[];
  let status='unmatched';
  let candidates=possible.map(e=>e.id);
  if(exact.length===1){status='strong_candidate';candidates=[exact[0].id]}
  else if(possible.length===1){status='possible_match'}
  else if(possible.length>1){status='ambiguous_multiple_credits'}
  return {bookingId:b.bookingId,status,candidates,requiresAdmin:true,
   // NEVER authorize payment from a matcher result alone.
   paymentVerified:false};
 });
}
module.exports={reconcile};
