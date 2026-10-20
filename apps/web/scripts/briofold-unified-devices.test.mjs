import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const moduleBody=ts.transpileModule(read("lib/unified-navigation.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const cjs={exports:{}};
vm.runInNewContext(moduleBody,{module:cjs,exports:cjs.exports});
const {unifiedDestination}=cjs.exports;

test("AI-only Devices opens its existing native Inbox device manager",()=>{
 const d=unifiedDestination("ai","settings",["devices"]);
 assert.equal(d?.kind,"devices");
 assert.equal(d?.service,"ai");
});
test("Payments-only Devices retains the existing financial SMS device manager",()=>{
 const d=unifiedDestination("commerce","settings",["devices"]);
 assert.equal(d?.kind,undefined);
 assert.equal(d?.section,"devices");
 assert.equal(d?.service,"payments");
});
test("Both enabled uses a selector with BOTH original independently authorized backends",()=>{
 const d=unifiedDestination("both","settings",["devices"]);
 assert.equal(d?.kind,"mixed-devices");
 assert.equal(d?.service,"payments");
 const resolver=read("components/unified-merchant-route.tsx");
 const selector=read("components/unified-devices-settings.tsx");
 assert.match(resolver,/kind==="mixed-devices"&&paymentContext/);
 assert.match(resolver,/smsDevices=\{<DashboardContent/);
 assert.match(resolver,/aiDevices=\{<WorkspaceMobileDevices/);
 assert.match(selector,/role="tablist"/);
 assert.match(selector,/role="tabpanel"/);
 assert.match(selector,/aria-selected/);
 assert.match(selector,/aria-controls/);
 assert.match(selector,/document\.getElementById\("device-tab-"/);
});
test("No access from off business or more than one unmatched settings slug",()=>{
 assert.equal(unifiedDestination("off","settings",["devices"]),null);
 assert.equal(unifiedDestination("both","settings",["devices","unexpected"]),null);
});

async function deviceHarness(options={}){
 const states=[],refs=[],nodes=[],effects=[],timeouts=[],intervals=[],writes=[];
 let stateIndex=0,refIndex=0;
 const device={id:"10000000-0000-4000-8000-000000000009",name:"Fixture phone",claimed_at:"2026-10-20"};
 const api={listStatus:200,items:[device],mutationStatus:200,barrier:null,...options};
 const modal=()=>null,jsx=(type,props,key)=>{const node={type,props,key};nodes.push(node);return node;};
 const react={
  useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},
  useRef(initial){const i=refIndex++;return refs[i]??={current:initial};},
  useCallback:fn=>fn,useEffect:fn=>effects.push(fn)
 };
 const exports={},dependencies={
  react,"react/jsx-runtime":{jsx,jsxs:jsx},
  "./workspace-messaging.module.css":{default:{}},
  "../lib/pairing-qr.mjs":{pairingSvg:()=>"<svg/>"},"./reference-ui":{RefModal:modal}
 };
 const compiled=ts.transpileModule(read("components/workspace-mobile-devices.tsx"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
 }).outputText;
 vm.runInNewContext(compiled,{exports,AbortController,document:{visibilityState:"visible"},
  setTimeout:fn=>{timeouts.push(fn);return timeouts.length;},clearTimeout(){},
  setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},
  fetch:async(url,request={})=>{
   if(request.method==="POST"){
    writes.push({url,body:JSON.parse(request.body)});
    if(api.barrier)await api.barrier;
    const status=api.mutationStatus;
    if(status===200&&url.includes("/delete?"))api.items=[];
    return {status,ok:status===200,json:async()=>({})};
   }
   return {status:api.listStatus,ok:api.listStatus===200,json:async()=>({items:api.items})};
  },
  require:id=>{if(!Object.hasOwn(dependencies,id))throw Error("Unexpected device dependency "+id);return dependencies[id];}
 },{timeout:3000});
 const render=()=>{stateIndex=0;refIndex=0;nodes.length=0;effects.length=0;exports.WorkspaceMobileDevices({workspaceId:"10000000-0000-4000-8000-000000000001",bn:false});};
 const button=label=>nodes.filter(n=>n.type==="button"&&n.props.children===label).at(-1);
 const isModal=()=>nodes.some(n=>n.type===modal&&n.props.title==="Delete phone");
 render();effects[0]();timeouts[0]();await flushDevices();render();
 return {api,device,writes,nodes,render,button,isModal,poll:()=>intervals[0]()};
}
async function flushDevices(){for(let i=0;i<24;i++)await Promise.resolve();}
test("failed device delete keeps confirmation open and can retry with the same phone ID",async()=>{
 const h=await deviceHarness({mutationStatus:503});
 h.button("Delete").props.onClick();h.render();assert.equal(h.isModal(),true);
 h.button("Delete").props.onClick();await flushDevices();h.render();
 assert.equal(h.isModal(),true);assert.ok(h.nodes.some(n=>n.props?.role==="alert"));
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].body.phone_id,h.device.id);
 h.api.mutationStatus=200;h.button("Delete").props.onClick();await flushDevices();h.render();
 assert.equal(h.isModal(),false);assert.equal(h.writes.length,2);
 assert.equal(h.writes[1].body.phone_id,h.device.id);
});
test("rapid duplicate confirmations issue one device mutation",async()=>{
 const h=await deviceHarness();let finish;
 h.api.barrier=new Promise(resolve=>{finish=resolve;});
 h.button("Delete").props.onClick();h.render();
 const confirm=h.button("Delete");confirm.props.onClick();confirm.props.onClick();
 assert.equal(h.writes.length,1);finish();await flushDevices();h.render();
 assert.equal(h.isModal(),false);
});
test("revoked device access clears private rows, disables actions and permits explicit access retry",async()=>{
 const h=await deviceHarness();h.api.listStatus=403;h.poll();await flushDevices();h.render();
 assert.equal(h.button("Connect phone").props.disabled,true);
 assert.equal(h.nodes.some(n=>n.props?.children==="Fixture phone"),false);
 assert.ok(h.nodes.some(n=>n.props?.role==="alert"));
 h.api.listStatus=200;h.button("Retry").props.onClick();await flushDevices();h.render();
 assert.equal(h.button("Connect phone").props.disabled,false);
 assert.ok(h.nodes.some(n=>n.props?.children==="Fixture phone"));
});
test("malformed device data is an error rather than a crash or false empty state",async()=>{
 const h=await deviceHarness({items:"unavailable"});
 assert.ok(h.nodes.some(n=>n.props?.role==="alert"));
 assert.equal(h.nodes.some(n=>n.props?.children==="No connected devices."),false);
});
