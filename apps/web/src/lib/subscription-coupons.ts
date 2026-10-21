/** This catalog concerns Ekmivo subscriptions, never seller-store order coupons. */
export type SubscriptionCouponStatus="draft"|"scheduled"|"active"|"paused"|"expired"|"archived";
export type SubscriptionCoupon={
 id:string;code_normalized:string;status:SubscriptionCouponStatus;
 discount_kind:"percent"|"fixed";percent_bps:number|null;fixed_minor:number|null;
 max_discount_minor:number|null;min_subtotal_minor:number;max_redemptions:number|null;max_per_store:number|null;
 first_purchase_only:boolean;stack_with_annual:boolean;stack_with_bundle:boolean;
 eligible_offer_keys:string[];starts_at:string|null;expires_at:string|null;
 revision:number;created_at:string;updated_at:string;redeemed:number;reserved:number;
};
export type SubscriptionCouponList={coupons:SubscriptionCoupon[];next_offset:number|null};

/** Decimal BDT input to exact integer poisha. UI never sends floats to SQL. */
export function parseBdtMinor(input:string):number|null{
 const s=input.trim();
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,part=""]=s.split(".");
 const amount=Number(whole)*100+Number(part.padEnd(2,"0"));
 return Number.isSafeInteger(amount)&&amount<=100000000000?amount:null;
}
export function formatBdtMinor(value:number|null):string{
 if(value===null||!Number.isSafeInteger(value)||value<0)return "";
 return `${Math.floor(value/100)}.${String(value%100).padStart(2,"0")}`;
}
export function parsePercentageBps(input:string):number|null{
 const s=input.trim();if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,part=""]=s.split(".");const n=Number(whole)*100+Number(part.padEnd(2,"0"));
 return n>=1&&n<=10000?n:null;
}
export function formatPercentBps(value:number|null):string{
 return value===null?"":(value/100).toFixed(2);
}
