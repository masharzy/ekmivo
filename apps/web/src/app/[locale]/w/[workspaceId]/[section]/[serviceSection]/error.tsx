"use client";
import {useInterfaceLocale} from "../../../../../../components/interface-locale-provider";
export default function WorkspaceError({reset}:{error:Error & {digest?:string};reset:()=>void}){
 const bn=useInterfaceLocale()==="bn";
 return <main className="ds-route-error" role="alert">
  <span className="ds-error-eyebrow">EKMIVO / WORKSPACE</span>
  <h1>{bn?"ওয়ার্কস্পেস লোড করা যায়নি":"Unable to load workspace"}</h1>
  <p>{bn?"ব্যবসার তথ্য বা অনুমতি যাচাইয়ের সময় সমস্যা হয়েছে। কোনো পরিবর্তন করা হয়নি। আবার চেষ্টা করো।":"Business data or permission validation failed. No changes were made. Retry the request."}</p>
  <button className="ds-route-retry" type="button" onClick={()=>reset()}>{bn?"আবার চেষ্টা করুন":"Retry"} ↗</button>
 </main>;
}
