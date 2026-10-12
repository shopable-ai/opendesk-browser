// Real isolated macOS Chrome for Testing, actual unpacked extension and Side Panel.
// Only Chrome Input dispatches user clicks; evaluations read the rendered UI or
// browser state. NO injected package/permission/storage writes and NO fake ACK.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const KEY='opendesk.time-review.v1';
const OUT=path.resolve(process.env.OPENDESK_TIME_NATIVE_EVIDENCE||'artifacts/time-review-r13-native');
const EXTENSION=path.resolve('dist/production');
const BIN=process.env.CHROME_BIN;
const NATIVE_REQUESTED=process.env.OPENDESK_TIME_REVIEW_NATIVE==='1';
function cdp(url){
  const socket=new WebSocket(url),requests=new Map();let sequence=0,closed=false;
  const ready=new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data);if(!msg.id)return;
    const pending=requests.get(msg.id);if(!pending)return;
    requests.delete(msg.id);clearTimeout(pending.timer);
    msg.error?pending.reject(Error(JSON.stringify(msg.error))):pending.resolve(msg.result);
  };
  socket.onclose=()=>{closed=true;for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('CDP_DISCONNECTED'));}requests.clear();};
  return {
    ready,
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
    '(()=>{const n=document.querySelector('+JSON.stringify(selector)+');return !!n&&!n.disabled&&!!n.getClientRects().length;})()'),'actionable '+selector);
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
async function screenshot(client,session,name){
  const data=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(data.data,'base64'),filename=path.join(OUT,name+'.png');
  await writeFile(filename,bytes);
  return {filename:name+'.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

test('Time Review R1.3 actual Mac Chrome install and trusted consent smoke',{skip:!NATIVE_REQUESTED,timeout:225000},async t=>{
  assert.equal(process.platform,'darwin','Real Mac Chrome required');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,'Pinned Chrome for Testing binary required');
  await mkdir(OUT,{recursive:true});
  const pkgFile=path.join(EXTENSION,'official-tools/time-review/time-review.opendesk-tool.json');
  const pkgBytes=await readFile(pkgFile),pkg=JSON.parse(pkgBytes);
  assert.equal(pkg.id,'time-review');assert.equal(pkg.version,'1.3.0');
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-time-r13-'));
  const downloads=path.join(profile,'owned-downloads');await mkdir(downloads);
  const args=['--use-mock-keychain','--password-store=basic','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+EXTENSION,
    '--load-extension='+EXTENSION,'about:blank'];
  const proc=spawn(BIN,args,{stdio:['ignore','ignore','pipe']});
  let stderr='',browser=null,complete=false,sideSid=null,frameSid=null;
  const evidence={candidate:process.env.GITHUB_SHA||null,mode:'actual-headed-macos-CFT',
    package:{id:pkg.id,version:pkg.version,sha256:createHash('sha256').update(pkgBytes).digest('hex')},
    chromePid:proc.pid,profileOwned:true,install:'NOT_TESTED',realSidePanel:'NOT_TESTED',
    minuteConsent:'NOT_TESTED',browserRestart:'NOT_TESTED',download:'NOT_TESTED',
    beginAndActiveCollection:'NOT_TESTED',hostedCI:true,screenshots:[],steps:[]};
  const note=(name,data)=>{evidence.steps.push({name,...data});console.log('TIME_NATIVE '+name+' '+JSON.stringify(data));};
  proc.stderr.on('data',data=>{stderr=(stderr+String(data)).slice(-3500);});
  t.after(async()=>{
    if(!complete&&browser)for(const [name,sid] of [['side',sideSid],['sandbox',frameSid]]){
      if(sid)try{evidence.screenshots.push(await screenshot(browser,sid,'failure-'+name));}
      catch(error){evidence.steps.push({name:'failure-screenshot-unavailable',target:name,error:String(error)});}
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
    const terminated=proc.exitCode!==null||proc.signalCode!==null;
    const owned=path.basename(profile).startsWith('opendesk-time-r13-')&&path.dirname(profile)===tmpdir();
    assert.ok(owned,'Only the unique owned temp profile may be removed');
    await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});
    evidence.cleanup={terminated,profileRemoved:true,owned};
    evidence.complete=complete;
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
  await until(()=>evaluate(browser,uiTarget.sessionId,'Boolean(document.querySelector("#sidebar-tool-official-time-review-install"))'),'official Time Review available');
  const windowId=await evaluate(browser,uiTarget.sessionId,'chrome.windows.getCurrent().then(w=>w.id)');
  // The harness adds ONLY a trusted-click entry for chrome.sidePanel.open.
  // It provides no tool package bytes, permissions or business-data objects.
  await evaluate(browser,uiTarget.sessionId,
    '(()=>{const b=document.createElement("button");b.id="native-open-time-review-sidepanel";b.textContent="Open Side Panel";b.style.cssText="position:fixed;top:50px;left:20px;min-width:220px;min-height:60px;z-index:999999";b.addEventListener("click",()=>chrome.sidePanel.open({windowId:'+windowId+'}));document.body.append(b);return true;})()');
  note('trusted-open',await nativeClick(browser,uiTarget.sessionId,'#native-open-time-review-sidepanel'));
  const sideDocument=await until(async()=>{
    const c=await evaluate(browser,uiTarget.sessionId,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
    return c.find(x=>x.documentUrl?.includes('/ui/tool.html')&&x.documentId);
  },'actual SIDE_PANEL context');
  const sideTarget=await until(async()=>{
    const rows=(await browser.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.url===sideDocument.documentUrl);
  },'native Side Panel target');
  const side=(await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true})).sessionId;
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
  assert.equal(saved,'1.3.0','real installed package persisted');
  evidence.install='PASS';note('install',{version:saved});
  await nativeClick(browser,side,installed);
  await until(()=>evaluate(browser,side,'!document.querySelector("#sidebar-tool-display").hidden'),'tool opened');
  const frameTarget=await until(async()=>{
    const rows=(await browser.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.type==='iframe'&&x.url?.includes('/sidebar-tools/sandbox.html'));
  },'sandbox tool iframe');
  const frame=(await browser.send('Target.attachToTarget',{targetId:frameTarget.targetId,flatten:true})).sessionId;
  frameSid=frame;
  await browser.send('Runtime.enable',{},frame);await browser.send('Page.enable',{},frame);
  await until(()=>evaluate(browser,frame,
    'document.querySelectorAll(".qcard").length===4 && document.querySelectorAll(".extra-card").length===2 && !document.querySelector("#status")?.textContent?.includes("正在读取")'),
    'actual R1.3 data-bound Canvas and category cards');
  const visual=await evaluate(browser,frame,
    '(()=>({quadrants:document.querySelectorAll(".qcard").length,extras:document.querySelectorAll(".extra-card").length,day:document.querySelector("#today-total")?.textContent,timeline:document.querySelector("#timeline-state")?.textContent,horizontal:document.documentElement.scrollWidth<=innerWidth+1}))()');
  assert.equal(visual.quadrants,4);assert.equal(visual.extras,2);
  assert.equal(visual.timeline,'尚无分钟明细','No fabricated historical minutes');
  assert.equal(visual.horizontal,true,'No horizontal overflow in actual tool iframe');
  evidence.screenshots.push(await screenshot(browser,side,'installed-native-side-panel'));
  evidence.screenshots.push(await screenshot(browser,frame,'installed-native-r13-sandbox'));
  note('native-canvas',visual);
  const readTime=()=>evaluate(browser,side,'chrome.storage.local.get('+JSON.stringify(KEY)+').then(v=>v['+JSON.stringify(KEY)+'])');
  let state=await readTime();assert.ok(state&&state.paused,'install/open must not begin recording');
  assert.equal(state.minuteConsent,false,'minute data opt-in must default false');
  await nativeClick(browser,frame,'#settings summary');
  await nativeClick(browser,frame,'#minute-consent');
  // Sandbox request is not an authority to collect more precise activity:
  // only opens the trusted extension Settings and refuses the operation.
  await until(()=>evaluate(browser,side,'!document.querySelector("#sidebar-tool-settings-view").hidden'),'trusted settings from sandbox');
  state=await readTime();assert.equal(state.minuteConsent,false);
  note('untrusted-consent-denied',{minuteConsent:state.minuteConsent});
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
  await nativeClick(browser,side,'#sidebar-tool-settings-open');
  await until(()=>evaluate(browser,side,'document.querySelector("#sidebar-tool-settings-view").hidden'),'return tool from host settings');
  const exportDetails=await evaluate(browser,side,'Boolean(document.querySelector("#sidebar-tool-frame iframe"))');
  assert.equal(exportDetails,true);
  // Configure an owned download destination; never write to user's Downloads.
  await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
  await nativeClick(browser,frame,'#export-json');
  const actualFile=path.join(downloads,'time-review.json');
  const actualBytes=await until(async()=>{const b=await readFile(actualFile).catch(()=>null);return b&&b.length>0?b:null;},'real downloaded JSON file',30000);
  const exported=JSON.parse(actualBytes);
  assert.equal(exported.format,'opendesk.time-review.export.v1');
  assert.equal(exported.minuteConsent,false);
  evidence.download='PASS';
  note('actual-export-landed',{bytes:actualBytes.length,sha256:createHash('sha256').update(actualBytes).digest('hex')});
  state=await readTime();assert.equal(state.paused,true,'no idle prompt or start should be bypassed');
  complete=true;
  await writeFile(path.join(OUT,'state-summary.json'),JSON.stringify({
    minuteConsent:state.minuteConsent,paused:state.paused,days:Object.keys(state.days||{}).length,
    nativeInstall:true,downloadBytes:actualBytes.length,
    currentSourceHash:process.env.GITHUB_SHA||null,actualSidePanelDocumentId:sideDocument.documentId
  },null,2)+'\n');
});
