"use client";
import {useState} from "react";
import {ApiKeyManager,type ApiKeyRow} from "./api-key-manager";
import {AutomaticWebhookSecret} from "./automatic-webhook-secret";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type RealmKeys={live:ApiKeyRow[];sandbox:ApiKeyRow[]};
export function CredentialEnvironmentSwitcher({locale,userId,workspaceId,initialEnvironment,enabled,keys}:{locale:Locale;userId:string;workspaceId:string;initialEnvironment:PaymentEnvironment;enabled:PaymentEnvironment[];keys:RealmKeys}){
 const [realm,setRealm]=useState<PaymentEnvironment>(enabled.includes(initialEnvironment)?initialEnvironment:enabled[0]??initialEnvironment);
 const available=enabled.includes(realm);
 return <div className="ref-credentials-environments">
  {!available&&<div className="seg ref-api-realm-picker" role="group" aria-label={locale==="bn"?"API key পরিবেশ":"API key environment"}>{(["sandbox","live"] as const).map(environment=><button key={environment} type="button" className={realm===environment?"on":""} aria-pressed={realm===environment} onClick={()=>setRealm(environment)}>{environment==="sandbox"?(locale==="bn"?"স্যান্ডবক্স":"Sandbox"):(locale==="bn"?"লাইভ":"Live")}</button>)}</div>}
  {!available?<div className="notice ref-errors" role="status">{locale==="bn"?`${realm==="sandbox"?"Sandbox":"Live"} পরিবেশটি এই business-এ সক্রিয় নেই। এটি চালু হলে এখানে API key তৈরি করা যাবে।`:`${realm==="sandbox"?"Sandbox":"Live"} environment is not active for this business. Enable it before issuing keys.`}</div>:<>
   <ApiKeyManager key={userId+":"+workspaceId+":"+realm} locale={locale} userId={userId} workspaceId={workspaceId} environment={realm} keys={keys[realm]} enabledEnvironments={enabled} onSwitchEnvironment={setRealm}/>
   <AutomaticWebhookSecret key={realm} workspaceId={workspaceId} environment={realm} locale={locale}/>
  </>}
 </div>;
}
