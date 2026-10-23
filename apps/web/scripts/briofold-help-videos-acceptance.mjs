import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
// Two seconds of synthetic black video; no tutorial or provider proof implied.
const videoBase64='GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAKjEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggKN7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYixdFixXxYp3JyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAvrwgDgibCBILqBIJqBAhJUw2dAgHNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PaY8CLY8WIsXRYsV8WKdxnyKVFo4dFTkNPREVSRIeYTGF2YzYwLjMxLjEwMiBsaWJ2cHgtdnA5Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMi4wMDAwMDAwMDAAH0O2dUDj54EAo6GBAACAgkmDQgAB8AH2ADgkHBhKAAAwYAAAEN///VkVgACjk4EAyACGAECSnABQAAADIAAAQ0Cjk4EBkACGAECSnABO4AADIAAAQ0Cjk4ECWACGAECSnABQAAADIAAAQ0Cjk4EDIACGAECSnABNQAADIAAAQ0Cjk4ED6ACGAECSnABQAAADIAAAQ0Cjk4EEsACGAECSnABO4AADIAAAQ0Cjk4EFeACGAECSnABQAAADIAAAQ0Cjk4EGQACGAECSnABKIAADIAAAQ0Cjk4EHCACGAECSnABQAAADIAAAQ0AcU7trkbuPs4EAt4r3gQHxggGk8IED';
export async function runHelpVideos({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Tutorial acceptance refuses shared DB');
 const db=postgres(control,{max:3,prepare:false});let context,viewerContext;
 try{
  const owner=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.owner).digest('hex')}`)[0].user_id;
  const viewer=(await db`SELECT user_id FROM auth_sessions WHERE token_hash=${createHash('sha256').update(sessions.viewer).digest('hex')}`)[0].user_id;
  const store=randomUUID(),video=randomUUID(),unpublished=randomUUID();await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional tutorial Store','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  for(const [id,published] of [[video,true],[unpublished,false]])await db`INSERT INTO briofold_help_videos(id,module,title_en,title_bn,media_path,captions_en,captions_bn,duration_seconds,published)
   VALUES(${id},'inbox',${published?'Fictional Inbox tutorial':'Unpublished fixture'},'কাল্পনিক ইনবক্স নির্দেশিকা','/help-videos/fixture.webm','/help-videos/fixture-en.vtt','/help-videos/fixture-bn.vtt',2,${published})`;
  const read=async(actor=owner,module='')=>(await db`SELECT briofold_help_videos_read(${store},${actor},${module}) data`)[0].data;
  assert.equal((await read()).items.some(x=>x.id===unpublished),false);assert.equal((await read(owner,'payments')).items.some(x=>x.id===video),false);
  await assert.rejects(()=>db`SELECT briofold_help_videos_read(${randomUUID()},${owner},'')`,e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT briofold_help_video_progress(${store},${owner},${db.json({id:unpublished,position_seconds:2})})`,e=>e.code==='42501');
  await assert.rejects(()=>db`SELECT briofold_help_video_progress(${store},${owner},${db.json({id:video,position_seconds:3})})`,e=>e.code==='22023');
  context=await browser.newContext();await context.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);
  await context.route('**/help-videos/fixture.webm',route=>route.fulfill({status:200,contentType:'video/webm',body:Buffer.from(videoBase64,'base64')}));
  await context.route('**/help-videos/*.vtt',route=>route.fulfill({status:200,contentType:'text/vtt',body:'WEBVTT\n\n00:00.000 --> 00:02.000\nFictional caption\n'}));
  const page=await context.newPage();await page.goto(origin+'/settings/help/videos');await page.getByRole('button',{name:'Fictional Inbox tutorial',exact:true}).click();
  await page.locator('video').evaluate(el=>el.play());await page.getByText('Watch progress saved.',{exact:true}).waitFor();
  assert.equal((await read()).items.find(x=>x.id===video).watched,true,'Native video completion was not persisted');
  await page.reload();await page.getByRole('button',{name:'Fictional Inbox tutorial',exact:true}).waitFor();assert.match(await page.getByRole('listitem').filter({hasText:'Fictional Inbox tutorial'}).innerText(),/Watched/);
  assert.equal((await read(viewer)).items.find(x=>x.id===video).watched,false,'Another account inherited watch state');
  const endpoint=origin+`/api/go/workspaces/${store}/workspace-tools/help-videos?environment=live`;
  viewerContext=await browser.newContext();await viewerContext.addCookies([{name:'ekmivo-session',value:sessions.viewer,url:origin},{name:'ekmivo-default-workspace',value:viewer+':'+store,url:origin,httpOnly:true}]);
  const update=await viewerContext.request.post(endpoint,{data:{id:video,user_id:owner,position_seconds:1}});assert.equal(update.status(),200);assert.equal((await read(viewer)).items.find(x=>x.id===video).position_seconds,1);assert.equal((await read()).items.find(x=>x.id===video).watched,true);
  await page.getByRole('button',{name:'Fictional Inbox tutorial',exact:true}).click();await page.getByRole('button',{name:'Mark unwatched',exact:true}).click();await page.getByText('Watch progress saved.',{exact:true}).waitFor();assert.equal((await read()).items.find(x=>x.id===video).watched,false);
  await context.addCookies([{name:'ekmivo-locale',value:'bn',url:origin}]);await page.setViewportSize({width:320,height:800});await page.goto(origin+'/settings/help/videos');await page.getByRole('button',{name:'কাল্পনিক ইনবক্স নির্দেশিকা',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log('HELP VIDEO SQL/Go/Next/native browser playback PASS: published module index, EN/BN captions, private progress, completion/reload/reset, actor/Store denial and 320px');
 }finally{await context?.close();await viewerContext?.close();await db.end({timeout:3});}
}
