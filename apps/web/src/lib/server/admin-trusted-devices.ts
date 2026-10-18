import "server-only";
import {randomBytes,createHash} from "node:crypto";
import {cookies,headers} from "next/headers";
import {database} from "./db";
const COOKIE="ekmivo-admin-device";
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function trustAdminDevice(userId:string,sessionId:string){
 const jar=await cookies(),token=randomBytes(32).toString("base64url");
 const agent=(await headers()).get("user-agent")||"Browser";
 const name=(/Edg\//.test(agent)?"Edge":/Firefox\//.test(agent)?"Firefox":/Chrome\//.test(agent)?"Chrome":/Safari\//.test(agent)?"Safari":"Browser")+" · "+(/Android/.test(agent)?"Android":/iPhone|iPad/.test(agent)?"iOS":/Windows/.test(agent)?"Windows":/Mac/.test(agent)?"macOS":"Linux");
 await database().begin(async tx=>{
  // Replacing trust for this browser also revokes sessions attached to its old token.
  const old=jar.get(COOKIE)?.value;
  if(old&&old.length<=256){const previous=await tx`UPDATE platform_admin_trusted_devices SET revoked_at=now() WHERE user_id=${userId}::uuid AND token_hash=${digest(old)} AND revoked_at IS NULL RETURNING id`;
   for(const d of previous)await tx`UPDATE auth_sessions SET revoked_at=now() WHERE trusted_device_id=${d.id}::uuid AND id<>${sessionId}::uuid AND revoked_at IS NULL`;}
  const [d]=await tx`INSERT INTO platform_admin_trusted_devices(user_id,token_hash,name) VALUES(${userId}::uuid,${digest(token)},${name}) RETURNING id`;
  await tx`UPDATE auth_sessions SET trusted_device_id=${d.id}::uuid WHERE id=${sessionId}::uuid AND user_id=${userId}::uuid AND revoked_at IS NULL`;
  await tx`INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(${userId}::uuid,'admin.device_trusted',${name})`;
 });
 jar.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:30*86400,priority:"high"});
}
export async function rememberedAdminDevice(userId:string):Promise<string|null>{
 const token=(await cookies()).get(COOKIE)?.value;
 if(!token||token.length>256)return null;
 // Migration missing must require MFA, never bypass it or break ordinary login.
 try{const rows=await database()`UPDATE platform_admin_trusted_devices d SET last_used_at=now()
 FROM platform_admin_mfa m,platform_administrators a
 WHERE d.user_id=${userId}::uuid AND d.token_hash=${digest(token)}
 AND d.revoked_at IS NULL AND d.expires_at>now() AND m.user_id=d.user_id
 AND a.user_id=d.user_id AND m.confirmed_at IS NOT NULL AND d.verified_at>=m.confirmed_at RETURNING d.id`;
 return rows.length?String(rows[0].id):null;}catch{return null;}
}
