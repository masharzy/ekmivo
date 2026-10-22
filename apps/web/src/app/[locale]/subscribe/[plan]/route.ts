import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {currentUser,preferredWorkspaceFor,workspacesFor} from "../../../../lib/server/auth";
import {verificationEnabled} from "../../../../lib/server/email";
import {publicPaymentPlans} from "../../../../lib/server/payment-plans";
import {dashboardHref} from "../../../../lib/dashboard-navigation";
import {onboardingState} from "../../../../lib/server/briofold-onboarding";
const SELECTION_TTL=7*24*60*60;
export async function GET(request:Request,{params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale,plan}=await params;if(!["en","bn"].includes(locale)||!/^[a-z][a-z0-9_-]{1,39}$/.test(plan))return new Response(null,{status:404});
 const {plans,unavailable}=await publicPaymentPlans();if(unavailable)return new Response("Pricing unavailable",{status:503});
 const chosen=plans.find(p=>p.id===plan),jar=await cookies();if(!chosen){jar.delete("ekmivo-selected-plan");return NextResponse.redirect(new URL(`/${locale}/pricing`,request.url))}
 const user=await currentUser();
 if(!user){jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});return NextResponse.redirect(new URL(`/${locale}/login`,request.url))}
 if(!user.verified&&await verificationEnabled()){jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});return NextResponse.redirect(new URL(`/${locale}/verify-email`,request.url))}
 const requested=new URL(request.url).searchParams.get("workspace");
 const workspace=requested?(await workspacesFor(user.id)).find(w=>w.id===requested):await preferredWorkspaceFor(user.id);
 if(!workspace){jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});return NextResponse.redirect(new URL(`/${locale}/workspaces`,request.url))}
 const setup=await onboardingState(workspace,user.id);
 if(setup&&setup!=="complete"){
  jar.set("ekmivo-selected-plan",plan,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:SELECTION_TTL,path:"/"});
  return NextResponse.redirect(new URL(`/${locale}/setup`,request.url));
 }
 if(!["commerce","both"].includes(workspace.mode))return NextResponse.redirect(new URL(`/${locale}/pricing?status=store-payments-disabled`,request.url));
 jar.delete("ekmivo-selected-plan");
 // Keep the existing verified billing path active until coupon, legal-consent
 // enforcement and the new order confirmation contract have passed release gates.
 return NextResponse.redirect(new URL(dashboardHref(locale as "en"|"bn",workspace.id,"payments","billing")+"?tab=plans&plan="+encodeURIComponent(plan),request.url));
}
