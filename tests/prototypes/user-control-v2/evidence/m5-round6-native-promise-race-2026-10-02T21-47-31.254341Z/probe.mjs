import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repo='/Users/shopme/Documents/workspace/opendesk-browser', fixture=join(repo,'tests/prototypes/user-control-v2/fixture');
const hits=[];
const server=createServer((req,res)=>{hits.push({url:req.url,at:Date.now()});res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Independent native stop fence</title><input id="name" value="Base">');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const report={scope:'K1 author regression adapted from Fermat native pending-promise counter; finite Worker; no termination timing claim',candidateSha256:'fb58eaa691f9e96f6440cb1e5c517c01937192603c500b37a80b093823e81c1a',instrumentation:'In-memory thin delegates invoke real chrome.permissions.contains and real chrome.tabs.update. Delegate schedules ordinary harness.stop() in a microtask after real permission request, before native promise resolution. Native results unchanged. This models an allowed stop arrival during authorization; no mocked permission or tabs response.',runs:[]};
try {
for(const version of ['138.0.7204.183','154.0.8037.92']) {
 const profile=await mkdtemp(join("/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/evidence/m5-round6-native-promise-race-2026-10-02T21-47-31.254341Z",'profile-'+version+'-')), r={version,profile};report.runs.push(r);let context;
 try {
 const executablePath=join(repo,'tests/.cache/m5-browsers',version,'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
 r.executableSha256=createHash('sha256').update(await readFile(executablePath)).digest('hex');
 context=await chromium.launchPersistentContext(profile,{executablePath,headless:true,args:['--use-mock-keychain',`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
 r.actualVersion=context.browser().version();
 if(!context.serviceWorkers().some(x=>x.url().endsWith('/sw.js')))await context.waitForEvent('serviceworker',{predicate:x=>x.url().endsWith('/sw.js'),timeout:15000}); const expected=JSON.parse(await readFile(join(fixture,'manifest.json'),'utf8')); const matching=[]; for(const worker of context.serviceWorkers().filter(x=>x.url().endsWith('/sw.js'))){const identity=await worker.evaluate(()=>({id:chrome.runtime.id,manifest:chrome.runtime.getManifest()}));if(identity.id===new URL(worker.url()).host&&identity.manifest.name===expected.name&&identity.manifest.version===expected.version&&identity.manifest.background.service_worker==='sw.js')matching.push(worker);} if(matching.length!==1)throw new Error('Exact fixture service worker is ambiguous'); const sw=matching[0];
 r.extensionId=new URL(sw.url()).host;
 const host=await context.newPage();await host.goto(`chrome-extension://${r.extensionId}/host.html?network=${encodeURIComponent(origin+'/probe')}`);
 await host.waitForFunction(()=>!!window.harness);
 r.initial=await host.evaluate(()=>harness.initialize());
 const destination=origin+'/after-stop?version='+version;
 r.probe=await host.evaluate(async ({destination,tabId})=>{
 const observations=[],contains=chrome.permissions.contains.bind(chrome.permissions),update=chrome.tabs.update.bind(chrome.tabs);let once=true;
 const stamp=kind=>({kind,wallMs:Date.now(),monoMs:performance.now(),active:harness.evidence().active});
 chrome.permissions.contains=function(...args){const p=contains(...args);observations.push(stamp('native-permission-request'));if(once){once=false;queueMicrotask(()=>{harness.stop();observations.push(stamp('host-stop-returned'));});}p.then(v=>observations.push({...stamp('native-permission-resolved'),value:v}));return p;};
 chrome.tabs.update=function(...args){observations.push({...stamp('native-tabs-update-dispatch'),args});return update(...args);};
 const terminal=await harness.run('await page.goto(params.url); return "unexpected";', {url:destination},5000);
 for(let i=0;i<100;i++){if((await harness.resources()).pending===0)break;await new Promise(r=>setTimeout(r,20));}
 chrome.permissions.contains=contains;chrome.tabs.update=update;
 const actualTab=await chrome.tabs.get(tabId);
 const evidence=harness.evidence(),resources=await harness.resources();
 const subsequent=await harness.run('return await page.title();');
 return {destination,observations,terminal,actualTab,evidence,resources,subsequent};
 },{destination,tabId:r.initial.tabId});
 r.nativeServerHits=hits.filter(x=>x.url.includes('version='+version));
 r.cleanup=await host.evaluate(()=>harness.dispose());
 }catch(e){r.error={name:e.name,message:e.message,stack:e.stack};}
 finally{if(context)await context.close();await rm(profile,{recursive:true,force:true});r.browserClosed=true;r.profileRemoved=true;}
}
}finally{await new Promise(r=>server.close(r));report.serverClosed=!server.listening;report.fixtureHostSha256=createHash('sha256').update(await readFile(join(fixture,'host.js'))).digest('hex');}
process.stdout.write(JSON.stringify(report)+'\n');
