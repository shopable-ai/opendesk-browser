// Loads the unchanged production package. This is Browser package smoke only;
// it never installs/approves the blocked Mind Map Program or copies vendor code.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {verifyPackage} from '../../scripts/verify-package.mjs';

const args={};
for(let i=2;i<process.argv.length;i+=2){
  assert.match(process.argv[i]||'',/^--[a-z-]+$/);
  args[process.argv[i].slice(2)]=process.argv[i+1];
}
for(const key of ['browser','extension','out'])assert(args[key],'Missing --'+key);
const {chromium}=await import(args.playwright
  ?pathToFileURL(resolve(args.playwright)).href:'playwright-core');
const extension=resolve(args.extension),out=resolve(args.out);
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'odmm-r394-package-'));
const report={format:'opendesk.mindmap.r394.package-smoke.v1',
  scope:'UNCHANGED_PRODUCTION_BROWSER_PACKAGE_NOT_PROGRAM_INSTALLATION',
  platform:process.platform,architecture:process.arch,
  executable:resolve(args.browser),extensionPath:extension,
  brokerInstall:'BLOCKED_LICENSE_AND_APPROVED_FRAME_LOADER',
  realChatGPT:'REAL_CHATGPT_NOT_TESTED_NO_AUTHENTICATED_TEST_SESSION',
  result:'NOT_TESTED',error:null};
let context;
try{
  const before=await verifyPackage(extension,{mode:'production'});
  report.packageHash=before.packageHash;
  assert(!before.files.some(row=>/snowbrush|xmind-sdk|__r38_probe/.test(row.path)),
    'Unapproved vendor files must not be in the Browser package');
  context=await chromium.launchPersistentContext(profile,{
    executablePath:resolve(args.browser),headless:false,
    args:['--disable-extensions-except='+extension,'--load-extension='+extension]
  });
  report.browser=context.browser()?.version();
  const processes=execFileSync('ps',['-axo','pid=,command='],{encoding:'utf8'})
    .split('\n').filter(line=>line.includes('--user-data-dir='+profile)&&!line.includes(' --type='));
  assert.equal(processes.length,1,'Dedicated browser main process must be identifiable');
  assert(processes[0].includes('--use-mock-keychain'),'Testing browser must use mock keychain');
  report.process=processes[0].trim();
  const manager=await context.newPage();
  await manager.goto('chrome://extensions/',{waitUntil:'domcontentloaded'});
  await manager.locator('extensions-item').first().waitFor({timeout:15000});
  const items=await manager.locator('extensions-item').evaluateAll(nodes=>nodes.map(node=>({
    id:node.data?.id||node.id,name:node.data?.name,
    enabled:node.data?.state==='ENABLED',path:node.data?.path
  })));
  const item=items.find(row=>row.name==='OpenDesk Browser');
  assert(item&&/^[a-p]{32}$/.test(item.id),'Unmodified package not loaded');
  assert(item.enabled,'Browser extension is disabled');
  if(item.path)assert.equal(resolve(item.path),extension);
  report.extension=item;
  await manager.screenshot({path:join(out,'browser-package.png')});
  let ui=await context.newPage();
  const url='chrome-extension://'+item.id+'/sidepanel.html';
  await ui.goto(url,{waitUntil:'domcontentloaded'});
  const worker=()=>context.serviceWorkers().find(row=>row.url().startsWith('chrome-extension://'+item.id+'/'));
  if(!worker())await context.waitForEvent('serviceworker',{timeout:15000});
  assert(worker(),'Actual production Service Worker did not start');
  report.serviceWorker=worker().url();
  const access=()=>ui.evaluate(async()=>{
    try{await chrome.userScripts.getScripts();return true;}catch{return false;}
  });
  report.initialUserScriptsAccess=await access();
  if(!report.initialUserScriptsAccess){
    await manager.goto('chrome://extensions/?id='+item.id,{waitUntil:'domcontentloaded'});
    const row=manager.locator('extensions-detail-view #allow-user-scripts');
    await row.waitFor({timeout:15000});
    if(!await row.evaluate(element=>Boolean(element.checked)))await row.locator('cr-toggle').click();
    assert(await row.evaluate(element=>Boolean(element.checked)),'Chrome user-script toggle denied');
    if(ui.isClosed())ui=await context.newPage();
    await ui.goto(url,{waitUntil:'domcontentloaded'});
  }
  assert(await access(),'Native userScripts API is unavailable after opt-in');
  report.userScripts='PASS_REAL_CHROME_OPT_IN_AND_API';
  report.runtime=await ui.evaluate(()=>({id:chrome.runtime.id,version:chrome.runtime.getManifest().version}));
  assert.equal(report.runtime.id,item.id);
  assert.equal((await verifyPackage(extension,{mode:'production'})).packageHash,report.packageHash,
    'Package changed during native smoke');
  report.result='PASS_UNMODIFIED_PRODUCTION_PACKAGE_SMOKE';
}catch(error){report.result='FAILED';report.error=String(error);process.exitCode=1;}
finally{
  if(context)await context.close();
  await rm(profile,{recursive:true,force:true});
  report.profileCleanup='REMOVED_OWN_TEMPORARY_PROFILE';
  await writeFile(join(out,'package-smoke.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({result:report.result,error:report.error,broker:report.brokerInstall}));
