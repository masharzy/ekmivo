import "server-only";
import {database} from "./db";
import {safePolicyUrl,type CheckoutPolicy} from "../subscription-order";

type Published={id:string;url:string;version:string;sha256:string};
export type PublishedPolicies=Record<CheckoutPolicy,Published|null>;
const empty:PublishedPolicies={terms:null,privacy:null,refund:null};

/** Versioned legal source for checkout. Never fall back to unversioned env links. */
export async function publishedSubscriptionPolicies():Promise<PublishedPolicies>{
 try{
  const result=await database()`SELECT platform_subscription_policy_public() AS policies`;
  const raw=result[0]?.policies;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return {...empty};
  const find=(kind:CheckoutPolicy):Published|null=>{
   const p=(raw as Record<string,unknown>)[kind];
   if(!p||typeof p!=="object"||Array.isArray(p))return null;
   const doc=p as Record<string,unknown>;
   const url=typeof doc.url==="string"?safePolicyUrl(doc.url):null;
   const id=typeof doc.id==="string"?doc.id:"";
   const version=typeof doc.version==="string"?doc.version:"";
   const sha=typeof doc.sha256==="string"?doc.sha256:"";
   if(!url||!isValidId(id)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version)||!/^[a-f0-9]{64}$/.test(sha))return null;
   return {id,url,version,sha256:sha};
  };
  return {terms:find("terms"),privacy:find("privacy"),refund:find("refund")};
 }catch{return {...empty};}
}
function isValidId(value:string){return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);}
