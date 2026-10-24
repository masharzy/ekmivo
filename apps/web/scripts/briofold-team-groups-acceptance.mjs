import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,scryptSync} from 'node:crypto';
import postgres from 'postgres';
export async function runTeamGroups({origin,browser,control,sessions}){
 const target=new URL(control);if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||/prod/i.test(target.pathname))throw Error('Team group acceptance refuses shared DB');
 const db=postgres(control,{max:3,prepare:false});let context;let owner;let oldHash;
 try{
  const identities=await Promise.all([sessions.owner,sessions.viewer].map(token=>db`SELECT u.id,u.display_name,u.password_hash FROM app_users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=${createHash('sha256').update(token).digest('hex')}`));
  owner=identities[0][0].id;oldHash=identities[0][0].password_hash;const viewer=identities[1][0].id,name=identities[1][0].display_name;
  const password='Fictional-group-'+randomUUID(),salt=randomBytes(24),hash=`scrypt-v1:${salt.toString('hex')}:${scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex')}`;
  await db`UPDATE app_users SET password_hash=${hash} WHERE id=${owner}`;
  const store=randomUUID();await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${store},'Fictional team policy store','both',${owner})`;
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${store},${owner},'owner'),(${store},${viewer},'viewer')`;
  const id=randomUUID(),body={id,name:'Fictional group restrictions',denied_capabilities:['inbox:read'],members:[viewer]};
  const write=(action,input=body,actor=owner)=>db`SELECT briofold_team_groups_write(${store},${actor},${action},${db.json(input)}) result`;
  await write('create');await write('create');
  assert.equal(Number((await db`SELECT count(*) n FROM pg13_control_audit WHERE workspace_id=${store} AND action='team-group-create'`)[0].n),1,'Lost-response group retry duplicated audit');
  await db`INSERT INTO pg13_member_grants(workspace_id,user_id,capability,allowed) VALUES(${store},${viewer},'inbox:read',true)`;
  const override=async(cap,actor=viewer)=>(await db`SELECT pg13_capability_override(${store},${actor},${cap}) allowed`)[0].allowed;
  assert.equal(await override('inbox:read'),false);assert.equal(await override('inbox:read',owner),null);assert.equal(await override('payments:read'),null);
  await assert.rejects(()=>write('update',{...body,revision:0}),e=>e.code==='40001');
  await assert.rejects(()=>write('create',{...body,id:randomUUID()},viewer),e=>e.code==='42501');
  await assert.rejects(()=>write('update',{...body,revision:1,members:[randomUUID()]}),e=>e.code==='42501');
  await assert.rejects(()=>write('update',{...body,revision:1,denied_capabilities:['unknown']}),e=>e.code==='22023');
  await write('update',{...body,revision:1,denied_capabilities:['product:ai']});assert.equal(await override('inbox:send'),false);assert.equal(await override('inbox:manage'),false);
  const hidden=(await db`SELECT briofold_team_groups_read(${store},${viewer}) data`)[0].data;assert.equal(hidden.can_manage,false);assert.deepEqual(hidden.groups,[]);
  await write('archive',{id,revision:2});assert.equal(await override('inbox:read'),true,'Archived group retained denial over direct member grant');
  context=await browser.newContext();await context.addCookies([{name:'ekmivo-session',value:sessions.owner,url:origin},{name:'ekmivo-default-workspace',value:owner+':'+store,url:origin,httpOnly:true},{name:'ekmivo-locale',value:'en',url:origin}]);
  const endpoint=origin+`/api/go/workspaces/${store}/workspace-tools/groups?environment=live`;
  let response=await context.request.post(endpoint,{headers:{Origin:origin},data:{action:'create',body:{...body,id:randomUUID()},current_password:'Wrong fictional password'}});assert.equal(response.status(),401,'Group write bypassed password confirmation');
  const page=await context.newPage();await page.goto(origin+'/settings/team/groups');await page.getByRole('heading',{name:'Team permission groups',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Group name',exact:true}).fill('Browser Inbox restriction');await page.getByRole('checkbox',{name:'Read Inbox',exact:true}).check();await page.getByRole('checkbox',{name:name+' · viewer',exact:true}).check();
  await page.getByLabel('Current owner password required for every change',{exact:true}).fill(password);await page.getByRole('button',{name:'Create group',exact:true}).click();await page.getByText('Group change saved and audited.',{exact:true}).waitFor();
  await page.reload();await page.getByText('Browser Inbox restriction',{exact:true}).waitFor();assert.equal(await override('inbox:read'),false,'Browser group did not reach SQL resolver');
  const denied=(await db`SELECT id,revision FROM briofold_team_groups WHERE workspace_id=${store} AND name='Browser Inbox restriction'`)[0];
  response=await context.request.post(endpoint,{headers:{Origin:origin},data:{action:'update',body:{...body,id:denied.id,revision:0},current_password:password}});assert.equal(response.status(),409,'Stale group update bypassed revision');
  for(const locale of ['en','bn']){await context.addCookies([{name:'ekmivo-locale',value:locale,url:origin}]);for(const theme of ['light','dark']){await context.addCookies([{name:'ekmivo-theme',value:theme,url:origin}]);for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});await page.goto(origin+'/settings/team/groups');await page.getByRole('heading',{level:1}).last().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Group overflow ${locale}/${theme}/${width}`);}}}
  console.log('TEAM GROUPS SQL/Go/Next/browser PASS: deny-only matrix, product restrictions, direct deny priority, owner protection, password, revision, replay, Store privacy and 12 responsive cases');
 }finally{if(owner&&oldHash)await db`UPDATE app_users SET password_hash=${oldHash} WHERE id=${owner}`;await context?.close();await db.end({timeout:3});}
}
