import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function module(path,require=()=>{}){const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});return exports;}
const config=module('../src/lib/ai-studio.ts'),requests=module('../src/lib/client/studio-requests.ts',()=>config);
const a='a0000000-0000-0000-0000-000000000001',b='a0000000-0000-0000-0000-000000000002',c='a0000000-0000-0000-0000-000000000003';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('paid test retry key survives remount and intervening inputs without crossing account or business',()=>{
 const s=storage(),fp='a'.repeat(64),other='b'.repeat(64);let n=0;const generate=()=>[a,b,c][n++];
 const first=requests.studioRequestKey(s,a,b,fp,generate);requests.studioRequestKey(s,a,b,other,generate);
 assert.equal(requests.studioRequestKey(s,a,b,fp,()=>{throw Error('must reuse saved key');}),first);
 assert.notEqual(requests.studioRequestKey(s,c,b,fp,generate),first);
 assert.equal(s.getItem(`briofold:studio-requests:v1:${a}:${c}`),null);
});
test('storage failure prevents starting a paid test and corrupt metadata never becomes a retry key',()=>{
 assert.throws(()=>requests.studioRequestKey({getItem:()=>null,setItem(){throw Error('quota');}},a,b,'a'.repeat(64),()=>a),/quota/);
 for(const raw of ['null','{}','[null]','[{"fingerprint":"invalid"}]'])assert.throws(()=>requests.studioRequestKey({getItem:()=>raw},a,b,'a'.repeat(64),()=>a));
 assert.throws(()=>requests.studioRequestKey(storage(),'foreign',b,'a'.repeat(64),()=>a));
});
