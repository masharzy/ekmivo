import {goOrigin} from "../../../lib/server/go-origin";
import {serviceStatusFromGo,fallbackServiceStatus} from "../../../lib/service-status";
export const dynamic="force-dynamic";

// Per-service status comes from the Go API when BRIOFOLD_SERVICE_STATUS_ENABLED is on.
// Without it (404 or unreachable), payments keep the previous /readyz check and every
// other service honestly reports "unknown".
export async function GET(){
 const headers={"Cache-Control":"no-store"};
 const observedAt=new Date().toISOString();
 let origin:URL|null=null;
 try{origin=goOrigin()}catch{origin=null}
 if(!origin)return Response.json(fallbackServiceStatus("unknown",observedAt),{headers});
 try{
  const response=await fetch(new URL("/v1/status/services",origin),{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(4000)});
  if(response.ok){
   const parsed=serviceStatusFromGo(await response.json(),observedAt);
   if(parsed)return Response.json(parsed,{headers});
  }
 }catch{/* fall back to the readiness probe below */}
 try{
  const ready=await fetch(new URL("/readyz",origin),{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(4000)});
  return Response.json(fallbackServiceStatus(ready.ok?"operational":"unavailable",observedAt),{headers});
 }catch{
  return Response.json(fallbackServiceStatus("unknown",observedAt),{headers});
 }
}
