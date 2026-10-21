// PG02 real SiteControls navigation under TS transpilation.
// A blocked unsaved draft must not mutate the locale cookie or router.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const tsx=await readFile(new URL("../src/components/site-controls.tsx",import.meta.url),"utf8");
const js=ts.transpileModule(tsx,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX
}}).outputText;
const persisted=[],events=[];
let reloads=0;
let blocked=true;
const root={dataset:{},removeAttribute(name){if(name==="data-theme")delete this.dataset.theme}};
const doc={documentElement:root,set cookie(value){persisted.push(value)},get cookie(){return persisted.at(-1)||""}};
const win={
 location:{search:"?env=live",hash:"#detail",reload(){reloads++}},
 addEventListener(){},removeEventListener(){},
 dispatchEvent(event){events.push(event);return !blocked;},
 localStorage:{setItem(key,value){persisted.push(key+"="+value)}}
};
class TestEvent{constructor(name,options){this.type=name;this.detail=options.detail;this.cancelable=options.cancelable;}}
const jsx=(type,props,key)=>({type,props,key});
const sandbox={
 exports:{},CustomEvent:TestEvent,document:doc,window:win,
 require(id){
  if(id==="next/navigation")return {usePathname:()=>"/bn/w/11111111-1111-4111-a111-111111111111/payments/overview"};
  if(id==="react")return {useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:fn=>fn()};
  if(id==="react/jsx-runtime")return {jsx,jsxs:jsx};
  throw Error("Unexpected module "+id);
 }
};
vm.runInNewContext(js,sandbox,{timeout:3000});
const ui=sandbox.exports.SiteControls({locale:"bn",initialTheme:"system"});
function find(element,predicate){
 if(Array.isArray(element)){for(const child of element){const hit=find(child,predicate);if(hit)return hit;}return null;}
 if(!element||typeof element!=="object")return null;
 if(predicate(element))return element;
 return find(element.props?.children,predicate);
}
const lang=find(ui,n=>n.type==="button"&&n.props.className==="ek-language-switch");
const theme=find(ui,n=>n.type==="select"&&n.props["aria-label"]==="Theme");
assert.ok(lang&&theme,"current public locale button and theme selection must render");
assert.equal(doc.documentElement.lang,"bn");
assert.equal(doc.cookie,"","render must not reset the existing locale preference");
lang.props.onClick();
assert.equal(reloads,0,"Blocked draft unexpectedly reloaded route");
assert.equal(doc.cookie,"","Blocked draft changed locale preference");
assert.equal(events[0].detail.href,"/w/11111111-1111-4111-a111-111111111111/payments/overview?env=live#detail");
blocked=false;
lang.props.onClick();
assert.equal(reloads,1,"Successful language switch must reload for server-selected locale");
assert.match(doc.cookie,/ekmivo-locale=en/);
assert.equal(doc.documentElement.lang,"bn","Language is unchanged until server commits the new render");
theme.props.onChange({target:{value:"dark"}});
assert.equal(doc.documentElement.dataset.theme,"dark");
assert.ok(persisted.some(x=>x.startsWith("ekmivo-theme=dark;")), "Theme dark cookie was not persisted");
theme.props.onChange({target:{value:"system"}});
assert.equal(doc.documentElement.dataset.theme,undefined);
assert.ok(persisted.some(x=>x.startsWith("ekmivo-theme=system;")), "Theme system cookie was not persisted");
console.log("PG02 PASS: guarded locale reload preserves query/hash; theme/System cookies and render language");
