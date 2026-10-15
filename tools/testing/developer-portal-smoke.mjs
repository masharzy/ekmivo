import assert from 'node:assert/strict';
const origin=process.env.PORTAL_TEST_ORIGIN||'http://localhost:3027';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('Use a local test server');
const paths=['','/quickstart','/authentication','/payments/create','/payments/verify','/webhooks','/errors','/sandbox','/go-live','/api-reference','/changelog'];
const checks=[];
for(const locale of ['en','bn'])for(const path of paths){
 const response=await fetch(origin+'/developers'+path,{headers:{Cookie:'ekmivo-locale='+locale},signal:AbortSignal.timeout(90000)});
 const html=await response.text();assert.equal(response.status,200,path);assert.match(html,/class="dp-portal"/);assert.doesNotMatch(html,/class="site-header|class="site-footer/);assert.match(html,new RegExp('<html[^>]+lang="'+locale+'"'));assert.match(html,/rel="canonical"/);assert.match(html,/property="og:title"/);
 checks.push({locale,path:'/developers'+path,status:response.status});
}
const key='ek_test_'+'a'.repeat(16)+'_'+'a'.repeat(43);
for(const [body,status,code,source] of [
 [{testKey:'ek_live_do_not_send',action:'create'},401,'SANDBOX_KEY_REQUIRED',origin],
 [{testKey:key,action:'create',amount:0},422,'INVALID_AMOUNT',origin],
 [{testKey:key,action:'verify',invoice_id:'invalid'},422,'INVALID_INVOICE_ID',origin],
 [{testKey:key,action:'other'},422,'INVALID_ACTION',origin],
 [{testKey:key,action:'create'},403,'ORIGIN_DENIED','https://unrelated.example']
]){const response=await fetch(origin+'/api/developers/sandbox',{method:'POST',headers:{'Content-Type':'application/json',Origin:source},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const result=await response.json();assert.equal(response.status,status);assert.equal(result.error.code,code);assert.ok(!JSON.stringify(result).includes(key));assert.match(response.headers.get('cache-control'),/no-store/);checks.push({check:code,status:response.status});}
const missing=await fetch(origin+'/developers/does-not-exist');assert.equal(missing.status,404);
console.log(JSON.stringify({mode:'local-read-only-and-rejected-requests',passed:checks.length+1,checks},null,2));
