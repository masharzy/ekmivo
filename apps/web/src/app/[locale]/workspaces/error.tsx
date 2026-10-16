"use client";
import {useParams} from "next/navigation";
export default function WorkspaceLoadError({reset}:{error:Error&{digest?:string};reset:()=>void}){
 const params=useParams<{locale:string}>(),bn=params.locale!=="en";
 return <main className="wk2-root" lang={bn?"bn":"en"}><header className="wk2-header"><span className="wk2-logo">ekmivo</span></header><div className="wk2-content"><div className="wk2-titlebar"><h1>{bn?"ওয়ার্কস্পেস":"Workspaces"}</h1></div><div className="wk2-error"><p>{bn?"ওয়ার্কস্পেসের তথ্য পাওয়া যায়নি।":"Unable to load workspaces."}</p><button type="button" className="wk2-button wk2-primary" onClick={reset}>{bn?"আবার চেষ্টা করুন":"Try again"}</button></div></div></main>;
}
