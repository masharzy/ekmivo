"use server";
import {randomBytes,createHash} from "node:crypto";
import {revalidatePath} from "next/cache";
import {database} from "../lib/server/db";
import {requireSuperAdmin} from "../lib/server/platform-admin";

export async function configurePublicSandbox(form:FormData){
 const admin=await requireSuperAdmin();if(!admin)throw new Error("FORBIDDEN");
 const action=String(form.get("action")||""),origin=String(form.get("api_origin")||"").trim();
 if(!["configure","rotate","revoke","enable"].includes(action))throw new Error("INVALID_ACTION");
 let normalized:string|null=null;
 if(action==="configure"&&origin){const u=new URL(origin);if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!=="/"||u.hostname==="localhost"||/^(127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname))throw new Error("INVALID_SANDBOX_ORIGIN");normalized=u.origin}
 await database().begin(async tx=>{
  const rows=await tx`SELECT * FROM public_sandbox_config WHERE singleton FOR UPDATE`;if(!rows.length)throw new Error("SANDBOX_NOT_PROVISIONED");
  const c=rows[0];
  if(action==="rotate"){
   const publicId=randomBytes(8).toString("hex"),token=`bf_test_${publicId}_${randomBytes(32).toString("base64url")}`,hash=createHash("sha256").update(token).digest("hex");
   await tx`UPDATE merchant_api_keys SET revoked_at=now() WHERE id=${c.key_id}::uuid AND environment='sandbox'`;
   const inserted=await tx`INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at)
   SELECT workspace_id,'sandbox',${publicId},${hash},'Universal public sandbox',scopes,${admin.user.id}::uuid,now()+interval '1 year' FROM merchant_api_keys WHERE id=${c.key_id}::uuid AND environment='sandbox' RETURNING id`;
   if(!inserted.length)throw new Error("SANDBOX_KEY_UNAVAILABLE");
   await tx`UPDATE public_sandbox_config SET key_id=${inserted[0].id}::uuid,published_test_key=${token},updated_by=${admin.user.id}::uuid,updated_at=now() WHERE singleton`;
  }else if(action==="revoke"){
   await tx`UPDATE merchant_api_keys SET revoked_at=now() WHERE id=${c.key_id}::uuid AND environment='sandbox'`;
   await tx`UPDATE public_sandbox_config SET enabled=false,updated_by=${admin.user.id}::uuid,updated_at=now() WHERE singleton`;
  }else if(action==="enable"){
   if(!c.api_origin)throw new Error("SANDBOX_URL_REQUIRED");
   const endpoint=new URL(`/v1/workspaces/${c.workspace_id}/sandbox/scenarios?environment=sandbox`,String(c.api_origin));
   const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${c.published_test_key}`},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
   const probe=await response.json();
   if(!response.ok||probe.simulation!==true||probe.provider_sandbox!==false||probe.worker_ready!==true||!Array.isArray(probe.items)||!probe.items.includes("exact-unique"))throw new Error("SANDBOX_PREFLIGHT_FAILED");
   await tx`UPDATE public_sandbox_config SET enabled=true,updated_by=${admin.user.id}::uuid,updated_at=now() WHERE singleton`;
  }else{
   // Provisioning a URL does not assert readiness. Enabling follows end-to-end verification.
   await tx`UPDATE public_sandbox_config SET api_origin=${normalized},enabled=false,updated_by=${admin.user.id}::uuid,updated_at=now() WHERE singleton`;
  }
  await tx`INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(${admin.user.id}::uuid,${'public_sandbox_'+action},'Universal sandbox configuration changed; no live credentials or financial records changed')`;
 });
 for(const locale of ["en","bn"]){revalidatePath(`/${locale}/admin`);revalidatePath(`/${locale}/docs`);revalidatePath(`/${locale}/docs/payments`)}
}
