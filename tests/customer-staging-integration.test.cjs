'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
test('branch UI only calls staging and disables production GAS',()=>{
 assert.match(source,/const GRANDSLAM_STAGING_ONLY = true/);
 assert.doesNotMatch(source,/eqwmodrhorcbsshbepg|eqwmodrhorcbwsshbepg/);
 assert.doesNotMatch(source,/script\.google\.com\/macros\/s\//);
 assert.match(source,/GAS calls are disabled in the Staging branch/);
});
test('legacy HTML remains and staging LIFF adapter is bundled in app.js',()=>{
 assert.match(source,/GrandSlamLiffStagingAdapter/);
 assert.match(source,/STAGING_BOOKING_API\.availability/);
 assert.match(source,/STAGING_BOOKING_API\.pricing/);
 assert.match(source,/STAGING_BOOKING_API\.hold/);
 assert.match(source,/STAGING_BOOKING_API\.release/);
 assert.match(source,/STAGING_BOOKING_API\.uploadSlip/);
 assert.match(source,/STAGING_BOOKING_API\.confirm/);
});
test('customer UI cannot claim paid from an uploaded slip',()=>{
 assert.match(source,/รับหลักฐานสลิปแล้ว/);
 assert.match(source,/รอตรวจสอบการโอน SCB/);
 assert.match(source,/ไม่สามารถเตรียมรูปสลิปได้/);
});
test('customer staging branch disables old booking writes by taking staging path first',()=>{
 const hold=source.indexOf('async function createSlotHold(');
 const oldWrite=source.indexOf('.from(\'bookings\').insert(dbHolds)',hold);
 const newHold=source.indexOf('STAGING_BOOKING_API.hold(',hold);
 assert.ok(hold>=0&&newHold>hold&&oldWrite>newHold);
 const finish=source.indexOf('btnFinishBooking.onclick');
 const staging=source.indexOf('if(GRANDSLAM_STAGING_ONLY)',finish);
 const oldUpload=source.indexOf('.from(\'slips\')',finish);
 assert.ok(finish>=0&&staging>finish&&oldUpload>staging);
});
test('no uncertain weekly availability is labeled AVAILABLE',()=>{
 assert.match(source,/GRANDSLAM_STAGING_ONLY && !stagingBusyByDate\.has\(dateStr\)/);
 assert.match(source,/Never display AVAILABLE before the server confirms that date/);
});
