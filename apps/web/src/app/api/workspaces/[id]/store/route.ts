import {createHash} from "node:crypto";
import {currentUser} from "../../../../../lib/server/auth";
import {database} from "../../../../../lib/server/db";
import {boundedBody} from "../../../../../lib/server/bounded-body";
import {validStoreProfile} from "../../../../../lib/store-profile";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function handle(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))return reply({code:"NOT_FOUND"},404);
 const user=await currentUser();if(!user)return reply({code:"UNAUTHENTICATED"},401);
 try{
  const db=database();
  if(request.method==="GET"){
   const rows=await db`SELECT dashboard_store_read(${id}::uuid,${user.id}::uuid) AS value`;
   return reply(rows[0].value);
  }
  const url=new URL(request.url);url.host=request.headers.get("host")||url.host;
  if(request.headers.get("origin")!==url.origin)return reply({code:"ORIGIN_DENIED"},403);
  const raw=await boundedBody(request,1502000);
  if(raw===null)return reply({code:"BODY_TOO_LARGE"},413);
  let input:unknown;try{input=JSON.parse(raw)}catch{return reply({code:"INVALID_BODY"},422)}
  const value=input as {body?:unknown;version?:unknown}|null;
  if(!validStoreProfile(value?.body)||!Number.isInteger(value?.version)||(value?.version as number)<1)return reply({code:"INVALID_STORE"},422);
  const body={...value.body,name:value.body.name.trim()};
  let digest:string|null=null,png:Buffer|null=null;
  if(body.logo.startsWith("data:image/png;base64,")){
   png=Buffer.from(body.logo.slice(22),"base64");
   if(png.length>1048576||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return reply({code:"INVALID_LOGO"},422);
   digest=createHash("sha256").update(png).digest("hex");
   body.logo="/api/checkout-logos/"+digest;
  }
  const rows=await db`SELECT dashboard_store_write(${id}::uuid,${user.id}::uuid,${db.json(body)},${value.version as number},${digest},${png}) AS value`;
  return reply(rows[0].value);
 }catch(e){
  const code=e&&typeof e==="object"&&"code" in e?e.code:"";
  return reply({code:code==="23505"?"VERSION_CONFLICT":code==="42501"?"ACCESS_DENIED":code==="22023"?"INVALID_STORE":"STORE_UNAVAILABLE"},code==="23505"?409:code==="42501"?403:code==="22023"?422:503);
 }
}
export const GET=handle;
export const PUT=handle;
