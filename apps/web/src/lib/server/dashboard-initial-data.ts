import "server-only";
import type {PlanTerms} from "../payment-plans";
import {cookies} from "next/headers";
import {goOrigin} from "./go-origin";
import type {InitialReads} from "../../components/dashboard-initial-data";
// Request-local only: never cache tenant financial data across users or realms.
export async function dashboardInitialData(workspaceId:string,environment:string,section:string,query:Record<string,string|string[]|undefined>={},features?:PlanTerms["features"]|null):Promise<InitialReads>{
 const root="workspaces/"+workspaceId,qs="?environment="+encodeURIComponent(environment);
 const paths:Record<string,string>={};
 if(["gateways","devices","developers","team","requests"].includes(section))paths.resourceLimits=root+"/billing/limits"+qs;
 if(["customers","invoices","payment-links"].includes(section))paths.documents=root+"/documents/"+section+qs;
 if(["transactions","incoming"].includes(section)){
  const filters=new URLSearchParams({environment});
  for(const key of ["q","status","method","account","from","to"]){const value=query[key];if(typeof value!=="string"||!value)continue;
   if(key==="from"||key==="to"){const date=new Date(value+":00+06:00");filters.set(key,Number.isFinite(date.valueOf())?date.toISOString():"");}
   else filters.set(key,key==="q"?value.trim():value);
  }
  paths.transactions=root+"/operations/"+(section==="transactions"?"payments":"incoming")+"?"+filters;
  paths.accounts=root+"/operations/gateways"+qs;
 }
 if(["devices","gateways"].includes(section))paths.phones=root+"/phones"+qs;
 if(section==="refunds")paths.refunds=root+"/refunds"+qs;
 if(section==="requests"){paths.requests=root+"/payment-intents"+qs;paths.sources=root+(environment==="live"?"/documents/invoices":"/linked-sources")+qs;}
 if(section==="overview")for(const [key,path] of Object.entries({billing:"/billing",settings:"/workspace-tools/settings"+qs,phones:"/phones"+qs,gateways:"/operations/gateways"+qs,links:"/documents/payment-links"+qs,intents:"/payment-intents"+qs,overview:"/operations/overview"+qs,payments:"/operations/payments"+qs,refunds:"/refunds"+qs}))paths[key]=root+path;
 if(["team","settings","help"].includes(section))paths.workspace=root+"/workspace-tools/"+section+qs;
 if(section==="billing")paths.billing=root+"/billing";
 if(section==="reports"){
  const end=new Date(Date.now()+6*3600000).toISOString().slice(0,10),start=new Date(Date.parse(end+"T00:00:00Z")-29*86400000).toISOString().slice(0,10);
  const from=new Date(start+"T00:00:00+06:00").toISOString(),to=new Date(Date.parse(end+"T00:00:00+06:00")+86400000).toISOString();
  paths.report=root+"/reports?"+new URLSearchParams({environment,from,to});paths.integrations=root+"/integrations"+qs;
 }
 if(features?.payment_links!==true)delete paths.links;
 if(section==="requests"&&environment==="live"&&features?.invoices!==true)delete paths.sources;
 const token=(await cookies()).get("ekmivo-session")?.value,origin=goOrigin();
 return Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>{
  try{
   if(!token||!origin)throw Error("SOURCE_UNAVAILABLE");
   const response=await fetch(new URL("/v1/"+path,origin),{headers:{Cookie:"ekmivo-session="+token},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(String(response.status));
   return [key,{data:await response.json(),error:"",at:Date.now()}];
  }catch(error){return [key,{data:null,error:error instanceof Error?error.message:"SOURCE_UNAVAILABLE",at:Date.now()}]}
 })));
}
