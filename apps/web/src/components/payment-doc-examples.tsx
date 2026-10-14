"use client";
import {useState} from "react";

function syntaxParts(value:string){
 const tokens=value.split(/(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|await|import|from|if|return|def|package|func|let|new|var|int|char|include)\b|\b\d+\b)/g);
 return tokens.map((token,i)=><span key={i} className={/^(\/\/|#)/.test(token)?"ek-code-comment":/^["']/.test(token)?"ek-code-string":/^(const|await|import|from|if|return|def|package|func|let|new|var|int|char|include)$/.test(token)?"ek-code-keyword":/^\d+$/.test(token)?"ek-code-number":undefined}>{token}</span>);
}
export function PaymentDocExamples({locale}:{locale:"en"|"bn"}){
 const [environment,setEnvironment]=useState("sandbox"),[testReference,setTestReference]=useState(""),[language,setLanguage]=useState("cURL"),[copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false);
 const payload=JSON.stringify({merchant_reference:"ORDER-123",amount_minor:12500,currency:"BDT",expires_in_minutes:30},null,2);
 const examples:Record<string,string>={
  cURL:`curl --fail-with-body --max-time 15 \\\n  "$EKMIVO_API_ORIGIN/v1/payment-intents" \\\n  -H "Authorization: Bearer $EKMIVO_API_KEY" \\\n  -H "Idempotency-Key: order-123-payment-v1" \\\n  -H "Content-Type: application/json" \\\n  --data '${payload}'`,
  "Node.js":`// Server-side only. Persist one idempotency key per payment request.\nconst response = await fetch(\n  process.env.EKMIVO_API_ORIGIN + "/v1/payment-intents",\n  {\n    method: "POST",\n    signal: AbortSignal.timeout(15000),\n    headers: {\n      Authorization: "Bearer " + process.env.EKMIVO_API_KEY,\n      "Content-Type": "application/json",\n      "Idempotency-Key": "order-123-payment-v1"\n    },\n    body: JSON.stringify(${payload})\n  }\n);\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error?.code ?? "PAYMENT_REQUEST_FAILED");\n// Save result.id and result.checkout_token with the order.`,
  Python:`import os, requests\n\nurl = (os.environ["EKMIVO_API_ORIGIN"] + "/v1/payment-intents")\nresponse = requests.post(url, timeout=15, headers={\n    "Authorization": "Bearer " + os.environ["EKMIVO_API_KEY"],\n    "Idempotency-Key": "order-123-payment-v1",\n}, json={\n    "merchant_reference": "ORDER-123",\n    "amount_minor": 12500, "currency": "BDT",\n    "expires_in_minutes": 30,\n})\nresponse.raise_for_status()\npayment = response.json()\n# Save payment["id"] and payment["checkout_token"] with the order.`,
  PHP:`<?php\n$url = getenv('EKMIVO_API_ORIGIN') . '/v1/payment-intents';\n$curl = curl_init($url);\ncurl_setopt_array($curl, [\n    CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_TIMEOUT => 15,\n    CURLOPT_HTTPHEADER => [\n        'Authorization: Bearer ' . getenv('EKMIVO_API_KEY'),\n        'Content-Type: application/json',\n        'Idempotency-Key: order-123-payment-v1'\n    ],\n    CURLOPT_POSTFIELDS => json_encode([\n        'merchant_reference' => 'ORDER-123',\n        'amount_minor' => 12500, 'currency' => 'BDT',\n        'expires_in_minutes' => 30\n    ], JSON_THROW_ON_ERROR)\n]);\n$body = curl_exec($curl);\n$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);\n$error = curl_error($curl);\ncurl_close($curl);\nif ($body === false) throw new RuntimeException($error);\n$payment = json_decode($body, true, 512, JSON_THROW_ON_ERROR);\nif ($status < 200 || $status >= 300)\n    throw new RuntimeException($payment['error']['code'] ?? 'PAYMENT_REQUEST_FAILED');\n// Save id and checkout_token with your order.`,
  Go:\`package main

import ("bytes"; "fmt"; "io"; "net/http"; "os"; "time")
func main() {
  body := []byte("{\\"merchant_reference\\":\\"ORDER-123\\",\\"amount_minor\\":12500,\\"currency\\":\\"BDT\\",\\"expires_in_minutes\\":30}")
  client := &http.Client{Timeout: 15*time.Second}
  req, err := http.NewRequest("POST", os.Getenv("EKMIVO_API_ORIGIN")+"/v1/payment-intents", bytes.NewReader(body))
  if err != nil { panic(err) }
  req.Header.Set("Authorization", "Bearer "+os.Getenv("EKMIVO_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  req.Header.Set("Idempotency-Key", "order-123-payment-v1")
  res, err := client.Do(req); if err != nil { panic(err) }
  defer res.Body.Close()
  result, _ := io.ReadAll(io.LimitReader(res.Body, 65536))
  fmt.Printf("%d: %s\\n", res.StatusCode, result)
}\`,
  C:\`// Requires libcurl; compile with: cc payment.c -lcurl -o payment
#include <curl/curl.h>
#include <stdio.h>
#include <stdlib.h>
int main(void) {
  const char *origin = getenv("EKMIVO_API_ORIGIN");
  const char *key = getenv("EKMIVO_API_KEY");
  if (!origin || !key) return 1;
  char url[1024], auth[1024];
  if (snprintf(url, sizeof url, "%s/v1/payment-intents", origin) >= (int)sizeof url ||
      snprintf(auth, sizeof auth, "Authorization: Bearer %s", key) >= (int)sizeof auth) return 1;
  CURL *c = curl_easy_init();
  if (!c) return 1;
  struct curl_slist *h = NULL;
  h = curl_slist_append(h, auth);
  h = curl_slist_append(h, "Content-Type: application/json");
  h = curl_slist_append(h, "Idempotency-Key: order-123-payment-v1");
  curl_easy_setopt(c, CURLOPT_URL, url);
  curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
  curl_easy_setopt(c, CURLOPT_TIMEOUT, 15L);
  curl_easy_setopt(c, CURLOPT_POSTFIELDS, "{\\"merchant_reference\\":\\"ORDER-123\\",\\"amount_minor\\":12500,\\"currency\\":\\"BDT\\",\\"expires_in_minutes\\":30}");
  CURLcode result = curl_easy_perform(c);
  long status = 0; curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &status);
  fprintf(stderr, "\\\\nHTTP %ld, curl %d\\\\n", status, (int)result);
  curl_slist_free_all(h); curl_easy_cleanup(c);
  return (result == CURLE_OK && status == 201) ? 0 : 1;
}\`
 };
 const bn=locale==="bn";
 const renderExample=(reference:string)=>examples[language].replaceAll("ORDER-123",environment==="sandbox"?(reference||"YOUR_UNIQUE_TEST_REFERENCE"):"ORDER-123").replaceAll("order-123-payment-v1",environment==="sandbox"?(reference||"YOUR_UNIQUE_TEST_REFERENCE")+"-payment-v1":"order-123-payment-v1");
 async function copy(){try{const reference=environment==="sandbox"?(testReference||"TEST-"+crypto.randomUUID()):"";if(reference)setTestReference(reference);await navigator.clipboard.writeText(renderExample(reference));setCopied(true);setCopyFailed(false)}catch{setCopyFailed(true)}}
 return <div className="ek-doc-examples"><label>{bn?"Environment":"Environment"}<select value={environment} onChange={e=>{setEnvironment(e.target.value);setCopied(false)}}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label><p>{environment==="sandbox"?(bn?"Workspace-এর API Keys থেকে নিজের ek_test_ key নিন। কী থেকেই Sandbox নির্ধারিত হবে।":"Get your own ek_test_ key from workspace API Keys. The key selects Sandbox automatically. Copy generates a unique test reference."):(bn?"নিজের workspace-এর Live key শুধু সার্ভারে ব্যবহার করুন।":"Activate your plan to get a Live key. Use it on your server only.")}</p><div className="ek-doc-example-controls"><div role="group" aria-label={bn?"উদাহরণের ভাষা":"Example language"}>{Object.keys(examples).map(name=><button type="button" key={name} aria-pressed={name===language} onClick={()=>{setLanguage(name);setCopied(false);setCopyFailed(false)}}>{name}</button>)}</div><button type="button" onClick={copy}>{copied?(bn?"কপি হয়েছে":"Copied"):(bn?"কোড কপি করুন":"Copy code")}</button><button type="button" className="ek-code-run" onClick={()=>{const ref=testReference||"SIM-ORDER-123";setPreview(JSON.stringify(scenario==="created"?{simulated:true,http_status:201,id:"sim_intent_123",checkout_token:"sim_checkout_token",status:"pending",checkout_url:"https://example.invalid/checkout/sim_checkout_token"}:scenario==="verified"?{simulated:true,http_status:200,status:"verified",payment_id:"sim_payment_123"}:scenario==="pending"?{simulated:true,http_status:200,status:"pending",merchant_reference:ref}:{simulated:true,http_status:409,error:{code:"CONFLICT",message:"Idempotency key reused with changed data"}},null,2));}}>{bn?"▶ নমুনা চালান":"▶ Run simulation"}</button></div><div className="ek-vscode"><div className="ek-vscode-top"><span aria-hidden="true">● ● ●</span> {language==="Node.js"?"create-payment.js":language==="C"?"payment.c":language==="Go"?"payment.go":language==="PHP"?"payment.php":language==="Python"?"payment.py":"request.sh"} <span className="ek-vscode-lang">{environment==="sandbox"?"TEST KEY":"LIVE KEY"}</span></div><pre><code>{syntaxParts(renderExample(testReference))}</code></pre></div><div className="ek-run-settings"><label>{bn?"নমুনার ফল":"Simulated result"}<select value={scenario} onChange={e=>{setScenario(e.target.value);setPreview(null);}}><option value="created">201 · Created</option><option value="verified">200 · Verified</option><option value="pending">200 · Pending</option><option value="conflict">409 · Conflict</option></select></label></div>{preview&&<div className="ek-sim-result" role="status"><strong>{bn?"নমুনা response — আসল API call নয়":"Sample response — no API request sent"}</strong><pre><code>{syntaxParts(preview)}</code></pre></div>}<span role="status">{copyFailed?(bn?"কপি হয়নি। কোড নির্বাচন করে কপি করুন।":"Copy failed. Select the code to copy it."):copied?(bn?"কোড কপি হয়েছে।":"Code copied."):""}</span></div>;
}
