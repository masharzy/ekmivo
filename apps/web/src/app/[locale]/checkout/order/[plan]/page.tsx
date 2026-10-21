import type {Metadata} from "next";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../../lib/server/auth";
import {publicPaymentPlans} from "../../../../../lib/server/payment-plans";
import {SubscriptionOrderSummary} from "../../../../../components/subscription-order-summary";
import {safePolicyUrl} from "../../../../../lib/subscription-order";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Review your order · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};

export default async function SubscriptionOrderPage({params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale,plan}=await params;
 if((locale!=="bn"&&locale!=="en")||!/^[a-z][a-z0-9_-]{1,39}$/.test(plan))notFound();
 const user=await requireUser(locale);
 const [{plans,unavailable},workspace]=await Promise.all([publicPaymentPlans(),preferredWorkspaceFor(user.id)]);
 if(unavailable)throw new Error("Public pricing is unavailable");
 const selected=plans.find(item=>item.id===plan);
 if(!selected)notFound();
 if(selected.terms.kind==="custom")redirect("/pricing");
 if(!workspace||!(["commerce","both"] as string[]).includes(workspace.mode))redirect("/workspaces/open");
 if(workspace.role!=="owner"&&workspace.role!=="admin")redirect("/pricing");
 return <SubscriptionOrderSummary
  locale={locale} plan={selected} storeId={workspace.id} storeName={workspace.name} purchaseEnabled={false}
  legalLinks={{terms:safePolicyUrl(process.env.EKMIVO_TERMS_URL),privacy:safePolicyUrl(process.env.EKMIVO_PRIVACY_URL),refund:safePolicyUrl(process.env.EKMIVO_REFUND_URL)}}
 />;
}
