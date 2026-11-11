import {createAdminBookingAPI} from './admin-booking-api.mjs';
const REJECTED=new Set(['NOT_FOUND','STALE_BOOKING','NOT_CONFIRMED','INVALID_COMMAND','IDEMPOTENCY_CONFLICT',
 'INVALID_PATCH','INVALID_RESCHEDULE','PAYMENT_REVIEW_REQUIRED','COLLISION','ADMIN_REQUIRED','INVALID_SESSION',
 'RATE_LIMIT_REJECTED','ADMIN_LOGIN_REQUIRED']);
const MESSAGES={
 STALE_BOOKING:'รายการนี้มีการเปลี่ยนแปลงแล้ว กดโหลดข้อมูลล่าสุดก่อนแก้ไขอีกครั้ง',
 NOT_CONFIRMED:'รายการนี้ไม่ได้อยู่ในสถานะ Confirmed แล้ว กดโหลดข้อมูลล่าสุด',
 NOT_FOUND:'ไม่พบรายการจองนี้ กรุณาโหลดรายการใหม่',
 PAYMENT_REVIEW_REQUIRED:'รายการนี้เกี่ยวข้องกับการรับเงินแล้ว ต้องตรวจบัญชีหรือการคืนเงินก่อนยกเลิก',
 ADMIN_REQUIRED:'บัญชีนี้ไม่มีสิทธิ์ Admin',INVALID_SESSION:'กรุณาเข้าสู่ระบบใหม่',
 ADMIN_LOGIN_REQUIRED:'กรุณาเข้าสู่ระบบ Admin ก่อน',RATE_LIMIT_REJECTED:'เรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
 INVALID_PATCH:'ข้อมูลยังไม่ถูกต้อง กรุณาตรวจช่องที่แก้ไข',INVALID_COMMAND:'คำสั่งไม่ถูกต้อง กรุณาโหลดข้อมูลล่าสุด',
 IDEMPOTENCY_CONFLICT:'คำสั่งนี้ขัดแย้งกับคำสั่งก่อนหน้า กรุณาให้ผู้ดูแลตรวจสอบ',
 CANCEL_CONFIRMATION_REQUIRED:'กรุณายืนยันการยกเลิกรายการนี้ก่อน',
 INVALID_CUSTOMER:'กรุณากรอกชื่อ เบอร์โทร อีเมล และทะเบียนรถให้ครบและถูกต้อง',
 NOTE_TOO_LONG:'หมายเหตุยาวเกิน 2,000 ตัวอักษร'};

export function mountBookingEditor({document,client,bookingId,onSaved=()=>{},onPendingChange=()=>{},isCurrent=()=>true,api=createAdminBookingAPI(client)}){
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const root=node('section');root.className='booking-editor';root.hidden=true;
 const heading=node('h3','แก้ไขการจอง · Staging');
 const summary=node('p');summary.className='muted';
 const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const form=node('form');
 const selector=node('select');selector.name='booking_action';
 for(const [value,label] of [['notes','แก้หมายเหตุ Admin'],['customer-details','แก้ข้อมูลผู้จอง'],['coach','เปลี่ยนความต้องการโค้ช'],['cancel','ยกเลิกการจองที่ยังไม่มีการรับเงิน']]){
  const option=node('option',label);option.value=value;selector.append(option);
 }
 selector.value='notes';const selectLabel=node('label','งานที่ต้องการทำ');selectLabel.append(selector);
 const fields={};const groups={};
 function field(group,name,label,type='text',maxLength){
  const control=node(type==='textarea'?'textarea':'input');if(type!=='textarea')control.type=type;
  control.name=name;if(maxLength)control.maxLength=maxLength;
  const row=node('label',label);row.append(control);groups[group].append(row);fields[name]=control;return control;
 }
 for(const kind of ['notes','customer-details','coach','cancel']){groups[kind]=node('div');form.append(groups[kind]);}
 field('notes','admin_notes','หมายเหตุ Admin','textarea',2000);
 field('customer-details','customer_name','ชื่อผู้จอง','text',100);
 field('customer-details','phone','เบอร์โทร','tel',25);
 field('customer-details','email','อีเมล','email',254);
 field('customer-details','car_plate','ทะเบียนรถ','text',40);
 for(const name of ['customer_name','phone','email','car_plate'])fields[name].required=true;
 field('coach','require_coach','ต้องการโค้ช','checkbox');
 groups.cancel.append(node('p','การยกเลิกนี้เปลี่ยนเฉพาะ Staging รายการที่มีการรับเงินแล้วจะต้องตรวจบัญชีก่อน'));
 field('cancel','confirm_cancel','ยืนยันยกเลิกการจองที่แสดงด้านบน','checkbox');
 const save=node('button','บันทึกใน Staging');save.type='submit';
 const reload=node('button','โหลดข้อมูลล่าสุด');reload.type='button';
 const close=node('button','ปิด');close.type='button';
 form.prepend(selectLabel);form.append(save,reload,close);
 root.append(heading,summary,form,status);
 let alive=true,busy=false,snapshot=null,intent=null,sequence=0;
 const current=()=>alive&&isCurrent();
 function pending(value){intent=value;if(current())onPendingChange(!!intent);}
 function render(){
  const locked=busy||!!intent||!snapshot;
  selector.disabled=locked;
  for(const [kind,group] of Object.entries(groups)){
   group.hidden=selector.value!==kind;
   for(const field of Object.values(fields).filter(el=>el.parentNode?.parentNode===group))field.disabled=locked||group.hidden;
  }
  save.disabled=busy||!snapshot;
  save.textContent=busy?'กำลังดำเนินการ...':intent?'ตรวจสอบผลอีกครั้ง':'บันทึกใน Staging';
  reload.disabled=busy||!!intent;close.disabled=busy||!!intent;
 }
 function showSnapshot(result){
  snapshot=result;const b=result.booking;
  summary.textContent=b.booking_date+' '+b.time_slot+' · '+b.customer_name+' · '+b.fee+' บาท · '+b.status;
  for(const name of ['admin_notes','customer_name','phone','email','car_plate'])fields[name].value=b[name]||'';
  fields.require_coach.checked=b.require_coach===true;fields.confirm_cancel.checked=false;
 }
 async function refresh(){
  if(!current()||busy||intent)return;
  const turn=++sequence;busy=true;status.textContent='กำลังโหลดข้อมูลการจองล่าสุด...';render();
  try{const result=await api.snapshot(bookingId);if(!current()||turn!==sequence)return;
   showSnapshot(result);status.textContent='แก้ไขข้อมูลแล้วกดบันทึก การส่งต่อไป Google จะรออยู่ในคิว';
  }catch(e){if(!current()||turn!==sequence)return;snapshot=null;status.textContent=MESSAGES[e.message]||'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่';}
  finally{if(current()&&turn===sequence){busy=false;render();}}
 }
 function patch(){
  if(selector.value==='notes'){
   if(fields.admin_notes.value.length>2000)throw Error('NOTE_TOO_LONG');
   return {admin_notes:fields.admin_notes.value};
  }
  if(selector.value==='coach')return {require_coach:fields.require_coach.checked};
  if(selector.value==='cancel'){
   if(!fields.confirm_cancel.checked)throw Error('CANCEL_CONFIRMATION_REQUIRED');return {};
  }
  const result={customer_name:fields.customer_name.value.trim(),phone:fields.phone.value.replace(/[\s()-]/g,''),
   email:fields.email.value.trim(),car_plate:fields.car_plate.value.trim()};
  if(!result.customer_name||result.customer_name.length>100||!/^\d{9,15}$/.test(result.phone)||
   !/^[^ @]+@[^ @]+\.[^ @]+$/.test(result.email)||result.car_plate.length<2)throw Error('INVALID_CUSTOMER');
  return result;
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(!current()||busy||!snapshot)return;
  try{
   if(!intent){if(form.reportValidity&&!form.reportValidity())return;pending(api.prepare(snapshot,selector.value,patch()));}
  }catch(e){status.textContent=MESSAGES[e.message]||'ข้อมูลยังไม่พร้อมบันทึก';return;}
  busy=true;status.textContent='กำลังบันทึกการจองใน Staging...';render();
  try{
   const result=await intent.execute();if(!current())return;
   pending(null);showSnapshot(result);status.textContent='บันทึกใน Staging แล้ว · รอคิวซิงก์ Google';
   // A refresh/render failure after a successful commit must not turn into a retry.
   try{await onSaved(result);}catch{if(current())status.textContent='บันทึกแล้ว แต่โหลดรายการไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุด';}
  }catch(e){if(!current())return;
   if(REJECTED.has(e.message)){
    pending(null);if(['STALE_BOOKING','NOT_FOUND','NOT_CONFIRMED','ADMIN_REQUIRED','INVALID_SESSION','ADMIN_LOGIN_REQUIRED'].includes(e.message))snapshot=null;
    status.textContent=MESSAGES[e.message]||'คำสั่งถูกปฏิเสธ กรุณาตรวจข้อมูล';
   }else status.textContent='ยังยืนยันผลการบันทึกไม่ได้ กดตรวจสอบผลอีกครั้งก่อนแก้ข้อมูลอื่น';
  }finally{if(current()){busy=false;render();}}
 };
 selector.onchange=()=>{fields.confirm_cancel.checked=false;render();};
 reload.onclick=refresh;close.onclick=()=>{if(busy||intent)return;root.hidden=true;snapshot=null;summary.textContent='';};
 render();
 return {element:root,async open(){if(!current())return;root.hidden=false;if(!snapshot)await refresh();},
  destroy(){alive=false;sequence++;snapshot=null;intent=null;onPendingChange(false);root.replaceChildren();root.hidden=true;}};
}
