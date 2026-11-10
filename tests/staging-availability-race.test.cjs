'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const anchor=src.indexOf('async function stagingRefreshSelectedDate(){');
const end=src.indexOf('// Helper: Calculate price',anchor);
assert.ok(anchor>=0 && end>anchor);
const fn=src.slice(anchor,end);
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
function fixture(){
 const avail=new Map(),prices=new Map(),calls=[];
 const state={selectedDate:'2026-11-11',selectedSlots:[],bookings:[],currentHoldId:null};
 let renders=0;
 const sandbox={
  state,stagingRefreshSequence:0,stagingAvailabilityReady:false,stagingPricingReady:false,
  stagingBusyByDate:new Map(),stagingRatesByDate:new Map(),
  stagingSelectedDateKey:()=>state.selectedDate,
  STAGING_BOOKING_API:{
   availability:d=>{const task=deferred();avail.set(d,task);calls.push('availability:'+d);return task.promise},
   pricing:d=>{const task=deferred();prices.set(d,task);calls.push('pricing:'+d);return task.promise}
  },
  document:{getElementById:()=>({classList:{contains:()=>false}})},
  renderTimeSlotsUI:()=>renders++,showSummaryPanel:()=>renders++,renderAvailabilityGrid:()=>renders++,
  Error,Number,Set,Map
 };
 vm.createContext(sandbox);
 vm.runInContext(fn,sandbox);
 return{state,sandbox,avail,prices,calls,getRenders:()=>renders,refresh:()=>sandbox.stagingRefreshSelectedDate()};
}
function complete(f,day,{fee=250,slots=[]}={}){
 f.avail.get(day).resolve({success:true,busySlots:slots});
 f.prices.get(day).resolve({success:true,prices:[{slot:'12:00 - 13:00',fee}]});
}
test('date change prevents old response from falsely opening another day',async()=>{
 const f=fixture();
 const first=f.refresh();
 f.state.selectedDate='2026-11-12';
 const second=f.refresh();
 complete(f,'2026-11-12',{fee:350,slots:['12:00 - 13:00']});
 assert.equal(await second,true);
 complete(f,'2026-11-11',{fee:99,slots:[]});
 assert.equal(await first,false);
 assert.equal(f.sandbox.stagingAvailabilityReady,true);
 assert.deepEqual([...f.sandbox.stagingBusyByDate.keys()],['2026-11-12']);
 assert.equal(f.sandbox.stagingRatesByDate.get('2026-11-12').get('12:00 - 13:00'),350);
});
test('invalid or unavailable server prices never mark checkout ready',async()=>{
 const f=fixture(),req=f.refresh();
 complete(f,'2026-11-11',{fee:NaN});
 await assert.rejects(req,/INVALID_STAGING_SERVER_PRICES/);
 assert.equal(f.sandbox.stagingPricingReady,false);
});
test('LIFF adapter calls both availability and pricing before rendering',async()=>{
 const f=fixture(),req=f.refresh();
 assert.deepEqual(f.calls,['availability:2026-11-11','pricing:2026-11-11']);
 complete(f,'2026-11-11',{fee:99});
 assert.equal(await req,true);
 assert.equal(f.sandbox.stagingPricingReady,true);
 assert.ok(f.getRenders()>0);
});
