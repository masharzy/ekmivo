import {boundedBody} from "../../../lib/server/bounded-body";
import {goOrigin} from "../../../lib/server/go-origin";
export async function POST(r:Request){
 const url=new URL(r.url);url.host=r.headers.get("host")||url.host;if(r.headers.get("origin")!==url.origin)return Response.json({code:"ORIGIN_DENIED"},{status:403});
 const body=await boundedBody(r,1024),base=goOrigin();if(body===null)return Response.json({code:"BODY_TOO_LARGE"},{status:413});if(!base)return Response.json({code:"UNAVAILABLE"},{status:503});
 try{const response=await fetch(new URL("/v1/customer-verify",base),{method:"POST",headers:{"Content-Type":"application/json"},body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});return new Response(await response.text(),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}catch{return Response.json({code:"UNAVAILABLE"},{status:503});}
}
