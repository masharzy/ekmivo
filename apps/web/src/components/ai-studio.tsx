"use client";
import {useCallback,useEffect,useRef,useState,useTransition} from "react";
import {loadAiStudio,readAiKnowledge,saveAiStudio,searchAiKnowledge} from "../actions/ai-studio";
import {registerDraft} from "../lib/client/draft-navigation";
import type {AiStudioCommand,AiStudioConfig,AiStudioData,AiStudioError,AiStudioView,KnowledgeDocument,KnowledgeMatch} from "../lib/ai-studio";
import "./store-profile-editor.css";
const emptyConfig:AiStudioConfig={instructions:"",mode:"off",language:"auto",tone:"neutral",model:""};
const emptyDocument:KnowledgeDocument={id:"",version:"",title:"",kind:"text",content:""};
const errors:Record<AiStudioError,[string,string]>={
 invalid:["Check the fields, model, confirmation and reason.","তথ্য, মডেল, সম্মতি ও কারণ পরীক্ষা করুন।"],
 forbidden:["You no longer have permission to manage this business's AI.","এই ব্যবসার AI পরিচালনার অনুমতি নেই।"],
 "stale-business":["The selected business changed. Reopen this page.","নির্বাচিত ব্যবসা বদলেছে। পৃষ্ঠাটি আবার খুলুন।"],
 conflict:["This configuration changed. Keep your edits, then refresh before retrying.","সেটিংস বদলেছে। আপনার লেখা রেখে রিফ্রেশ করে আবার চেষ্টা করুন।"],
 "rate-limit":["Too many changes. Wait a minute and retry.","অনেক পরিবর্তন হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।"],
 unavailable:["AI configuration is unavailable. Your unsaved text is preserved; retry.","AI সেটিংস এখন পাওয়া যাচ্ছে না। আপনার লেখা আছে; আবার চেষ্টা করুন।"]
};
export function AiStudio({workspaceId,locale,initial,view,runtimeEnabled}:{workspaceId:string;locale:"en"|"bn";initial:AiStudioView;view:"assistant"|"knowledge";runtimeEnabled:boolean}){
 const bn=locale==="bn",t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const [state,setState]=useState(initial),[config,setConfig]=useState<AiStudioConfig>(initial.status==="ready"?initial.data.config:emptyConfig);
 const [doc,setDoc]=useState<KnowledgeDocument>(emptyDocument),[savedDoc,setSavedDoc]=useState(emptyDocument);
 const [busy,setBusy]=useState(false),[pending,startTransition]=useTransition(),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false),[rollbackTarget,setRollbackTarget]=useState("");
 const [removeId,setRemoveId]=useState(""),[query,setQuery]=useState(""),[publishedSearch,setPublishedSearch]=useState(false),[matches,setMatches]=useState<KnowledgeMatch[]>([]),[searched,setSearched]=useState(false);
 const lock=useRef(false),operation=useRef<{fingerprint:string;key:string}|null>(null),newSourceId=useRef("");
 const data=state.status==="ready"?state.data:null;
 const configDirty=!!data&&JSON.stringify(config)!==JSON.stringify(data.config),docDirty=JSON.stringify(doc)!==JSON.stringify(savedDoc),dirty=configDirty||docDirty;
 const accept=useCallback((next:AiStudioData)=>{setState({status:"ready",data:next});setConfig(next.config);},[]);
 const showError=useCallback((code:string)=>{
  setError((errors[code as AiStudioError]??errors.unavailable)[bn?1:0]);
  if(code==="forbidden"||code==="stale-business"){setState({status:"forbidden"});setMatches([]);setSearched(false);}
 },[bn]);
 const perform=useCallback((kind:AiStudioCommand,payload:object):Promise<boolean>=>new Promise(resolve=>{
  if(lock.current){resolve(false);return;}
  lock.current=true;setBusy(true);setError("");setNotice("");
  startTransition(async()=>{
   try{
    const fingerprint=JSON.stringify([kind,payload]);
    if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
    const result=await saveAiStudio(workspaceId,operation.current.key,kind,payload);
    if(result.status!=="success"){
     showError(result.code);
     if(result.code==="forbidden"||result.code==="stale-business")setState({status:"forbidden"});
     resolve(false);return;
    }
    operation.current=null;accept(result.data);setNotice(t("Saved.","সংরক্ষিত হয়েছে।"));resolve(true);
   }catch{showError("unavailable");resolve(false);}
   finally{lock.current=false;setBusy(false);}
  });
 }),[accept,showError,t,workspaceId]);
 const saveConfig=useCallback(()=>data?perform("draft",{revision:data.revision,config}):Promise.resolve(false),[config,data,perform]);
 const saveSource=useCallback(async()=>{
  if(!doc.title.trim()||!doc.content.trim()){showError("invalid");return false;}
  newSourceId.current||=doc.id||crypto.randomUUID();
  const saved=await perform("source",{id:newSourceId.current,expected_version:doc.version||null,title:doc.title,kind:doc.kind,content:doc.content});
  if(saved){setDoc(emptyDocument);setSavedDoc(emptyDocument);newSourceId.current="";setSearched(false);setMatches([]);}
  return saved;
 },[doc,perform,showError]);
 useEffect(()=>registerDraft({id:"ai-studio:"+workspaceId+":"+view,isDirty:()=>dirty,
  save:async()=>{if(configDirty&&!await saveConfig())return false;if(docDirty&&!await saveSource())return false;return true;},
  discard:()=>{if(data)setConfig(data.config);setDoc(savedDoc);}
 }),[configDirty,data,dirty,docDirty,saveConfig,saveSource,savedDoc,view,workspaceId]);
 useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[dirty]);
 function refresh(sourceOffset=0,versionOffset=0){
  if(lock.current||dirty)return;
  lock.current=true;setBusy(true);setError("");
  startTransition(async()=>{try{const next=await loadAiStudio(workspaceId,sourceOffset,versionOffset);if(next.status==="success")accept(next.data);else showError(next.code);}catch{showError("unavailable");}finally{lock.current=false;setBusy(false);}});
 }
 function edit(source:string){
  if(lock.current||dirty)return;
  lock.current=true;setBusy(true);setError("");
  startTransition(async()=>{try{const next=await readAiKnowledge(workspaceId,source);if(next.document){setDoc(next.document);setSavedDoc(next.document);newSourceId.current=next.document.id;}else showError(next.error??"unavailable");}catch{showError("unavailable");}finally{lock.current=false;setBusy(false);}});
 }
 const disabled=busy||pending;
 if(state.status!=="ready")return <section className="store-settings-page"><h1>{view==="knowledge"?t("Knowledge base","নলেজ বেস"):t("AI assistant","AI সহকারী")}</h1><p role="alert">{state.status==="forbidden"?t("Owner or permitted admin access is required.","মালিক অথবা অনুমতিপ্রাপ্ত অ্যাডমিন প্রয়োজন।"):t("AI configuration is unavailable. No changes can be saved yet.","AI সেটিংস পাওয়া যাচ্ছে না। এখন পরিবর্তন সংরক্ষণ করা যাবে না।")}</p>{error&&<p role="alert">{error}</p>}<button type="button" className="ss-btn" disabled={disabled} onClick={()=>refresh()}>{t("Retry","আবার চেষ্টা করুন")}</button></section>;
 const current=state.data;
 return <section className="store-settings-page" lang={locale}>
  <header className="ss-header"><div><h1>{view==="knowledge"?t("Knowledge base","নলেজ বেস"):t("AI assistant","AI সহকারী")}</h1><p>{t("Draft changes stay private until explicitly published.","স্পষ্টভাবে প্রকাশ না করা পর্যন্ত draft পরিবর্তন live হবে না।")}</p></div><button type="button" className="ss-btn" disabled={disabled||dirty} onClick={()=>refresh()}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<p className="ss-error" role="alert">{error}</p>}{notice&&<p className="ss-toast" role="status">{notice}</p>}
  {view==="assistant"?<>
   <form className="ss-panel" onSubmit={event=>{event.preventDefault();void saveConfig();}}>
    <div className="ss-section"><h2>{t("Assistant draft","সহকারীর draft")} · {current.revision}</h2><div className="ss-grid">
     <label className="ss-field"><span>{t("Reply mode","উত্তরের ধরন")}</span><select value={config.mode} disabled={disabled} onChange={e=>setConfig({...config,mode:e.target.value as AiStudioConfig["mode"]})}><option value="off">{t("Off","বন্ধ")}</option><option value="practice">{t("Practice","অনুশীলন")}</option><option value="live">{t("Live","লাইভ")}</option></select></label>
     <label className="ss-field"><span>{t("Language","ভাষা")}</span><select value={config.language} disabled={disabled} onChange={e=>setConfig({...config,language:e.target.value as AiStudioConfig["language"]})}><option value="auto">{t("Customer's language","গ্রাহকের ভাষা")}</option><option value="bn">বাংলা</option><option value="en">English</option></select></label>
     <label className="ss-field"><span>{t("Tone","ভঙ্গি")}</span><select value={config.tone} disabled={disabled} onChange={e=>setConfig({...config,tone:e.target.value as AiStudioConfig["tone"]})}><option value="neutral">{t("Neutral","সাধারণ")}</option><option value="friendly">{t("Friendly","বন্ধুসুলভ")}</option><option value="formal">{t("Formal","আনুষ্ঠানিক")}</option></select></label>
     <label className="ss-field"><span>{t("Metered model","ব্যবহার অনুযায়ী বিলের মডেল")}</span><select value={config.model} disabled={disabled} onChange={e=>setConfig({...config,model:e.target.value})}><option value="">{t("Select a configured model","কনফিগার করা মডেল বেছে নিন")}</option>{current.models.map(model=><option key={model} value={model}>{model}</option>)}</select></label>
     <label className="ss-field ss-full"><span>{t("Instructions","নির্দেশনা")}</span><textarea rows={10} maxLength={16000} value={config.instructions} disabled={disabled} onChange={e=>setConfig({...config,instructions:e.target.value})}/></label>
    </div><div className="ss-actions"><button className="ss-btn" type="submit" disabled={disabled||!configDirty}>{t("Save draft","Draft সংরক্ষণ")}</button><button className="ss-btn" type="button" disabled={disabled||!configDirty} onClick={()=>setConfig(current.config)}>{t("Discard edits","পরিবর্তন বাতিল")}</button></div></div>
   </form>
   <form className="ss-panel" onSubmit={event=>{event.preventDefault();void perform(rollbackTarget?"rollback":"publish",{revision:current.revision,reason,confirmed,...(rollbackTarget?{target:rollbackTarget}:{})}).then(ok=>{if(ok){setConfirmed(false);setReason("");setRollbackTarget("");}});}}>
    <div className="ss-section"><h2>{t("Publish and history","প্রকাশ ও ইতিহাস")}</h2><p>{runtimeEnabled?t("Paid replies still require available credits and a connected channel.","পেইড উত্তর দিতে ক্রেডিট ও সংযুক্ত চ্যানেল প্রয়োজন।"):t("Paid AI replies are currently paused. Publishing saves configuration and does not enable paid replies.","পেইড AI উত্তর বর্তমানে বন্ধ। প্রকাশ করলে সেটিংস সংরক্ষিত হবে, পেইড উত্তর চালু হবে না।")}</p>
     {current.published&&<details><summary>{t("Compare with published instructions","প্রকাশিত নির্দেশনার সঙ্গে তুলনা")}</summary><label className="ss-field"><span>{t("Published instructions","প্রকাশিত নির্দেশনা")}</span><textarea readOnly rows={6} value={current.published.instructions}/></label></details>}
     <label className="ss-field"><span>{t("Publish saved draft or restore version","সংরক্ষিত draft প্রকাশ অথবা পুরোনো সংস্করণ ফেরত")}</span><select value={rollbackTarget} disabled={disabled||dirty} onChange={e=>setRollbackTarget(e.target.value)}><option value="">{t("Publish saved draft","সংরক্ষিত draft প্রকাশ")}</option>{current.versions.map(v=><option key={v.id} value={v.id}>{v.publication} · {v.reason}</option>)}</select></label>
     <div className="ss-actions"><button type="button" className="ss-btn" disabled={disabled||dirty||current.version_offset===0} onClick={()=>refresh(current.source_offset,Math.max(0,current.version_offset-20))}>{t("Newer versions","নতুন সংস্করণ")}</button><button type="button" className="ss-btn" disabled={disabled||dirty||!current.more_versions} onClick={()=>refresh(current.source_offset,current.version_offset+20)}>{t("Older versions","পুরোনো সংস্করণ")}</button></div>
     <label className="ss-field"><span>{t("Reason (10–500 characters)","কারণ (১০–৫০০ অক্ষর)")}</span><input value={reason} minLength={10} maxLength={500} required disabled={disabled||dirty} onChange={e=>setReason(e.target.value)}/></label>
     <label><input type="checkbox" checked={confirmed} disabled={disabled||dirty} onChange={e=>setConfirmed(e.target.checked)}/>{t("I confirm this publication replaces the active configuration.","এই প্রকাশ সক্রিয় সেটিংস বদলে দেবে—আমি সম্মত।")}</label>
     <button className="ss-btn" type="submit" disabled={disabled||dirty||!confirmed||reason.trim().length<10||current.revision===0}>{rollbackTarget?t("Restore as new publication","নতুন প্রকাশ হিসেবে ফেরত"):t("Publish configuration","সেটিংস প্রকাশ")}</button>
    </div>
   </form>
  </>:<>
   <form className="ss-panel" onSubmit={e=>{e.preventDefault();void saveSource();}}><div className="ss-section"><h2>{t("Knowledge source","নলেজের উৎস")}</h2><div className="ss-grid">
    <label className="ss-field"><span>{t("Title or question","শিরোনাম অথবা প্রশ্ন")}</span><input value={doc.title} required maxLength={160} disabled={disabled} onChange={e=>setDoc({...doc,title:e.target.value})}/></label>
    <label className="ss-field"><span>{t("Source type","উৎসের ধরন")}</span><select value={doc.kind} disabled={disabled} onChange={e=>setDoc({...doc,kind:e.target.value})}><option value="text">Text</option><option value="qa">Q&amp;A</option><option value="markdown">Markdown</option><option value="csv">CSV</option></select></label>
    <label className="ss-field ss-full"><span>{t("Content or answer","বিষয়বস্তু অথবা উত্তর")}</span><textarea rows={10} value={doc.content} required maxLength={100000} disabled={disabled} onChange={e=>setDoc({...doc,content:e.target.value})}/></label>
    <label className="ss-field"><span>{t("Import TXT, MD or CSV (100 KB)","TXT, MD অথবা CSV আনুন (১০০ KB)")}</span><input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" disabled={disabled} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(file.size>100000||!/[.](txt|md|csv)$/i.test(file.name)){showError("invalid");return;}lock.current=true;setBusy(true);void file.text().then(content=>{if(content.includes("\0")){showError("invalid");return;}const name=file.name.toLowerCase();setDoc(old=>({...old,title:old.title||file.name,kind:name.endsWith(".md")?"markdown":name.endsWith(".csv")?"csv":"text",content}));}).catch(()=>showError("invalid")).finally(()=>{lock.current=false;setBusy(false);});}}/></label>
   </div><div className="ss-actions"><button className="ss-btn" type="submit" disabled={disabled||!docDirty}>{t("Save source","উৎস সংরক্ষণ")}</button><button className="ss-btn" type="button" disabled={disabled} onClick={()=>{setDoc(emptyDocument);setSavedDoc(emptyDocument);newSourceId.current="";}}>{t("Clear editor","লেখা খালি করুন")}</button></div></div></form>
   <div className="ss-panel"><div className="ss-section"><h2>{t("Saved sources","সংরক্ষিত উৎস")}</h2>{current.sources.length===0?<p>{t("No saved sources on this page.","এই পৃষ্ঠায় সংরক্ষিত উৎস নেই।")}</p>:<ul>{current.sources.map(source=><li key={source.id}>{source.title} · {source.characters} <button className="ss-btn" type="button" disabled={disabled||dirty} onClick={()=>edit(source.id)}>{t("Edit","সম্পাদনা")}</button><button className="ss-btn" type="button" disabled={disabled||dirty} onClick={()=>setRemoveId(source.id)}>{t("Remove","সরান")}</button>{removeId===source.id&&<span>{t("Remove from draft and published retrieval?","Draft ও প্রকাশিত retrieval থেকে সরাবেন?")} <button className="ss-btn" type="button" disabled={disabled} onClick={()=>void perform("archive",{id:source.id,expected_version:source.current_version}).then(ok=>{if(ok){setRemoveId("");setMatches([]);setSearched(false);}})}>{t("Confirm removal","সরানো নিশ্চিত করুন")}</button><button className="ss-btn" type="button" onClick={()=>setRemoveId("")}>{t("Cancel","বাতিল")}</button></span>}</li>)}</ul>}
    <div className="ss-actions"><button type="button" className="ss-btn" disabled={disabled||dirty||current.source_offset===0} onClick={()=>refresh(Math.max(0,current.source_offset-50),current.version_offset)}>{t("Previous sources","আগের উৎস")}</button><button type="button" className="ss-btn" disabled={disabled||dirty||!current.more_sources} onClick={()=>refresh(current.source_offset+50,current.version_offset)}>{t("More sources","আরও উৎস")}</button></div></div></div>
   <form className="ss-panel" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError("");startTransition(async()=>{try{const result=await searchAiKnowledge(workspaceId,query,publishedSearch);if(result.error)showError(result.error);else{setMatches(result.items);setSearched(true);}}catch{showError("unavailable");}finally{lock.current=false;setBusy(false);}});}}><div className="ss-section"><h2>{t("Retrieval preview","Retrieval যাচাই")}</h2><p>{t("Searches saved text only; no AI credits are used.","শুধু সংরক্ষিত লেখায় খোঁজে; AI ক্রেডিট খরচ হয় না।")}</p><label className="ss-field"><span>{t("Test question","পরীক্ষার প্রশ্ন")}</span><input value={query} required maxLength={1000} onChange={e=>{setQuery(e.target.value);setSearched(false);setMatches([]);}}/></label><label><input type="checkbox" checked={publishedSearch} onChange={e=>{setPublishedSearch(e.target.checked);setSearched(false);setMatches([]);}}/>{t("Search published sources","প্রকাশিত উৎসে খুঁজুন")}</label><button className="ss-btn" type="submit" disabled={disabled||dirty||!query.trim()}>{t("Search sources","উৎসে খুঁজুন")}</button>{searched&&(matches.length?<ul>{matches.map(m=><li key={m.id}><strong>{m.title}</strong><p>{m.content}</p></li>)}</ul>:<p role="status">{t("No matching sources.","মিলে এমন কোনো উৎস নেই।")}</p>)}</div></form>
  </>}
 </section>;
}
