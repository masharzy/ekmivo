"use server";

import {revalidatePath} from "next/cache";
import {database} from "../lib/server/db";
import {requireFreshSuperAdmin} from "../lib/server/platform-admin";

export async function changeShopAssistantModel(_previous: number, form: FormData): Promise<number> {
  if (process.env.BRIOFOLD_AI_MODEL_SETTING_ENABLED !== "true") return 404;
  const actor = await requireFreshSuperAdmin();
  if (!actor) return 403;

  const revision = String(form.get("revision") ?? "");
  const model = String(form.get("model") ?? "");
  const operation = form.get("operation");
  if (!/^\d{1,18}$/.test(revision) || (operation !== "save" && operation !== "rollback")) return 400;
  if (operation === "save" && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)) return 400;

  try {
    await database()`SELECT briofold_shop_assistant_model_change(
      ${actor.user.id}::uuid,${revision}::bigint,${operation === "save" ? model : null},${operation === "rollback"})`;
  } catch {
    return 409;
  }
  revalidatePath("/admin/credits");
  revalidatePath("/en/admin/credits");
  revalidatePath("/bn/admin/credits");
  return 200;
}
