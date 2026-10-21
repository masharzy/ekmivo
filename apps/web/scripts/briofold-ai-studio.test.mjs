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
const actionSource=ts.transpileModule(readFileSync(new URL('../src/actions/ai-studio.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const workspace='a0000000-0000-0000-0000-000000000001',actor='a0000000-0000-0000-0000-000000000002',op='a0000000-0000-0000-0000-000000000003';
function actions(options={}){
 const calls=[],paths=[];let committed=0,authenticated=0;
 const data={revision:7,config,published_id:null,sources:[],versions:[],models:[],source_offset:0,version_offset:0,more_sources:false,more_versions:false};
 const db=()=>{throw Error('unexpected nontransactional query');};db.json=x=>x;
 db.begin=async callback=>{
  const tx=async(parts,...values)=>{
   const query=parts.join('?');calls.push({query,values});
   if(query.includes('studio_write')){if(options.error)throw {code:options.error};return [{data:{revision:7}}];}
   if(query.includes('studio_read')){if(options.readFailure)throw {code:'08006'};return [{data}];}
   throw Error('Unexpected SQL');
  };
  const result=await callback(tx);committed++;return result;
 };
 const api={},modules={
  'next/cache':{revalidatePath:path=>paths.push(path)},
  '../lib/server/auth':{requireUser:async()=>{authenticated++;return {id:actor};},preferredWorkspaceFor:async()=>({id:options.selected??workspace})},
  '../lib/server/db':{database:()=>db},'../lib/server/ai-studio':{readAiStudio:async()=>({status:'ready',data})},'../lib/ai-studio':exports
 };
 runInNewContext(actionSource,{exports:api,Buffer,require:name=>{assert.ok(name in modules,'Unexpected module '+name);return modules[name];}});
 return {api,calls,paths,committed:()=>committed,authenticated:()=>authenticated};
}
test('every Studio action authenticates and rejects stale business before data access',async()=>{
 const f=actions({selected:'another-business'});
 assert.equal((await f.api.loadAiStudio(workspace)).code,'stale-business');
 assert.equal((await f.api.saveAiStudio(workspace,op,'draft',{revision:0,config})).code,'stale-business');
 assert.equal((await f.api.readAiKnowledge(workspace,op)).error,'stale-business');
 assert.equal((await f.api.searchAiKnowledge(workspace,'Orchid',false)).error,'stale-business');
 assert.equal(f.authenticated(),4);assert.equal(f.calls.length,0);
});
test('saved state and canonical invalidation come from transaction response',async()=>{
 const f=actions(),result=await f.api.saveAiStudio(workspace,op,'draft',{revision:0,config});
 assert.equal(result.status,'success');assert.equal(result.data.revision,7);assert.equal(f.committed(),1);
 assert.deepEqual(f.paths,['/settings/ai','/settings/knowledge','/inbox/agent-desk']);
 assert.equal(f.calls[0].values[0],workspace);assert.equal(f.calls[0].values[1],actor);assert.equal(f.calls[0].values[2],op);
});
test('failed authoritative read rolls back write without route invalidation',async()=>{
 const f=actions({readFailure:true});assert.equal((await f.api.saveAiStudio(workspace,op,'draft',{revision:0,config})).code,'unavailable');
 assert.equal(f.committed(),0);assert.deepEqual(f.paths,[]);
});
test('invalid or unbounded input never reaches a write transaction',async()=>{
 const f=actions();
 for(const [key,kind,payload] of [['bad','draft',{config}],[op,'unknown',{}],[op,'draft',{config:{...config,mode:['off']}}],[op,'source',{content:'x'.repeat(420001)}],[op,'source',{content:'\0'}]])assert.equal((await f.api.saveAiStudio(workspace,key,kind,payload)).code,'invalid');
 assert.equal(f.calls.length,0);
});

test('publication consent and optimistic revision reject JSON coercion',()=>{
 const publication={revision:2,reason:'Reviewed fixture configuration',confirmed:true};
 assert.equal(exports.validAiStudioPayload('publish',publication),true);
 for(const patch of [{revision:'2'},{revision:2.1},{revision:-1},{revision:Number.MAX_SAFE_INTEGER+1},{confirmed:'true'},{reason:['Reviewed fixture configuration']},{extra:true}])assert.equal(exports.validAiStudioPayload('publish',{...publication,...patch}),false);
 assert.equal(exports.validAiStudioPayload('rollback',{...publication,target:op}),true);
 assert.equal(exports.validAiStudioPayload('rollback',{...publication,target:'foreign path'}),false);
});
test('knowledge mutation validates source version and Unicode body within byte budget',()=>{
 const source={id:op,expected_version:null,title:'বাংলা উৎস',kind:'text',content:'ক'.repeat(100000)};
 assert.equal(exports.validAiStudioPayload('source',source),true);
 assert.equal(exports.validAiStudioPayload('archive',{id:op,expected_version:null}),false);
 assert.equal(exports.validAiStudioPayload('archive',{id:op,expected_version:actor}),true);
 for(const patch of [{content:'ক'.repeat(100001)},{content:'\0'},{title:' '},{expected_version:'bad'},{kind:['text']}])assert.equal(exports.validAiStudioPayload('source',{...source,...patch}),false);
});
