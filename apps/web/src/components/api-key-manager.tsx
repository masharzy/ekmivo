"use client";
import {useActionState,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import {DashboardIcon} from "./dashboard-icon";
import {useFormStatus} from "react-dom";
import {createMerchantKey,rotateMerchantKey,revokeMerchantKey,type KeyActionState} from "../actions/merchant-keys";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

export type ApiKeyRow={
 id:string;publicId:string;name:string;scopes:string[];expired:boolean;
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
  <strong>{bn?"এই কী আর কখনো দেখানো হবে না।":"You will not see this key again."}</strong>
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
 const dialog=useRef<HTMLDialogElement>(null),bn=locale==="bn";
 const inactive=!!keyItem.revokedAt||keyItem.expired;
 useEffect(()=>{const d=dialog.current;if(operation&&!d?.open)d?.showModal();if(!operation&&d?.open)d.close()},[operation]);
 if(inactive)return <span className="ek-key-inactive">—</span>;
 const chosen=operation==="rotate"?rotateAction:revokeAction;
 const state=operation==="rotate"?rotate:revoke;
 return <div className="ek-key-row-actions">
  <details className="ekv3-row-menu"><summary aria-label={bn?"Key-এর অপশন":"Key actions"} title={bn?"অপশন":"Actions"}>⋯</summary><div className="ekv3-row-popover"><button type="button" onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");setOperation("rotate")}}>{bn?"রোটেট":"Rotate"}</button><button type="button" className="ekv3-danger-menu" onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");setOperation("revoke")}}>{bn?"বাতিল করুন":"Revoke"}</button></div></details>
  <dialog ref={dialog} className="ekv2-export-dialog ek-key-confirm-dialog" aria-label={bn?"নিশ্চিত করুন":"Confirm key action"} onClose={()=>setOperation(null)} onClick={e=>{if(e.target===e.currentTarget)setOperation(null)}}>
   {operation&&<form action={chosen} className="ds-key-confirm">
    <h2>{operation==="rotate"?(bn?"Key রোটেট করুন":"Rotate key"):(bn?"Key বাতিল করুন":"Revoke key")}</h2>
    <p>{operation==="rotate"?(bn?"আগের key বাতিল হবে এবং নতুন key একবার দেখানো হবে।":"The old key will be revoked. A new key is shown once."):(bn?"এই key ব্যবহারকারী অ্যাপগুলো সঙ্গে সঙ্গে কাজ করা বন্ধ করবে।":"Applications using this key stop working immediately.")}</p>
    <input type="hidden" name="workspaceId" value={workspaceId}/><input type="hidden" name="environment" value={environment}/><input type="hidden" name="keyId" value={keyItem.id}/>
    <label>{bn?"বর্তমান পাসওয়ার্ড":"Current password"}<input name="password" type="password" required autoComplete="current-password" maxLength={256}/></label>
    <div className="ek-key-confirm-actions"><button type="button" onClick={()=>setOperation(null)}>{bn?"বাতিল":"Cancel"}</button><SaveButton label={operation==="revoke"?(bn?"Key বাতিল নিশ্চিত":"Confirm revoke"):(bn?"Key রোটেট করুন":"Rotate key")}/></div>
    <Result state={state} locale={locale}/>
   </form>}
  </dialog>
 </div>;
}
export function ApiKeyManager({locale,userId,workspaceId,environment,keys}:{
 locale:Locale;userId:string;workspaceId:string;environment:PaymentEnvironment;keys:ApiKeyRow[]
}){
 const [state,action]=useActionState(createMerchantKey.bind(null,locale),initial);
 const [showCreate,setShowCreate]=useState(false),bn=locale==="bn";
 const createDialog=useRef<HTMLDialogElement>(null),detailsDialog=useRef<HTMLDialogElement>(null);
 const [selected,setSelected]=useState<ApiKeyRow|null>(null);
 const [draftName,setDraftName]=useState("");
 const [draftExpiry,setDraftExpiry]=useState("30");
 const [draftScopes,setDraftScopes]=useState<string[]>(["payments:read"]);
 const [saved,setSaved]=useState({name:"",expiresDays:"30",scopes:["payments:read"] as string[]});
 const [draftNotice,setDraftNotice]=useState("");
 const key=`ekmivo:pg03-key-draft:v1:${userId}:${workspaceId}:${environment}`;
 const draft={name:draftName,expiresDays:draftExpiry,scopes:draftScopes};
 const dirty=showCreate && (
  draft.name!==saved.name||draft.expiresDays!==saved.expiresDays||
  draft.scopes.join(",")!==saved.scopes.join(",")
 );
 const saveDraft=()=>{
  try{
   // Never persist passwords, bearer tokens, key IDs or response secrets.
   window.sessionStorage.setItem(key,JSON.stringify(draft));
   setSaved({name:draftName,expiresDays:draftExpiry,scopes:[...draftScopes]});
   setDraftNotice(bn?"শুধু নাম, মেয়াদ ও অনুমতি এই ট্যাবে রাখা হয়েছে।":"Only the name, expiry and scopes were saved in this tab.");
   return true;
  }catch{
   setDraftNotice(bn?"এই ট্যাবে খসড়া রাখা যাচ্ছে না।":"This tab cannot save drafts.");
   return false;
  }
 };
 const discardDraft=()=>{
  try{window.sessionStorage.removeItem(key);}catch{/* Optional storage. */}
  setDraftName("");setDraftExpiry("30");setDraftScopes(["payments:read"]);
  setSaved({name:"",expiresDays:"30",scopes:["payments:read"]});
  setDraftNotice(bn?"খসড়া বাতিল করা হয়েছে।":"Draft discarded.");
 };
 const restoreDraft=()=>{
  try{
   const value=window.sessionStorage.getItem(key);
   if(!value)throw Error("missing");
   const parsed=JSON.parse(value) as {name?:unknown;expiresDays?:unknown;scopes?:unknown};
   if(typeof parsed.name!=="string"||parsed.name.length>80||
    !["7","30","90"].includes(String(parsed.expiresDays))||
    !Array.isArray(parsed.scopes)||parsed.scopes.some(x=>typeof x!=="string"||!possibleScopes.includes(x))
   )throw Error("invalid");
   const next={name:parsed.name,expiresDays:String(parsed.expiresDays),scopes:parsed.scopes as string[]};
   setDraftName(next.name);setDraftExpiry(next.expiresDays);setDraftScopes(next.scopes);setSaved(next);
   setDraftNotice(bn?"খসড়া ফিরিয়ে আনা হয়েছে।":"Draft restored.");
  }catch{setDraftNotice(bn?"বৈধ খসড়া পাওয়া যায়নি।":"No valid draft found.");}
 };
 useEffect(()=>{
  return registerDraft({
   id:`pg03-key:${userId}:${workspaceId}:${environment}`,
   isDirty:()=>dirty,
   save:async()=>saveDraft(),
   discard:discardDraft
  });
 });
 useEffect(()=>{const d=createDialog.current;if(showCreate&&!d?.open)d?.showModal();if(!showCreate&&d?.open)d.close()},[showCreate]);
 const openDetails=(keyItem:ApiKeyRow)=>{setSelected(keyItem);detailsDialog.current?.showModal()};
 const showDate=(raw:string)=>new Intl.DateTimeFormat(bn?"bn-BD-u-nu-latn":"en-US",{timeZone:"Asia/Dhaka",dateStyle:"medium"}).format(new Date(raw));
 return <div className="ds-api-key-manager">
  <div className="ds-panel-heading ek-key-toolbar">
   <button className="ek-action" type="button" onClick={()=>setShowCreate(!showCreate)} aria-expanded={showCreate}>
    {showCreate?(bn?"ফর্ম বন্ধ":"Close form"):(bn?"নতুন API key":"Create API key")}
   </button>
  </div>
  <dialog ref={createDialog} className="ekv2-export-dialog ek-key-create-dialog" aria-label={bn?"API key তৈরি করুন":"Create API key"} onClose={()=>setShowCreate(false)} onClick={event=>{if(event.target===event.currentTarget)setShowCreate(false)}}>{showCreate&&<form className="ds-key-create" action={action}>
   <input type="hidden" name="workspaceId" value={workspaceId}/>
   <input type="hidden" name="environment" value={environment}/>
   <label>{bn?"Key-এর নাম":"Key name"}
    <input name="name" type="text" minLength={2} maxLength={80} required value={draftName} onChange={event=>setDraftName(event.target.value)} placeholder={bn?"যেমন: স্টোর backend":"e.g. Store backend"}/>
   </label>
   <label>{bn?"মেয়াদ":"Expiry"}
    <select name="expiresDays" value={draftExpiry} onChange={event=>setDraftExpiry(event.target.value)}>
     <option value="7">{bn?"৭ দিন":"7 days"}</option>
     <option value="30">{bn?"৩০ দিন":"30 days"}</option>
     <option value="90">{bn?"৯০ দিন":"90 days"}</option>
    </select>
   </label>
   <fieldset><legend>{bn?"অনুমতি — শুধু প্রয়োজনীয়গুলো বেছে নিন":"Scopes — grant the minimum required"}</legend>
    <div className="ds-key-scopes">{possibleScopes.map(scope=><label key={scope}>
     <input name="scopes" value={scope} type="checkbox" checked={draftScopes.includes(scope)} onChange={event=>setDraftScopes(current=>event.target.checked?[...current,scope]:current.filter(x=>x!==scope))}/>
     <code>{scope}</code>
    </label>)}</div>
   </fieldset>
   <label>{bn?"নিশ্চিত করতে বর্তমান পাসওয়ার্ড":"Confirm current password"}
    <input name="password" type="password" required autoComplete="current-password" maxLength={256}/>
   </label>
   <SaveButton label={bn?"API key তৈরি করুন":"Issue API key"}/>
   <div className="ds-key-actions">
    <button type="button" disabled={!dirty} onClick={()=>{saveDraft();}}>{bn?"খসড়া সংরক্ষণ":"Save draft"}</button>
    <button type="button" onClick={restoreDraft}>{bn?"খসড়া ফিরিয়ে আনুন":"Restore draft"}</button>
    <button type="button" onClick={discardDraft}>{bn?"খসড়া বাতিল":"Discard draft"}</button>
   </div>
   {draftNotice&&<p data-feedback="success" role="status">{draftNotice}</p>}
   <Result state={state} locale={locale}/>
  </form>}</dialog>
  {!keys.length?<div className="ekv3-empty" role="status">{bn?"এই পরিবেশে কোনো key নেই।":"No API keys yet."}</div>:<div className="ekv3-table-scroller ek-key-table"><table className="ekv3-table"><thead><tr><th>{bn?"নাম":"Name"}</th><th>Key</th><th>{bn?"অনুমতি":"Scopes"}</th><th>{bn?"মেয়াদ":"Expires"}</th><th>{bn?"শেষ ব্যবহার":"Last used"}</th><th>{bn?"অবস্থা":"Status"}</th><th aria-label="Actions"/></tr></thead><tbody>
   {keys.map(keyItem=><tr key={keyItem.id} className="ekv3-clickable" tabIndex={0} onClick={()=>openDetails(keyItem)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openDetails(keyItem)}}}>
    <td><strong>{keyItem.name}</strong></td>
    <td><code className="ek-key-ref">{environment==="sandbox"?"ek_test_":"ek_live_"}{keyItem.publicId.slice(0,8)}…{keyItem.publicId.slice(-4)}</code><button type="button" className="ekv3-copy" aria-label={bn?"Public reference কপি":"Copy public reference"} title={bn?"এটি secret নয়":"Not the secret"} onClick={e=>{e.stopPropagation();void navigator.clipboard.writeText(keyItem.publicId)}}><DashboardIcon name="copy" width={16} height={16}/></button></td>
    <td title={keyItem.scopes.join(", ")}>{keyItem.scopes.length} {bn?"স্কোপ":"scopes"}</td><td>{showDate(keyItem.expiresAt)}</td><td>{keyItem.lastUsedAt?showDate(keyItem.lastUsedAt):"—"}</td>
    <td><span className="ekv3-status" data-tone={keyItem.revokedAt||keyItem.expired?"neutral":"success"}>{keyItem.revokedAt?(bn?"বাতিল":"Revoked"):keyItem.expired?(bn?"মেয়াদ শেষ":"Expired"):(bn?"সক্রিয়":"Active")}</span></td>
    <td onClick={e=>e.stopPropagation()}><KeyControls locale={locale} workspaceId={workspaceId} environment={environment} keyItem={keyItem}/></td>
   </tr>)}</tbody></table></div>}
  <dialog ref={detailsDialog} className="ekv3-drawer" aria-label={bn?"Key-এর বিবরণ":"Key details"} onClose={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)e.currentTarget.close()}}>{selected&&<div className="ekv3-drawer-content"><div className="ekv3-drawer-heading"><h2>{selected.name}</h2><button type="button" aria-label="Close" onClick={()=>detailsDialog.current?.close()}>×</button></div><div className="ekv3-drawer-list"><div><span>{bn?"অবস্থা":"Status"}</span><strong>{selected.revokedAt?"Revoked":selected.expired?"Expired":"Active"}</strong></div><div><span>{bn?"মেয়াদ":"Expires"}</span><strong>{showDate(selected.expiresAt)}</strong></div></div><h3>{bn?"অনুমতিসমূহ":"Scopes"}</h3><div className="ek-key-scope-tags">{selected.scopes.map(scope=><span key={scope}>{scope}</span>)}</div></div>}</dialog>
 </div>;
}
