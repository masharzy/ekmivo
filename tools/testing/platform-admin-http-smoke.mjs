import assert from 'node:assert/strict';
const origin=new URL(process.env.ADMIN_TEST_ORIGIN||'http://127.0.0.1:3038');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(origin.hostname),'Local built-server checks only');
let passed=0;
for(const locale of ['en','bn']){
 const login=await fetch(new URL(`/admin/sign-in`,origin),{redirect:'manual',headers:{cookie:`briofold-locale=${locale}`}});
 assert.equal(login.status,200);const html=await login.text();
 assert.ok(html.includes('name="password"'));assert.ok(html.includes('name="admin"'));assert.ok(!html.includes('ek-public-header'));passed++;
 for(const path of ['admin','admin/workspaces','admin/users','admin/audit','admin/api/sandbox','admin/mfa','admin/security']){
  const r=await fetch(new URL(`/${path}`,origin),{redirect:'manual',headers:{cookie:`briofold-locale=${locale}`}});
  assert.ok([303,307,308].includes(r.status),`${locale}/${path}: ${r.status}`);
  const target=new URL(r.headers.get('location'),origin);
  assert.ok(/\/(?:admin\/(?:sign-in|verify)|login)$/.test(target.pathname),`${path}: ${target.pathname}`);
  passed++;
 }
}
console.log(`Admin built-server HTTP PASS: ${passed} unauthenticated route/login checks; no browser or production mutations`);
