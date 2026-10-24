import {dashboardHref,sectionInService,serviceEnabled,type Service} from "./dashboard-navigation";
import {sections,type SectionKey} from "./dashboard-sections";
import {unifiedFinancialDetailPath,type BusinessMode,type UnifiedFinancialResource} from "./unified-navigation";

export type LegacyDashboardQuery=Record<string,string|string[]|undefined>;
const queryKeys=new Set(["plan","thread","request","view","q","page","cursor","status","from","to","range","tab","filter","channel","type","read","source","kind","stage","temperature","assignee"]);
export function legacyDashboardPath(mode:BusinessMode,service:string,section:string,resourceID?:string,query:LegacyDashboardQuery={}):string|null{
 if(mode==="off"||(service!=="ai"&&service!=="payments")||!serviceEnabled(service,mode))return null;
 let target:string|null=null;
 if(resourceID){
  if(service!=="payments")return null;
  const resources:Record<string,UnifiedFinancialResource>={payments:"payments",transactions:"payments",incoming:"incoming",gateways:"gateways",devices:"devices",webhooks:"webhooks",events:"events",customers:"customers",invoices:"invoices","payment-links":"payment-links",refunds:"refunds"};
  if(!Object.hasOwn(resources,section))return null;
  target=unifiedFinancialDetailPath(resources[section],resourceID);
 }else{
  if(section==="payments"&&service==="payments")section="transactions";
  if(!Object.hasOwn(sections,section)||!sectionInService(service,section))return null;
  target=service==="payments"&&section==="settings"?"/settings/business":dashboardHref("en","",service as Service,section as SectionKey);
 }
 if(!target)return null;
 const url=new URL(target,"https://business.invalid");
 for(const [key,value] of Object.entries(query)){
  if(!queryKeys.has(key)||value===undefined||url.searchParams.has(key))continue;
  for(const item of Array.isArray(value)?value:[value])if(item.length<=500)url.searchParams.append(key,item);
 }
 return url.pathname+url.search+url.hash;
}
