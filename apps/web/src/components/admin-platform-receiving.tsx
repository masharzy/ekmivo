"use client";
import {useActionState,useState} from "react";
import {setPlatformReceivingAction,type PlatformReceivingState} from "../actions/platform-admin";
import type {Locale} from "../lib/dashboard-navigation";
const initial:PlatformReceivingState={status:"idle",message:""};
export function AdminPlatformReceiving({locale,current,options}:{locale:Locale;current:{id:string;name:string}|null;options:{id:string;name:string}[]}){
 const bn=locale==="bn",t=(en:string,bd:string)=>bn?bd:en;
 const [state,action,pending]=useActionState(setPlatformReceivingAction.bind(null,locale),initial);
 const [selectedId,setSelectedId]=useState(current?.id||"");
 const saved=state.workspace??current;
 const choices=saved&&!options.some(w=>w.id===saved.id)?[saved,...options]:options;
 const canSave=options.some(w=>w.id===selectedId)&&selectedId!==saved?.id;
 return <section className="pa-surface pa-settings-grid pa-system-receiving">
  <h2>{t("System workspace","সিস্টেম ওয়ার্কস্পেস")}</h2>
  <form action={action} className="pa-system-receiving-form">
   <label className="sr-only" htmlFor="system-workspace">{t("System workspace","সিস্টেম ওয়ার্কস্পেস")}</label>
   <select id="system-workspace" className="pa-toolbar-select" name="workspaceId" required value={selectedId} onChange={e=>setSelectedId(e.target.value)} disabled={pending}>
    <option value="" disabled>{t("Choose a workspace","ওয়ার্কস্পেস বেছে নিন")}</option>
    {choices.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
   </select>
   <button type="submit" className="pa-button pa-button-primary" disabled={pending||!canSave}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save","সংরক্ষণ")}</button>
   {!choices.length&&<p className="pa-subtle">{t("No eligible workspaces","যোগ্য ওয়ার্কস্পেস নেই")}</p>}
   {state.status!=="idle"&&(state.status==="error"||saved?.id===selectedId)&&<p className={state.status==="error"?"pa-error":"pa-subtle"} role="status">{state.message}</p>}
  </form>
 </section>;
}
