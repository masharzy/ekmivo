/** Phase 3 coupon contract. Amounts are supplied only by authenticated Go. */
export type CouponQuoteSnapshot={
 id:string;intent_revision:number;revision:number;coupon_id:string|null;coupon_code:string;
 subtotal_minor:number;annual_discount_minor:number;bundle_discount_minor:number;
 coupon_discount_minor:number;tax_minor:number;total_minor:number;expires_at:string;
 lines:{line_no:number;label:string;quantity:number;unit_price_minor:number;subtotal_minor:number}[];
};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const money=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0&&n<=100000000000;

export function parseCouponQuote(source:unknown):CouponQuoteSnapshot|null{
 if(!source||typeof source!=="object")return null;
 const q=source as Record<string,unknown>;
 const fields=["subtotal_minor","annual_discount_minor","bundle_discount_minor","coupon_discount_minor","tax_minor","total_minor"] as const;
 if(typeof q.id!=="string"||!uuid.test(q.id)||!Number.isSafeInteger(q.revision)||Number(q.revision)<1
  ||!Number.isSafeInteger(q.intent_revision)||Number(q.intent_revision)<1
  ||!fields.every(f=>money(q[f]))||typeof q.expires_at!=="string"||!Number.isFinite(Date.parse(q.expires_at))
  ||(q.coupon_id!==null&&(typeof q.coupon_id!=="string"||!uuid.test(q.coupon_id)))
  ||typeof q.coupon_code!=="string"||q.coupon_code.length>32||!Array.isArray(q.lines)||q.lines.length>100)
  return null;
 // Defensive invariant check; never recompute or overwrite an authoritative price.
 if(Number(q.total_minor)!==Number(q.subtotal_minor)-Number(q.annual_discount_minor)-Number(q.bundle_discount_minor)-Number(q.coupon_discount_minor)+Number(q.tax_minor)
  ||Number(q.total_minor)<=0)return null;
 if(!q.lines.every(line=>line&&typeof line==="object"&&Number.isSafeInteger(line.line_no)&&line.line_no>0
  &&typeof line.label==="string"&&line.label.length<=160&&Number.isSafeInteger(line.quantity)&&line.quantity>0
  &&money(line.unit_price_minor)&&money(line.subtotal_minor)))return null;
 return q as CouponQuoteSnapshot;
}

export function couponErrorMessage(code:string,locale:"bn"|"en"){
 const text:Record<string,[string,string]>={
  COUPON_INELIGIBLE:["This coupon is unavailable or does not apply to the selected offer.","এই কুপনটি পাওয়া যাচ্ছে না অথবা নির্বাচিত অফারে প্রযোজ্য নয়।"],
  TAX_POLICY_REQUIRED:["Approved tax rules are not yet configured.","অনুমোদিত করনীতি এখনও সেটআপ হয়নি।"],
  TAX_REQUOTE_REQUIRED:["Tax rules changed. Refresh the original order quote.","করনীতি বদলেছে। মূল অর্ডারের হিসাব রিফ্রেশ করুন।"],
  ZERO_DUE_POLICY_REQUIRED:["This discount needs an approved zero-due policy.","এই ছাড়ের জন্য শূন্য টাকার অনুমোদিত নীতি প্রয়োজন।"],
  QUOTE_CHANGED:["Your order changed. Refresh before applying a coupon.","অর্ডার বদলেছে। কুপন দেওয়ার আগে রিফ্রেশ করুন।"],
  QUOTE_REQUIRED:["The quote expired. Refresh your order.","হিসাবের মেয়াদ শেষ। অর্ডার রিফ্রেশ করুন।"],
  OFFER_CHANGED:["The published offer changed. Review it before paying.","প্রকাশিত অফার বদলেছে। পেমেন্টের আগে যাচাই করুন।"],
  FORBIDDEN:["You do not have permission to use this Store quote.","এই স্টোরের হিসাব ব্যবহারের অনুমতি নেই।"],
 };
 const [en,bn]=text[code]||["The verified coupon service is unavailable. Please retry.","যাচাইকৃত কুপন সেবা পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।"];
 return locale==="bn"?bn:en;
}
