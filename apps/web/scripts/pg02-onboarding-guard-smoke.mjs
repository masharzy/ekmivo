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
  if(id==="./public-icon")return {PublicIcon:()=>null};
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

// Render actual locale controls and run committed effects. A blocked intent
// must leave both document language and route unchanged; successful route
// props (including browser back) must synchronize the persistent root layout.
const controlsSource=await readFile(new URL("../src/components/site-controls.tsx",import.meta.url),"utf8");
const controlsCompiled=ts.transpileModule(controlsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
let currentLocale="en",block=false;
const pushed=[],nodes=[];
const documentState={documentElement:{lang:"en",dataset:{},removeAttribute(){}},cookie:""};
const controlsSandbox={exports:{},document:documentState,CustomEvent:class{constructor(name,options){this.type=name;Object.assign(this,options);}},window:{
 location:{search:"?env=sandbox",hash:"#keys"},addEventListener(){},removeEventListener(){},
 dispatchEvent(){return !block;},localStorage:{setItem(){}}
},require(id){
 if(id==="next/navigation")return {usePathname:()=>`/${currentLocale}/workspaces`,useRouter:()=>({push:href=>pushed.push(href)})};
 if(id==="react")return {useState:initial=>[initial,()=>{}],useEffect:fn=>fn()};
 if(id==="react/jsx-runtime")return {jsx:(type,props)=>{const node={type,props};nodes.push(node);return node;},jsxs:(type,props)=>{const node={type,props};nodes.push(node);return node;}};
 throw Error("Unexpected controls dependency "+id);
}};
vm.runInNewContext(controlsCompiled,controlsSandbox,{timeout:3000});
function renderControls(locale){currentLocale=locale;nodes.length=0;controlsSandbox.exports.SiteControls({locale,initialTheme:"system"});}
renderControls("en");
const select=nodes.find(node=>node.type==="select"&&node.props.id==="site-locale");
block=true;select.props.onChange({target:{value:"bn"}});
assert.equal(documentState.documentElement.lang,"en");assert.equal(pushed.length,0);
assert.ok(documentState.cookie.startsWith("ekmivo-locale=en;"));
block=false;select.props.onChange({target:{value:"bn"}});
assert.equal(pushed[0],"/bn/workspaces?env=sandbox#keys");
assert.equal(documentState.documentElement.lang,"en","Language changes only when new route commits");
renderControls("bn");assert.equal(documentState.documentElement.lang,"bn");
renderControls("en");assert.equal(documentState.documentElement.lang,"en");
console.log("PG02 PASS: committed EN/BN language, browser-back props, blocked navigation and query/hash preservation");
