"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function FreePurchaseClaim({token,locale}:{token:string;locale:"bn"|"en"}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const router=useRouter(),bn=locale==="bn";
 async function claim(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const response=await fetch(`/api/platform/purchase-intents/${encodeURIComponent(token)}`,{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"free"}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error("UNCONFIRMED");
   const result=await response.json() as {status?:string};
   if(result.status!=="claimed_free")throw new Error("UNCONFIRMED");
   router.replace("/dashboard");
  }catch{
   setError(bn?"ফ্রি প্ল্যান নিশ্চিত করা যায়নি। আবার চেষ্টা করার আগে Billing পরীক্ষা করুন।":"Free entitlement could not be confirmed. Check Billing before retrying.");
  }finally{setBusy(false)}
 }
 return <div>
  <button type="button" className="ek-order-paybutton" onClick={()=>void claim()} disabled={busy}
   aria-busy={busy}>{busy?(bn?"যাচাই হচ্ছে…":"Confirming…"):(bn?"ফ্রি প্ল্যান চালু করুন":"Activate free plan")}</button>
  <p role="status" aria-live="polite">{error|| (bn?"এই প্ল্যানের জন্য ওয়ালেট পেমেন্ট লাগবে না।":"No wallet payment or paid invoice is required for this plan.")}</p>
 </div>;
}
