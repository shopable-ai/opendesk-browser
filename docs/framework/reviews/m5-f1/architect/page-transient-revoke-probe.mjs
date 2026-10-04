// Independent, bounded counterexample against the frozen page fixture; no fixture writes.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, readdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {chromium} = require('/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repo='/Users/shopme/Documents/workspace/opendesk-browser';
const fixture=resolve(repo,'tests/prototypes/user-scripts-v2/fixture');
const home=dirname(fileURLToPath(import.meta.url));
const out=resolve(home,'independent-evidence',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const sources=[];
for(const name of ['run-headed.mjs',...(await readdir(fixture)).sort().map(x=>'fixture/'+x)]){
 const path=resolve(repo,'tests/prototypes/user-scripts-v2',name);sources.push({path,sha256:sha(await readFile(path))});
}
const report={scope:'independent targeted counterexample only; not full F1',prototypeCandidateSha256:'2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036',sources,probeSha256:sha(await readFile(fileURLToPath(import.meta.url))),runs:[]};
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Independent frozen F1 probe</title><body>owned probe</body>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/owned';
for(const version of ['138.0.7204.183','154.0.8037.92']){
 const executable=resolve(repo,'tests/.cache/m5-browsers',version,'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
 const run={version,executable,binarySha256:sha(await readFile(executable)),cases:[],cleanup:{}};report.runs.push(run);
 let context;
 try{
  context=await chromium.launchPersistentContext(resolve(out,'profile-'+version),{executablePath:executable,headless:false,args:['--disable-extensions-except='+fixture,'--load-extension='+fixture,'--lang=en-US']});
  run.actualVersion=context.browser().version();
  let sw=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://')&&w.url().endsWith('/sw.js'));
  if(!sw)sw=await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://')&&w.url().endsWith('/sw.js')});
  const id=new URL(sw.url()).host;run.extensionId=id;
  const host=await context.newPage();await host.goto('chrome-extension://'+id+'/host.html');await host.waitForFunction(()=>!!window.fixture);
  const settings=await context.newPage();await settings.goto('chrome://extensions/?id='+id);
  const call=(method,arg)=>host.evaluate(({method,arg})=>window.fixture[method](arg),{method,arg});
  const state=()=>host.evaluate(async()=>({timeOrigin:performance.timeOrigin,tab:await chrome.tabs.getCurrent(),events:window.fixture.permissionEvents(),resources:window.fixture.resources()}));
  const toggle=async(kind,enabled,name)=>{
   const locator=settings.locator(kind==='switch'?'extensions-detail-view #allow-user-scripts cr-toggle':'extensions-detail-view extensions-host-permissions-toggle-list #allHostsToggle cr-toggle');
   await locator.waitFor({state:'visible'});
   const read=async()=>await locator.getAttribute('aria-checked')??await locator.getAttribute('aria-pressed');
   if((await read()==='true')!==enabled)await locator.click();
   for(let i=0;i<100&&await read()!==String(enabled);i++)await new Promise(r=>setTimeout(r,20));
   const actual={ui:await read(),availability:await call('availability'),permission:await call('containsHosts'),host:await state()};
   await settings.screenshot({path:resolve(out,version+'-'+name+'.png')});
   if(actual.ui!==String(enabled)||(kind==='switch'?actual.availability.available:actual.permission)!==enabled)throw Error('Browser state did not confirm toggle');
   return actual;
  };
  await toggle('switch',true,'initial-on');await host.reload();await host.waitForFunction(()=>!!window.fixture);
  const page=await context.newPage();await page.goto(url);
  const tab=(await call('tabs')).find(t=>t.url===url);const frame=(await call('frames',tab.id)).find(f=>f.frameId===0);
  const target={tabId:tab.id,frameId:frame.frameId,documentId:frame.documentId,url:frame.url};run.target=target;
  for(const kind of ['switch','site'])for(const world of ['USER_SCRIPT','MAIN']){
   const token=kind+'-'+world;
   await host.evaluate(({token,target,world})=>window.fixture.start(token,{target,world,source:'() => true',acceptanceBarrier:token}),{token,target,world});
   await host.waitForFunction(t=>!!window.fixture.poll(t)?.nativeCompletedAt,token);
   const before=await call('poll',token);const beforeHost=await state();
   const off=await toggle(kind,false,token+'-off');
   // Deliberately no fixture.recheck(): browser/UI state probes must not manufacture operation fencing.
   const on=await toggle(kind,true,token+'-on');
   await call('releaseAcceptance',token);await host.waitForFunction(t=>window.fixture.poll(t)?.state==='settled',token);
   const settled=await call('poll',token);
   const result={kind,world,before,beforeHost,off,on,settled,contractExpected:'old result rejected after actual revoke even after restore',contractMet:settled.result.accepted.kind==='rejected',injectedOperationRecheck:false};run.cases.push(result);
   console.log(JSON.stringify({version,kind,world,accepted:settled.result.accepted.kind,fence:settled.fence,contractMet:result.contractMet}));
  }
  run.finalHost=await state();run.trace=await call('trace');
 }catch(e){run.error={name:e.name,message:e.message,stack:e.stack};}
 finally{if(context)await context.close();run.cleanup.contextClosed=true;}
}
await new Promise(r=>server.close(r));report.cleanup={serverClosed:!server.listening};
for(const s of sources)s.unchanged=s.sha256===sha(await readFile(s.path));
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:out,fixtureUnchanged:sources.every(s=>s.unchanged)}));
