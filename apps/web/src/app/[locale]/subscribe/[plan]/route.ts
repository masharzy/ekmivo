import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {currentUser,preferredWorkspaceFor,workspacesFor,primaryStoreFor} from "../../../../lib/server/auth";
import {verificationEnabled} from "../../../../lib/server/email";
import {publicPaymentPlans} from "../../../../lib/server/payment-plans";
import {dashboardHref} from "../../../../lib/dashboard-navigation";
import {onboardingState} from "../../../../lib/server/briofold-onboarding";
import {createPurchase,activePurchase,readPurchase,IntentError} from "../../../../lib/server/purchase-intents";

// Legacy plans remain on the verified billing route while Phase 5 and Phase 6 are disabled.
const SELECTION_TTL=7*24*60*60;
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale,plan}=await params;
 if((locale!=="en"&&locale!=="bn")||!/^[a-z][a-z0-9_-]{1,63}$/.test(plan))return new Response(null,{status:404});
 const q=request.nextUrl.searchParams;
 const term=q.get("term")||"monthly";
 const coupon=q.get("coupon")||undefined;
 const versionId=q.get("version")||undefined;
 const quantity=q.has("quantity")?Number(q.get("quantity")):1;
 if(!["monthly","yearly","one_time"].includes(term)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)
  return NextResponse.redirect(new URL("/pricing?purchase=INVALID_SELECTION",request.url),303);
 const {plans,unavailable}=await publicPaymentPlans();
 const legacy=plans.find(p=>p.id===plan);
 // Back/forward and refresh may safely reuse the exact still-selected intent.
 // A different selection always gets a fresh intent and cannot mutate invoices.
 const existing=await activePurchase();
 if(existing){
  try{
   const state=await readPurchase(existing);
   if(state.status==="selected"&&state.offerKey===plan&&state.term===term&&
    state.quantity===quantity&&(!versionId||state.offerVersionId===versionId)&&
    (state.couponCode||"")===(coupon?.trim().toUpperCase()||""))
    return NextResponse.redirect(new URL(`/subscribe/resume/${existing}`,request.url),303);
  }catch{/* Other account, expired, revoked or invalid session: create a new selection. */}
 }
 // Phase 4 authoritative published offers. Never activate an offer by guessing
 // its amount, version or billing term from a marketing card.
 try{
  const token=await createPurchase({offerKey:plan,term,quantity,coupon,versionId,legacyPlanId:legacy?.id});
  return NextResponse.redirect(new URL(`/subscribe/resume/${token}`,request.url),303);
 }catch(error){
  const safeLegacy=Boolean(legacy&&term==="monthly"&&quantity===1&&!versionId&&!coupon);
  if(!safeLegacy){
   const code=error instanceof IntentError?error.code:"PURCHASE_INTENT_UNAVAILABLE";
   return NextResponse.redirect(new URL("/pricing?purchase="+encodeURIComponent(code),request.url),303);
  }
 }
 // Existing authorized deep links and payment-plan purchases are backward compatible.
 if(unavailable)return new Response("Pricing unavailable",{status:503});
 if(!legacy)return NextResponse.redirect(new URL("/pricing",request.url),303);
 const jar=await cookies(),user=await currentUser();
 if(!user){
  jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});
  return NextResponse.redirect(new URL("/login",request.url),303);
 }
 if(!user.verified&&await verificationEnabled()){
  jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});
  return NextResponse.redirect(new URL("/verify-email",request.url),303);
 }
 const requested=q.get("workspace");
 const primary=await primaryStoreFor(user.id);
 if(requested&&primary&&requested!==primary)return NextResponse.redirect(new URL("/pricing?purchase=STORE_NOT_AUTHORIZED",request.url),303);
 const workspace=requested?(await workspacesFor(user.id)).find(w=>w.id===requested):await preferredWorkspaceFor(user.id);
 if(!workspace){
  jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});
  return NextResponse.redirect(new URL("/workspaces",request.url),303);
 }
 const setup=await onboardingState(workspace,user.id);
 if(setup&&setup!=="complete"){
  jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});
  return NextResponse.redirect(new URL("/setup",request.url),303);
 }
 if(!["commerce","both"].includes(workspace.mode))return NextResponse.redirect(new URL("/pricing?status=store-payments-disabled",request.url),303);
 jar.delete("ekmivo-selected-plan");
 // Keep the existing verified billing path active until coupon, legal-consent
 // enforcement and the new order confirmation contract have passed release gates.
 return NextResponse.redirect(new URL(dashboardHref(locale,workspace.id,"payments","billing")+"?tab=plans&plan="+encodeURIComponent(plan),request.url),303);
}
