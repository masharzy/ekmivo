/** Pricing page catalog: published offers joined to their Gateway plan terms. Money stays integer paisa. */
import type {PublishedSubscriptionOffer} from "./public-subscription-offers";
import type {PaymentPlan,PlanTerms} from "./payment-plans";

export type PricingTermOption={key:string;versionId:string|null;amountMinor:number;href:string};
export type PricingPlan={
 id:string;name:string;nameBn:string;description:string;descriptionBn:string;
 free:boolean;custom:boolean;contactUrl:string;
 monthly:PricingTermOption|null;yearly:PricingTermOption|null;
 bullets:{en:string;bn:string}[];
};

const nf=(n:number,bn:boolean)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(n);
function bullets(t:PlanTerms|undefined):{en:string;bn:string}[]{
 if(!t)return [];
 const out:{en:string;bn:string}[]=[];
 const per=t.quota_period==="calendar"||t.period_days===30;
 if(t.payment_limit===null)out.push({en:"Unlimited successful payments",bn:"সীমাহীন সফল পেমেন্ট"});
 else out.push({en:`${nf(t.payment_limit,false)} successful payments${per?" a month":""}`,bn:`${per?"মাসে ":""}${nf(t.payment_limit,true)}টা সফল পেমেন্ট`});
 const lim=(v:number|null,en:string,bn:string)=>v===null?{en:`Unlimited ${en}`,bn:`সীমাহীন ${bn}`}:{en:`${nf(v,false)} ${en}`,bn:`${nf(v,true)}টা ${bn}`};
 out.push(lim(t.limits.devices,"devices","ডিভাইস"));
 out.push(lim(t.limits.team_members,"team members","টিম সদস্য"));
 out.push(lim(t.limits.api_keys,"live API keys","Live API key"));
 const f=t.features;
 const names=[f.invoices&&["invoices","ইনভয়েস"],f.payment_links&&["payment links","পেমেন্ট লিংক"],f.reports&&["reports","রিপোর্ট"],f.exports&&["exports","এক্সপোর্ট"]].filter(Boolean) as string[][];
 if(names.length)out.push({en:names.map(n=>n[0]).join(", ").replace(/^./,c=>c.toUpperCase()),bn:names.map(n=>n[1]).join(", ")});
 return out;
}

/** Payment plans for the pricing page: published offers first, then legacy plans no offer replaces. */
export function pricingPlans(offers:readonly PublishedSubscriptionOffer[],plans:readonly PaymentPlan[]):PricingPlan[]{
 const byVersion=new Map(plans.map(p=>[p.version_id,p]));
 const groups=new Map<string,{monthly?:PublishedSubscriptionOffer;yearly?:PublishedSubscriptionOffer}>();
 for(const o of offers){
  if(o.product!=="payments"||!o.gateway_plan_version_id||(o.term!=="monthly"&&o.term!=="yearly"))continue;
  const g=groups.get(o.gateway_plan_version_id)||{};
  if(g[o.term])continue; // ambiguous duplicates: keep the first, never merge prices
  g[o.term]=o;groups.set(o.gateway_plan_version_id,g);
 }
 const option=(o:PublishedSubscriptionOffer|undefined):PricingTermOption|null=>o?{key:o.key,versionId:o.version_id,amountMinor:Number(o.amount_minor),
  href:`/subscribe/${encodeURIComponent(o.key)}?term=${o.term}&version=${encodeURIComponent(o.version_id)}`}:null;
 const out:PricingPlan[]=[];
 for(const [version,g] of groups){
  const base=g.monthly||g.yearly!;
  const terms=byVersion.get(version)?.terms;
  out.push({id:version,name:base.name,nameBn:base.name_bn||base.name,description:base.description||terms?.description||"",descriptionBn:base.description_bn||terms?.description_bn||"",
   free:false,custom:false,contactUrl:"",monthly:option(g.monthly),yearly:option(g.yearly),bullets:bullets(terms)});
 }
 for(const p of plans){
  if(groups.has(p.version_id))continue;
  const t=p.terms;
  out.push({id:p.version_id,name:t.name,nameBn:t.name_bn||t.name,description:t.description,descriptionBn:t.description_bn,
   free:t.kind==="free",custom:t.kind==="custom",contactUrl:t.contact_url,
   monthly:t.kind==="custom"?null:{key:p.id,versionId:null,amountMinor:t.amount_minor,href:`/subscribe/${encodeURIComponent(p.id)}`},
   yearly:null,bullets:bullets(t)});
 }
 const price=(p:PricingPlan)=>p.monthly?.amountMinor??p.yearly?.amountMinor??Number.MAX_SAFE_INTEGER;
 return out.sort((a,b)=>(a.free?-1:0)-(b.free?-1:0)||price(a)-price(b));
}

/** Yearly discount against 12 monthly charges, one decimal, or null when there is no saving. */
export function yearlyDiscount(p:PricingPlan):number|null{
 if(!p.monthly||!p.yearly||p.monthly.amountMinor<=0)return null;
 const full=p.monthly.amountMinor*12;
 if(p.yearly.amountMinor>=full)return null;
 return Math.round((full-p.yearly.amountMinor)*1000/full)/10;
}
