import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url)),ts=require('typescript'),module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../apps/web/src/lib/client/payment-method-errors.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports});
const {paymentMethodError}=module.exports;
test('account plan limit has an actionable message',()=>assert.match(paymentMethodError(403,'PLAN_RESOURCE_LIMIT',false),/receiving-account limit/));
test('non-JSON gateway errors retain HTTP status without claiming the save failed',()=>{const m=paymentMethodError(502,'',false);assert.match(m,/not confirmed/);assert.match(m,/HTTP_502/);assert.match(m,/Refresh/)});
test('duplicate account explains refresh instead of retrying creation',()=>assert.match(paymentMethodError(409,'CONFLICT',false),/already exists/));
test('safe diagnostic code and request ID are retained',()=>assert.match(paymentMethodError(503,'PLAN_SNAPSHOT_REQUIRED',false,'a'.repeat(24)),/PLAN_SNAPSHOT_REQUIRED · a{24}/));
test('Bengali message and unsafe diagnostic filtering',()=>{const m=paymentMethodError(503,'<html>bad</html>',true,'secret');assert.match(m,/সংরক্ষণ নিশ্চিত হয়নি/);assert.ok(!m.includes('<html>'));assert.ok(!m.includes('secret'))});
