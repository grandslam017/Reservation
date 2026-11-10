# ทดสอบการซ่อน secret ระหว่าง Supabase กับ GAS — Staging เท่านั้น

## ขอบเขตของชุดนี้

เพิ่มด่านตรวจลายเซ็นใน GAS โครงการใหม่ และ Edge Function ใหม่ `staging-gas-gateway` โดยไม่แทนที่ GAS `BOT V.3` version 78 และไม่แตะ reminder trigger ที่รัน Head

รับเฉพาะ Admin ของ Supabase Staging (`app_metadata.role = admin`, ไม่ใช่ anonymous user) แล้วโหลดข้อมูลจองที่ยืนยันแล้วจาก DB เพื่อลงลายเซ็นฝั่ง server ไม่ส่ง HMAC secret หรือ signed envelope กลับ browser

คำสั่งมีแค่ `health` และ `simulate-confirmation` ไม่มีเส้นทางเขียน bookings, สร้าง Calendar, เขียน Google Sheets, ส่ง LINE หรือ Email ส่วน nonce และ rate-limit counters เป็นข้อมูลควบคุมที่เขียนตามปกติ ไม่มี schema migration

ยังไม่ใช่แพตช์ปิดทางเข้า GAS production และยังไม่ได้ย้ายคำสั่งจริงจากเว็บ production ชุดนี้เป็นขั้นทดสอบ protocol ก่อนย้ายระบบจริง

ใช้ Gemini key เดิมต่อ ชุดนี้ไม่เรียก Gemini และไม่ต้องนำ Gemini key หรือ LINE Token มาใส่ในโครงการทดสอบ

## สถานะการเตรียม (10 พฤศจิกายน 2026)

- Deploy Edge Function ใหม่ใน Staging แล้ว: `staging-gas-gateway` version 1, verify_jwt=true
- ยังไม่ได้ตั้ง Secrets ของ bridge, ยังไม่ได้สร้าง/Deploy GAS โครงการทดสอบ และยังไม่ได้ต่อเข้าหน้าเว็บ
- ทดสอบในเครื่อง 94 ข้อผ่าน รวม 19 ข้อของ protocol/gateway ใหม่
- ยังไม่ได้ทดสอบเส้นทาง Admin → Google runtime จริง ต้องทำขั้นตอนตั้งค่าด้านล่างก่อน
- ไม่มีการเปลี่ยน GAS version 78, Head, Triggers, Gemini key หรือ Supabase Production

## ขั้นตอนผู้ใช้: สร้าง GAS แยก

1. เปิด https://script.google.com/ และสร้าง New project ชื่อ `Grand Slam GAS Gateway Staging`
2. เปิดไฟล์ `staging/gas/Gateway.gs` ใน branch นี้ คัดลอกโค้ดทั้งหมดไปแทน Code.gs ของ **โครงการใหม่เท่านั้น**
3. Save โค้ด ไม่เพิ่ม trigger และไม่คัดลอก production Sheet หรือ Script Properties ทั้งชุด
4. Project Settings > Script Properties เพิ่มสองค่า:

| Property | ค่า |
|---|---|
| GAS_GATEWAY_ENVIRONMENT | staging |
| GAS_GATEWAY_SECRET | ตัวอักษรสุ่มฐานสิบหก 64 ตัวจาก password manager/ตัวสร้างค่าแบบปลอดภัย |

`GAS_GATEWAY_SECRET` เป็นรหัสภายในสำหรับ Edge↔GAS ไม่ใช่ Gemini key ห้ามใช้ค่าเก่าจาก app.js และห้ามส่งค่าในแชต, GitHub หรือ screenshot

5. Deploy > New deployment > Web app ตั้ง Execute as เป็นเจ้าของโครงการ และ Who has access เป็น Anyone เพื่อให้ Edge เรียกได้ โค้ดจะบังคับตรวจ HMAC ก่อนรับคำสั่ง
6. คัดลอก URL ที่ลงท้าย `/exec` ของโครงการใหม่ เปิด URL แล้วต้องเห็น environment `staging` และ mode `simulation-only` นี่ตรวจเพียงว่า Deploy ถูกโครงการ ยังไม่ได้ทดสอบ HMAC

## ตั้งค่าฝั่ง Supabase Staging

ใช้เฉพาะ project `kssxxizhpoxxlbsehymk` ใน Edge Function Secrets:

| Secret | ค่า |
|---|---|
| GAS_GATEWAY_SECRET | ค่าเดียวกับ GAS Staging |
| STAGING_GAS_WEB_APP_URL | URL /exec ของโครงการใหม่ |
| STAGING_GAS_BRIDGE_MODE | SIMULATION_ONLY |

อย่าเพิ่ม secret ด้วย prefix `SUPABASE_` และอย่าส่ง server/service-role key ไปหน้าเว็บ

Edge Function ใช้ SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY ของ runtime และ pin Supabase SDK รุ่นเดียวกับ staging endpoint เดิม เปิด verify_jwt=true

หากยังไม่ได้ตั้งค่าส่วนนี้ ผู้ที่ผ่าน Admin Auth จะได้ GAS_STAGING_SETUP_REQUIRED และไม่มีการเรียก GAS

## ทดสอบเมื่อเชื่อมต่อครบ

เรียกผ่าน Supabase client ที่ล็อกอิน Admin Staging แล้ว (ไม่ใช้บัญชี Production):

```js
const { data, error } = await stagingClient.functions.invoke('staging-gas-gateway', {
  body: { action: 'health', request_id: crypto.randomUUID() }
});
```

ต้องได้ success=true, environment=staging, mode=simulation-only และ gas_reachable=true

จากนั้นใช้ UUID ของ booking Staging ที่ status=confirmed:

```js
const { data, error } = await stagingClient.functions.invoke('staging-gas-gateway', {
  body: {
    action: 'simulate-confirmation',
    request_id: crypto.randomUUID(),
    booking_id: 'UUID-ของการจอง-Staging'
  }
});
```

ต้องได้ business_effects_performed=false ไม่มีการส่งข้อความหรือเขียนข้อมูลธุรกิจจริง ไม่ต้องเพิ่มปุ่มเข้าเว็บเดิมเพื่อทดสอบขั้นนี้

- ไม่ล็อกอิน: 401
- ล็อกอินที่ไม่มี server-owned admin role: 403
- ปลอม role ใน user_metadata: ต้องถูกปฏิเสธ
- คำสั่ง cancelBooking/backup/sendConfirmation: ต้องถูกปฏิเสธ
- ลายเซ็นผิด ข้อมูลถูกเปลี่ยน หรือ nonce ซ้ำ: GAS ต้องปฏิเสธ
- URL ที่ไม่ใช่ GAS หรือ Supabase URL Production: ต้องปฏิเสธก่อน forward

ใช้โควตา rate-limit ของงาน verify-payment เดิมร่วมกัน 12 ครั้ง/นาทีต่อ Admin และมี nonce store ที่จำกัดจำนวนฝั่ง GAS หากทดสอบถี่ให้รอ ไม่ปิดด่านตรวจ

## สิ่งที่ยังต้องทำก่อนใช้งานจริง

- เก็บและเทียบ source ของ Web App version 78 กับ Head โดยตรง โค้ดที่ผู้ใช้ส่งเป็น editor source ยังไม่พิสูจน์ว่าเป็น version 78
- ตรวจ execute-as/access settings และช่วงรัน trigger ให้ครบ
- เพิ่ม authorization และ contract ของคำสั่งจริงแยกตามงาน ไม่เปิด generic signer
- ย้ายแจ้งเตือนจองไป outbox ที่ผูกกับข้อมูลหลักและแยก retry ตาม side effect
- ปิด raw LINE events และคำสั่งตรงของ GAS production เฉพาะเมื่อเส้นทางใหม่พร้อม
- เปลี่ยน shared HMAC secret ที่เคยอยู่ในเว็บในช่วง cutover; ไม่จำเป็นต้องเปลี่ยน Gemini key ตามการเลือกของผู้ใช้
- ทดสอบจริงบน GAS Staging ก่อนวางแผน production ไม่มีการ Merge ไป main หรือ Deploy GAS production ในขั้นนี้

## ตรวจสอบในเครื่อง

```sh
node --test tests/gas-signed-gateway.test.cjs
node --test tests/*.test.cjs
```

ทดสอบ HMAC ข้าม WebCrypto/Apps Script byte array, replay, เวลา, lock, nonce capacity, Admin Auth, ข้อมูลจาก DB และยืนยันว่า mock ของ Sheets/Calendar/LINE/Email ไม่ถูกเรียก ยังไม่ใช่หลักฐานทดสอบ Google runtime จริง

## ย้อนกลับ

ลบ/ปิดเฉพาะ Edge Function ใหม่และ archive deployment ของ GAS โครงการทดสอบนี้ได้ โดย endpoint เดิม เว็บเดิม และ trigger เดิมไม่ได้ถูกเปลี่ยน ไม่ต้องเปลี่ยน key ของ Gemini
