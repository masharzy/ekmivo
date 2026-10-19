import test from 'node:test';
import assert from 'node:assert/strict';
import {billingPaymentMessage,billingPaymentError} from '../src/lib/billing-payment-status.ts';
test('cancelled and expired checkouts explain that no transfer is verified, without encouraging duplicate payment',()=>{
 for(const bn of [false,true])for(const state of ['cancelled','expired']){
  const text=billingPaymentMessage(state,bn);
  assert.match(text,bn?/যাচাই হয়নি/:/No payment has been verified/);
  assert.match(text,bn?/সহায়তা/:/contact support/);
 }
});
test('pending checks and service failures remain distinct and technical codes never reach the buyer',()=>{
 for(const bn of [false,true]){
  assert.notEqual(billingPaymentMessage('awaiting_payment',bn),billingPaymentError('BILLING_VERIFICATION_UNAVAILABLE',bn));
  for(const code of ['VERIFIED_PLATFORM_PAYMENT_REQUIRED','BILLING_STATE_CHANGED','PLATFORM_RECEIVING_UNAVAILABLE','unexpected_provider_secret'])assert.ok(!billingPaymentError(code,bn).includes(code));
 }
});
