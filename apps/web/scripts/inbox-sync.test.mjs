import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module from 'node:module';
const compiled=await build({entryPoints:['src/lib/client/inbox-sync.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const loaded=new Module(import.meta.url);loaded._compile(compiled.outputFiles[0].text,'inbox-sync-check.cjs');
const {createInboxSyncScheduler}=loaded.exports;
function clock(){const jobs=new Map();let next=0;return {schedule(callback){const id=next++;jobs.set(id,callback);return()=>jobs.delete(id)},tick(){const batch=[...jobs.values()];jobs.clear();for(const run of batch)run()},get size(){return jobs.size}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
{
 const timer=clock();let runs=0,release;const scheduler=createInboxSyncScheduler({schedule:timer.schedule,run:()=>{runs++;return runs===1?new Promise(resolve=>{release=resolve}):Promise.resolve()}});
 scheduler.request();scheduler.request();assert.equal(timer.size,1);timer.tick();assert.equal(runs,1);
 scheduler.request();scheduler.request();assert.equal(timer.size,0);release();await settle();assert.equal(timer.size,1);
 timer.tick();await settle();assert.equal(runs,2);
 // The next unrelated event must still be processed after a trailing refresh.
 scheduler.request();timer.tick();await settle();assert.equal(runs,3);scheduler.dispose();
}
{
 const timer=clock();let visible=false,runs=0;const scheduler=createInboxSyncScheduler({schedule:timer.schedule,visible:()=>visible,run:async()=>{runs++}});
 scheduler.request();assert.equal(timer.size,0);visible=true;await scheduler.flush();assert.equal(runs,1);
 scheduler.request();scheduler.dispose();timer.tick();assert.equal(runs,1);
}
{
 const timer=clock();let runs=0,errors=0;const scheduler=createInboxSyncScheduler({schedule:timer.schedule,onError:()=>errors++,run:async()=>{if(++runs===1)throw Error('temporary')}});
 scheduler.request();timer.tick();await settle();assert.equal(errors,1);scheduler.request();timer.tick();await settle();assert.equal(runs,2);scheduler.dispose();
}
console.log('Inbox sync: overlapping events, trailing updates, continued events, hidden-tab resume, disposal and recovery passed.');
