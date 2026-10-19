import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseReceivingAccountId} from '../src/lib/checkout-account-selection.ts';

test('method passed by /pay chooses its matching receiving account once',()=>{
 const accounts=[{id:'b1',method:'bkash'},{id:'n1',method:'nagad'},{id:'b2',method:'bkash'}];
 assert.equal(chooseReceivingAccountId('bkash','',accounts,true),'b1');
 assert.equal(chooseReceivingAccountId('bkash','b2',accounts,true),'b2');
 assert.equal(chooseReceivingAccountId('bkash','n1',accounts,true),'b1');
 assert.equal(chooseReceivingAccountId('rocket','',accounts,true),'');
 assert.equal(chooseReceivingAccountId('bkash','',accounts,false),'');
});
test('document and checkout preserve theme and selected method across route transition',()=>{
 const doc=readFileSync(new URL('../src/components/public-document.tsx',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../src/components/checkout-experience.tsx',import.meta.url),'utf8');
 assert.match(doc,/resolveCheckoutTheme\(doc\.brand\?\.checkout_theme,doc\.merchant_name,logo\)/);
 assert.match(doc,/\?method="\+selected/);
 assert.match(checkout,/chooseReceivingAccountId\(method,selectedAccountId,info\.receiving_accounts,methodChosen\)/);
 assert.match(checkout,/receiving_account_id:accountId\|\|undefined/);
 assert.match(checkout,/resolveCheckoutTheme\(info\.brand\?\.checkout_theme,info\.merchant_name,logoUrl\)/);
});
