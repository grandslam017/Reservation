const test=require('node:test'),assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.disabled=false;this.checked=false;}
 append(...els){for(const el of els){el.parentNode=this;this.children.push(el);}}
 prepend(el){el.parentNode=this;this.children.unshift(el);}
 replaceChildren(...els){this.children=[];this.append(...els);}
 setAttribute(){} reportValidity(){return true;}
}
const booking={id:'22222222-2222-4222-8222-222222222222',booking_date:'2026-11-15',time_slot:'18:00 - 19:00',fee:350,status:'confirmed',customer_name:'<img onerror=attack()>',phone:'0812345678',email:'test@example.test',car_plate:'TEST',admin_notes:'old',require_coach:false};
const snapshot={booking,snapshot_hash:'ab'.repeat(32)};
function all(el){return [el,...el.children.flatMap(all)];}
async function fixture(execute=async()=>snapshot,onSaved){
 const calls=[],pending=[];let saved=0,prepares=0;
 const api={snapshot:async()=>snapshot,prepare:(s,action,patch)=>{prepares++;return{execute:async()=>{calls.push({action,patch});return execute();}};}};
 const {mountBookingEditor}=await import('../staging/frontend/admin-booking-editor.mjs');
 const editor=mountBookingEditor({document:{createElement:tag=>new Element(tag)},bookingId:booking.id,api,
  onPendingChange:p=>pending.push(p),onSaved:()=>{saved++;if(onSaved)return onSaved();}});
 const nodes=all(editor.element),field=name=>nodes.find(x=>x.name===name),form=nodes.find(x=>x.tagName==='form');
 await editor.open();return {editor,api,calls,pending,field,nodes,submit:()=>form.onsubmit({preventDefault(){}}),get saved(){return saved;},get prepares(){return prepares;}};
}
test('snapshot is rendered as text, notes patch excludes financial and recipient fields',async()=>{
 const f=await fixture();assert(f.nodes.some(n=>n.textContent.includes(booking.customer_name)));
 assert(!f.nodes.some(n=>n.tagName==='img'));f.field('admin_notes').value='new';await f.submit();
 assert.deepEqual(f.calls,[{action:'notes',patch:{admin_notes:'new'}}]);assert.equal(f.saved,1);
});
test('uncertain result freezes fields and retries the same prepared intent',async()=>{
 let n=0;const f=await fixture(async()=>{if(++n===1)throw Error('network');return snapshot;});
 f.field('admin_notes').value='first';await f.submit();assert.equal(f.field('admin_notes').disabled,true);
 assert.equal(f.prepares,1);await f.submit();assert.equal(f.prepares,1);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.saved,1);
});
test('stale rejection requires fresh snapshot before another save',async()=>{
 const f=await fixture(async()=>{throw Error('STALE_BOOKING');});await f.submit();await f.submit();
 assert.equal(f.calls.length,1);assert(f.nodes.some(n=>n.textContent.includes('โหลดข้อมูลล่าสุดก่อน')));
});
test('coach and customer actions send only validated explicit fields',async()=>{
 const f=await fixture();f.field('booking_action').value='coach';f.field('booking_action').onchange();f.field('require_coach').checked=true;
 await f.submit();assert.deepEqual(f.calls[0],{action:'coach',patch:{require_coach:true}});
 f.field('booking_action').value='customer-details';f.field('booking_action').onchange();f.field('phone').value='081-234-5678';await f.submit();
 assert.deepEqual(f.calls[1].patch,{customer_name:booking.customer_name,phone:booking.phone,email:booking.email,car_plate:booking.car_plate});
});
test('cancellation requires explicit acknowledgement',async()=>{
 const f=await fixture();f.field('booking_action').value='cancel';f.field('booking_action').onchange();await f.submit();assert.equal(f.calls.length,0);
 f.field('confirm_cancel').checked=true;await f.submit();assert.deepEqual(f.calls,[{action:'cancel',patch:{}}]);
});
test('disposed editors ignore delayed snapshot and clear personal data',async()=>{
 const f=await fixture();let finish;f.api.snapshot=()=>new Promise(resolve=>{finish=resolve;});
 f.nodes.find(n=>n.tagName==='button'&&n.textContent==='ปิด').onclick();
 const loading=f.editor.open();f.editor.destroy();finish(snapshot);await loading;
 assert.equal(f.editor.element.children.length,0);assert.equal(f.saved,0);
});
test('duplicate submit while request is running produces one command; dispose ignores late success',async()=>{
 let finish;const f=await fixture(()=>new Promise(resolve=>{finish=resolve;}));const first=f.submit();await f.submit();assert.equal(f.calls.length,1);
 f.editor.destroy();finish(snapshot);await first;assert.equal(f.saved,0);assert.equal(f.editor.element.children.length,0);
});
test('a failed list refresh after commit does not invite another mutation retry',async()=>{
 const f=await fixture(async()=>snapshot,()=>{throw Error('refresh unavailable');});await f.submit();
 assert.equal(f.prepares,1);assert.equal(f.pending.at(-1),false);
 assert(f.nodes.some(n=>n.textContent.includes('บันทึกแล้ว แต่โหลดรายการไม่สำเร็จ')));
});
