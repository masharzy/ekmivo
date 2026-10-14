"use client";
import {useState} from "react";

type Kind="status"|"trx";
const languages=["cURL","Node.js","PHP","Python","Go","C"] as const;
type Language=typeof languages[number];

function codeFor(kind:Kind, language:Language):string {
 const path=kind==="status"?"/v1/payment-intents/INTENT_ID":"/v1/payment-intents/INTENT_ID/verify-transaction";
 const method=kind==="status"?"GET":"POST";
 const payload='{"transaction_id":"TXN123456789","provider":"bkash","amount_minor":12500}';
 const origin="EKMIVO_API_ORIGIN";
 switch(language){
  case "cURL":return [
    "curl --fail-with-body --max-time 15 -X "+method+" \"$"+origin+path+"\" \\",
    "  -H \"Authorization: Bearer $EKMIVO_API_KEY\""+(kind==="trx"?" \\":""),
    ...(kind==="trx"?["  -H \"Content-Type: application/json\" \\","  --data '"+payload+"'"]:[])
  ].join("\n");
  case "Node.js":return [
    "const response = await fetch(",
    "  process.env.EKMIVO_API_ORIGIN + \""+path+"\",",
    "  { method: \""+method+"\",",
    "    headers: { Authorization: \"Bearer \" + process.env.EKMIVO_API_KEY"+(kind==="trx"?", \"Content-Type\": \"application/json\"":"")+" },",
    ...(kind==="trx"?["    body: JSON.stringify("+payload+"),"]:[]),
    "    signal: AbortSignal.timeout(15000) }",
    ");",
    "if (!response.ok) throw new Error(\"REQUEST_FAILED\");",
    "console.log(await response.json());"
  ].join("\n");
  case "PHP":return [
    "<?php",
    "$url = getenv('EKMIVO_API_ORIGIN') . '"+path+"';",
    "$curl = curl_init($url);",
    "curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);",
    "curl_setopt($curl, CURLOPT_TIMEOUT, 15);",
    "curl_setopt($curl, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . getenv('EKMIVO_API_KEY')"+(kind==="trx"?", 'Content-Type: application/json'":"")+"]);",
    ...(kind==="trx"?["curl_setopt($curl, CURLOPT_POST, true);","curl_setopt($curl, CURLOPT_POSTFIELDS, '"+payload+"');"]:[]),
    "$out = curl_exec($curl);",
    "$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);",
    "curl_close($curl);",
    "if ($status !== 200) throw new RuntimeException('REQUEST_FAILED');",
    "echo $out;"
  ].join("\n");
  case "Python":return [
    "import os, requests",
    "r = requests."+ (kind==="trx"?"post":"get") +"(",
    "  os.environ['EKMIVO_API_ORIGIN'] + '"+path+"',",
    "  headers={'Authorization': 'Bearer ' + os.environ['EKMIVO_API_KEY']},",
    ...(kind==="trx"?["  json={'transaction_id': 'TXN123456789', 'provider': 'bkash', 'amount_minor': 12500},"]:[]),
    "  timeout=15)",
    "r.raise_for_status()",
    "print(r.json())"
  ].join("\n");
  case "Go":return [
    "package main",
    "import (\"fmt\"; \"io\"; \"net/http\"; \"os\"; \"time\""+(kind==="trx"?"; \"strings\"":"")+")",
    "func main() {",
    "  client := &http.Client{Timeout:15*time.Second}",
    ...(kind==="trx" ? ["  body := strings.NewReader(\"{\\\"transaction_id\\\":\\\"TXN123456789\\\",\\\"provider\\\":\\\"bkash\\\",\\\"amount_minor\\\":12500}\")"] : []),
    "  req,err := http.NewRequest(\""+method+"\", os.Getenv(\"EKMIVO_API_ORIGIN\")+\""+path+"\", "+(kind==="trx"?"body":"nil")+")",
    "  if err != nil { panic(err) }",
    "  req.Header.Set(\"Authorization\", \"Bearer \"+os.Getenv(\"EKMIVO_API_KEY\"))",
    ...(kind==="trx"?["  req.Header.Set(\"Content-Type\", \"application/json\")"]:[]),
    "  res,err := client.Do(req); if err != nil { panic(err) }",
    "  defer res.Body.Close()",
    "  out,_ := io.ReadAll(io.LimitReader(res.Body,65536))",
    "  fmt.Println(res.StatusCode,string(out))",
    "}"
  ].join("\n");
  case "C":return [
    "// libcurl: cc verify.c -lcurl -o verify",
    "#include <curl/curl.h>",
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "int main(void) {",
    "  const char *origin=getenv(\"EKMIVO_API_ORIGIN\"), *key=getenv(\"EKMIVO_API_KEY\");",
    "  if (!origin || !key) return 1;",
    "  char url[1024], auth[1024];",
    "  if (snprintf(url,sizeof url,\"%s"+path+"\",origin)>=(int)sizeof url) return 1;",
    "  if (snprintf(auth,sizeof auth,\"Authorization: Bearer %s\",key)>=(int)sizeof auth) return 1;",
    "  CURL *c=curl_easy_init(); if (!c) return 1;",
    "  struct curl_slist *h=NULL;",
    "  h=curl_slist_append(h,auth);",
    ...(kind==="trx"?["  h=curl_slist_append(h,\"Content-Type: application/json\");"]:[]),
    "  curl_easy_setopt(c,CURLOPT_URL,url);",
    "  curl_easy_setopt(c,CURLOPT_HTTPHEADER,h);",
    "  curl_easy_setopt(c,CURLOPT_TIMEOUT,15L);",
    ...(kind==="trx"?["  curl_easy_setopt(c,CURLOPT_POSTFIELDS,\"{\\\"transaction_id\\\":\\\"TXN123456789\\\",\\\"provider\\\":\\\"bkash\\\",\\\"amount_minor\\\":12500}\");"]:[]),
    "  CURLcode result=curl_easy_perform(c);",
    "  long code=0; curl_easy_getinfo(c,CURLINFO_RESPONSE_CODE,&code);",
    "  fprintf(stderr,\"HTTP %ld, curl %d\\n\",code,(int)result);",
    "  curl_slist_free_all(h); curl_easy_cleanup(c);",
    "  return (result==CURLE_OK && code==200) ? 0 : 1;",
    "}"
  ].join("\n");
 }
}
function highlight(code:string){
 return code.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|await|if|return|import|from|func|package|def|int|char)\b)/g).map((part,i)=><span key={i} className={/^["']/.test(part)?"ek-code-string":/^(const|await|if|return|import|from|func|package|def|int|char)$/.test(part)?"ek-code-keyword":undefined}>{part}</span>);
}
export function PaymentEndpointSamples({kind,locale}:{kind:Kind;locale:"bn"|"en"}){
 const bn=locale==="bn";
 const [language,setLanguage]=useState<Language>("Node.js");
 const [scenario,setScenario]=useState<"pending"|"verified"|"invalid">("pending");
 const [result,setResult]=useState<string|null>(null);
 const [copied,setCopied]=useState(false);
 const code=codeFor(kind,language);
 const response=()=>scenario==="invalid"?
   {simulation:true,httpStatus:422,error:{code:"INVALID_REQUEST"}}:
   kind==="trx"?{simulation:true,httpStatus:200,verified:scenario==="verified",status:scenario, payment_intent_id:"sim_intent_123"}:
   {simulation:true,httpStatus:200,data:{id:"sim_intent_123",status:scenario}};
 return <div className="ek-mini-endpoint">
   <div className="ek-doc-operation-tabs" role="group" aria-label="Code language">
    {languages.map(name=><button key={name} type="button" aria-pressed={language===name} onClick={()=>{setLanguage(name);setCopied(false);}}>{name}</button>)}
   </div>
   <div className="ek-vscode"><div className="ek-vscode-top"><span aria-hidden="true">● ● ●</span>{kind==="status"?"get-status":"verify-transaction"} · {language}</div><pre><code>{highlight(code)}</code></pre></div>
   <div className="ek-mini-run">
    <label>{bn?"নমুনা response":"Example response"}<select value={scenario} onChange={value=>{setScenario(value.target.value as typeof scenario);setResult(null);}}><option value="pending">Pending</option><option value="verified">Verified</option><option value="invalid">Invalid input</option></select></label>
    <button type="button" onClick={()=>{setResult(JSON.stringify(response(),null,2));}}>{bn?"▶ নমুনা চালান":"▶ Run sample"}</button>
    <button type="button" onClick={()=>{void navigator.clipboard.writeText(code).then(()=>setCopied(true)).catch(()=>setCopied(false));}}>{copied?(bn?"কপি হয়েছে":"Copied"):(bn?"Copy code":"Copy code")}</button>
   </div>
   {result&&<div className="ek-sim-result"><strong>{bn?"উদাহরণ মাত্র, API কল হয়নি":"Preview only — no API request was made"}</strong><pre><code>{highlight(result)}</code></pre></div>}
   <p className="ek-doc-footnote">{bn?"INTENT_ID নিজের তৈরি ID দিয়ে বদলান। API key শুধু নিজের backend-এ রাখুন।":"Replace INTENT_ID with your actual intent ID. Keep the key on your server."}</p>
 </div>;
}
