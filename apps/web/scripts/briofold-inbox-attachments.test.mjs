import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function module(path,require=()=>{}){const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});return exports;}
const drafts=module('../src/lib/client/inbox-drafts.ts'),attachments=module('../src/lib/client/inbox-attachments.ts',()=>drafts);
const a='a0000000-0000-0000-0000-000000000001',b='a0000000-0000-0000-0000-000000000002',c='a0000000-0000-0000-0000-000000000003';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const pending=()=>({mediaId:a,sendKey:b,fingerprint:'a'.repeat(64),name:'Example.png',size:100,uploaded:true,expires:Date.now()+86400000});
test('attachment retry metadata survives reload without file bytes and never crosses scope',()=>{
 const s=storage(),key=attachments.attachmentKey(a,b,c),d=pending();attachments.saveAttachment(s,key,d);
 const restored=attachments.readAttachment(s,key);assert.equal(restored.mediaId,d.mediaId);assert.equal(restored.sendKey,d.sendKey);assert.equal(restored.uploaded,true);
 for(const scope of [[b,b,c],[a,c,c],[a,b,b]])assert.equal(attachments.readAttachment(s,attachments.attachmentKey(...scope)),null);
 assert.equal(s.getItem(drafts.inboxDraftKey(a,b,c)),null);assert.equal(s.getItem(key).includes('data:'),false);
});
test('expired and corrupt attachment metadata cannot allocate an unbounded file',()=>{
 const s=storage(),key=attachments.attachmentKey(a,b,c);attachments.saveAttachment(s,key,{...pending(),expires:0});assert.equal(attachments.readAttachment(s,key),null);
 for(const changes of [{size:5242881},{size:-1},{size:0.5},{mediaId:'../foreign'},{sendKey:[]},{uploaded:'true'},{fingerprint:'invalid'},{name:'x'.repeat(201)}]){s.setItem(key,JSON.stringify({...pending(),...changes}));assert.throws(()=>attachments.readAttachment(s,key));}
 assert.throws(()=>attachments.saveAttachment({setItem(){throw Error('quota');}},key,pending()),/quota/);
});
