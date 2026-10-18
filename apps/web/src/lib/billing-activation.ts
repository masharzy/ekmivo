export type BillingActivation="now"|"period_end";
export function billingQuoteValid(quote:{activation_timing?:string;expires_at?:string}|null|undefined,activation:BillingActivation,now=Date.now()){
 return Boolean(quote&&quote.activation_timing===activation&&quote.expires_at&&Date.parse(quote.expires_at)>now);
}
