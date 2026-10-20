import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../src/proxy.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
function response(kind,url,options){return {kind,url:url?.toString(),options,cookies:{set:(...args)=>{response.lastCookie=args;}}};}
runInNewContext(code,{exports,Headers,require:()=>({NextResponse:{
 next:()=>response("next"),redirect:url=>response("redirect",url),rewrite:(url,options)=>response("rewrite",url,options),
}})});
function request(path,locale,headers={}){
 const url=new URL(path,"https://business.example");url.clone=()=>new URL(url);
 return {nextUrl:url,headers:new Headers(headers),cookies:{get:()=>locale===undefined?undefined:{value:locale}}};
}
for(const path of ["/","/dashboard","/settings/billing?tab=plans","/inbox"]){
 test(`new visitor defaults to English internally: ${path}`,()=>{
  const result=exports.proxy(request(path));
  assert.equal(result.kind,"rewrite");
  assert.equal(new URL(result.url).pathname,"/en"+(path.split("?")[0]==="/"?"":path.split("?")[0]));
  assert.equal(result.options.request.headers.get("x-ekmivo-locale"),"en");
  if(path.includes("?"))assert.equal(new URL(result.url).search,"?tab=plans");
 });
}
for(const locale of ["en","bn"]){
 test(`saved ${locale} preference survives refresh`,()=>{
  assert.equal(new URL(exports.proxy(request("/dashboard",locale)).url).pathname,`/${locale}/dashboard`);
 });
 test(`old /${locale} bookmark redirects to a neutral URL with its preference`,()=>{
  const result=exports.proxy(request(`/${locale}/payments?reference=123`));
  assert.equal(result.kind,"redirect");assert.equal(result.url,"https://business.example/payments?reference=123");
  assert.equal(response.lastCookie[1],locale);
 });
 test(`internal ${locale} traversal does not redirect in a loop`,()=>{
  assert.equal(exports.proxy(request(`/${locale}/dashboard`,locale,{"x-ekmivo-internal-rewrite":"1"})).kind,"next");
 });
}
test("invalid preference falls back to English",()=>{
 assert.equal(new URL(exports.proxy(request("/dashboard","invalid")).url).pathname,"/en/dashboard");
});
test("API and static assets bypass locale rewrites",()=>{
 for(const path of ["/api/go/payments","/_next/static/app.js","/icon.svg","/robots.txt"])
  assert.equal(exports.proxy(request(path)).kind,"next");
});
test("public spoofed shell headers cannot turn marketing pages into merchant pages",()=>{
 const result=exports.proxy(request("/pricing",undefined,{"x-ekmivo-application":"1","x-ekmivo-auth-page":"1"}));
 assert.equal(result.options.request.headers.get("x-ekmivo-application"),null);
 assert.equal(result.options.request.headers.get("x-ekmivo-auth-page"),null);
});
