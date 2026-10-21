"use client";
import {useRef,useState} from "react";
import {studioRequestKey} from "../lib/client/studio-requests";
import type {AiStudioConfig} from "../lib/ai-studio";
import {loadAiStudio} from "../actions/ai-studio";
export function AiStudioTest({workspaceId,actorId,revision,publicationId,disabled,runtimeEnabled,bn,currentConfig,onProposal}:{workspaceId:string;actorId:string;revision:number;publicationId:string|null;disabled:boolean;runtimeEnabled:boolean;bn:boolean;currentConfig:AiStudioConfig;onProposal:(proposal:AiStudioConfig)=>void}){
 const t=(en:string,be:string)=>bn?be:en;
 const [purpose,setPurpose]=useState<"answer"|"edit">("answer");
 const [question,setQuestion]=useState(""),[published,setPublished]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[answer,setAnswer]=useState<{text?:string;cost_minor?:number;review_required?:boolean;proposal?:AiStudioConfig;invalid_proposal?:boolean}|null>(null);
 const lock=useRef(false),operation=useRef<{fingerprint:string;key:string}|null>(null);
 async function run(){
  if(lock.current||disabled||!runtimeEnabled||!consent||!question.trim())return;
  lock.current=true;setBusy(true);setError("");setAnswer(null);
  try{
   const current=await loadAiStudio(workspaceId);
   if(current.status!=="success"||current.data.revision!==revision||current.data.published_id!==publicationId){setError(t("This business or assistant changed. Refresh before testing.","ব্যবসা বা সহকারী বদলেছে। পরীক্ষা করার আগে রিফ্রেশ করুন।"));return;}
   const body={revision,purpose,published,publication_id:published?publicationId:null,question},fingerprint=JSON.stringify(body);
   if(operation.current?.fingerprint!==fingerprint){const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(fingerprint))),x=>x.toString(16).padStart(2,"0")).join("");operation.current={fingerprint,key:studioRequestKey(sessionStorage,actorId,workspaceId,hash)};}
   const response=await fetch(`/api/go/workspaces/${workspaceId}/ai/studio-test`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":operation.current.key},body:JSON.stringify(body),signal:AbortSignal.timeout(48000)});
   const result=await response.json();
   if(!response.ok){
    const messages:Record<string,[string,string]>={AI_CREDITS_INSUFFICIENT:["Insufficient AI credits.","পর্যাপ্ত AI ক্রেডিট নেই।"],AI_REQUEST_RECOVERY_PENDING:["The outcome needs recovery. Retry preserves this request.","ফলাফল যাচাই প্রয়োজন। আবার চেষ্টা করলে একই অনুরোধ থাকবে।"],AI_RUNTIME_NOT_ENABLED:["Paid AI testing is paused.","পেইড AI পরীক্ষা বন্ধ আছে।"],AI_CONTEXT_TOO_LARGE:["Shorten the instructions or question.","নির্দেশনা অথবা প্রশ্ন ছোট করুন।"],ASSISTANT_CHANGED:["The assistant changed. Refresh first.","সহকারী বদলেছে। আগে রিফ্রেশ করুন।"]};
    setError(messages[String(result.code)]?.[bn?1:0]??t("Test unavailable. Retry the same question to recover this request.","পরীক্ষা পাওয়া যাচ্ছে না। একই অনুরোধের জন্য একই প্রশ্ন আবার চেষ্টা করুন।"));return;
   }
   setAnswer(result);
  }catch{setError(t("The result could not be loaded. Retry preserves the request key.","ফলাফল পাওয়া যায়নি। আবার চেষ্টা করলে একই অনুরোধ থাকবে।"));}
  finally{lock.current=false;setBusy(false);}
 }
 return <form className="ss-panel" onSubmit={event=>{event.preventDefault();void run();}}><div className="ss-section"><h2>{t("Practice and edit","পরীক্ষা ও সম্পাদনা")}</h2>
  <label className="ss-field"><span>{t("Practice task","পরীক্ষার কাজ")}</span><select aria-label={t("Practice task","পরীক্ষার কাজ")} value={purpose} disabled={busy||disabled} onChange={e=>{setPurpose(e.target.value as "answer"|"edit");setPublished(false);setAnswer(null);}}><option value="answer">{t("Test an answer","একটি উত্তর পরীক্ষা")}</option><option value="edit">{t("Propose instruction changes","নির্দেশনা পরিবর্তনের প্রস্তাব")}</option></select></label>
  {!runtimeEnabled&&<p role="status">{t("Paid AI testing is currently paused.","পেইড AI পরীক্ষা বর্তমানে বন্ধ।")}</p>}
  <label className="ss-field"><span>{purpose==="edit"?t("Requested change","কী পরিবর্তন চান"):t("Test question","পরীক্ষার প্রশ্ন")}</span><textarea aria-label={purpose==="edit"?t("Requested change","কী পরিবর্তন চান"):t("Test question","পরীক্ষার প্রশ্ন")} rows={3} maxLength={2000} value={question} disabled={busy||disabled} onChange={event=>setQuestion(event.target.value)}/></label>
  {purpose==="answer"&&<label><input type="checkbox" checked={published} disabled={busy||disabled||!publicationId} onChange={event=>{setPublished(event.target.checked);setAnswer(null);}}/>{t("Use the published version","প্রকাশিত সংস্করণ ব্যবহার করুন")}</label>}
  <p>{t("Save draft changes first. Tests use matching knowledge and product facts and send no customer message.","আগে draft সংরক্ষণ করুন। পরীক্ষা মিল থাকা নলেজ ও পণ্যের তথ্য ব্যবহার করবে; গ্রাহককে মেসেজ পাঠাবে না।")}</p>
  <label><input type="checkbox" checked={consent} disabled={busy||disabled||!runtimeEnabled} onChange={event=>setConsent(event.target.checked)}/>{t("I agree to use AI credits for this test.","এই পরীক্ষায় AI ক্রেডিট ব্যবহারে সম্মত।")}</label>
  <button className="ss-btn" type="submit" disabled={busy||disabled||!runtimeEnabled||!consent||!question.trim()}>{busy?t("Testing…","পরীক্ষা চলছে…"):purpose==="edit"?t("Propose edit","সম্পাদনার প্রস্তাব"):t("Test answer","উত্তর পরীক্ষা")}</button>
  {error&&<p className="ss-error" role="alert">{error}</p>}
  {answer&&<div role="status">{answer.proposal?<><p>{t("Compare before applying. This proposal has not been saved or published.","প্রয়োগের আগে তুলনা করুন। প্রস্তাবটি সংরক্ষণ বা প্রকাশ হয়নি।")}</p><div className="ss-grid"><label className="ss-field"><span>{t("Current draft instructions","বর্তমান draft নির্দেশনা")}</span><textarea readOnly rows={6} value={currentConfig.instructions}/></label><label className="ss-field"><span>{t("Proposed instructions","প্রস্তাবিত নির্দেশনা")}</span><textarea readOnly rows={6} value={answer.proposal.instructions}/></label></div><p>{t("Mode / language / tone: ","ধরন / ভাষা / ভঙ্গি: ")}{currentConfig.mode} / {currentConfig.language} / {currentConfig.tone} → {answer.proposal.mode} / {answer.proposal.language} / {answer.proposal.tone}</p><button className="ss-btn" type="button" disabled={disabled||busy} onClick={()=>{if(answer.proposal){onProposal(answer.proposal);setAnswer(null);}}}>{t("Apply to unsaved draft","অসংরক্ষিত draft-এ প্রয়োগ")}</button><p>{t("Credits used: ","ব্যবহৃত ক্রেডিট: ")}{((answer.cost_minor??0)/100).toFixed(2)}</p></>:answer.invalid_proposal?<p>{t("The generated proposal was invalid and has not been applied. Credits used: ","প্রস্তাবটি সঠিক হয়নি; প্রয়োগ করা হয়নি। ব্যবহৃত ক্রেডিট: ")}{((answer.cost_minor??0)/100).toFixed(2)}</p>:answer.review_required?<p>{t("No matching verified facts. A human should answer. No credits used.","মিল থাকা যাচাইকৃত তথ্য নেই। একজন মানুষ উত্তর দেবেন। ক্রেডিট ব্যবহার হয়নি।")}</p>:<><p style={{whiteSpace:"pre-wrap"}}>{answer.text}</p><p>{t("Credits used: ","ব্যবহৃত ক্রেডিট: ")}{((answer.cost_minor??0)/100).toFixed(2)}</p></>}</div>}
 </div></form>;
}
