import "server-only";
import {cache} from "react";
import {database} from "./db";
import type {PlanTerms} from "../payment-plans";
export const workspacePlanFeatures=cache(async(workspaceId:string,environment:string):Promise<PlanTerms["features"]|null>=>{
 if(environment==="sandbox")return {invoices:true,payment_links:true,reports:true,exports:true};
 try{const [row]=await database()`SELECT payment_plan_effective(${workspaceId}::uuid) AS plan`;
 const f=row?.plan?.terms?.features;
 return {invoices:f?.invoices===true,payment_links:f?.payment_links===true,reports:f?.reports===true,exports:f?.exports===true};
 }catch{return null;}
});
export {sectionPlanFeature} from "../plan-features";
