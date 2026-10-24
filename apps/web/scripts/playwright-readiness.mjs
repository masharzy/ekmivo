import {chromium} from '@playwright/test';
import {spawnSync} from 'node:child_process';
async function launch(){const browser=await chromium.launch({headless:true,timeout:15000});try{const page=await browser.newPage();await page.setContent('<title>Isolated browser readiness</title><p>Ready</p>');if(await page.title()!=='Isolated browser readiness')throw Error('Browser readiness page failed');}finally{await browser.close();}}
try{
 await launch();console.log('Pinned Chromium launch verified; no OS dependency installation required.');
}catch(error){
 const message=error instanceof Error?error.message:String(error);
 if(!/error while loading shared libraries|host system is missing dependencies/i.test(message))throw error;
 // Fresh hosted images may need libraries; a cached, launchable browser does
 // not need every optional font package reinstalled through an apt mirror.
 console.log('Chromium reported missing host libraries; installing pinned Playwright dependencies.');
 const result=spawnSync('npx',['--no-install','playwright','install-deps','chromium'],{stdio:'inherit',timeout:180000});
 if(result.error||result.status!==0)throw Error('Browser dependencies unavailable: '+(result.error?.message??result.status));
 await launch();console.log('Pinned Chromium launch verified after dependency installation.');
}
