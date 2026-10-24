"use client";
import { useEffect } from "react";
import type { CSSProperties } from "react";
import copy from "../../lib/landing-copy-pairs.json";
import { LandingSprite } from "./landing-sprite";
import { LandingPricing } from "./landing-pricing";
type Locale = "en" | "bn";
const translation = new Map(copy.pairs.map(p => [p.en, p.bn] as const));

/** Static product narrative. Live payment plans arrive through the server slot. */
export function MarketingExperience({locale,pricing,aiPricing,bundlePricing}:{locale:Locale;pricing?:import("react").ReactNode;aiPricing?:import("react").ReactNode;bundlePricing?:import("react").ReactNode}){
 const t = (english:string) => locale === "bn" ? (translation.get(english) ?? english) : english;
 useEffect(() => {
  const root=document.querySelector<HTMLElement>("main.ekm-landing");
  if(!root)return;
  const find=(id:string)=>root.querySelector<HTMLElement>(`#${id}`);
  const cards=["b1","b2","b3","sm","ck","r1"];
  const checks=Array.from(root.querySelectorAll<HTMLElement>("#ck span"));
  const status=find("pv");
  const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const verified=locale==="bn"?(translation.get("Verified")??"যাচাইকৃত"):"Verified";
  const waiting=locale==="bn"?(translation.get("Waiting")??"অপেক্ষমাণ"):"Waiting";
  const timers:number[]=[];
  let active=true;
  function clear(){while(timers.length)window.clearTimeout(timers.pop())}
  function final(){
   cards.forEach(id=>{const el=find(id);if(el){el.style.opacity="1";el.style.transform="none"}});
   checks.forEach(el=>el.classList.add("on"));
   if(status){status.textContent=verified;status.classList.add("ok")}
  }
  function later(ms:number,task:()=>void){timers.push(window.setTimeout(()=>{if(active)task()},ms))}
  function reveal(id:string){const el=find(id);if(el){el.style.opacity="1";el.style.transform="translateY(0)"}}
  function run(){
   clear();
   if(document.hidden||motion.matches){final();return}
   cards.forEach(id=>{const el=find(id);if(el){el.style.opacity="0";el.style.transform="translateY(10px)";el.style.transition="opacity .4s ease, transform .4s ease"}});
   for(const id of ["d1","d2"]){const wire=find(id);if(wire){wire.style.opacity="0";wire.style.left="0";wire.style.transition="none"}}
   checks.forEach(el=>el.classList.remove("on"));
   if(status){status.textContent=waiting;status.classList.remove("ok")}
   later(300,()=>reveal("b1"));
   later(1400,()=>{reveal("b2");reveal("r1")});
   later(2800,()=>reveal("b3"));
   const pulse=(id:string)=>{
    const dot=find(id);
    if(!dot)return;
    dot.style.transition="none";dot.style.left="0";dot.style.opacity="1";
    void dot.offsetWidth;
    dot.style.transition="left .9s ease-in-out";
    dot.style.left="calc(100% - 12px)";
    later(950,()=>{dot.style.opacity="0"});
   };
   later(3400,()=>pulse("d1"));
   later(4400,()=>reveal("sm"));
   later(4900,()=>reveal("ck"));
   [5400,5850,6300,6750].forEach((at,index)=>later(at,()=>checks[index]?.classList.add("on")));
   later(7100,()=>pulse("d2"));
   later(8100,()=>{
    if(status){status.textContent=verified;status.classList.add("ok")}
    const dashboard=find("s3");
    dashboard?.animate([{transform:"scale(1)"},{transform:"scale(1.03)"},{transform:"scale(1)"}],{duration:420});
   });
   later(10800,run);
  }
  const restart=()=>{if(document.hidden){clear();final()}else run()};
  motion.addEventListener("change",restart);
  document.addEventListener("visibilitychange",restart);
  run();
  return ()=>{active=false;clear();motion.removeEventListener("change",restart);document.removeEventListener("visibilitychange",restart)};
 }, [locale]);
 return <main className="ekm-landing" id="main" lang={locale}>
 <LandingSprite />
<header className="hero">
<div className="w">
<span className="pill">
<i>
</i>
{t("For social commerce sellers")}
</span>
<h1>
{t("Orders arrive in chat.")}
<span>
{t("Payments verify themselves.")}
</span>
</h1>
<p className="s">
{t("Ekmivo's AI answers your customers and takes their orders. Every payment is matched from your phone's SMS, so there are no screenshots and no transaction IDs.")}
</p>
<div className="cta">
<a className="btn" href="#together">
{t("See how it works")}
</a>
<a className="btn out" href="#pricing">
{t("View pricing")}
</a>
</div>
<div className="scene" id="scene" aria-label="Animation: a customer orders in chat, the SMS is matched, the dashboard shows verified">
<div className="sc" id="s1">
<h4>
<svg className="i">
<use href="#chat">
</use>
</svg>
{t("Customer chat")}
</h4>
<div className="bb c" id="b1">
<svg className="i" style={{"width": "14px", "height": "14px", "verticalAlign": "-2px"}}>
<use href="#img">
</use>
</svg>
{t("Is this available?")}
</div>
<div className="bb a" id="b2">
{t("Yes, ৳1,250. Pay here and I'll confirm your order.")}
</div>
<div className="bb c" id="b3">
{t("Paid!")}
</div>
</div>
<div className="wire">
<u id="d1">
</u>
</div>
<div className="sc" id="s2">
<h4>
<svg className="i">
<use href="#phone">
</use>
</svg>
{t("Seller's phone")}
</h4>
<div className="sms" id="sm">
<b>
{t("SMS received")}
</b>
{t("You have received ৳1,250 from 01•••••••••")}
</div>
<div className="ck" id="ck">
<span>
{t("Wallet")}
</span>
<span>
{t("Amount")}
</span>
<span>
{t("Sender no.")}
</span>
<span>
{t("Time")}
</span>
</div>
</div>
<div className="wire">
<u id="d2">
</u>
</div>
<div className="sc" id="s3">
<h4>
<svg className="i">
<use href="#dash">
</use>
</svg>
{t("Dashboard")}
</h4>
<div className="ro" id="r1">
<span>
{t("Order #4821 · ৳1,250")}
</span>
<span className="st" id="pv">
{t("Waiting")}
</span>
</div>
<div className="ro">
<span>
{t("Order #4820 · ৳980")}
</span>
<span className="st ok">
{t("Verified")}
</span>
</div>
<div className="ro">
<span>
{t("Order #4819 · ৳2,400")}
</span>
<span className="st ok">
{t("Verified")}
</span>
</div>
</div>
</div>
</div>
</header>
<section id="payments">
<div className="w">
<div className="hd">
<span className="tag">
{t("Payment automation")}
</span>
<h2>
{t("Customers pay. Orders confirm themselves.")}
</h2>
<p>
{t("Install the Ekmivo app on the seller's phone. It reads incoming payment SMS and matches each one to an order.")}
</p>
</div>
<div className="ba">
<div className="pc old">
<h3>
<svg className="i">
<use href="#user">
</use>
</svg>
{t("Before")}
</h3>
<ol>
<li>
{t("Customer orders on your website")}
</li>
<li>
{t("Customer pays from their mobile wallet")}
</li>
<li>
{t("Customer enters the transaction ID")}
</li>
<li>
{t("You check it manually")}
</li>
</ol>
<div className="trx">
<div>
<small>
{t("Transaction ID")}
</small>
<code>
{t("8N7A5XQ2K1")}
</code>
<em>
{t("Checking by hand…")}
</em>
</div>
</div>
</div>
<div className="pc new">
<h3>
<svg className="i">
<use href="#shield">
</use>
</svg>
{t("With Ekmivo")}
</h3>
<div className="pg">
<ol>
<li>
{t("Customer taps Pay on your website")}
</li>
<li>
{t("Ekmivo creates the payment and opens its page")}
</li>
<li>
{t("Customer pays from their mobile wallet")}
</li>
<li>
{t("Ekmivo verifies it from the SMS and sends them back to your site")}
</li>
</ol>
<div className="phone" aria-hidden="true">
<div>
<div className="ph">
<b>
{t("Ekmivo")}
</b>
<em>
{t("Connected · listening for SMS")}
</em>
</div>
<div className="it">
<small>
{t("bKash")}
<span>
{t("10:42 pm")}
</span>
</small>
<b>
{t("Received ৳1,250")}
</b>
<span>
{t("Matched · #4821")}
</span>
</div>
<div className="it">
<small>
{t("Nagad")}
<span>
{t("10:31 pm")}
</span>
</small>
<b>
{t("Received ৳980")}
</b>
<span>
{t("Matched · #4820")}
</span>
</div>
<div className="it">
<small>
{t("bKash")}
<span>
{t("10:08 pm")}
</span>
</small>
<b>
{t("Received ৳2,400")}
</b>
<span>
{t("Matched · #4819")}
</span>
</div>
</div>
</div>
</div>
</div>
</div>
</div>
</section>
<section id="ai" style={{"paddingTop": "0"}}>
<div className="w">
<div className="hd">
<span className="tag">
{t("AI bot")}
</span>
<h2>
{t("It answers your customers. And knows your catalog.")}
</h2>
<p>
{t("Connect your social media pages. The bot replies, searches products from images and keeps posts and comments in order.")}
</p>
</div>
<div className="g4">
<div>
<svg className="i">
<use href="#chat">
</use>
</svg>
<span>
<h3>
{t("Replies to customers")}
</h3>
<p>
{t("Answers messages on your connected social media page.")}
</p>
</span>
</div>
<div>
<svg className="i">
<use href="#img">
</use>
</svg>
<span>
<h3>
{t("Finds a product from a photo")}
</h3>
<p>
{t("Customer sends an image; the bot searches your products for it.")}
</p>
</span>
</div>
<div>
<svg className="i">
<use href="#vid">
</use>
</svg>
<span>
<h3>
{t("Works from video screenshots")}
</h3>
<p>
{t("A frame from a video still gets you close results.")}
</p>
</span>
</div>
<div>
<svg className="i">
<use href="#cmt">
</use>
</svg>
<span>
<h3>
{t("Manages posts and comments")}
</h3>
<p>
{t("Keeps up with your posts and the comments under them.")}
</p>
</span>
</div>
</div>
<div className="vs">
<div className="q photo" id="q">
<svg viewBox="0 0 120 100" style={{"--c": "#B8693A", "transform": "rotate(-9deg) scale(1.08)"} as CSSProperties} role="img" aria-label="Photo of a tan tote bag">
<use href="#bagA">
</use>
</svg>
<u id="scan">
</u>
<span className="cap">
{t("Customer's photo")}
</span>
</div>
<div className="res">
<div className="rs on">
<i>
<svg viewBox="0 0 120 100" style={{"--c": "#B8693A"} as CSSProperties}>
<use href="#bagA">
</use>
</svg>
</i>
<b>
{t("Best match")}
</b>
<small>
{t("Leather tote")}
</small>
<small>
{t("৳1,450")}
</small>
</div>
<div className="rs">
<i>
<svg viewBox="0 0 120 100" style={{"--c": "#C98A5B"} as CSSProperties}>
<use href="#bagB">
</use>
</svg>
</i>
<b>
{t("Similar")}
</b>
<small>
{t("Box crossbody")}
</small>
<small>
{t("৳1,350")}
</small>
</div>
<div className="rs">
<i>
<svg viewBox="0 0 120 100" style={{"--c": "#7A4B2A"} as CSSProperties}>
<use href="#bagC">
</use>
</svg>
</i>
<b>
{t("Similar")}
</b>
<small>
{t("Bucket bag")}
</small>
<small>
{t("৳1,590")}
</small>
</div>
</div>
<p className="n">
{t("Exact match: one product. No exact match: a carousel of the closest ones. Powered by a vector database.")}
</p>
</div>
</div>
</section>
<section id="together" style={{"paddingTop": "0"}}>
<div className="w">
<div className="big">
<div>
<span className="pill">
{t("AI bot + payments")}
</span>
<h2 style={{"marginTop": "20px"}}>
{t("Order in chat. Payment verified automatically.")}
</h2>
<p className="s">
{t("The bot takes the order, asks the payment server to verify, and the dashboard shows the result. Your customers never send proof.")}
</p>
<ul className="sp">
<li>
<svg className="i">
<use href="#chat">
</use>
</svg>
<div>
{t("Customer orders in the chat")}
<span>
{t("The AI collects the order details.")}
</span>
</div>
</li>
<li>
<svg className="i">
<use href="#link">
</use>
</svg>
<div>
{t("AI asks the payment server")}
<span>
{t("Amount, sender number and time are checked.")}
</span>
</div>
</li>
<li>
<svg className="i">
<use href="#dash">
</use>
</svg>
<div>
{t("Dashboard shows the result")}
<span>
{t("Verified or not verified, no guessing.")}
</span>
</div>
</li>
<li>
<svg className="i">
<use href="#user">
</use>
</svg>
<div>
{t("Unsure? It asks, politely")}
<span>
{t("If a payment can't be matched, or the customer says they paid but the time is unclear, the AI asks for the sender number and time and keeps it pending.")}
</span>
</div>
</li>
</ul>
</div>
<div className="cw">
<h4>
{t("Chat · Order #4822")}
</h4>
<div className="bb c">
{t("I'll take two.")}
</div>
<div className="bb a">
{t("Total ৳2,500. Pay here and I'll confirm your order.")}
</div>
<br />
<div className="bb c">
{t("Done, paid.")}
</div>
<div className="chip">
<svg className="i" style={{"width": "15px", "height": "15px"}}>
<use href="#check">
</use>
</svg>
{t("Payment verified")}
</div>
<div className="ro" style={{"marginTop": "6px"}}>
<span>
{t("Dashboard · #4822 · ৳2,500")}
</span>
<span className="st ok">
{t("Verified")}
</span>
</div>
</div>
</div>
</div>
</section>
<section style={{"paddingTop": "0"}}>
<div className="w">
<div className="hd">
<h2>
{t("A payment is verified only when it matches.")}
</h2>
</div>
<div className="rl">
<div>
<svg className="i">
<use href="#shield">
</use>
</svg>
<div>
<h3>
{t("All four must match")}
</h3>
<p>
{t("Wallet, amount, sender number and time. If any one differs, it is not verified.")}
</p>
</div>
</div>
<div>
<svg className="i">
<use href="#check">
</use>
</svg>
<div>
<h3>
{t("No transaction ID typed")}
</h3>
<p>
{t("Your customers never fill a TrxID form in the normal flow.")}
</p>
</div>
</div>
<div>
<svg className="i">
<use href="#user">
</use>
</svg>
<div>
<h3>
{t("Unclear stays pending")}
</h3>
<p>
{t("When it can't be matched, the AI asks for details instead of guessing.")}
</p>
</div>
</div>
<div>
<svg className="i">
<use href="#dash">
</use>
</svg>
<div>
<h3>
{t("Exceptions come to you")}
</h3>
<p>
{t("Late, partial or duplicate payments are held for your review. You decide to accept or refund.")}
</p>
</div>
</div>
</div>
</div>
</section>
<section id="privacy" style={{"paddingTop": "0"}}>
<div className="w">
<div className="hd">
<span className="tag">
{t("Privacy and money")}
</span>
<h2>
{t("Your phone, your data, your money.")}
</h2>
</div>
<div className="rl">
<div>
<svg className="i">
<use href="#shield">
</use>
</svg>
<div>
<h3>
{t("Only payment SMS")}
</h3>
<p>
{t("Only payment SMS from your wallet is sent to Ekmivo. Everything else stays on your phone.")}
</p>
</div>
</div>
<div>
<svg className="i">
<use href="#dash">
</use>
</svg>
<div>
<h3>
{t("See what is sent")}
</h3>
<p>
{t("Every SMS field that reaches the server is visible to you in your workspace.")}
</p>
</div>
</div>
<div>
<svg className="i">
<use href="#link">
</use>
</svg>
<div>
<h3>
{t("Money stays with you")}
</h3>
<p>
{t("Payments go straight to your wallet. Ekmivo does not hold your money or take a cut.")}
</p>
</div>
</div>
</div>
<div className="perks">
<span>
{t("Works with bKash and Nagad")}
</span>
<span>
{t("Seller's phone must be Android")}
</span>
<span>
{t("Customers can use any phone")}
</span>
</div>
</div>
</section>
<section id="pricing" className="ekm-pricing-host">
<div className="w">
<LandingPricing locale={locale} pricing={pricing} aiPricing={aiPricing} bundlePricing={bundlePricing} />
</div>
</section>
<section id="faq" style={{"paddingTop": "0"}}>
<div className="w">
<div className="faq">
<div className="fh">
<h2>
{t("Quick answers.")}
</h2>
</div>
<div className="fl">
<details>
<summary>
{t("How does it know a payment arrived?")}
</summary>
<p>
{t("The Ekmivo app on the seller's phone reads payment SMS. Each one is matched to a payment by wallet, amount, sender number and time.")}
</p>
</details>
<details>
<summary>
{t("Is Ekmivo a payment gateway?")}
</summary>
<p>
{t("No. Customers pay your own wallet directly. Ekmivo doesn't hold or move money and takes no share of your sales. It only verifies that the payment arrived.")}
</p>
</details>
<details>
<summary>
{t("What does the app read?")}
</summary>
<p>
{t("Only payment SMS from your wallet are sent to Ekmivo, and you can see every field that is sent.")}
</p>
</details>
<details>
<summary>
{t("Which phones does it work on?")}
</summary>
<p>
{t("The seller's phone needs to be Android. Customers can pay from any phone.")}
</p>
</details>
<details>
<summary>
{t("How do I install the app?")}
</summary>
<p>
{t("Download the Ekmivo app (APK) from your workspace and allow SMS access. On newer Android versions you may also need to allow restricted settings for the app.")}
</p>
</details>
<details>
<summary>
{t("Do customers need to install anything?")}
</summary>
<p>
{t("No. They tap Pay, use the Ekmivo payment page and return to your site.")}
</p>
</details>
<details>
<summary>
{t("Can I use the payments without the AI bot?")}
</summary>
<p>
{t("Yes. The payment system works on its own, and so does the AI bot. Together they work best.")}
</p>
</details>
<details>
<summary>
{t("What if a payment can't be matched?")}
</summary>
<p>
{t("It stays pending, not verified. If the SMS arrives late, it is matched using the time on the SMS, so a late phone connection doesn't fail a payment made in time. Late, partial or duplicate payments go to you for review.")}
</p>
</details>
<details>
<summary>
{t("Can I try the AI bot for free?")}
</summary>
<p>
{t("AI usage is prepaid. If a signup credit offer is active, its exact amount will appear in your account.")}
</p>
</details>
<details>
<summary>
{t("Which social platforms does the AI bot connect to?")}
</summary>
<p>
{t("Talk to us for the current list of supported platforms.")}
</p>
</details>
<details>
<summary>
{t("Is there a discount for using both?")}
</summary>
<p>
{t("AI stays pay as you go. An AI + Payments discount is applied only when an eligible offer is currently available and shown at checkout.")}
</p>
</details>
</div>
</div>
</div>
</section>
<div className="w">
<div className="end">
<h2>
{t("Let your customers pay. Skip the chasing.")}
</h2>
<a className="btn" href={`/${locale}/register`} data-go="signup">
{t("Create a workspace")}
</a>
</div>
</div>
 </main>;
}
