#!/usr/bin/env node
// Independent, fail-closed FULL parity/cutover gate. It is intentionally not
// part of regular feature-branch CI while earlier phases remain unintegrated.
// Run after each canonical tracker row has been reconciled to real evidence.
import {readFile} from 'node:fs/promises';

function parseCSV(source){
 const rows=[];let cells=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){
  const char=source[i];
  if(char==='"'){
   if(quoted&&source[i+1]==='"'){cell+='"';i++;}
   else quoted=!quoted;
  }else if(char===','&&!quoted){cells.push(cell);cell='';}
  else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&source[i+1]==='\n')i++;cells.push(cell);if(cells.some(Boolean))rows.push(cells);cells=[];cell='';}
  else cell+=char;
 }
 if(quoted)throw Error('Unclosed feature tracker CSV field');
 if(cell||cells.length){cells.push(cell);rows.push(cells);}
 const [header,...data]=rows;
 if(!header||!header.includes('verified_implementation_status'))throw Error('Tracker missing status column');
 return data.map((line,index)=>{
  if(line.length!==header.length)throw Error(`Malformed tracker row ${index+2}`);
  return Object.fromEntries(header.map((field,i)=>[field,line[i]]));
 });
}

const url=new URL('../../../docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv',import.meta.url);
const rows=parseCSV(await readFile(url,'utf8'));
const verified=new Set(['IMPLEMENTED_AND_TESTED','EXTERNAL_PROVIDER_BLOCKED_WITH_HONEST_UI']);
const missing=rows.filter(row=>!verified.has(row.verified_implementation_status)
 || !row.evidence_or_test?.trim()
 || /pending|not.yet.verified/i.test(row.evidence_or_test));
if(missing.length){
 console.error(`BRIOFOLD PHASE 10 RELEASE GATE: BLOCKED (${missing.length}/${rows.length} feature-tracker entries remain unverified).`);
 for(const row of missing.slice(0,12))console.error(`- ${row.new_destination}: ${row.verified_implementation_status}`);
 if(missing.length>12)console.error(`...and ${missing.length-12} more. Inspect the entire traceability tracker.`);
 console.error('Do not deploy or claim full parity. Provider-only blocks require evidence and an honest disabled UI; missing code is NOT a provider block.');
 process.exitCode=2;
}else console.log(`BRIOFOLD PHASE 10 PARITY TRACKER: ${rows.length}/${rows.length} evidence-linked entries recorded. Integrating CI, production readiness and owner acceptance are separate gates.`);
