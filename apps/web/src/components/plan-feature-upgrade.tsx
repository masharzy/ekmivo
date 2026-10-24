import Link from "next/link";
import {featureLabels} from "../lib/payment-plans";
import type {PlanFeature} from "../lib/plan-features";
import {DashboardIcon} from "./dashboard-icon";
export function PlanFeatureUpgrade({feature,locale,unavailable=false}:{feature:PlanFeature;locale:"en"|"bn";workspaceId:string;unavailable?:boolean}){
 const bn=locale==="bn",name=featureLabels[feature][bn?1:0];
 return <section className="pg-feature-upgrade" role="status">
  <span className="pg-feature-upgrade-icon"><DashboardIcon name={feature==="payment_links"?"payment-links":feature==="exports"?"download":feature}/></span>
  <span className="pg-feature-upgrade-label">{bn?"আপনার প্ল্যান":"Your plan"}</span>
  <h1>{unavailable?(bn?"প্ল্যানের তথ্য পাওয়া যাচ্ছে না":"Plan information unavailable"):bn?`${name} চালু করুন`:`Unlock ${name.toLowerCase()}`}</h1>
  <p>{unavailable?(bn?"আবার চেষ্টা করতে পেজটি রিফ্রেশ করুন।":"Refresh this page to try again."):bn?`আপনার বর্তমান প্ল্যানে এই সুবিধা নেই। ${name} আছে এমন প্ল্যান বেছে নিন।`:`This feature isn’t included in your current plan. Choose a plan with ${name.toLowerCase()} to get started.`}</p>
  {unavailable?<a className="ekv3-primary" href="">{bn?"আবার চেষ্টা করুন":"Try again"}</a>:<Link className="ekv3-primary" href="/settings/billing?tab=plans">{bn?"প্ল্যান দেখুন":"Explore plans"}<span aria-hidden="true"> →</span></Link>}
 </section>;
}
export function ExportUpgradeLink({locale}:{locale:"en"|"bn";workspaceId:string}){
 return <Link className="pg-export-upgrade" href="/settings/billing?tab=plans">{locale==="bn"?"এক্সপোর্টের জন্য প্ল্যান আপগ্রেড করুন":"Upgrade to export"}</Link>;
}
