"use server";
import {revalidatePath} from "next/cache";
import {verifiedAdmin} from "../lib/server/platform-admin";
import {database} from "../lib/server/db";
export async function revokeAdminDevice(form:FormData){
 const admin=await verifiedAdmin();if(!admin)throw Error("ACCESS_DENIED");
 const id=String(form.get("deviceId")||"");if(!/^[0-9a-f-]{36}$/i.test(id))throw Error("INVALID_DEVICE");
 await database().begin(async tx=>{
  // An admin can revoke their own browser; Super Admin can revoke any admin browser.
  const rows=await tx`UPDATE platform_admin_trusted_devices SET revoked_at=now()
   WHERE id=${id}::uuid AND revoked_at IS NULL AND (user_id=${admin.user.id}::uuid OR EXISTS(SELECT 1 FROM platform_administrators WHERE user_id=${admin.user.id}::uuid AND role='super_admin')) RETURNING user_id`;
  if(!rows.length)throw Error("DEVICE_NOT_FOUND");
  await tx`UPDATE auth_sessions SET revoked_at=now() WHERE trusted_device_id=${id}::uuid AND revoked_at IS NULL`;
  await tx`INSERT INTO platform_admin_audit(actor_id,action,subject_id,description) VALUES(${admin.user.id}::uuid,'admin.device_revoked',${rows[0].user_id}::uuid,${"Revoked browser "+id})`;
 });
 revalidatePath('/[locale]/admin/settings','page');
}
