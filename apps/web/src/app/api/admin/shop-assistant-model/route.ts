import {revalidatePath} from "next/cache";
import {boundedBody} from "../../../../lib/server/bounded-body";
import {database} from "../../../../lib/server/db";
import {requireFreshSuperAdmin} from "../../../../lib/server/platform-admin";

export async function POST(request: Request) {
  if (process.env.BRIOFOLD_AI_MODEL_SETTING_ENABLED !== "true") return new Response(null, {status: 404});
  const origin = new URL(request.url);
  origin.host = request.headers.get("host") || origin.host;
  if (request.headers.get("origin") !== origin.origin) return new Response(null, {status: 403});
  const actor = await requireFreshSuperAdmin();
  if (!actor) return new Response(null, {status: 403});

  const body = await boundedBody(request, 1024);
  if (body === null) return new Response(null, {status: 413});
  const form = new URLSearchParams(body);
  const revision = form.get("revision") ?? "";
  const model = form.get("model") ?? "";
  const operation = form.get("operation");
  if (!/^\d{1,18}$/.test(revision) || (operation !== "save" && operation !== "rollback")) {
    return new Response(null, {status: 400});
  }
  if (operation === "save" && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)) {
    return new Response(null, {status: 400});
  }

  try {
    await database()`SELECT briofold_shop_assistant_model_change(
      ${actor.user.id}::uuid,${revision}::bigint,${operation === "save" ? model : null},${operation === "rollback"})`;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "42501") return new Response(null, {status: 403});
      if (error.code === "40001") return new Response(null, {status: 409});
      if (error.code === "22023") return new Response(null, {status: 422});
    }
    return new Response(null, {status: 503});
  }
  for (const locale of ["en", "bn"]) revalidatePath("/" + locale + "/admin/credits");
  return new Response(null, {status: 204});
}
