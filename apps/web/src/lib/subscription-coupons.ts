/** This catalog concerns Ekmivo subscriptions, never seller-store order coupons. */
export type SubscriptionCouponStatus="draft"|"scheduled"|"active"|"paused"|"expired"|"archived";
export type SubscriptionCoupon={
 id:string;code_normalized:string;status:SubscriptionCouponStatus;
 discount_kind:"percent"|"fixed";percent_bps:number|null;fixed_minor:number|null;
 max_discount_minor:number|null;min_subtotal_minor:number;max_redemptions:number|null;max_per_store:number|null;
 first_purchase_only:boolean;stack_with_annual:boolean;stack_with_bundle:boolean;
 eligible_offer_keys:string[];eligible_products:string[];eligible_terms:string[];starts_at:string|null;expires_at:string|null;
 revision:number;created_at:string;updated_at:string;redeemed:number;reserved:number;
};
export type SubscriptionCouponList={coupons:SubscriptionCoupon[];next_offset:number|null};
export type SubscriptionTaxPolicy={id:string;product:"payments"|"ai_credit"|"bundle";term:"monthly"|"yearly"|"one_time";rate_bps:number;revision:number;reason:string;updated_at:string};

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

/** Stable, non-sensitive Admin action feedback in either supported locale.
 * Unknown server messages never expose database text to the Bengali UI. */
export function adminCouponMessage(message:string,locale:"bn"|"en"):string{
 if(locale==="en")return message;
 const bn:Record<string,string>={
  "Super Admin and MFA verification are required.":"সুপার অ্যাডমিন অনুমতি ও MFA যাচাই প্রয়োজন।",
  "Check the code, amount, offer keys, date range and 10–500 character audit reason.":"কোড, পরিমাণ, অফার, সময়সীমা ও ১০–৫০০ অক্ষরের পরিবর্তনের কারণ যাচাই করুন।",
  "Coupon revision saved. Activate or reschedule the coupon separately when ready.":"কুপনের নতুন সংস্করণ সংরক্ষিত। প্রস্তুত হলে আলাদাভাবে চালু বা সময় নির্ধারণ করুন।",
  "Choose a valid status and explain the change (10–500 characters).":"সঠিক অবস্থা নির্বাচন করে ১০–৫০০ অক্ষরে পরিবর্তনের কারণ দিন।",
  "Coupon status updated. Refresh to see the current revision.":"কুপনের অবস্থা আপডেট হয়েছে। নতুন সংস্করণ দেখতে রিফ্রেশ করুন।",
  "Check the product, term, percentage, revision and documented tax approval (10–500 characters).":"পণ্য, মেয়াদ, শতাংশ, সংস্করণ ও কর অনুমোদনের কারণ যাচাই করুন।",
  "Approved tax rule saved and versioned. Requote any orders pinned to an older revision.":"অনুমোদিত করনীতি ও সংস্করণ সংরক্ষিত। পুরোনো সংস্করণে থাকা অর্ডারের হিসাব পুনরায় যাচাই করুন।",
  "Permission denied. Refresh your Admin session and MFA.":"অনুমতি নেই। অ্যাডমিন সেশন ও MFA পুনরায় যাচাই করুন।",
  "Another admin changed this coupon. Refresh and retry.":"অন্য অ্যাডমিন কুপনটি বদলেছেন। রিফ্রেশ করে আবার চেষ্টা করুন।",
  "This coupon code already exists.":"এই কুপন কোডটি আগে থেকেই আছে।",
  "Invalid coupon fields, eligibility, revision or status transition.":"কুপনের তথ্য, প্রযোজ্যতা, সংস্করণ বা অবস্থা পরিবর্তন সঠিক নয়।",
  "Coupon service is unavailable. No change was confirmed.":"কুপন সেবা পাওয়া যাচ্ছে না। কোনো পরিবর্তন নিশ্চিত হয়নি।"
 };
 return bn[message]||"অনুরোধটি সম্পন্ন হয়নি। রিফ্রেশ করে আবার চেষ্টা করুন।";
}
