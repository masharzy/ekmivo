import {database} from "../../../../lib/server/db";

export async function GET(_request:Request,{params}:{params:Promise<{digest:string}>}){
 const {digest}=await params;
 if(!/^[0-9a-f]{64}$/.test(digest))return new Response(null,{status:404});
 try{
  const rows=await database()`SELECT content_type,bytes FROM platform_provider_assets WHERE digest=${digest} LIMIT 1`;
  if(!rows.length)return new Response(null,{status:404});
  return new Response(new Uint8Array(rows[0].bytes),{headers:{
   "Content-Type":String(rows[0].content_type),
   "X-Content-Type-Options":"nosniff",
   "Cache-Control":"public,max-age=31536000,immutable"
  }});
 }catch{return new Response(null,{status:503,headers:{"Cache-Control":"no-store"}})}
}
