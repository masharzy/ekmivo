import "server-only";
import {CustomerCRMPage} from "./customer-crm-page";
import {database} from "../lib/server/db";
import {CommerceWorkspace,type CommercePageData} from "./commerce-workspace";
export async function CommercePage(props:{workspaceId:string;actorId:string;bn:boolean;view:string;financeEnabled?:boolean;environment:"live"|"sandbox"}){
 const resource=props.view===""||["scan","to-chase"].includes(props.view)?"orders":props.view==="products-sync"?"products":props.view==="courier"?"delivery":props.view;
 let initial:CommercePageData|null=null;
 try{const [row]=props.view==="to-chase"
  ?await database()`SELECT commerce_read(${props.workspaceId}::uuid,${props.environment},${props.actorId}::uuid,${resource},NULL::uuid,0,'','draft','') AS data`
  :await database()`SELECT commerce_read(${props.workspaceId}::uuid,${props.environment},${props.actorId}::uuid,${resource}) AS data`;
  initial=row.data as CommercePageData;}catch{/* Explicit unavailable state; never substitute empty data. */}
 return <><CommerceWorkspace {...props} initial={initial}
   assignmentEnabled={process.env.BRIOFOLD_COMMERCE_ASSIGNMENTS_ENABLED==="true"}
   scanEnabled={process.env.BRIOFOLD_COMMERCE_SCAN_ENABLED==="true"}
   productAnalyticsEnabled={process.env.BRIOFOLD_COMMERCE_PRODUCT_ANALYTICS_ENABLED==="true"}/>
  {props.view==="to-chase"&&process.env.BRIOFOLD_UNCONVERTED_INTEREST_ENABLED==="true"&&<CustomerCRMPage workspaceId={props.workspaceId} actorId={props.actorId} bn={props.bn} view="interest" embedded financeEnabled={props.financeEnabled??false} environment={props.environment}/>}</>;
}
