'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const build=fs.readFileSync(path.join(root,'staging/scripts/build-static-preview.py'),'utf8');
const html=fs.readFileSync(path.join(root,'staging/admin/payments.html'),'utf8');
const edge=fs.readFileSync(path.join(root,'staging/functions/staging-admin-payments/index.ts'),'utf8');

test('static preview includes admin portal without changing production UI',()=>{
 assert.match(build,/admin_target = target \/ "admin"/);
 assert.match(build,/payments\.html/);
 assert.match(build,/admin", "app\.js"/);
});
test('admin page uses separate staging Supabase and requires login',()=>{
 assert.match(html,/kssxxizhpoxxlbsehymk/);
 assert.doesNotMatch(html,/eqwmodrhorcbwsshbepg/);
 assert.match(html,/signInWithPassword/);
 assert.match(html,/functions\.invoke\("staging-admin-payments"/);
});
test('admin API CORS is restricted to Staging Netlify and admin JWT claim',()=>{
 assert.match(edge,/https:\/\/illustrious-alfajores-364eb8\.netlify\.app/);
 assert.doesNotMatch(edge,/https:\/\/grandslam017\.github\.io/);
 assert.match(edge,/app_metadata\?\.role!=="admin"/);
 assert.match(edge,/staging_check_rate_limit/);
});
