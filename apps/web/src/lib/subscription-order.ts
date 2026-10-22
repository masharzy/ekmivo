// Authoritative Go/control-PostgreSQL quotation, integer BDT minor-unit strings.
export type CheckoutPolicy="terms"|"privacy"|"refund";
export type PublishedLegalDocument={id:string;version:string;sha256:string;url:string};
export type LegalDocuments=Record<CheckoutPolicy,PublishedLegalDocument>;
export type OrderLine={label:string;quantity:number;unit_price_minor:string;subtotal_minor:string};
export type OrderQuote={id:string;subtotal_minor:string;annual_discount_minor:string;bundle_discount_minor:string;
 coupon_discount_minor:string;tax_minor:string;total_minor:string;currency:"BDT";expires_at:string;
 coupon_code:string|null;lines:OrderLine[]};
export type OrderRead={status:"selected"|"quoted"|"confirmed";intent_id:string;store_id:string;expires_at:string;
 offer:{key:string;product:"payments"|"ai_credit"|"bundle";term:"monthly"|"yearly"|"one_time";version_id:string;
 quantity:number;name:string;name_bn:string;included_ai_credits:string|null};
 policies:Partial<LegalDocuments>;quote:OrderQuote|null;invoice_id?:string;quote_id?:string;total_minor?:string;
 snapshot?:{total_minor:string;offer_version_id:string;legal:Record<CheckoutPolicy,{id:string;version:string;sha256:string}>}};
export const legalKinds=["terms","privacy","refund"] as const;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function safePolicyUrl(value:string|undefined|null):string|null{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password&&!url.hash?url.href:null;}catch{return null;}
}

export function verifiedLegalDocuments(value:Partial<LegalDocuments>|null|undefined):value is LegalDocuments{
 return Boolean(value&&legalKinds.every(key=>{const p=value[key];return p&&uuid.test(p.id)&&
 /^[a-f0-9]{64}$/.test(p.sha256)&&p.version.length>0&&Boolean(safePolicyUrl(p.url));}));
}
export function allPoliciesAccepted(value:Partial<LegalDocuments>|null,accepted:Record<CheckoutPolicy,boolean>):boolean{
 return verifiedLegalDocuments(value)&&legalKinds.every(key=>accepted[key]===true);
}
export function consentPayload(documents:LegalDocuments,accepted:Record<CheckoutPolicy,boolean>){
 return Object.fromEntries(legalKinds.map(key=>[key,{accepted:accepted[key],id:documents[key].id,sha256:documents[key].sha256}]));
}
export function validMinor(value:string):boolean{return typeof value==="string"&&/^(0|[1-9][0-9]{0,11})$/.test(value)&&BigInt(value)<=BigInt("100000000000");}
export function moneyBDT(value:string,locale:"bn"|"en"):string{
 if(!validMinor(value))return "—";
 const amount=BigInt(value);const integral=amount/BigInt(100);const decimals=String(amount%BigInt(100)).padStart(2,"0");
 const whole=new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD").format(integral);
 return `৳${whole}${decimals==="00"?"":"."+decimals}`;
}
export function verifiedSubscriptionQuote(value:OrderQuote|null|undefined,now=Date.now()):value is OrderQuote{
 return Boolean(value&&uuid.test(value.id)&&value.currency==="BDT"&&
  [value.subtotal_minor,value.annual_discount_minor,value.bundle_discount_minor,value.coupon_discount_minor,
   value.tax_minor,value.total_minor].every(validMinor)&&
  Array.isArray(value.lines)&&value.lines.length>0&&value.lines.every(line=>line.label.length>0&&
   Number.isInteger(line.quantity)&&line.quantity>0&&validMinor(line.unit_price_minor)&&validMinor(line.subtotal_minor))&&
  Number.isFinite(Date.parse(value.expires_at))&&Date.parse(value.expires_at)>now);
}
export function orderErrorMessage(code:string,bn:boolean):string{
 const messages:Record<string,[string,string]>={
  COUPON_INVALID:["This coupon is invalid or unavailable.","এই কুপনটি সঠিক নয় বা পাওয়া যাচ্ছে না।"],
  COUPON_EXPIRED:["This coupon has expired.","এই কুপনের মেয়াদ শেষ।"],
  COUPON_EXHAUSTED:["This coupon has reached its usage limit.","এই কুপনের ব্যবহারসীমা শেষ।"],
  COUPON_INELIGIBLE:["This coupon does not apply to this purchase.","এই কেনাকাটায় কুপনটি প্রযোজ্য নয়।"],
  ORDER_EXPIRED:["Your order expired. Choose an offer again.","অর্ডারের মেয়াদ শেষ। আবার অফার বাছুন।"],
  QUOTE_STALE:["Your quote changed or expired. Recheck the total.","মূল্য পরিবর্তিত হয়েছে বা মেয়াদ শেষ। আবার যাচাই করুন।"],
  PRICE_CHANGED:["The published price changed. Choose an offer again.","প্রকাশিত মূল্য বদলেছে। আবার অফার বাছুন।"],
  PLAN_CHANGED:["This plan is no longer available. Choose another.","এই প্ল্যান আর পাওয়া যাচ্ছে না। অন্যটি বাছুন।"],
  POLICY_CHANGED:["A legal document was updated. Read and accept the current version.","নীতিমালার নতুন সংস্করণ এসেছে। পড়ে আবার সম্মতি দিন।"],
  POLICY_UNAVAILABLE:["All three published legal policies are required.","তিনটি প্রকাশিত নীতিমালাই প্রয়োজন।"],
  POLICY_ACCEPTANCE_REQUIRED:["Accept all three policies separately.","তিনটি নীতিমালায় আলাদাভাবে সম্মতি দিন।"],
  STORE_CHANGED:["Your selected Store changed. Please sign in with the Store owner.","নির্বাচিত স্টোর বদলেছে। স্টোরের মালিক হিসেবে ঢুকুন।"],
  ACCESS_DENIED:["Only an authorized Store owner or billing administrator can continue.","শুধু অনুমোদিত স্টোর মালিক বা বিলিং অ্যাডমিন এগোতে পারবেন।"],
  TAX_NOT_CONFIGURED:["Tax rules have not been approved. Checkout is unavailable.","ট্যাক্সের নিয়ম অনুমোদিত হয়নি। চেকআউট বন্ধ আছে।"],
  FULFILLMENT_NOT_READY:["This offer is awaiting the secure payment integration.","এই অফারের নিরাপদ পেমেন্ট সংযোগ এখনো প্রস্তুত নয়।"],
  ZERO_DUE_UNAPPROVED:["This zero-due order requires an approved activation process.","শূন্য টাকার এই অর্ডারে অনুমোদিত অ্যাক্টিভেশন প্রয়োজন।"],
  ORDER_CHECKOUT_NOT_RELEASED:["Checkout confirmation is not released yet.","চেকআউট কনফার্মেশন এখনো চালু হয়নি।"],
 };
 return (messages[code]||["The order service is unavailable. Retry safely.","অর্ডার সার্ভিস পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।"])[bn?1:0];
}
