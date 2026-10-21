import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const exports={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/ai-studio.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const config={instructions:'Respect supplied product facts.',mode:'off',language:'auto',tone:'neutral',model:''};
test('configuration rejects coercion, unexpected keys, oversized instructions and malformed models',()=>{
 assert.equal(exports.validAiStudioConfig(config),true);
 for(const patch of [{mode:['off']},{language:['bn']},{tone:['formal']},{instructions:'\0'},{instructions:'x'.repeat(16001)},{model:'bad model'},{model:'x'.repeat(201)},{extra:true},{mode:null}])assert.equal(exports.validAiStudioConfig({...config,...patch}),false,JSON.stringify(patch).slice(0,80));
 for(const value of [null,[],{},'off',42])assert.equal(exports.validAiStudioConfig(value),false);
});
test('database failures expose stable recovery codes without internal SQL details',()=>{
 for(const [code,want] of [['42501','forbidden'],['40001','conflict'],['23505','conflict'],['54000','rate-limit'],['22023','invalid'],['22P02','invalid'],['23514','invalid'],['08006','unavailable']])assert.equal(exports.studioErrorCode({code,message:'private database detail'}),want);
 assert.equal(exports.studioErrorCode(null),'unavailable');
});
