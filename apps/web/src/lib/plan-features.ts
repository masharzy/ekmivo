import type {PlanTerms} from "./payment-plans";
export type PlanFeature=keyof PlanTerms["features"];
// One-time requests are core checkout, separate from reusable payment links.
export const sectionPlanFeature:Partial<Record<string,PlanFeature>>={invoices:"invoices","payment-links":"payment_links",reports:"reports"};
export function planSectionAllowed(section:string,features:PlanTerms["features"]|null|undefined){
 const feature=sectionPlanFeature[section];
 return !feature||features?.[feature]===true;
}
