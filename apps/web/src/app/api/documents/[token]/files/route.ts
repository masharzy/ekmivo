import {goOrigin} from "../../../../../lib/server/go-origin";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!/^[A-Za-z0-9_-]{43}$/.test(token))return Response.json({code:"NOT_FOUND"},{status:404});
 const url=new URL(request.url);url.host=request.headers.get("host")||url.host;if(request.headers.get("origin")!==url.origin)return Response.json({code:"ORIGIN_DENIED"},{status:403});
 const base=goOrigin();if(!base)return Response.json({code:"SOURCE_UNAVAILABLE"},{status:503});
 const reader=request.body?.getReader();if(!reader)return Response.json({code:"EMPTY_FILE"},{status:400});
 const chunks:Uint8Array[]=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>5242880){await reader.cancel();return Response.json({code:"FILE_LIMIT_EXCEEDED"},{status:413})}chunks.push(value)}}finally{reader.releaseLock()}
 const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength}
 try{const response=await fetch(new URL(`/v1/public/documents/${token}/files`,base),{method:"POST",body,redirect:"error",cache:"no-store",headers:{Origin:process.env.GO_WEB_ORIGIN||"https://briofold.tech","X-Filename":request.headers.get("X-Filename")||"attachment","X-Filename-Encoding":request.headers.get("X-Filename-Encoding")||"plain"},signal:AbortSignal.timeout(45000)});return new Response(await response.text(),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}})}catch{return Response.json({code:"UPLOAD_UNCONFIRMED"},{status:503})}
}
