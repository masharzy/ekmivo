/** Public, published-only catalog projection. Money remains integer BDT minor units. */
export type SubscriptionProduct="payments"|"ai_credit"|"bundle";
export type SubscriptionTerm="monthly"|"yearly"|"one_time";
export type PublishedSubscriptionOffer={
 key:string;version_id:string;product:SubscriptionProduct;term:SubscriptionTerm;
 amount_minor:string;currency:"BDT";gateway_plan_version_id:string|null;
 name:string;name_bn:string;description:string;description_bn:string;
 included_ai_credits:string|null;
};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const minor=/^[1-9][0-9]{0,11}$/;
const credit=/^[1-9][0-9]{0,11}$/;
function record(v:unknown):Record<string,unknown>|null {
 return !!v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
}
function field(v:unknown,max:number):string {
 return typeof v==="string"&&v.length<=max?v:"";
}
export function parsePublishedSubscriptionOffer(raw:unknown):PublishedSubscriptionOffer|null {
 const v=record(raw);if(!v)return null;
 const key=field(v.key,64),version_id=field(v.version_id,36);
 const product=v.product,term=v.term;
 const amount_minor=field(v.amount_minor,12);
 const gateway_plan_version_id=v.gateway_plan_version_id===null?null:field(v.gateway_plan_version_id,36);
 const included_ai_credits=v.included_ai_credits===null?null:field(v.included_ai_credits,12);
 const name=field(v.name,100),name_bn=field(v.name_bn,120);
 const description=field(v.description,500),description_bn=field(v.description_bn,500);
 if(!/^[a-z][a-z0-9_-]{2,63}$/.test(key)||!uuid.test(version_id)
  ||!["payments","ai_credit","bundle"].includes(String(product))
  ||!["monthly","yearly","one_time"].includes(String(term))
  ||v.currency!=="BDT"||!minor.test(amount_minor)||BigInt(amount_minor)>BigInt("100000000000")
  ||name.trim().length<2)return null;
 if(product==="ai_credit"){
  if(term!=="one_time"||gateway_plan_version_id!==null||!included_ai_credits||!credit.test(included_ai_credits))return null;
 }else{
  if(term==="one_time"||!gateway_plan_version_id||!uuid.test(gateway_plan_version_id))return null;
  if(product==="bundle"&&(!included_ai_credits||!credit.test(included_ai_credits)))return null;
  if(product==="payments"&&included_ai_credits!==null)return null;
 }
 return {key,version_id,product:product as SubscriptionProduct,term:term as SubscriptionTerm,
  amount_minor,currency:"BDT",gateway_plan_version_id,name,name_bn,description,description_bn,included_ai_credits};
}
export function priceInBdt(minorUnits:string,locale:"en"|"bn"):string{
 if(!/^[0-9]{1,16}$/.test(minorUnits))throw Error("Invalid minor-unit amount");
 const value=BigInt(minorUnits),language=locale==="bn"?"bn-BD":"en-BD";
 const whole=new Intl.NumberFormat(language).format(value/BigInt(100));
 const fraction=new Intl.NumberFormat(language,{useGrouping:false,minimumIntegerDigits:2}).format(Number(value%BigInt(100)));
 return "৳"+whole+(value%BigInt(100)===BigInt(0)?"":"."+fraction);
}

/** Informational exact-money comparison, ONLY for admin-published same-plan monthly+yearly pairs. */
export function annualOfferSavings(monthlyMinor:string,yearlyMinor:string):string|null {
 if(!/^[1-9][0-9]{0,11}$/.test(monthlyMinor)||!/^[1-9][0-9]{0,11}$/.test(yearlyMinor))return null;
 const difference=BigInt(monthlyMinor)*BigInt(12)-BigInt(yearlyMinor);
 return difference>BigInt(0)?difference.toString():null;
}
