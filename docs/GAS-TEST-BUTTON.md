# ทดสอบ GAS จากปุ่มในหน้า Admin Staging

เพิ่มปุ่ม `ทดสอบเชื่อมต่อ GAS` ในหน้า `admin/payments.html` เพื่อไม่ต้องใช้ Console หรือปิดการป้องกันการวางโค้ดของ Chrome

ปุ่มใช้ Supabase client/session เดิม เรียกเฉพาะ `staging-gas-gateway` action `health` พร้อม request UUID สุ่ม ไม่ขอ secret จากผู้ใช้ ไม่คืน token หรือลายเซ็นมาแสดง และยังตรวจ Admin ที่ backend ตามเดิม

## นำไฟล์ขึ้น Netlify Staging

1. ใช้ artifact `grand-slam-staging-static-site` จาก workflow ที่ผ่านของ branch นี้ หรือ ZIP ที่สร้างจาก `staging/site-dist`
2. แตก ZIP ให้ได้โฟลเดอร์ที่ข้างในมี index.html, app.js, charts.js, style.css และ admin
3. เปิด Netlify site `illustrious-alfajores-364eb8` > Deploys แล้วลากโฟลเดอร์นั้นไปที่ช่องอัปโหลดของเว็บไซต์เดิม (ไม่สร้างเว็บไซต์ใหม่)
4. เปิด https://illustrious-alfajores-364eb8.netlify.app/admin/payments.html และรีเฟรชให้ได้ไฟล์ล่าสุด
5. เข้าสู่ระบบ Admin Staging แล้วกด `ทดสอบเชื่อมต่อ GAS`

สำเร็จต้องเห็น `เชื่อมต่อ GAS สำเร็จ` ในช่องผลการทดสอบใกล้ปุ่ม แสดงว่าการเรียกที่ตรวจสิทธิ์แล้วผ่านการลงลายเซ็นและ GAS ยอมรับ ไม่ใช่การทดสอบส่งข้อความหรือบันทึก booking จริง

หากไม่สำเร็จส่งเฉพาะรหัส error ที่หน้าเว็บแสดง ไม่ส่งรหัสผ่าน session token หรือ GAS_GATEWAY_SECRET ไม่ต้องเปลี่ยน Gemini key

## ขอบเขตและการตรวจสอบ

- ใช้โค้ด Admin ล่าสุดจาก Staging base ซึ่งมีผลจำลองการรับเงินแสดงใต้รายการแล้ว เพื่อไม่ย้อนแก้ไขงานส่วนนั้น
- ไม่มีการแก้ Production, API, RLS, Gemini key, LINE Token หรือ trigger
- ยังต้องอัปโหลด Netlify ด้วยบัญชีเจ้าของเว็บไซต์ การเปลี่ยนไฟล์ใน GitHub ไม่ได้แปลว่า Netlify manual deploy อัปเดตแล้ว
- ทดสอบ UI handler ด้วย session จำลอง: ไม่ login, success, controlled error, wrong environment/business effects และ double-click
- เป็นการเพิ่มปุ่มเรียก endpoint ที่มีอยู่ ไม่เพิ่มสิทธิ์และไม่เลี่ยงการตรวจ JWT/Admin/HMAC
