'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createMockGoogleBridge}=require('../staging/integrations/google-gas-mock.cjs');
test('mock calendar and sheet effects are local only and idempotent',async()=>{
 const m=createMockGoogleBridge();
 const data={invoiceNo:'INV.202611001',date:'2026-11-15',
 slots:['18:00 - 19:00','19:00 - 20:00']};
 const a=await m.sendConfirmation(data),b=await m.sendConfirmation(data);
 assert.equal(a.environment,'staging-mock');assert.equal(a.lineDelivery,'not_sent');
 assert.equal(a.sheetsRows,2);
 assert.equal(b.duplicate,true);assert.equal(m.getEvents().length,2);
 assert.equal(m.getAudit().length,1);
});
test('mock rejects malformed booking without touching resources',async()=>{
 const m=createMockGoogleBridge();
 await assert.rejects(m.sendConfirmation({invoiceNo:'BAD',date:'today',slots:[]}));
 assert.equal(m.getEvents().length,0);
});
