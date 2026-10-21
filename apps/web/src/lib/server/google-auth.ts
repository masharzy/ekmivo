import "server-only";
import {cookies} from "next/headers";
import {database} from "./db";
import {hashToken,passwordHash} from "./auth";
import {randomBytes} from "node:crypto";
import type {GoogleFlow,verifyGoogleIdToken} from "../google-oidc";

export const googleFlowCookie=process.env.NODE_ENV==="production"?"__Host-ekmivo-google-flow":"ekmivo-google-flow";
export async function googleAccount(flow:GoogleFlow,identity:Awaited<ReturnType<typeof verifyGoogleIdToken>>){
 const token=(await cookies()).get("ekmivo-session")?.value;
 const sessionHash=token?hashToken(token):"";
 if(flow.mode==="link"&&sessionHash!==flow.sessionHash)throw Error("GOOGLE_REAUTH_REQUIRED");
 // OAuth-only accounts get an unguessable password; recovery can explicitly set one.
 const password=await passwordHash(randomBytes(48).toString("base64url"));
 return database().begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'google:'+identity.subject},0))`;
  const existing=await tx`SELECT g.user_id,u.disabled_at FROM auth_google_identities g JOIN app_users u ON u.id=g.user_id WHERE g.subject=${identity.subject} FOR UPDATE OF g,u`;
  if(existing.length&&existing[0].disabled_at)throw Error("GOOGLE_ACCOUNT_UNAVAILABLE");
  if(flow.mode==="link"){
   const actor=await tx`SELECT u.id,u.email FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.user_id=${flow.userId!}::uuid AND s.token_hash=${sessionHash} AND s.revoked_at IS NULL AND s.expires_at>now() AND s.created_at>now()-interval '10 minutes' AND u.disabled_at IS NULL AND u.email_verified_at IS NOT NULL FOR UPDATE OF s,u`;
   if(!actor.length)throw Error("GOOGLE_REAUTH_REQUIRED");
   if(actor[0].email!==identity.email)throw Error("GOOGLE_EMAIL_MISMATCH");
   if(existing.length&&String(existing[0].user_id)!==flow.userId)throw Error("GOOGLE_ACCOUNT_UNAVAILABLE");
   const linked=await tx`SELECT subject FROM auth_google_identities WHERE user_id=${flow.userId!}::uuid`;
   if(linked.length&&linked[0].subject!==identity.subject)throw Error("GOOGLE_ACCOUNT_UNAVAILABLE");
   if(!existing.length)await tx`INSERT INTO auth_google_identities(subject,user_id) VALUES(${identity.subject},${flow.userId!}::uuid)`;
   return {userId:flow.userId!,created:false,linked:true};
  }
  if(existing.length)return {userId:String(existing[0].user_id),created:false,linked:false};
  // Never merge by email, including unverified or administrator accounts.
  const sameEmail=await tx`SELECT id FROM app_users WHERE email=${identity.email}`;
  if(sameEmail.length)throw Error("GOOGLE_LINK_REQUIRED");
  // Google is not authoritative for a third-party email without a Workspace hd claim.
  // Use the existing email signup/OTP flow for these accounts, rather than trust stale ownership.
  if(!identity.authoritativeEmail)throw Error("GOOGLE_EMAIL_SIGNUP_REQUIRED");
  const users=await tx`INSERT INTO app_users(display_name,email,password_hash,email_verified_at) VALUES(${identity.name},${identity.email},${password},now()) ON CONFLICT(email) DO NOTHING RETURNING id`;
  if(!users.length)throw Error("GOOGLE_LINK_REQUIRED");
  const userId=String(users[0].id);
  await tx`INSERT INTO auth_google_identities(subject,user_id) VALUES(${identity.subject},${userId}::uuid)`;
  const workspace=await tx`INSERT INTO workspaces(name,service_mode,created_by) VALUES('New business','commerce',${userId}::uuid) RETURNING id`;
  await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace[0].id}::uuid,${userId}::uuid,'owner')`;
  // Google signups follow the same staged business setup; existing accounts
  // and older databases without this additive migration remain unchanged.
  const [onboarding]=await tx`SELECT to_regclass('public.briofold_business_onboarding') AS ready,
   to_regclass('public.platform_primary_stores') AS primary_ready`;
  if(onboarding?.primary_ready)await tx`INSERT INTO platform_primary_stores(user_id,workspace_id,bound_by)
   VALUES(${userId}::uuid,${workspace[0].id}::uuid,${userId}::uuid)`;
  if(onboarding?.ready)await tx`INSERT INTO briofold_business_onboarding(workspace_id,owner_id)
   VALUES(${workspace[0].id}::uuid,${userId}::uuid)`;
  return {userId,created:true,linked:false};
 });
}
