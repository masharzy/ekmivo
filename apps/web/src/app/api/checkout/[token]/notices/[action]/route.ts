import {NextRequest} from "next/server";
import {boundedBody} from "../../../../../../lib/server/bounded-body";
import {goOrigin} from "../../../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{token:string;action:string}>}){
 const {token,action}=await params;
 const reply=(status:number,code:string)=>Response.json({error:{code}},{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!["subscribe","verify","withdraw"].includes(action))return reply(404,"NOT_FOUND");
 const origin=new URL(request.url);origin.host=request.headers.get("host")||origin.host;
 if(request.headers.get("origin")!==origin.origin)return reply(403,"ORIGIN_DENIED");
 const base=goOrigin();if(!base)return reply(503,"NOTICE_SERVICE_UNAVAILABLE");
 const body=await boundedBody(request,1024);if(body===null)return reply(413,"BODY_TOO_LARGE");
 try{
  const response=await fetch(new URL(`/v1/public/checkout/${token}/notices/${action}`,base),{
   method:"POST",body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(14000),
   headers:{"Content-Type":"application/json",Origin:process.env.GO_WEB_ORIGIN||"https://briofold.tech"},
  });
  return new Response(await response.text(),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 }catch{return reply(503,"NOTICE_SERVICE_UNAVAILABLE")}
}
