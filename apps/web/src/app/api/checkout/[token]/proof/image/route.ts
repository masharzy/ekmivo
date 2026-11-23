import {NextRequest} from "next/server";
import {goOrigin} from "../../../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
// One receipt photo. The page shrinks it to a JPEG first (Vercel's request
// limit is about 4.5 MB); Go checks and re-encodes it, then stores it in R2.
const limit=4*1024*1024;
export async function POST(request:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return Response.json({error:{code:"NOT_FOUND"}},{status:404});
 if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:{code:"ORIGIN_DENIED"}},{status:403});
 const go=goOrigin();
 if(!go)return Response.json({error:{code:"CHECKOUT_SERVICE_UNAVAILABLE"}},{status:503});
 const reader=request.body?.getReader();
 if(!reader)return Response.json({error:{code:"PROOF_IMAGE_INVALID"}},{status:422});
 const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
  if(length>limit){await reader.cancel();return Response.json({error:{code:"PROOF_IMAGE_TOO_LARGE"}},{status:413})}
  chunks.push(value)}}finally{reader.releaseLock()}
 const body=new Uint8Array(length);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.byteLength}
 try{
  const upstream=await fetch(new URL("/v1/public/checkout/"+token+"/proof/image",go),{
   method:"POST",body,headers:{Origin:process.env.GO_WEB_ORIGIN||"https://briofold.tech","Content-Type":"application/octet-stream"},
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(45000)
  });
  return new Response(await upstream.text(),{status:upstream.status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
 }catch{return Response.json({error:{code:"PROOF_STORAGE_UNAVAILABLE"}},{status:503});}
}
