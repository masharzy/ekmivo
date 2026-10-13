"use client";
import { useEffect } from "react";
import {useInterfaceLocale} from "../../components/interface-locale-provider";
export default function AppError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 const bn=useInterfaceLocale()==="bn";
 useEffect(()=>{console.error("An application route failed",error.digest??"server_error");},[error]);
 return <main className="ek-app-shell ek-error-page"><div className="ek-error-box">
 <span>EKMIVO / ERROR</span>
 <h1>{bn?"পেজটি লোড করা যায়নি":"Something went wrong."}</h1><p>{bn?"সার্ভারের সমস্যায় পেজটি লোড হয়নি। আবার চেষ্টা করুন। সমস্যা থাকলে নিচের রেফারেন্স নম্বরসহ সাপোর্টে জানান।":"The server could not complete this request. Please retry. If the problem continues, contact support with the reference below."}</p>
 {error.digest&&<small>Reference: {error.digest}</small>}
 <button type="button" className="ek-action" onClick={reset}>{bn?"আবার চেষ্টা করুন":"Try again"} ↗</button>
 </div><div role="alert" className="ek-toast"><strong>{bn?"সার্ভারে সমস্যা":"Server error"}</strong><p>{bn?"অনুরোধটি সম্পন্ন করা যায়নি।":"Your request could not be completed."}</p></div></main>;
}
