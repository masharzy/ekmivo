export type PlanTerms={
 name:string;name_bn:string;description:string;description_bn:string;kind:"free"|"paid"|"custom";
 amount_minor:number;period_days:number;grace_days:number;free_days:number|null;payment_limit:number|null;
 quota_period:"calendar"|"billing"|"term";active_checkout_limit:number;create_per_minute:number;
 features:Record<"invoices"|"payment_links"|"reports"|"exports",boolean>;
 limits:Record<"api_keys"|"team_members"|"devices"|"payment_methods",number|null>;
 badge:string;badge_bn:string;contact_url:string;
};
export type PaymentPlan={id:string;version_id:string;terms:PlanTerms};
export type AdminPaymentPlan={plan_id:string;current_version:string;version:number;status:"draft"|"published"|"archived";visibility:"public"|"private";sort_order:number;subscribers:number;terms:PlanTerms};
export const newPlanTerms=():PlanTerms=>({name:"",name_bn:"",description:"",description_bn:"",kind:"free",amount_minor:0,period_days:30,grace_days:0,free_days:null,payment_limit:50,quota_period:"calendar",active_checkout_limit:20,create_per_minute:60,features:{invoices:true,payment_links:true,reports:true,exports:true},limits:{api_keys:null,team_members:null,devices:null,payment_methods:null},badge:"",badge_bn:"",contact_url:""});
export const featureLabels={invoices:["Invoices","ইনভয়েস"],payment_links:["Payment links","পেমেন্ট লিংক"],reports:["Reports","রিপোর্ট"],exports:["Exports","এক্সপোর্ট"]} as const;
export const limitLabels={api_keys:["Active Live API keys","সক্রিয় Live API চাবি"],team_members:["Team members, including owner","মালিকসহ টিম সদস্য"],devices:["Connected devices","সংযুক্ত ডিভাইস"],payment_methods:["Receiving accounts","টাকা গ্রহণের অ্যাকাউন্ট"]} as const;
export function planName(t:PlanTerms,bn:boolean){return bn&&t.name_bn?t.name_bn:t.name}
export function planPrice(t:PlanTerms,bn:boolean){return t.kind==="custom"?(bn?"আলোচনা করুন":"Let’s talk"):new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(t.amount_minor/100)}
