import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
test('actual website embed: reload-safe retry, text safety, history and keyboard (mock transport)',async()=>{
 const script=await readFile(new URL('../../../backend/internal/checkout/website_widget.js',import.meta.url),'utf8'),browser=await chromium.launch({headless:true}),context=await browser.newContext();
 const site='a69fd4c7-c6ea-4709-92f6-dd3b80691e4f',secret='a'.repeat(64);let items=[],calls=0,lost=true;const keys=[];
 try{
  await context.route('https://widget.fixture.example/**',async route=>{
   const request=route.request();if(request.url().endsWith('/widget.js'))return route.fulfill({contentType:'text/javascript',body:script});
   const headers={'Access-Control-Allow-Origin':'https://shop.fixture.example','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   assert.equal(request.method(),'POST');assert.ok(!request.url().includes(secret));assert.equal(request.headers().cookie,undefined);const body=request.postDataJSON();
   if(body.action==='start')return route.fulfill({headers,json:{secret,started:true}});assert.equal(body.secret,secret);
   if(body.action==='send'){calls++;keys.push(body.key);if(!items.some(x=>x.key===body.key))items.push({sequence:items.length+1,sender:'customer',body:body.text,key:body.key});if(lost){lost=false;return route.abort('failed');}}
   return route.fulfill({headers,json:{items:items.filter(x=>!body.before||x.sequence<body.before).slice(-50)}});
  });
  await context.route('https://shop.fixture.example/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><script src="https://widget.fixture.example/v1/channels/website/widget.js" data-site="${site}"></script></head><body><h1>Fictional shop</h1></body></html>`}));
  const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto('https://shop.fixture.example');const widget=page.locator(`[data-briofold-chat="${site}"]`);
  await widget.getByRole('button',{name:'Chat',exact:true}).click();const input=widget.getByRole('textbox',{name:'Message'});await input.fill('<img src=x onerror="window.widgetXss=true"> দাম কত?');
  await widget.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));});await widget.getByRole('button',{name:'Try again',exact:true}).waitFor();assert.equal(calls,1);assert.equal(await input.isDisabled(),true);
  await page.reload();await widget.getByRole('button',{name:'Chat',exact:true}).click();await widget.getByRole('status').filter({hasText:'Message delivery is unconfirmed'}).waitFor();assert.match(await input.inputValue(),/দাম কত/);assert.equal(await input.isDisabled(),true);
  await widget.getByRole('button',{name:'Retry send',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-briofold-chat]').shadowRoot.querySelector('input').disabled);assert.equal(calls,2);assert.equal(new Set(keys).size,1);assert.equal(items.length,1);assert.equal(await input.inputValue(),'');assert.equal(await widget.locator('li img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.widgetXss)),false);
  items=Array.from({length:100},(_,i)=>({sequence:i+1,sender:i%2?'seller':'customer',body:'History message '+(i+1)}));await widget.getByRole('button',{name:'Close',exact:true}).click();await widget.getByRole('button',{name:'Chat',exact:true}).click();await widget.getByText('Team: History message 100',{exact:true}).waitFor();await widget.getByRole('button',{name:'Older messages',exact:true}).click();await widget.getByText('Team: History message 50',{exact:true}).waitFor();await widget.getByRole('button',{name:'Latest messages',exact:true}).click();await widget.getByText('Team: History message 100',{exact:true}).waitFor();await input.press('Escape');assert.equal(await widget.locator('section').isHidden(),true);
 }finally{await context.close();await browser.close();}
});
