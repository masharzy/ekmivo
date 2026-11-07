// Read-only observation of actual persisted worker heartbeats and queue runs.
// Connection values remain in temporary operator files, never in the report.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(path.resolve('apps/web/package.json')),postgres=require('postgres');
const pools={};for(const realm of ['sandbox','live']){const u=new URL(fs.readFileSync(path.join(os.tmpdir(),`briofold-plans-production-${realm}-url.txt`),'utf8'));if(u.hostname!==process.env.PLAN_ROLLOUT_PRODUCTION_HOST)throw Error('Explicit production host required');pools[realm]=postgres(u.href,{ssl:'require',prepare:false,max:1,onnotice:()=>{}})}
const report={started:new Date().toISOString(),samples:[]};
try{
 for(let i=0;i<5;i++){
  const sample={at:new Date().toISOString(),realms:{}};
  for(const realm of ['sandbox','live']){
   const sql=pools[realm];const [health]=await sql`SELECT pg15_health() AS health`;
   const beats=await sql`SELECT kind,seen_at,healthy FROM pg15_worker_health ORDER BY kind`;
   const runs=await sql`SELECT kind,count(*)::int AS completed,max(finalized_at) AS latest FROM river_job WHERE state='completed' AND kind IN ('receipt_pipeline','private_document_export','payment_retention_billing') GROUP BY kind ORDER BY kind`;
   sample.realms[realm]={...health,beats,runs};assert(health.health.critical_ready&&health.health.export_ready&&health.health.maintenance_ready,realm+' stale/unhealthy worker');
  }
  const response=await fetch('https://api.briofold.tech/readyz');sample.httpStatus=response.status;sample.readiness=await response.json();assert.equal(response.status,200);
  report.samples.push(sample);console.log('PASS sample',i+1,sample.at,'both realms and HTTP readiness');
  if(i<4)await new Promise(resolve=>setTimeout(resolve,35000));
 }
 for(const realm of ['sandbox','live'])for(const kind of ['receipt_pipeline','private_document_export','payment_retention_billing']){
  const first=report.samples[0].realms[realm].runs.find(r=>r.kind===kind),last=report.samples.at(-1).realms[realm].runs.find(r=>r.kind===kind);assert(last&&first&&last.completed>first.completed,realm+' '+kind+' did not recur');
 }
 report.passed=true;fs.writeFileSync('docs/evidence/API-HOSTED-WORKERS-20261016/sustained-worker-health.json',JSON.stringify(report,null,2)+'\n');
}finally{await Promise.all(Object.values(pools).map(p=>p.end()))}
