import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../../apps/web/node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(readFileSync(new URL('../../apps/web/src/lib/plan-features.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {planSectionAllowed,sectionPlanFeature}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('all combinations of configurable feature flags gate the matching pages independently',()=>{
 for(let mask=0;mask<16;mask++){
  const features=Object.fromEntries(['invoices','payment_links','reports','exports'].map((key,i)=>[key,Boolean(mask&(1<<i))]));
  for(const [section,feature]of Object.entries(sectionPlanFeature))assert.equal(planSectionAllowed(section,features),features[feature]);
  for(const section of ['requests','customers','gateways','devices','billing','team','overview'])assert.equal(planSectionAllowed(section,features),true);
 }
});
test('unavailable plan data never grants a paid feature or blocks billing and core checkout',()=>{
 for(const features of [null,undefined,{}]){
  for(const section of Object.keys(sectionPlanFeature))assert.equal(planSectionAllowed(section,features),false);
  for(const section of ['billing','requests','help'])assert.equal(planSectionAllowed(section,features),true);
 }
});

const {createRequire}=await import('node:module');
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function loadTS(relative,overrides={}){
 const code=ts.transpileModule(readFileSync(new URL(relative,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};Function('require','module','exports',code)(id=>overrides[id]??require(id),module,module.exports);return module.exports;
}
const labels=loadTS('../../apps/web/src/lib/payment-plans.ts');
const {PlanFeatureUpgrade,ExportUpgradeLink}=loadTS('../../apps/web/src/components/plan-feature-upgrade.tsx',{'next/link':({children,...props})=>React.createElement('a',props,children),'../lib/payment-plans':labels,'./dashboard-icon':{DashboardIcon:()=>React.createElement('svg')}});
test('all feature upgrade cards render bilingual names and a working plans destination',()=>{
 for(const feature of Object.keys(labels.featureLabels))for(const locale of ['en','bn']){
  const html=renderToStaticMarkup(React.createElement(PlanFeatureUpgrade,{feature,locale,workspaceId:'tenant'}));
  assert.ok(html.includes('/w/tenant/payments/billing?tab=plans'));
  assert.ok(html.includes(locale==='bn'?'প্ল্যান দেখুন':'Explore plans'));
  assert.ok(html.includes(labels.featureLabels[feature][locale==='bn'?1:0].toLowerCase()));
 }
});
test('source failure renders retry instead of an upgrade claim',()=>{
 const html=renderToStaticMarkup(React.createElement(PlanFeatureUpgrade,{feature:'payment_links',locale:'en',workspaceId:'tenant',unavailable:true}));
 assert.match(html,/Plan information unavailable/);assert.match(html,/Try again/);assert.doesNotMatch(html,/Explore plans|isn’t included/);
 assert.match(renderToStaticMarkup(React.createElement(ExportUpgradeLink,{locale:'bn',workspaceId:'tenant'})),/এক্সপোর্টের জন্য প্ল্যান আপগ্রেড করুন/);
});
