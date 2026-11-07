import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const ts=require('typescript');
const source=readFileSync(new URL('../../apps/web/src/lib/server/dashboard-initial-data.ts',import.meta.url),'utf8');
function harness({token='session-test',origin='https://api.example',fetcher=async()=>({ok:true,json:async()=>({items:[]})})}={}){
 const calls=[],exports={};
 const context={exports,require(name){if(name==='server-only')return {};if(name==='next/headers')return {cookies:async()=>({get:()=>token?{value:token}:undefined})};if(name==='./go-origin')return {goOrigin:()=>origin?new URL(origin):null};throw Error(name)},URL,URLSearchParams,Date,AbortSignal,fetch:async(url,options)=>{calls.push({url:new URL(url),options});return fetcher(url,options)}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {load:exports.dashboardInitialData,calls};
}
test('navigation data waits for all required sources, including empty results',async()=>{
 let finish;const barrier=new Promise(resolve=>finish=resolve);
 const h=harness({fetcher:async()=>{await barrier;return {ok:true,json:async()=>({items:[]})}}});
 let done=false;const next=h.load('workspace-a','live','transactions').then(value=>{done=true;return value});
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(done,false);assert.equal(h.calls.length,2);
 finish();const data=await next;assert.equal(data.transactions.data.items.length,0);assert.equal(data.accounts.error,'');
});
test('cookie authorization is server-only and requests never share cache',async()=>{
 const h=harness();await h.load('one','live','customers');await h.load('two','sandbox','customers');
 assert.equal(h.calls.length,2);assert.match(h.calls[0].url.pathname,/one\/documents\/customers$/);assert.equal(h.calls[1].url.searchParams.get('environment'),'sandbox');
 for(const {options} of h.calls){assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.headers.Cookie,'briofold-session=session-test');}
});
test('missing session never reaches financial API',async()=>{const h=harness({token:''});const d=await h.load('one','live','customers');assert.equal(h.calls.length,0);assert.equal(d.documents.data,null);assert.ok(d.documents.error)});
test('API permission and unavailable failures remain errors, never zero records',async()=>{
 for(const status of [401,403,503]){const h=harness({fetcher:async()=>({ok:false,status})});const d=await h.load('one','live','customers');assert.equal(d.documents.error,String(status));assert.equal(d.documents.data,null)}
});
test('overview waits for each independent operational source',async()=>{const h=harness();const d=await h.load('one','live','overview');assert.equal(h.calls.length,9);assert.equal(Object.keys(d).length,9)});
test('Live requests use real invoice sources while sandbox uses linked fixtures',async()=>{
 const h=harness();await h.load('one','live','requests');await h.load('one','sandbox','requests');assert.match(h.calls[1].url.pathname,/documents\/invoices$/);assert.match(h.calls[3].url.pathname,/linked-sources$/);
});
test('unconnected modules do not invent or fetch a data source',async()=>{const h=harness();const d=await h.load('one','live','apps');assert.equal(Object.keys(d).length,0);assert.equal(h.calls.length,0)});

test('transaction deep links preload the same scoped search and Dhaka time filters',async()=>{
 const h=harness();await h.load('one','live','transactions',{q:' invoice 1 ',method:'bkash',from:'2026-10-16T10:30',to:'2026-10-16T11:30'});
 const p=h.calls[0].url.searchParams;assert.equal(p.get('q'),'invoice 1');assert.equal(p.get('method'),'bkash');assert.equal(p.get('from'),'2026-10-16T04:30:00.000Z');assert.equal(p.get('to'),'2026-10-16T05:30:00.000Z');
});

test('customer first render contains authorized full number without skeleton or client fetch',()=>{
 const code=readFileSync(new URL('../../apps/web/src/components/payment-documents.tsx',import.meta.url),'utf8');
 const exports={},row={id:'64abcdef-1234-0abc-cdef-123456789abc',reference:'test',status:'active',version:1,body:{source:'checkout_payer',name:'+8801712345678',phone:'+8801712345678',payment_count:1},amount_minor:0,paid_minor:0,payments:[],history:[]};
 const jsx=(type,props)=>({type,props});
 const context={exports,URL,URLSearchParams,Date,AbortController,fetch(){throw Error('Unexpected render-time fetch')},require(name){
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='react')return {useState:value=>[typeof value==='function'?value():value,()=>{}],useEffect(){},useCallback:fn=>fn,useRef:current=>({current})};
  if(name==='./dashboard-initial-data')return {useDashboardInitialData:()=>({data:{items:[row],next_cursor:null},error:'',at:1234})};
  if(name==='./payment-loading-skeleton')return {PaymentLoadingSkeleton:'FORBIDDEN_SKELETON'};
  if(name==='./payment-link-cards')return {PaymentLinkCards:'cards',LinkIcon:'icon'};
  if(name==='./dashboard-confirm-dialog')return {DashboardConfirmDialog:'confirm'};
  if(name==='next/link')return {default:'a'};
  if(name==='../lib/client/draft-navigation')return {registerDraft(){}};
  throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const tree=exports.PaymentDocuments({kind:'customers',workspaceId:'one',environment:'live',locale:'en',userId:'user',canWrite:true,canManage:true});
 const serialized=JSON.stringify(tree);assert.ok(serialized.includes('+8801712345678'));assert.ok(!serialized.includes('FORBIDDEN_SKELETON'));
});
