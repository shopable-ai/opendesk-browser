// Bounded real-UI diagnostic. Observers never write an operation fence.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
const require = createRequire(import.meta.url);
const playwrightPath = '/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const {chromium} = require(playwrightPath);
const root = dirname(fileURLToPath(import.meta.url)), repo = resolve(root, '../../..'), fixture = resolve(root, 'fixture');
const output = resolve(root, 'evidence', `m5-switch-history-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`);
await mkdir(output, {recursive: true});
const sha = b => createHash('sha256').update(b).digest('hex');
const json = (p,v) => writeFile(p, JSON.stringify(v,null,2)+'\n');
const sources = [];
for (const name of ['run-headed.mjs','probe-switch-history.mjs',...(await readdir(fixture)).sort().map(n=>'fixture/'+n)]) {
  const bytes = await readFile(resolve(root,name)); sources.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
  await mkdir(dirname(resolve(output,'source',name)),{recursive:true}); await writeFile(resolve(output,'source',name),bytes);
}
const candidate = {scope:'Bounded K1 switch history probe; unchanged fixture mechanism',sources,
  priorCandidateSha256:'2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036',
  pageContractPlanManifestSha256:'dd50a5098d247f594ab2234b9946c0004ce427ea8d6cb1abd130931c3bcecda1'};
await json(resolve(output,'candidate-manifest.json'),candidate);
const report = {candidateSha256:sha(await readFile(resolve(output,'candidate-manifest.json'))),output,scope:candidate.scope,
  observerRecheck:false,fullMatrix:false,gateDisposition:'BLOCK pending reliable history signal or approved compatibility restriction',runs:[]};
const holds = new Map();
const server = createServer((req,res) => {
  const u = new URL(req.url,'http://127.0.0.1');
  if (u.pathname==='/hold') { const token=u.searchParams.get('token'); holds.set(token,res); res.on('close',()=>{if(holds.get(token)===res)holds.delete(token);}); return; }
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>K1 owned history probe</title><body>Owned isolated probe</body>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try {
for (const version of ['138.0.7204.183','154.0.8037.92']) {
  const executable=resolve(repo,'tests/.cache/m5-browsers',version,'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const run={version,executable,binarySha256:sha(await readFile(executable)),profile:resolve(root,'profiles',`history-${version}-${randomUUID()}`),
    os:{platform:os.platform(),release:os.release(),arch:os.arch()},playwrightVersion:require(playwrightPath+'/package.json').version,cases:[],console:[]};report.runs.push(run);
  let context,host;
  try {
    context=await chromium.launchPersistentContext(run.profile,{executablePath:executable,headless:false,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`,'--lang=en-US']});
    context.on('page',p=>p.on('console',m=>run.console.push({url:p.url(),type:m.type(),text:m.text(),at:Date.now()})));
    run.actualVersion=context.browser().version();
    let sw=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://')&&w.url().endsWith('/sw.js'));
    if(!sw)sw=await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://')&&w.url().endsWith('/sw.js'),timeout:20000});
    run.extensionId=new URL(sw.url()).host;
    host=await context.newPage();await host.goto(`chrome-extension://${run.extensionId}/host.html`);await host.waitForFunction(()=>!!window.fixture);
    const settings=await context.newPage();await settings.goto(`chrome://extensions/?id=${run.extensionId}`);
    const toggle=settings.locator('extensions-detail-view #allow-user-scripts cr-toggle');await toggle.waitFor({state:'visible'});
    const ui=async()=>await toggle.getAttribute('aria-checked')??await toggle.getAttribute('aria-pressed');
    const switchTo=async enabled=>{const before=await ui(),t0=Date.now();if(before!==String(enabled))await toggle.click();if(await ui()!==String(enabled))throw Error('Actual UI mismatch');return{before,after:await ui(),t0,confirmedAt:Date.now()};};
    await switchTo(true);await host.reload();await host.waitForFunction(()=>!!window.fixture);
    run.fixtureIdentity=await host.evaluate(()=>({id:chrome.runtime.id,manifest:chrome.runtime.getManifest()}));
    const page=await context.newPage();await page.goto(base+'/owned');
    const target=await host.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);const f=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});return{tabId:tab.id,frameId:0,documentId:f.documentId,url:f.url};},page.url());run.target=target;
    await host.evaluate(()=>{
      const events=[],ports=[];const cached=chrome.userScripts;
      globalThis.__historyProbe={events,ports,cached,method:cached.getScripts};
      const event=(kind,value)=>events.push({kind,value,at:Date.now()});
      for(const name of ['onInstalled','onStartup','onSuspend','onSuspendCanceled'])chrome.runtime[name]?.addListener(value=>event('runtime.'+name,value));
      for(const name of ['onAdded','onRemoved'])chrome.permissions[name].addListener(value=>event('permissions.'+name,value));
      for(const name of ['pageshow','pagehide','freeze','resume','visibilitychange'])addEventListener(name,()=>event('document.'+name,{visibility:document.visibilityState}));
      chrome.runtime.onUserScriptConnect.addListener(port=>{
        const p={name:port.name,sender:port.sender,connectedAt:Date.now(),messages:[],disconnectedAt:null};ports.push(p);p.port=port;
        port.onMessage.addListener(value=>p.messages.push({value,at:Date.now()}));
        port.onDisconnect.addListener(()=>{p.disconnectedAt=Date.now();p.error=chrome.runtime.lastError?.message;});
      });
    });
    const worldId='m5-history-signal';
    run.signalSetup=await host.evaluate(async ({worldId,origin,target})=>{
      await chrome.userScripts.configureWorld({worldId,messaging:true});
      await chrome.userScripts.register([{id:'m5-history-registration',matches:[origin+'/_m5-never-matched/*'],world:'USER_SCRIPT',worldId,js:[{code:'void 0'}]}]);
      return window.fixture.raw({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'USER_SCRIPT',worldId,
        js:[{code:"globalThis.__m5UserHistory='m5-user-instance-marker';globalThis.__m5Port=chrome.runtime.connect({name:'m5-history-port'});__m5Port.onMessage.addListener(m=>__m5Port.postMessage({echo:m}));__m5Port.postMessage({ready:true});true"}]});
    },{worldId,origin:base,target});
    run.mainInstanceSetup=await host.evaluate(target=>window.fixture.raw({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'MAIN',js:[{code:"globalThis.__m5MainHistory='m5-main-instance-marker';true"}]}),target);
    await host.waitForFunction(()=>globalThis.__historyProbe.ports.some(p=>p.messages.some(m=>m.value.ready)),null,{timeout:5000});
    const state=()=>host.evaluate(async()=>{
      const p=globalThis.__historyProbe,tab=await chrome.tabs.getCurrent(),frame=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0}),contexts=await chrome.runtime.getContexts({});
      const hostContext=contexts.find(c=>c.documentUrl===location.href&&c.tabId===tab.id);
      const result={at:Date.now(),timeOrigin:performance.timeOrigin,hostDocumentId:frame?.documentId??hostContext?.documentId,hostContext,hostFrame:frame,
        namespaceSame:chrome.userScripts===p.cached,methodSame:chrome.userScripts?.getScripts===p.method,
        userScriptsKeys:Object.keys(chrome.userScripts||{}),runtimeKeys:Object.keys(chrome.runtime),events:p.events,
        ports:p.ports.map(({port,...record})=>record),permissionEvents:window.fixture.permissionEvents(),contexts,permissions:await chrome.permissions.getAll()};
      try{result.scripts=await p.cached.getScripts();result.cachedAvailable=true;result.worldConfigurations=await p.cached.getWorldConfigurations();}catch(e){result.cachedAvailable=false;result.error={name:e.name,message:e.message};}
      return result;
    });
    run.initial=await state();
    const off=await switchTo(false);await settings.screenshot({path:resolve(output,version+'-signal-off.png')});
    run.signalOff={ui:off,state:await state()};
    run.offPortPing=await host.evaluate(()=>{const p=__historyProbe.ports[0];try{p.port.postMessage({ping:'while-OFF'});return{sent:true};}catch(e){return{sent:false,error:e.message};}});
    await new Promise(r=>setTimeout(r,120));run.signalOffAfter120ms=await state();
    run.signalOn={ui:await switchTo(true),state:await state()};
    run.instancesAfterRestore=await host.evaluate(async({target,worldId})=>{
      const exact={tabId:target.tabId,documentIds:[target.documentId]};
      return{USER_SCRIPT:await window.fixture.raw({target:exact,world:'USER_SCRIPT',worldId,js:[{code:"({marker:globalThis.__m5UserHistory,portDefined:typeof globalThis.__m5Port!=='undefined'})"}]}),
        MAIN:await window.fixture.raw({target:exact,world:'MAIN',js:[{code:"({marker:globalThis.__m5MainHistory})"}]})};
    },{target,worldId});
    await settings.screenshot({path:resolve(output,version+'-signal-on.png')});
    for(const world of ['USER_SCRIPT','MAIN'])for(const phase of ['native-completed','pending']) {
      const token=`history-${world}-${phase}`;
      const source=phase==='pending'?`async()=>{document.body.dataset.pending=${JSON.stringify(token)};const v=await(await fetch(${JSON.stringify(base+'/hold?token='+token)})).json();document.body.dataset.effect=${JSON.stringify(token)};return v;}`:`()=>{document.body.dataset.effect=${JSON.stringify(token)};return true;}`;
      await host.evaluate(({token,target,world,source})=>window.fixture.start(token,{target,world,source,acceptanceBarrier:token}),{token,target,world,source});
      if(phase==='pending')await page.waitForFunction(t=>document.body.dataset.pending===t,token);
      else await host.waitForFunction(t=>!!window.fixture.poll(t)?.nativeCompletedAt,token);
      const before=await host.evaluate(t=>window.fixture.poll(t),token);
      const offUI=await switchTo(false);const offState=await state();
      let nativeWhileOff;
      if(phase==='pending'){
        const r=holds.get(token);if(!r)throw Error('Real HTTP hold missing');r.writeHead(200,{'Content-Type':'application/json'});r.end(JSON.stringify({token}));holds.delete(token);
        await host.waitForFunction(t=>!!window.fixture.poll(t)?.nativeCompletedAt,token);
        nativeWhileOff=await host.evaluate(t=>window.fixture.poll(t),token);
      }
      const onUI=await switchTo(true);const onState=await state();
      await host.evaluate(t=>window.fixture.releaseAcceptance(t),token);await host.waitForFunction(t=>window.fixture.poll(t)?.state==='settled',token);
      const settled=await host.evaluate(t=>window.fixture.poll(t),token);
      const effect=await page.evaluate(()=>document.body.dataset.effect);
      const fresh=await host.evaluate(({target,world})=>window.fixture.evaluate({target,world,source:'()=>true'}),{target,world});
      const c={id:token,world,phase,input:{target,world,source,acceptanceBarrier:token},before,offUI,offState,nativeWhileOff,onUI,onState,settled,effect,fresh,
        recheckCalled:false,expected:'Old outcome rejected after actual switch OFF/ON; newly admitted restored operation succeeds',
        contractMet:settled.result.accepted.kind==='rejected'&&fresh.accepted.kind==='value',sameHost:offState.hostDocumentId===onState.hostDocumentId&&offState.timeOrigin===onState.timeOrigin};
      run.cases.push(c);await json(resolve(output,'report-live.json'),report);
      console.log(JSON.stringify({version,world,phase,contractMet:c.contractMet,oldAccepted:settled.result.accepted.kind,sameHost:c.sameHost}));
    }
    run.final=await state();run.trace=await host.evaluate(()=>window.fixture.trace());run.resources=await host.evaluate(()=>window.fixture.resources());
    run.portCleanup=await host.evaluate(()=>{for(const p of __historyProbe.ports)p.port.disconnect();return{disconnectedByProbe:true,count:__historyProbe.ports.length};});
    run.markerCleanup=await host.evaluate(async()=>{await chrome.userScripts.unregister({ids:['m5-history-registration']});await chrome.userScripts.resetWorldConfiguration('m5-history-signal');return{scripts:await chrome.userScripts.getScripts(),worlds:await chrome.userScripts.getWorldConfigurations()};});
  }catch(e){run.error={name:e.name,message:e.message,stack:e.stack};}
  finally{if(context){await context.close();run.browserContextClosed=true;}await json(resolve(output,'report-live.json'),report);}
}
}finally{
  for(const r of holds.values())r.destroy();holds.clear();await new Promise(r=>server.close(r));report.serverClosed=!server.listening;
  report.sourceUnchanged=[];for(const s of sources)report.sourceUnchanged.push({path:s.path,match:s.sha256===sha(await readFile(resolve(root,s.path)))});
  await json(resolve(output,'report.json'),report);console.log(JSON.stringify({output,candidateSha256:report.candidateSha256,runs:report.runs.map(r=>({version:r.version,cases:r.cases.length,error:r.error})),serverClosed:report.serverClosed}));
}
