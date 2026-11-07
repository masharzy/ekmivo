import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

test('fictional observation stays incomplete and tampered evidence is refused',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'briofold-cohort-'));
 try{
  const evidence=path.join(root,'evidence.txt'),record=path.join(root,'day.json');
  await writeFile(evidence,'fictional unit fixture\n');
  const sha=createHash('sha256').update('fictional unit fixture\n').digest('hex');
  const observed=new Date();
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(observed).map(p=>[p.type,p.value]));
  await writeFile(record,JSON.stringify({schema_version:1,kind:'cohort',simulated:false,operator:'fictional-unit-test',observed_at:observed.toISOString(),date:`${parts.year}-${parts.month}-${parts.day}`,real_transaction_count:1,exceptions:0,evidence_file:'evidence.txt',evidence_sha256:sha}));
  const tool=new URL('./compile-cohort.mjs',import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,s=>s.slice(1));
  execFileSync(process.execPath,[tool,path.join(root,'result.json'),root,'day.json'],{stdio:'pipe'});
  const result=JSON.parse(await readFile(path.join(root,'result.json'),'utf8'));
  assert.equal(result.review_ready,false);
  assert.ok(result.issues.some(x=>x.includes('seven')));
  await writeFile(evidence,'changed fixture\n');
  assert.throws(()=>execFileSync(process.execPath,[tool,path.join(root,'second.json'),root,'day.json'],{stdio:'pipe'}));
 }finally{await rm(root,{recursive:true,force:true})}
});
