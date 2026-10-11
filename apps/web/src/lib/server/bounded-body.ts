import "server-only";
// Stop consuming before an oversized upload reaches the Go proxy or JSON parser.
export async function boundedBody(request:Request,limit:number):Promise<string|null>{
 const declared=Number(request.headers.get("content-length"));
 if(Number.isFinite(declared)&&declared>limit)return null;
 if(!request.body)return "";
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];
 let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return null}chunks.push(value)}
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder().decode(bytes);
}
