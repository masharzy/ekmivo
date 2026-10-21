import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../lib/server/auth";
import {onboardingState} from "../../../lib/server/briofold-onboarding";
import {publicPaymentPlans} from "../../../lib/server/payment-plans";
import {cookies} from "next/headers";
import {BriofoldOnboardingClient} from "../../../components/briofold-onboarding-client";

export const dynamic="force-dynamic";
export default async function BriofoldSetup({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;
 const locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const workspace=await preferredWorkspaceFor(user.id);
 if(!workspace)redirect("/workspaces");
 const step=await onboardingState(workspace,user.id);
 if(!step||step==="complete")redirect("/workspaces/open");
 const selected=(await cookies()).get("ekmivo-selected-plan")?.value||"";
 const catalogue=step==="billing"&&workspace.mode!=="ai"?await publicPaymentPlans():{plans:[],unavailable:false};
 const plans=catalogue.plans.filter(p=>p.terms.kind!=="custom").map(p=>({
  id:p.id,name:locale==="bn"&&p.terms.name_bn?p.terms.name_bn:p.terms.name,
  description:locale==="bn"&&p.terms.description_bn?p.terms.description_bn:p.terms.description,
  kind:p.terms.kind,price:p.terms.kind==="free"?"Free":new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(p.terms.amount_minor/100)
 }));
 return <BriofoldOnboardingClient key={workspace.id+step} locale={locale} step={step}
    businessId={workspace.id} mode={workspace.mode} businessName={workspace.name} plans={plans}
    selectedPlan={selected}
    gatewayPlansUnavailable={catalogue.unavailable||plans.length===0}/>;
}
