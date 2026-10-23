import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {readFileSync,existsSync} from "node:fs";
const at=(path)=>new URL("../src/"+path,import.meta.url);
const source=(path)=>readFileSync(at(path),"utf8");

test("all nine canonical merchant entry routes exist independently of /w workspace slugs",()=>{
 assert.ok(existsSync(at("app/[locale]/dashboard/page.tsx")));
 for(const root of ["inbox","orders","payments","sms-data","invoices","customers","reports","settings"])
  assert.ok(existsSync(at(`app/[locale]/${root}/[[...view]]/page.tsx`)),`Missing canonical route: ${root}`);
});
test("navigation has exactly nine clean, prefixed-free merchant entries",()=>{
 const src=source("lib/unified-navigation.ts");
 for(const path of ["/dashboard","/inbox","/orders","/payments","/sms-data","/invoices","/customers","/reports","/settings"])
  assert.ok(src.includes(`href:"${path}"`),`Missing nav href ${path}`);
 assert.equal((src.match(/href:"\/(dashboard|inbox|orders|payments|sms-data|invoices|customers|reports|settings)"/g)||[]).length,9);
 assert.doesNotMatch(src,/href:"\/(?:bn|en|w)\//);
 assert.match(src,/view\.length>1/);
 assert.match(src,/mode==="off"/);
});
test("authorized business context and realm resolution are server-side",()=>{
 const src=source("components/unified-merchant-route.tsx");
 assert.match(src,/requireUser\(locale\)/);
 assert.match(src,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(src,/paymentContextFor\(workspace,user\.id,undefined\)/);
 assert.match(src,/if\(!destination\)notFound\(\)/);
 assert.match(src,/<AppShell unified/);
 const action=source("actions/unified-business.ts");
 assert.match(action,/currentUser\(\)/);
 assert.match(action,/selectDefaultWorkspace\(user\.id,workspaceId\)/);
 assert.doesNotMatch(action,/selectDefaultWorkspace\(.*request\.userId/);
});
test("legacy API documentation settings paths resolve to the existing public developer portal",()=>{
 const route=source("components/unified-merchant-route.tsx");
 const settings=source("lib/unified-navigation.ts");
 const index=source("components/unified-settings-index.tsx");
 assert.match(settings,/slug:"api-docs"[\s\S]*?external:true/);
 assert.match(index,/item\.external\?"\/developers"/);
 assert.match(route,/view\[0\]==="api-docs"/);
 assert.match(route,/view\[0\]==="developers"&&view\[1\]==="docs"/);
 assert.ok(route.indexOf('redirect("/developers")')<route.indexOf("await requireUser(locale)"),
  "Public documentation should not depend on a Store session/database read");
 assert.ok(existsSync(at("app/(developer-portal)/[locale]/developers/[[...slug]]/page.tsx")));
});
test("single-Store account binding supersedes legacy selection without deleting historic memberships",()=>{
 const auth=source("lib/server/auth.ts"),shell=source("components/app-shell.tsx");
 const workspaces=source("app/[locale]/workspaces/page.tsx"),proxy=source("app/api/go/[...path]/route.ts");
 assert.match(auth,/primaryStoreFor\(userId\)/);
 assert.match(auth,/if\(bound\)return spaces\.find\(space=>space\.id===bound\)\?\?null/);
 assert.match(auth,/if\(bound && workspaceId!==bound\)return false/);
 assert.match(shell,/primaryStoreId\?memberships\.filter\(space=>space\.id===primaryStoreId\):memberships/);
 assert.match(workspaces,/if\(bound\|\|spaces\.length===1\)redirect\("\/workspaces\/open"\)/);
 assert.match(proxy,/STALE_BUSINESS/);
});
test("global marketing header and footer do not render on unified application routes",()=>{
 for(const cssless of ["components/site-header.tsx","components/site-footer.tsx","proxy.ts"]){
  const src=source(cssless);
  assert.match(src,/dashboard\|inbox\|orders\|payments\|sms-data\|invoices\|customers\|reports\|settings/,`Missing route exclusion: ${cssless}`);
 }
});
test("settings uses opt-in CSS module and preserves legacy payment screens",()=>{
 const src=source("components/unified-settings-index.tsx");
 assert.match(src,/unified-settings-index\.module\.css/);
 assert.match(src,/enabledUnifiedService\(mode,item\.service\)/);
 const layout=source("app/[locale]/w/[workspaceId]/[section]/layout.tsx");
 assert.match(layout,/AppShell/);
 const frame=source("components/dashboard-frame.tsx");
 assert.match(frame,/unified\?"/);
 assert.match(frame,/data-service=\{unified\?"payments":service\}/);
 assert.match(frame,/!unified&&service==="payments"/);
});

test("unsupported website voice cannot be advertised as live or billed",()=>{
 const website=source("components/website-chat-settings.tsx");
 assert.match(website,/Voice calling is currently unavailable\./);
 assert.match(website,/The public chat address is unavailable/);
 assert.doesNotMatch(website,/voice(?:_enabled|Enabled)\s*[:=]\s*true/i);
});

test("simplified Payments has no request or reconciliation user-facing tab",()=>{
 const nav=source("lib/unified-navigation.ts");
 const tabs=source("components/unified-section-tabs.tsx");
 const links=source("components/payment-documents.tsx");
 assert.doesNotMatch(nav,/requests:\{section:"requests"/);
 // Reconciliation remains a permission-scoped canonical deep link, not a
 // second top-level Payments tab or a workspace selector.
 assert.match(nav,/reconciliation:\{section:"reconciliation",service:"payments"\}/);
 const paymentTabs=tabs.split(" payments:[")[1]?.split(" customers:[")[0]??"";
 assert.ok(paymentTabs.includes("/payments/links"));
 assert.doesNotMatch(paymentTabs,/\/payments\/(?:requests|incoming|invoices|reconciliation)/);
 assert.doesNotMatch(links,/className="tabs"><button className="on">\{t\("Payment links"/);
 assert.match(nav,/href:"\/sms-data"/);
 assert.match(nav,/href:"\/invoices"/);
});

const navigation={};
runInNewContext(ts.transpileModule(source("lib/unified-navigation.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:navigation});
test("AI-only device settings use generic pairing while payment devices preserve their existing adapter",()=>{
 const ai=navigation.unifiedDestination("ai","settings",["devices"]);
 assert.equal(ai.kind,"devices");assert.equal(ai.service,"ai");
 const payments=navigation.unifiedDestination("commerce","settings",["devices"]);
 assert.equal(payments.service,"payments");assert.equal(payments.kind,undefined);
 const both=navigation.unifiedDestination("both","settings",["devices"]);
 assert.equal(both.service,"payments");assert.equal(both.kind,"mixed-devices");
 assert.equal(navigation.unifiedDestination("off","settings",["devices"]),null);
 assert.equal(navigation.unifiedDestination("ai","settings",["payment-methods"]),null);
 const device=navigation.unifiedSettings.flatMap(g=>g.items).find(item=>item.slug==="devices");
 assert.equal(navigation.enabledUnifiedService("ai",device.service),true);
});
test("Inbox secondary navigation keeps canonical channel and device URLs",()=>{
 const inbox=source("components/workspace-inbox.tsx");
 assert.match(inbox,/href="\/settings\/channels"/);assert.match(inbox,/href="\/settings\/devices"/);
 assert.doesNotMatch(inbox,/href=\{`\/w\//);
});
test("Website chat nested Channel route preserves its Store binding and AI-only gate",()=>{
 for(const mode of ["ai","both"]){
  const destination=navigation.unifiedDestination(mode,"settings",["channels","website"]);
  assert.equal(destination?.section,"website");assert.equal(destination?.service,"ai");
  assert.equal(navigation.unifiedDestination(mode,"settings",["website"]).section,"website");
 }
 for(const mode of ["commerce","off"])
  assert.equal(navigation.unifiedDestination(mode,"settings",["channels","website"]),null);
 for(const unsafe of ["__proto__","../website","other","website/extra"])
  assert.equal(navigation.unifiedDestination("both","settings",["channels",unsafe]),null);
 assert.equal(navigation.unifiedDestination("both","settings",["channels","website","extra"]),null);
 assert.match(source("components/unified-settings-index.tsx"),/item\.slug==="website"\?"\/settings\/channels\/website"/);
});

test("canonical resolver rejects inherited names and unknown routes for every business mode",()=>{
 const invalid=["constructor","__proto__","prototype","toString","valueOf","hasOwnProperty","missing"];
 for(const mode of ["ai","commerce","both","off"]){
  for(const root of navigation.unifiedNavigation.map(item=>item.key)){
   for(const segment of invalid)assert.equal(navigation.unifiedDestination(mode,root,[segment]),null,mode+"/"+root+"/"+segment);
   assert.equal(navigation.unifiedDestination(mode,root,["devices","extra"]),null);
  }
  for(const root of invalid)assert.equal(navigation.unifiedDestination(mode,root,[]),null);
 }
});
test("canonical commerce deep links reuse real scoped scanner, courier and catalog import resources",()=>{
 for(const mode of ["ai","commerce","both"]){
  assert.equal(navigation.unifiedDestination(mode,"orders",["scan"]).section,"orders");
  assert.equal(navigation.unifiedDestination(mode,"orders",["courier"]).section,"shipping");
  assert.equal(navigation.unifiedDestination(mode,"orders",["products","sync"]).section,"products");
  assert.equal(navigation.unifiedDestination(mode,"orders",["products","invalid"]),null);
 }
 assert.equal(navigation.unifiedDestination("off","orders",["products","sync"]),null);
 const page=source("components/unified-merchant-route.tsx");
 assert.match(page,/view\.length===2&&view\[0\]==="products"\?"products-sync"/);
 const entry=source("components/commerce-page.tsx");
 assert.match(entry,/props\.view==="products-sync"\?"products"/);
 assert.match(entry,/props\.view==="courier"\?"delivery"/);
});
test("unconverted-order follow-up route reads only draft or hold source, never a fictional commerce resource",()=>{
 for(const mode of ["ai","commerce","both"])
  assert.equal(navigation.unifiedDestination(mode,"orders",["to-chase"]).section,"orders");
 assert.equal(navigation.unifiedDestination("off","orders",["to-chase"]),null);
 const page=source("components/commerce-page.tsx");
 assert.match(page,/\["scan","to-chase"\]\.includes\(props\.view\)/);
 assert.match(page,/NULL::uuid,0,'','draft',''/);
 const view=source("components/commerce-workspace.tsx");
 assert.match(view,/chaseMode\?"draft":""/);
 assert.match(view,/chaseMode\?\["draft","hold"\]:states/);
 assert.match(view,/Open customer follow-ups/);
 assert.match(view,/no customer message is sent automatically/i);
});
test("order reports are explicit and fail closed behind a deployment flag",()=>{
 for(const mode of ["ai","commerce","both"])
  assert.equal(navigation.unifiedDestination(mode,"reports",["orders"]).section,"reports");
 assert.equal(navigation.unifiedDestination("off","reports",["orders"]),null);
 const route=source("components/unified-merchant-route.tsx");
 assert.match(route,/BRIOFOLD_COMMERCE_REPORTS_ENABLED!=="true"/);
 assert.match(route,/BriofoldOrderReport/);
 const report=source("components/briofold-order-report.tsx");
 assert.match(report,/commerce_order_report/);
 assert.match(report,/No totals have been assumed/);
});
test("notifications open for the preferred single Store without a legacy workspace detour",()=>{
 const entry=source("app/[locale]/notifications/page.tsx");
 assert.match(entry,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(entry,/aiEnabled&&<InboxAlerts/);
 assert.match(entry,/paymentContext&&<PaymentNotificationCenter/);
 assert.doesNotMatch(entry,/workspacesFor|redirect\(`\/w\//);
});
test("unified operational activity preserves the financial event source",()=>{
 for(const mode of ["ai","commerce","both"])
  assert.equal(navigation.unifiedDestination(mode,"settings",["activity"]).section,"events");
 const route=source("components/unified-merchant-route.tsx");
 assert.match(route,/BRIOFOLD_ACTIVITY_UNIFIED_ENABLED==="true"/);
 assert.match(route,/BriofoldUnifiedActivity/);
 assert.match(route,/section="events" service="payments"/);
 const sql=source("components/briofold-unified-activity.tsx");
 assert.match(sql,/briofold_unified_activity/);
 assert.match(sql,/no empty history has been assumed/);
});
test("canonical product gates cover all roots, settings and valid subroutes",()=>{
 for(const mode of ["ai","commerce","both","off"]){
  for(const item of navigation.unifiedNavigation){
   const result=navigation.unifiedDestination(mode,item.key,[]);
   assert.equal(Boolean(result),navigation.enabledUnifiedService(mode,item.service),mode+"/"+item.key);
   if(result){assert.equal(typeof result.section,"string");assert.ok(["ai","payments"].includes(result.service));}
  }
  for(const group of navigation.unifiedSettings)for(const item of group.items){
   const result=navigation.unifiedDestination(mode,"settings",[item.slug]);
   const enabled=!item.external&&navigation.enabledUnifiedService(mode,item.service);
   assert.equal(Boolean(result),enabled,mode+"/settings/"+item.slug);
  }
 }
 for(const part of ["transactions","links","refunds"]){
  assert.equal(navigation.unifiedDestination("ai","payments",[part]),null);
  for(const mode of ["commerce","both"])assert.equal(navigation.unifiedDestination(mode,"payments",[part]).service,"payments");
 }
 for(const part of ["comments","saved-replies","tickets","agent-desk"]){
  assert.equal(navigation.unifiedDestination("commerce","inbox",[part]),null);
  for(const mode of ["ai","both"])assert.equal(navigation.unifiedDestination(mode,"inbox",[part]).service,"ai");
 }
});

function renderDraftSwitch({save=true,discard=true,choose=true,pathname="/dashboard"}={}){
 const states=[],refs=[],nodes=[],events=[];
 let stateIndex=0,refIndex=0,dirty=true;
 const workspace={id:"10000000-0000-4000-8000-000000000001",name:"First",mode:"both",role:"owner"};
 const target={...workspace,id:"10000000-0000-4000-8000-000000000002",name:"Second"};
 const router={push:href=>events.push(["push",href]),refresh:()=>events.push(["refresh"]),prefetch:()=>{}};
 const react={
  useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},
  useRef(initial){const i=refIndex++;return refs[i]??=( {current:initial} );},
  useEffect(){},useCallback:fn=>fn,useTransition:()=>[false,fn=>fn()]
 };
 const jsx=(type,props,key)=>{const node={type,props,key};nodes.push(node);return node;};
 const exports={};
 const compile=(text)=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const sections={};runInNewContext(compile(source("lib/dashboard-sections.ts")),{exports:sections});
 const legacy={};runInNewContext(compile(source("lib/dashboard-navigation.ts")),{exports:legacy,require:()=>sections});
 const deps={
  react,"react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"fragment"},
  "next/navigation":{useRouter:()=>router,usePathname:()=>pathname},
  "next/link":{default:()=>null},
  "../lib/plan-features":{planSectionAllowed:()=>true},
  "../lib/dashboard-sections":sections,"../lib/dashboard-navigation":legacy,
  "../lib/unified-navigation":navigation,
  "../actions/unified-business":{chooseUnifiedBusiness:async id=>{
   events.push(["choose",id]);if(choose instanceof Error)throw choose;return choose;
  }},
  "../lib/client/draft-navigation":{
   activeDrafts:()=>dirty?[{}]:[],
   saveActiveDrafts:async()=>{events.push(["save"]);if(save)dirty=false;return save;},
   discardActiveDrafts:()=>{events.push(["discard"]);if(discard)dirty=false;return discard;}
  },
  "./dashboard-icon":{DashboardIcon:()=>null},"./site-controls":{SiteControls:()=>null},
  "./dashboard-feedback":{DashboardFeedback:()=>null},"./payment-notifications":{PaymentNotifications:()=>null},
  "./payment-record-search":{PaymentRecordSearch:()=>null}
 };
 runInNewContext(compile(source("components/dashboard-frame.tsx")),{exports,require:id=>{
  if(!Object.hasOwn(deps,id))throw Error("Unexpected frame dependency "+id);return deps[id];
 }});
 const render=()=>{stateIndex=0;refIndex=0;nodes.length=0;exports.DashboardFrame({
  unified:true,locale:"en",service:"payments",section:"overview",workspace,spaces:[workspace,target],
  userName:"Fixture",platformAdmin:false,theme:"light",children:null,logout:null
 });};
 const button=label=>nodes.find(n=>n.type==="button"&&n.props.children===label);
 render();
 nodes.find(n=>n.type==="button"&&n.key===target.id).props.onClick();
 render();
 return {events,render,button,nodes,target};
}
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
for(const decision of ["Save draft","Discard"]){
 test("dirty business switch "+decision+" selects the business before canonical navigation",async()=>{
  const h=renderDraftSwitch();assert.deepEqual(h.events,[]);
  h.button(decision).props.onClick();await drain();
  assert.deepEqual(h.events,[[decision==="Discard"?"discard":"save"],["choose",h.target.id],["push","/dashboard"],["refresh"]]);
 });
}
test("failed draft save/discard never changes the business or route",async()=>{
 for(const [decision,options] of [["Save draft",{save:false}],["Discard",{discard:false}]]){
  const h=renderDraftSwitch(options);h.button(decision).props.onClick();await drain();
  assert.deepEqual(h.events,[[decision==="Discard"?"discard":"save"]]);
  h.render();assert.ok(h.nodes.some(n=>n.props?.role==="alert"));
 }
});
test("revoked membership and selection errors keep the draft dialog without navigation",async()=>{
 for(const choose of [false,new Error("unavailable")]){
  const h=renderDraftSwitch({choose});h.button("Discard").props.onClick();await drain();h.render();
  assert.deepEqual(h.events,[["discard"],["choose",h.target.id]]);
  assert.ok(h.nodes.some(n=>n.props?.role==="alert"));
 }
});
test("Stay cancels pending business selection",async()=>{
 const h=renderDraftSwitch();h.button("Stay").props.onClick();await drain();
 assert.deepEqual(h.events,[]);
});

test("internal locale rewrite and canonical URL render identical active navigation",()=>{
 for(const path of ["/dashboard","/inbox","/payments/links","/settings/preferences"]){
  const project=pathname=>renderDraftSwitch({pathname}).nodes.filter(n=>n.props.className==="is-current").map(n=>({href:n.props.href,current:n.props["aria-current"]}));
  const canonical=project(path);assert.ok(canonical.length>0);
  for(const locale of ["en","bn"])assert.deepEqual(project("/"+locale+path),canonical);
 }
});
