"use client";
import {useActionState} from "react";
import {waiveAdminAiRequest,type AdminAiTariffState} from "../actions/admin-ai-tariff";
export type AiException={workspace_id:string;workspace_name:string;request_key:string;model:string;reserved_minor:number;created_at:string;state:string;provider_ref:string;operation_key:string};
const initial:AdminAiTariffState={status:"idle",message:""};
function ExceptionAction({item,bn}:{item:AiException;bn:boolean}){
 const [state,action,pending]=useActionState(waiveAdminAiRequest,initial);
 return <details><summary>{bn?"ক্রেডিট ছাড়ুন":"Release credits"}</summary><form action={action} className="pa-admin-fields">
  <input type="hidden" name="workspace_id" value={item.workspace_id}/><input type="hidden" name="request_key" value={item.request_key}/><input type="hidden" name="operation_key" value={item.operation_key}/>
  <label>{bn?"কারণ":"Reason"}<textarea name="reason" minLength={20} maxLength={500} required/></label>
  <p className="pa-subtle">{bn?"এতে গ্রাহকের রিজার্ভ ক্রেডিট ছাড়া হবে। Provider খরচ হয়ে থাকতে পারে।":"This releases the customer's hold. Provider costs may still apply."}</p>
  <button type="submit" className="pa-button" disabled={pending}>{pending?(bn?"সংরক্ষণ হচ্ছে…":"Saving…"):(bn?"রিজার্ভ ক্রেডিট ছাড়ুন":"Release reserved credits")}</button>
  {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
 </form></details>;
}
export function AdminAiExceptions({items,canEdit,locale}:{items:AiException[];canEdit:boolean;locale:"bn"|"en"}){
 const bn=locale==="bn",t=(en:string,b:string)=>bn?b:en;
 const money=(minor:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
 return <section className="pa-surface pa-table-card" aria-labelledby="ai-exceptions-title">
  <div className="pa-split-head pa-admin-section-head"><h2 id="ai-exceptions-title">{t("AI requests needing attention","যেসব AI অনুরোধে ব্যবস্থা প্রয়োজন")}</h2><span className="pa-subtle">{t("Latest 100","সর্বশেষ ১০০")}</span></div>
  <div className="pa-table-wrap"><table><thead><tr><th>{t("Business","ব্যবসা")}</th><th>{t("Request / model","অনুরোধ / মডেল")}</th><th>{t("Reserved","রিজার্ভ")}</th><th>{t("Created (UTC)","সময় (UTC)")}</th><th>{t("Action","ব্যবস্থা")}</th></tr></thead><tbody>
   {items.map(item=><tr key={item.workspace_id+item.request_key}><td>{item.workspace_name}</td><td>{item.model}<small className="pa-subtle">{item.request_key}</small></td><td>{money(item.reserved_minor)}</td><td>{item.created_at.slice(0,16).replace("T"," ")}</td><td>{canEdit?<ExceptionAction item={item} bn={bn}/>:t("Super Admin required","Super Admin প্রয়োজন")}</td></tr>)}
   {items.length===0&&<tr><td className="pa-empty-row" colSpan={5}>{t("No unresolved requests.","কোনো অনিষ্পন্ন অনুরোধ নেই।")}</td></tr>}
  </tbody></table></div>
 </section>;
}
