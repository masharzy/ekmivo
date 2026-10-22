import type {Metadata} from "next";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor,hashToken,primaryStoreFor} from "../../../../../lib/server/auth";
import {database} from "../../../../../lib/server/db";
import {SubscriptionOrderSummary} from "../../../../../components/subscription-order-summary";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Review your order · Ekmivo",robots:{index:false,follow:false},referrer:"no-referrer"};
const opaque=/^[A-Za-z0-9_-]{43}$/;
export default async function SubscriptionOrderPage({params}:{params:Promise<{locale:string;plan:string}>}){
 const {locale,plan}=await params;
 if(locale!=="bn"&&locale!=="en")notFound();
 // Preserve existing published-plan deep links through Phase 4's durable
 // selection entry, without treating the old slug as a purchase capability.
 if(!opaque.test(plan)){
  if(/^[a-z][a-z0-9_-]{1,39}$/.test(plan))redirect(`/subscribe/${plan}`);
  notFound();
 }
 const user=await requireUser(locale);
 const workspace=await preferredWorkspaceFor(user.id);
 if(!workspace)redirect("/workspaces/open");
 if(workspace.role!=="owner"&&workspace.role!=="admin")redirect("/pricing");
 // Phase 4 owns the 256-bit public capability. Never route the caller-supplied
 // handle directly into a UUID-scoped Go operation or expose another Store.
 const primary=await primaryStoreFor(user.id);
 if(primary!==workspace.id)notFound();
 const rows=await database()`SELECT id FROM platform_subscription_purchase_intents
  WHERE public_token_sha256=${hashToken(plan)} AND actor_id=${user.id}::uuid
    AND workspace_id=${workspace.id}::uuid AND status IN ('selected','quoted','confirmed')
    AND (expires_at>now() OR status='confirmed') LIMIT 1`;
 if(!rows.length)notFound();
 return <SubscriptionOrderSummary locale={locale} intentId={String(rows[0].id)} storeId={workspace.id} storeName={workspace.name}/>;
}
