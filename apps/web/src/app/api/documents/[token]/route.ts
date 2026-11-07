import {goOrigin} from "../../../../lib/server/go-origin";
import {boundedBody} from "../../../../lib/server/bounded-body";
export const dynamic="force-dynamic";
async function forward(request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[A-Za-z0-9_-]{43}$/.test(token))return Response.json({code:"NOT_FOUND"},{status:404});
 const post=request.method==="POST",url=new URL(request.url);url.host=request.headers.get("host")||url.host;
 if(post&&request.headers.get("origin")!==url.origin)return Response.json({code:"ORIGIN_DENIED"},{status:403});
 const base=goOrigin();if(!base)return Response.json({code:"SOURCE_UNAVAILABLE"},{status:503});
 const body=post?await boundedBody(request,49152):undefined;if(body===null)return Response.json({code:"BODY_TOO_LARGE"},{status:413});
 try{const response=await fetch(new URL(`/v1/public/documents/${token}`,base),{method:request.method,body,cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json","Idempotency-Key":request.headers.get("Idempotency-Key")||"",Origin:process.env.GO_WEB_ORIGIN||"https://briofold.tech"},signal:AbortSignal.timeout(15000)});return new Response(await response.text(),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}})}catch{return Response.json({code:"SOURCE_UNAVAILABLE"},{status:503})}
}
export const GET=forward;
export const POST=forward;
