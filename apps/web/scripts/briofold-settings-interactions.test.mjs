import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=readFileSync(new URL("../src/components/help-feedback.tsx",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function flush(){for(let i=0;i<24;i++)await Promise.resolve();}
function helpHarness({locale="en",seed={error:"Source unavailable"}}={}){
 const states=[],refs=[],nodes=[],posts=[];let si=0,ri=0,sequence=0;
 const api={status:503,items:[],postStatus:503};
 const jsx=(type,props,key)=>{const node={type,props,key};nodes.push(node);return node;};
 const dependencies={
  react:{
   useState(initial){const i=si++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},
   useRef(initial){const i=ri++;return refs[i]??={current:initial};},useCallback:fn=>fn,useEffect(){}
  },
  "react/jsx-runtime":{jsx,jsxs:jsx},"./help-reference.css":{},
  "./dashboard-initial-data":{useDashboardInitialData:()=>seed},"./reference-ui":{RefIcon:()=>null}
 };
 const exports={};
 vm.runInNewContext(compiled,{exports,crypto:{randomUUID:()=>"fixture-key-"+(++sequence)},
  fetch:async(url,request={})=>{
   if(request.method==="POST"){
    posts.push({url,key:request.headers["Idempotency-Key"],body:JSON.parse(request.body)});
    return {ok:api.postStatus===200,status:api.postStatus};
   }
   return {ok:api.status===200,status:api.status,json:async()=>({items:api.items})};
  },
  require:id=>{if(!Object.hasOwn(dependencies,id))throw Error("Unexpected help dependency "+id);return dependencies[id];}
 },{timeout:3000});
 const render=()=>{si=0;ri=0;nodes.length=0;exports.HelpFeedback({locale,workspaceId:"10000000-0000-4000-8000-000000000001",environment:"live"});};
 const plain=value=>Array.isArray(value)?value.map(plain).join(" "):value&&typeof value==="object"?plain(value.props?.children):typeof value==="string"?value:"";
 const text=()=>nodes.map(n=>plain(n.props.children)).join(" ");
 const button=label=>nodes.find(n=>n.type==="button"&&n.props.children===label);
 const input=id=>nodes.find(n=>n.props?.id===id);
 render();return {api,posts,nodes,render,text,button,input};
}
for(const locale of ["en","bn"])test("unavailable support history never claims a verified empty collection: "+locale,async()=>{
 const h=helpHarness({locale});
 assert.ok(h.text().includes(locale==="en"?"Support requests are unavailable":"সহায়তার অনুরোধ পাওয়া যাচ্ছে না"));
 assert.equal(h.text().includes(locale==="en"?"No support requests yet.":"এখনো কোনো সহায়তার অনুরোধ নেই।"),false);
 h.api.status=200;
 h.button(locale==="en"?"Refresh":"রিফ্রেশ").props.onClick();await flush();h.render();
 assert.ok(h.text().includes(locale==="en"?"No support requests yet.":"এখনো কোনো সহায়তার অনুরোধ নেই।"));
});
test("support transport failure preserves draft and retries with the same idempotency key",async()=>{
 const h=helpHarness({seed:{data:{items:[]}}});
 h.input("support-subject").props.onChange({target:{value:"Fixture subject"}});
 h.input("support-description").props.onChange({target:{value:"Fixture support issue with enough detail"}});
 h.render();
 h.nodes.find(n=>n.type==="form").props.onSubmit({preventDefault(){}});await flush();h.render();
 assert.equal(h.input("support-subject").props.value,"Fixture subject");
 assert.equal(h.input("support-description").props.value,"Fixture support issue with enough detail");
 h.api.status=200;h.api.postStatus=200;
 h.nodes.find(n=>n.type==="form").props.onSubmit({preventDefault(){}});await flush();h.render();
 assert.equal(h.posts.length,2);
 assert.equal(h.posts[0].key,h.posts[1].key);
 assert.deepEqual(h.posts[0].body,h.posts[1].body);
 assert.equal(h.input("support-subject").props.value,"");
 assert.equal(h.input("support-description").props.value,"");
});
test("empty support filter does not claim the existing collection has no requests",()=>{
 const h=helpHarness({seed:{data:{items:[{id:"fixture",subject:"Resolved item",message:"Fixture text",status:"resolved",created_at:"2026-10-20T10:00:00Z"}]}}});
 h.button("Open").props.onClick();h.render();
 assert.ok(h.text().includes("No matching support requests."));
 assert.equal(h.text().includes("No support requests yet."),false);
});

test("feedback deep link and typed bug/feature/usability tickets preserve one Store and source",async()=>{
 const navigation={};
 const body=readFileSync(new URL("../src/lib/unified-navigation.ts",import.meta.url),"utf8");
 vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:navigation});
 for(const mode of ["ai","commerce","both"]){
  const d=navigation.unifiedDestination(mode,"settings",["help","feedback"]);
  assert.equal(d.section,"help");
  assert.equal(d.service,mode==="ai"?"ai":"payments");
 }
 assert.equal(navigation.unifiedDestination("off","settings",["help","feedback"]),null);
 assert.equal(navigation.unifiedDestination("both","settings",["help","untrusted"]),null);
 assert.ok(navigation.unifiedSettings.flatMap(g=>g.items).some(i=>i.slug==="help/feedback"));
 for(const [topic,label] of [["bug","Bug report"],["feature","Feature request"],["usability","Usability feedback"]]){
  const h=helpHarness({seed:{data:{items:[]}}});
  h.api.status=200;h.api.postStatus=200;
  h.button(label).props.onClick();
  h.input("support-subject").props.onChange({target:{value:"Fixture feedback"}});
  h.input("support-description").props.onChange({target:{value:"A real description of the feedback being filed"}});
  h.render();
  h.nodes.find(n=>n.type==="form").props.onSubmit({preventDefault(){}});
  await flush();
  assert.equal(h.posts[0].body.topic,topic);
 }
 const migration=readFileSync(new URL("../../../infra/migrations/0190_briofold_feedback_topics.sql",import.meta.url),"utf8");
 const go=readFileSync(new URL("../../../backend/internal/checkout/workspace.go",import.meta.url),"utf8");
 for(const topic of ["bug","feature","usability"]){
  assert.ok(migration.includes(`'${topic}'`));
  assert.ok(go.includes(`"${topic}": true`));
 }
});

test("disposable settings acceptance installs checkout logo presentation before browser theme round-trip",()=>{
 const fixture=readFileSync(new URL("./briofold-settings-acceptance.mjs",import.meta.url),"utf8");
 const store=fixture.indexOf('apply("0099_store_details.sql")');
 const presentation=fixture.indexOf('apply("0100_checkout_logo_presentation.sql")');
 const browser=fixture.indexOf("await runBriofoldPhase9Browser(");
 assert.ok(store>=0&&presentation>store&&browser>presentation);
 assert.ok(fixture.includes("dashboard_checkout_theme_read(uuid,uuid)"));
 assert.ok(fixture.includes('apply("0190_briofold_feedback_topics.sql")'));
});

test("business preferences stay separate from personal account security in all enabled product modes",()=>{
 const navigation={};
 const body=readFileSync(new URL("../src/lib/unified-navigation.ts",import.meta.url),"utf8");
 vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:navigation});
 for(const mode of ["ai","commerce","both"]){
  const d=navigation.unifiedDestination(mode,"settings",["preferences"]);
  assert.equal(d.section,"settings");assert.equal(d.kind,undefined);
  assert.equal(d.service,mode==="ai"?"ai":"payments");
 }
 assert.equal(navigation.unifiedDestination("off","settings",["preferences"]),null);
 const item=navigation.unifiedSettings.flatMap(group=>group.items).find(item=>item.slug==="preferences");
 assert.equal(item.service,"common");
});

test("first-time business preferences inherit the authorized name and preserve an explicit saved name",()=>{
 const raw=readFileSync(new URL("../src/components/payment-workspace-tools.tsx",import.meta.url),"utf8");
 const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const [body,expected] of [[{},"Authorized business"],[{name:"Saved business"},"Saved business"]]){
  const exports={},nodes=[],jsx=(type,props)=>{const node={type,props};nodes.push(node);return node;};
  const dependencies={
   react:{useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useCallback:fn=>fn,useMemo:fn=>fn(),useEffect(){}},
   "react/jsx-runtime":{jsx,jsxs:jsx},"next/navigation":{useRouter:()=>({refresh(){}})},
   "./plan-resource-status":{PlanResourceStatus:()=>null,useResourceLimit:()=>({blocked:false})},
   "../lib/plan-resource-limits":{planLimitMessage:()=>""},
   "./dashboard-initial-data":{useDashboardInitialData:()=>({data:{body,version:0}})},
   "../lib/client/draft-navigation":{registerDraft:()=>()=>{}},
   "./payment-privacy":{PaymentPrivacy:()=>null},"./payment-team-reference.css":{}
  };
  vm.runInNewContext(code,{exports,require:id=>{if(!Object.hasOwn(dependencies,id))throw Error("Unexpected settings dependency "+id);return dependencies[id];}});
  exports.PaymentWorkspaceTools({locale:"en",workspaceId:"fixture",workspaceName:"Authorized business",environment:"live",resource:"settings",canManage:true,isOwner:true,userId:"fixture"});
  assert.ok(nodes.some(n=>n.type==="input"&&n.props.value===expected));
  assert.equal(nodes.some(n=>n.props?.children==="Workspace data is unavailable. Try Refresh."),false);
 }
});

test("team invite sharing uses a locale-neutral link while preserving server-issued capability",async()=>{
 const raw=readFileSync(new URL("../src/components/payment-workspace-tools.tsx",import.meta.url),"utf8");
 const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const states=[],refs=[],nodes=[];let si=0,ri=0;
 const jsx=(type,props)=>{const node={type,props};nodes.push(node);return node;};
 const member={id:"fixture-owner",name:"Fixture owner",role:"owner"},capability="A".repeat(43);
 const react={
  useState(initial){const i=si++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},
  useRef(initial){const i=ri++;return refs[i]??={current:initial};},useCallback:fn=>fn,useMemo:fn=>fn(),useEffect(){}
 };
 const dependencies={
  react,"react/jsx-runtime":{jsx,jsxs:jsx},"next/navigation":{useRouter:()=>({refresh(){}})},
  "./plan-resource-status":{PlanResourceStatus:()=>null,useResourceLimit:()=>({blocked:false,refresh:async()=>{}})},
  "../lib/plan-resource-limits":{planLimitMessage:()=>""},
  "./dashboard-initial-data":{useDashboardInitialData:()=>({data:{members:[member],invitations:[]}})},
  "../lib/client/draft-navigation":{registerDraft:()=>()=>{}},
  "./payment-privacy":{PaymentPrivacy:()=>null},"./payment-team-reference.css":{}
 };
 const exports={};
 vm.runInNewContext(code,{exports,AbortSignal,window:{location:{origin:"https://example.test"}},
  fetch:async(_url,request={})=>({ok:true,json:async()=>request.method==="POST"?{saved:true,invitation_token:capability}:{members:[member],invitations:[]}}),
  require:id=>{if(!Object.hasOwn(dependencies,id))throw Error("Unexpected team dependency "+id);return dependencies[id];}
 });
 const render=()=>{si=0;ri=0;nodes.length=0;exports.PaymentWorkspaceTools({locale:"en",workspaceId:"fixture",workspaceName:"Fixture business",environment:"live",resource:"team",canManage:true,isOwner:true,userId:member.id,paymentPlanApplies:false});};
 render();nodes.find(n=>n.type==="input"&&n.props.type==="email").props.onChange({target:{value:"invitee@example.invalid"}});
 render();nodes.find(n=>n.type==="form").props.onSubmit({preventDefault(){}});await flush();render();
 const url=nodes.find(n=>n.props?.["aria-label"]==="Private invitation URL")?.props.value;
 assert.equal(url,"https://example.test/invite/"+capability);
 assert.equal(url.includes("/en/invite/"),false);
});
