export type PlanResource="payment_methods"|"devices"|"api_keys"|"team_members"|"payments";
export type ResourceLimitsData={exempt:boolean;effective?:{active?:boolean;extra_payments?:number;terms?:{name?:string;name_bn?:string;payment_limit:number|null;active_checkout_limit:number;limits:Record<string,number|null>}};resources:Record<string,number|boolean>;usage?:{used:number;reserved:number};usage_error?:boolean};
export function resourceLimit(data:ResourceLimitsData|null,resource:PlanResource,environment:string){
 const none={used:null as number|null,limit:null as number|null,pending:0,reason:"",blocked:true};
 if(!data)return {...none,reason:"unavailable"};
 if(data.exempt||environment==="sandbox"&&resource!=="team_members")return {...none,blocked:false,reason:"exempt"};
 const terms=data.effective?.terms;
 if(!data.effective?.active||!terms)return {...none,reason:"inactive"};
 const used=resource==="payments"?(data.usage_error||!data.usage?null:data.usage.used+data.usage.reserved):typeof data.resources[resource]==="number"?Number(data.resources[resource]):null;
 const pending=resource==="team_members"?Number(data.resources.pending_invites??0):0;
 const limit=resource==="payments"?(terms.payment_limit===null?null:terms.payment_limit+Number(data.effective?.extra_payments??0)):terms.limits[resource];
 if(used===null||limit===undefined)return {...none,reason:"unavailable"};
 const full=limit!==null&&used+pending>=limit;
 const activeFull=resource==="payments"&&typeof data.resources.active_checkouts==='number'&&data.resources.active_checkouts>=terms.active_checkout_limit;
 return {used,limit,pending,blocked:full||activeFull,reason:activeFull?"active":full?"full":"ready"};
}
export function planLimitMessage(code:string,bn:boolean,resource?:PlanResource):string|null{
 const messages:Record<string,[string,string]>={
 SUBSCRIPTION_REQUIRED:["Activate or renew your plan before adding more.","আরও যোগ করতে প্ল্যান চালু বা নবায়ন করুন।"],
 PLAN_RESOURCE_LIMIT:[resource==="devices"?"Device limit reached. Disconnect an unused phone or upgrade your plan.":resource==="payment_methods"?"Receiving-account limit reached. Disable an unused account or upgrade your plan.":resource==="api_keys"?"API key limit reached. Revoke an unused key or upgrade your plan.":"Team limit reached. Remove a member, cancel an invitation or upgrade your plan.",resource==="devices"?"ডিভাইসের সীমা পূর্ণ। অব্যবহৃত ফোন disconnect করুন অথবা প্ল্যান আপগ্রেড করুন।":resource==="payment_methods"?"Receiving account-এর সীমা পূর্ণ। অব্যবহৃত account বন্ধ করুন অথবা প্ল্যান আপগ্রেড করুন।":resource==="api_keys"?"API key-এর সীমা পূর্ণ। অব্যবহৃত key বাতিল করুন অথবা প্ল্যান আপগ্রেড করুন।":"সদস্যের সীমা পূর্ণ। সদস্য সরান, invitation বাতিল করুন অথবা প্ল্যান আপগ্রেড করুন।"],
 PAYMENT_ALLOWANCE_EXHAUSTED:["This period's payment limit is reached. Upgrade your plan or wait for the next period.","এই সময়ের পেমেন্ট সীমা পূর্ণ। প্ল্যান আপগ্রেড করুন অথবা পরবর্তী সময় পর্যন্ত অপেক্ষা করুন।"],
 ACTIVE_CHECKOUT_LIMIT:["Too many pending checkouts. Wait for one to finish or expire, then retry.","একসঙ্গে pending checkout-এর সীমা পূর্ণ। কোনোটি শেষ বা মেয়াদোত্তীর্ণ হলে আবার চেষ্টা করুন।"],
 PLAN_RATE_LIMITED:["Your plan's request rate is reached. Wait a minute and retry.","প্ল্যানের প্রতি মিনিটের অনুরোধ সীমা পূর্ণ। এক মিনিট পর আবার চেষ্টা করুন।"],
 PLAN_FEATURE_REQUIRED:["This feature is not included in your plan. View plans to upgrade.","এই সুবিধা আপনার প্ল্যানে নেই। আপগ্রেড করতে প্ল্যান দেখুন।"],
 PLAN_SNAPSHOT_REQUIRED:["Plan details are temporarily unavailable. Refresh and retry.","প্ল্যানের তথ্য এখন পাওয়া যাচ্ছে না। রিফ্রেশ করে আবার চেষ্টা করুন।"]};
 return messages[code]?.[bn?1:0]??null;
}
