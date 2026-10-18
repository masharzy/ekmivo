import "server-only";
import { createCipheriv,createDecipheriv,randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { database } from "./db";
import { hashToken } from "./auth";
import { encodeBase32, matchTotp } from "../mfa-core.js";

const COOKIE="ekmivo-session";
function encryptionKey():Buffer {
 const secret=process.env.MFA_ENCRYPTION_KEY;
 if(!secret)throw Error("MFA_KEY_NOT_CONFIGURED");
 const decoded=Buffer.from(secret,"base64url");
 if(decoded.length!==32)throw Error("MFA_KEY_INVALID");
 return decoded;
}
export function mfaConfigured():boolean {
 try{encryptionKey();return true;}catch{return false;}
}
export function makeTotpSecret():string{return encodeBase32(randomBytes(20));}
export function sealSecret(secret:string):string{
 const key=encryptionKey(),iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 const encrypted=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(":");
}
export function unsealSecret(record:string):string{
 const [version,ivText,tagText,encryptedText,...rest]=record.split(":");
 if(version!=="v1"||!ivText||!tagText||!encryptedText||rest.length)throw Error("MFA_SECRET_INVALID");
 const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(ivText,"base64url"));
 decipher.setAuthTag(Buffer.from(tagText,"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(encryptedText,"base64url")),decipher.final()]).toString("utf8");
}
export async function sessionMfaValid(userId:string):Promise<boolean>{
 if(!mfaConfigured())return false;
 const token=(await cookies()).get(COOKIE)?.value;
 if(!token||token.length>256)return false;
 const rows=await database()`
 SELECT 1 FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
 JOIN platform_admin_mfa m ON m.user_id=s.user_id
 WHERE s.token_hash=${hashToken(token)} AND s.user_id=${userId}::uuid
 AND u.disabled_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>now()
 AND m.confirmed_at IS NOT NULL AND s.mfa_verified_at>=m.confirmed_at
 AND s.mfa_verified_at<=now()+interval '1 minute'
 LIMIT 1`;
 return rows.length>0;
}
export async function sessionIdForMfa(userId:string):Promise<string|null>{
 const token=(await cookies()).get(COOKIE)?.value;
 if(!token||token.length>256)return null;
 const rows=await database()`SELECT s.id FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
 WHERE s.token_hash=${hashToken(token)} AND s.user_id=${userId}::uuid
 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.disabled_at IS NULL LIMIT 1`;
 return rows.length?String(rows[0].id):null;
}
export {matchTotp};
