'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Supabase Auth legacy gateway cannot bypass LIFF slip requirement',()=>{
 const old=fs.readFileSync(path.join(__dirname,'..','staging/functions/booking-gateway/index.ts'),'utf8');
 const liff=fs.readFileSync(path.join(__dirname,'..','staging/functions/liff-booking-gateway/index.ts'),'utf8');
 assert.match(old,/LEGACY_CONFIRM_DISABLED_USE_VERIFIED_LIFF/);
 assert.doesNotMatch(old,/staging_confirm_hold_v2/);
 assert.match(liff,/staging_confirm_hold_line_v3/);
});
test('staging-only external API origin and project reference are enforced',()=>{
 const old=fs.readFileSync(path.join(__dirname,'..','staging/functions/booking-gateway/index.ts'),'utf8');
 const booking=fs.readFileSync(path.join(__dirname,'..','staging/functions/liff-booking-gateway/index.ts'),'utf8');
 const slip=fs.readFileSync(path.join(__dirname,'..','staging/functions/staging-liff-slip-upload/index.ts'),'utf8');
 for(const file of [booking,slip]){
  assert.match(file,/kssxxizhpoxxlbsehymk/);
  assert.match(file,/https:\/\/kssxxizhpoxxlbsehymk\.supabase\.co/);
 }
 assert.match(old,/EXPECTED_STAGING_REF = "kssxxizhpoxxlbsehymk"/);
});
