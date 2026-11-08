import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function module(path,require=()=>{}){const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});return exports;}
const base=module('../src/lib/client/inbox-drafts.ts'),attachment=module('../src/lib/client/inbox-attachments.ts',()=>base),media=module('../src/lib/client/inbox-media-drafts.ts',name=>name.includes('attachments')?attachment:base);
const ids=['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003'];
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const pending=()=>({mediaId:ids[0],sendKey:ids[1],fingerprint:'a'.repeat(64),name:'Example.png',size:100,uploaded:true,expires:Date.now()+86400000,mime:'image/png',batchId:ids[2],replyTo:ids[0]});
test('complete uploaded batch restores stable send, album and reply intents without bytes',()=>{
 const s=storage(),key=media.mediaDraftKey(...ids),items=[pending(),{...pending(),mediaId:ids[2],sendKey:ids[0]}];media.saveMediaDrafts(s,key,items);
 const restored=media.readMediaDrafts(s,key);assert.equal(restored.length,2);for(let i=0;i<2;i++)for(const field of ['mediaId','sendKey','batchId','replyTo'])assert.equal(restored[i][field],items[i][field]);
 assert.equal(s.getItem(key).includes('data:'),false);assert.equal(s.getItem(key).includes('blob'),false);
 for(const scope of [[ids[1],ids[1],ids[2]],[ids[0],ids[2],ids[2]],[ids[0],ids[1],ids[0]]])assert.equal(media.readMediaDrafts(s,media.mediaDraftKey(...scope)).length,0);
 media.saveMediaDrafts(s,key,[]);assert.equal(s.getItem(key),null);
});
test('expired references are omitted; malformed or unsupported intents fail closed',()=>{
 const s=storage(),key=media.mediaDraftKey(...ids);s.setItem(key,JSON.stringify([{...pending(),expires:0}]));assert.equal(media.readMediaDrafts(s,key).length,0);
 for(const change of [{mime:'text/html'},{batchId:'foreign'},{replyTo:'../thread'},{durationMs:-1},{uploaded:false},{size:5242881},{mediaId:'bad'},{sendKey:'bad'},{fingerprint:'bad'}]){s.setItem(key,JSON.stringify([{...pending(),...change}]));assert.throws(()=>media.readMediaDrafts(s,key));}
 s.setItem(key,JSON.stringify(Array.from({length:11},pending)));assert.throws(()=>media.readMediaDrafts(s,key));
 assert.throws(()=>media.saveMediaDrafts({setItem(){throw Error('quota');}},key,[pending()]),/quota/);
});
