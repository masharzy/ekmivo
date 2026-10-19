import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCheckoutTheme,resolveCheckoutTheme} from '../src/lib/checkout-theme.ts';
test('missing and invalid saved themes use Official with the actual merchant identity',()=>{
 for(const raw of [undefined,'','null','{}','{broken']){
  const theme=resolveCheckoutTheme(raw,'Easy Education 02','https://example.com/logo.png');
  assert.equal(theme.theme,'official');assert.equal(theme.store.name,'Easy Education 02');assert.equal(theme.store.logo,'https://example.com/logo.png');
 }
});
test('valid selected theme and its merchant customization survive the default fallback',()=>{
 const saved=defaultCheckoutTheme('Merchant');saved.theme='studio';saved.store.size=72;saved.f.email=false;
 assert.deepEqual(resolveCheckoutTheme(JSON.stringify(saved),'Another name'),saved);
});
