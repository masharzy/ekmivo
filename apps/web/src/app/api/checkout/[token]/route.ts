import { NextRequest } from "next/server";
import { goOrigin } from "../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function result(status:number,code:string){return Response.json({error:{code}},{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}})}
async function forward(request:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 if(!TOKEN.test(token))return result(404,"NOT_FOUND");
 const post=request.method==="POST";
 if(post){
  const u=new URL(request.url);
  u.host=request.headers.get("host")||u.host;
  if(request.headers.get("origin")!==u.origin)return result(403,"ORIGIN_DENIED");
 }
 const base=goOrigin();
 if(!base)return result(503,"PROXY_CONFIG_INVALID");
 const target=new URL(`/v1/public/checkout/${token}${post?"/lock":""}`,base);
 const body=post?await request.text():undefined;
 if(body&&new TextEncoder().encode(body).length>4096)return result(413,"BODY_TOO_LARGE");
 try{
  const upstream=await fetch(target,{method:request.method,body,cache:"no-store",redirect:"error",
   headers:post?{"Content-Type":"application/json",Origin:process.env.GO_WEB_ORIGIN||"https://ekmivo-web-masharzys-projects.vercel.app"}:undefined,
   signal:AbortSignal.timeout(14000)});
  return new Response(await upstream.text(),{status:upstream.status,headers:{
   "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
   "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",...(upstream.headers.has("Retry-After")?{"Retry-After":upstream.headers.get("Retry-After")!}:{})
  }});
 }catch{return result(503,"CHECKOUT_SERVICE_UNAVAILABLE")}
}
export const GET=forward;
export const POST=forward;
