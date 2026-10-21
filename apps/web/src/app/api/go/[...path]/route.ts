import {currentUser,preferredWorkspaceFor} from "../../../../lib/server/auth";
import { cookies } from "next/headers";
import { boundedBody } from "../../../../lib/server/bounded-body";
import { goOrigin } from "../../../../lib/server/go-origin";

export const dynamic = "force-dynamic";
export const maxDuration=60;
const adminPlanPath=/^platform\/workspaces\/[0-9a-f-]{36}\/payment-usage$/i;
const adminWorkspaceRead=/^platform\/workspaces\/[0-9a-f-]{36}\/operations\/(payments|devices|overview)$/i;
const operationPath=/^workspaces\/[0-9a-f-]{36}\/operations\/(payments|incoming|gateways|devices|webhooks|deliveries|events|parsers|overview|notices)(?:\/[0-9a-f-]{36}(?:\/(revoke|rename|reprocess|enable|disable|rotate|activate_rotation|revoke_previous|replay|retry))?)?$/i;
const workspacePath = /^workspaces\/[0-9a-f-]{36}\/(access|settings|(?:payment-intents(?:\/[0-9a-f-]{36}(?:\/cancel)?)?|linked-sources))$/i;
const mobilePath=/^workspaces\/[0-9a-f-]{36}\/(?:mobile-devices(?:\/[0-9a-f-]{36}\/(?:revoke|reconnect|delete))?|comments|website-chat|inbox-connect|inbox|inbox-connections(?:\/[0-9a-f-]{36}\/disconnect)?)$/i;
const commercePath=/^workspaces\/[0-9a-f-]{36}\/commerce$/i;
const crmPath=/^workspaces\/[0-9a-f-]{36}\/crm$/i;
const aiRuntimePath=/^workspaces\/[0-9a-f-]{36}\/ai\/(?:test|studio-test|knowledge-import)$/i;
const aiCreditPath=/^workspaces\/[0-9a-f-]{36}\/ai-credits\/(?:purchase|[0-9a-f-]{36}\/reconcile)$/i;
const phonePath=/^workspaces\/[0-9a-f-]{36}\/phones(?:\/[0-9a-f-]{36}\/(?:attach|detach|rename|revoke|reconnect|delete|edit-account))?$/i;
const documentPath=/^workspaces\/[0-9a-f-]{36}\/(?:documents\/(?:customers|invoices|payment-links)(?:\/(?:[0-9a-f-]{36}|commands)(?:\/(?:publish|archive|disable|delete|issue|cancel|correct|send|remind|import|import-preview|export))?)?|refunds(?:\/[0-9a-f-]{36}(?:\/(?:review|approve|reject|report-returned|cancel))?)?|reconciliation(?:\/(?:statement-preview|statement-import|settlement-link))?)$/i;
const extensionPath=/^(?:workspace-invites\/accept-invite|workspaces\/[0-9a-f-]{36}\/(?:automatic-webhook-secret|activity\/(?:audit|api|exports)|sandbox\/(?:scenarios|runs|reset)|exports(?:\/[0-9a-f-]{36}(?:\/download)?)?|billing(?:\/(?:free|usage|limits|quote|schedule|undo)|\/[0-9a-f-]{36}\/reconcile)?|reports(?:\/ledger)?|privacy(?:\/[0-9a-f-]{36}\/cancel)?|notifications(?:\/(?:[0-9a-f-]{36}|all)\/read)?|integrations(?:\/[0-9a-f-]{36}\/(?:enable|disable|edit))?|workspace-tools\/(?:team|settings|help|invite|resend-invite|revoke-invite|remove-member|change-role|grants|transfer-owner)(?:\/[0-9a-f-]{36})?))$/i;
async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
 const path = (await context.params).path.join("/");
 const read = request.method === "GET";
 if (!(read && (["session", "platform/access"].includes(path)||adminPlanPath.test(path)||adminWorkspaceRead.test(path))) && !workspacePath.test(path) && !operationPath.test(path) && !documentPath.test(path) && !extensionPath.test(path) && !mobilePath.test(path)&&!phonePath.test(path)&&!aiCreditPath.test(path)&&!aiRuntimePath.test(path)&&!crmPath.test(path)&&!commercePath.test(path))
  return Response.json({ code: "NOT_FOUND" }, { status: 404 });
 if((aiCreditPath.test(path)||aiRuntimePath.test(path))&&request.method!=="POST")return Response.json({code:"METHOD_NOT_ALLOWED"},{status:405});
 const intentPath=/^workspaces\/[0-9a-f-]{36}\/(?:payment-intents(?:\/[0-9a-f-]{36}(?:\/cancel)?)?|linked-sources)$/i.test(path);
 if(!read && !((path.endsWith("/settings")&&request.method==="PATCH") || ((commercePath.test(path)||crmPath.test(path)||intentPath||operationPath.test(path)||extensionPath.test(path)||mobilePath.test(path)||phonePath.test(path)||aiCreditPath.test(path)||aiRuntimePath.test(path))&&request.method==="POST") || (documentPath.test(path)&&["POST","PATCH"].includes(request.method))))
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
 // Paid Studio work is tied to the server-selected business, including stale tabs.
 if(commercePath.test(path)||crmPath.test(path)||path.endsWith("/ai/studio-test")||path.endsWith("/ai/knowledge-import")){
  try{
   const actor=await currentUser();if(!actor)return Response.json({code:"UNAUTHENTICATED"},{status:401});
   const selected=await preferredWorkspaceFor(actor.id);
   if(!selected||selected.id!==path.split("/")[1])return Response.json({code:"STALE_BUSINESS"},{status:409});
  }catch{return Response.json({code:"SOURCE_UNAVAILABLE"},{status:503});}
 }
 const sandboxTools=/^workspaces\/[0-9a-f-]{36}\/sandbox\//i.test(path);
 const base = goOrigin(sandboxTools);
 if (!base)
  return Response.json({ code: sandboxTools?"SANDBOX_TOOLS_UNAVAILABLE":"PROXY_CONFIG_INVALID" }, { status: 503 });
 const target = new URL("/v1/" + path, base);
 const incoming = new URL(request.url);
 for (const key of ["resource", "item", "source", "customer", "format", "environment", "capability", "cursor", "status", "account", "method", "from", "to", "q", "period", "page", "page_size", "filter"]) {
  if(incoming.searchParams.getAll(key).length>1)return Response.json({code:"INVALID_SCOPE"},{status:400});
  const value = incoming.searchParams.get(key);
  if (value) target.searchParams.set(key, value);
 }
 const body = read ? undefined : await boundedBody(request,path.endsWith("/ai/knowledge-import")?7340032:aiRuntimePath.test(path)?16384:documentPath.test(path)?1048576:path.endsWith("/inbox")?7340032:commercePath.test(path)?7340032:path.endsWith("/crm")?20000:path.endsWith("/comments")?65536:path.endsWith("/linked-sources")?16384:/\/workspace-tools\/settings$/i.test(path)?8192:4096);
 if (body === null)
  return Response.json({ code: "BODY_TOO_LARGE" }, { status: 413 });
 try {
  const upstream = await fetch(target, {
   method: request.method, body, cache: "no-store", redirect: "error",
   // Incoming mutation origin was validated above. Forward the configured
   // server origin; preview/local hostnames never become Go's trust policy.
   headers: { Cookie: "ekmivo-session=" + token, "Content-Type": "application/json",
    "Idempotency-Key": request.headers.get("Idempotency-Key") || "",
    Origin: process.env.GO_WEB_ORIGIN || "https://ekmivo-web-masharzys-projects.vercel.app" },
   signal: AbortSignal.timeout(aiRuntimePath.test(path)||commercePath.test(path)?50000:15000),
  });
  return new Response(await upstream.text(), { status: upstream.status,
   headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json", "Cache-Control": "private, no-store",...(upstream.headers.has("X-Correlation-ID")?{"X-Correlation-ID":upstream.headers.get("X-Correlation-ID")!}:{}),...(upstream.headers.has("Retry-After")?{"Retry-After":upstream.headers.get("Retry-After")!}:{}) } });
 } catch(error) {
  const correlation=crypto.randomUUID().replaceAll("-","").slice(0,24);
  // Templates and error classes only: never log credentials, URLs, query values or bodies.
  console.error("[go-proxy] upstream unavailable",{correlation,method:request.method,route:path.replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,"{id}"),reason:error instanceof Error?error.name:"UnknownError"});
  return Response.json({ code:"API_UNAVAILABLE",correlation_id:correlation },{status:503,headers:{"X-Correlation-ID":correlation,"Cache-Control":"private, no-store"}});
 }
}
export const GET = forward;
export const PATCH = forward;
export const POST = forward;
