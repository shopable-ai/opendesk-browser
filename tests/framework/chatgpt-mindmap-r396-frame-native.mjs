// Passive recorder for the real extension. All product actions are performed
// through native CUA input; this script does not install, inject or synthesize.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const args={};for(let n=2;n<process.argv.length;n+=2)args[process.argv[n].slice(2)]=process.argv[n+1];
for(const key of ['launch','extension','source-root','playwright','out','label'])assert(args[key],key);
assert.match(args.label,/^[a-z0-9-]+$/);
const out=resolve(args.out),extension=await realpath(args.extension);
await mkdir(out,{recursive:true});
const launch=JSON.parse(await readFile(args.launch,'utf8'));
const command=execFileSync('ps',['-p',String(launch.pid),'-o','command='],{encoding:'utf8'}).trim();
for(const flag of ['--use-mock-keychain','--user-data-dir='+launch.profile,'--load-extension='+extension])assert(command.includes(flag),flag);
const {verifyPackage}=await import(pathToFileURL(resolve(args['source-root'],'scripts/verify-package.mjs')).href);
const pkg=await verifyPackage(extension,{mode:'production'});
const port=(await readFile(join(launch.profile,'DevToolsActivePort'),'utf8')).split('\n')[0];
const {chromium}=createRequire(import.meta.url)(resolve(args.playwright));
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
try{
  const context=browser.contexts()[0],manager=context.pages().find(p=>p.url().startsWith('chrome://extensions'));
  assert(manager,'Open actual Chrome extension manager first');
  const items=await manager.locator('extensions-item').evaluateAll(nodes=>nodes.map(n=>({id:n.data?.id,name:n.data?.name,path:n.data?.path,state:n.data?.state})));
  const item=items.find(n=>n.name==='OpenDesk Browser');assert(item,'Real OpenDesk not loaded');
  assert.equal(await realpath(item.path),extension);
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+item.id+'/'));assert(worker,'Real SW missing');
  const framesLog=[];
if(args['observe-ms']){
  const until=Date.now()+Number(args['observe-ms']);
  while(Date.now()<until){
    const rows=await worker.evaluate(async()=>Promise.all((await chrome.tabs.query({})).filter(t=>t.url?.startsWith('http://127.0.0.1:43111/')).map(async t=>({tabId:t.id,frames:await chrome.webNavigation.getAllFrames({tabId:t.id})}))));
    if(JSON.stringify(rows)!==JSON.stringify(framesLog.at(-1)?.rows))framesLog.push({at:Date.now(),rows});
    await new Promise(resolve=>setTimeout(resolve,40));
  }
}
const storage=await worker.evaluate(async()=>{
    const session=await chrome.storage.session.get(null),dbs=[];
    for(const meta of await indexedDB.databases()){
      const db=await new Promise((ok,no)=>{const r=indexedDB.open(meta.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
      const stores={};
      for(const name of ['frameworkKV','runs']){
        if(!db.objectStoreNames.contains(name))continue;
        stores[name]=await new Promise((ok,no)=>{const r=db.transaction(name,'readonly').objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
      }
      db.close();dbs.push({name:meta.name,stores});
    }
    const frames=await Promise.all((await chrome.tabs.query({})).filter(t=>t.url?.startsWith('http://127.0.0.1:43111/')).map(async t=>({tabId:t.id,frames:await chrome.webNavigation.getAllFrames({tabId:t.id})})));
  return {session,dbs,frames};
  });
  const pages=[];
  for(const page of context.pages().filter(p=>p.url().startsWith('http://127.0.0.1:43111/')||p.url().startsWith('chrome-extension://'+item.id+'/'))){
    const index=pages.length;
    const ax=await page.locator('body').ariaSnapshot().catch(String);
    await writeFile(join(out,args.label+'-page-'+index+'.ax.txt'),ax);
    await page.screenshot({path:join(out,args.label+'-page-'+index+'.png')});
    pages.push({url:page.url(),frames:page.frames().map(f=>({url:f.url()})),ax});
  }
  const report={format:'opendesk.page-frame.native-observation.v1',label:args.label,
    scope:'GENERIC_NON_VENDOR_LOADER_ONLY',realChatGPTMindMap:'NOT_TESTED',
    launch:{pid:launch.pid,profile:launch.profile,command},browser:browser.version(),
    extension:item,serviceWorker:worker.url(),packageHash:pkg.packageHash,framesLog,storage,pages};
  await writeFile(join(out,args.label+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({label:args.label,packageHash:pkg.packageHash,extensionId:item.id,pages:pages.map(p=>p.url)}));
}finally{await browser.close();}
