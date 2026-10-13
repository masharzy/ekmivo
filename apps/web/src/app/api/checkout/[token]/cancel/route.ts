import {NextRequest} from "next/server";
import {goOrigin} from "../../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return Response.json({error:{code:"NOT_FOUND"}},{status:404});
 const url=new URL(request.url);
 if(request.headers.get("origin")!==url.origin)return Response.json({error:{code:"ORIGIN_DENIED"}},{status:403});
 const go=goOrigin();
 if(!go)return Response.json({error:{code:"CHECKOUT_SERVICE_UNAVAILABLE"}},{status:503});
 try{
  const upstream=await fetch(new URL("/v1/public/checkout/"+token+"/cancel",go),{
   method:"POST",headers:{Origin:process.env.GO_WEB_ORIGIN||"https://ekmivo-web-masharzys-projects.vercel.app"},
   cache:"no-store",signal:AbortSignal.timeout(12000)
  });
  return new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
 }catch{return Response.json({error:{code:"CHECKOUT_SERVICE_UNAVAILABLE"}},{status:503});}
}
