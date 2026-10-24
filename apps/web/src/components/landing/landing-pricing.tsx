"use client";

import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import copy from "../../lib/landing-copy-pairs.json";

type Locale = "en" | "bn";
type Panel = "pay" | "ai" | "both";
const dictionary = new Map(copy.pairs.map(pair => [pair.en, pair.bn] as const));

/** The payment plan slot is rendered by the existing server-side plan query. */
export function LandingPricing({locale,pricing,aiPricing,bundlePricing}:{locale:Locale;pricing?:ReactNode;aiPricing?:ReactNode;bundlePricing?:ReactNode}) {
  const [panel,setPanel] = useState<Panel>("pay");
  const t = (en:string) => locale === "bn" ? dictionary.get(en) ?? en : en;
  const sections: {id:Panel; label:string}[] = [
    {id:"pay",label:"Payments"},
    {id:"ai",label:"AI Bot"},
    {id:"both",label:"AI + Payments"},
  ];
  function onTabKey(event:KeyboardEvent<HTMLButtonElement>,current:Panel){
    const position=sections.findIndex(item=>item.id===current);
    let next=-1;
    if(event.key==="ArrowRight")next=(position+1)%sections.length;
    if(event.key==="ArrowLeft")next=(position-1+sections.length)%sections.length;
    if(event.key==="Home")next=0;
    if(event.key==="End")next=sections.length-1;
    if(next<0)return;
    event.preventDefault();
    const target=sections[next].id;
    setPanel(target);
    document.getElementById(`ekm-tab-${target}`)?.focus();
  }
  return <>
    <div className="hd">
      <h2>{t("Plans follow your successful payments.")}</h2>
      <p>{locale==="bn"?"শুধু সফলভাবে যাচাই করা পেমেন্ট প্ল্যানের allowance-এ গণনা হয়। AI ক্রেডিট আলাদাভাবে প্রিপেইড রিচার্জ করা যায়; মূল্য ও মেয়াদ প্রকাশিত প্ল্যান অনুযায়ী দেখানো হবে।":"Only successfully verified payments count against plan allowances. AI credits are separately prepaid; pricing and periods follow the published catalog."}</p>
    </div>
    <div className="ptabs" role="tablist" aria-label={t("Pricing")}>{sections.map(({id,label})=><button
      key={id} role="tab" type="button" id={`ekm-tab-${id}`} aria-controls={`ekm-panel-${id}`}
      aria-selected={panel===id} tabIndex={panel===id?0:-1}
      onKeyDown={event=>onTabKey(event,id)}
      onClick={()=>setPanel(id)}>{t(label)}</button>)}</div>
    <div role="tabpanel" id="ekm-panel-pay" aria-labelledby="ekm-tab-pay" hidden={panel!=="pay"}>
      {pricing}
    </div>
    <div role="tabpanel" id="ekm-panel-ai" aria-labelledby="ekm-tab-ai" hidden={panel!=="ai"}>
      <div className="wide">
        <div><h3>{t("Pay as you go")}</h3><p>{locale==="bn"?"এআই ক্রেডিট আলাদাভাবে রিচার্জ করে ব্যবহার করা যায়। মূল্য ও উপলব্ধতা আপনার ব্যবসাে দেখুন।":"AI usage uses separate prepaid credit. Check your business for current rates and availability."}</p><Link className="btn" href="/register">{t("Start free")}</Link></div>
        <div><span className="pill">{t("Pay as you go")}</span><ul>{["Customer replies","Image search","Posts & comments","Order taking"].map(x=><li key={x}>{t(x)}</li>)}</ul></div>
      </div>
      {aiPricing}
    </div>
    <div role="tabpanel" id="ekm-panel-both" aria-labelledby="ekm-tab-both" hidden={panel!=="both"}>
      <div className="wide dk">
        <div><h3>{locale==="bn"?"এআই ও পেমেন্ট একসাথে।":"Use AI and payments together."}</h3><p>{locale==="bn"?"এআই বটের প্রিপেইড ক্রেডিট ও পেমেন্ট প্ল্যান আলাদা। বর্তমানে প্রযোজ্য অফার ও শর্ত ব্যবসাে দেখুন।":"The AI bot keeps separate prepaid billing. See your business for current payment-plan terms and any available offers."}</p><Link className="btn" href="/register">{t("Start free")}</Link></div>
        <div className="mix"><div><b>{t("AI Bot")}</b><span>{t("Pay as you go")}</span></div><ul>{["Customer orders in the chat","AI asks the payment server","Dashboard shows the result"].map(x=><li key={x}>{t(x)}</li>)}</ul></div>
      </div>
      {bundlePricing}
    </div>
    <div className="perks">{["Failed payments don't count","Retries don't count","Repeat verification is never double counted","Wallet fees are separate","No cut from your sales"].map(x=><span key={x}>{t(x)}</span>)}</div>
  </>;
}
