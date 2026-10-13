// Real isolated macOS Chrome for Testing, actual unpacked extension and Side Panel.
// Trusted Chrome Input and PID-scoped macOS input operate actual controls;
// evaluations only read UI/browser state. No injected grants/storage/fake ACK.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {reviewExport} from '../../src/time-review/model.js';
import {TIME_REVIEW_ALARM,timeReviewPackageHash} from '../../src/time-review/policy.js';
import {setTimeout as sleep} from 'node:timers/promises';

const KEY='opendesk.time-review.v1';
const OUT=path.resolve(process.env.OPENDESK_TIME_NATIVE_EVIDENCE||'artifacts/time-review-r13-native');
const EXTENSION=path.resolve(process.env.OPENDESK_TIME_NATIVE_EXTENSION||'dist/production');
const BIN=process.env.CHROME_BIN;
const NATIVE_REQUESTED=process.env.OPENDESK_TIME_REVIEW_NATIVE==='1';
// A bounded identity rerun reuses separately retained same-artifact activity
// evidence. Omitted cases remain NOT_TESTED in this report, never PASS/SKIP.
const NATIVE_SCOPE=process.env.OPENDESK_TIME_NATIVE_SCOPE||'full';
const REQUIRED_NATIVE=['install','realSidePanel','nativeTrustedUI','minuteConsent','download','multiSite','idleTransition',
  'beginAndActiveCollection','pauseResume','websiteGrantRevocation','idlePermissionRevocation',
  'swRestart','browserRestart','disableEnable','uninstall','realBrowserZoom',
  'windowFocus','panelClosedCollection','unrelatedToolInstall','unrelatedToolLifecycle',
  'minuteCanvas','canvasKeyboard','classification','populatedExport','reinstall',
  'realSidePanelReopened','nativePermissionControls','inlineEnrollment','timeReviewIframeRemoved',
  'layoutWidths','historyNavigation','longDomainLayout','sameNameSandbox','replacementRetirement','officialUpgrade',
  'unrelatedToolUpgrade','activeSwRecovery','naturalSwSleep'];
function cdp(url){
  const socket=new WebSocket(url),requests=new Map(),listeners=new Map();let sequence=0,closed=false;
  const ready=new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(!msg.id){for(const listener of listeners.get(msg.method)||[])listener(msg.params,msg.sessionId);return;}
    const pending=requests.get(msg.id);if(!pending)return;
    requests.delete(msg.id);clearTimeout(pending.timer);
    msg.error?pending.reject(Error(JSON.stringify(msg.error))):pending.resolve(msg.result);
  };
  socket.onclose=()=>{closed=true;for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('CDP_DISCONNECTED'));}requests.clear();};
  return {
    ready,
    on(method,listener){
      if(!listeners.has(method))listeners.set(method,new Set());
      listeners.get(method).add(listener);
      return ()=>listeners.get(method)?.delete(listener);
    },
    send(method,params={},sessionId){return new Promise((resolve,reject)=>{
      if(closed){reject(Error('CDP_DISCONNECTED'));return;}
      const id=++sequence,timer=setTimeout(()=>{requests.delete(id);reject(Error('CDP_TIMEOUT '+method));},15000);
      requests.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });},
    close(){socket.close();}
  };
}
async function until(fn,label,timeout=20000){
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){
    try{const value=await fn();if(value)return value;}catch(e){last=String(e);}
    await sleep(120);
  }
  throw Error(label+' timed out'+(last?': '+last:''));
}
async function evaluate(client,session,expression){
  const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  if(result.exceptionDetails)throw Error('RUNTIME_EXCEPTION '+JSON.stringify(result.exceptionDetails).slice(0,450));
  return result.result.value;
}
async function nativeClick(client,session,selector){
  await until(()=>evaluate(client,session,
    '(()=>{const n=document.querySelector('+JSON.stringify(selector)+');return !!n&&!n.disabled&&n.checkVisibility()&&!!n.getClientRects().length;})()'),'actionable '+selector);
  // The DOM operation here only scrolls an actual element into the visible
  // viewport. All clicks go through trusted CDP Input at observed coordinates.
  await evaluate(client,session,
    '(()=>{const n=document.querySelector('+JSON.stringify(selector)+');n.scrollIntoView({block:"center"});return true;})()');
  await sleep(90);
  const point=await evaluate(client,session,
    '(()=>{const n=document.querySelector('+JSON.stringify(selector)+');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()');
  assert.ok(point.w>=8&&point.h>=8&&point.x>0&&point.y>0,'visible native element '+selector);
  for(const type of ['mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1},session);
  return {selector,x:point.x,y:point.y};
}
// The new inline consent card auto-closes after a trusted start. Avoid
// blind toggles that could mistake the correct UI for a missing permission.
async function setTimeReviewSettingsVisible(client,side,visible){
  const shown=await evaluate(client,side,
    '(()=>{const n=document.querySelector("#sidebar-tool-settings-view");return !!n&&!n.hidden;})()');
  if(shown!==visible)await nativeClick(client,side,'#sidebar-tool-settings-open');
  await until(()=>evaluate(client,side,
    '(()=>{const n=document.querySelector("#sidebar-tool-settings-view");return !!n&&n.hidden==='+String(!visible)+';})()'),
    visible?'trusted Time Review settings visible':'trusted Time Review settings closed');
}
async function screenshot(client,session,name){
  const data=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(data.data,'base64'),filename=path.join(OUT,name+'.png');
  await writeFile(filename,bytes);
  return {filename:name+'.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function nativeOSClick(client,session,selector,helper,pid){
  const activated=spawnSync(helper,[String(pid),'activate'],{encoding:'utf8',timeout:10000});
  assert.equal(activated.status,0,'owned CFT foreground for actual pointer: '+String(activated.stdout||activated.stderr||activated.error));
  await evaluate(client,session,'document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"})');
  await sleep(160);
  const geometry=await evaluate(client,session,'(()=>{const n=document.querySelector('+JSON.stringify(selector)+');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight,visible:n.checkVisibility()};})()');
  const ax=spawnSync(helper,[String(pid),'dump'],{encoding:'utf8',timeout:10000});
  assert.equal(ax.status,0,'actual owned CFT AX geometry');
  const areas=JSON.parse(ax.stdout).filter(row=>row.role==='AXWebArea'&&row.position&&row.size);
  console.log('TIME_NATIVE actual-webarea-geometry '+JSON.stringify({geometry,areas}));
  const matching=areas.filter(row=>Math.abs(row.size.width-geometry.width)<2&&Math.abs(row.size.height-geometry.height)<2);
  assert.equal(matching.length,1,'one native AX Side Panel WebArea matches actual CSS viewport');
  const point={x:matching[0].position.x+geometry.x,y:matching[0].position.y+geometry.y,visible:geometry.visible};
  console.log('TIME_NATIVE actual-os-pointer '+JSON.stringify({selector,...point}));
  assert.equal(point.visible,true);
  const foreground=spawnSync(helper,[String(pid),'activate'],{encoding:'utf8',timeout:10000});
  assert.equal(foreground.status,0,'owned CFT foreground immediately before pointer: '+String(foreground.stdout||foreground.stderr||foreground.error));
  const input=spawnSync(helper,[String(pid),'click-at',String(point.x),String(point.y)],{encoding:'utf8',timeout:10000});
  assert.equal(input.status,0,'actual pointer inside owned CFT window: '+String(input.stdout||input.stderr));
  return point;
}
async function chooseNativeFile(client,session,file,helper,pid){
  const input=(command,value)=>{
    if(['key','text','press'].includes(command)){
      const foreground=spawnSync(helper,[String(pid),'activate'],{encoding:'utf8',timeout:12000});
      assert.equal(foreground.status,0,'owned chooser foreground before '+command+': '+String(foreground.stdout||foreground.stderr||foreground.error));
    }
    const result=spawnSync(helper,[String(pid),command,...(value?[value]:[])],{encoding:'utf8',timeout:12000});
    assert.equal(result.status,0,'owned native file chooser '+command+': '+String(result.stdout||result.stderr));
    return result.stdout;
  };
  input('activate');await nativeClick(client,session,'#sidebar-tool-file');
  await until(()=>JSON.parse(input('dump')).some(row=>row.role==='AXButton'&&['Open','打开'].includes(row.title||row.description)),
    'actual owned macOS file chooser');
  input('key','go-to-folder');
  await until(()=>JSON.parse(input('dump')).some(row=>['AXTextField','AXComboBox'].includes(row.role)&&row.focused),
    'actual focused native folder field');
  input('text',file);
  await until(()=>JSON.parse(input('dump')).some(row=>['AXTextField','AXComboBox'].includes(row.role)&&row.focused&&row.value===file),
    'exact path entered by real native keyboard').catch(async cause=>{
      await writeFile(path.join(OUT,'native-file-chooser-failure.json'),input('dump'));
      throw cause;
    });
  input('key','return');
  const open=await until(()=>{
    const rows=JSON.parse(input('dump'));
    if(rows.some(row=>['AXTextField','AXComboBox'].includes(row.role)&&row.focused&&row.value===file))return null;
    return ['Open','打开'].find(label=>rows.filter(row=>row.role==='AXButton'&&row.enabled&&(row.title===label||row.description===label)).length===1);
  },'folder sheet closed and one enabled native Open button');
  input('press',open);
  await until(()=>!JSON.parse(input('dump')).some(row=>row.role==='AXButton'&&['Open','打开'].includes(row.title||row.description)),
    'actual owned file chooser closed');
}
async function installReviewedPackage(client,session,candidate,name,helper,pid,note){
  const file=path.join(OUT,name+'.opendesk-tool.json'),bytes=JSON.stringify(candidate)+'\n';
  await writeFile(file,bytes);
  const target=(await client.send('Target.getTargetInfo',{},session)).targetInfo;
  await client.send('Target.activateTarget',{targetId:target.targetId});
  if(await evaluate(client,session,'document.querySelector("#sidebar-tool-import").hidden'))
    await nativeClick(client,session,'#sidebar-tool-import-trigger');
  await chooseNativeFile(client,session,file,helper,pid);
  await until(()=>evaluate(client,session,'!document.querySelector("#sidebar-tool-preview").hidden&&document.querySelector("#sidebar-tool-preview-version").textContent.includes('+JSON.stringify(candidate.version)+')'),
    'exact reviewed local package version');
  await nativeClick(client,session,'#sidebar-tool-install');
  const saved=await until(()=>evaluate(client,session,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==='+JSON.stringify(candidate.id)+'&&t.version==='+JSON.stringify(candidate.version)+'))'),
    'reviewed package installed');
  assert.deepEqual(saved,candidate,'exact reviewed local bytes persisted');
  assert.equal(await evaluate(client,session,'chrome.storage.local.get("opendesk.market.provenance.v1").then(v=>v["opendesk.market.provenance.v1"]?.['+JSON.stringify(candidate.id)+']||null)'),
    null,'local review cannot acquire official provenance');
  note('native-file-review-install',{id:candidate.id,version:candidate.version,file,sha256:createHash('sha256').update(bytes).digest('hex')});
}

test('Time Review R1.9 actual Mac Chrome native product acceptance',{skip:!NATIVE_REQUESTED,timeout:600000},async t=>{
  assert.equal(process.platform,'darwin','Real Mac Chrome required');
  assert.ok(['full','identity'].includes(NATIVE_SCOPE),'Known native acceptance scope required');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,'Pinned Chrome for Testing binary required');
  await mkdir(OUT,{recursive:true});
  const pkgFile=path.join(EXTENSION,'official-tools/time-review/time-review.opendesk-tool.json');
  const pkgBytes=await readFile(pkgFile),pkg=JSON.parse(pkgBytes);
  assert.equal(pkg.id,'time-review');
  const sourceConfig=JSON.parse(await readFile('examples/sidebar-tools/time-review/tool.config.json','utf8'));
  const releaseCatalog=JSON.parse(await readFile(path.join(EXTENSION,'official-tools/catalog.json'),'utf8'));
  const release=releaseCatalog.apps.find(row=>row.toolId==='time-review');
  assert.equal(pkg.version,sourceConfig.version);assert.equal(pkg.version,release.version);
  assert.equal(createHash('sha256').update(pkgBytes).digest('hex'),release.sha256);
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-time-r13-'));
  const downloads=path.join(profile,'owned-downloads');await mkdir(downloads);
  // Configure the real Chrome profile before launch. Do not use CDP's
  // Browser.setDownloadBehavior: it can replace native filename decisions.
  await mkdir(path.join(profile,'Default'),{recursive:true});
  await writeFile(path.join(profile,'Default','Preferences'),JSON.stringify({
    download:{default_directory:downloads,prompt_for_download:false,directory_upgrade:true}
  }));
  const args=['--use-mock-keychain','--password-store=basic','--no-sandbox','--disable-gpu',
    '--force-renderer-accessibility=complete',
    '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+EXTENSION,
    '--load-extension='+EXTENSION,'about:blank'];
  const proc=spawn(BIN,args,{stdio:['ignore','ignore','pipe']});
  let stderr='',browser=null,complete=false,sideSid=null,frameSid=null,restartProc=null;
  const evidence={candidate:process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),mode:'actual-headed-macos-CFT',
    scope:NATIVE_SCOPE,nodeVersion:process.version,macVersion:spawnSync('sw_vers',[],{encoding:'utf8'}).stdout.trim(),
    package:{id:pkg.id,version:pkg.version,sha256:createHash('sha256').update(pkgBytes).digest('hex')},
    chromePid:proc.pid,profileOwned:true,install:'NOT_TESTED',realSidePanel:'NOT_TESTED',
    minuteConsent:'NOT_TESTED',browserRestart:'NOT_TESTED',download:'NOT_TESTED',
    beginAndActiveCollection:'NOT_TESTED',pauseResume:'NOT_TESTED',
    websiteGrantRevocation:'NOT_TESTED',idlePermissionRevocation:'NOT_TESTED',
    swRestart:'NOT_TESTED',hostedCI:process.env.CI==='true',extensionPath:EXTENSION,profile,
    driverSha256:createHash('sha256').update(await readFile(import.meta.filename)).digest('hex'),
    chromeBinaryVersion:spawnSync(BIN,['--version'],{encoding:'utf8'}).stdout.trim(),
    screenshots:[],steps:[]};
  const note=(name,data)=>{evidence.steps.push({name,...data});console.log('TIME_NATIVE '+name+' '+JSON.stringify(data));};
  proc.stderr.on('data',data=>{stderr=(stderr+String(data)).slice(-3500);});
  t.after(async()=>{
    if(!complete&&process.env.OPENDESK_TIME_NATIVE_DEBUG_HOLD==='1'){
      note('owned-failure-debug-hold',{pid:proc.pid,profile,seconds:60});await sleep(60000);
    }
    if(!complete&&browser){
      if(sideSid)try{
        evidence.failureObservation=await evaluate(browser,sideSid,
          '(async()=>({text:document.body.innerText.slice(-2200),focused:await chrome.windows.getLastFocused(),active:await chrome.tabs.query({active:true,lastFocusedWindow:true}),status:document.querySelector("#status")?.textContent}))()');
        evidence.failureTimeState=await evaluate(browser,sideSid,
          'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+'])');
        evidence.failureIdleState=await evaluate(browser,sideSid,'chrome.idle.queryState(60)');
        const downloaded=await evaluate(browser,sideSid,
          'chrome.downloads.search({}).then(rows=>rows.map(({id,state,error,filename,bytesReceived,totalBytes})=>({id,state,error,filename,bytesReceived,totalBytes})))');
        evidence.downloadObservation=downloaded.map(row=>({
          id:row.id,state:row.state,error:row.error||null,
          basename:path.basename(row.filename||''),
          insideOwned:path.dirname(path.resolve(row.filename||''))===path.resolve(downloads),
          received:row.bytesReceived,total:row.totalBytes
        }));
      }catch(error){evidence.steps.push({name:'download-observation-unavailable',error:String(error)});}
      // CDP Page.captureScreenshot only supports a top-level Page/Side Panel.
      // Its image already composites the sandbox iframe; never screenshot an
      // OOPIF directly (Chrome rejects that command).
      if(sideSid)try{evidence.screenshots.push(await screenshot(browser,sideSid,'failure-side'));}
      catch(error){evidence.steps.push({name:'failure-screenshot-unavailable',target:'side',error:String(error)});}
      if(frameSid)try{
        const state=await evaluate(browser,frameSid,
          '(()=>({text:document.body.innerText.slice(0,500),rootHeight:document.querySelector(".review")?.getBoundingClientRect().height,viewportHeight:innerHeight,scrollHeight:document.documentElement.scrollHeight}))()');
        evidence.steps.push({name:'failure-sandbox-readonly-geometry',...state});
      }catch(error){evidence.steps.push({name:'failure-frame-observe-unavailable',error:String(error)});}
    }
    if(browser)try{await browser.send('Browser.close');}catch{}
    browser?.close();
    if(proc.exitCode===null&&proc.signalCode===null){
      await new Promise(resolve=>{
        const timer=setTimeout(()=>{proc.kill('SIGKILL');resolve();},2600);
        proc.once('close',()=>{clearTimeout(timer);resolve();});
        proc.kill('SIGTERM');
      });
    }
    if(restartProc&&restartProc.exitCode===null&&restartProc.signalCode===null){
      await new Promise(resolve=>{
        const timer=setTimeout(()=>{restartProc.kill('SIGKILL');resolve();},2600);
        restartProc.once('close',()=>{clearTimeout(timer);resolve();});
        restartProc.kill('SIGTERM');
      });
    }
    const terminated=(proc.exitCode!==null||proc.signalCode!==null)&&
      (!restartProc||restartProc.exitCode!==null||restartProc.signalCode!==null);
    const owned=path.basename(profile).startsWith('opendesk-time-r13-')&&path.dirname(profile)===tmpdir();
    assert.ok(owned,'Only the unique owned temp profile may be removed');
    await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});
    evidence.cleanup={terminated,profileRemoved:true,owned};
    evidence.complete=complete;
    evidence.acceptance=complete?(REQUIRED_NATIVE.every(key=>evidence[key]==='PASS')?'PASS':'PARTIAL'):'FAIL';
    evidence.requiredResults=Object.fromEntries(REQUIRED_NATIVE.map(key=>[key,evidence[key]||'NOT_TESTED']));
    evidence.chromeStderr=stderr.slice(-1200);
    await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(evidence,null,2)+'\n');
  });
  const info=await until(async()=>{
    const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const values=source?.split('\n');return Number(values?.[0])>0?{port:Number(values[0])}:null;
  },'isolated Chrome DevTools '+stderr,30000);
  const base='http://127.0.0.1:'+info.port;
  const version=await(await fetch(base+'/json/version')).json();
  browser=cdp(version.webSocketDebuggerUrl);await browser.ready;
  evidence.chrome=version.Browser;
  const present=await until(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'loaded unpacked MV3 worker');
  evidence.extensionId=present;
  // Native extension UI tab is used solely to open the actual SIDE_PANEL from
  // a genuine CDP input event (never to inject storage or fake a sender).
  const ui=await browser.send('Target.createTarget',{url:'chrome-extension://'+present+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const uiTarget=await browser.send('Target.attachToTarget',{targetId:ui.targetId,flatten:true});
  await browser.send('Runtime.enable',{},uiTarget.sessionId);await browser.send('Page.enable',{},uiTarget.sessionId);
  // Observe lifecycle through the ordinary page session. Never attach a
  // debugger to the SW: that attachment would prevent natural idle stopping.
  const workerStates=[],workerErrors=[],workerEvents=[],workerCrashes=[];
  evidence.workerObserver={events:workerEvents,errors:workerErrors,crashes:workerCrashes};
  browser.on('ServiceWorker.workerVersionUpdated',(params,sessionId)=>{
    if(sessionId!==uiTarget.sessionId)return;
    workerEvents.push({at:performance.now(),sessionId,method:'workerVersionUpdated',params});
    for(const version of params.versions||[])if(version.scriptURL==='chrome-extension://'+present+'/sw.js')
      workerStates.push({at:performance.now(),sessionId,...version,status:version.runningStatus});
  });
  browser.on('ServiceWorker.workerRegistrationUpdated',(params,sessionId)=>{
    if(sessionId===uiTarget.sessionId)workerEvents.push({at:performance.now(),sessionId,method:'workerRegistrationUpdated',params});
  });
  browser.on('ServiceWorker.workerErrorReported',({errorMessage},sessionId)=>{
    if(sessionId===uiTarget.sessionId)workerErrors.push({at:performance.now(),sessionId,...errorMessage});
  });
  browser.on('Target.targetCrashed',params=>{
    workerCrashes.push({at:performance.now(),...params});
  });
  let workerObserverReady=false;
  try{
    await browser.send('Target.setDiscoverTargets',{discover:true});
    await browser.send('ServiceWorker.enable',{},uiTarget.sessionId);workerObserverReady=true;
  }
  catch(cause){note('passive-worker-observer-unavailable',{error:String(cause)});}
  await until(()=>evaluate(browser,uiTarget.sessionId,'Boolean(document.querySelector("#sidebar-tool-official-time-review-install"))'),'official Time Review available');
  note('trusted-open',await nativeClick(browser,uiTarget.sessionId,'#catalog-open-dev-sidebar'));
  const sideDocument=await until(async()=>{
    const c=await evaluate(browser,uiTarget.sessionId,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
    return c.find(x=>x.documentUrl?.includes('/ui/tool.html')&&x.documentId);
  },'actual SIDE_PANEL context');
  const sideTarget=await until(async()=>{
    const rows=(await browser.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.url===sideDocument.documentUrl);
  },'native Side Panel target');
  let side=(await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true})).sessionId;
  sideSid=side;
  await browser.send('Runtime.enable',{},side);await browser.send('Page.enable',{},side);
  evidence.realSidePanel='PASS';
  await nativeClick(browser,side,'#tab-tools');
  // The production R4.9 UI uses the compact '+' button, not the obsolete
  // #sidebar-tool-discover-tab control from the historical knowledge driver.
  await nativeClick(browser,side,'#sidebar-tool-discover-toggle');
  await until(()=>evaluate(browser,side,
    '!document.querySelector("#sidebar-tool-discover-panel").hidden'),'official discovery visible');
  await nativeClick(browser,side,'#sidebar-tool-official-time-review-install');
  await until(()=>evaluate(browser,side,'!document.querySelector("#sidebar-tool-preview")?.hidden'),'review package');
  assert.equal(await evaluate(browser,side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0,
    'review does not execute uninstalled code');
  await nativeClick(browser,side,'#sidebar-tool-install');
  const installed='[data-sidebar-tool-action=open][data-sidebar-tool-id=time-review]';
  await until(()=>evaluate(browser,side,'Boolean(document.querySelector('+JSON.stringify(installed)+'))'),'official Time Review installed');
  const saved=await evaluate(browser,side,
    'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.find(x=>x.id==="time-review")?.version)');
  assert.equal(saved,pkg.version,'real installed package persisted with exact built tool version');
  evidence.install='PASS';note('install',{version:saved});
  await nativeClick(browser,side,installed);
  await until(()=>evaluate(browser,side,'!document.querySelector("#sidebar-tool-display").hidden'),'tool opened');
  await until(()=>evaluate(browser,side,`(()=>{
    const host=document.querySelector("#sidebar-tool-frame");
    return host?.dataset.timeReviewNative==="true"&&
      !!host.querySelector("main.review")&&
      host.querySelectorAll("iframe").length===0;
  })()`),'first-party trusted Side Panel native render without iframe');
  // The one trusted Side Panel document owns the Canvas, settings, exports
  // and controls; there is intentionally no Time Review iframe target.
  let frame=side;frameSid=null;
  evidence.nativeTrustedUI='PASS';evidence.timeReviewIframeRemoved='PASS';
  await until(()=>evaluate(browser,frame,
    'document.querySelectorAll(".qcard").length===4 && document.querySelectorAll(".extra-card").length===2 && !document.querySelector("#status")?.textContent?.includes("正在读取")'),
    'actual R1.3 data-bound Canvas and category cards');
  const visual=await evaluate(browser,frame,
    '(()=>({quadrants:document.querySelectorAll(".qcard").length,extras:document.querySelectorAll(".extra-card").length,day:document.querySelector("#today-total")?.textContent,timeline:document.querySelector("#timeline-state")?.textContent,horizontal:document.documentElement.scrollWidth<=innerWidth+1}))()');
  assert.equal(visual.quadrants,4);assert.equal(visual.extras,2);
  assert.deepEqual(await evaluate(browser,frame,
    'Array.from(document.querySelectorAll(".q-name")).map(el=>el.textContent)'),
    ['重要且紧急','重要不紧急','紧急不重要','不重要不紧急'],
    'native Canvas classifications must use canonical data model labels');
  assert.equal(visual.timeline,'尚无分钟明细','No fabricated historical minutes');
  assert.equal(visual.horizontal,true,'No horizontal overflow in actual Side Panel');
  evidence.screenshots.push(await screenshot(browser,side,'installed-native-side-panel'));
  const frameGeometry=await evaluate(browser,frame,
    '(()=>({viewportHeight:innerHeight,documentHeight:document.documentElement.scrollHeight,rootHeight:document.querySelector(".review")?.getBoundingClientRect().height}))()');
  const outerGeometry=await evaluate(browser,side,
    '(()=>{const native=document.querySelector("#sidebar-tool-frame main.review");return {viewportHeight:innerHeight,nativeHeight:native?.getBoundingClientRect().height,iframeCount:document.querySelectorAll("#sidebar-tool-frame iframe").length,hostScrollHeight:document.documentElement.scrollHeight}})()');
  note('native-canvas',{...visual,frameGeometry,outerGeometry});
  evidence.installedViewportWidths=[];
  for(const width of [320,360,400,600]){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},side);
    await sleep(180);
    const metrics=await evaluate(browser,side,`(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      canvas:document.querySelector('#minute-canvas').getBoundingClientRect().width,
      reviews:document.querySelectorAll('#sidebar-tool-frame main.review').length,
      iframes:document.querySelectorAll('#sidebar-tool-frame iframe').length,
      label:document.querySelector('#minute-canvas').getAttribute('aria-label')}))()`);
    assert.equal(metrics.width,width);assert.ok(metrics.scroll<=width+1);assert.ok(metrics.canvas>0&&metrics.canvas<=width);
    assert.equal(metrics.reviews,1);assert.equal(metrics.iframes,0);assert.ok(metrics.label);
    evidence.installedViewportWidths.push({...metrics,method:'CDP viewport on installed native UI'});
    evidence.screenshots.push(await screenshot(browser,side,'installed-native-'+width));
  }
  await browser.send('Emulation.clearDeviceMetricsOverride',{},side);
  note('installed-native-widths',{verdict:'PASS',method:'installed SIDE_PANEL CSS viewport override',widths:[320,360,400,600]});
  evidence.layoutWidths='PASS';
  // Actual Chrome page zoom: macOS native Command+Plus/Command+0 input on the
  // owned, headed SIDE_PANEL. DPR emulation cannot satisfy this contract.
  const zoomMetrics=()=>evaluate(browser,frame,
    '(()=>({cssWidth:innerWidth,cssScrollWidth:document.documentElement.scrollWidth,cssHeight:innerHeight,contentHeight:document.documentElement.scrollHeight,dpr:devicePixelRatio,canvasWidth:document.querySelector("#minute-canvas")?.getBoundingClientRect().width||0}))()');
  const originalZoom=await zoomMetrics();
  const zoomInput=path.join(profile,'time-review-native-activity');
  const nativeCompiler=spawnSync('swiftc',[
    path.resolve('tests/framework/time-review-native-input.swift'),'-o',zoomInput
  ],{encoding:'utf8',timeout:80000});
  let browserZoom='BLOCKED',zoomObserved=originalZoom,zoomSteps=0,zoomFailure='';
  if(nativeCompiler.status===0){
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned Chrome foreground for real zoom');
    await nativeOSClick(browser,frame,'#minute-canvas',zoomInput,proc.pid);
    await until(()=>evaluate(browser,frame,'document.activeElement?.id==="minute-canvas"'),'actual Canvas native keyboard focus');
    for(let i=0;i<8;i++){
      assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned Chrome foreground before zoom shortcut');
      const pressed=spawnSync(zoomInput,[String(proc.pid),'key',i>=6?'zoom-out':'zoom-in'],
        {encoding:'utf8',timeout:10000});
      if(pressed.status!==0){
        zoomFailure='real macOS zoom shortcut not accepted, status '+pressed.status;
        break;
      }
      zoomSteps++;
      await sleep(160);
      zoomObserved=await zoomMetrics();
      const ratio=zoomObserved.dpr/originalZoom.dpr;
      if(ratio>=1.93&&ratio<=2.08){browserZoom='PASS';break;}
      if(ratio>2.08){
        zoomFailure='overshot actual Chrome 200% ratio ('+ratio.toFixed(3)+')';
        break;
      }
    }
    if(browserZoom==='PASS'){
      const measurable=await until(async()=>{
        const m=await zoomMetrics();
        // The first-party Side Panel has one intentional outer vertical
        // scrollbar. Only nested/horizontal overflow is forbidden.
        return m.cssScrollWidth<=m.cssWidth+1&&m.canvasWidth>0?m:null;
      },'actual 200 percent zoom has no nested scrolling or horizontal overflow',6000);
      zoomObserved=measurable;
      assert.ok(zoomObserved.canvasWidth>0&&zoomObserved.canvasWidth<=zoomObserved.cssWidth,
        'actual zoom must keep the one-track Canvas inside the Side Panel width');
      evidence.screenshots.push(await screenshot(browser,side,'real-chrome-200-percent-zoom'));
    }else if(!zoomFailure)zoomFailure='macOS zoom shortcut did not produce verified double CSS zoom';
    // Reset the real browser zoom before permission/collection acceptance.
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned Chrome foreground before zoom reset');
    const reset=spawnSync(zoomInput,[String(proc.pid),'key','zoom-reset'],{
      encoding:'utf8',timeout:10000
    });
    if(reset.status!==0)throw Error('Unable to reset native Chrome zoom after test');
    await until(async()=>{
      const m=await zoomMetrics();
      return Math.abs(m.dpr/originalZoom.dpr-1)<0.08?m:null;
    },'owned Chrome returned to original zoom',6000);
  }else zoomFailure='owned macOS Swift accessibility helper unavailable';
  evidence.realBrowserZoom=browserZoom;
  note('real-chrome-zoom',{verdict:browserZoom,source:'macOS CGEvent Command+Plus',steps:zoomSteps,
    baseline:originalZoom,observed:zoomObserved,reason:zoomFailure||null,
    browser200PercentVerified:browserZoom==='PASS'});
  const readTime=()=>evaluate(browser,side,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+'])');
  let state=await readTime();assert.ok(state&&state.paused,'install/open must not begin recording');
  assert.equal(state.minuteConsent,false,'minute data opt-in must default false');
  // Native UI hides its duplicate minute-consent control: only the existing
  // trusted Host enrollment/retention buttons may change that permission.
  assert.equal(await evaluate(browser,side,
    'Boolean(document.querySelector("#minute-consent")?.closest(".setting-row")?.hidden)'),true);
  await setTimeReviewSettingsVisible(browser,side,true);
  state=await readTime();assert.equal(state.minuteConsent,false);
  // Check actual optional Chrome permission against the visible first-party
  // controls: the native UI owns the only start/resume button.
  const initiallyIdleGranted=await evaluate(browser,side,
    'chrome.permissions.contains({permissions:["idle"]})');
  await until(()=>evaluate(browser,side,`(()=>{
    const grant=document.querySelector("#time-review-grant-idle");
    const revoke=document.querySelector("#time-review-revoke-idle");
    const duplicate=document.querySelector("#time-review-trusted-start");
    return grant?.hidden===${String(initiallyIdleGranted)}&&
      revoke?.hidden===${String(!initiallyIdleGranted)}&&
      duplicate?.hidden===true;
  })()`),'native permission controls match Chrome and suppress duplicate start');
  evidence.nativePermissionControls='PASS';
  note('native-permission-actions',{initiallyIdleGranted,duplicateStartHidden:true});
  note('trusted-native-consent-unmodified',{minuteConsent:state.minuteConsent});
  await nativeClick(browser,side,'#time-review-minute-enable');
  state=await until(async()=>{const value=await readTime();return value?.minuteConsent?value:null;},'trusted minute consent');
  assert.deepEqual(state.minuteDays,{});
  note('trusted-minute-optin',{minuteConsent:true});
  await nativeClick(browser,side,'#time-review-minute-disable');
  assert.equal(await evaluate(browser,side,'document.querySelector("#time-review-minute-delete-review").hidden'),false);
  await nativeClick(browser,side,'#time-review-minute-delete-cancel');
  assert.equal((await readTime()).minuteConsent,true,'cancel preserves consent');
  await nativeClick(browser,side,'#time-review-minute-disable');
  await nativeClick(browser,side,'#time-review-minute-delete-approve');
  state=await until(async()=>{const value=await readTime();return value?.minuteConsent===false?value:null;},'trusted consent withdrawal');
  assert.deepEqual(state.minuteDays,{},'withdrawal deletes minute entries');
  evidence.minuteConsent='PASS';
  evidence.screenshots.push(await screenshot(browser,side,'trusted-permission-settings'));
  note('trusted-minute-withdrawal',{minuteConsent:false});
  await setTimeReviewSettingsVisible(browser,side,false);
  await until(()=>evaluate(browser,side,'document.querySelector("#sidebar-tool-settings-view").hidden'),'return tool from host settings');
  const exportDetails=await evaluate(browser,side,'Boolean(document.querySelector("#sidebar-tool-frame iframe"))');
  assert.equal(await evaluate(browser,side,'Boolean(document.querySelector("#sidebar-tool-frame main.review"))'),true);
  assert.equal(exportDetails,false,'approved first-party Time Review must not have a sandbox iframe');
  // The browser API may accept a download that subsequently gets interrupted.
  // Observe REAL Chrome download state before declaring disk success; never
  // read or copy a file outside this run's independently owned profile.
  const readDownloads=()=>evaluate(browser,side,
    'chrome.downloads.search({}).then(rows=>rows.map(({id,state,error,filename,bytesReceived,totalBytes,byExtensionId})=>({id,state,error,filename,bytesReceived,totalBytes,ownedByExtension:byExtensionId===chrome.runtime.id})))');
  const expectedState=await readTime(),issues=[],downloadChecks=[];
  // Closed <details> descendants may retain layout rectangles in Chrome.
  // Open the real visible settings control before attempting an export.
  await nativeClick(browser,frame,'#settings-shortcut');
  await until(()=>evaluate(browser,frame,'document.querySelector("#settings").open'),'real export settings opened');
  // The owned Chrome profile routes real downloads; no CDP interception.
  for(const [format,selector] of [['json','#export-json'],['csv','#export-csv']]){
    const result={format,created:'NOT_TESTED',complete:'NOT_TESTED',ownedDirectory:'NOT_TESTED',
      disk:'NOT_TESTED',content:'NOT_TESTED',filename:'NOT_TESTED'};
    downloadChecks.push(result);
    const previous=new Set((await readDownloads()).map(row=>row.id));
    await nativeClick(browser,frame,selector);
    await until(()=>evaluate(browser,frame,
      'document.querySelector("#status")?.textContent?.includes("已请求下载")'),
      format+' download requested by trusted Time Review host',9000);
    const created=await until(async()=>{
      const rows=await readDownloads();return rows.find(row=>!previous.has(row.id))||null;
    },format+' Chrome download record',12000);
    result.created='PASS';result.id=created.id;
    const finished=await until(async()=>{
      const rows=await readDownloads(),entry=rows.find(row=>row.id===created.id);
      return entry&&['complete','interrupted'].includes(entry.state)?entry:null;
    },format+' Chrome terminal download state',25000);
    result.complete=finished.state==='complete'?'PASS':'FAIL';
    if(result.complete==='FAIL')issues.push(format+' Chrome interrupted: '+(finished.error||'unknown'));
    const actualFile=path.resolve(finished.filename||'');
    const insideOwned=path.dirname(actualFile)===path.resolve(downloads);
    result.ownedDirectory=insideOwned?'PASS':'FAIL';
    if(!insideOwned)issues.push(format+' saved outside the dedicated profile directory');
    result.basename=path.basename(actualFile);
    result.received=finished.bytesReceived;
    result.ownedByExtension=finished.ownedByExtension;
    if(insideOwned){
      try{
        const actualBytes=await readFile(actualFile);
        await writeFile(path.join(OUT,'download-empty.'+format),actualBytes);
        result.disk=actualBytes.length>0?'PASS':'FAIL';
        result.bytes=actualBytes.length;
        result.sha256=createHash('sha256').update(actualBytes).digest('hex');
        if(!actualBytes.length)issues.push(format+' disk file is empty');
        else try{
          const text=actualBytes.toString('utf8');
          if(format==='json'){
            const parsed=JSON.parse(text);
            assert.equal(parsed.format,'opendesk.time-review.export.v1');
            for(const key of ['days','settings','categories','minuteDays'])
              assert.deepEqual(parsed[key],expectedState[key],format+' '+key+' differs from Chrome storage');
            assert.equal(parsed.minuteConsent,expectedState.minuteConsent);
            assert.equal(parsed.discardedMs,expectedState.discardedMs);
          }else{
            assert.ok(text.startsWith('date,website,milliseconds,seconds,category\r\n'));
            assert.equal(text,reviewExport(expectedState,'csv').text);
          }
          result.content='PASS';
        }catch(e){result.content='FAIL';issues.push(format+' content invalid: '+String(e.message));}
      }catch(e){result.disk='FAIL';issues.push(format+' no readable disk file: '+String(e.message));}
    }
    const expectedFilename=new RegExp('^time-review(?: \\(\\d+\\))?\\.'+format+'$');
    result.filename=expectedFilename.test(result.basename)?'PASS':'FAIL';
    if(result.filename==='FAIL')issues.push(format+' filename mismatch: '+result.basename);
    // Each result is saved independently: a filename mismatch must not hide
    // successful disk bytes or failed content validation for either format.
    note('download-'+format,result);
  }
  evidence.downloadChecks=downloadChecks;
  evidence.download=issues.length?'FAIL':'PASS';
  if(issues.length)assert.deepEqual(issues,[],'Actual JSON/CSV export failures');
  assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned standard browser window after actual downloads');
  assert.equal(spawnSync(zoomInput,[String(proc.pid),'key','escape'],{encoding:'utf8',timeout:10000}).status,0,'close actual recent-download popup before further input');
  state=await readTime();assert.equal(state.paused,true,'no idle prompt or start should be bypassed');
  // The native Start may REVEAL required permissions, not grant anything.
  // Missing site scope/idle must never start an unauthorized tracker.
  await nativeClick(browser,frame,'#start');
  await until(()=>evaluate(browser,side,`(()=>{
    const d=document.querySelector("#sidebar-tool-display");
    const s=document.querySelector("#sidebar-tool-settings-view");
    const f=document.querySelector("#sidebar-tool-frame");
    return d?.dataset.timeReviewInline==="true"&&!s.hidden&&!f.hidden&&s.nextElementSibling===f;
  })()`),'real first-run inline consent with visible statistics and DOM tab order',12000);
  state=await readTime();
  assert.ok(state.paused&&state.siteGrants?.origins?.length===0&&state.siteGrants?.allSites===false,
    'native Start without permission must not grant site access or begin recording');
  evidence.inlineEnrollment='PASS';
  evidence.screenshots.push(await screenshot(browser,side,'first-run-inline-time-review-consent'));
  note('native-inline-enrollment',{trustedExistingControls:true,nativeUIVisible:true,iframeRemoved:true,domFocusOrder:true,siteGrantUntouched:true});
  // Native activity is driven by real Chrome permission UI and active tabs.
  // Never pre-seed business storage or replace the idle API in this test.
  await setTimeReviewSettingsVisible(browser,side,true);
  // A previously approved permission needs no second Chrome prompt.
  if(!await evaluate(browser,side,'chrome.permissions.contains({permissions:["idle"]})'))
    await nativeClick(browser,side,'#time-review-grant-idle');
  const granted=await until(()=>evaluate(browser,side,
    'chrome.permissions.contains({permissions:["idle"]})'),'genuine idle permission',5000).catch(()=>false);
  if(granted){
    await until(()=>evaluate(browser,side,`(()=>{
      const grant=document.querySelector("#time-review-grant-idle");
      const revoke=document.querySelector("#time-review-revoke-idle");
      return grant?.hidden===true&&revoke?.hidden===false;
    })()`),'Chrome idle approval hides redundant consent prompt',5000);
    note('native-idle-ui-reflects-grant',{granted:true,duplicateGrantHidden:true});
  }
  if(!granted){
    evidence.beginAndActiveCollection='BLOCKED';
    note('activity-native-blocked',{reason:'Native browser optional idle grant was not approved'});
  }else{
    const siteServer=createServer((_req,res)=>{
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end('<!doctype html><html lang="zh-CN"><title>Time Review native</title><body><h1>Real HTTP activity</h1></body></html>');
    });
    await new Promise((resolve,reject)=>{
      siteServer.once('error',reject);siteServer.listen(0,'127.0.0.1',resolve);
    });
    t.after(()=>new Promise(resolve=>siteServer.close(resolve)));
    const siteUrl='http://127.0.0.1:'+siteServer.address().port+'/activity';
    const site=await browser.send('Target.createTarget',{url:siteUrl});
    await browser.send('Target.activateTarget',{targetId:site.targetId});
    const websiteSession=(await browser.send('Target.attachToTarget',{targetId:site.targetId,flatten:true})).sessionId;
    await browser.send('Runtime.enable',{},websiteSession);await browser.send('Page.enable',{},websiteSession);
    await until(()=>evaluate(browser,websiteSession,'!!document.querySelector("h1")'),'owned actual HTTP document loaded');
    await nativeOSClick(browser,websiteSession,'h1',zoomInput,proc.pid);
    const activate=spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000});
    assert.equal(activate.status,0,'owned CFT foreground for precise Origin consent');
    await until(async()=>{
      const win=await evaluate(browser,side,'chrome.windows.getLastFocused()');
      const active=await evaluate(browser,side,'chrome.tabs.query({active:true,lastFocusedWindow:true})');
      return win.focused&&active.some(tab=>tab.url===siteUrl&&tab.status==='complete'&&!tab.pendingUrl);
    },'real HTTP(S) Chrome active tab',10000);
    // R1.5: native, trusted, per-tool website consent. Manifest all_urls is NOT consent.
    await nativeClick(browser,side,'#time-review-site-current-open');
    await until(()=>evaluate(browser,side,
      '!document.querySelector("#time-review-site-confirm").hidden'),'site consent review',10000);
    await nativeClick(browser,side,'#time-review-site-current-approve');
    const approvedOrigin=new URL(siteUrl).origin;
    await until(async()=>{
      const s=await readTime();
      return s?.siteGrants?.origins?.includes(approvedOrigin)?s:null;
    },'independent Time Review site grant',10000);
    note('site-grant',{origin:approvedOrigin,source:'native trusted click'});
    // One authentic click in the actual native UI must start without a
    // second review button after permissions are already effective.
    await setTimeReviewSettingsVisible(browser,side,false);
    await nativeClick(browser,frame,'#start');
    await until(async()=>{const s=await readTime();return s&&!s.paused&&s.authorizedHash?s:null;},'one-click native start',10000);
    await until(()=>evaluate(browser,frame,
      'document.querySelector("#start")?.hidden===true&&document.querySelector("#pause")?.hidden===false'),
      'trusted start updates live Time Review controls without waiting 15 seconds',8000);
    note('trusted-start-immediate-ui',{pauseVisible:true,noIframe:true,noSecondConfirmation:true});
    await setTimeReviewSettingsVisible(browser,side,true);
    await nativeClick(browser,side,'#time-review-minute-enable');
    await until(async()=>Boolean((await readTime())?.minuteConsent),'real minute opt-in before legitimate activity');
    await setTimeReviewSettingsVisible(browser,side,false);
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,
      'restore owned CFT foreground before observing real activity');
    const readActivityGates=()=>evaluate(browser,side,
      '(async()=>{const w=await chrome.windows.getLastFocused();const t=(await chrome.tabs.query({active:true,windowId:w.id}))[0];return {focused:w.focused,windowType:w.type,idle:await chrome.idle.queryState(60),isLoopbackTab:t?.url?.startsWith("http://127.0.0.1:"),hasHostPermission:await chrome.permissions.contains({origins:["http://127.0.0.1/*"]})};})()');
    let observationGates=await readActivityGates();
    note('native-observation-gates-before-input',observationGates);
    if(observationGates.idle!=='active'||!observationGates.focused){
      // CDP mouse dispatch is a browser renderer event and is NOT proof of
      // operating-system activity. Use the existing macOS-owned CFT helper:
      // it checks the actual process and emits a real macOS CGEvent, without
      // injecting Chrome idle responses, permissions, or Time Review storage.
      const helper=path.join(profile,'time-review-native-activity');
      const compile=await stat(helper).catch(()=>null)
        ?{status:0}:{...spawnSync('swiftc',[
          path.resolve('tests/framework/time-review-native-input.swift'),'-o',helper
        ],{encoding:'utf8',timeout:80000})};
      let delivered=false,reason='';
      if(compile.status===0){
        assert.equal(spawnSync(helper,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,
          'owned CFT foreground for real OS activity');
        const input=spawnSync(helper,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000});
        delivered=input.status===0&&String(input.stdout).includes('OWNED_NATIVE_MOUSE_MOVED');
        reason=delivered?'macOS owned CGEvent sent':
          'macOS Accessibility/CGEvent permission unavailable (status '+input.status+')';
      }else reason='macOS Swift helper unavailable (status '+compile.status+')';
      note('native-os-activity-attempt',{delivered,reason});
      if(delivered)observationGates=await until(async()=>{
        const gates=await readActivityGates();
        return gates.idle==='active'&&gates.focused?gates:null;
      },'macOS real input transitions chrome.idle to active',3000).catch(()=>observationGates);
    }
    note('native-observation-gates-final',observationGates);
    const canProveActivity=NATIVE_SCOPE==='full'&&observationGates.idle==='active'&&observationGates.focused===true&&
      observationGates.windowType==='normal'&&observationGates.isLoopbackTab===true&&
      observationGates.hasHostPermission===true;
    if(!canProveActivity){
      evidence.beginAndActiveCollection=NATIVE_SCOPE==='identity'?'NOT_TESTED':'BLOCKED';
      note('activity-native-blocked',{
        reason:NATIVE_SCOPE==='identity'?'Explicit identity-only rerun; reuse separately bound activity evidence':'Real system activity and focused, authorized HTTP(S) tab are required',
        gates:observationGates
      });
      // A CI host that is physically idle is not a product defect. Never
      // weaken observe(), simulate chrome.idle, or count this as native PASS.
      await nativeClick(browser,frame,'#pause');
      await until(async()=>{const s=await readTime();return s?.paused&&s.checkpoint===null?s:null;},
        'real pause before independent restart checks when activity is blocked');
    }else{
      // A genuine OS activity transition does not force an immediate SW wake:
      // the heartbeat may legitimately arrive up to 30 seconds later. Use
      // the actual Side Panel refresh button to request a normal status tick.
      // No Chrome storage/business data or privileged API response is forged.
      await setTimeReviewSettingsVisible(browser,side,false);
      await nativeClick(browser,frame,'#refresh');
      const checkpoint=await until(async()=>{
        const s=await readTime();
        return s?.checkpoint?.host==='127.0.0.1'?s:null;
      },'website checkpoint after visible Time Review refresh',10000);
      note('real-web-checkpoint',{host:checkpoint.checkpoint.host,paused:checkpoint.paused,
        startedAt:checkpoint.checkpoint.at,hasPermission:true});
      await sleep(1600);
      await nativeClick(browser,frame,'#refresh');
    const settled=await until(async()=>{
      const s=await readTime();
      return Object.values(s.days||{}).some(sites=>(sites['127.0.0.1']||0)>=750)?s:null;
    },'real observed time persisted for local HTTP website',10000);
    const total=s=>Object.values(s.days||{}).reduce((sum,sites)=>sum+(sites['127.0.0.1']||0),0);
    evidence.beginAndActiveCollection='PASS';
    note('real-http-activity',{host:'127.0.0.1',ms:total(settled),from:'real active browser tab'});
    await until(()=>evaluate(browser,frame,'["分钟明细完整","部分分钟明细"].includes(document.querySelector("#timeline-state").textContent)'),'Canvas shows genuinely captured minute data');
    assert.ok(Object.values(settled.minuteDays||{}).some(day=>day.entries?.length>0),'actual minute records, never seeded');
    await nativeOSClick(browser,frame,'#minute-canvas',zoomInput,proc.pid);
    await until(()=>evaluate(browser,frame,'document.activeElement?.id==="minute-canvas"'),'actual recorded Canvas native keyboard focus');
    const canvasAX=spawnSync(zoomInput,[String(proc.pid),'dump'],{encoding:'utf8',timeout:10000});
    if(canvasAX.status===0)note('actual-canvas-keyboard-focus',{focused:JSON.parse(canvasAX.stdout).filter(row=>row.focused)});
    for(const key of ['home','up'])assert.equal(spawnSync(zoomInput,[String(proc.pid),'key',key],{encoding:'utf8',timeout:10000}).status,0,'real Canvas key '+key);
    await until(()=>evaluate(browser,frame,'document.querySelector("#minute-canvas").getAttribute("aria-valuenow")==="60"'),'actual Canvas keyboard updates ARIA minute');
    evidence.minuteCanvas='PASS';evidence.canvasKeyboard='PASS';
    evidence.screenshots.push(await screenshot(browser,side,'real-recorded-minute-canvas'));
    note('real-minute-canvas',{realEntries:true,keyboard:true,ariaMinute:60});
    const hostMs=(s,host)=>Object.values(s.days||{}).reduce(
      (ms,sites)=>ms+(sites[host]||0),0);
    // Install the other real official packages through the existing catalog
    // tab while the genuine Side Panel keeps its Time Review UI mounted.
    // Shared provenance/registry changes must not revoke this tool's identity.
    const beforeOtherTools=await readTime();
    const nativeRoot=(await browser.send('Runtime.evaluate',{expression:'document.querySelector("#sidebar-tool-frame main.review")'},side)).result.objectId;
    assert.ok(nativeRoot,'actual mounted native root handle');
    const priorTargets=new Set((await browser.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
    await nativeClick(browser,side,'#sidebar-tool-open-tab');
    const otherManagerTarget=await until(async()=>
      (await browser.send('Target.getTargets')).targetInfos.find(t=>!priorTargets.has(t.targetId)&&t.type==='page'&&t.url.includes('/ui/tool.html')&&t.url.includes('toolId=time-review')),
      'existing open-tool-in-tab product action');
    const otherManager=(await browser.send('Target.attachToTarget',{targetId:otherManagerTarget.targetId,flatten:true})).sessionId;
    await browser.send('Runtime.enable',{},otherManager);await browser.send('Page.enable',{},otherManager);
    await nativeClick(browser,otherManager,'#sidebar-tool-back');
    for(const toolId of ['reading-toc','cookie-editor','stay-focus']){
      const previouslyInstalled=await evaluate(browser,side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.some(t=>t.id==='+JSON.stringify(toolId)+'))');
      if(await evaluate(browser,otherManager,'document.querySelector("#sidebar-tool-discover-panel").hidden'))
        await nativeClick(browser,otherManager,'#sidebar-tool-discover-toggle');
      await nativeClick(browser,otherManager,'#sidebar-tool-filter-all');
      const button='#sidebar-tool-official-'+toolId+'-install';
      await until(()=>evaluate(browser,otherManager,'Boolean(document.querySelector('+JSON.stringify(button)+'))'),'official '+toolId+' catalog entry');
      if(!previouslyInstalled){
        await nativeClick(browser,otherManager,button);
        await until(()=>evaluate(browser,otherManager,'!document.querySelector("#sidebar-tool-preview").hidden'),'review official '+toolId);
        await nativeClick(browser,otherManager,'#sidebar-tool-install');
      }
      await until(()=>evaluate(browser,side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.some(t=>t.id==='+JSON.stringify(toolId)+'))'),'other official package installed');
      await nativeClick(browser,otherManager,'[data-sidebar-tool-action=open][data-sidebar-tool-id='+toolId+']');
      await nativeClick(browser,otherManager,'#sidebar-tool-settings-open');
      for(const enabled of [false,true]){
        await nativeClick(browser,otherManager,'#sidebar-tool-enable');
        await until(()=>evaluate(browser,side,'chrome.storage.local.get("opendesk.sidebar-tools.enabled.v1").then(v=>(v["opendesk.sidebar-tools.enabled.v1"]?.['+JSON.stringify(toolId)+']!==false)==='+String(enabled)+')'),'other tool lifecycle '+enabled);
        await until(()=>evaluate(browser,otherManager,'!document.querySelector("#sidebar-tool-enable").disabled'),'other lifecycle transaction UI settled');
      }
      const current=await readTime();
      assert.equal(current.paused,false,'other tool install may not pause Time Review');
      assert.equal(current.authorizedHash,beforeOtherTools.authorizedHash);
      assert.equal(current.authorizedEpoch,beforeOtherTools.authorizedEpoch);
      assert.equal((await browser.send('Runtime.callFunctionOn',{objectId:nativeRoot,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},side)).result.value,true,'same native root survives unrelated catalog transaction');
      assert.equal(await evaluate(browser,side,'document.querySelectorAll("#sidebar-tool-frame main.review").length'),1);
      assert.equal(await evaluate(browser,side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0);
      note('unrelated-official-install',{toolId,previouslyInstalled,disableEnable:true,nativeStillMounted:true,authorizationUnchanged:true,paused:false});
      await setTimeReviewSettingsVisible(browser,otherManager,false);
      await nativeClick(browser,otherManager,'#sidebar-tool-back');
      await until(()=>evaluate(browser,otherManager,'document.querySelector("#sidebar-tool-display").hidden'),'return other tool manager list');
      const officialTool=await evaluate(browser,otherManager,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==='+JSON.stringify(toolId)+'))');
      const older={...officialTool,version:'0.0.0',js:officialTool.js+'\n// Reviewed local older-version lifecycle fixture, not an official release.\n'};
      await installReviewedPackage(browser,otherManager,older,'older-'+toolId,zoomInput,proc.pid,note);
      assert.equal((await browser.send('Runtime.callFunctionOn',{objectId:nativeRoot,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},side)).result.value,true,
        'other reviewed version replacement preserves the same Time Review native root');
      if(await evaluate(browser,otherManager,'document.querySelector("#sidebar-tool-discover-panel").hidden'))
        await nativeClick(browser,otherManager,'#sidebar-tool-discover-toggle');
      await nativeClick(browser,otherManager,'#sidebar-tool-filter-all');
      await until(()=>evaluate(browser,otherManager,'document.querySelector("[data-official-tool-id='+toolId+']")?.dataset.installationState==="update"'),'actual other-tool version upgrade available');
      await nativeClick(browser,otherManager,button);
      await until(()=>evaluate(browser,otherManager,'!document.querySelector("#sidebar-tool-preview").hidden'),'review actual official upgrade '+toolId);
      await nativeClick(browser,otherManager,'#sidebar-tool-install');
      const upgraded=await until(()=>evaluate(browser,otherManager,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.market.provenance.v1"]).then(v=>({tool:v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==='+JSON.stringify(toolId)+'),provenance:v["opendesk.market.provenance.v1"]?.['+JSON.stringify(toolId)+']}))')
        .then(row=>row.tool?.version===officialTool.version&&row.provenance?row:null),'actual other official upgrade settles');
      assert.deepEqual(upgraded.tool,officialTool);
      const otherRelease=releaseCatalog.apps.find(row=>row.toolId===toolId);
      assert.deepEqual(upgraded.provenance,{marketId:otherRelease.id,version:otherRelease.version,sha256:otherRelease.sha256});
      const afterUpgrade=await readTime();
      assert.equal(afterUpgrade.paused,false);assert.equal(afterUpgrade.authorizedHash,beforeOtherTools.authorizedHash);
      assert.equal(afterUpgrade.authorizedEpoch,beforeOtherTools.authorizedEpoch);
      assert.equal((await browser.send('Runtime.callFunctionOn',{objectId:nativeRoot,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},side)).result.value,true);
      assert.equal(await evaluate(browser,side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0);
      note('unrelated-official-upgrade',{toolId,fromVersion:older.version,fromSource:'reviewed-local-older-version-fixture',toVersion:officialTool.version,toSource:'actual-official-catalog',nativeRootUnchanged:true,authorizationUnchanged:true,paused:false});
    }
    evidence.unrelatedToolInstall='PASS';
    evidence.unrelatedToolLifecycle='PASS';
    evidence.unrelatedToolUpgrade='PASS';
    await browser.send('Target.closeTarget',{targetId:otherManagerTarget.targetId});
    await browser.send('Target.activateTarget',{targetId:site.targetId});
    const restoredInput=spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000});
    assert.equal(restoredInput.status,0,'actual OS input after catalog installs');
    await nativeClick(browser,frame,'#refresh');
    // Real application focus loss. No mocked windows/idle response is used.
    const beforeBlur=await readTime(),blurAt=Date.now();
    const blur=spawnSync('osascript',['-e','tell application "Finder" to activate'],{encoding:'utf8',timeout:10000});
    if(blur.status!==0){
      evidence.windowFocus='BLOCKED';note('real-window-focus-blocked',{reason:'macOS Finder activation unavailable',status:blur.status});
    }else{
      await until(()=>evaluate(browser,side,'chrome.windows.getLastFocused().then(w=>!w.focused)'),'actual Chrome loses foreground');
      // Allow the real 30s background heartbeat if macOS does not deliver the
      // focus event. This cannot hide overcounting: bound the settled time by
      // the genuine pre-blur observation, then require frozen totals.
      const unfocused=await until(async()=>{const s=await readTime();return s?.checkpoint===null?s:null;},'focus loss retires active checkpoint',36000);
      const observedDelta=hostMs(unfocused,'127.0.0.1')-hostMs(beforeBlur,'127.0.0.1');
      const permittedDelta=Math.max(0,blurAt-(beforeBlur.checkpoint?.at??blurAt))+1000;
      note('focus-retirement-measurement',{observedDelta,permittedDelta,blurAt,checkpointAt:beforeBlur.checkpoint?.at});
      assert.ok(observedDelta<=permittedDelta,'unfocused interval must not become recorded website time');
      await sleep(1400);assert.deepEqual((await readTime()).days,unfocused.days,'unfocused Chrome does not accumulate');
      evidence.windowFocus='PASS';note('real-window-focus',{foreground:false,totalsFrozen:true});
    }
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned CFT foreground after focus test');
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'real input after focus test');
    await nativeClick(browser,frame,'#refresh');
    const beforePanelClose=await until(async()=>{const s=await readTime();return s?.checkpoint?.host==='127.0.0.1'?s:null;},'legal website checkpoint before Side Panel closes');
    const activeSide=(await browser.send('Target.getTargetInfo',{},side)).targetInfo;
    const closed=activeSide?await browser.send('Target.closeTarget',{targetId:activeSide.targetId}).catch(()=>null):null;
    if(closed?.success!==true){
      evidence.panelClosedCollection='BLOCKED';note('panel-close-blocked',{reason:'CFT could not close the owned actual Side Panel target',target:activeSide,closed});
    }else{
      sideSid=null;
      await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.length===0)'),'real Side Panel document closed');
      await browser.send('Target.activateTarget',{targetId:site.targetId});
      await nativeOSClick(browser,websiteSession,'h1',zoomInput,proc.pid);
      const closedBaseline=await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>{const s=v['+JSON.stringify(KEY)+'];return s?.checkpoint?.origin==='+JSON.stringify(approvedOrigin)+'?s:null})'),
        'real background heartbeat starts legal checkpoint with no Side Panel',36000).catch(async cause=>{
          note('panel-closed-checkpoint-not-settled',await evaluate(browser,uiTarget.sessionId,'(async()=>({window:await chrome.windows.getLastFocused(),idle:await chrome.idle.queryState(60),state:(await chrome.storage.local.get('+JSON.stringify(KEY)+'))['+JSON.stringify(KEY)+']}))()'));throw cause;
        });
      assert.equal(spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'real OS activity keeps legal website non-idle during next background heartbeat');
      // Real background heartbeats, observed without Time RPC or SW debugger
      // attachment. An alarm every 30s can keep the SW alive; elapsed waiting
      // is never substituted for an actual running -> stopped -> running trace.
      const quietAt=performance.now();
      const initialWorkerState=workerStates.at(-1)||null;
      const workerSnapshots=[];let lastActivity=quietAt;
      while(performance.now()-quietAt<75000){
        const rows=(await browser.send('Target.getTargets')).targetInfos.filter(row=>row.type==='service_worker'&&row.url==='chrome-extension://'+present+'/sw.js');
        assert.ok(rows.every(row=>row.attached===false),'natural SW observation may not attach its debugger');
        const snapshot={elapsedMs:Math.round(performance.now()-quietAt),targets:rows.map(({targetId,attached})=>({targetId,attached}))};
        if(JSON.stringify(snapshot.targets)!==JSON.stringify(workerSnapshots.at(-1)?.targets))workerSnapshots.push(snapshot);
        if(performance.now()-lastActivity>30000){
          assert.equal(spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'real OS activity during passive background observation');
          lastActivity=performance.now();
        }
        await sleep(250);
      }
      const whileClosed=await evaluate(browser,uiTarget.sessionId,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+'])');
      const sameWorker=row=>row.sessionId===initialWorkerState?.sessionId&&row.registrationId===initialWorkerState?.registrationId&&row.versionId===initialWorkerState?.versionId;
      const naturalTrace=workerStates.filter(row=>row.at>=quietAt&&sameWorker(row));
      const stopped=naturalTrace.findIndex(row=>row.status==='stopped');
      const recoveredNaturally=stopped>=0&&naturalTrace.slice(stopped+1).some(row=>row.status==='running');
      const newWorkerErrors=workerErrors.filter(row=>row.at>=quietAt&&sameWorker(row));
      const crashes=workerCrashes.filter(row=>row.at>=quietAt);
      const registrationDeleted=workerEvents.some(row=>row.at>=quietAt&&row.method==='workerRegistrationUpdated'&&row.params.registrations?.some(reg=>reg.registrationId===initialWorkerState?.registrationId&&reg.isDeleted));
      const versionChanged=workerStates.some(row=>row.at>=quietAt&&row.versionId!==initialWorkerState?.versionId);
      const errorFree=!newWorkerErrors.length&&!crashes.length&&!registrationDeleted&&!versionChanged;
      evidence.naturalSwSleep=workerObserverReady&&initialWorkerState?.registrationId&&initialWorkerState?.versionId&&initialWorkerState.status==='running'&&recoveredNaturally&&errorFree?'PASS':'BLOCKED';
      note('passive-natural-worker-observation',{observerReady:workerObserverReady,initialWorkerState,quietMs:Math.round(performance.now()-quietAt),
        trace:naturalTrace,workerSnapshots,newWorkerErrors,crashes,registrationDeleted,versionChanged,
        noTimeRpcFromDriver:true,noWorkerDebugger:true,noForcedStop:true,heartbeatPeriodMinutes:0.5,recoveryTrigger:'not independently attributed',
        verdict:evidence.naturalSwSleep,reason:evidence.naturalSwSleep==='PASS'?'Actual error-free unforced running/stopped/running; the specific wake event is not claimed':'No proven error-free natural stopped/recovered trace; waiting or target snapshots alone are insufficient'});
      assert.equal(proc.exitCode,null,'same owned Chrome remains alive during natural observation');
      note('panel-closed-observation',await evaluate(browser,uiTarget.sessionId,
        '(async()=>({window:await chrome.windows.getLastFocused(),idle:await chrome.idle.queryState(60),alarm:await chrome.alarms.get('+JSON.stringify(TIME_REVIEW_ALARM)+'),state:(await chrome.storage.local.get('+JSON.stringify(KEY)+'))['+JSON.stringify(KEY)+']}))()'));
      assert.equal(whileClosed.paused,false);assert.equal(whileClosed.checkpoint?.host,'127.0.0.1');
      assert.ok(hostMs(whileClosed,'127.0.0.1')>hostMs(closedBaseline,'127.0.0.1')+500,'background heartbeat records legal time without Side Panel');
      evidence.panelClosedCollection='PASS';note('real-panel-closed-collection',{noSidePanel:true,noTimeRpc:true,ms:hostMs(whileClosed,'127.0.0.1')-hostMs(closedBaseline,'127.0.0.1')});
      await browser.send('Target.activateTarget',{targetId:ui.targetId});
      await nativeClick(browser,uiTarget.sessionId,'#catalog-open-dev-sidebar');
      const reopenedContext=await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.find(x=>x.documentUrl.includes("/ui/tool.html")))'),'Side Panel context after normal reopen');
      const reopenedTarget=await until(async()=>(await browser.send('Target.getTargets')).targetInfos.find(t=>t.url===reopenedContext.documentUrl),'reopened Side Panel target');
      side=(await browser.send('Target.attachToTarget',{targetId:reopenedTarget.targetId,flatten:true})).sessionId;sideSid=side;frame=side;
      await browser.send('Runtime.enable',{},side);await browser.send('Page.enable',{},side);
      await nativeClick(browser,side,'#tab-tools');await nativeClick(browser,side,installed);
      await until(()=>evaluate(browser,side,'Boolean(document.querySelector("#sidebar-tool-frame main.review"))'),'trusted native UI after Panel reopen');
      await browser.send('Target.activateTarget',{targetId:site.targetId});
      assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned foreground after Panel reopen');
      assert.equal(spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'real input after Panel reopen');
    }
    // Two real browser origins: hostname, not path or port, determines
    // Time Review aggregation. The same owned loopback server handles both.
    const otherUrl='http://localhost:'+siteServer.address().port+'/other-activity';
    const otherTab=await browser.send('Target.createTarget',{url:otherUrl});
    const otherWebsite=(await browser.send('Target.attachToTarget',{targetId:otherTab.targetId,flatten:true})).sessionId;
    await browser.send('Runtime.enable',{},otherWebsite);await browser.send('Page.enable',{},otherWebsite);
    await until(()=>evaluate(browser,otherWebsite,'!!document.querySelector("h1")'),'second owned actual HTTP document loaded');
    await nativeOSClick(browser,otherWebsite,'h1',zoomInput,proc.pid);
    const otherLoaded=await until(async()=>{
      const tabs=await evaluate(browser,side,
        'chrome.tabs.query({active:true,lastFocusedWindow:true})');
      return tabs.find(row=>row.url===otherUrl)||null;
    },'second real HTTP(S) tab with distinct localhost hostname',10000).catch(()=>null);
    if(!otherLoaded){
      evidence.multiSite='BLOCKED';
      note('real-multisite-blocked',{reason:'second browser tab did not become active'});
    }else{
      // A distinct Origin is deliberately not covered by the first site's
      // consent. Prove denial before granting it through the existing UI.
      await nativeClick(browser,frame,'#refresh');
      const unapproved=await until(async()=>{const s=await readTime();return s?.checkpoint===null?s:null;},
        'unapproved second Origin has no checkpoint',10000);
      assert.equal(hostMs(unapproved,'localhost'),0);
      await sleep(1500);await nativeClick(browser,frame,'#refresh');
      assert.equal(hostMs(await readTime(),'localhost'),0,'unapproved Origin accrues no time');
      await setTimeReviewSettingsVisible(browser,side,true);
      await nativeClick(browser,side,'#time-review-site-current-open');
      await until(()=>evaluate(browser,side,'!document.querySelector("#time-review-site-confirm").hidden'),'second Origin review');
      await nativeClick(browser,side,'#time-review-site-current-approve');
      await until(async()=>{const s=await readTime();return s?.siteGrants?.origins?.includes(new URL(otherUrl).origin);},'second exact Origin authorized');
      await setTimeReviewSettingsVisible(browser,side,false);
      await browser.send('Target.activateTarget',{targetId:otherTab.targetId});
      await nativeOSClick(browser,otherWebsite,'h1',zoomInput,proc.pid);
      assert.equal(spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'real OS input for second website');
      await nativeClick(browser,frame,'#refresh');
      const onOther=await until(async()=>{
        const s=await readTime();
        return s?.checkpoint?.host==='localhost'?s:null;
      },'actual localhost domain checkpoint after tab switch',11000);
      const previousHostMs=hostMs(onOther,'127.0.0.1');
      await sleep(1600);
      await nativeClick(browser,frame,'#refresh');
      const both=await until(async()=>{
        const s=await readTime();
        return hostMs(s,'127.0.0.1')>=750&&hostMs(s,'localhost')>=750?s:null;
      },'both actual HTTP site totals written without synthetic events',10000);
      assert.equal(hostMs(both,'127.0.0.1'),previousHostMs,
        'first domain must stop accumulating after a different tab is active');
      assert.ok(hostMs(both,'localhost')>0,'second domain independently accumulates');
      evidence.multiSite='PASS';
      note('real-site-switch',{firstHost:'127.0.0.1',firstMs:previousHostMs,
        secondHost:'localhost',secondMs:hostMs(both,'localhost'),separateTotals:true});
      const longHost='very-long-actual-time-review-domain-abcdefghijklmnopqrstuvwxyz.localhost';
      const longUrl='http://'+longHost+':'+siteServer.address().port+'/long-domain';
      const longTab=await browser.send('Target.createTarget',{url:longUrl});
      const longWebsite=(await browser.send('Target.attachToTarget',{targetId:longTab.targetId,flatten:true})).sessionId;
      await browser.send('Runtime.enable',{},longWebsite);await browser.send('Page.enable',{},longWebsite);
      await until(()=>evaluate(browser,longWebsite,'!!document.querySelector("h1")'),'real long localhost domain loads');
      await nativeOSClick(browser,longWebsite,'h1',zoomInput,proc.pid);
      await setTimeReviewSettingsVisible(browser,side,true);await nativeClick(browser,side,'#time-review-site-current-open');
      await until(()=>evaluate(browser,side,'!document.querySelector("#time-review-site-confirm").hidden'),'long exact Origin review');
      await nativeClick(browser,side,'#time-review-site-current-approve');
      await until(async()=>Boolean((await readTime())?.siteGrants?.origins?.includes(new URL(longUrl).origin)),'long exact Origin persisted');
      await setTimeReviewSettingsVisible(browser,side,false);await nativeOSClick(browser,longWebsite,'h1',zoomInput,proc.pid);
      await nativeClick(browser,frame,'#refresh');
      await until(async()=>((await readTime())?.checkpoint?.host===longHost),'real long-domain checkpoint');
      await sleep(900);await nativeClick(browser,frame,'#refresh');
      await until(async()=>hostMs(await readTime(),longHost)>0,'real long domain time persisted');
      await until(()=>evaluate(browser,frame,'document.querySelector("#site-host").textContent==='+JSON.stringify(longHost)),'actual long domain displayed in native UI');
      for(const width of [320,360,400,600]){
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},side);await sleep(150);
        const metrics=await evaluate(browser,side,'(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,host:document.querySelector("#site-host").textContent,canvas:document.querySelector("#minute-canvas").getBoundingClientRect().width}))()');
        assert.equal(metrics.host,longHost);assert.ok(metrics.scroll<=width+1);assert.ok(metrics.canvas>0&&metrics.canvas<=width);
        note('real-long-domain-layout',{...metrics,method:'installed native CSS viewport'});
      }
      await browser.send('Emulation.clearDeviceMetricsOverride',{},side);
      evidence.longDomainLayout='PASS';evidence.screenshots.push(await screenshot(browser,side,'real-long-domain-native'));
      await browser.send('Target.closeTarget',{targetId:longTab.targetId});await browser.send('Target.activateTarget',{targetId:otherTab.targetId});
      await nativeOSClick(browser,otherWebsite,'h1',zoomInput,proc.pid);await nativeClick(browser,frame,'#refresh');
    }

    // Genuine active -> idle -> active: no test writes idle state or fakes
    // service-worker events. CDP read-only queries do not reset OS activity.
    const idleObserved=await until(async()=>{
      const current=await evaluate(browser,side,'chrome.idle.queryState(60)');
      return current==='idle'?true:null;
    },'actual macOS Chrome idle after no real user input',73000).catch(()=>false);
    if(!idleObserved){
      evidence.idleTransition='BLOCKED';
      note('real-idle-blocked',{reason:'macOS CI never reported genuine idle in the observation window'});
    }else{
      const atIdle=await until(async()=>{
        const s=await readTime();return s?.checkpoint===null?s:null;
      },'worker stops active checkpoint in real idle state',7500);
      const preserved=JSON.stringify(atIdle.days);
      await sleep(1800);
      const afterIdle=await readTime();
      assert.equal(JSON.stringify(afterIdle.days),preserved,
        'genuinely idle browser may not accrue active website time');
      const helper=path.join(profile,'time-review-native-activity');
      assert.equal(spawnSync(helper,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned foreground before real idle recovery');
      const pulse=spawnSync(helper,[String(proc.pid),'activity'],{
        encoding:'utf8',timeout:10000
      });
      assert.equal(pulse.status,0,'real macOS CFT input restores idle tracking');
      await until(()=>evaluate(browser,side,'chrome.idle.queryState(60)').then(
        state=>state==='active'), 'Chrome observes genuine resumed macOS input',5000);
      await nativeClick(browser,frame,'#refresh');
      const resumedCheckpoint=await until(async()=>{
        const s=await readTime();return s?.checkpoint?.host==='localhost'&&
          s.checkpoint.origin===new URL(otherUrl).origin?s:null;
      },'real active website checkpoint resumes after idle',8000);
      const resumedHost=resumedCheckpoint.checkpoint.host;
      const prior=hostMs(resumedCheckpoint,resumedHost);
      await sleep(1450);
      await nativeClick(browser,frame,'#refresh');
      // This is a real asynchronous host RPC + verified local storage write.
      // Do not treat the first storage snapshot after the click as final.
      const afterResume=await until(async()=>{
        const s=await readTime();
        return hostMs(s,resumedHost)>prior?s:null;
      },'post-idle website duration persisted after genuine UI refresh',9000)
        .catch(async cause=>{
          const observed=await readTime();
          const idle=await evaluate(browser,side,'chrome.idle.queryState(60)').catch(()=>null);
          note('real-idle-resume-not-settled',{idle,host:resumedHost,
            previousMs:prior,actualMs:hostMs(observed,resumedHost),
            checkpointHost:observed?.checkpoint?.host??null,
            paused:observed?.paused,reason:String(cause)});
          throw cause;
        });
      assert.ok(hostMs(afterResume,resumedHost)>prior,
        'actual post-idle activity, not the idle gap, must accumulate');
      evidence.idleTransition='PASS';
      note('real-idle-transition',{enteredIdle:true,idleTotalsFrozen:true,
        resumedHost,postIdleMs:hostMs(afterResume,resumedHost)-prior});
    }
    await browser.send('Target.closeTarget',{targetId:otherTab.targetId});
    await nativeClick(browser,frame,'#pause');
    const paused=await until(async()=>{const s=await readTime();return s.paused?s:null;},'user pause',8000);
    await sleep(1500);await nativeClick(browser,frame,'#refresh');
    assert.equal(total(await readTime()),total(paused),'paused time never accumulates');
    evidence.pauseResume='PARTIAL';
    note('real-pause',{ms:total(paused)});
    const reopenTimePanel=async()=>{
      await browser.send('Target.activateTarget',{targetId:ui.targetId});
      await nativeClick(browser,uiTarget.sessionId,'#catalog-open-dev-sidebar');
      const context=await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.find(x=>x.documentUrl.includes("/ui/tool.html")))'),'actual Side Panel context after lifecycle observation');
      const target=await until(async()=>(await browser.send('Target.getTargets')).targetInfos.find(row=>row.url===context.documentUrl),'actual reopened Side Panel target');
      side=(await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
      sideSid=side;frame=side;
      await browser.send('Runtime.enable',{},side);await browser.send('Page.enable',{},side);
      await until(()=>evaluate(browser,side,'!!document.querySelector('+JSON.stringify(installed)+')'),'Time Review installed row after reopen');
      await nativeClick(browser,side,installed);
      await until(()=>evaluate(browser,side,'!!document.querySelector("main.review")&&!document.querySelector("#sidebar-tool-frame iframe")'),'same official native Time Review after lifecycle observation');
    };
    // A running 30s heartbeat need not permit idle shutdown. Exercise natural
    // sleep through genuine pause and panel closure, without disabling alarms
    // or touching the durable data. Keep only the passive manager observer.
    const pausedVersion=workerStates.at(-1),pausedQuietAt=performance.now();
    const pausedSide=(await browser.send('Target.getTargetInfo',{},side)).targetInfo;
    assert.equal((await browser.send('Target.closeTarget',{targetId:pausedSide.targetId})).success,true);
    sideSid=null;
    await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.length===0)'),'paused Side Panel really closed');
    await browser.send('Target.activateTarget',{targetId:site.targetId});
    await nativeOSClick(browser,websiteSession,'h1',zoomInput,proc.pid);
    const samePausedWorker=row=>row.sessionId===pausedVersion?.sessionId&&row.registrationId===pausedVersion?.registrationId&&row.versionId===pausedVersion?.versionId;
    const pausedSnapshots=[];
    const pausedWaitAt=performance.now();
    while(performance.now()-pausedWaitAt<45000){
      const rows=(await browser.send('Target.getTargets')).targetInfos.filter(row=>row.type==='service_worker'&&row.url==='chrome-extension://'+present+'/sw.js');
      assert.ok(rows.every(row=>row.attached===false),'paused natural observation may not attach its debugger');
      const targets=rows.map(({targetId,attached})=>({targetId,attached}));
      if(JSON.stringify(targets)!==JSON.stringify(pausedSnapshots.at(-1)?.targets))pausedSnapshots.push({at:performance.now(),targets});
      await sleep(250);
    }
    const pausedStop=workerStates.find(row=>row.at>=pausedQuietAt&&samePausedWorker(row)&&row.status==='stopped');
    await reopenTimePanel();
    const pausedRunning=await until(()=>workerStates.find(row=>row.at>(pausedStop?.at??Infinity)&&samePausedWorker(row)&&row.status==='running'),
      'actual same paused worker runs after natural stop',3000).catch(()=>null);
    const afterNaturalPause=await readTime();
    for(const key of ['days','minuteDays','categories','settings','siteGrants','minuteConsent','authorizedHash','authorizedEpoch'])
      assert.deepEqual(afterNaturalPause[key],paused[key],'natural paused recovery preserves '+key);
    assert.equal(afterNaturalPause.paused,true);assert.equal(afterNaturalPause.checkpoint,null);
    const pausedErrors=workerErrors.filter(row=>row.at>=pausedQuietAt&&samePausedWorker(row));
    const pausedCrashes=workerCrashes.filter(row=>row.at>=pausedQuietAt);
    const pausedVersionChanged=workerStates.some(row=>row.at>=pausedQuietAt&&row.versionId!==pausedVersion?.versionId);
    const pausedRegistrationDeleted=workerEvents.some(row=>row.at>=pausedQuietAt&&row.method==='workerRegistrationUpdated'&&row.params.registrations?.some(reg=>reg.registrationId===pausedVersion?.registrationId&&reg.isDeleted));
    const pausedNatural=workerObserverReady&&pausedVersion?.status==='running'&&pausedStop&&pausedRunning&&!pausedErrors.length&&!pausedCrashes.length&&!pausedVersionChanged&&!pausedRegistrationDeleted;
    if(pausedNatural)evidence.naturalSwSleep='PASS';
    note('paused-natural-worker-observation',{initialVersion:pausedVersion,pausedStop,pausedRunning,pausedSnapshots,pausedErrors,pausedCrashes,pausedVersionChanged,pausedRegistrationDeleted,
      genuinePause:true,panelClosed:true,noTimeRpcInWait:true,noForcedStop:true,noWorkerDebugger:true,recoveryTrigger:'not independently attributed',historyAndAuthorityPreserved:true,pausedAndCheckpointNull:true,
      verdict:pausedNatural?'PASS':'BLOCKED',reason:pausedNatural?'Same worker genuinely stopped and recovered with unchanged paused history':'No independently proven error-free stopped/running chain while genuinely paused'});
    // In Chrome 155 the ServiceWorker CDP domain is not exposed on the
    // root Browser connection. First close the one observed extension worker
    // target; fall back to the page-session domain only in this owned profile.
    // A plain CDP detach is NOT a restart and cannot be reported as PASS.
    const swBefore=(await browser.send('Target.getTargets')).targetInfos.filter(x=>
      x.type==='service_worker'&&x.url?.endsWith('/sw.js'));
    const oldSw=swBefore.length===1?swBefore[0]:null;
    let stopConfirmed=false,stopMethod=null;
    const stopErrors=[];
    if(oldSw)try{
      const response=await browser.send('Target.closeTarget',{targetId:oldSw.targetId});
      stopConfirmed=response?.success===true;
      if(stopConfirmed)stopMethod='Target.closeTarget';
    }catch(e){stopErrors.push('Target.closeTarget: '+String(e).slice(0,180));}
    if(oldSw&&!stopConfirmed)for(const session of [side,uiTarget.sessionId])try{
      await browser.send('ServiceWorker.enable',{},session);
      await browser.send('ServiceWorker.stopAllWorkers',{},session);
      stopConfirmed=true;stopMethod='ServiceWorker.stopAllWorkers in page session';break;
    }catch(e){stopErrors.push('ServiceWorker page session: '+String(e).slice(0,180));}
    if(!stopConfirmed){
      evidence.swRestart='BLOCKED';
      note('worker-stop-blocked',{reason:'CFT did not expose a supported isolated worker termination method',
        count:swBefore.length,errors:stopErrors});
    }else{
      await nativeClick(browser,frame,'#refresh');
      const swAfter=await until(async()=>{
        const rows=(await browser.send('Target.getTargets')).targetInfos;
        return rows.find(row=>row.type==='service_worker'&&row.url?.endsWith('/sw.js')&&row.targetId!==oldSw.targetId)||null;
      },'real replacement extension service worker target',12000).catch(()=>null);
      if(!swAfter){
        evidence.swRestart='BLOCKED';
        note('worker-restart-not-confirmed',{method:stopMethod,oldTarget:oldSw.targetId});
      }else{
        const recovered=await until(async()=>{const s=await readTime();return s?.paused?s:null;},
          'durable paused state after actual worker replacement',12000);
        assert.equal(total(recovered),total(paused),'worker restart must preserve durable website totals');
        evidence.swRestart='PASS';
        note('real-service-worker-restart',{ms:total(recovered),method:stopMethod,
          targetChanged:swAfter.targetId!==oldSw.targetId});
      }
    }
    await setTimeReviewSettingsVisible(browser,side,false);
    await nativeClick(browser,frame,'#start');
    const resumed=await until(async()=>{const s=await readTime();return s&&!s.paused?s:null;},'trusted resume',10000);
    evidence.pauseResume='PASS';note('real-resume',{paused:resumed.paused});
    // Independently exercise an ACTIVE checkpoint across a real SW stop and
    // a real foreground loss. This is forced recovery, never natural sleep.
    await browser.send('Target.activateTarget',{targetId:site.targetId});
    await nativeOSClick(browser,websiteSession,'h1',zoomInput,proc.pid);
    await nativeClick(browser,frame,'#refresh');
    const liveBeforeStop=await until(async()=>{const s=await readTime();return s?.checkpoint?.origin===approvedOrigin&&!s.paused?s:null;},'active checkpoint before real SW stop');
    const activeHost=new URL(approvedOrigin).hostname;
    assert.equal(liveBeforeStop.checkpoint.host,activeHost,'checkpoint host must match the actual approved Origin');
    const pollingSide=(await browser.send('Target.getTargetInfo',{},side)).targetInfo;
    assert.equal((await browser.send('Target.closeTarget',{targetId:pollingSide.targetId})).success,true,'close polling tool UI before active recovery observation');
    sideSid=null;
    await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.length===0)'),'active tool polling document retired');
    const activeWorker=(await browser.send('Target.getTargets')).targetInfos.find(row=>row.type==='service_worker'&&row.url==='chrome-extension://'+present+'/sw.js');
    assert.ok(activeWorker,'actual owned active SW target');
    const activeVersion=workerStates.at(-1),stopAt=performance.now();
    const sameActiveWorker=row=>row.sessionId===activeVersion?.sessionId&&row.registrationId===activeVersion?.registrationId&&row.versionId===activeVersion?.versionId;
    assert.equal((await browser.send('Target.closeTarget',{targetId:activeWorker.targetId})).success,true,'real stop of active SW');
    const confirmedStop=await until(()=>workerStates.find(row=>row.at>=stopAt&&sameActiveWorker(row)&&row.status==='stopped'),
      'passive confirmation of real active SW stop',3000).catch(()=>null);
    const activeBlurAt=Date.now();
    await new Promise((resolve,reject)=>execFile('osascript',['-e','tell application "Finder" to activate'],{encoding:'utf8',timeout:10000},error=>error?reject(error):resolve()));
    await until(()=>evaluate(browser,uiTarget.sessionId,'chrome.windows.getLastFocused().then(w=>!w.focused)'),'owned Chrome truly unfocused during active recovery');
    const confirmedBlurAt=performance.now();
    const confirmedRecovery=await until(()=>workerStates.find(row=>row.at>=stopAt&&sameActiveWorker(row)&&row.status==='running'),
      'passive confirmation of actual active worker recovery',12000).catch(()=>null);
    const recoveredActive=await until(async()=>{const s=await readTime();return s?.checkpoint===null&&!s.paused?s:null;},'active recovery retires the now-unfocused checkpoint');
    assert.equal(recoveredActive.authorizedHash,liveBeforeStop.authorizedHash);assert.equal(recoveredActive.authorizedEpoch,liveBeforeStop.authorizedEpoch);
    for(const day of new Set([...Object.keys(liveBeforeStop.days),...Object.keys(recoveredActive.days)])){
      const before=liveBeforeStop.days[day]||{},after=recoveredActive.days[day]||{};
      for(const host of new Set([...Object.keys(before),...Object.keys(after)])){
        assert.ok((after[host]||0)>=(before[host]||0),'active recovery preserves every earned day/host bucket');
        if(host!==activeHost)assert.equal(after[host]||0,before[host]||0,'active recovery may not accrue another host');
      }
    }
    const activeRecoveryDelta=hostMs(recoveredActive,activeHost)-hostMs(liveBeforeStop,activeHost);
    const activeRecoveryLimit=Math.max(0,activeBlurAt-liveBeforeStop.checkpoint.at)+1000;
    assert.ok(activeRecoveryDelta>=0&&activeRecoveryDelta<=activeRecoveryLimit,'worker recovery preserves history without manufacturing unfocused time');
    await sleep(1500);assert.deepEqual((await readTime()).days,recoveredActive.days,'unfocused recovered worker keeps history frozen');
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activate'],{encoding:'utf8',timeout:10000}).status,0,'owned foreground after active SW recovery');
    assert.equal(spawnSync(zoomInput,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'genuine activity after active SW recovery');
    await reopenTimePanel();
    await browser.send('Target.activateTarget',{targetId:site.targetId});await nativeClick(browser,frame,'#refresh');
    const freshActive=await until(async()=>{const s=await readTime();return s?.checkpoint?.origin===approvedOrigin&&!s.paused?s:null;},'active recovery begins a fresh legal observation');
    assert.equal(freshActive.authorizedHash,liveBeforeStop.authorizedHash);
    await sleep(900);await nativeClick(browser,frame,'#refresh');
    await until(async()=>hostMs(await readTime(),activeHost)>hostMs(freshActive,activeHost),'only new legal post-recovery activity persists');
    const ordered=confirmedStop&&confirmedRecovery&&confirmedRecovery.at>confirmedBlurAt&&confirmedStop.at<confirmedBlurAt;
    evidence.activeSwRecovery=ordered?'PASS':'BLOCKED';
    note('real-active-worker-recovery',{method:'Target.closeTarget',natural:false,activeVersion,confirmedStop,confirmedBlurAt,confirmedRecovery,
      authorizationPreserved:true,allHistoryBucketsPreserved:true,unfocusedHistoryFrozen:true,observedDelta:activeRecoveryDelta,permittedDelta:activeRecoveryLimit,freshObservation:true,
      verdict:evidence.activeSwRecovery,reason:ordered?'Real stopped/unfocused/running order observed':'Recovery ordering scenario not proven; target ID change alone is insufficient'});

    // R1.5: remove the *tool's own* site grant while Chrome idle permission
    // remains intact. The trusted button is clicked by actual Chrome input.
    // This must retire the live interval without deleting already earned time.
    await setTimeReviewSettingsVisible(browser,side,true);
    const beforeSiteRevocation=await readTime();
    await nativeClick(browser,side,'#time-review-site-all-revoke');
    const siteWithdrawn=await until(async()=>{
      const item=await readTime();
      return item?.siteGrants?.allSites===false&&item.siteGrants.origins.length===0&&
        item.paused===true&&item.authorizedHash===null&&item.checkpoint===null?item:null;
    },'independent website consent revocation',12000);
    assert.equal(await evaluate(browser,side,
      'chrome.permissions.contains({permissions:["idle"]})'),true,
      'website-level Time Review consent must not silently remove Chrome idle permission');
    assert.ok(total(siteWithdrawn)>=total(beforeSiteRevocation),
      'revoking a site must retain all legally settled historical time');
    await setTimeReviewSettingsVisible(browser,side,false);
    await nativeClick(browser,frame,'#start');
    await until(()=>evaluate(browser,side,
      'document.querySelector("#sidebar-tool-display")?.dataset.timeReviewInline==="true"'),
      'native start reveals required site consent',10000);
    const denied=await readTime();
    assert.equal(denied.paused,true);assert.equal(denied.checkpoint,null);
    assert.deepEqual(denied.days,siteWithdrawn.days,
      'failed start without website consent must not write new time');
    await browser.send('Target.activateTarget',{targetId:site.targetId});
    await nativeOSClick(browser,websiteSession,'h1',zoomInput,proc.pid);
    await until(()=>evaluate(browser,side,'chrome.windows.getLastFocused().then(w=>w.focused)'),
      'owned legal website focused before a new consent review');
    await nativeClick(browser,side,'#time-review-site-current-open');
    await until(()=>evaluate(browser,side,
      '!document.querySelector("#time-review-site-confirm").hidden'),
      'new reviewed website consent',10000);
    await nativeClick(browser,side,'#time-review-site-current-approve');
    await until(async()=>{
      const item=await readTime();
      return item?.siteGrants?.origins?.includes(approvedOrigin)?item:null;
    },'new independent site grant committed',10000);
    await setTimeReviewSettingsVisible(browser,side,false);
    await nativeClick(browser,frame,'#start');
    await until(async()=>{const item=await readTime();return item&&!item.paused?item:null;},
      'explicit restart after site permission recovery',10000);
    evidence.websiteGrantRevocation='PASS';
    note('real-site-authorization-revocation',{chromeIdleRetained:true,checkpointRetired:true,
      unauthorizedRestartDenied:true,historyPreserved:true,regrantExplicit:true});

    // Revoke the actual optional Chrome idle permission during an authorized
    // running session through the trusted Side Panel UI, never through a
    // synthetic permissions event or direct storage mutation.
    await setTimeReviewSettingsVisible(browser,side,true);
    await nativeClick(browser,side,'#time-review-revoke-idle');
    const revoked=await until(async()=>{
      const allowed=await evaluate(browser,side,'chrome.permissions.contains({permissions:["idle"]})');
      const s=await readTime();
      return allowed===false&&s?.paused===true&&s.authorizedHash===null&&
        s.authorizedEpoch===null&&s.checkpoint===null?s:null;
    },'actual idle revocation retires authorization and active checkpoint',12000);
    const alarmActive=await evaluate(browser,side,
      'chrome.alarms.get("opendesk.time-review.heartbeat.v1").then(Boolean)');
    assert.equal(alarmActive,false,'revocation must retire the background heartbeat');

    // Even a second genuine Start click is forbidden until the user regrants
    // Chrome idle permission. Assert a visible rejection, not merely a paused
    // snapshot that could precede a late unauthorized write.
    await setTimeReviewSettingsVisible(browser,side,false);
    await nativeClick(browser,frame,'#start');
    await until(()=>evaluate(browser,side,
      'document.querySelector("#sidebar-tool-display")?.dataset.timeReviewInline==="true"'),
      'native start reveals required idle permission',10000);
    await setTimeReviewSettingsVisible(browser,side,false);
    await nativeClick(browser,frame,'#refresh');
    await sleep(1500);
    const stillRevoked=await readTime();
    assert.equal(stillRevoked.paused,true);
    assert.equal(stillRevoked.authorizedHash,null);
    assert.equal(stillRevoked.checkpoint,null);
    assert.deepEqual(stillRevoked.days,revoked.days,
      'removing Chrome idle permission must not accrue unobserved website time');
    evidence.idlePermissionRevocation='PASS';
    note('real-idle-permission-revocation',{chromePermissionRemoved:true,
      revokedHash:true,checkpointRetired:true,heartbeatRetired:true,
      unauthorizedRestartDenied:true,daysPreserved:true});
    }
    await browser.send('Target.closeTarget',{targetId:site.targetId});
  }
  // Change the category via the actual trusted Side Panel UI: native pointer
  // focus, native arrow-key selection and the normal Save button. Neither the
  // test nor CDP may write Time Review business records directly.
  if(evidence.beginAndActiveCollection==='PASS'){
    await nativeClick(browser,frame,'#refresh');
    await until(()=>evaluate(browser,frame,
      'Array.from(document.querySelectorAll("#sites .detail-item .entry b")).some(e=>e.textContent==="127.0.0.1")'),
      'real website displayed in the daily records',9000);
    const beforeCategory=await readTime();
    const matchingSiteIndex=await evaluate(browser,frame,
      'Array.from(document.querySelectorAll("#sites .detail-item")).findIndex(e=>e.querySelector(".entry b")?.textContent==="127.0.0.1")');
    assert.ok(Number.isInteger(matchingSiteIndex)&&matchingSiteIndex>=0,
      'edit the intended recorded domain even when multiple sites reorder');
    const rowSelector='#sites .detail-item:nth-child('+(matchingSiteIndex+1)+')';
    await nativeClick(browser,frame,rowSelector+' button[aria-label^="修改"]');
    const selector=rowSelector+' .row-edit select';
    await nativeOSClick(browser,frame,selector,zoomInput,proc.pid);
    // macOS select popovers consume OS-level key events, not OOPIF CDP
    // Input.dispatchKeyEvent. Use the existing owned/AX-authorized CFT helper:
    // genuine keyboard input, never a synthetic DOM value assignment.
    const nativeKeyboard=path.join(profile,'time-review-native-activity');
    if(!await stat(nativeKeyboard).catch(()=>null)){
      const compile=spawnSync('swiftc',[
        path.resolve('tests/framework/time-review-native-input.swift'),'-o',nativeKeyboard
      ],{encoding:'utf8',timeout:80000});
      assert.equal(compile.status,0,'owned macOS keyboard helper compile: '+String(compile.stderr).slice(-400));
    }
    for(const key of ['home','down','down','return']){
      const input=spawnSync(nativeKeyboard,[String(proc.pid),'key',key],{
        encoding:'utf8',timeout:10000});
      assert.equal(input.status,0,'real Mac CFT key '+key+': '+String(input.stdout||input.stderr).slice(-300));
    }
    await until(()=>evaluate(browser,frame,
      'document.querySelector('+JSON.stringify(selector)+')?.value==="2"'),
      'native OS keyboard selected important-not-urgent category',6000);
    await nativeClick(browser,frame,rowSelector+' .row-edit button.primary');
    const afterCategory=await until(async()=>{
      const s=await readTime();
      return s?.categories?.['127.0.0.1']===2?s:null;
    },'real category edit saved through installed tool',9000);
    assert.deepEqual(afterCategory.days,beforeCategory.days,
      'classification may not rewrite or fabricate captured time');
    const row=await evaluate(browser,frame,
      'Array.from(document.querySelectorAll("#sites .detail-item")).find(e=>e.textContent.includes("127.0.0.1"))?.textContent||""');
    assert.ok(row.includes('重要不紧急'),'updated classification appears in native UI');
    evidence.classification='PASS';
    note('real-classification',{host:'127.0.0.1',category:2,
      unchangedTime:true,visible:true});
    const todayLabel=await evaluate(browser,frame,'document.querySelector("#date-label").textContent');
    await nativeClick(browser,frame,'#prev-date');
    await until(()=>evaluate(browser,frame,'document.querySelector("#date-label").textContent!=='+JSON.stringify(todayLabel)),'previous real date displayed');
    await until(()=>evaluate(browser,frame,'document.querySelector("#today-total").textContent==="0秒"'),'unvisited historical day remains empty');
    await nativeClick(browser,frame,'#next-date');
    await until(()=>evaluate(browser,frame,'document.querySelector("#date-label").textContent==='+JSON.stringify(todayLabel)),'return to current real date');
    await nativeClick(browser,frame,'#week');
    await until(()=>evaluate(browser,frame,'document.querySelector("#week").getAttribute("aria-pressed")==="true"&&!document.querySelector("#daily-section").hidden&&document.querySelectorAll("#daily li").length>0'),'real seven-day records and ranking');
    await nativeClick(browser,frame,'#today');
    await until(()=>evaluate(browser,frame,'document.querySelector("#today").getAttribute("aria-pressed")==="true"'),'return to selected date ranking');
    evidence.historyNavigation='PASS';note('real-history-navigation',{previousEmptyDay:true,currentDayRestored:true,weekRecords:true,ranking:true});
  }else evidence.classification='NOT_TESTED';
  state=await readTime();
  // The initial exports were intentionally empty. Check actual subsequent
  // JSON/CSV after a trusted real website session, including name uniquify.
  if(evidence.beginAndActiveCollection==='PASS'){
    assert.ok(state.paused);
    assert.ok(Object.values(state.days).some(sites=>(sites['127.0.0.1']||0)>0));
    if(!await evaluate(browser,frame,'document.querySelector("#settings").open'))
      await nativeClick(browser,frame,'#settings summary');
    for(const [format,selector] of [['json','#export-json'],['csv','#export-csv']]){
      const previous=new Set((await readDownloads()).map(row=>row.id));
      await nativeClick(browser,frame,selector);
      const done=await until(async()=>{
        const rows=await readDownloads();
        return rows.find(row=>!previous.has(row.id)&&row.state==='complete')||null;
      },'populated '+format+' download',20000);
      const file=path.resolve(done.filename||'');
      assert.equal(path.dirname(file),path.resolve(downloads),'never inspect outside owned directory');
      assert.match(path.basename(file),new RegExp('^time-review \\(\\d+\\)\\.'+format+'$'));
      const contents=await readFile(file,'utf8');
      await writeFile(path.join(OUT,'download-populated.'+format),contents);
      if(format==='json'){
        const parsed=JSON.parse(contents);
        assert.equal(parsed.format,'opendesk.time-review.export.v1');
        for(const key of ['days','categories','minuteDays','settings'])
          assert.deepEqual(parsed[key],state[key],'populated '+format+' '+key);
        assert.equal(parsed.minuteConsent,state.minuteConsent);
        assert.equal(parsed.discardedMs,state.discardedMs);
      }else assert.equal(contents,reviewExport(state,'csv').text);
      note('populated-export',{format,filename:path.basename(file),bytes:Buffer.byteLength(contents),
        sha256:createHash('sha256').update(contents).digest('hex'),actualWebsiteTime:true});
    }
    evidence.populatedExport='PASS';
  }else evidence.populatedExport='NOT_TESTED';

  // Test a truly new browser PROCESS on the same uniquely owned profile.
  // All writes to Time Review storage remain exclusively product-initiated.
  const oldState=structuredClone(state);
  const oldSession=await evaluate(browser,side,
    'chrome.storage.session.get("opendesk.time-review.session.v1").then(v=>v["opendesk.time-review.session.v1"]||null)');
  const portPath=path.join(profile,'DevToolsActivePort');
  const oldPort=await readFile(portPath,'utf8').catch(()=>null);
  const oldBrowser=browser;
  await oldBrowser.send('Browser.close').catch(()=>{});
  oldBrowser.close();browser=null;sideSid=null;frameSid=null;
  await until(()=>proc.exitCode!==null||proc.signalCode!==null,
    'original Chrome PID exit before reusing Profile',15000);
  await sleep(350);
  restartProc=spawn(BIN,args,{stdio:['ignore','ignore','pipe']});
  restartProc.stderr.on('data',data=>{stderr=(stderr+String(data)).slice(-3500);});
  const port=await until(async()=>{
    const raw=await readFile(portPath,'utf8').catch(()=>null);
    if(!raw||raw===oldPort)return null;
    const number=Number(raw.split('\n')[0]);return number>0?number:null;
  },'new CFT CDP port on same Profile',30000);
  const nextVersion=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  assert.equal(nextVersion.Browser,version.Browser,'same pinned CFT binary');
  browser=cdp(nextVersion.webSocketDebuggerUrl);await browser.ready;
  const reopened=await browser.send('Target.createTarget',{
    url:'chrome-extension://'+present+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const newSide=(await browser.send('Target.attachToTarget',{
    targetId:reopened.targetId,flatten:true})).sessionId;
  await browser.send('Runtime.enable',{},newSide);await browser.send('Page.enable',{},newSide);
  const persisted=await until(async()=>evaluate(browser,newSide,
    '(async()=>{const rows=(await chrome.storage.local.get("opendesk.sidebar-tools.installed.v1"))["opendesk.sidebar-tools.installed.v1"];const review=(await chrome.storage.local.get("opendesk.time-review.v1"))["opendesk.time-review.v1"];return {extensionId:chrome.runtime.id,version:rows?.find(t=>t.id==="time-review")?.version||null,review:review||null};})()'),
    'installed Time Review and durable data after whole Chrome restart',15000);
  assert.equal(persisted.extensionId,present,'same installed extension after restart');
  assert.equal(persisted.version,pkg.version,'installed Time Review retained');
  assert.ok(persisted.review?.paused,'paused state retained after restart');
  for(const key of ['days','categories','minuteDays'])
    assert.deepEqual(persisted.review[key],oldState[key],'durable '+key+' across Chrome restart');
  assert.equal(persisted.review.minuteConsent,oldState.minuteConsent);
  const newSession=await until(()=>evaluate(browser,newSide,
    'chrome.storage.session.get("opendesk.time-review.session.v1").then(v=>v["opendesk.time-review.session.v1"]||null)'),
    'new browser session identity after Chrome restart',15000);
  assert.ok(oldSession&&newSession&&oldSession!==newSession,
    'entire Chrome restart must replace the per-browser session UUID');
  evidence.browserRestart=evidence.beginAndActiveCollection==='PASS'?'PASS':'PARTIAL';
  evidence.browserRestartScope='paused genuine website totals, same owned Profile';
  note('real-chrome-restart',{previousPid:proc.pid,newPid:restartProc.pid,
    sameProfile:true,sessionChanged:true,toolVersion:persisted.version,
    days:Object.keys(persisted.review.days).length,paused:persisted.review.paused});
  // Real trusted UI lifecycle after the full Chrome restart. Confirm
  // disabling rotates the tool's installation epoch without deleting time
  // records, re-enabling does not auto-resume, and confirmed uninstall clears
  // ONLY Time Review and does not resurrect stale data.
  // The blank /ui/tool.html extension TAB is the official catalog surface;
  // its workbench navigation is intentionally hidden. Reopen the *real*
  // SIDE_PANEL through its visible "打开开发侧栏" button and trusted native
  // pointer input rather than pretending the catalog tab is a Side Panel.
  await nativeClick(browser,newSide,'#catalog-open-dev-sidebar');
  const restoredSideContext=await until(async()=>{
    const contexts=await evaluate(browser,newSide,
      'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return contexts.find(c=>c.documentId&&c.documentUrl?.includes('/ui/tool.html'))||null;
  },'original native Side Panel reopens after Chrome restart',12000);
  const restoredSideTarget=await until(async()=>{
    const targets=(await browser.send('Target.getTargets')).targetInfos;
    return targets.find(t=>t.url===restoredSideContext.documentUrl)||null;
  },'real restarted Side Panel target',12000);
  const manager=(await browser.send('Target.attachToTarget',{
    targetId:restoredSideTarget.targetId,flatten:true})).sessionId;
  sideSid=manager;
  await browser.send('Runtime.enable',{},manager);
  await browser.send('Page.enable',{},manager);
  evidence.realSidePanelReopened='PASS';
  note('real-sidepanel-reopened-after-chrome-restart',{
    ownSidePanel:true,documentId:restoredSideContext.documentId,
    targetId:restoredSideTarget.targetId});
  await nativeClick(browser,manager,'#tab-tools');
  const readOtherPackage=()=>evaluate(browser,manager,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="reading-toc")||null)');
  if(!await readOtherPackage()){
    if(await evaluate(browser,manager,'document.querySelector("#sidebar-tool-discover-panel").hidden'))
      await nativeClick(browser,manager,'#sidebar-tool-discover-toggle');
    await nativeClick(browser,manager,'#sidebar-tool-filter-all');
    await nativeClick(browser,manager,'#sidebar-tool-official-reading-toc-install');
    await until(()=>evaluate(browser,manager,'!document.querySelector("#sidebar-tool-preview").hidden'),'independent Reading TOC review');
    await nativeClick(browser,manager,'#sidebar-tool-install');await until(readOtherPackage,'Reading TOC installed before selective uninstall');
  }
  const preservedOtherPackage=await readOtherPackage();
  await nativeClick(browser,manager,installed);
  await until(()=>evaluate(browser,manager,
    '!document.querySelector("#sidebar-tool-display").hidden'),'reopened installed tool');
  await setTimeReviewSettingsVisible(browser,manager,true);
  await until(()=>evaluate(browser,manager,
    '!document.querySelector("#sidebar-tool-settings-view").hidden'),'trusted tool management');
  const epoch=()=>evaluate(browser,manager,
    'chrome.storage.local.get("opendesk.sidebar-tools.revocation-epochs.v1").then(v=>v["opendesk.sidebar-tools.revocation-epochs.v1"]?.["time-review"]??null)');
  const toolEnabled=()=>evaluate(browser,manager,
    'chrome.storage.local.get("opendesk.sidebar-tools.enabled.v1").then(v=>v["opendesk.sidebar-tools.enabled.v1"]?.["time-review"]!==false)');
  const beforeDisableEpoch=await epoch();
  await nativeClick(browser,manager,'#sidebar-tool-enable');
  await until(async()=>!await toolEnabled(),'trusted disable persisted',10000);
  const disabledEpoch=await epoch();
  assert.ok(disabledEpoch&&disabledEpoch!==beforeDisableEpoch,'disable must rotate revoked instance identity');
  const disabledData=await evaluate(browser,manager,
    'chrome.storage.local.get("opendesk.time-review.v1").then(v=>v["opendesk.time-review.v1"])');
  assert.deepEqual(disabledData.days,persisted.review.days,'disabling preserves existing recorded days');
  assert.equal(disabledData.paused,true,'disable must remain paused');
  await until(()=>evaluate(browser,manager,'!document.querySelector("#sidebar-tool-frame main.review")'),'old trusted UI retired after own disable');
  await nativeClick(browser,manager,'#sidebar-tool-enable');
  await until(toolEnabled,'trusted re-enable persisted',10000);
  assert.notEqual(await epoch(),disabledEpoch,'re-enable also rotates revoked instance identity');
  const enabledData=await evaluate(browser,manager,
    'chrome.storage.local.get("opendesk.time-review.v1").then(v=>v["opendesk.time-review.v1"])');
  assert.equal(enabledData.paused,true,'enabling tool does not silently start tracking');
  evidence.disableEnable='PASS';
  note('real-tool-disable-reenable',{rotatedEpoch:true,daysPreserved:true,noAutoStart:true});
  await nativeClick(browser,manager,'#sidebar-tool-remove');
  await nativeClick(browser,manager,'#sidebar-tool-inline-remove-confirm');
  const readUninstallState=()=>evaluate(browser,manager,
    '(async()=>{const x=await chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.time-review.v1","opendesk.sidebar-tools.uninstall-cleanup.v1"]);const rows=x["opendesk.sidebar-tools.installed.v1"];return {timeInstalled:rows?.some(t=>t.id==="time-review"),otherInstalled:rows?.some(t=>t.id==="reading-toc"),reviewPresent:Object.hasOwn(x,"opendesk.time-review.v1"),cleanup:x["opendesk.sidebar-tools.uninstall-cleanup.v1"]?.["time-review"]??null};})()');
  // Returning a truthy object was not evidence of a completed removal.
  // Require every durable condition before marking the native case PASS.
  const afterUninstall=await until(async()=>{
    const row=await readUninstallState();
    return row?.timeInstalled===false&&row.reviewPresent===false&&row.cleanup===null?row:null;
  },'confirmed uninstall and complete selective Time Review cleanup',12000).catch(async error=>{
    const current=await readUninstallState().catch(()=>null);
    note('uninstall-not-settled',{state:current,error:String(error)});
    throw error;
  });
  assert.equal(afterUninstall.timeInstalled,false,'official Time Review uninstall completed');
  assert.equal(afterUninstall.reviewPresent,false,'uninstall removed Time Review local record');
  assert.equal(afterUninstall.cleanup,null,'cleanup transaction has no pending state');
  assert.equal(afterUninstall.otherInstalled,true,'previously installed Reading TOC must remain intact');
  assert.deepEqual(await readOtherPackage(),preservedOtherPackage,'selective uninstall preserves exact other package identity');
  await sleep(1300);
  assert.equal(await evaluate(browser,manager,
    'chrome.storage.local.get("opendesk.time-review.v1").then(v=>Object.hasOwn(v,"opendesk.time-review.v1"))'),false,
    'stale worker events may not resurrect uninstalled Time Review data');
  evidence.uninstall='PASS';
  note('real-tool-uninstall',{selective:true,recordDeleted:true,othersIntact:true,noResurrection:true});
  if(await evaluate(browser,manager,'document.querySelector("#sidebar-tool-discover-panel").hidden'))
    await nativeClick(browser,manager,'#sidebar-tool-discover-toggle');
  await nativeClick(browser,manager,'#sidebar-tool-official-time-review-install');
  await until(()=>evaluate(browser,manager,'!document.querySelector("#sidebar-tool-preview").hidden'),'official reinstall review');
  await nativeClick(browser,manager,'#sidebar-tool-install');
  await until(()=>evaluate(browser,manager,'Boolean(document.querySelector('+JSON.stringify(installed)+'))'),'official reinstall persisted');
  await nativeClick(browser,manager,installed);
  await until(()=>evaluate(browser,manager,'Boolean(document.querySelector("#sidebar-tool-frame main.review"))&&!document.querySelector("#sidebar-tool-frame iframe")'),'reinstalled genuine native UI');
  const reinstallIdentity=await evaluate(browser,manager,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.market.provenance.v1"]).then(v=>({tool:v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="time-review"),provenance:v["opendesk.market.provenance.v1"]?.["time-review"]}))');
  assert.deepEqual(reinstallIdentity.tool,pkg,'reinstalled exact official package bytes');
  assert.deepEqual(reinstallIdentity.provenance,{marketId:release.id,version:pkg.version,sha256:release.sha256});
  const reinstalled=await until(()=>evaluate(browser,manager,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+'])'),
    'real default state committed by newly mounted official UI');
  assert.equal(reinstalled.paused,true);assert.deepEqual(reinstalled.days,{});assert.deepEqual(reinstalled.siteGrants,{allSites:false,origins:[]});
  evidence.reinstall='PASS';note('real-tool-reinstall',{version:pkg.version,newConsentRequired:true,oldDataNotResurrected:true,noIframe:true});
  // Negative identity cases use the SAME product file-review installer and
  // real macOS chooser. No package/epoch/provenance storage is injected.
  const trustedRoot=(await browser.send('Runtime.evaluate',{expression:'document.querySelector("#sidebar-tool-frame main.review")'},manager)).result.objectId;
  const targetsBefore=new Set((await browser.send('Target.getTargets')).targetInfos.map(row=>row.targetId));
  await nativeClick(browser,manager,'#sidebar-tool-open-tab');
  const importTarget=await until(async()=>(await browser.send('Target.getTargets')).targetInfos.find(row=>!targetsBefore.has(row.targetId)&&row.type==='page'&&row.url.includes('/ui/tool.html')&&row.url.includes('toolId=time-review')),'existing product tab for reviewed identity tests');
  const importer=(await browser.send('Target.attachToTarget',{targetId:importTarget.targetId,flatten:true})).sessionId;
  await browser.send('Runtime.enable',{},importer);await browser.send('Page.enable',{},importer);
  await nativeClick(browser,importer,'#sidebar-tool-back');
  const importPackage=async(candidate,name)=>{
    await installReviewedPackage(browser,importer,candidate,name,zoomInput,restartProc.pid,note);
  };
  const lookalike={...pkg,id:'time-review-lookalike'};
  await importPackage(lookalike,'time-review-lookalike');
  await nativeClick(browser,importer,'[data-sidebar-tool-action=open][data-sidebar-tool-id=time-review-lookalike]');
  await until(()=>evaluate(browser,importer,'!!document.querySelector("#sidebar-tool-frame iframe")&&!document.querySelector("#sidebar-tool-frame main.review")'),'same-name local package remains opaque sandbox');
  assert.equal((await browser.send('Runtime.callFunctionOn',{objectId:trustedRoot,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},manager)).result.value,true,'lookalike install preserves actual official native root');
  evidence.sameNameSandbox='PASS';note('same-name-real-sandbox',{sameTitle:true,sameCapability:true,differentId:true,iframe:true});
  await nativeClick(browser,importer,'#sidebar-tool-back');
  const activityOrigin=evidence.steps.find(row=>row.name==='site-grant')?.origin;
  assert.ok(activityOrigin,'owned live HTTP server Origin retained for real replacement activity');
  const replacementSite=await browser.send('Target.createTarget',{url:activityOrigin+'/replacement-activity'});
  await browser.send('Target.activateTarget',{targetId:replacementSite.targetId});
  const replacementWebsite=(await browser.send('Target.attachToTarget',{targetId:replacementSite.targetId,flatten:true})).sessionId;
  await browser.send('Runtime.enable',{},replacementWebsite);await browser.send('Page.enable',{},replacementWebsite);
  await until(()=>evaluate(browser,replacementWebsite,'!!document.querySelector("h1")'),'actual owned replacement website loaded');
  await nativeOSClick(browser,replacementWebsite,'h1',zoomInput,restartProc.pid);
  assert.equal(spawnSync(zoomInput,[String(restartProc.pid),'activity'],{encoding:'utf8',timeout:10000}).status,0,'real OS activity before replacement');
  await setTimeReviewSettingsVisible(browser,manager,true);
  if(!await evaluate(browser,manager,'chrome.permissions.contains({permissions:["idle"]})')){
    await nativeClick(browser,manager,'#time-review-grant-idle');
    await until(()=>evaluate(browser,manager,'chrome.permissions.contains({permissions:["idle"]})'),'real idle permission regrant for authorized replacement case');
  }
  await nativeClick(browser,manager,'#time-review-site-current-open');
  await until(()=>evaluate(browser,manager,'!document.querySelector("#time-review-site-confirm").hidden'),'new installation exact Origin consent review');
  await nativeClick(browser,manager,'#time-review-site-current-approve');
  await until(()=>evaluate(browser,manager,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+']?.siteGrants?.origins?.includes('+JSON.stringify(activityOrigin)+'))'),'new installation Origin approval persisted');
  await setTimeReviewSettingsVisible(browser,manager,false);await nativeClick(browser,manager,'#start');
  await until(()=>evaluate(browser,manager,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>{const s=v['+JSON.stringify(KEY)+'];return s&&!s.paused&&s.authorizedHash&&s.checkpoint?.origin==='+JSON.stringify(activityOrigin)+'})'),'genuine authorized live checkpoint before reviewed own replacement');
  await sleep(900);await nativeClick(browser,manager,'#refresh');
  await until(()=>evaluate(browser,manager,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>Object.values(v['+JSON.stringify(KEY)+']?.days||{}).some(rows=>Object.values(rows).some(ms=>ms>500)))'),
    'genuine nonempty history before identity replacement and official upgrade');
  const priorEpoch=await epoch();
  assert.ok(typeof priorEpoch==='string'&&priorEpoch,'reinstalled identity retains a genuine lifecycle epoch');
  const replacement={...pkg,version:'1.6.1',js:pkg.js+'\n// Reviewed local identity-negative fixture.\n'};
  assert.notEqual(await timeReviewPackageHash(replacement),await timeReviewPackageHash(pkg),'replacement changes the exact package authority hash');
  await importPackage(replacement,'time-review-local-replacement');
  await until(async()=>!(await browser.send('Runtime.callFunctionOn',{objectId:trustedRoot,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},manager)).result.value,'old official native root immediately retires after own replacement');
  const retired=await until(async()=>{
    const row=await evaluate(browser,importer,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.market.provenance.v1","opendesk.sidebar-tools.revocation-epochs.v1",'+JSON.stringify(KEY)+']).then(v=>({tool:v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="time-review"),provenance:v["opendesk.market.provenance.v1"]?.["time-review"]||null,epoch:v["opendesk.sidebar-tools.revocation-epochs.v1"]?.["time-review"]||null,state:v['+JSON.stringify(KEY)+']}))');
    try{assert.deepEqual(row.tool,replacement);}catch{return null;}
    // A changed package hash retires this identity. The sole installer keeps
    // the lifecycle epoch on ordinary updates; disable/uninstall rotation is
    // independently asserted above, rather than invented by this fixture.
    return row.provenance===null&&typeof row.epoch==='string'&&row.epoch&&row.epoch===priorEpoch&&
      row.state?.paused===true&&row.state.authorizedHash===null&&row.state.checkpoint===null?row:null;
  },'replacement and durable retirement settle together');
  assert.deepEqual(retired.tool,replacement);assert.equal(retired.provenance,null);assert.equal(retired.epoch,priorEpoch);
  assert.equal(retired.state.paused,true);assert.equal(retired.state.authorizedHash,null);assert.equal(retired.state.checkpoint,null);
  assert.equal(await evaluate(browser,manager,'document.querySelectorAll("#sidebar-tool-frame main.review").length'),0);
  await nativeClick(browser,importer,installed);
  await until(()=>evaluate(browser,importer,'!!document.querySelector("#sidebar-tool-frame iframe")&&!document.querySelector("#sidebar-tool-frame main.review")'),'changed version and bytes remain untrusted sandbox');
  evidence.replacementRetirement='PASS';note('own-reviewed-replacement-retirement',{version:replacement.version,bytesChanged:true,officialProvenanceRemoved:true,epochPreserved:true,packageHashChanged:true,oldNativeRootRetired:true,noAutoStart:true});
  evidence.screenshots.push(await screenshot(browser,manager,'official-native-retired-after-local-replacement'));
  // Exercise an upgrade TO the actual current official release. The older
  // package is an explicitly reviewed local fixture, not a claimed historical
  // official release; no registry/provenance/epoch data is injected.
  await nativeClick(browser,importer,'#sidebar-tool-back');
  const legacy={...pkg,version:'1.5.0',js:pkg.js+'\n// Reviewed local older-version upgrade fixture, not an official release.\n'};
  await importPackage(legacy,'time-review-reviewed-older-version');
  await nativeClick(browser,importer,installed);
  await until(()=>evaluate(browser,importer,'!!document.querySelector("#sidebar-tool-frame iframe")&&!document.querySelector("#sidebar-tool-frame main.review")'),'older reviewed package remains sandboxed');
  const legacyFrame=(await browser.send('Runtime.evaluate',{expression:'document.querySelector("#sidebar-tool-frame iframe")'},importer)).result.objectId;
  const beforeOfficialUpgrade=await evaluate(browser,importer,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+'])');
  assert.ok(Object.values(beforeOfficialUpgrade.days).some(rows=>Object.values(rows).some(ms=>ms>500)),'official upgrade checks actual captured history');
  await nativeClick(browser,importer,'#sidebar-tool-back');
  if(await evaluate(browser,importer,'document.querySelector("#sidebar-tool-discover-panel").hidden'))
    await nativeClick(browser,importer,'#sidebar-tool-discover-toggle');
  await nativeClick(browser,importer,'#sidebar-tool-filter-all');
  await until(()=>evaluate(browser,importer,'document.querySelector("[data-official-tool-id=time-review]")?.dataset.installationState==="update"'),
    'actual catalog exposes a version upgrade under All');
  await nativeClick(browser,importer,'#sidebar-tool-official-time-review-install');
  await until(()=>evaluate(browser,importer,'!document.querySelector("#sidebar-tool-preview").hidden&&document.querySelector("#sidebar-tool-preview-version").textContent.includes('+JSON.stringify(pkg.version)+')'),'actual official upgrade review');
  await nativeClick(browser,importer,'#sidebar-tool-install');
  const upgraded=await until(async()=>{
    const row=await evaluate(browser,importer,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.market.provenance.v1",'+JSON.stringify(KEY)+']).then(v=>({tool:v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="time-review"),provenance:v["opendesk.market.provenance.v1"]?.["time-review"],state:v['+JSON.stringify(KEY)+']}))');
    try{assert.deepEqual(row.tool,pkg);assert.deepEqual(row.provenance,{marketId:release.id,version:pkg.version,sha256:release.sha256});}catch{return null;}
    return row.state?.paused===true&&row.state.authorizedHash===null&&row.state.checkpoint===null?row:null;
  },'official upgrade exact package/provenance and retired authorization');
  for(const key of ['days','categories','minuteDays','minuteConsent','settings','siteGrants'])
    assert.deepEqual(upgraded.state[key],beforeOfficialUpgrade[key],'official upgrade preserves '+key);
  assert.equal((await browser.send('Runtime.callFunctionOn',{objectId:legacyFrame,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},importer)).result.value,false,'older sandbox document retired by official upgrade');
  await nativeClick(browser,importer,installed);
  await until(()=>evaluate(browser,importer,'!!document.querySelector("#sidebar-tool-frame main.review")&&!document.querySelector("#sidebar-tool-frame iframe")'),'official upgrade admits only the actual compiled native UI');
  evidence.officialUpgrade='PASS';note('actual-official-upgrade',{fromVersion:legacy.version,fromSource:'reviewed-local-older-version-fixture',toVersion:pkg.version,toSource:'actual-official-catalog',exactPackage:true,officialProvenance:true,historyPreserved:true,oldSandboxRetired:true,noAutoStart:true});
  evidence.screenshots.push(await screenshot(browser,importer,'official-upgrade-native-1.6.0'));
  state=upgraded.state;
  complete=true;
  await writeFile(path.join(OUT,'state-summary.json'),JSON.stringify({
    stateObservation:'after-official-upgrade',
    minuteConsent:state.minuteConsent,paused:state.paused,days:Object.keys(state.days||{}).length,
    nativeInstall:true,downloadChecks,browserRestart:evidence.browserRestart,
    populatedExport:evidence.populatedExport,classification:evidence.classification,
    realBrowserZoom:evidence.realBrowserZoom,multiSite:evidence.multiSite,
    idleTransition:evidence.idleTransition,
    websiteGrantRevocation:evidence.websiteGrantRevocation,
    idlePermissionRevocation:evidence.idlePermissionRevocation,
    disableEnable:evidence.disableEnable,uninstall:evidence.uninstall,
    currentSourceHash:process.env.GITHUB_SHA||null,actualSidePanelDocumentId:sideDocument.documentId
  },null,2)+'\n');
  if(NATIVE_SCOPE==='full')assert.ok(REQUIRED_NATIVE.every(key=>evidence[key]==='PASS'),
    'Full native acceptance requires every recorded case to pass: '+REQUIRED_NATIVE.filter(key=>evidence[key]!=='PASS').join(', '));
});
