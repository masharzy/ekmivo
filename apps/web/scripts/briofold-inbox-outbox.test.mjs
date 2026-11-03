import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const exports={};const draft={inboxDraftKey:(a,b,c)=>`briofold:inbox-draft:v1:${a}:${b}:${c}`};runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/client/inbox-outbox.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>draft});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
test("outbox preserves each payload and converts uncertain sends to safe retry on reload",()=>{const s=storage(),key=exports.outboxKey("actor","workspace","thread"),id="a0000000-0000-0000-0000-000000000001",entry={key:id,body:"hello",replyTo:"",createdAt:new Date().toISOString(),state:"sending"};exports.writeOutbox(s,key,[entry]);const restored=exports.readOutbox(s,key);assert.equal(restored[0].key,id);assert.equal(restored[0].body,"hello");assert.equal(restored[0].state,"failed");assert.equal(exports.readOutbox(s,exports.outboxKey("other","workspace","thread")).length,0);exports.writeOutbox(s,key,[]);assert.equal(s.getItem(key),null)});
test("outbox rejects malformed request references",()=>{const s=storage();s.setItem("key",JSON.stringify([{key:"invalid",body:"hello",replyTo:"",createdAt:new Date().toISOString(),state:"sending"}]));assert.throws(()=>exports.readOutbox(s,"key"));});
