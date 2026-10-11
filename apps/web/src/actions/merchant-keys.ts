"use server";

import {randomBytes,createHash} from "node:crypto";
import {cookies} from "next/headers";
import {revalidatePath} from "next/cache";
import {requireUser,hashToken,passwordMatches} from "../lib/server/auth";
import {database} from "../lib/server/db";
import {safeLocale} from "../lib/server/validation";

export type KeyActionState={
 status:"idle"|"error"|"success";message:string;rawSecret?:string;keyId?:string
};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const SCOPES=new Set([
 "payments:read","payments:write","customers:read","customers:write",
 "invoices:read","invoices:write","refunds:read","refunds:write","webhooks:manage"
]);
type Operation="create"|"rotate"|"revoke";
function error(bn:boolean,code:"bad"|"denied"|"reauth"|"limit"|"missing"|"offline"):KeyActionState{
 const messages={
  bad:["Check the name, environment, expiry and scopes.","নাম, পরিবেশ, মেয়াদ ও অনুমতি যাচাই করুন।"],
  denied:["Only an authorized owner or admin can manage payment keys.","শুধু অনুমোদিত মালিক বা অ্যাডমিন পেমেন্ট কী পরিচালনা করতে পারবেন।"],
  reauth:["Confirm your current password to change API credentials.","API key পরিবর্তনের জন্য বর্তমান পাসওয়ার্ড নিশ্চিত করুন।"],
  limit:["Too many active keys or requests. Revoke an unused key or retry later.","অতিরিক্ত কী বা অনুরোধ হয়েছে। অব্যবহৃত কী বাতিল করুন অথবা পরে চেষ্টা করুন।"],
  missing:["This key is missing, expired or already revoked.","কীটি পাওয়া যায়নি, মেয়াদ শেষ বা বাতিল করা হয়েছে।"],
  offline:["Key storage is unavailable. No credential was changed.","কী সংরক্ষণের সেবা পাওয়া যায়নি। কোনো পরিবর্তন হয়নি।"]
 } as const;
 return {status:"error",message:messages[code][bn?1:0]};
}
async function change(localeRaw:string,operation:Operation,_previous:KeyActionState,form:FormData):Promise<KeyActionState>{
 const locale=safeLocale(localeRaw),bn=locale==="bn";
 const actor=await requireUser(locale);
 const workspace=String(form.get("workspaceId")??"");
 const environment=String(form.get("environment")??"");
 const password=form.get("password");
 const name=String(form.get("name")??"").trim();
 const selected=form.getAll("scopes");
 const days=Number(form.get("expiresDays"));
 const oldId=String(form.get("keyId")??"");
 if(!UUID.test(workspace)||!["sandbox","live"].includes(environment)
  ||typeof password!=="string"||password.length>256
  ||(operation!=="create"&&!UUID.test(oldId)))return error(bn,"bad");
 const scopes=selected.filter((v):v is string=>typeof v==="string");
 if(operation==="create" && (
  name.length<2||name.length>80||/[\u0000-\u001F\u007F]/.test(name)||
  ![7,30,90].includes(days)||scopes.length<1||scopes.length>9||
  new Set(scopes).size!==scopes.length||scopes.some(scope=>!SCOPES.has(scope))
 ))return error(bn,"bad");
 try{
  const cookie=(await cookies()).get("ekmivo-session")?.value;
  if(!cookie||cookie.length>256)return error(bn,"reauth");
  const result=await database().begin(async tx=>{
   // Revalidate current session and membership INSIDE the write transaction.
   // No trust is placed in a role, product mode or environment from the form.
   const session=await tx`SELECT u.password_hash FROM auth_sessions s
    JOIN app_users u ON u.id=s.user_id
    WHERE s.user_id=${actor.id}::uuid AND s.token_hash=${hashToken(cookie)}
     AND s.revoked_at IS NULL AND s.expires_at>now() AND u.disabled_at IS NULL
    LIMIT 1`;
   if(session.length!==1)return {code:"reauth" as const};
   const member=await tx`SELECT role FROM workspace_members
    WHERE workspace_id=${workspace}::uuid AND user_id=${actor.id}::uuid FOR UPDATE`;
   if(member.length!==1||!["owner","admin"].includes(String(member[0].role)))return {code:"denied" as const};
   const realm=await tx`SELECT environment FROM workspace_environments
    WHERE workspace_id=${workspace}::uuid AND environment=${environment}
    AND status='active' FOR SHARE`;
   const product=await tx`SELECT enabled FROM workspace_product_access
    WHERE workspace_id=${workspace}::uuid AND product='payments' FOR SHARE`;
   if(realm.length!==1||product.length!==1||!product[0].enabled)return {code:"denied" as const};
   if(!await passwordMatches(password,String(session[0].password_hash)))return {code:"reauth" as const};
   // Emergency revocation must remain available even if issuance is rate-limited.
   // Rate limit only the operations that mint a new secret.
   if(operation!=="revoke"){
    const recent=await tx`SELECT count(*)::int AS total FROM merchant_api_key_audit
     WHERE workspace_id=${workspace}::uuid AND environment=${environment}
     AND actor_id=${actor.id}::uuid AND action IN ('created','rotated')
     AND occurred_at>now()-interval '1 hour'`;
    if(Number(recent[0].total)>=10)return {code:"limit" as const};
   }
   let nextName=name,nextScopes=scopes,nextExpires=new Date(Date.now()+days*86400000);
   if(operation!=="create"){
    const existing=await tx`SELECT id,name,scopes,expires_at,revoked_at FROM merchant_api_keys
     WHERE id=${oldId}::uuid AND workspace_id=${workspace}::uuid AND environment=${environment}
     FOR UPDATE`;
    if(existing.length!==1||existing[0].revoked_at||new Date(existing[0].expires_at).getTime()<=Date.now())return {code:"missing" as const};
    nextName=String(existing[0].name);
    nextScopes=[...existing[0].scopes] as string[];
    nextExpires=new Date(existing[0].expires_at);
    await tx`UPDATE merchant_api_keys SET revoked_at=now() WHERE id=${oldId}::uuid AND revoked_at IS NULL`;
    await tx`INSERT INTO merchant_api_key_audit(workspace_id,environment,key_id,actor_id,action)
     VALUES(${workspace}::uuid,${environment},${oldId}::uuid,${actor.id}::uuid,${operation==="rotate"?"rotated":"revoked"})`;
    if(operation==="revoke")return {code:"revoked" as const};
   }
   const count=await tx`SELECT count(*)::int AS total FROM merchant_api_keys
    WHERE workspace_id=${workspace}::uuid AND environment=${environment}
    AND revoked_at IS NULL AND expires_at>now()`;
   if(Number(count[0].total)>=25)return {code:"limit" as const};
   const publicId=randomBytes(8).toString("hex");
   const raw=`ek_${environment==="sandbox"?"test":"live"}_${publicId}_${randomBytes(32).toString("base64url")}`;
   const digest=createHash("sha256").update(raw).digest("hex");
   const rows=await tx`INSERT INTO merchant_api_keys
    (workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at)
    VALUES(${workspace}::uuid,${environment},${publicId},${digest},
     ${nextName},${nextScopes},${actor.id}::uuid,${nextExpires})
    RETURNING id`;
   const id=String(rows[0].id);
   await tx`INSERT INTO merchant_api_key_audit(workspace_id,environment,key_id,actor_id,action)
    VALUES(${workspace}::uuid,${environment},${id}::uuid,${actor.id}::uuid,'created')`;
   return {code:"created" as const,raw,keyId:id};
  });
  if(result.code==="denied"||result.code==="reauth"||result.code==="limit"||result.code==="missing")return error(bn,result.code);
  revalidatePath(`/${locale}/w/${workspace}/payments/developers`);
  if(result.code==="revoked")return {status:"success",message:bn?"কীটি বাতিল করা হয়েছে।":"API key revoked."};
  return {status:"success",message:bn?"গোপন কীটি এখনই কপি করুন। এটি আর দেখানো হবে না।":"Copy this secret now. It will never be shown again.",rawSecret:result.raw,keyId:result.keyId};
 }catch(e){
  console.error("[pg03 key mutation]",e instanceof Error?e.name:"unknown");
  return error(bn,"offline");
 }
}
export async function createMerchantKey(locale:string,previous:KeyActionState,form:FormData){
 return change(locale,"create",previous,form);
}
export async function rotateMerchantKey(locale:string,previous:KeyActionState,form:FormData){
 return change(locale,"rotate",previous,form);
}
export async function revokeMerchantKey(locale:string,previous:KeyActionState,form:FormData){
 return change(locale,"revoke",previous,form);
}
