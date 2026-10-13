import {notFound,redirect} from "next/navigation";
import {requireWorkspace} from "../../../../../../../lib/server/auth";
import {paymentContextFor} from "../../../../../../../lib/server/workspace-context";
import {PaymentOperations} from "../../../../../../../components/payment-operations";
import {PaymentDocuments} from "../../../../../../../components/payment-documents";
import {PaymentRefunds} from "../../../../../../../components/payment-refunds";
export const dynamic="force-dynamic";
const resources=["payments","incoming","gateways","devices","webhooks","events"] as const;
export default async function PaymentDetail({params,searchParams}:{params:Promise<{locale:string;workspaceId:string;section:string;serviceSection:string;resourceID:string}>;searchParams:Promise<{env?:string|string[]}>}){
 const p=await params,locale=p.locale==="en"?"en":"bn";
 const {user,workspace}=await requireWorkspace(locale,p.workspaceId);
 const document=["customers","payment-links","invoices"].includes(p.serviceSection);
 if(p.section!=="payments"||(!document&&p.serviceSection!=="refunds"&&!resources.includes(p.serviceSection as typeof resources[number]))||!/^[a-f0-9-]{36}$/.test(p.resourceID))notFound();
 const query=await searchParams;
 if(query.env!==undefined)redirect(`/w/${workspace.id}/payments/${p.serviceSection}/${p.resourceID}`);
 const context=await paymentContextFor(workspace,user.id,undefined);
 if(p.serviceSection==="refunds")return <PaymentRefunds locale={locale} workspaceId={workspace.id} environment={context.environment} detailId={p.resourceID} canManage={["owner","admin"].includes(workspace.role)}/>;
 if(document)return <PaymentDocuments userId={user.id} locale={locale} workspaceId={workspace.id} environment={context.environment} kind={p.serviceSection as "customers"|"invoices"|"payment-links"} detailId={p.resourceID} canWrite={workspace.role!=="viewer"} canManage={["owner","admin"].includes(workspace.role)}/>;
 return <><h1>{locale==="bn"?"Record-এর বিস্তারিত":"Record details"}</h1><PaymentOperations key={user.id+workspace.id+context.environment+p.resourceID} locale={locale} workspaceId={workspace.id} userId={user.id} environment={context.environment} resource={p.serviceSection as typeof resources[number]} detailId={p.resourceID} canManage={["owner","admin"].includes(workspace.role)}/></>;
}
