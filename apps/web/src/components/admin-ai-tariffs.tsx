"use client";
import {useActionState,useState} from "react";
import {publishAdminAiTariff,type AdminAiTariffState} from "../actions/admin-ai-tariff";
import type {AiTariffRow} from "../lib/ai-credit-tariff";
const initial:AdminAiTariffState={status:"idle",message:""};
export function AdminAiTariffs({rows,canEdit,locale,operationKey}:{rows:AiTariffRow[];canEdit:boolean;locale:"bn"|"en";operationKey:string}){
 const [state,action,pending]=useActionState(publishAdminAiTariff,initial);
 const [selected,setSelected]=useState("");
 const current=rows.find(row=>row.id===selected);
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const money=(minor:number)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
 return <section className="pa-surface pa-admin-credit-form" aria-labelledby="ai-tariff-title">
  <h2 id="ai-tariff-title">{t("AI models & rates","AI মডেল ও চার্জ")}</h2>
  <p className="pa-subtle">{t("Rates are in BDT per one million tokens. Each request is rounded up once to a paisa.","প্রতি দশ লাখ টোকেনের চার্জ টাকায় দিন। প্রতি অনুরোধের মোট চার্জ পরের পূর্ণ পয়সায় নেওয়া হবে।")}</p>
  <div className="pa-table-wrap"><table><thead><tr><th>{t("Model","মডেল")}</th><th>{t("Version","সংস্করণ")}</th><th>{t("Input / cached / output (৳)","ইনপুট / ক্যাশড / আউটপুট (৳)")}</th><th>{t("Status","অবস্থা")}</th></tr></thead><tbody>
   {rows.map(row=><tr key={row.id}><td>{row.model}</td><td>v{row.revision}</td><td>{money(row.terms.input_minor_per_million)} / {money(row.terms.cached_input_minor_per_million)} / {money(row.terms.output_minor_per_million)}</td><td>{row.active?t("Current","বর্তমান"):t("Previous","আগের")}</td></tr>)}
   {rows.length===0&&<tr><td colSpan={4} className="pa-empty-row">{t("No configured model rates. Paid AI remains unavailable.","মডেল ও চার্জ নির্ধারিত হয়নি। পেইড AI চালু নেই।")}</td></tr>}
  </tbody></table></div>
  {canEdit&&<form action={action} className="pa-admin-fields" key={selected+operationKey}>
   <input type="hidden" name="operation_key" value={operationKey}/>
   <input type="hidden" name="expected_version" value={current?.id??""}/>
   <label>{t("Configure model","মডেল নির্বাচন")}<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{t("New model","নতুন মডেল")}</option>{rows.filter(row=>row.active).map(row=><option key={row.id} value={row.id}>{row.model}</option>)}</select></label>
   <label>{t("OpenRouter model ID","OpenRouter মডেল ID")}<input name="model" defaultValue={current?.model??""} readOnly={!!current} placeholder="provider/model-id" required maxLength={200}/></label>
   <div className="pa-admin-form-pair">
    {([["input_rate","Input charge (৳ / 1M)","ইনপুট চার্জ (৳ / ১০ লাখ)",current?.terms.input_minor_per_million],
      ["cached_rate","Cached input charge (৳ / 1M)","ক্যাশড ইনপুট চার্জ (৳ / ১০ লাখ)",current?.terms.cached_input_minor_per_million],
      ["output_rate","Output charge (৳ / 1M)","আউটপুট চার্জ (৳ / ১০ লাখ)",current?.terms.output_minor_per_million],
      ["request_cap","Maximum charge / request (৳)","প্রতি অনুরোধে সর্বোচ্চ চার্জ (৳)",current?.terms.max_request_minor]] as const).map(([name,en,bn,value])=><label key={name}>{t(en,bn)}<input name={name} type="number" step="0.01" min="0" max="1000000" defaultValue={value===undefined?"":value/100} required/></label>)}
    <label>{t("Maximum input tokens","সর্বোচ্চ ইনপুট টোকেন")}<input name="max_input" type="number" min="1" max="100000000" step="1" defaultValue={current?.terms.max_input_tokens??""} required/></label>
    <label>{t("Maximum output tokens","সর্বোচ্চ আউটপুট টোকেন")}<input name="max_output" type="number" min="1" max="100000000" step="1" defaultValue={current?.terms.max_output_tokens??""} required/></label>
   </div>
   <label>{t("Audit reason","পরিবর্তনের কারণ")}<textarea name="reason" minLength={10} maxLength={500} required/></label>
   {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
   <button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?t("Publishing…","প্রকাশ হচ্ছে…"):t("Publish new rate version","নতুন চার্জ প্রকাশ করুন")}</button>
  </form>}
 </section>;
}
