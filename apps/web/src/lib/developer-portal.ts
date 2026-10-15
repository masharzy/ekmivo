export type PortalLocale = "en" | "bn";
export type PortalPageId = "home" | "quickstart" | "authentication" | "create" | "verify" | "webhooks" | "errors" | "sandbox" | "go-live" | "api-reference" | "changelog";
export const portalPages: {id:PortalPageId;path:string;en:string;bn:string;description:[string,string];group:number}[] = [
 {id:"home",path:"",en:"Overview",bn:"পরিচিতি",description:["Build, test and ship your payment integration.","পেমেন্ট সংযোগ তৈরি, পরীক্ষা ও চালু করুন।"],group:0},
 {id:"quickstart",path:"/quickstart",en:"Quickstart",bn:"শুরু করুন",description:["Create and verify your first test payment.","প্রথম পরীক্ষামূলক পেমেন্ট তৈরি ও যাচাই করুন।"],group:0},
 {id:"authentication",path:"/authentication",en:"Authentication",bn:"অনুমোদন",description:["Keep your key on your server.","গোপন চাবি নিজের সার্ভারে রাখুন।"],group:0},
 {id:"create",path:"/payments/create",en:"Create payment",bn:"পেমেন্ট তৈরি",description:["Create a hosted checkout with an amount in taka.","টাকায় পরিমাণ দিয়ে পেমেন্টের পাতা তৈরি করুন।"],group:1},
 {id:"verify",path:"/payments/verify",en:"Verify payment",bn:"পেমেন্ট যাচাই",description:["Read the final status before delivering an order.","অর্ডার সরবরাহের আগে পেমেন্টের চূড়ান্ত অবস্থা যাচাই করুন।"],group:1},
 {id:"webhooks",path:"/webhooks",en:"Payment alerts",bn:"পেমেন্টের বার্তা",description:["Receive signed payment alerts on your server.","নিজের সার্ভারে স্বাক্ষরযুক্ত পেমেন্টের বার্তা নিন।"],group:2},
 {id:"errors",path:"/errors",en:"Errors",bn:"ত্রুটির সমাধান",description:["Find the cause and retry safely.","কারণ খুঁজে নিরাপদে আবার চেষ্টা করুন।"],group:3},
 {id:"api-reference",path:"/api-reference",en:"API reference",bn:"API বিবরণ",description:["Fields and responses from the current OpenAPI contract.","বর্তমান OpenAPI চুক্তির ফিল্ড ও প্রতিক্রিয়া দেখুন।"],group:3},
 {id:"changelog",path:"/changelog",en:"Changelog",bn:"পরিবর্তনের তালিকা",description:["Updates to the payment API and its documentation.","পেমেন্ট API ও নির্দেশিকার পরিবর্তন দেখুন।"],group:3},
 {id:"sandbox",path:"/sandbox",en:"Sandbox",bn:"পরীক্ষার পরিবেশ",description:["Test mode: no real money moves.","পরীক্ষার পরিবেশে আসল টাকা লেনদেন হয় না।"],group:4},
 {id:"go-live",path:"/go-live",en:"Go-live checklist",bn:"চালুর প্রস্তুতি",description:["Check your integration before accepting real payments.","আসল পেমেন্ট নেওয়ার আগে সংযোগ যাচাই করুন।"],group:4}
];
export const portalGroups = [["Get started","শুরু করুন"],["Payments","পেমেন্ট"],["Payment alerts","পেমেন্টের বার্তা"],["Reference","তথ্যসূত্র"],["Tools","পরীক্ষার সরঞ্জাম"]] as const;
export const portalHref=(id:PortalPageId)=>"/developers"+(portalPages.find(p=>p.id===id)?.path||"");
export const portalTitle=(id:PortalPageId,locale:PortalLocale)=>portalPages.find(p=>p.id===id)?.[locale]||"Ekmivo";
export function resolvePortalPage(slug:string[]=[]){return portalPages.find(p=>p.path===(slug.length?"/"+slug.join("/"):""));}
export const portalAnchors:Record<PortalPageId,[string,string,string][]>={
 home:[["quickstart","Quickstart","শুরু করুন"],["resources","Resources","সহায়ক নির্দেশিকা"],["service-status","Service status","সেবার অবস্থা"],["latest","Latest changes","সাম্প্রতিক পরিবর্তন"],["try-api","Try the API","API পরীক্ষা করুন"]],
 quickstart:[["get-key","1. Get a test key","১. পরীক্ষার চাবি নিন"],["create-payment","2. Create a payment","২. পেমেন্ট তৈরি করুন"],["verify-payment","3. Verify then deliver","৩. যাচাই করে সরবরাহ করুন"]],
 authentication:[["bearer","Bearer authentication","Bearer অনুমোদন"],["environments","Test and live","পরীক্ষা ও আসল পেমেন্ট"],["keys","Keep keys safe","চাবি নিরাপদ রাখুন"]],
 create:[["parameters","Parameters","ফিল্ডসমূহ"],["idempotency","Safe retries","নিরাপদে আবার চেষ্টা"],["request","Request","অনুরোধ"],["response","Response","প্রতিক্রিয়া"]],
 verify:[["request","Request","অনুরোধ"],["response","Response","প্রতিক্রিয়া"],["statuses","Payment statuses","পেমেন্টের অবস্থা"],["deliver","Before delivery","সরবরাহের আগে"]],
 webhooks:[["enable","Enable alerts","বার্তা চালু করুন"],["event","Event","ঘটনা"],["headers","Headers","হেডারসমূহ"],["signature","Verify the signature","স্বাক্ষর যাচাই"],["delivery","Delivery and retries","পাঠানো ও পুনঃচেষ্টা"]],
 errors:[["error-codes","HTTP errors","HTTP ত্রুটি"],["error-body","Error response","ত্রুটির প্রতিক্রিয়া"],["limits","Rate limits","অনুরোধের সীমা"]],
 sandbox:[["test-key","Use a test key","পরীক্ষার চাবি ব্যবহার করুন"],["try-api","Try the API","API পরীক্ষা করুন"],["scenarios","Receipt scenarios","রসিদ পরীক্ষার ধরন"]],
 "go-live":[["checklist","Before you launch","চালুর আগে"]],
 "api-reference":[["contract","OpenAPI contract","OpenAPI চুক্তি"],["create-schema","Create payment","পেমেন্ট তৈরি"],["verify-schema","Verify payment","পেমেন্ট যাচাই"],["response-units","Response units","প্রতিক্রিয়ার একক"]],
 changelog:[["changes","Changes","পরিবর্তন"],["migration","Migration notes","পুরোনো সংযোগের তথ্য"]]
};
export const portalChanges = [
 {date:"2026-10-15",tag:["New","নতুন"],text:["A separate developer portal with guides and API reference.","নির্দেশিকা ও API বিবরণসহ আলাদা ডেভেলপার পোর্টাল।"]},
 {date:"2026-10-15",tag:["Changed","পরিবর্তন"],text:["Pass webhook_url when creating a payment; no registration required.","পেমেন্ট তৈরির সময় webhook_url দিন; আলাদা নিবন্ধন প্রয়োজন নেই।"]},
 {date:"2026-10-15",tag:["New","নতুন"],text:["Create and verify payments through the simple payment endpoints.","সহজ পেমেন্ট এন্ডপয়েন্ট দিয়ে পেমেন্ট তৈরি ও যাচাই করুন।"]}
];
