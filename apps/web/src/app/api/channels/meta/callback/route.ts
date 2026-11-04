import { cookies } from "next/headers";
import { goOrigin } from "../../../../../lib/server/go-origin";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  NO_AUTHORIZED_CHANNEL_ACCOUNTS: "Meta did not return a channel account. For Instagram, select a Facebook Page linked to your professional account. For WhatsApp, select a Business Account with a phone number.",
  CHANNEL_AUTHORIZATION_REJECTED: "Meta rejected the login authorization. Start again from Channels and complete the permissions step.",
  CHANNEL_SUBSCRIPTION_UNAVAILABLE: "Meta authorized the account, but could not activate its message subscription.",
  COMMENT_SUBSCRIPTION_UNAVAILABLE: "Meta authorized the account, but could not activate its comment subscription.",
  OAUTH_STATE_REJECTED: "This connection session expired or was already used. Start again from Channels.",
  CHANNEL_NOT_CONFIGURED: "The platform Meta settings are incomplete.",
  CHANNEL_UNAVAILABLE: "Briofold could not retrieve the authorized account from Meta.",
  CHANNEL_TOKEN_UNAVAILABLE: "Meta did not provide access for the selected account.",
  UNAUTHENTICATED: "Sign in to complete the connection.",
};

function connectionError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const token = (await cookies()).get("ekmivo-session")?.value;
  if (!token) return connectionError(errors.UNAUTHENTICATED, 401);
  const base = goOrigin(false);
  if (!base) return connectionError("Connection service is unavailable.", 503);
  const incoming = new URL(request.url);
  const target = new URL("/v1/channels/meta/callback", base);
  if (incoming.searchParams.has("error")) {
    return connectionError("Meta did not grant access. Return to Channels and complete the authorization.", 400);
  }
  for (const key of ["code", "state"]) {
    const value = incoming.searchParams.get(key);
    if (!value || value.length > 4096) return connectionError("Connection was not completed. Start again from Channels.", 400);
    target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, {
      headers: { Cookie: `ekmivo-session=${token}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code = result?.error?.code;
      const message = typeof code === "string" && Object.hasOwn(errors, code) ? errors[code] : "Connection service could not complete the request. Return to Channels and retry.";
      return connectionError(message, response.status);
    }
    if (!/^[0-9a-f-]{36}$/i.test(result?.workspace_id)) throw new Error("Invalid connection response");
    return Response.redirect(new URL("/settings/channels?connected=1", incoming.origin), 303);
  } catch {
    return connectionError("Connection service is unavailable. Please try again.", 503);
  }
}
