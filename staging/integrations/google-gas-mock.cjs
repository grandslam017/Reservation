/* Pure staging-only mock of GAS Booking confirmation side effects.
 * NO network, Google Calendar, Google Sheets or LINE calls.
 */
'use strict';
function createMockGoogleBridge(){
 const invoices=new Map(),events=new Map(),logs=[];
 return Object.freeze({
  async sendConfirmation(data){
   if(!data||typeof data!=='object'||!/^INV\.\d{9,}$/.test(data.invoiceNo||'')||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')||
      !Array.isArray(data.slots)||data.slots.length<1)throw Error('INVALID_NOTIFICATION');
   const key=data.invoiceNo;
   if(invoices.has(key))return {...invoices.get(key),duplicate:true};
   const ids=data.slots.map((_,i)=>'STAGING-MOCK-EVENT-'+(events.size+i+1));
   const out={status:'success',environment:'staging-mock',invoiceNo:key,calendarEventIds:ids,
    sheetsRows:data.slots.length,lineDelivery:'not_sent'};
   invoices.set(key,out);
   data.slots.forEach((slot,i)=>events.set(key+'/'+slot,{date:data.date,slot,id:ids[i]}));
   logs.push({type:'mock_booking_confirmation',invoiceNo:key,slots:data.slots.length});
   return {...out};
  },
  getEvents(){return [...events.values()].map(x=>({...x}))},
  getAudit(){return logs.map(x=>({...x}))},
 });
}
module.exports={createMockGoogleBridge};
