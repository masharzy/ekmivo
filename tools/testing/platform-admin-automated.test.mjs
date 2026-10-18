import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const ts=require('typescript'),React=require('react');
const source=fs.readFileSync(new URL('../../apps/web/src/components/platform-admin-console.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const user={id:'11111111-1111-4111-8111-111111111111',name:'Fixture admin',verified:true};
function fixture(overrides={}){
 const state={user,role:'super_admin',mfa:true,verified:{user,role:'super_admin'},queries:[],sandboxCalls:0,...overrides};
 const passthrough=props=>props.children??null;
 const db=()=>async(strings,...values)=>{
  const sql=strings.join('?');state.queries.push({sql,values});
  if(sql.includes('FROM workspaces w'))return [{id:'22222222-2222-4222-8222-222222222222',name:'Fixture workspace',owner:'fixture@example.test',pay:true,ai:false,created_at:'2026-10-01T00:00:00Z'}];
  return [];
 };
 const modules={
  'react/jsx-runtime':require('react/jsx-runtime'),
  'next/link':{default:props=>React.createElement('a',{href:props.href},props.children)},
  'next/headers':{cookies:async()=>({get:()=>undefined})},
  'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path)},notFound:()=>{throw Error('NOT_FOUND')}},
  '../lib/server/auth':{currentUser:async()=>state.user,requireUser:async()=>state.user},
  '../lib/server/db':{database:db},
  '../lib/server/platform-admin':{platformRole:async()=>state.role,verifiedAdmin:async()=>state.verified,platformSettings:async()=>({emailVerification:false})},
  '../lib/server/mfa':{sessionMfaValid:async()=>state.mfa},
  '../lib/server/email':{mailReady:()=>false},
  '../lib/server/public-sandbox':{publicSandboxConfig:async()=>{state.sandboxCalls++;return {testKey:'ek_test_fixture_never_a_real_key_123456',workspaceId:user.id,enabled:true,apiOrigin:'https://sandbox.example.test'}}},
  './admin-trusted-devices':{AdminTrustedDevices:()=>null},
  '../lib/admin-permissions':(()=>{const m={exports:{}};const c=ts.transpileModule(fs.readFileSync(new URL('../../apps/web/src/lib/admin-permissions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(c,{module:m,exports:m.exports});return m.exports})(),
  './admin-payment-plans-page':{AdminPaymentPlansPage:()=>null},
  './admin-catalog-page':{AdminProvidersPage:()=>null,AdminCreditsPage:()=>null,AdminSubscriptionsPage:()=>null},
  './admin-catalog-management':{AdminWorkspaceCreationForm:()=>null},
  './platform-admin-inventory':{AdminWorkspaceDetail:()=>null,AdminUserDetail:()=>null,AdminGlobalInventory:()=>null,AdminHealthView:()=>null,AdminSupportDetail:()=>null},
  './admin-controls':{VerificationSettings:()=>null,RoleControls:()=>null},
  './platform-admin-shell':{AdminShell:passthrough},
  './platform-admin-widgets':{AdminModal:passthrough,AdminCopy:()=>null},
 };
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,require:name=>{if(!(name in modules))throw Error('Unexpected import '+name);return modules[name]},process:{env:{NODE_ENV:'test'}},URLSearchParams,Intl,Date,console},{filename:'platform-admin-console.cjs'});
 return {state,render:async(segments=[],locale='en',props={})=>expand(await module.exports.PlatformAdminConsole({locale,segments,...props}))};
}
async function expand(node){
 if(node==null||typeof node==='boolean')return '';
 if(Array.isArray(node))return (await Promise.all(node.map(expand))).join(' ');
 if(typeof node!=='object')return String(node);
 if(typeof node.type==='function')return expand(await node.type(node.props));
 return expand(node.props?.children);
}
test('anonymous admin requests redirect before data access',async()=>{const f=fixture({user:null});await assert.rejects(f.render(['workspaces']),/REDIRECT:\/en\/admin\/sign-in/);assert.equal(f.state.queries.length,0)});
test('merchant without platform role cannot enter admin',async()=>{const f=fixture({role:null});await assert.rejects(f.render(),/NOT_FOUND/);assert.equal(f.state.queries.length,0)});
test('MFA must be verified before any module data read',async()=>{const f=fixture({mfa:false});await assert.rejects(f.render(['users']),/REDIRECT:\/en\/admin\/verify/);assert.equal(f.state.queries.length,0)});
test('verified admin identity must match current session',async()=>{const f=fixture({verified:{user:{id:'other'},role:'super_admin'}});await assert.rejects(f.render(['audit']),/NOT_FOUND/);assert.equal(f.state.queries.length,0)});
for(const role of ['analyst'])test(role+' cannot list privileged workspace/customer data',async()=>{const f=fixture({role,verified:{user,role}});assert.match(await f.render(['workspaces']),/access/);assert.equal(f.state.queries.length,0)});
test('super admin can read real list shape and filters stay parameterized',async()=>{const f=fixture();const malicious="%' OR true --";const html=await f.render(['workspaces'],'en',{query:malicious,after:'invalid cursor'});assert.match(html,/Fixture workspace/);assert.equal(f.state.queries.length,1);assert.ok(!f.state.queries[0].sql.includes(malicious));assert.ok(f.state.queries[0].values.includes(malicious));assert.ok(f.state.queries[0].values.includes(null))});
test('non-super-admin cannot retrieve sandbox configuration',async()=>{const f=fixture({role:'support',verified:{user,role:'support'}});await f.render(['api','sandbox']);assert.equal(f.state.sandboxCalls,0)});
test('sandbox full key never appears in admin rendering',async()=>{const f=fixture();const html=await f.render(['api','sandbox']);assert.equal(f.state.sandboxCalls,1);assert.ok(!html.includes('ek_test_fixture_never_a_real_key_123456'));assert.match(html,/••••/)});
test('unsupported operational screens declare unavailable without database reads',async()=>{const f=fixture();assert.match(await f.render(['payments']),/Not connected/);assert.equal(f.state.queries.length,0)});
test('unknown admin routes fail closed',async()=>{const f=fixture();await assert.rejects(f.render(['not-a-module']),/NOT_FOUND/);assert.equal(f.state.queries.length,0)});
test('Bengali denial state is available',async()=>{const f=fixture({role:'analyst',verified:{user,role:'analyst'}});assert.match(await f.render(['users'],'bn'),/অনুমতি/)});

test('role demotion returned by final MFA authorization overrides earlier role lookup',async()=>{const f=fixture({role:'super_admin',verified:{user,role:'support'}});assert.match(await f.render(['plans']),/access/);assert.equal(f.state.queries.length,0)});

for(const role of ['admin','support'])test(role+' can read workspace list',async()=>{const f=fixture({role,verified:{user,role}});assert.match(await f.render(['workspaces']),/Fixture workspace/);assert.equal(f.state.queries.length,1)});
