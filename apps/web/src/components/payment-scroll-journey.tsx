"use client";

import {useEffect,useRef,useState} from "react";

type FlowStep={title:string;body:string};
export function PaymentScrollJourney({steps,locale}:{steps:FlowStep[];locale:"bn"|"en"}){
 const wrap=useRef<HTMLDivElement>(null);
 const [active,setActive]=useState(0);
 const [motion,setMotion]=useState(false);
 useEffect(()=>{
  const parent=wrap.current;
  if(!parent)return;
  const cards=Array.from(parent.querySelectorAll<HTMLElement>(".ek-journey-card"));
  if(!("IntersectionObserver" in window))return;
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  if(media.matches)return;
  let visible=true;
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(entry.isIntersecting)entry.target.classList.add("is-revealed");
   }
  },{threshold:.13,rootMargin:"0px 0px -9% 0px"});
  cards.forEach(card=>observer.observe(card));
  const update=()=>{
   if(!visible)return;
   // Select the card closest to the readable middle of the viewport.
   const target=window.innerHeight*.43;
   let next=0,best=Infinity;
   cards.forEach((card,i)=>{
    const rect=card.getBoundingClientRect();
    const center=Math.max(rect.top,Math.min(target,rect.bottom));
    const distance=Math.abs(center-target)+(rect.bottom<0?window.innerHeight:0);
    if(distance<best){best=distance;next=i}
   });
   setActive(value=>value===next?value:next);
  };
  setMotion(true);
  cards.forEach(card=>{if(card.getBoundingClientRect().top<window.innerHeight*.9)card.classList.add("is-revealed")});
  let frame=0;
  const onScroll=()=>{if(frame)return;frame=window.requestAnimationFrame(()=>{frame=0;update()})};
  onScroll();
  window.addEventListener("scroll",onScroll,{passive:true});
  window.addEventListener("resize",onScroll);
  return ()=>{visible=false;observer.disconnect();window.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onScroll);if(frame)window.cancelAnimationFrame(frame)};
 },[steps.length]);
 return <div className="ek-journey" ref={wrap} data-motion={motion?"enabled":"off"}>
  <div className="ek-journey-rail">
   <span className="ek-journey-rail-label">{locale==="bn"?"পেমেন্টের ধাপগুলো":"YOUR PAYMENT JOURNEY"}</span>
   <strong className="ek-journey-rail-title">{locale==="bn"?"শুরু থেকে শেষ—সবকিছু এক নজরে।":"From setup to confirmation."}</strong>
   <p>{locale==="bn"?"প্রতিটি ধাপ পেরিয়ে দেখুন কীভাবে Ekmivo-তে একটি পেমেন্ট সম্পন্ন হয়।":"Follow the stages of a payment, from your first request to the final status."}</p>
   <div className="ek-journey-progress" aria-label={locale==="bn"?"পেমেন্টের ধাপ":"Payment steps"}>
    <div className="ek-journey-progress-track"><span style={{height:((active+1)/steps.length*100)+"%"}}/></div>
    {steps.map((item,i)=><a key={i} href={"#payment-step-"+(i+1)} aria-current={active===i?"step":undefined} className={active===i?"is-active":""}>
      <span className="ek-journey-dot">{String(i+1).padStart(2,"0")}</span><span>{item.title}</span>
    </a>)}
   </div>
   <span className="ek-journey-count">{String(active+1).padStart(2,"0")} <span>/ {String(steps.length).padStart(2,"0")}</span></span>
  </div>
  <div className="ek-journey-stories">
   {steps.map((step,i)=><article key={i} id={"payment-step-"+(i+1)} className={"ek-journey-card ek-journey-card-"+i}>
     <div className="ek-journey-card-top"><span>{locale==="bn"?"ধাপ":"STEP"} {String(i+1).padStart(2,"0")}</span><span className="ek-journey-card-graphic" aria-hidden="true">{["↗","⌁","◈","✓","◎"][i]||"↗"}</span></div>
     <div className="ek-journey-card-art" aria-hidden="true"><span>{["01","02","03","04","05"][i]}</span><i/><i/><i/></div>
     <h3>{step.title}</h3><p>{step.body}</p>
     <div className="ek-journey-card-bottom"><span>EKMIVO / PAYMENT GATEWAY</span><span aria-hidden="true">↗</span></div>
    </article>)}
  </div>
 </div>;
}
