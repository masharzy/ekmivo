"use client";
import {useState,type ReactNode} from "react";
export function ApiKeyEnvironmentTabs({locale,sandbox,live}:{
 locale:"bn"|"en";sandbox:ReactNode;live:ReactNode
}){
 const bn=locale==="bn";
 const [selected,setSelected]=useState<"sandbox"|"live">(sandbox?"sandbox":"live");
 return <div className="ek-key-environments">
  <div className="ek-key-environment-tabs" role="group" aria-label={bn?"API key-এর পরিবেশ":"API key environment"}>
   {sandbox&&<button type="button" aria-pressed={selected==="sandbox"} onClick={()=>setSelected("sandbox")}>🧪 Sandbox</button>}
   {live&&<button type="button" aria-pressed={selected==="live"} onClick={()=>setSelected("live")}>🔒 Live</button>}
  </div>
  <p className="ek-key-environment-message" role="status">{selected==="sandbox"?
   (bn?"Sandbox key দিয়ে আলাদা পরীক্ষামূলক ডাটাবেজে payment পরীক্ষা করুন। আসল টাকা লাগে না।":"Sandbox keys use the isolated test database. No real money is involved."):
   (bn?"Live API key নিতে সক্রিয় payment plan লাগবে। Secret শুধু নিজের backend-এ রাখুন।":"A current payment plan is required to issue a Live API key. Keep it on your backend.")}</p>
  {selected==="sandbox"?(sandbox??live):(live??sandbox)}
 </div>;
}
