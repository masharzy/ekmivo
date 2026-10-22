import "server-only";
import {randomBytes} from "node:crypto";
import {cookies} from "next/headers";
import {database} from "./db";
import {currentUser,hashToken,preferredWorkspaceFor} from "./auth";
import {verificationEnabled} from "./email";
import {publicSubscriptionOffers} from "./public-subscription-offers";
import {newPurchaseSecret,derivePurchaseToken,purchaseCreationKey} from "../purchase-capability";

// No raw table DML/SELECT is executed by the browser-facing Next runtime.
// All privileged lifecycle transitions are atomic audited SECURITY DEFINER RPCs.
const GUEST="ekmivo-purchase-session";
const ACTIVE="ekmivo-purchase-current";
const COOKIE={httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",path:"/",maxAge:7*86400};
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const OFFER=/^[a-z][a-z0-9_-]{2,63}$/;
const IDEMPOTENCY=/^[A-Za-z0-9_-]{16,128}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export class IntentError extends Error{
 constructor(public code:string,public status=409){super(code);}
}
export type Intent={token:string;id:string;revision:number;status:string;expiresAt:string;actorId:string|null;storeId:string|null;
 offerKey:string;offerVersionId:string;gatewayPlanVersionId:string|null;product:"payments"|"ai_credit"|"bundle";term:"monthly"|"yearly"|"one_time";
 amountMinor:number;quantity:number;couponCode:string|null;legacyPlanId:string|null};
export function validPurchaseToken(value:string){return TOKEN.test(value)}
export async function ensureGuestSession(){
 const jar=await cookies(),old=jar.get(GUEST)?.value;
 if(old&&TOKEN.test(old))return old;
 const token=newPurchaseSecret();
 jar.set(GUEST,token,COOKIE);return token;
}
async function guestHash(){
 const g=(await cookies()).get(GUEST)?.value;
 return g&&TOKEN.test(g)?hashToken(g):null;
}
export async function activePurchase(){
 const a=(await cookies()).get(ACTIVE)?.value;
 return a&&TOKEN.test(a)?a:null;
}
export async function clearPurchaseIfActive(token:string){
 if(await activePurchase()===token)(await cookies()).delete(ACTIVE);
}
export async function rememberPurchase(token:string){
 if(!TOKEN.test(token))throw new IntentError("INVALID_INTENT",422);
 (await cookies()).set(ACTIVE,token,COOKIE);
}
const allowedErrors=new Set([
 "INVALID_INTENT_REQUEST","INVALID_SELECTION","INVALID_QUANTITY","LOGIN_REQUIRED",
 "OFFER_CHANGED","OFFER_UNAVAILABLE","COUPON_INVALID","COUPON_UNAVAILABLE",
 "IDEMPOTENCY_CONFLICT","INVALID_PLAN","INTENT_NOT_FOUND","INTENT_EXPIRED",
 "INVALID_REVISION","INTENT_STATE_CHANGED","STORE_NOT_AUTHORIZED",
 "FREE_CLAIM_DENIED","FREE_PLAN_CHANGED","FORBIDDEN"
]);
function mappedError(e:unknown):IntentError{
 const reason=e instanceof Error?e.message:"";
 const code=allowedErrors.has(reason)?reason:"PURCHASE_INTENT_UNAVAILABLE";
 return new IntentError(code,code==="INTENT_NOT_FOUND"?404:
  ["LOGIN_REQUIRED"].includes(code)?401:
  ["STORE_NOT_AUTHORIZED","FORBIDDEN"].includes(code)?403:
  code.startsWith("INVALID_")||code==="COUPON_INVALID"?422:
  code==="PURCHASE_INTENT_UNAVAILABLE"?503:409);
}
type Operation="create"|"read"|"bind_identity"|"bind_store"|"cancel"|"claim_free"|"revalidate";
async function command(operation:Operation,token:string,payload:Record<string,unknown>={},guest?:string|null){
 if(!TOKEN.test(token))throw new IntentError("INTENT_NOT_FOUND",404);
 const user=await currentUser();
 const digest=guest===undefined?await guestHash():guest;
 try{
  const rows=await database().unsafe(
   "SELECT platform_subscription_intent_command($1::text,$2::uuid,$3::text,$4::text,$5::jsonb) AS result",
   [operation,user?.id||null,digest||null,hashToken(token),JSON.stringify(payload)]
  );
  if(!rows[0]?.result||typeof rows[0].result!=="object")throw new Error("INVALID_SERVER_RESULT");
  return rows[0].result as Record<string,unknown>;
 }catch(e){throw mappedError(e)}
}
export async function createPurchase(input:{offerKey:string;term:string;versionId?:string;quantity?:number;coupon?:string;idempotencyKey?:string;legacyPlanId?:string}){
 const guest=await ensureGuestSession();
 if(!OFFER.test(input.offerKey)||!["monthly","yearly","one_time"].includes(input.term))
  throw new IntentError("INVALID_SELECTION",422);
 const quantity=input.quantity??1;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw new IntentError("INVALID_QUANTITY",422);
 if(input.idempotencyKey&&!IDEMPOTENCY.test(input.idempotencyKey))
  throw new IntentError("INVALID_IDEMPOTENCY_KEY",422);
 if(input.legacyPlanId&&!/^[a-z][a-z0-9_-]{1,39}$/.test(input.legacyPlanId))
  throw new IntentError("INVALID_PLAN",422);
 const coupon=input.coupon?.trim().toUpperCase()||"";
 if(coupon&&!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(coupon))
  throw new IntentError("COUPON_INVALID",422);
 const {offers,unavailable}=await publicSubscriptionOffers();
 if(unavailable)throw new IntentError("PURCHASE_INTENT_UNAVAILABLE",503);
 const offer=offers.find(o=>o.key===input.offerKey&&o.term===input.term);
 if(!offer)throw new IntentError("OFFER_UNAVAILABLE");
 if(input.versionId&&offer.version_id!==input.versionId)throw new IntentError("OFFER_CHANGED");
 if(offer.product==="payments"&&quantity!==1)throw new IntentError("INVALID_QUANTITY",422);
 const nonce=input.idempotencyKey||randomBytes(24).toString("base64url");
 const token=derivePurchaseToken(guest,nonce);
 await command("create",token,{
  offer_key:input.offerKey,term:input.term,version_id:offer.version_id,
  quantity,creation_key:purchaseCreationKey(guest,nonce),
  coupon_code:coupon,legacy_plan_id:input.legacyPlanId||null
 },hashToken(guest));
 await rememberPurchase(token);
 return token;
}
export async function readPurchase(token:string):Promise<Intent>{
 const p=await command("read",token);
 const date=new Date(String(p.expires_at));
 if(!Number.isFinite(date.valueOf())||!UUID.test(String(p.id))||!UUID.test(String(p.offer_version_id)))
  throw new IntentError("PURCHASE_INTENT_UNAVAILABLE",503);
 return {token,id:String(p.id),revision:Number(p.revision),
  actorId:p.actor_id?String(p.actor_id):null,storeId:p.workspace_id?String(p.workspace_id):null,
  status:date.getTime()<=Date.now()&&["selected","quoted"].includes(String(p.status))?"expired":String(p.status),
  expiresAt:date.toISOString(),offerKey:String(p.offer_key),offerVersionId:String(p.offer_version_id),
  gatewayPlanVersionId:p.gateway_plan_version_id?String(p.gateway_plan_version_id):null,
  product:p.product as Intent["product"],term:p.term as Intent["term"],
  amountMinor:Number(p.amount_minor),quantity:Number(p.requested_quantity),
  couponCode:p.coupon_code?String(p.coupon_code):null,legacyPlanId:p.legacy_plan_id?String(p.legacy_plan_id):null};
}
export async function bindIdentity(token:string){
 const u=await currentUser();
 if(!u)throw new IntentError("LOGIN_REQUIRED",401);
 if(!u.verified&&await verificationEnabled())throw new IntentError("VERIFICATION_REQUIRED",403);
 await command("bind_identity",token);
 return u;
}
export async function bindStore(token:string,storeId:string){
 if(!UUID.test(storeId))throw new IntentError("STORE_NOT_AUTHORIZED",403);
 await bindIdentity(token);
 await command("bind_store",token,{store_id:storeId});
 return readPurchase(token);
}
export async function resumePurchase(token:string){
 const user=await currentUser();
 if(!user)return {stage:"login" as const,intent:null};
 const current=await readPurchase(token);
 if(!["selected","quoted"].includes(current.status))throw new IntentError("INTENT_"+current.status.toUpperCase());
 if(!user.verified&&await verificationEnabled())return {stage:"verify" as const,intent:current};
 await bindIdentity(token);
 const store=await preferredWorkspaceFor(user.id);
 if(!store)return {stage:"store" as const,intent:current};
 const {onboardingState}=await import("./briofold-onboarding");
 const onboarding=await onboardingState(store,user.id);
 if(onboarding&&onboarding!=="complete")return {stage:"setup" as const,intent:current};
 if(store.role!=="owner"&&store.role!=="admin")throw new IntentError("BILLING_ACCESS_DENIED",403);
 const bound=await bindStore(token,store.id);
 await command("revalidate",token);
 return {stage:"summary" as const,intent:bound};
}
export async function cancelPurchase(token:string,revision:number){
 if(!TOKEN.test(token)||!Number.isSafeInteger(revision)||revision<1)
  throw new IntentError("INVALID_INTENT",422);
 const result=await command("cancel",token,{revision});
 await clearPurchaseIfActive(token);
 return {status:result.status==="cancelled"?"cancelled" as const:"cancelled" as const};
}
export async function claimFreePurchase(token:string){
 const user=await currentUser();
 if(!user||!user.verified)throw new IntentError("LOGIN_REQUIRED",401);
 const result=await command("claim_free",token);
 if(result.status!=="claimed_free")throw new IntentError("FREE_CLAIM_DENIED");
 return {status:"claimed_free" as const};
}
