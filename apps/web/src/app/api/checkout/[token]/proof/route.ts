import {NextRequest} from "next/server";
import {goOrigin} from "../../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
// Payment proof (TrxID / receipt) for one checkout. Go answers 404 while
// BRIOFOLD_PAYMENT_PROOFS_ENABLED is off, and the page then shows nothing new.
async function forward(request:NextRequest,token:string,method:"GET"|"POST"){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return Response.json({error:{code:"NOT_FOUND"}},{status:404});
 if(method==="POST"&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:{code:"ORIGIN_DENIED"}},{status:403});
 const go=goOrigin();
 if(!go)return Response.json({error:{code:"CHECKOUT_SERVICE_UNAVAILABLE"}},{status:503});
 let body:string|undefined;
 if(method==="POST"){body=await request.text();if(body.length>1024)return Response.json({error:{code:"INVALID_REQUEST"}},{status:422});}
 try{
  const upstream=await fetch(new URL("/v1/public/checkout/"+token+"/proof",go),{
   method,body,headers:{Origin:process.env.GO_WEB_ORIGIN||"https://briofold.tech",...(body?{"Content-Type":"application/json"}:{})},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)
  });
  return new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
 }catch{return Response.json({error:{code:"CHECKOUT_SERVICE_UNAVAILABLE"}},{status:503});}
}
export async function GET(request:NextRequest,{params}:{params:Promise<{token:string}>}){return forward(request,(await params).token,"GET")}
export async function POST(request:NextRequest,{params}:{params:Promise<{token:string}>}){return forward(request,(await params).token,"POST")}
