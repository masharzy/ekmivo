export type SubscriptionQuote={
 id:string;plan_id:string;amount_minor:number;cycle_count:number;operation:string;
 activation_timing:"now"|"period_end";entitlement_start:string;entitlement_end:string;expires_at:string;
};
export type CheckoutPolicy="terms"|"privacy"|"refund";

export function safePolicyUrl(value:string|undefined|null):string|null{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==="https:"?url.href:null;}catch{return null;}
}

export function allPoliciesAccepted(
 legalUrls:Record<CheckoutPolicy,string|null>,
 consents:Record<CheckoutPolicy,boolean>
):boolean{
 return (["terms","privacy","refund"] as const).every(key=>Boolean(safePolicyUrl(legalUrls[key]))&&consents[key]===true);
}

export function verifiedSubscriptionQuote(
 quote:SubscriptionQuote|null|undefined,planId:string,cycles:number,activation:"now"|"period_end",now=Date.now()
):quote is SubscriptionQuote{
 return Boolean(quote&&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(quote.id)&&
  quote.plan_id===planId&&
  Number.isSafeInteger(quote.cycle_count)&&quote.cycle_count===cycles&&[1,3,6].includes(cycles)&&
  Number.isSafeInteger(quote.amount_minor)&&quote.amount_minor>0&&
  ["renew","upgrade","scheduled_upgrade"].includes(quote.operation)&&
  quote.activation_timing===activation&&
  Number.isFinite(Date.parse(quote.expires_at))&&Date.parse(quote.expires_at)>now&&
  Number.isFinite(Date.parse(quote.entitlement_end)));
}
