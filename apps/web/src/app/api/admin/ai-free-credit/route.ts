import {revalidatePath} from "next/cache";
import {boundedBody} from "../../../../lib/server/bounded-body";
import {database} from "../../../../lib/server/db";
import {requireFreshSuperAdmin} from "../../../../lib/server/platform-admin";

// Super Admin sets the one-time free AI credit (0260). Amount in whole taka, ৳0 to ৳500; 0 turns it off.
export async function POST(request: Request) {
  const origin = new URL(request.url);
  origin.host = request.headers.get("host") || origin.host;
  if (request.headers.get("origin") !== origin.origin) return new Response(null, {status: 403});
  const actor = await requireFreshSuperAdmin();
  if (!actor) return new Response(null, {status: 403});

  const body = await boundedBody(request, 512);
  if (body === null) return new Response(null, {status: 413});
  const form = new URLSearchParams(body);
  const revision = form.get("revision") ?? "";
  const taka = form.get("amount_taka") ?? "";
  if (!/^\d{1,18}$/.test(revision) || !/^\d{1,3}$/.test(taka) || Number(taka) > 500) {
    return new Response(null, {status: 400});
  }

  try {
    await database()`SELECT briofold_ai_free_credit_change(${actor.user.id}::uuid,${revision}::bigint,${Number(taka) * 100}::bigint)`;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "42501") return new Response(null, {status: 403});
      if (error.code === "40001") return new Response(null, {status: 409});
      if (error.code === "22023") return new Response(null, {status: 422});
    }
    return new Response(null, {status: 503});
  }
  for (const locale of ["en", "bn"]) {
    revalidatePath("/" + locale + "/admin/credits");
    revalidatePath("/" + locale + "/pricing");
  }
  return new Response(null, {status: 204});
}
