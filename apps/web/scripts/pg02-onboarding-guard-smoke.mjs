// Exercise the actual onboarding component's guarded locale navigation event.
// No production accounts, financial data or mocked payment success.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const source=await readFile(new URL("../src/components/workspace-onboarding.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX
}}).outputText;
const listeners=new Map();
let dialogOpened=0,redirected=false;
const dialog={open:false,showModal(){this.open=true;dialogOpened++;},close(){this.open=false;}};
let stateCalls=0,refCalls=0;
const sandbox={
 exports:{},URL,
 window:{
  location:{href:"https://example.test/bn/workspaces",origin:"https://example.test"},
  addEventListener:(name,listener)=>listeners.set(name,listener),
  removeEventListener:()=>{},
  localStorage:{setItem(){},getItem(){return null},removeItem(){}},
 },
 document:{addEventListener:()=>{},removeEventListener:()=>{}},
 require(id){
  if(id==="react")return {
   useState(initial){const index=stateCalls++;return [index===0?"Unsaved business":initial,()=>{}];},
   useRef(initial){return {current:refCalls++===0?dialog:initial};},
   useEffect:(fn)=>fn(),
   useActionState:(_action,initial)=>[initial,()=>{}]
  };
  if(id==="react-dom")return {useFormStatus:()=>({pending:false})};
  if(id==="react/jsx-runtime")return {jsx:()=>null,jsxs:()=>null};
  if(id==="../actions/account")return {createWorkspaceAction:()=>{}};
  if(id==="../lib/server/validation")return {emptyState:{status:"idle"}};
  if(id==="../lib/onboarding-draft.mjs")return {
   draftStorageKey:()=>"test-key",parseSavedDraft:()=>null,encodeSavedDraft:()=>null
  };
  throw Error("Unexpected dependency "+id);
 }
};
vm.runInNewContext(compiled,sandbox,{timeout:3000});
sandbox.exports.WorkspaceOnboarding({locale:"bn",userId:"test-account"});
assert.ok(listeners.has("ekmivo:guarded-navigation"),"Unsaved onboarding must intercept locale switch");
const attempt={detail:{href:"/en/workspaces?env=sandbox#draft"},cancelable:true,defaultPrevented:false,
 preventDefault(){this.defaultPrevented=true;}};
listeners.get("ekmivo:guarded-navigation")(attempt);
assert.equal(attempt.defaultPrevented,true,"Locale route must remain unchanged until draft decision");
assert.equal(dialogOpened,1,"Save/Discard/Stay dialog must open for route intent");
assert.equal(redirected,false);
const external={detail:{href:"https://other.test/"},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
listeners.get("ekmivo:guarded-navigation")(external);
assert.equal(external.defaultPrevented,false,"External guard intent is not a local route");
console.log("PG02 PASS: dirty onboarding blocks locale routing and opens Save/Discard/Stay");
