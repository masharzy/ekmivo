import "server-only";
import {database} from "../lib/server/db";
import {CustomerCRM,type CRMList} from "./customer-crm";
export async function CustomerCRMPage(props:{workspaceId:string;actorId:string;bn:boolean;view:string;financeEnabled:boolean;environment:"live"|"sandbox"}){
 let initial:CRMList|null=null;
 try{const [row]=await database()`SELECT briofold_customers_read(${props.workspaceId}::uuid,${props.environment},${props.actorId}::uuid,NULL::uuid,0,'',${props.view==="follow-ups"?"due":""}) AS data`;initial=row.data as CRMList;}catch{/* Explicit unavailable state, never a fabricated empty result. */}
 return <CustomerCRM {...props} initial={initial}/>;
}
