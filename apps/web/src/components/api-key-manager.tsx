"use client";
import {useActionState,useState} from "react";
import {useFormStatus} from "react-dom";
import {createMerchantKey,rotateMerchantKey,revokeMerchantKey,type KeyActionState} from "../actions/merchant-keys";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

export type ApiKeyRow={
 id:string;publicId:string;name:string;scopes:string[];
 createdAt:string;expiresAt:string;revokedAt:string|null;lastUsedAt:string|null
};
const initial:KeyActionState={status:"idle",message:""};
const possibleScopes=[
 "payments:read","payments:write","customers:read","customers:write",
 "invoices:read","invoices:write","refunds:read","refunds:write","webhooks:manage"
];
function SaveButton({label}:{label:string}){
 const {pending}=useFormStatus();
 return <button className="ek-action" type="submit" disabled={pending} aria-busy={pending}>
  {pending?"…":label}
 </button>;
}
function SecretOnce({secret,locale}:{secret:string;locale:Locale}){
 const [hidden,setHidden]=useState(false);
 const [copied,setCopied]=useState(false);
 const bn=locale==="bn";
 if(hidden)return <p role="status">{bn?"গোপন কীটি বন্ধ করা হয়েছে। পৃষ্ঠা ছাড়ার পর আর দেখা যাবে না।":"Secret hidden. It cannot be recovered after leaving this page."}</p>;
 return <div className="ds-key-secret" role="status">
  <strong>{bn?"এখনই সংরক্ষণ করুন — শুধু একবার দেখানো হচ্ছে":"Save now — shown once only"}</strong>
  <code>{secret}</code>
  <div className="ds-key-actions">
   <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopied(true);}catch{setCopied(false);}}}>{copied?(bn?"কপি হয়েছে":"Copied"):(bn?"কপি করুন":"Copy key")}</button>
   <button type="button" onClick={()=>{setHidden(true);setCopied(false);}}>{bn?"লুকান":"Hide secret"}</button>
  </div>
  <small>{bn?"Server-side environment variable বা secret manager-এ রাখুন। Browser storage, URL বা public frontend-এ রাখবেন না।":"Keep this in a server-side secret manager. Never store it in URLs, browser storage or public frontend code."}</small>
 </div>;
}
function Result({state,locale}:{state:KeyActionState;locale:Locale}){
 return <>{state.status!=="idle"&&<p className={state.status==="error"?"ek-form-error":"ek-account-success"} role={state.status==="error"?"alert":"status"}>{state.message}</p>}
 {state.status==="success"&&state.rawSecret&&<SecretOnce key={state.keyId} secret={state.rawSecret} locale={locale}/>}</>;
}
function KeyControls({locale,workspaceId,environment,keyItem}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;keyItem:ApiKeyRow}){
 const [rotate,rotateAction]=useActionState(rotateMerchantKey.bind(null,locale),initial);
 const [revoke,revokeAction]=useActionState(revokeMerchantKey.bind(null,locale),initial);
 const [operation,setOperation]=useState<"rotate"|"revoke"|null>(null);
 const bn=locale==="bn",isRevoked=!!keyItem.revokedAt||new Date(keyItem.expiresAt).getTime()<=Date.now();
 if(isRevoked)return <span className="ds-availability">{keyItem.revokedAt?(bn?"বাতিল":"Revoked"):(bn?"মেয়াদ শেষ":"Expired")}</span>;
 const chosen=operation==="rotate"?rotateAction:revokeAction;
 const state=operation==="rotate"?rotate:revoke;
 return <div className="ds-key-management">
  <div className="ds-key-actions">
   <button type="button" aria-expanded={operation==="rotate"} onClick={()=>setOperation(operation==="rotate"?null:"rotate")}>{bn?"ঘোরান":"Rotate"}</button>
   <button type="button" aria-expanded={operation==="revoke"} onClick={()=>setOperation(operation==="revoke"?null:"revoke")}>{bn?"বাতিল করুন":"Revoke"}</button>
  </div>
  {operation&&<form action={chosen} className="ds-key-confirm">
   <input type="hidden" name="workspaceId" value={workspaceId}/>
   <input type="hidden" name="environment" value={environment}/>
   <input type="hidden" name="keyId" value={keyItem.id}/>
   <label>{bn?"বর্তমান পাসওয়ার্ড":"Current password"}
    <input name="password" type="password" required autoComplete="current-password" maxLength={256}/>
   </label>
   <p>{operation==="revoke"?(bn?"কীটি তাৎক্ষণিকভাবে অকার্যকর হবে।":"This key stops working immediately."):
    (bn?"আগের কীটি বাতিল হবে; নতুন কী শুধু একবার দেখানো হবে।":"The old key will be revoked; the replacement is shown once.")}</p>
   <SaveButton label={operation==="revoke"?(bn?"কী বাতিল নিশ্চিত করুন":"Confirm revoke"):(bn?"কী ঘোরান":"Rotate key")}/>
   <Result state={state} locale={locale}/>
  </form>}
 </div>;
}
export function ApiKeyManager({locale,workspaceId,environment,keys}:{
 locale:Locale;workspaceId:string;environment:PaymentEnvironment;keys:ApiKeyRow[]
}){
 const [state,action]=useActionState(createMerchantKey.bind(null,locale),initial);
 const [showCreate,setShowCreate]=useState(false),bn=locale==="bn";
 const showDate=(raw:string)=>new Intl.DateTimeFormat(bn?"bn-BD-u-nu-latn":"en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium"}).format(new Date(raw));
 return <div className="ds-api-key-manager">
  <div className="ds-panel-heading">
   <h3>{bn?"এই পরিবেশের API keys":"API keys in this environment"}</h3>
   <button className="ek-action" type="button" onClick={()=>setShowCreate(!showCreate)} aria-expanded={showCreate}>
    {showCreate?(bn?"ফর্ম বন্ধ":"Close form"):(bn?"নতুন API key":"Create API key")}
   </button>
  </div>
  {showCreate&&<form className="ds-key-create" action={action}>
   <input type="hidden" name="workspaceId" value={workspaceId}/>
   <input type="hidden" name="environment" value={environment}/>
   <label>{bn?"Key-এর নাম":"Key name"}
    <input name="name" type="text" minLength={2} maxLength={80} required placeholder={bn?"যেমন: স্টোর backend":"e.g. Store backend"}/>
   </label>
   <label>{bn?"মেয়াদ":"Expiry"}
    <select name="expiresDays" defaultValue="30">
     <option value="7">{bn?"৭ দিন":"7 days"}</option>
     <option value="30">{bn?"৩০ দিন":"30 days"}</option>
     <option value="90">{bn?"৯০ দিন":"90 days"}</option>
    </select>
   </label>
   <fieldset><legend>{bn?"অনুমতি — শুধু প্রয়োজনীয়গুলো বেছে নিন":"Scopes — grant the minimum required"}</legend>
    <div className="ds-key-scopes">{possibleScopes.map(scope=><label key={scope}>
     <input name="scopes" value={scope} type="checkbox" defaultChecked={scope==="payments:read"}/>
     <code>{scope}</code>
    </label>)}</div>
   </fieldset>
   <label>{bn?"নিশ্চিত করতে বর্তমান পাসওয়ার্ড":"Confirm current password"}
    <input name="password" type="password" required autoComplete="current-password" maxLength={256}/>
   </label>
   <SaveButton label={bn?"API key তৈরি করুন":"Issue API key"}/>
   <Result state={state} locale={locale}/>
  </form>}
  {!keys.length?<div className="ds-empty" role="status">
   <h3>{bn?"এই পরিবেশে কোনো API key নেই":"No API keys in this environment"}</h3>
   <p>{bn?"প্রথম key তৈরি করলে শুধু এই ব্যবসা এবং নির্বাচিত পরিবেশে কাজ করবে।":"Create a key for this business and this environment only."}</p>
  </div>:<div className="ds-key-list">{keys.map(keyItem=><article key={keyItem.id} className="ds-key-card">
   <div className="ds-key-card-head"><div><h4>{keyItem.name}</h4>
    <code>{environment==="sandbox"?"ek_test_":"ek_live_"}{keyItem.publicId}_••••</code></div>
    <span>{keyItem.revokedAt?(bn?"বাতিল":"Revoked"):new Date(keyItem.expiresAt).getTime()<=Date.now()?(bn?"মেয়াদ শেষ":"Expired"):(bn?"সক্রিয়":"Active")}</span>
   </div>
   <p>{bn?"অনুমতি":"Scopes"}: {keyItem.scopes.join(" · ")}</p>
   <small>{bn?"তৈরি":"Created"}: {showDate(keyItem.createdAt)} · {bn?"মেয়াদ":"Expires"}: {showDate(keyItem.expiresAt)} · {bn?"শেষ ব্যবহার":"Last used"}: {keyItem.lastUsedAt?showDate(keyItem.lastUsedAt):"—"}</small>
   <KeyControls locale={locale} workspaceId={workspaceId} environment={environment} keyItem={keyItem}/>
  </article>)}</div>}
 </div>;
}
