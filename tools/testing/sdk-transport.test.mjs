import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const ts=require('typescript');
const source=await readFile(new URL('../../sdk/typescript/index.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {EkmivoClient,ApiError,operations}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const client=()=>new EkmivoClient('https://api.example.test','fixture-not-a-real-key','sandbox');
async function mocked(fn,run){const original=globalThis.fetch;globalThis.fetch=fn;try{await run()}finally{globalThis.fetch=original}}
test('SDK refuses credential URLs and non-root origins',()=>{for(const origin of ['http://api.example.test','https://u:p@api.example.test','https://api.example.test/prefix','https://api.example.test/?secret=x'])assert.throws(()=>new EkmivoClient(origin,'fixture','sandbox'))});
test('environment cannot be switched by query or missing path',async()=>{await assert.rejects(client().request('listcustomers',{path:{workspaceID:'fixture'},query:{environment:'live'}}),/Environment/);await assert.rejects(client().request('listcustomers'),/Missing path/)});
test('raw uploads preserve bytes and encode Bengali filenames without public credentials',async()=>{const operation=Object.keys(operations).find(k=>operations[k].public&&operations[k].path.endsWith('/files'));assert.ok(operation);await mocked(async(url,options)=>{assert.equal(new URL(url).searchParams.get('environment'),'sandbox');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['X-Filename-Encoding'],'uri-component');assert.equal(decodeURIComponent(options.headers['X-Filename']),'বিল.pdf');assert.equal(options.redirect,'error');assert.deepEqual([...options.body],[1,2,3]);return Response.json({file_id:'fixture'})},async()=>{await client().request(operation,{path:{token:'fixture'},rawBody:new Uint8Array([1,2,3]),filename:'বিল.pdf'})})});
test('errors retain safe code and correlation without raw provider body',async()=>{await mocked(async()=>Response.json({error:{code:'DENIED',correlation_id:'safe-id'},internal:'fixture-private-data'},{status:403}),async()=>{await assert.rejects(client().request('listcustomers',{path:{workspaceID:'fixture'}}),e=>e instanceof ApiError&&e.status===403&&e.code==='DENIED'&&e.correlationId==='safe-id'&&!e.message.includes('private'))})});
test('oversized response is cancelled while streaming',async()=>{let cancelled=false;await mocked(async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1048576))},cancel(){cancelled=true}})),async()=>{await assert.rejects(client().request('listcustomers',{path:{workspaceID:'fixture'}}),e=>e.code==='RESPONSE_TOO_LARGE');assert.equal(cancelled,true)})});
test('non-JSON reply is a safe unconfirmed error',async()=>{await mocked(async()=>new Response('fixture upstream HTML'),async()=>{await assert.rejects(client().request('listcustomers',{path:{workspaceID:'fixture'}}),e=>e.code==='NON_JSON_RESPONSE')})});

test('key-scoped merchant routes need no workspace or environment argument',async()=>{
 const keyOnly=new EkmivoClient('https://api.example.test','fixture-no-money-key');
 await mocked(async(url,options)=>{
  const target=new URL(url);
  assert.equal(target.pathname,'/v1/payment-intents');
  assert.equal(target.searchParams.has('environment'),false);
  assert.equal(options.headers.Authorization,'Bearer fixture-no-money-key');
  return Response.json({data:[],environment:'sandbox'});
 },async()=>{
  const result=await keyOnly.request('listKeyScopedPaymentIntents');
  assert.deepEqual(result.data,[]);
  await assert.rejects(keyOnly.request('listKeyScopedPaymentIntents',{query:{environment:'live'}}),/Environment/);
 });
});
