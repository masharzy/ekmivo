"use client";
import {useState} from "react";
import {PublicIcon} from "./public-icon";
const payload=JSON.stringify({amount:125,redirect_url:"https://merchant.example/success"},null,2);
const snippets:Record<string,string>={
 cURL:`curl "$EKMIVO_API_ORIGIN/v1/payment-intents" \\
  -H "Authorization: Bearer $EKMIVO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: my-order-123-payment" \\
  --data '${payload}'`,
 "Node.js":`const res = await fetch(process.env.EKMIVO_API_ORIGIN + "/v1/payment-intents", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.EKMIVO_API_KEY,
    "Content-Type": "application/json",
    "Idempotency-Key": "my-order-123-payment"
  },
  body: JSON.stringify(${payload})
});
if (!res.ok) throw new Error("Payment creation failed");
const payment = await res.json();
// Redirect the customer to payment.checkout_url`,
 Python:`import os, requests
r = requests.post(os.environ["EKMIVO_API_ORIGIN"] + "/v1/payment-intents",
  headers={"Authorization": "Bearer " + os.environ["EKMIVO_API_KEY"],
           "Idempotency-Key": "my-order-123-payment"},
  json={"amount": 125, "redirect_url": "https://merchant.example/success"},
  timeout=15)
r.raise_for_status()
payment = r.json()
# Redirect the customer to payment["checkout_url"]`,
 PHP:`<?php
$ch = curl_init(getenv("EKMIVO_API_ORIGIN") . "/v1/payment-intents");
curl_setopt_array($ch, [
  CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("EKMIVO_API_KEY"),
    "Content-Type: application/json",
    "Idempotency-Key: my-order-123-payment"
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "amount" => 125, "redirect_url" => "https://merchant.example/success"
  ])
]);
$payment = json_decode(curl_exec($ch), true);
curl_close($ch);`,
 Go:`package main
import ("bytes"; "net/http"; "os")
func main() {
  body := []byte(\`{"amount":125,"redirect_url":"https://merchant.example/success"}\`)
  req, _ := http.NewRequest("POST", os.Getenv("EKMIVO_API_ORIGIN")+"/v1/payment-intents", bytes.NewReader(body))
  req.Header.Set("Authorization", "Bearer "+os.Getenv("EKMIVO_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  req.Header.Set("Idempotency-Key", "my-order-123-payment")
  res, err := http.DefaultClient.Do(req)
  if err != nil { panic(err) }
  defer res.Body.Close()
}`,
 C:`// Server-only libcurl example: cc payment.c -lcurl -o payment
#include <curl/curl.h>
#include <stdio.h>
#include <stdlib.h>
int main(void) {
  const char *origin=getenv("EKMIVO_API_ORIGIN"), *key=getenv("EKMIVO_API_KEY");
  if(!origin||!key) return 1;
  char url[1024], auth[1024];
  if(snprintf(url,sizeof url,"%s/v1/payment-intents",origin)>=(int)sizeof url ||
     snprintf(auth,sizeof auth,"Authorization: Bearer %s",key)>=(int)sizeof auth) return 1;
  CURL *c=curl_easy_init();
  if(!c) return 1;
  struct curl_slist *h=NULL;
  h=curl_slist_append(h,auth);
  h=curl_slist_append(h,"Content-Type: application/json");
  h=curl_slist_append(h,"Idempotency-Key: my-order-123-payment");
  curl_easy_setopt(c,CURLOPT_URL,url);
  curl_easy_setopt(c,CURLOPT_HTTPHEADER,h);
  curl_easy_setopt(c,CURLOPT_POSTFIELDS,"{\\"amount\\":125,\\"redirect_url\\":\\"https://merchant.example/success\\"}");
  curl_easy_setopt(c,CURLOPT_TIMEOUT,15L);
  CURLcode result=curl_easy_perform(c);
  curl_slist_free_all(h); curl_easy_cleanup(c);
  return result==CURLE_OK?0:1;
}`
};
export function PaymentDocExamples({locale}:{locale:"en"|"bn"}){
 const bn=locale==="bn";
 const [language,setLanguage]=useState("cURL"),[copied,setCopied]=useState(false),[key,setKey]=useState(""),[busy,setBusy]=useState(false),[result,setResult]=useState(""),[intent,setIntent]=useState(""),[checkout,setCheckout]=useState(""),[idem,setIdem]=useState(""),[ref,setRef]=useState("");
 async function copy(){try{await navigator.clipboard.writeText(snippets[language]);setCopied(true)}catch{setCopied(false)}}
 async function run(action:"create"|"status"){
  if(busy||!/^ek_test_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/.test(key))return;
  setBusy(true);setResult("");
  const nextIdem=idem||"docs-"+crypto.randomUUID(),nextRef=ref||"DOCS-"+crypto.randomUUID();
  if(action==="create"){setIdem(nextIdem);setRef(nextRef)}
  try{
   const res=await fetch("/api/docs/sandbox-run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,testKey:key,idempotencyKey:nextIdem,reference:nextRef,intentId:intent}),cache:"no-store",signal:AbortSignal.timeout(16000)});
   const data=await res.json();setResult(JSON.stringify(data,null,2));
   if(action==="create"&&res.ok&&data?.result?.id)setIntent(data.result.id);
   if(action==="create"&&res.ok&&typeof data?.result?.checkout_url==="string"&&data.result.checkout_url.startsWith("https://"))setCheckout(data.result.checkout_url);
  }catch{setResult(JSON.stringify({error:{code:"SANDBOX_REQUEST_UNRESOLVED"}},null,2))}
  finally{setBusy(false)}
 }
 return <div className="ek-doc-examples">
  <div className="ek-doc-example-controls"><div role="group" aria-label="Language">{Object.keys(snippets).map(name=><button type="button" key={name} aria-pressed={language===name} onClick={()=>{setLanguage(name);setCopied(false)}}>{name}</button>)}</div><button type="button" onClick={()=>void copy()}>{copied?(bn?"কপি হয়েছে":"Copied"):(bn?"কোড কপি":"Copy code")}</button></div>
  <div className="ek-vscode"><div className="ek-vscode-top"><span aria-hidden="true">● ● ●</span>create-payment · {language}</div><pre><code>{snippets[language]}</code></pre></div>
  <div className="ek-doc-real-run"><h3><PublicIcon name="flask"/>{bn?"Real Sandbox test":"Test with your Sandbox key"}</h3><p>{bn?"নিজের ek_test_ API key দিয়ে test payment তৈরি করুন। আসল টাকা লাগবে না।":"Create a real test payment using your own ek_test_ key. No real funds move."}</p>
   <label>{bn?"Sandbox API key":"Sandbox API key"}<input type="password" value={key} autoComplete="off" spellCheck={false} onChange={e=>setKey(e.target.value)} placeholder="ek_test_..." /></label>
   <div className="ek-doc-real-actions"><button type="button" disabled={busy||!/^ek_test_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/.test(key)} onClick={()=>void run("create")}>{busy?(bn?"চলছে…":"Working…"):(bn?"Test payment তৈরি":"Create test payment")}</button><button type="button" disabled={busy||!intent} onClick={()=>void run("status")}>{bn?"Status দেখুন":"Get status"}</button></div>
   {checkout&&<a className="ek-sandbox-checkout-link" href={checkout} rel="noopener noreferrer" target="_blank">{bn?"Sandbox checkout খুলুন":"Open Sandbox checkout"} ↗</a>}
   {result&&<div className="ek-sim-result" role="status"><strong>{bn?"Sandbox API response":"Sandbox API response"}</strong><pre><code>{result}</code></pre></div>}
  </div>
 </div>;
}
