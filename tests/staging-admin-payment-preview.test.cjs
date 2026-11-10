'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'staging/admin/payments.html'),'utf8');
const edge=fs.readFileSync(path.join(root,'staging/functions/staging-admin-payments/index.ts'),'utf8');
const sql=fs.readFileSync(path.join(root,'staging/migrations/20261110_staging_payment_safe_preflight.sql'),'utf8');
test('Staging admin preflight is a separate clearly non-writing action',()=>{
 assert.match(html,/preview-verify/);
 assert.match(html,/ตรวจความพร้อม \(ไม่บันทึก\)/);
 assert.match(edge,/staging_preview_booking_payment_verification/);
 assert.match(edge,/if\(data\.action==="preview-verify"\)/);
});
test('SQL preflight reads booking, slip and income but never writes',()=>{
 assert.match(sql,/FROM public\.bookings/);
 assert.match(sql,/FROM public\.transactions/);
 assert.match(sql,/FROM storage\.objects/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|booking_internal\.|storage\.)/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(sql,/TO service_role/);
});
