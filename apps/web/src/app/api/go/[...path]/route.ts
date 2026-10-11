import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
const workspacePath = /^workspaces\/[0-9a-f-]{36}\/(access|settings|(?:payment-intents(?:\/[0-9a-f-]{36}\/cancel)?|linked-sources))$/i;
async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
 const path = (await context.params).path.join("/");
 const read = request.method === "GET";
 if (!(read && ["session", "platform/access"].includes(path)) && !workspacePath.test(path))
  return Response.json({ code: "NOT_FOUND" }, { status: 404 });
 const intentPath=/^workspaces\/[0-9a-f-]{36}\/(?:payment-intents(?:\/[0-9a-f-]{36}\/cancel)?|linked-sources)$/i.test(path);
 if(!read && !((path.endsWith("/settings")&&request.method==="PATCH") || (intentPath&&request.method==="POST")))
  return Response.json({ code:"METHOD_NOT_ALLOWED" },{status:405});
 const requestUrl = new URL(request.url);
 // Next's local server may use localhost internally despite a 127.0.0.1 Host.
 // Host is browser-controlled by the actual destination, never a user-id claim.
 requestUrl.host = request.headers.get("host") || requestUrl.host;
 const origin = requestUrl.origin;
 if (!read && request.headers.get("origin") !== origin)
  return Response.json({ code: "ORIGIN_DENIED" }, { status: 403 });
 const token = (await cookies()).get("ekmivo-session")?.value;
 if (!token) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
 const base = new URL(process.env.GO_API_URL || "https://ekmivo-go-api.onrender.com");
 if (base.protocol !== "https:" || base.username || base.password)
  return Response.json({ code: "PROXY_CONFIG_INVALID" }, { status: 503 });
 const target = new URL("/v1/" + path, base);
 const incoming = new URL(request.url);
 for (const key of ["environment", "capability"]) {
  const value = incoming.searchParams.get(key);
  if (value) target.searchParams.set(key, value);
 }
 const body = read ? undefined : await request.text();
 if (body && new TextEncoder().encode(body).length > 4096)
  return Response.json({ code: "BODY_TOO_LARGE" }, { status: 413 });
 try {
  const upstream = await fetch(target, {
   method: request.method, body, cache: "no-store", redirect: "error",
   // Incoming mutation origin was validated above. Forward the configured
   // server origin; preview/local hostnames never become Go's trust policy.
   headers: { Cookie: "ekmivo-session=" + token, "Content-Type": "application/json",
    "Idempotency-Key": incoming.pathname.endsWith("/payment-intents") ? (request.headers.get("Idempotency-Key") || "") : "",
    Origin: process.env.GO_WEB_ORIGIN || "https://ekmivo-web-masharzys-projects.vercel.app" },
   signal: AbortSignal.timeout(15000),
  });
  return new Response(await upstream.text(), { status: upstream.status,
   headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
 } catch { return Response.json({ code: "API_UNAVAILABLE" }, { status: 503 }); }
}
export const GET = forward;
export const PATCH = forward;
export const POST = forward;
