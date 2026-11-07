// No purchase or production API calls. Uses the synthetic session from the UI test.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const f=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'briofold-plans-ui-fixture.json'),'utf8'));
const base='http://localhost:3046',plan='ui-'+f.suffix;
let r=await fetch(`${base}/subscribe/${plan}`,{redirect:'manual',headers:{Cookie:'briofold-locale=en'}});
assert.equal(r.status,307);assert(new URL(r.headers.get('location'),base).pathname.endsWith('/register'));assert(r.headers.get('set-cookie').includes(`briofold-selected-plan=${plan}`));
r=await fetch(`${base}/subscribe/${plan}`,{redirect:'manual',headers:{Cookie:`briofold-locale=en; briofold-session=${f.token}`}});
assert.equal(r.status,307);assert(new URL(r.headers.get('location'),base).pathname.endsWith('/workspaces'));assert(r.headers.get('set-cookie').includes(`briofold-selected-plan=${plan}`));
r=await fetch(`${base}/subscribe/${plan}?workspace=00000000-0000-0000-0000-000000000000`,{redirect:'manual',headers:{Cookie:`briofold-locale=en; briofold-session=${f.token}`}});
assert(new URL(r.headers.get('location'),base).pathname.endsWith('/workspaces'));
r=await fetch(`${base}/subscribe/unpublished-test-missing`,{redirect:'manual',headers:{Cookie:`briofold-locale=en; briofold-selected-plan=unpublished-test-missing`}});
assert(new URL(r.headers.get('location'),base).pathname.endsWith('/pricing'));assert(r.headers.get('set-cookie').includes('briofold-selected-plan='));
console.log('PASS: unauthenticated plan selection survives registration, no-workspace choice persists, unknown workspace is denied, unavailable plan clears stale selection');
