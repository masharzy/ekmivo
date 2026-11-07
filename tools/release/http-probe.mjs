// Read-only readiness/latency measurement. Never invents financial success.
import {writeFile} from "node:fs/promises";
const base=process.env.BRIOFOLD_PROBE_API_URL,out=process.argv[2];
if(!base||!out){console.error("BRIOFOLD_PROBE_API_URL and output path required");process.exit(2)}
const origin=new URL(base);if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash){console.error("Configured HTTPS API origin required");process.exit(2)}
const samples=[];for(let n=0;n<10;n++){for(const endpoint of ["/healthz","/readyz"]){const start=performance.now();try{const response=await fetch(new URL(endpoint,origin),{redirect:"error",signal:AbortSignal.timeout(10000)});samples.push({endpoint,status:response.status,duration_ms:Math.round(performance.now()-start)})}catch{samples.push({endpoint,status:null,duration_ms:Math.round(performance.now()-start),outcome:"unavailable"})}}}
const report={observed_at:new Date().toISOString(),mode:"read-only-readiness",financial_verification:false,samples};await writeFile(out,JSON.stringify(report,null,2),{flag:"wx"});if(samples.some(x=>x.status!==200))process.exitCode=1;
