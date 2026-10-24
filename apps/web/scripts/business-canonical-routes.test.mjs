import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
function compile(name,deps={}){const exports={};const code=ts.transpileModule(source(name),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;runInNewContext(code,{exports,URL,require:id=>{if(!(id in deps))throw Error('Unknown module '+id);return deps[id];}});return exports;}
const sections=compile('lib/dashboard-sections.ts');
const unified=compile('lib/unified-navigation.ts');
const nav=compile('lib/dashboard-navigation.ts',{'./dashboard-sections':sections,'./unified-navigation':unified});
const legacy=compile('lib/legacy-dashboard.ts',{'./dashboard-navigation':nav,'./dashboard-sections':sections,'./unified-navigation':unified});
const id='123e4567-e89b-42d3-a456-426614174000';
test('every merchant section generates an ID-free canonical URL in either locale',()=>{
 for(const locale of ['en','bn'])for(const service of ['ai','payments'])for(const key of Object.keys(sections.sections)){
  const url=nav.dashboardHref(locale,id,service,key);
  assert.ok(url.startsWith('/')&&!url.startsWith('//'));
  assert.ok(!url.includes(id)&&!/^\/(w|en|bn)\//.test(url));
 }
 assert.equal(nav.dashboardHref('bn',id,'payments','requests'),'/payments/links?view=requests');
 for(const path of ['/payments/transactions/','/sms-data/','/invoices/','/customers/financial/'])assert.equal(unified.isUnifiedFinancialDetailPath(path+id),true);
 for(const path of ['//evil.invalid/'+id,'/w/'+id+'/payments/transactions/'+id,'/payments/transactions/'+id+'?next=evil','/payments/transactions/'+id+'/extra'])assert.equal(unified.isUnifiedFinancialDetailPath(path),false);
});
test('old financial details retain exact record identity and request mode; untrusted URL fields cannot select a business',()=>{
 for(const [section,path] of [['payments','/payments/transactions/'],['transactions','/payments/transactions/'],['incoming','/sms-data/'],['customers','/customers/financial/'],['invoices','/invoices/'],['payment-links','/payments/links/'],['refunds','/payments/refunds/'],['devices','/settings/devices/']])assert.equal(legacy.legacyDashboardPath('commerce','payments',section,id),path+id);
 assert.equal(legacy.legacyDashboardPath('commerce','payments','requests',undefined,{request:id,env:'sandbox',workspace_id:id,next:'https://attacker.invalid'}),'/payments/links?view=requests&request='+id);
 for(const bad of ['__proto__','constructor','not-a-uuid'])assert.equal(legacy.legacyDashboardPath('commerce','payments','transactions',bad),null);
});
test('payments-only navigation/settings and legacy redirects deny AI products',()=>{
 const ai=['inbox','comments','channels','knowledge','broadcasts'];
 for(const slug of ['leads','follow-ups','broadcasts','bookings','posts'])assert.equal(unified.unifiedDestination('commerce','customers',[slug]),null);
 assert.equal(unified.unifiedDestination('commerce','settings',['team','scopes']),null);
 assert.ok(unified.unifiedDestination('commerce','customers',['financial']));
 for(const section of ai)assert.equal(legacy.legacyDashboardPath('commerce','ai',section),null);
 assert.equal(legacy.legacyDashboardPath('ai','payments','transactions'),null);
 assert.equal(legacy.legacyDashboardPath('off','payments','overview'),null);
 assert.ok(unified.unifiedNavigation.filter(x=>unified.enabledUnifiedService('commerce',x.service)).every(x=>x.service!=='ai'));
 assert.ok(unified.unifiedSettings.flatMap(x=>x.items).filter(x=>unified.enabledUnifiedService('commerce',x.service)).every(x=>x.service!=='ai'));
 assert.equal(unified.unifiedDestination('commerce','settings',['apps']).section,'apps');
});
test('authenticated old links cannot silently redirect into a different selected business',async()=>{
 const calls=[];let selected=id,mode='commerce';
 const server=compile('lib/server/legacy-dashboard.ts',{
  'next/navigation':{notFound:()=>{throw Error('DENIED');},redirect:url=>{throw Error('REDIRECT:'+url);}},
  './auth':{requireWorkspace:async(locale,business)=>{calls.push(business);if(business!==id)throw Error('FOREIGN');return {user:{id:'actor'},workspace:{id,mode}};},preferredWorkspaceFor:async()=>({id:selected})},
  '../legacy-dashboard':legacy
 });
 await assert.rejects(()=>server.redirectLegacyDashboard('en',id,'payments','transactions',id),e=>e.message==='REDIRECT:/payments/transactions/'+id);
 selected='another-business';await assert.rejects(()=>server.redirectLegacyDashboard('en',id,'payments','transactions',id),e=>e.message==='DENIED');
 await assert.rejects(()=>server.redirectLegacyDashboard('en','foreign','payments','overview'),e=>e.message==='FOREIGN');
 selected=id;mode='off';await assert.rejects(()=>server.redirectLegacyDashboard('en',id),e=>e.message==='REDIRECT:/dashboard');
 await assert.rejects(()=>server.redirectLegacyDashboard('en',id,'ai','inbox'),e=>e.message==='DENIED');
 assert.equal(calls.length,5);
});
