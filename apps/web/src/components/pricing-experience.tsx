"use client";
import Link from "next/link";
import {useMemo,useState} from "react";
import {yearlyDiscount,type PricingPlan} from "../lib/pricing-catalog";

type Locale="en"|"bn";type Tab="payments"|"ai"|"both";type Term="monthly"|"yearly";
const AI_MIN=20,AI_MAX=100000;
const COPY={
 bn:{
  tabs:{payments:"পেমেন্ট গেটওয়ে",ai:"এআই বট",both:"দুটোই"},tabsLabel:"কী নেবেন",
  monthly:"মাসিক",yearly:"বার্ষিক",term:"বিলিং মেয়াদ",upTo:(p:string)=>`বার্ষিকে ${p}% পর্যন্ত ছাড়`,
  perM:"/ মাস",perY:"/ বছর",forever:"/ চিরকাল",free:"ফ্রি",
  yearNote:(m:string,s:string,p:string)=>`মাসে ${m} পড়ে · বছরে ${s} বাঁচে (${p}% ছাড়)`,
  startFree:"ফ্রি শুরু করুন",take:(n:string)=>`${n} নিন`,talk:"যোগাযোগ করুন",
  payNote:"ব্যর্থ বা মেয়াদ শেষ হওয়া পেমেন্ট গোনা হয় না। পেমেন্ট প্রোভাইডারের নিজের চার্জ আলাদা।",
  noPlans:"এখনো কোনো প্ল্যান প্রকাশ করা হয়নি।",unavailable:"প্ল্যানের তথ্য এখন পাওয়া যাচ্ছে না। একটু পরে আবার দেখুন।",
  crTitle:"এআই ক্রেডিট কীভাবে কাটে",
  cr:[["টাকায় রিচার্জ","যত টাকা রিচার্জ করবেন, ব্যালেন্স তত টাকা।"],["প্রতি উত্তরে আসল খরচ","এআই উত্তর লিখতে আর পণ্য খুঁজতে যত খরচ করে, ততটুকু কাটে।"],["আপনার উত্তরে কাটে না","আপনি বা আপনার টিম উত্তর দিলে কিছু কাটে না।"]],
  freeTitle:"ফ্রি",freeAmt:"৳৩০",freeSub:"এআই ক্রেডিট, একবার",freeBody:"প্রতি ব্যবসায় একবার। পেমেন্ট লাগবে না।",getFree:"৳৩০ ফ্রি নিন",
  customTitle:"নিজের পছন্দের রিচার্জ",customBody:"যত টাকা দরকার, রিচার্জ করুন।",amount:"টাকার পরিমাণ",min:`সর্বনিম্ন ৳২০`,recharge:"রিচার্জ করুন",
  amountErr:"৳২০ থেকে ৳১,০০,০০০-এর মধ্যে পুরো টাকা দিন।",
  aiNote:"প্রতিটা উত্তরের খরচ আলাদা: উত্তর কত বড়, কতবার খুঁজতে হল, ছবি বা ভয়েস ছিল কি না তার ওপর নির্ভর করে।",
  steps:["পেমেন্ট প্ল্যান","এআই ক্রেডিট","চেকআউট"],stepsLabel:"ধাপ",s1h:"ধাপ ১: কোন পেমেন্ট প্ল্যান নেবেন?",s2h:"ধাপ ২: এআই ক্রেডিট",
  freeOpt:"৳৩০ ফ্রি ক্রেডিট",freeOptSub:"কোনো বাড়তি টাকা লাগবে না",customOpt:"নিজের পছন্দের রিচার্জ",customOptSub:"সর্বনিম্ন ৳২০, একই পেমেন্টে",
  comboSoon:"একই পেমেন্টে রিচার্জ শিগগিরই আসছে। এখন প্ল্যান নিয়ে পরে ড্যাশবোর্ড থেকে রিচার্জ করুন।",
  sumPlan:"পেমেন্ট প্ল্যান",sumCredit:"এআই ক্রেডিট",sumTotal:"মোট",pickNext:"পরের ধাপে বেছে নিন",freeAfter:"৳৩০ ফ্রি (পেমেন্টের পর)",
  next:"পরের ধাপ: এআই ক্রেডিট",checkout:"চেকআউটে যান",
  faqH:"প্রশ্ন ও উত্তর",
  faq:[["একটা উত্তরে কত টাকা কাটে?","নির্দিষ্ট কোনো দাম নেই। এআই উত্তর লিখতে আর পণ্য খুঁজতে যত খরচ করে, ঠিক ততটুকু কাটে। প্রতিটা উত্তরের খরচ ড্যাশবোর্ডের স্টেটমেন্টে দেখবেন।"],["ব্যালেন্স শেষ হলে কী হবে?","আবার রিচার্জ করে ব্যালেন্স বাড়াতে পারবেন। নিজে থেকে কোনো টাকা কাটা হয় না।"],["পেমেন্ট প্ল্যান কখন চালু হয়?","পেমেন্ট যাচাই হওয়ার সাথে সাথে।"],["শুধু এআই বট নিলে পেমেন্ট প্ল্যান লাগবে?","না। শুধু ক্রেডিট রিচার্জ করলেই এআই বট চলবে।"]]
 },
 en:{
  tabs:{payments:"Payment gateway",ai:"AI Bot",both:"Both"},tabsLabel:"What you need",
  monthly:"Monthly",yearly:"Yearly",term:"Billing period",upTo:(p:string)=>`Up to ${p}% off yearly`,
  perM:"/ month",perY:"/ year",forever:"/ forever",free:"Free",
  yearNote:(m:string,s:string,p:string)=>`${m} a month · save ${s} a year (${p}% off)`,
  startFree:"Start free",take:(n:string)=>`Get ${n}`,talk:"Contact us",
  payNote:"Failed or expired payments are not counted. Payment-provider charges are separate.",
  noPlans:"No plans have been published yet.",unavailable:"Pricing is temporarily unavailable. Please try again later.",
  crTitle:"How AI credit is used",
  cr:[["Recharge in taka","Your balance is the amount you recharge."],["Real cost per reply","Each AI reply deducts what it cost to write it and search your products."],["Your replies are free","Nothing is deducted when you or your team reply."]],
  freeTitle:"Free",freeAmt:"৳30",freeSub:"AI credit, once",freeBody:"Once per business. No payment needed.",getFree:"Get ৳30 free",
  customTitle:"Your own amount",customBody:"Recharge the amount you need.",amount:"Amount in taka",min:"Minimum ৳20",recharge:"Recharge",
  amountErr:"Enter a whole amount from ৳20 to ৳100,000.",
  aiNote:"Each reply costs a different amount: it depends on the reply length, how much searching it needed, and whether there was a photo or voice note.",
  steps:["Payment plan","AI credit","Checkout"],stepsLabel:"Steps",s1h:"Step 1: Which payment plan?",s2h:"Step 2: AI credit",
  freeOpt:"৳30 free credit",freeOptSub:"Nothing extra to pay",customOpt:"Your own recharge",customOptSub:"Minimum ৳20, in the same payment",
  comboSoon:"Recharging in the same payment is coming soon. For now, take the plan and recharge later from your dashboard.",
  sumPlan:"Payment plan",sumCredit:"AI credit",sumTotal:"Total",pickNext:"Choose in the next step",freeAfter:"৳30 free (after payment)",
  next:"Next: AI credit",checkout:"Go to checkout",
  faqH:"Questions",
  faq:[["How much does one reply cost?","There is no fixed price. Each reply deducts exactly what the AI spent writing it and searching your products. Every reply’s cost is in your dashboard statement."],["What happens when the balance runs out?","Recharge to top up. Nothing is charged automatically."],["When does a payment plan start?","As soon as the payment is verified."],["Do I need a payment plan for the AI bot?","No. A credit recharge on its own is enough to run the AI bot."]]
 }
} as const;
const ICONS=["","M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z","M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"];

/** comboEnabled must stay false until the one-order plan + recharge checkout exists on the server. */
export function PricingExperience({locale,plans,unavailable,signedIn,freeEnabled,comboEnabled=false,initialTab="payments"}:{
 locale:Locale;plans:PricingPlan[];unavailable:boolean;signedIn:boolean;freeEnabled:boolean;comboEnabled?:false;initialTab?:Tab;
}){
 const c=COPY[locale],bn=locale==="bn";
 const money=(minor:number)=>"৳"+new Intl.NumberFormat(bn?"bn-BD":"en-BD",{maximumFractionDigits:2}).format(minor/100);
 const num=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(n);
 const hasYearly=plans.some(p=>p.yearly);
 const [tab,setTab]=useState<Tab>(initialTab);
 const [term,setTerm]=useState<Term>("monthly");
 const [step,setStep]=useState<1|2>(1);
 const paid=useMemo(()=>plans.filter(p=>!p.free&&!p.custom&&(p.monthly||p.yearly)),[plans]);
 const [planId,setPlanId]=useState<string>(paid[0]?.id||"");
 const [credit,setCredit]=useState<"free"|"custom">(freeEnabled?"free":"custom");
 const [amount,setAmount]=useState("500");
 const amt=Number(amount),amountOk=/^[0-9]+$/.test(amount)&&amt>=AI_MIN&&amt<=AI_MAX;
 const maxPct=Math.max(0,...plans.map(p=>yearlyDiscount(p)??0));
 const option=(p:PricingPlan)=>term==="yearly"&&p.yearly?p.yearly:p.monthly||p.yearly;
 const dash=(q:string)=>signedIn?`/reports/ai${q}`:"/register";

 const tabs=<div className="bf-tabs" role="group" aria-label={c.tabsLabel}>
  {(["payments","ai","both"] as Tab[]).map(id=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>{setTab(id);setStep(1)}}>{c.tabs[id]}</button>)}
 </div>;
 const terms=tab!=="ai"&&hasYearly&&<div className="bf-bill">
  <div className="bf-seg" role="group" aria-label={c.term}>
   <button type="button" aria-pressed={term==="monthly"} onClick={()=>setTerm("monthly")}>{c.monthly}</button>
   <button type="button" aria-pressed={term==="yearly"} onClick={()=>setTerm("yearly")}>{c.yearly}</button>
  </div>
  {maxPct>0&&<span className="bf-badge">{c.upTo(num(maxPct))}</span>}
 </div>;
 const creditStrip=<section className="bf-credit" aria-labelledby="bf-credit-title">
  <h2 id="bf-credit-title">{c.crTitle}</h2>
  {c.cr.map(([title,body],i)=><div key={title} className="bf-credit-item"><span aria-hidden="true">{i===0?<b className="bf-taka">৳</b>:<svg viewBox="0 0 24 24"><path d={ICONS[i]}/></svg>}</span><div><b>{title}</b><span>{body}</span></div></div>)}
 </section>;

 function planCard(p:PricingPlan){
  const o=option(p),pct=yearlyDiscount(p),showYear=term==="yearly"&&p.yearly&&p.monthly&&pct!==null;
  const name=bn?p.nameBn:p.name,desc=bn?p.descriptionBn:p.description;
  return <article key={p.id} className="bf-pcard">
   <div className="bf-pcard-top"><h3>{name}</h3></div>
   {desc&&<p className="bf-pcard-desc">{desc}</p>}
   <div className="bf-amt">{p.custom?c.talk:p.free?money(0):o?money(o.amountMinor):"—"}<small>{p.custom?"":p.free?c.forever:o===p.yearly?c.perY:c.perM}</small></div>
   <p className="bf-yr">{showYear?c.yearNote(money(Math.round(p.yearly!.amountMinor/12)),money(p.monthly!.amountMinor*12-p.yearly!.amountMinor),num(pct!)):""}</p>
   {p.custom?<a className="bf-btn bf-btn-out" href={p.contactUrl||"/#contact"}>{c.talk}</a>
    :p.free?<Link className="bf-btn bf-btn-out" href={o?.href||"/register"}>{c.startFree}</Link>
    :o&&<Link className="bf-btn" href={o.href}>{c.take(name)}</Link>}
   {p.bullets.length>0&&<ul>{p.bullets.map(b=><li key={b.en}>{bn?b.bn:b.en}</li>)}</ul>}
  </article>;
 }

 const paymentsView=unavailable&&!plans.length?<p className="bf-note" role="status">{c.unavailable}</p>
  :!plans.length?<p className="bf-note">{c.noPlans}</p>
  :<><div className="bf-grid3">{plans.map(planCard)}</div><p className="bf-note">{c.payNote}</p></>;

 const aiView=<>{creditStrip}<div className="bf-grid2">
  {freeEnabled&&<article className="bf-pcard">
   <div className="bf-pcard-top"><h3>{c.freeTitle}</h3><span className="bf-badge">{c.freeSub}</span></div>
   <div className="bf-amt">{c.freeAmt}</div>
   <p className="bf-pcard-desc">{c.freeBody}</p>
   <Link className="bf-btn bf-btn-out" href={dash("?free=1")}>{c.getFree}</Link>
  </article>}
  <article className="bf-pcard is-rec">
   <div className="bf-pcard-top"><h3>{c.customTitle}</h3></div>
   <p className="bf-pcard-desc">{c.customBody}</p>
   <div className="bf-field"><label htmlFor="bf-ai-amount">{c.amount}</label>
    <div className="bf-money"><span aria-hidden="true">৳</span><input id="bf-ai-amount" className="bf-input" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9]/g,""))} aria-invalid={!amountOk} aria-describedby="bf-ai-amount-hint"/></div>
    <p className="bf-hint" id="bf-ai-amount-hint">{amountOk?c.min:c.amountErr}</p>
   </div>
   {amountOk?<Link className="bf-btn bf-btn-lime" href={dash(`?ai_amount=${amt}`)}>{c.recharge} · {money(amt*100)}</Link>
    :<button className="bf-btn bf-btn-lime" type="button" disabled>{c.recharge}</button>}
  </article>
 </div><p className="bf-note">{c.aiNote}</p></>;

 const sel=paid.find(p=>p.id===planId)||paid[0];
 const selOpt=sel?option(sel):null;
 const customOk=comboEnabled&&credit==="custom"&&amountOk;
 const total=(selOpt?.amountMinor??0)+(step===2&&customOk?amt*100:0);
 const bothView=!sel?paymentsView:<>{creditStrip}
  <ol className="bf-steps" aria-label={c.stepsLabel}>
   <li><button type="button" className={step===1?"on":"done"} aria-current={step===1?"step":undefined} onClick={()=>setStep(1)}><span>{step===1?num(1):"✓"}</span>{c.steps[0]}</button></li>
   <li aria-hidden="true" className="bar"/>
   <li><button type="button" className={step===2?"on":""} aria-current={step===2?"step":undefined} onClick={()=>setStep(2)}><span>{num(2)}</span>{c.steps[1]}</button></li>
   <li aria-hidden="true" className="bar"/>
   <li><span className="bf-step-static"><span>{num(3)}</span>{c.steps[2]}</span></li>
  </ol>
  {step===1?<><h2 className="bf-step-h">{c.s1h}</h2><div className="bf-grid2">
   {paid.map(p=>{const o=option(p),on=sel.id===p.id;return <button key={p.id} type="button" className="bf-opt" aria-pressed={on} onClick={()=>setPlanId(p.id)}>
    <span className="bf-opt-top"><strong>{bn?p.nameBn:p.name}</strong><span className="bf-radio" aria-hidden="true"/></span>
    <span className="bf-amt">{o?money(o.amountMinor):"—"}<small>{o===p.yearly?c.perY:c.perM}</small></span>
    {p.bullets[0]&&<span className="bf-opt-sub">{bn?p.bullets[0].bn:p.bullets[0].en}</span>}
   </button>})}
  </div></>
  :<><h2 className="bf-step-h">{c.s2h}</h2><div className="bf-grid2">
   {freeEnabled&&<button type="button" className="bf-opt" aria-pressed={credit==="free"} onClick={()=>setCredit("free")}>
    <span className="bf-opt-top"><strong>{c.freeOpt}</strong><span className="bf-radio" aria-hidden="true"/></span><span className="bf-opt-sub">{c.freeOptSub}</span>
   </button>}
   <button type="button" className="bf-opt" aria-pressed={credit==="custom"} disabled={!comboEnabled} onClick={()=>setCredit("custom")}>
    <span className="bf-opt-top"><strong>{c.customOpt}</strong><span className="bf-radio" aria-hidden="true"/></span>
    <span className="bf-opt-sub">{comboEnabled?c.customOptSub:c.comboSoon}</span>
   </button>
  </div>
  {comboEnabled&&credit==="custom"&&<div className="bf-field bf-combo-amount"><label htmlFor="bf-combo-amount">{c.amount}</label>
   <div className="bf-money"><span aria-hidden="true">৳</span><input id="bf-combo-amount" className="bf-input" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9]/g,""))} aria-invalid={!amountOk}/></div>
   <p className="bf-hint">{amountOk?c.min:c.amountErr}</p></div>}
  </>}
  <div className="bf-sumbar" role="region" aria-label={c.sumTotal}>
   <div className="bf-sum-cells">
    <div><small>{c.sumPlan}</small><b>{bn?sel.nameBn:sel.name} · {selOpt?money(selOpt.amountMinor):"—"} {selOpt===sel.yearly?c.perY:c.perM}</b></div>
    <div><small>{c.sumCredit}</small><b>{step===1?c.pickNext:credit==="free"&&freeEnabled?c.freeAfter:customOk?money(amt*100):"—"}</b></div>
    <div><small>{c.sumTotal}</small><span className="bf-sum-total" aria-live="polite">{money(total)}</span></div>
   </div>
   {step===1?<button type="button" className="bf-btn" onClick={()=>setStep(2)}>{c.next} →</button>
    :customOk?<Link className="bf-btn bf-btn-lime" href={`${selOpt!.href}${selOpt!.href.includes("?")?"&":"?"}ai_amount=${amt}`}>{c.checkout} →</Link>
    :<Link className="bf-btn bf-btn-lime" href={selOpt?.href||"/register"}>{c.checkout} →</Link>}
  </div>
 </>;

 return <>
  <div className="bf-ctrls">{tabs}{terms}</div>
  {tab==="payments"?paymentsView:tab==="ai"?aiView:bothView}
  <section className="bf-faq" aria-labelledby="bf-faq-title"><h2 id="bf-faq-title">{c.faqH}</h2><div>
   {c.faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}
  </div></section>
 </>;
}
