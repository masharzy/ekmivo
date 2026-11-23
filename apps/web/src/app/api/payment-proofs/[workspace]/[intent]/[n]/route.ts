import {cookies} from "next/headers";
import {goOrigin} from "../../../../../../lib/server/go-origin";

// Receipt photo for the dashboard (owner 2026-11-23). Binary, so it cannot go
// through the JSON proxy. The Go API checks the session and payments:read.
export const dynamic="force-dynamic";
const id=/^[0-9a-f-]{36}$/i;
export async function GET(request:Request,context:{params:Promise<{workspace:string;intent:string;n:string}>}){
 const {workspace,intent,n}=await context.params;
 const env=new URL(request.url).searchParams.get("environment");
 if(!id.test(workspace)||!id.test(intent)||!/^[0-4]$/.test(n)||(env!=="live"&&env!=="sandbox"))
  return Response.json({code:"NOT_FOUND"},{status:404});
 const token=(await cookies()).get("briofold-session")?.value;
 if(!token)return Response.json({code:"UNAUTHENTICATED"},{status:401});
 const base=goOrigin(false);
 if(!base)return Response.json({code:"PROXY_CONFIG_INVALID"},{status:503});
 const target=new URL(`/v1/workspaces/${workspace}/payment-proofs/${intent}/images/${n}`,base);
 target.searchParams.set("environment",env);
 try{
  const up=await fetch(target,{cache:"no-store",redirect:"error",headers:{Cookie:"briofold-session="+token},signal:AbortSignal.timeout(20000)});
  if(!up.ok||up.headers.get("Content-Type")!=="image/jpeg")
   return new Response(await up.text(),{status:up.ok?502:up.status,headers:{"Content-Type":"application/json","Cache-Control":"private, no-store"}});
  return new Response(await up.arrayBuffer(),{status:200,headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}});
 }catch{return Response.json({code:"SOURCE_UNAVAILABLE"},{status:503})}
}
