import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/client/inbox-drafts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const a='a0000000-0000-0000-0000-000000000001',b='a0000000-0000-0000-0000-000000000002',c='a0000000-0000-0000-0000-000000000003';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('saved reply drafts cannot cross accounts, businesses or conversations',()=>{
 const s=storage(),key=exports.inboxDraftKey(a,b,c);exports.writeInboxDraft(s,key,'Unsent reply');
 assert.equal(exports.readInboxDraft(s,key).text,'Unsent reply');
 for(const scope of [[b,b,c],[a,c,c],[a,b,b]])assert.equal(exports.readInboxDraft(s,exports.inboxDraftKey(...scope)).text,'');
 exports.writeInboxDraft(s,key,'');assert.equal(exports.readInboxDraft(s,key).text,'');
});
test('expired or corrupt draft storage never becomes message content',()=>{
 const s=storage(),key=exports.inboxDraftKey(a,b,c);
 s.setItem(key,JSON.stringify({text:'Old reply',expires:0}));assert.equal(exports.readInboxDraft(s,key).text,'');assert.equal(s.getItem(key),null);
 for(const raw of ['{','null','42','{"text":[],"expires":9999999999999}']){s.setItem(key,raw);assert.throws(()=>exports.readInboxDraft(s,key));}
 assert.throws(()=>exports.inboxDraftKey('../account',b,c));assert.throws(()=>exports.writeInboxDraft(s,key,'x'.repeat(8001)));
});
test('quota errors propagate so navigation cannot falsely claim a saved draft',()=>{
 const s={setItem(){throw Error('Quota exceeded');},removeItem(){throw Error('Storage unavailable');}};
 assert.throws(()=>exports.writeInboxDraft(s,'key','Reply'),/Quota/);assert.throws(()=>exports.writeInboxDraft(s,'key',''),/unavailable/);
});

test('retry keys survive navigation with saved content',()=>{const s=storage(),key=exports.inboxDraftKey(a,b,c);exports.writeInboxDraft(s,key,'Reply',a);assert.equal(exports.readInboxDraft(s,key).sendKey,a);});
