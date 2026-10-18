export function paymentMethodError(status:number,code:string,bn:boolean,requestId?:string){
 const t=(en:string,bd:string)=>bn?bd:en;
 const messages:Record<string,string>={
 PLAN_RESOURCE_LIMIT:t("Your plan's receiving-account limit is reached. Disable an unused account or change your plan.","প্ল্যানের রিসিভিং অ্যাকাউন্টের সীমা পূর্ণ। অব্যবহৃত অ্যাকাউন্ট বন্ধ করুন বা প্ল্যান বদলান।"),
 SUBSCRIPTION_REQUIRED:t("An active payment plan is required.","সক্রিয় পেমেন্ট প্ল্যান প্রয়োজন।"),
 CONFLICT:t("This account already exists. Refresh the account list before adding it again.","এই অ্যাকাউন্ট আগে থেকেই আছে। আবার যোগ করার আগে তালিকা রিফ্রেশ করুন।"),
 INVALID_REQUEST:t("Check the provider and receiving number.","পেমেন্ট মাধ্যম ও রিসিভিং নম্বর যাচাই করুন।"),
 ACCESS_DENIED:t("You do not have permission to change receiving accounts.","রিসিভিং অ্যাকাউন্ট পরিবর্তনের অনুমতি নেই।"),
 UNAUTHENTICATED:t("Your session has expired. Sign in again.","সেশনের মেয়াদ শেষ। আবার সাইন ইন করুন।"),
 };
 const message=messages[code]||(status===401?messages.UNAUTHENTICATED:status===403?messages.ACCESS_DENIED:status>=500||status===0?t("The save was not confirmed. Refresh the account list before trying again.","সংরক্ষণ নিশ্চিত হয়নি। আবার চেষ্টা করার আগে অ্যাকাউন্টের তালিকা রিফ্রেশ করুন।"):t("Changes were not saved. Check the details and try again.","পরিবর্তন সংরক্ষিত হয়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।"));
 const safeCode=/^[A-Z][A-Z0-9_]{1,63}$/.test(code)?code:status?`HTTP_${status}`:"NETWORK_UNCONFIRMED";
 const safeId=requestId&&/^[a-f0-9]{24}$/.test(requestId)?` · ${requestId}`:"";
 return `${message} (${safeCode}${safeId})`;
}
