import {cookies} from "next/headers";
import {goOrigin} from "../../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const token=(await cookies()).get("ekmivo-session")?.value;
 if(!token)return new Response("Sign in to complete the connection.",{status:401});
 const base=goOrigin(false);if(!base)return new Response("Connection service is unavailable.",{status:503});
 const incoming=new URL(request.url),target=new URL("/v1/channels/meta/callback",base);
 for(const key of ["code","state"]){const value=incoming.searchParams.get(key);if(!value||value.length>4096)return new Response("Connection was not completed.",{status:400});target.searchParams.set(key,value)}
 try{const r=await fetch(target,{headers:{Cookie:`ekmivo-session=${token}`},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000)});if(!r.ok)return new Response("Connection was not completed. Please return and try again.",{status:400});const result=await r.json();if(!/^[0-9a-f-]{36}$/i.test(result.workspace_id))throw Error();return Response.redirect(new URL(`/settings/channels?connected=1`,incoming.origin),303)}catch{return new Response("Connection service is unavailable. Please try again.",{status:503})}
}
