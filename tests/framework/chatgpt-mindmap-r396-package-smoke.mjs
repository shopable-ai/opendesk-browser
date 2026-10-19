// Read-only smoke of the real OpenDesk package in an externally launched CFT.
// Start via chrome-testing-keychain/launch.py, opt in using Chrome's actual UI,
// then run this observer. It never registers a script or approves a Program.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';

const args={};
for(let i=2;i<process.argv.length;i+=2){
  assert.match(process.argv[i]||'',/^--[a-z-]+$/);
  args[process.argv[i].slice(2)]=process.argv[i+1];
}
for(const key of ['launch','extension','playwright','out'])assert(args[key],'Missing --'+key);
const out=resolve(args.out),extension=await realpath(args.extension);
const sourceRoot=await realpath(args['source-root']||fileURLToPath(new URL('../../',import.meta.url)));
const {verifyPackage}=await import(pathToFileURL(join(sourceRoot,'scripts/verify-package.mjs')).href);
await mkdir(out,{recursive:true});
const report={format:'opendesk.mindmap.r396.package-smoke.v1',
  scope:'REAL_OPENDESK_PACKAGE_ONLY_NOT_MIND_MAP_INSTALLATION',
  extensionPath:extension,verifierSourceRoot:sourceRoot,result:'NOT_TESTED',programInstallation:'NOT_TESTED',
  realChatGPTMindMap:'REAL_CHATGPT_NOT_TESTED',error:null};
let browser;
try{
  const launch=JSON.parse(await readFile(args.launch,'utf8'));
  const processLine=execFileSync('ps',['-p',String(launch.pid),'-o','command='],{encoding:'utf8'}).trim();
  for(const flag of ['--use-mock-keychain','--user-data-dir='+launch.profile,
    '--load-extension='+extension,'--remote-debugging-address=127.0.0.1'])assert(processLine.includes(flag),flag);
  assert(processLine.startsWith(launch.executable),'Unexpected browser executable');
  assert(launch.executable.endsWith('/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
  report.launch={pid:launch.pid,profile:launch.profile,executable:launch.executable,command:processLine};
  const verified=await verifyPackage(extension,{mode:'production'});
  report.packageHash=verified.packageHash;
  assert(!verified.files.some(row=>/snowbrush|xmind-sdk|__r38_probe/.test(row.path)),
    'Unapproved vendor/probe is present in production');
  const port=(await readFile(join(launch.profile,'DevToolsActivePort'),'utf8')).split('\n')[0];
  assert.match(port,/^[0-9]+$/);
  const {chromium}=createRequire(import.meta.url)(resolve(args.playwright));
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
  report.browser=browser.version();
  const context=browser.contexts()[0];
  const manager=context.pages().find(page=>page.url().startsWith('chrome://extensions'));
  assert(manager,'Open the actual Chrome extensions page before observing');
  const items=await manager.locator('extensions-item').evaluateAll(nodes=>nodes.map(node=>({
    id:node.data?.id,name:node.data?.name,path:node.data?.path,state:node.data?.state})));
  const item=items.find(row=>row.name==='OpenDesk Browser');
  assert(item&&/^[a-p]{32}$/.test(item.id)&&item.state==='ENABLED','Actual extension not enabled');
  assert.equal(await realpath(item.path),extension);
  report.extension=item;
  const worker=context.serviceWorkers().find(row=>row.url().startsWith('chrome-extension://'+item.id+'/'));
  assert(worker,'Real extension Service Worker missing');report.serviceWorker=worker.url();
  const ui=context.pages().find(page=>page.url().startsWith('chrome-extension://'+item.id+'/sidepanel.html'));
  assert(ui,'Open the actual product UI before observing');
  report.runtime=await ui.evaluate(async()=>({id:chrome.runtime.id,version:chrome.runtime.getManifest().version,
    permissions:await chrome.permissions.getAll(),userScriptsAvailable:typeof chrome.userScripts==='object',
    registeredScripts:typeof chrome.userScripts==='object'?await chrome.userScripts.getScripts():null}));
  assert.equal(report.runtime.id,item.id);
  assert(report.runtime.userScriptsAvailable,'Enable user scripts through the native Chrome UI');
  assert(!report.runtime.registeredScripts.some(row=>JSON.stringify(row).includes('chatgpt-mindmap')),
    'Unexpected Mind Map registration in a package-only smoke');
  await manager.screenshot({path:join(out,'extension-manager.png')});
  await writeFile(join(out,'catalog.ax.txt'),await ui.locator('body').ariaSnapshot());
  assert.equal((await verifyPackage(extension,{mode:'production'})).packageHash,verified.packageHash,
    'Package drifted during native observation');
  report.result='PASS_REAL_OPENDESK_PACKAGE_SMOKE';
}catch(error){report.result='FAILED';report.error=String(error);process.exitCode=1;}
finally{
  // Disconnect only. The skill launcher owns process/profile cleanup.
  if(browser)await browser.close();
  await writeFile(join(out,'package-smoke.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({result:report.result,packageHash:report.packageHash,error:report.error}));
