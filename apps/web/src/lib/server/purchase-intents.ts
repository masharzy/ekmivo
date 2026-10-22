import "server-only";
import {randomBytes} from "node:crypto";
import {newPurchaseSecret,derivePurchaseToken,purchaseCreationKey} from "../purchase-capability";
import {cookies} from "next/headers";
import {database} from "./db";
import {currentUser,hashToken,preferredWorkspaceFor,primaryStoreFor} from "./auth";
import {verificationEnabled} from "./email";

const GUEST="ekmivo-purchase-session";
const ACTIVE="ekmivo-purchase-current";
const COOKIE={httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",path:"/",maxAge:7*86400};
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const OFFER=/^[a-z][a-z0-9_-]{2,63}$/;
const IDEMPOTENCY=/^[A-Za-z0-9_-]{16,128}$/;
export class IntentError extends Error{
 constructor(public code:string,public status=409){super(code);}
}
export type Intent={token:string;id:string;revision:number;status:string;expiresAt:string;actorId:string|null;storeId:string|null;
 offerKey:string;offerVersionId:string;product:"payments"|"ai_credit"|"bundle";term:"monthly"|"yearly"|"one_time";
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
async function offerLookup(key:string,term:string){
 if(!OFFER.test(key)||!["monthly","yearly","one_time"].includes(term))throw new IntentError("INVALID_SELECTION",422);
 const rows=await database()`
  SELECT o.offer_key,o.product,v.id AS version_id,v.term,v.amount_minor
  FROM platform_subscription_offers o JOIN platform_subscription_offer_versions v
    ON v.id=o.current_version_id AND v.offer_key=o.offer_key
  WHERE o.offer_key=${key} AND o.status='published' AND v.term=${term}`;
 if(!rows.length)throw new IntentError("OFFER_UNAVAILABLE");
 return rows[0];
}
async function couponLookup(code:string|undefined,offerKey:string){
 if(!code)return null;
 const value=code.trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value))throw new IntentError("COUPON_INVALID",422);
 // Preliminary eligibility only; Phase 3 must revalidate on every quote/confirm.
 const rows=await database()`
  SELECT id FROM platform_subscription_coupons WHERE code_normalized=${value}
    AND status='active' AND (starts_at IS NULL OR starts_at<=now())
    AND (expires_at IS NULL OR expires_at>now())
    AND (cardinality(eligible_offer_keys)=0 OR ${offerKey}=ANY(eligible_offer_keys))`;
 if(!rows.length)throw new IntentError("COUPON_UNAVAILABLE");
 return String(rows[0].id);
}
export async function createPurchase(input:{offerKey:string;term:string;versionId?:string;quantity?:number;coupon?:string;idempotencyKey?:string;legacyPlanId?:string}){
 const guest=await ensureGuestSession(),user=await currentUser();
 const [offer,coupon]=await Promise.all([offerLookup(input.offerKey,input.term),couponLookup(input.coupon,input.offerKey)]);
 if(input.versionId&&input.versionId!==String(offer.version_id))throw new IntentError("OFFER_CHANGED");
 const quantity=input.quantity??1;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000||(offer.product==="payments"&&quantity!==1))
  throw new IntentError("INVALID_QUANTITY",422);
 if(input.legacyPlanId&&!/^[a-z][a-z0-9_-]{1,39}$/.test(input.legacyPlanId))throw new IntentError("INVALID_PLAN",422);
 if(input.idempotencyKey&&!IDEMPOTENCY.test(input.idempotencyKey))throw new IntentError("INVALID_IDEMPOTENCY_KEY",422);
 // A stable 256-bit capability allows safe recovery after a lost POST response.
 // Its secret is the original 256-bit HttpOnly guest session, never a user ID.
 const nonce=input.idempotencyKey||randomBytes(24).toString("base64url");
 const token=derivePurchaseToken(guest,nonce);
 const key=purchaseCreationKey(guest,nonce);
 const rows=await database()`
  INSERT INTO platform_subscription_purchase_intents
  (public_token_sha256,guest_session_sha256,actor_id,offer_version_id,coupon_id,
    requested_quantity,legacy_plan_id,creation_key,expires_at)
  VALUES (${hashToken(token)},${hashToken(guest)},${user?.id||null}::uuid,
    ${String(offer.version_id)}::uuid,${coupon}::uuid,${quantity},
    ${input.legacyPlanId||null},${key},now()+interval '7 days')
  ON CONFLICT (creation_key) DO NOTHING RETURNING id`;
 if(!rows.length){
  const prior=await database()`
   SELECT public_token_sha256,guest_session_sha256,actor_id,offer_version_id,coupon_id,requested_quantity,legacy_plan_id
   FROM platform_subscription_purchase_intents WHERE creation_key=${key}`;
  const p=prior[0],active=await activePurchase();
  if(!p||p.guest_session_sha256!==hashToken(guest)||p.offer_version_id!==String(offer.version_id)||
    p.coupon_id!==coupon||Number(p.requested_quantity)!==quantity||
    p.legacy_plan_id!==(input.legacyPlanId||null)||(p.actor_id&&String(p.actor_id)!==user?.id))
   throw new IntentError("IDEMPOTENCY_CONFLICT");
  if(hashToken(token)===p.public_token_sha256){await rememberPurchase(token);return token;}
  if(active&&hashToken(active)===p.public_token_sha256)return active;
  throw new IntentError("RETRY_USING_ORIGINAL_INTENT");
 }
 await rememberPurchase(token);
 return token;
}
export async function readPurchase(token:string):Promise<Intent>{
 if(!TOKEN.test(token))throw new IntentError("INTENT_NOT_FOUND",404);
 const [user,guest]=await Promise.all([currentUser(),guestHash()]);
 const rows=await database()`
  SELECT i.id,i.actor_id,i.workspace_id,i.revision,i.status,i.expires_at,
   i.guest_session_sha256,i.requested_quantity,i.legacy_plan_id,
   v.id AS version_id,v.offer_key,v.term,v.amount_minor,o.product,c.code_normalized
  FROM platform_subscription_purchase_intents i
  JOIN platform_subscription_offer_versions v ON v.id=i.offer_version_id
  JOIN platform_subscription_offers o ON o.offer_key=v.offer_key
  LEFT JOIN platform_subscription_coupons c ON c.id=i.coupon_id
  WHERE i.public_token_sha256=${hashToken(token)}`;
 const p=rows[0];
 if(!p||(p.actor_id?String(p.actor_id)!==user?.id:!guest||p.guest_session_sha256!==guest))
  throw new IntentError("INTENT_NOT_FOUND",404);
 const expiry=new Date(String(p.expires_at));
 return {token,id:String(p.id),actorId:p.actor_id?String(p.actor_id):null,storeId:p.workspace_id?String(p.workspace_id):null,
  revision:Number(p.revision),status:expiry.getTime()<=Date.now()&&["selected","quoted"].includes(String(p.status))?"expired":String(p.status),
  expiresAt:expiry.toISOString(),offerKey:String(p.offer_key),offerVersionId:String(p.version_id),
  product:p.product as Intent["product"],term:p.term as Intent["term"],amountMinor:Number(p.amount_minor),
  quantity:Number(p.requested_quantity),couponCode:p.code_normalized?String(p.code_normalized):null,
  legacyPlanId:p.legacy_plan_id?String(p.legacy_plan_id):null};
}
export async function bindIdentity(token:string){
 const u=await currentUser();
 if(!u)throw new IntentError("LOGIN_REQUIRED",401);
 if(!u.verified&&await verificationEnabled())throw new IntentError("VERIFICATION_REQUIRED",403);
 const g=await guestHash();
 const rows=await database()`
  UPDATE platform_subscription_purchase_intents
  SET actor_id=${u.id}::uuid,revision=revision+CASE WHEN actor_id IS NULL THEN 1 ELSE 0 END,updated_at=now()
  WHERE public_token_sha256=${hashToken(token)} AND status='selected' AND expires_at>now()
   AND (actor_id=${u.id}::uuid OR (actor_id IS NULL AND guest_session_sha256=${g}))
  RETURNING id`;
 if(!rows.length)throw new IntentError("INTENT_NOT_FOUND",404);
 return u;
}
export async function bindStore(token:string,storeId:string){
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(storeId))throw new IntentError("STORE_NOT_AUTHORIZED",403);
 const u=await bindIdentity(token),primary=await primaryStoreFor(u.id);
 if(primary&&primary!==storeId)throw new IntentError("STORE_NOT_AUTHORIZED",403);
 const rows=await database()`
  UPDATE platform_subscription_purchase_intents i
  SET workspace_id=${storeId}::uuid,revision=revision+CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END,updated_at=now()
  WHERE i.public_token_sha256=${hashToken(token)} AND i.actor_id=${u.id}::uuid
   AND (i.workspace_id IS NULL OR i.workspace_id=${storeId}::uuid)
   AND i.status='selected' AND i.expires_at>now()
   AND EXISTS (SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=${storeId}::uuid AND m.user_id=${u.id}::uuid
        AND m.role IN ('owner','admin') AND u.disabled_at IS NULL)
  RETURNING id`;
 if(!rows.length)throw new IntentError("STORE_NOT_AUTHORIZED",403);
 return readPurchase(token);
}
export async function resumePurchase(token:string){
 const signedIn=await currentUser();
 // Do not expose an owned purchase to an anonymous visitor; send them to login first.
 // Ownership is enforced after authentication on the subsequent GET.
 if(!signedIn)return {stage:"login" as const,intent:null};
 const current=await readPurchase(token);
 if(current.status!=="selected")throw new IntentError("INTENT_"+current.status.toUpperCase());
 const user=await currentUser();
 if(!user)return {stage:"login" as const,intent:current};
 if(!user.verified&&await verificationEnabled())return {stage:"verify" as const,intent:current};
 await bindIdentity(token);
 const store=await preferredWorkspaceFor(user.id);
 if(!store)return {stage:"store" as const,intent:current};
 const {onboardingState}=await import("./briofold-onboarding");
 const onboarding=await onboardingState(store,user.id);
 if(onboarding&&onboarding!=="complete")return {stage:"setup" as const,intent:current};
 if(store.role!=="owner"&&store.role!=="admin")throw new IntentError("BILLING_ACCESS_DENIED",403);
 const bound=await bindStore(token,store.id);
 const live=await offerLookup(bound.offerKey,bound.term);
 if(String(live.version_id)!==bound.offerVersionId)throw new IntentError("OFFER_CHANGED");
 if(bound.couponCode)await couponLookup(bound.couponCode,bound.offerKey);
 return {stage:"summary" as const,intent:bound};
}
export async function cancelPurchase(token:string,revision:number){
 if(!TOKEN.test(token)||!Number.isSafeInteger(revision)||revision<1)throw new IntentError("INVALID_INTENT",422);
 const [u,g]=await Promise.all([currentUser(),guestHash()]);
 const rows=await database()`
  UPDATE platform_subscription_purchase_intents
  SET status='cancelled',revision=revision+1,updated_at=now()
  WHERE public_token_sha256=${hashToken(token)} AND revision=${revision}
   AND status='selected' AND expires_at>now()
   AND (actor_id=${u?.id||null}::uuid OR (actor_id IS NULL AND guest_session_sha256=${g}))
  RETURNING id`;
 if(!rows.length)throw new IntentError("INTENT_STATE_CHANGED");
 await clearPurchaseIfActive(token);
 return {status:"cancelled" as const};
}

/** Claim exactly one current free Payments entitlement with no paid invoice. */
export async function claimFreePurchase(token:string){
 const intent=await readPurchase(token);
 if(intent.status==="claimed_free")return {status:"claimed_free" as const};
 if(intent.status!=="selected"||!intent.actorId||!intent.storeId||
  intent.product!=="payments"||intent.amountMinor!==0||intent.quantity!==1||
  intent.couponCode)throw new IntentError("FREE_CLAIM_NOT_ALLOWED");
 const user=await currentUser();
 if(!user||user.id!==intent.actorId||!user.verified)throw new IntentError("INTENT_NOT_FOUND",404);
 const live=await offerLookup(intent.offerKey,intent.term);
 if(String(live.version_id)!==intent.offerVersionId)throw new IntentError("OFFER_CHANGED");
 const {publicPaymentPlans}=await import("./payment-plans");
 const catalog=await publicPaymentPlans();
 const plan=catalog.plans.find(p=>p.version_id===intent.offerVersionId&&p.terms.kind==="free");
 if(catalog.unavailable||!plan)throw new IntentError("FREE_PLAN_UNAVAILABLE");
 return database().begin(async tx=>{
  const rows=await tx`
   SELECT revision,status FROM platform_subscription_purchase_intents
    WHERE id=${intent.id}::uuid AND actor_id=${user.id}::uuid
      AND workspace_id=${intent.storeId}::uuid AND expires_at>now() FOR UPDATE`;
  if(rows[0]?.status==="claimed_free")return {status:"claimed_free" as const};
  if(rows[0]?.status!=="selected"||Number(rows[0]?.revision)!==intent.revision)
   throw new IntentError("INTENT_STATE_CHANGED");
  const permission=await tx`
   SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
   WHERE m.user_id=${user.id}::uuid AND m.workspace_id=${intent.storeId}::uuid
    AND m.role IN ('owner','admin') AND u.disabled_at IS NULL`;
  if(!permission.length)throw new IntentError("BILLING_ACCESS_DENIED",403);
  // Existing verified billing SQL owns entitlement and subscription conflicts.
  await tx`SELECT payment_plan_claim_free(${intent.storeId}::uuid,${user.id}::uuid,${plan.id})`;
  await tx`UPDATE platform_subscription_purchase_intents
   SET status='claimed_free',revision=revision+1,updated_at=now() WHERE id=${intent.id}::uuid`;
  await tx`INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action)
    VALUES(${intent.id}::uuid,${user.id}::uuid,'free_claimed')`;
  return {status:"claimed_free" as const};
 });
}
