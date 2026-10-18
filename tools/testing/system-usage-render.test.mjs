import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import ts from '../../apps/web/node_modules/typescript/lib/typescript.js';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,overrides={}){const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};Function('require','module','exports',code)(id=>overrides[id]??require(id),m,m.exports);return m.exports;}
const plans=load('../../apps/web/src/lib/payment-plans.ts');
const {AdminWorkspaceUsage}=load('../../apps/web/src/components/admin-workspace-usage.tsx',{'next/headers':{cookies:async()=>({get:()=>({value:'test-session'})})},'../lib/server/db':{database:()=>async()=>[]},'../lib/server/go-origin':{goOrigin:()=> 'https://example.test'},'../lib/payment-plans':plans});
test('system workspace admin usage renders null quotas in both languages without a server crash',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({effective:{active:true,platform_billing:true,period_start:'2026-09-30T18:00:00Z',period_end:'2026-10-31T18:00:00Z',terms:{name:'System workspace',name_bn:'সিস্টেম ওয়ার্কস্পেস',payment_limit:null,active_checkout_limit:null,create_per_minute:null,limits:{payment_methods:null,devices:null,api_keys:null,team_members:null}}},usage:{used:3,reserved:0},resources:{payment_methods:2,devices:1,api_keys:0,team_members:1,active_checkouts:0}})});
 try{for(const locale of ['en','bn']){const html=renderToStaticMarkup(await AdminWorkspaceUsage({locale,workspaceId:'tenant',payments:true,ai:false}));assert.ok(html.includes(locale==='bn'?'সীমাহীন':'Unlimited'));assert.ok(!html.includes('NaN'));assert.ok(html.includes(locale==='bn'?'মেয়াদহীন':'No expiry'));assert.ok(!html.includes('2026')); }}finally{globalThis.fetch=previous;}
});
