import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../src/lib/client/inbox-attachment-types.ts',import.meta.url),'utf8');
const exports={};
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const {inboxAttachmentAccept,inboxAttachmentSupported}=exports;

test('attachment types respect per-channel permissions and the 5 MB limit',()=>{
 const all={image:true,audio:true,document:true};
 const instagram={image:true,audio:true,document:false};
 const telegram={image:false,audio:false,document:false};
 for(const mime of ['image/png','image/jpeg','audio/ogg','audio/mpeg','audio/mp4','audio/aac','application/pdf','text/plain']){
  assert.equal(inboxAttachmentSupported({type:mime,size:5*1024*1024},all),true,mime);
 }
 assert.equal(inboxAttachmentSupported({type:'application/pdf',size:2048},instagram),false);
 assert.equal(inboxAttachmentSupported({type:'audio/ogg',size:2048},instagram),true);
 assert.equal(inboxAttachmentSupported({type:'image/png',size:2048},telegram),false);
 assert.equal(inboxAttachmentSupported({type:'audio/webm',size:2048},all),false);
 assert.equal(inboxAttachmentSupported({type:'image/svg+xml',size:2048},all),false);
 assert.equal(inboxAttachmentSupported({type:'image/png',size:0},all),false);
 assert.equal(inboxAttachmentSupported({type:'image/png',size:5*1024*1024+1},all),false);
 assert.equal(inboxAttachmentAccept(telegram),'');
 assert.equal(inboxAttachmentAccept(instagram).includes('application/pdf'),false);
 assert.equal(inboxAttachmentAccept(all).includes('application/pdf'),true);
});
