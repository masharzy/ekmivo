import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Module from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
const compiled=await build({entryPoints:['src/proxy.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
const loaded=new Module(import.meta.url);loaded.paths=Module._nodeModulePaths(process.cwd());loaded._compile(compiled.outputFiles[0].text,'proxy-check.cjs');
const token='a'.repeat(43);
for(const [url,expected] of [['https://briofold.tech/inbox',true],['https://briofold.tech/en/inbox',true],['https://preview.vercel.app/inbox',false],['http://briofold.tech/inbox',false],['https://briofold.tech/api/go/test',false]]){
 const response=loaded.exports.proxy(new NextRequest(url,{headers:{cookie:`briofold-session=${token}`}}));
 const cookie=response.cookies.get('__Secure-briofold-api-session');assert.equal(!!cookie,expected);
 if(expected){assert.equal(cookie.value,token);assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'strict');assert.equal(cookie.path,'/v1/');assert.equal(cookie.domain,'briofold.tech');assert.equal(response.headers.get('cache-control'),'private, no-store');}
}
const response=loaded.exports.proxy(new NextRequest('https://briofold.tech/inbox'));assert.equal(response.cookies.get('__Secure-briofold-api-session'),undefined);
console.log('API session bootstrap: canonical/legacy pages, cookie flags, cache policy and host boundaries passed.');
