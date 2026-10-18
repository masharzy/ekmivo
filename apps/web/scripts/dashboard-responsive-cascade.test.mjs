import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const root=new URL('../src/',import.meta.url);
const shell=['app/dashboard.css','app/dashboard-refinement.css','app/dashboard-v2.css','app/dashboard-shell-v3.css','app/dashboard-pass2.css'].map(p=>postcss.parse(readFileSync(new URL(p,root),'utf8')));
const billing=[postcss.parse(readFileSync(new URL('components/billing-reference.css',root),'utf8'))];
function declaration(trees,selectors,property,width){
 let best=null,order=0;
 for(const tree of trees)tree.walkRules(rule=>{
  let parent=rule.parent;
  while(parent&&parent.type!=='root'){
   if(parent.type==='atrule'&&parent.name==='media'){
    if(/prefers-/.test(parent.params))return;
    for(const match of parent.params.matchAll(/(max|min)-width\s*:\s*(\d+)px/g))if(match[1]==='max'?width>+match[2]:width<+match[2])return;
   }parent=parent.parent;
  }
  for(const selector of rule.selectors??[]){
   if(!selectors.includes(selector.replace(/\s*>\s*/g,'>')))continue;
   const specificity=(selector.match(/\.[\w-]+|\[[^\]]+\]/g)||[]).length;
   rule.walkDecls(property,decl=>{const score=(decl.important?100000:0)+specificity*1000;order++;if(!best||score>best.score||score===best.score&&order>best.order)best={score,order,value:decl.value}});
  }
 });
 return best?.value;
}
const payment=s=>[s,`.ds-app[data-service="payments"] ${s}`,`.ds-app[data-service="payments"]>${s}`];
for(const width of [320,375,390,768,800])test(`payment shell and billing stack at ${width}px`,()=>{
 assert.equal(declaration(shell,payment('.ds-sidebar'),'display',width),'none');
 assert.equal(declaration(shell,payment('.ds-mobile-trigger'),'display',width),'grid');
 assert.equal(declaration(shell,payment('.ds-topbar'),'height',width),'auto');
 assert.equal(declaration(billing,['.ref-billing .bl-g'],'grid-template-columns',width),'minmax(0,1fr)');
 assert.equal(declaration(billing,['.ref-billing .bl-k'],'grid-template-columns',width),'repeat(2,minmax(0,1fr))');
});
test('desktop retains sidebar, compact header and two-column billing',()=>{
 assert.equal(declaration(shell,payment('.ds-sidebar'),'display',1280),'flex');
 assert.equal(declaration(shell,payment('.ds-topbar'),'height',1280),'57px');
 assert.equal(declaration(billing,['.ref-billing .bl-g'],'grid-template-columns',1280),'minmax(0,1fr) 320px');
});
