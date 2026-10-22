import type {Metadata} from "next";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../../lib/server/auth";
import {SubscriptionOrderSummary} from "../../../../../components/subscription-order-summary";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Review your order · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export default async function SubscriptionOrderPage({params}:{params:Promise<{locale:string;intent:string}>}){
 const {locale,intent}=await params;
 if((locale!=="bn"&&locale!=="en")||!uuid.test(intent))notFound();
 const user=await requireUser(locale);
 const workspace=await preferredWorkspaceFor(user.id);
 if(!workspace)redirect("/workspaces/open");
 if(workspace.role!=="owner"&&workspace.role!=="admin")redirect("/pricing");
 return <SubscriptionOrderSummary locale={locale} intentId={intent} storeId={workspace.id} storeName={workspace.name}/>;
}
