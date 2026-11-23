import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKOUT_RETURN_SECONDS,checkoutReturnUrl,compactOrderReference} from '../src/lib/checkout-return.ts';
test('merchant success and cancellation return after ten seconds using appropriate destination',()=>{
 assert.equal(CHECKOUT_RETURN_SECONDS,10);
 assert.equal(checkoutReturnUrl('completed','merchant','https://merchant.test/paid','https://merchant.test/cancel'),'https://merchant.test/paid');
 assert.equal(checkoutReturnUrl('cancelled','merchant','https://merchant.test/paid','https://merchant.test/cancel'),'https://merchant.test/cancel');
 assert.equal(checkoutReturnUrl('cancelled','merchant','https://merchant.test/paid'),'https://merchant.test/paid');
});
test('payment links only after payment; unknown origin, nonterminal states and unsafe URLs never redirect',()=>{
 // Owner 2026-11-23: a payment link redirects after a completed payment only.
 assert.equal(checkoutReturnUrl('completed','payment_link','https://merchant.test/paid'),'https://merchant.test/paid');
 assert.equal(checkoutReturnUrl('cancelled','payment_link','https://merchant.test/paid'),'');
 for(const state of ['completed','cancelled'])assert.equal(checkoutReturnUrl(state,undefined,'https://merchant.test/paid'),'');
 for(const state of ['expired','processing','awaiting_payment'])assert.equal(checkoutReturnUrl(state,'merchant','https://merchant.test'),'');
 for(const url of ['javascript:alert(1)','//evil.test','https://user:password@merchant.test','http://merchant.test'])assert.equal(checkoutReturnUrl('completed','merchant',url),'');
});
test('long order references retain identifying ends within bounded display',()=>{
 assert.equal(compactOrderReference('ORDER-123'),'ORDER-123');
 const long='ORDER-'+ 'x'.repeat(100)+'12345678';
 assert.equal(compactOrderReference(long),long.slice(0,16)+'…12345678');
 assert.ok(compactOrderReference(long).length<=28);
});
