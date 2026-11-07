// Read-only route smoke against the built local server and isolated Neon branch.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(path.resolve('apps/web/package.json')),postgres=require('postgres');
const url=new URL(fs.readFileSync(path.join(os.tmpdir(),'briofold-plans-neon-url.txt'),'utf8'));
if(url.hostname!==process.env.PLAN_TEST_BRANCH_HOST)throw Error('Explicit isolated host required');
const sql=postgres(url.href,{ssl:'require',prepare:false,max:1});
const f=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'briofold-plans-ui-fixture.json'),'utf8'));
try{
 const [space]=await sql`SELECT workspace_id FROM pg13_subscriptions ORDER BY paid_until DESC LIMIT 1`;
 const routes=['/admin','/admin/plans','/admin/workspaces','/admin/users','/admin/billing','/admin/billing/invoices','/admin/billing/revenue','/admin/support','/admin/privacy','/admin/staff'];
 if(space)routes.push(`/admin/workspaces/${space.workspace_id}/billing`,`/admin/workspaces/${space.workspace_id}/products-plan`);
 for(const route of routes){const r=await fetch('http://localhost:3046'+route,{headers:{Cookie:`briofold-session=${f.token}; briofold-locale=en`}});const html=await r.text();assert.equal(r.status,200,route);assert(!html.includes('Something went wrong.'),route);assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),route);console.log('PASS',route)}
}finally{await sql.end()}
