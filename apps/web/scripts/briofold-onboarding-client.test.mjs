import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../src/components/briofold-onboarding-client.tsx",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(mode,locale,unavailable){
 const nodes=[],exports={};
 const jsx=(type,props)=>{const n={type,props};nodes.push(n);return n;};
 const deps={react:{useActionState:()=>[{status:"idle",message:""},()=>{},false]},
  "react/jsx-runtime":{jsx,jsxs:jsx},
  "../actions/briofold-onboarding":{submitBriofoldSetup(){}},
  "./briofold-onboarding.module.css":{default:{}}
 };
 vm.runInNewContext(js,{exports,window:{location:{reload:()=>nodes.push({type:"reload",props:{}})}},require:id=>{assert.ok(Object.hasOwn(deps,id));return deps[id];}});
 exports.BriofoldOnboardingClient({locale,mode,step:"billing",businessId:"fixture",businessName:"Fixture",plans:[],gatewayPlansUnavailable:unavailable});
 return nodes;
}
for(const locale of ["en","bn"])for(const mode of ["commerce","both"])test("unavailable Gateway catalogue explains retry while preserving setup: "+mode+" "+locale,()=>{
 const nodes=render(mode,locale,true);
 assert.ok(nodes.some(n=>n.props.role==="alert"));
 const retry=nodes.find(n=>n.type==="button"&&n.props.type==="button");
 assert.ok(retry&&typeof retry.props.onClick==="function");
 retry.props.onClick();assert.ok(nodes.some(n=>n.type==="reload"));
 assert.equal(nodes.find(n=>n.type==="button"&&n.props.type==="submit").props.disabled,true);
});
test("AI-only can complete without Gateway catalogue or subscription",()=>{
 const nodes=render("ai","en",true);
 assert.equal(nodes.some(n=>n.props.role==="alert"),false);
 assert.equal(nodes.find(n=>n.type==="button"&&n.props.type==="submit").props.disabled,false);
});
