import {cookies} from "next/headers";
import {NextRequest,NextResponse} from "next/server";
import {googleConfiguration,openGoogleFlow,verifyGoogleIdToken} from "../../../../../lib/google-oidc";
import {googleAccount,googleFlowCookie} from "../../../../../lib/server/google-auth";
import {createSession,currentUser} from "../../../../../lib/server/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const config=googleConfiguration();
 const origin=config?.origin||request.nextUrl.origin;
 let destination="/login",reason="failed";
 const finish=(path:string)=>{
  const response=NextResponse.redirect(new URL(path,origin),303);
  response.headers.set("Cache-Control","no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
 };
 const jar=await cookies(),value=jar.get(googleFlowCookie)?.value;
 jar.delete(googleFlowCookie);
 if(!config)return finish("/login?google=unavailable");
 try{
  const params=request.nextUrl.searchParams;
  if(request.nextUrl.origin!==config.origin||params.getAll("state").length!==1||params.getAll("code").length>1||params.getAll("error").length>1||!value)throw Error("GOOGLE_STATE_INVALID");
  const flow=await openGoogleFlow(value,params.get("state")||"",config.secret,config.origin);
  destination=flow.mode==="link"?"/account":"/login";
  if(params.has("error"))return finish(destination+"?google=cancelled");
  const code=params.get("code");if(!code||code.length>4096)throw Error("GOOGLE_CODE_INVALID");
  if(flow.mode==="signin"&&await currentUser())return finish("/workspaces/open");
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(10000),headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code,code_verifier:flow.verifier,grant_type:"authorization_code",redirect_uri:config.callback})});
  if(!response.ok)throw Error("GOOGLE_EXCHANGE_FAILED");
  const body:unknown=await response.json();
  if(!body||typeof body!=="object"||!("id_token" in body)||typeof body.id_token!=="string"||body.id_token.length>16384)throw Error("GOOGLE_TOKEN_INVALID");
  const identity=await verifyGoogleIdToken(body.id_token,flow.nonce,config.clientId);
  const account=await googleAccount(flow,identity);
  if(account.linked)return finish("/account?google=connected");
  // Reuses password login's session path, including trusted-device/MFA rules.
  await createSession(account.userId);
  return finish("/workspaces/open");
 }catch(error){
  const code=error instanceof Error?error.message:"";
  if(code==="GOOGLE_LINK_REQUIRED")reason="link-required";
  else if(code==="GOOGLE_REAUTH_REQUIRED")reason="reauth";
  else if(code==="GOOGLE_EMAIL_MISMATCH")reason="email-mismatch";
  else if(code==="GOOGLE_EMAIL_SIGNUP_REQUIRED")reason="email-signup";
  // Never log authorization codes, tokens, provider responses or user emails.
  console.error("[google login]",reason);
  return finish(destination+"?google="+reason);
 }
}
