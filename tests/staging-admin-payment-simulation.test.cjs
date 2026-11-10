'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const edge=fs.readFileSync(path.join(base,'staging/functions/staging-admin-payments/index.ts'),'utf8');
const html=fs.readFileSync(path.join(base,'staging/admin/payments.html'),'utf8');
const sql=fs.readFileSync(path.join(base,'staging/migrations/20261110_staging_payment_verification_projection.sql'),'utf8');
test('simulation is distinct from actual payment verification, and always branded no-write',()=>{
 assert.match(edge,/data.action==="simulate-verify"/);
 assert.match(edge,/staging_simulate_booking_payment_verification/);
 assert.match(html,/จำลองยืนยันรับเงิน \(ไม่บันทึก\)/);
 assert.match(html,/writes_performed!==false/);
 assert.match(html,/action:'simulate-verify'/);
 assert.match(sql,/'writes_performed',false/);
 assert.match(sql,/'actual_bank_credit_verified',false/);
});
test('simulation SQL is STABLE, service-role-only, and contains no DML',()=>{
 assert.match(sql,/LANGUAGE plpgsql STABLE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(sql,/TO service_role/);
 assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE|EXECUTE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|storage\.|booking_internal\.)/i);
});
test('simulation does not bypass explicit verified bank credit gate',()=>{
 assert.match(edge,/data.confirmed_bank_credit!==true/);
 assert.match(edge,/BANK_REFERENCE_REQUIRED/);
 assert.match(edge,/app_metadata\?\.role!=="admin"/);
});
