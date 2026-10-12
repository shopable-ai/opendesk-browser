// Real isolated macOS Chrome for Testing, actual unpacked extension and Side Panel.
// Only Chrome Input dispatches user clicks; evaluations read the rendered UI or
// browser state. NO injected package/permission/storage writes and NO fake ACK.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {reviewExport} from '../../src/time-review/model.js';
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
    '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+EXTENSION,
    '--load-extension='+EXTENSION,'about:blank'];
  const proc=spawn(BIN,args,{stdio:['ignore','ignore','pipe']});
  let stderr='',browser=null,complete=false,sideSid=null,frameSid=null,restartProc=null;
  const evidence={candidate:process.env.GITHUB_SHA||null,mode:'actual-headed-macos-CFT',
    package:{id:pkg.id,version:pkg.version,sha256:createHash('sha256').update(pkgBytes).digest('hex')},
    chromePid:proc.pid,profileOwned:true,install:'NOT_TESTED',realSidePanel:'NOT_TESTED',
    minuteConsent:'NOT_TESTED',browserRestart:'NOT_TESTED',download:'NOT_TESTED',
    beginAndActiveCollection:'NOT_TESTED',pauseResume:'NOT_TESTED',
    swRestart:'NOT_TESTED',hostedCI:true,screenshots:[],steps:[]};
  const note=(name,data)=>{evidence.steps.push({name,...data});console.log('TIME_NATIVE '+name+' '+JSON.stringify(data));};
  proc.stderr.on('data',data=>{stderr=(stderr+String(data)).slice(-3500);});
  t.after(async()=>{
    if(!complete&&browser){
      if(sideSid)try{
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
  assert.equal(saved,pkg.version,'real installed package persisted with exact built tool version');
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
  assert.deepEqual(await evaluate(browser,frame,
    'Array.from(document.querySelectorAll(".q-name")).map(el=>el.textContent)'),
    ['重要且紧急','重要不紧急','紧急不重要','不重要不紧急'],
    'native Canvas classifications must use canonical data model labels');
  assert.equal(visual.timeline,'尚无分钟明细','No fabricated historical minutes');
  assert.equal(visual.horizontal,true,'No horizontal overflow in actual tool iframe');
  evidence.screenshots.push(await screenshot(browser,side,'installed-native-side-panel'));
  const frameGeometry=await evaluate(browser,frame,
    '(()=>({viewportHeight:innerHeight,documentHeight:document.documentElement.scrollHeight,rootHeight:document.querySelector(".review")?.getBoundingClientRect().height}))()');
  const outerGeometry=await evaluate(browser,side,
    '(()=>{const frame=document.querySelector(".sidebar-tool-iframe"),rect=frame?.getBoundingClientRect();return {viewportHeight:innerHeight,iframeHeight:rect?.height,iframeMaxHeight:frame?getComputedStyle(frame).maxHeight:null,hostScrollHeight:document.documentElement.scrollHeight}})()');
  note('native-canvas',{...visual,frameGeometry,outerGeometry});
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
  // The browser API may accept a download that subsequently gets interrupted.
  // Observe REAL Chrome download state before declaring disk success; never
  // read or copy a file outside this run's independently owned profile.
  const readDownloads=()=>evaluate(browser,side,
    'chrome.downloads.search({}).then(rows=>rows.map(({id,state,error,filename,bytesReceived,totalBytes,byExtensionId})=>({id,state,error,filename,bytesReceived,totalBytes,ownedByExtension:byExtensionId===chrome.runtime.id})))');
  const expectedState=await readTime(),issues=[],downloadChecks=[];
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
  state=await readTime();assert.equal(state.paused,true,'no idle prompt or start should be bypassed');
  // Native activity is driven by real Chrome permission UI and active tabs.
  // Never pre-seed business storage or replace the idle API in this test.
  await nativeClick(browser,side,'#sidebar-tool-settings-open');
  await nativeClick(browser,side,'#time-review-grant-idle');
  const granted=await until(()=>evaluate(browser,side,
    'chrome.permissions.contains({permissions:["idle"]})'),'genuine idle permission',5000).catch(()=>false);
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
    await nativeClick(browser,side,'#time-review-trusted-start');
    await until(async()=>{const s=await readTime();return s&&!s.paused&&s.authorizedHash?s:null;},'trusted start',10000);
    const site=await browser.send('Target.createTarget',{url:siteUrl});
    await until(async()=>{
      const active=await evaluate(browser,side,'chrome.tabs.query({active:true,lastFocusedWindow:true})');
      return active.some(tab=>tab.url===siteUrl);
    },'real HTTP(S) Chrome active tab',10000);
    const readActivityGates=()=>evaluate(browser,side,
      '(async()=>{const w=await chrome.windows.getLastFocused();const t=(await chrome.tabs.query({active:true,windowId:w.id}))[0];return {focused:w.focused,windowType:w.type,idle:await chrome.idle.queryState(60),isLoopbackTab:t?.url?.startsWith("http://127.0.0.1:"),hasHostPermission:await chrome.permissions.contains({origins:["http://127.0.0.1/*"]})};})()');
    let observationGates=await readActivityGates();
    note('native-observation-gates-before-input',observationGates);
    if(observationGates.idle!=='active'){
      // CDP mouse dispatch is a browser renderer event and is NOT proof of
      // operating-system activity. Use the existing macOS-owned CFT helper:
      // it checks the actual process and emits a real macOS CGEvent, without
      // injecting Chrome idle responses, permissions, or Time Review storage.
      const helper=path.join(profile,'time-review-native-activity');
      const compile=spawnSync('swiftc',[
        path.resolve('tests/framework/time-review-native-input.swift'),'-o',helper
      ],{encoding:'utf8',timeout:80000});
      let delivered=false,reason='';
      if(compile.status===0){
        const input=spawnSync(helper,[String(proc.pid),'activity'],{encoding:'utf8',timeout:10000});
        delivered=input.status===0&&String(input.stdout).includes('OWNED_NATIVE_MOUSE_MOVED');
        reason=delivered?'macOS owned CGEvent sent':
          'macOS Accessibility/CGEvent permission unavailable (status '+input.status+')';
      }else reason='macOS Swift helper unavailable (status '+compile.status+')';
      note('native-os-activity-attempt',{delivered,reason});
      if(delivered)observationGates=await until(async()=>{
        const gates=await readActivityGates();
        return gates.idle==='active'?gates:null;
      },'macOS real input transitions chrome.idle to active',3000).catch(()=>observationGates);
    }
    note('native-observation-gates-final',observationGates);
    const canProveActivity=observationGates.idle==='active'&&observationGates.focused===true&&
      observationGates.windowType==='normal'&&observationGates.isLoopbackTab===true&&
      observationGates.hasHostPermission===true;
    if(!canProveActivity){
      evidence.beginAndActiveCollection='BLOCKED';
      note('activity-native-blocked',{
        reason:'Real system activity and focused, authorized HTTP(S) tab are required',
        gates:observationGates
      });
      // A CI host that is physically idle is not a product defect. Never
      // weaken observe(), simulate chrome.idle, or count this as native PASS.
    }else{
      // A genuine OS activity transition does not force an immediate SW wake:
      // the heartbeat may legitimately arrive up to 30 seconds later. Use
      // the actual Side Panel refresh button to request a normal status tick.
      // No Chrome storage/business data or privileged API response is forged.
      await nativeClick(browser,side,'#sidebar-tool-settings-open');
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
    await nativeClick(browser,frame,'#pause');
    const paused=await until(async()=>{const s=await readTime();return s.paused?s:null;},'user pause',8000);
    await sleep(1500);await nativeClick(browser,frame,'#refresh');
    assert.equal(total(await readTime()),total(paused),'paused time never accumulates');
    evidence.pauseResume='PARTIAL';
    note('real-pause',{ms:total(paused)});
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
    await nativeClick(browser,side,'#sidebar-tool-settings-open');
    await nativeClick(browser,side,'#time-review-trusted-start');
    const resumed=await until(async()=>{const s=await readTime();return s&&!s.paused?s:null;},'trusted resume',10000);
    evidence.pauseResume='PASS';note('real-resume',{paused:resumed.paused});
    await nativeClick(browser,side,'#sidebar-tool-settings-open');
    // The sandbox has been hidden while the trusted host resumed collection.
    // Request a normal status refresh before acting on its formerly disabled
    // Pause button; do not synthesize a click on disabled UI.
    await nativeClick(browser,frame,'#refresh');
    await until(()=>evaluate(browser,frame,
      'Boolean(document.querySelector("#pause")&&!document.querySelector("#pause").disabled)'),
      'resumed Pause button ready after genuine status refresh',9000);
    await nativeClick(browser,frame,'#pause');
    await until(async()=>{const s=await readTime();return s.paused?s:null;},'final trusted stop');
    }
    await browser.send('Target.closeTarget',{targetId:site.targetId});
  }
  // Change the category via the actual visible sandbox UI: native pointer
  // focus, native arrow-key selection and the normal Save button. Neither the
  // test nor CDP may write Time Review business records directly.
  if(evidence.beginAndActiveCollection==='PASS'){
    await nativeClick(browser,frame,'#refresh');
    await until(()=>evaluate(browser,frame,
      'Array.from(document.querySelectorAll("#sites .detail-item .entry b")).some(e=>e.textContent==="127.0.0.1")'),
      'real website displayed in the daily records',9000);
    const beforeCategory=await readTime();
    await nativeClick(browser,frame,'#sites .detail-item button[aria-label^="修改"]');
    const selector='#sites .detail-item .row-edit select';
    await nativeClick(browser,frame,selector);
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
      'document.querySelector("#sites .row-edit select")?.value==="2"'),
      'native OS keyboard selected important-not-urgent category',6000);
    await nativeClick(browser,frame,'#sites .row-edit button.primary');
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
  await nativeClick(browser,manager,installed);
  await until(()=>evaluate(browser,manager,
    '!document.querySelector("#sidebar-tool-display").hidden'),'reopened installed tool');
  await nativeClick(browser,manager,'#sidebar-tool-settings-open');
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
  const afterUninstall=await until(async()=>evaluate(browser,manager,
    '(async()=>{const x=await chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.time-review.v1","opendesk.sidebar-tools.uninstall-cleanup.v1"]);const rows=x["opendesk.sidebar-tools.installed.v1"];return {timeInstalled:rows?.some(t=>t.id==="time-review"),otherInstalled:rows?.some(t=>t.id==="reading-toc"),reviewPresent:Object.hasOwn(x,"opendesk.time-review.v1"),cleanup:x["opendesk.sidebar-tools.uninstall-cleanup.v1"]?.["time-review"]??null};})()'),
    'confirmed uninstall and complete selective Time Review cleanup',10000);
  assert.equal(afterUninstall.timeInstalled,false,'official Time Review uninstall completed');
  assert.equal(afterUninstall.reviewPresent,false,'uninstall removed Time Review local record');
  assert.equal(afterUninstall.cleanup,null,'cleanup transaction has no pending state');
  assert.equal(afterUninstall.otherInstalled,true,'other installed tools must remain intact');
  await sleep(1300);
  assert.equal(await evaluate(browser,manager,
    'chrome.storage.local.get("opendesk.time-review.v1").then(v=>Object.hasOwn(v,"opendesk.time-review.v1"))'),false,
    'stale worker events may not resurrect uninstalled Time Review data');
  evidence.uninstall='PASS';
  note('real-tool-uninstall',{selective:true,recordDeleted:true,othersIntact:true,noResurrection:true});
  state=persisted.review;
  complete=true;
  await writeFile(path.join(OUT,'state-summary.json'),JSON.stringify({
    minuteConsent:state.minuteConsent,paused:state.paused,days:Object.keys(state.days||{}).length,
    nativeInstall:true,downloadChecks,browserRestart:evidence.browserRestart,
    populatedExport:evidence.populatedExport,classification:evidence.classification,
    disableEnable:evidence.disableEnable,uninstall:evidence.uninstall,
    currentSourceHash:process.env.GITHUB_SHA||null,actualSidePanelDocumentId:sideDocument.documentId
  },null,2)+'\n');
});
