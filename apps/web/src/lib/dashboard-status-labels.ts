/* Shared merchant-facing status names only. Server status codes stay unchanged. */
export type MerchantStatusCategory="request"|"phone"|"link";
const dictionary:Record<MerchantStatusCategory,Record<string,readonly [string,string]>>={
 request:{
  requires_payer:["Awaiting payer","প্রেরকের অপেক্ষায়"],
  awaiting_payment:["Pending verification","যাচাইয়ের অপেক্ষায়"],
  completed:["Verified","যাচাইকৃত"],
  expired:["Expired","মেয়াদ শেষ"],
  cancelled:["Cancelled","বাতিল"],
  processing:["Processing","প্রক্রিয়াধীন"]
 },
 phone:{
  online:["Online","অনলাইনে"],
  delayed:["Sync delayed","সিঙ্কে দেরি"],
  offline:["Offline","অফলাইনে"],
  permission:["SMS access needed","SMS অনুমতি প্রয়োজন"],
  pairing:["Waiting to connect","যুক্ত হওয়ার অপেক্ষায়"],
  expired:["Pairing expired","পেয়ারিংয়ের মেয়াদ শেষ"],
  waiting:["Waiting for first sync","প্রথম সিঙ্কের অপেক্ষায়"],
  revoked:["Disconnected","সংযোগ বিচ্ছিন্ন"]
 },
 link:{
  active:["Active","সক্রিয়"],
  expired:["Expired","মেয়াদ শেষ"],
  archived:["Archived","আর্কাইভ করা"],
  draft:["Draft","খসড়া"]
 }
};
export function merchantStatusLabel(category:MerchantStatusCategory,status:string,locale:"en"|"bn"):string{
 const pair=dictionary[category][status]||["Pending","অপেক্ষমাণ"];
 return pair[locale==="bn"?1:0];
}
