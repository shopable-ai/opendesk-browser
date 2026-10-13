// Native macOS Chrome acceptance: installed release -> trusted opt-in ->
// actual HTTP navigation redirected by Chrome DNR -> uninstall -> URL restores.
// No fake DNR, storage writes, synthetic DOM clicks or user-grant injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const BIN=process.env.CHROME_BIN,ROOT=path.resolve('dist/production');
const OUT=path.resolve(process.env.OPENDESK_FOCUS_NATIVE_EVIDENCE||'artifacts/stay-focus-r1-native');
const ENABLED=process.env.OPENDESK_STAY_FOCUS_NATIVE==='1';
const protocol='opendesk.stay-focus.v1',store='opendesk.stay-focus.state.v1';
function connect(url){
  const socket=new WebSocket(url),waiting=new Map();let serial=0;
  const ready=new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data),p=waiting.get(msg.id);if(!p)return;
    waiting.delete(msg.id);clearTimeout(p.timer);
    msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);
  };
  socket.onclose=()=>{for(const p of waiting.values()){clearTimeout(p.timer);p.reject(Error('CDP disconnected'));}};
  return {ready,send(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},15000);
    waiting.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},close(){socket.close();}};
}
async function screenshot(c,session,name){
  const image=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(image.data,'base64');
  await writeFile(path.join(OUT,name+'.png'),bytes);
  return {file:name+'.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function until(run,label,limit=18000){
  const end=Date.now()+limit;let last;
  while(Date.now()<end){try{const value=await run();if(value)return value;}catch(e){last=String(e);}await sleep(150);}
  throw Error(label+' timed out'+(last?' - '+last:''));
}
async function evalRead(c,session,expression){
  const x=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails).slice(0,350));
  return x.result.value;
}
async function click(c,session,selector){
  await until(()=>evalRead(c,session,'(()=>{const x=document.querySelector('+JSON.stringify(selector)+');return !!x&&!x.disabled&&x.getClientRects().length>0;})()'),'clickable '+selector);
  await evalRead(c,session,'document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"})');
  const p=await evalRead(c,session,'(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  for(const type of ['mousePressed','mouseReleased'])
    await c.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1},session);
}
async function fill(c,session,selector,value){
  await click(c,session,selector);
  await c.send('Input.insertText',{text:value},session);
}
// Real CDP keyboard input, not changing DOM values or local usage via evaluate.
async function replaceField(c,session,selector,value){
  await click(c,session,selector);
  await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',
    modifiers:4,windowsVirtualKeyCode:65},session);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',
    modifiers:4,windowsVirtualKeyCode:65},session);
  await c.send('Input.insertText',{text:value},session);
}
async function press(c,session,key,code,virtualKey){
  await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode:virtualKey},session);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey},session);
}
test('Real Chrome default sharing, live page reminder, DNR and uninstall',{skip:!ENABLED,timeout:540000},async t=>{
  assert.equal(process.platform,'darwin','Native CI must be macOS');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0);
  const packageFile=path.join(ROOT,'official-tools/stay-focus/stay-focus.opendesk-tool.json');
  const bytes=await readFile(packageFile),pkg=JSON.parse(bytes);
  assert.equal(pkg.id,'stay-focus');assert.equal(pkg.version,'1.0.0');
  await mkdir(OUT,{recursive:true});
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-stay-focus-r1-'));
  const serve=(_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><title>Stay Focus native HTTP test</title><h1>Allowed site before rules</h1>');
  };
  // Two different loopback hostnames, two real Chrome HTTP tabs, ONE trusted
  // entertainment budget. Do not depend on live third-party network access.
  const http=createServer(serve),localHttp=createServer(serve);
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  await new Promise(resolve=>localHttp.listen(0,'::1',resolve));
  const page='http://127.0.0.1:'+http.address().port+'/real-navigation';
  const secondPage='http://localhost:'+localHttp.address().port+'/real-navigation';
  const chromeArgs=['--use-mock-keychain','--password-store=basic','--no-sandbox',
    '--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+ROOT,'--load-extension='+ROOT,'about:blank'];
  const launchChrome=()=>spawn(BIN,chromeArgs,{stdio:['ignore','ignore','pipe']});
  let chrome=launchChrome();
  let errors='',client=null,passed=false;
  const report={candidate:process.env.GITHUB_SHA||null,
    pkgSHA256:createHash('sha256').update(bytes).digest('hex'),
    nativeChrome:'NOT_TESTED',approval:'NOT_TESTED',actualNavigation:'NOT_TESTED',
    quota:'NATIVE_NOT_TESTED',zeroConfig:'NOT_TESTED',pageReminder:'NOT_TESTED',
    realSharedTwoHosts:'NOT_TESTED',quotaTrace:[],screenshots:[],
    disabled:'NOT_TESTED',reenabled:'NOT_TESTED',restart:'NOT_TESTED',
    unregister:'NOT_TESTED',uninstall:'NOT_TESTED',steps:[]};
  const note=(name,details)=>{report.steps.push({name,...details});console.log('STAY_FOCUS_NATIVE '+name+' '+JSON.stringify(details));};
  const captureChromeErrors=process=>process.stderr.on('data',x=>{
    errors=(errors+String(x)).slice(-2200);
  });
  captureChromeErrors(chrome);
  t.after(async()=>{
    if(client)try{await client.send('Browser.close');}catch{}
    client?.close();
    if(chrome.exitCode===null&&chrome.signalCode===null){
      await new Promise(resolve=>{const timer=setTimeout(()=>{chrome.kill('SIGKILL');resolve();},2000);
        chrome.once('close',()=>{clearTimeout(timer);resolve();});chrome.kill('SIGTERM');});
    }
    await Promise.all([http,localHttp].map(server=>new Promise(resolve=>server.close(resolve))));
    assert.ok(path.basename(profile).startsWith('opendesk-stay-focus-r1-')&&path.dirname(profile)===tmpdir());
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
    if(report.quota==='IN_PROGRESS')report.quota='FAIL';
    report.passed=passed;report.chromeErrorTail=errors.slice(-900);
    await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
  });
  const remote=await until(async()=>{
    const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const port=Number(source?.split('\n')[0]);return port>0?port:null;
  },'isolated Chrome debugging port',30000);
  const version=await(await fetch('http://127.0.0.1:'+remote+'/json/version')).json();
  client=connect(version.webSocketDebuggerUrl);await client.ready;
  report.nativeChrome=version.Browser;
  const id=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'real unpacked SW',15000);
  report.extensionId=id;
  const ui=await client.send('Target.createTarget',{url:'chrome-extension://'+id+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const uid=(await client.send('Target.attachToTarget',{targetId:ui.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},uid);await client.send('Page.enable',{},uid);
  await until(()=>evalRead(client,uid,'!!document.querySelector("#sidebar-tool-official-stay-focus-install")'),'official release in catalogue');
  // Use the actual shipped catalog launcher, not a CDP-injected test button.
  // It checks isTrusted and invokes sidePanel.open in the real user gesture.
  await click(client,uid,'#catalog-open-dev-sidebar');
  const context=await until(async()=>{const found=await evalRead(client,uid,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return found.find(x=>x.documentUrl?.includes('/ui/tool.html')&&x.documentId);
  },'real SIDE_PANEL');
  let sid=await until(async()=>{const x=(await client.send('Target.getTargets')).targetInfos;
    const target=x.find(row=>row.url===context.documentUrl);if(!target)return null;
    return (await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  },'Side Panel CDP');
  await client.send('Runtime.enable',{},sid);await client.send('Page.enable',{},sid);
  await click(client,sid,'#tab-tools');
  await click(client,sid,'#sidebar-tool-discover-toggle');
  await click(client,sid,'#sidebar-tool-official-stay-focus-install');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-preview").hidden'),'official review');
  await click(client,sid,'#sidebar-tool-install');
  const installed='[data-sidebar-tool-action=open][data-sidebar-tool-id=stay-focus]';
  await until(()=>evalRead(client,sid,'!!document.querySelector('+JSON.stringify(installed)+')'),'real tool installed');
  await click(client,sid,installed);
  const frame=await until(async()=>{
    const x=(await client.send('Target.getTargets')).targetInfos;
    const target=x.find(row=>row.type==='iframe'&&row.url?.includes('/sidebar-tools/sandbox.html'));
    return target?(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId:null;
  },'sandbox iframe');
  await client.send('Runtime.enable',{},frame);await client.send('Page.enable',{},frame);
  await until(()=>evalRead(client,frame,'!!document.querySelector("#site-host")'),'real Stay Focus UI');
  const dimensions=await evalRead(client,frame,
    '(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,visible:!!document.querySelector("#site-host")}))()');
  assert.ok(dimensions.scrollWidth<=dimensions.width+2,'native tool must not overflow its iframe horizontally');
  report.toolGeometry=dimensions;
  report.screenshots.push(await screenshot(client,sid,'installed-stay-focus-native-panel'));
  // R1.4: approve a clean tool with no site rules using a REAL trusted click.
  await click(client,sid,'#sidebar-tool-settings-open');
  report.nativePermissionBefore=await evalRead(client,sid,
    'chrome.permissions.contains({permissions:["idle","declarativeNetRequestWithHostAccess"]})');
  await click(client,sid,'#stay-focus-enable-native');
  const allowed=await until(()=>evalRead(client,sid,
    'chrome.permissions.contains({permissions:["idle","declarativeNetRequestWithHostAccess"]})'),
    'real Chrome native optional permission',7500).catch(()=>false);
  if(!allowed){report.approval='BLOCKED_NATIVE_PERMISSION_PROMPT';
    note('native-permission-blocked',{notGranted:true});
    throw Error('Real Chrome native permission missing; no false acceptance');}
  const defaultPool=await until(()=>evalRead(client,sid,
    '(async()=>{const x=await chrome.storage.local.get("'+store+'");const v=x["'+store+'"];'+
    'return v?.enabled&&v.groups?.entertainment===30&&'+
    'v.sites?.some(s=>s.host==="youtube.com"&&s.group==="entertainment")&&'+
    'v.sites?.some(s=>s.host==="tiktok.com"&&s.group==="entertainment")?'+
    '{managed:v.sites.length,minutes:v.groups.entertainment,used:v.usage}:null})()'),
    'true first-activation default 30-minute shared pool',15000);
  report.zeroConfig='PASS';report.approval='PASS';
  note('native-zero-config',defaultPool);
  report.screenshots.push(await screenshot(client,sid,'zero-config-30-minute-pool'));
  // The native acceptance uses two minutes of real Chrome browsing, never
  // edits storage usage or creates a fake DNR rule. That also crosses the
  // last-one-minute page reminder with no 30-minute stress run.
  await until(()=>evalRead(client,frame,
    '(()=>{const x=document.querySelector("#daily-budget-minutes");return !!x&&!x.disabled})()'),
    'daily total editable after activation',45000);
  await replaceField(client,frame,'#daily-budget-minutes','2');
  await click(client,frame,'#daily-budget-form button[type=submit]');
  await until(()=>evalRead(client,sid,
    '!document.querySelector("#sidebar-tool-action-review").hidden'),
    'real trusted daily budget review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,sid,
    'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"]?.groups?.entertainment===2)'),
    'trusted two-minute shared quota',15000);
  note('native-shared-budget-edited',{minutes:2,approvedViaUI:true});
  await click(client,frame,'#manual-site > summary');
  await click(client,frame,'#site-group');
  await press(client,frame,'End','End',35);
  await press(client,frame,'Enter','Enter',13);
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-group").value'),'entertainment');
  await fill(client,frame,'#site-host','127.0.0.1');
  await click(client,frame,'#site-mode');await press(client,frame,'ArrowDown','ArrowDown',40);
  await press(client,frame,'Enter','Enter',13);
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-mode").value'),'always');
  await click(client,frame,'#site-form button[type=submit]');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),'trusted site review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,sid,
    'chrome.storage.local.get('+JSON.stringify(store)+').then(x=>x['+JSON.stringify(store)+']?.sites?.some(s=>s.host==="127.0.0.1"&&s.group==="entertainment"))'),'authorized shared rule');
  note('trusted-domain-approval',{hostname:'127.0.0.1',noQueryStored:true});
  // Native permissions and initial approval were verified before manual editing.
  const rules=await until(async()=>{
    const rows=await evalRead(client,sid,'chrome.declarativeNetRequest.getDynamicRules()');
    return rows.filter(row=>row.id>=730000&&row.id<=730199).length===1?rows:null;
  },'actual DNR rule created');
  note('Chrome-getDynamicRules',{owned:rules.filter(row=>row.id>=730000).map(row=>({id:row.id,regexFilter:row.condition.regexFilter,extensionPath:row.action.redirect?.extensionPath}))});
  const visit=await client.send('Target.createTarget',{url:page});
  const navigated=await until(async()=>{
    const list=(await client.send('Target.getTargets')).targetInfos;
    const target=list.find(x=>x.targetId===visit.targetId);
    return target?.url?.includes('/stay-focus/blocked-always.html')?target.url:null;
  },'actual HTTP main-frame blocked via Chrome DNR',16000);
  assert.ok(navigated.startsWith('chrome-extension://'+id+'/stay-focus/blocked-always.html'));
  const blockedSession=(await client.send('Target.attachToTarget',{targetId:visit.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},blockedSession);await client.send('Page.enable',{},blockedSession);
  const blockedText=await until(async()=>{
    const value=await evalRead(client,blockedSession,'document.querySelector("#reason")?.textContent||""');
    return value.includes('始终限制')?value:null;
  },'real local extension block page rendered with correct reason');
  assert.ok(blockedText.includes('始终限制'),'rule redirect must deliver the actual block page UI');
  report.screenshots.push(await screenshot(client,blockedSession,'actual-dnr-blocked-page'));
  report.actualNavigation='PASS';note('real-http-navigation',{status:'PASS',
    urlPath:'/stay-focus/blocked-always.html',renderedReason:blockedText});

  // Use the trusted review to change the localhost always-block to a
  // shared two-minute budget; never change storage usage or native rules.
  await click(client,frame,'#site-mode');
  await press(client,frame,'ArrowUp','ArrowUp',38);
  await press(client,frame,'Enter','Enter',13);
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-mode").value'),'limit');
  await replaceField(client,frame,'#site-minutes','2');
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-minutes").value'),'2');
  await click(client,frame,'#site-form button[type=submit]');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),
    'trusted two-minute shared quota review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(async()=>{
    const result=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {site:x["'+store+'"]?.sites?.find(s=>s.host==="127.0.0.1"),'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length}})()');
    return result.site?.mode==='limit'&&result.site.minutes===2&&
      result.site.group==='entertainment'&&result.owned===0;
  },'real UI changed from always block to unused two-minute shared quota');
  // Configure another LOCAL host through the same reviewed sandbox UI.
  // Its time contributes to the existing g:entertainment ledger.
  await replaceField(client,frame,'#site-host','localhost');
  await click(client,frame,'#site-form button[type=submit]');
  await until(()=>evalRead(client,sid,
    '!document.querySelector("#sidebar-tool-action-review").hidden'),
    'second loopback domain shares the trusted budget');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,sid,
    'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"]?.sites?.some('+
    's=>s.host==="localhost"&&s.group==="entertainment"&&s.mode==="limit"))'),
    'second actual site joins the same shared group');
  report.quota='IN_PROGRESS';
  note('real-ui-two-minute-shared-quota',{minutes:2,
    domains:['127.0.0.1','localhost'],storageUsageWasNotModified:true});

  // This creates a real HTTP tab and makes it the focused, active Chrome tab.
  // Browser tabs/window activation and CDP mouse events are actual browser
  // operations; they do not bypass the service or synthesize usage/storage.
  const live=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===live.targetId)?.url===page;
  },'HTTP page allowed before quota',15000);
  await client.send('Target.activateTarget',{targetId:live.targetId});
  let liveSession=(await client.send('Target.attachToTarget',
    {targetId:live.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},liveSession);
  await client.send('Page.enable',{},liveSession);
  const focusedTab=await evalRead(client,sid,'(async()=>{'+
    'const tabs=await chrome.tabs.query({url:'+JSON.stringify(page)+'});'+
    'const tab=tabs.at(-1);if(!tab)return null;'+
    'await chrome.windows.update(tab.windowId,{focused:true});'+
    'await chrome.tabs.update(tab.id,{active:true});'+
    'return {tabId:tab.id,windowId:tab.windowId}})()');
  assert.ok(Number.isInteger(focusedTab?.tabId),'actual HTTP tab must exist');
  report.screenshots.push(await screenshot(client,liveSession,'quota-active-http-before-limit'));
  const quotaObservation='(async()=>{'+
    'const [saved,rules,win]=await Promise.all(['+
    'chrome.storage.local.get("'+store+'"),chrome.declarativeNetRequest.getDynamicRules(),'+
    'chrome.windows.getLastFocused()]);'+
    'const tabs=await chrome.tabs.query({active:true,windowId:win.id});'+
    'return {usedMs:saved["'+store+'"]?.usage?.["g:entertainment"]||0,'+
    'rules:rules.filter(r=>r.id>=730000&&r.id<=730199).map(r=>({id:r.id,path:r.action?.redirect?.extensionPath})),'+
    'idle:await chrome.idle.queryState(60),focused:win.focused,'+
    'activeUrl:tabs[0]?.url||null,tabId:tabs[0]?.id||null};})()';
  const quotaStart=Date.now();
  let reached=null,secondTarget=null,usedAtSwitch=null,secondTabId=null;
  while(Date.now()-quotaStart<240000){
    // Keep performing real interaction with the opened Chrome page during
    // the quota window; the idle API is still independently read and recorded.
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',
      x:60+(report.quotaTrace.length%3)*24,y:85},liveSession);
    const snapshot=await evalRead(client,sid,quotaObservation);
    const elapsedMs=Date.now()-quotaStart;
    const notice=await evalRead(client,liveSession,
      '!!document.querySelector("[data-opendesk-focus-notice]")').catch(()=>false);
    report.quotaTrace.push({elapsedMs,...snapshot,pageNotice:notice});
    // Spend the first chargeable interval on the first host and the remaining
    // quota on the other. Switching tabs MUST invalidate the old checkpoint;
    // neither tab can double-charge the one global ledger.
    if(!secondTarget&&snapshot.usedMs>=30000&&snapshot.usedMs<120000){
      usedAtSwitch=snapshot.usedMs;
      secondTarget=await client.send('Target.createTarget',{url:secondPage});
      await until(async()=>{
        const targets=(await client.send('Target.getTargets')).targetInfos;
        return targets.find(row=>row.targetId===secondTarget.targetId)?.url===secondPage;
      },'second real localhost HTTP page loads before shared quota',15000);
      await client.send('Target.activateTarget',{targetId:secondTarget.targetId});
      liveSession=(await client.send('Target.attachToTarget',
        {targetId:secondTarget.targetId,flatten:true})).sessionId;
      await client.send('Runtime.enable',{},liveSession);
      await client.send('Page.enable',{},liveSession);
      secondTabId=await evalRead(client,sid,'(async()=>{'+
        'const tabs=await chrome.tabs.query({url:'+JSON.stringify(secondPage)+'});'+
        'const tab=tabs.at(-1);if(!tab)return null;'+
        'await chrome.windows.update(tab.windowId,{focused:true});'+
        'await chrome.tabs.update(tab.id,{active:true});return tab.id;})()');
      assert.ok(Number.isInteger(secondTabId),'second loopback page must be a native Chrome tab');
      note('real-active-site-switch',{firstHost:'127.0.0.1',secondHost:'localhost',
        usedMs:usedAtSwitch,secondTabId});
    }
    if(notice&&report.pageReminder!=='PASS'){
      report.pageReminder='PASS';
      report.screenshots.push(await screenshot(client,liveSession,'real-one-minute-page-reminder'));
      note('native-in-page-remaining-reminder',{minutes:1,actualContentScript:true});
    }
    if(snapshot.usedMs>=120000&&snapshot.rules.some(r=>r.path==='/stay-focus/blocked-quota.html')){
      reached={elapsedMs,...snapshot};break;
    }
    await sleep(3000);
  }
  if(!reached){
    report.quota='FAIL';
    throw Error('Real active two-minute shared quota never created Chrome quota DNR rule: '+
      JSON.stringify(report.quotaTrace.slice(-6)));
  }
  assert.ok(report.quotaTrace.some(x=>x.usedMs<120000),
    'quota trace needs actual pre-threshold foreground observations');
  assert.ok(report.quotaTrace.some(x=>x.focused&&x.idle==='active'&&x.tabId===focusedTab.tabId),
    'first actual website must have focused non-idle time');
  assert.ok(Number.isInteger(secondTabId)&&usedAtSwitch>=30000&&reached.usedMs-usedAtSwitch>=45000,
    'second actual website must contribute substantial positive time to the same pool');
  assert.ok(report.quotaTrace.some(x=>x.focused&&x.idle==='active'&&x.tabId===secondTabId&&
    x.activeUrl===secondPage),'real foreground observation must include the second host');
  report.realSharedTwoHosts='PASS';
  note('native-shared-two-sites',{hosts:['127.0.0.1','localhost'],
    firstSiteUsedMs:usedAtSwitch,secondSiteUsedMs:reached.usedMs-usedAtSwitch,
    totalUsedMs:reached.usedMs,storageUsageWasNotModified:true});
  assert.equal(report.pageReminder,'PASS','1-minute remaining notice must render in the actual isolated content script');
  report.quotaEnforcedElapsedMs=reached.elapsedMs;
  report.quotaOvershootMs=reached.elapsedMs-120000;
  note('actual-elapsed-quota-exhaustion',{usedMs:reached.usedMs,
    elapsedMs:reached.elapsedMs,overshootMs:report.quotaOvershootMs,
    actualDnrRules:reached.rules,traceRecords:report.quotaTrace.length});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const blocked=targetId=>targets.find(row=>row.targetId===targetId)?.url?.includes(
      '/stay-focus/blocked-quota.html');
    return blocked(live.targetId)&&blocked(secondTarget.targetId);
  },'both previously open sites redirected by actual Chrome quota DNR',15000);
  report.screenshots.push(await screenshot(client,liveSession,'existing-tab-quota-blocked'));
  const quotaVisit=await client.send('Target.createTarget',{url:page});
  const quotaRedirect=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===quotaVisit.targetId)?.url?.includes('/stay-focus/blocked-quota.html');
  },'new real HTTP main-frame navigation denied by quota DNR',15000);
  assert.ok(quotaRedirect.startsWith('chrome-extension://'+id+'/stay-focus/blocked-quota.html'));
  const visitSecond=await client.send('Target.createTarget',{url:secondPage});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===visitSecond.targetId)?.url?.includes(
      '/stay-focus/blocked-quota.html');
  },'second real HTTP hostname blocked by the same quota',15000);
  report.actualQuotaNavigation='PASS';
  report.quota='PASS';
  note('quota-real-http-navigation',{status:'PASS',urlPath:'/stay-focus/blocked-quota.html'});
  // The same ledger exhausts every auto-enrolled entertainment domain.
  // These are real Chrome HTTPS main-frame navigations (not DNR mocks); no
  // external site request is necessary because Chrome must redirect first.
  report.defaultDomainDnr=[];
  for(const hostname of ['www.youtube.com','www.tiktok.com']){
    const visitDomain=await client.send('Target.createTarget',{url:'https://'+hostname+'/'});
    const result=await until(async()=>{
      const targets=(await client.send('Target.getTargets')).targetInfos;
      return targets.find(row=>row.targetId===visitDomain.targetId)?.url?.includes(
        '/stay-focus/blocked-quota.html')||false;
    },'real shared-pool HTTPS DNR for '+hostname,15000);
    assert.equal(result,true,'default enrolled '+hostname+' must be blocked at shared quota');
    report.defaultDomainDnr.push({hostname,redirect:'/stay-focus/blocked-quota.html'});
  }
  note('real-default-domain-shared-dnr',{domains:report.defaultDomainDnr,
    usageWasNotFabricated:true});

  // Native lifecycle: the user can stop enforcement without uninstalling and
  // re-enable with the original daily quota still exhausted. Never write
  // DNR rules or usage directly from the test harness.
  const stopVisible=await evalRead(client,sid,
    '(()=>{const node=document.querySelector("#stay-focus-disable");'+
    'return !!node&&!node.disabled&&node.getClientRects().length>0})()');
  if(!stopVisible)await click(client,sid,'#sidebar-tool-settings-open');
  await click(client,sid,'#stay-focus-disable');
  await until(async()=>{
    const state=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {enabled:x["'+store+'"]?.enabled,'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length}})()');
    return state.enabled===false&&state.owned===0?state:null;
  },'Chrome DNR rule retired after real trusted disable',15000);
  const pausedPage=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===pausedPage.targetId)?.url===page;
  },'actual HTTP navigation restored by disabling Stay Focus',15000);
  report.disabled='PASS';
  note('trusted-disable-restores-access',{url:page,ownedRules:0});

  await click(client,sid,'#stay-focus-enable-native');
  await until(async()=>{
    const state=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {enabled:x["'+store+'"]?.enabled,'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199&&'+
      'r.action?.redirect?.extensionPath==="/stay-focus/blocked-quota.html").length}})()');
    return state.enabled===true&&state.owned>=2?state:null;
  },'real reenable restores exhausted quota rule',15000);
  const reblocked=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===reblocked.targetId)?.url?.includes('/stay-focus/blocked-quota.html');
  },'real HTTP restriction resumes when Stay Focus is reenabled',15000);
  report.reenabled='PASS';
  note('reenable-restores-quota-restriction',{quotaPersisted:true,ruleOwned:true});

  // Actual full Chrome restart with the SAME profile, not only an MV3 worker
  // restart or a storage/permission fixture. Do not seed rules or usage.
  const beforeRestart=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+
    store+'");return x["'+store+'"]?.usage?.["g:entertainment"]||0})()');
  assert.ok(beforeRestart>=120000,'real exhausted shared quota must survive restart');
  const priorChrome=chrome;
  // Browser.close may terminate CDP before its response frame arrives.
  await client.send('Browser.close').catch(()=>{});
  await until(()=>priorChrome.exitCode!==null||priorChrome.signalCode!==null,
    'original Chrome process really exited',25000);
  client.close();client=null;
  chrome=launchChrome();captureChromeErrors(chrome);
  const reopenedVersion=await until(async()=>{
    const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const port=Number(source?.split('\n')[0]);if(!(port>0))return null;
    try{const response=await fetch('http://127.0.0.1:'+port+'/json/version');
      return response.ok?await response.json():null;}catch{return null;}
  },'restarted Chrome CDP with the same profile',30000);
  client=connect(reopenedVersion.webSocketDebuggerUrl);await client.ready;
  const restoredId=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'restarted installed extension SW',20000);
  assert.equal(restoredId,id,'Chrome restart must retain the exact installed extension identity');
  const reopenedUI=await client.send('Target.createTarget',{
    url:'chrome-extension://'+restoredId+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const reopenedSession=(await client.send('Target.attachToTarget',
    {targetId:reopenedUI.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},reopenedSession);
  await client.send('Page.enable',{},reopenedSession);
  const restoredQuota=await until(async()=>{
    const value=await evalRead(client,reopenedSession,'(async()=>{const x=await chrome.storage.local.get("'+
      store+'");const rules=await chrome.declarativeNetRequest.getDynamicRules();return {'+
      'enabled:x["'+store+'"]?.enabled,usage:x["'+store+'"]?.usage?.["g:entertainment"]||0,'+
      'quotaRules:rules.filter(r=>r.id>=730000&&r.id<=730199&&'+
      'r.action?.redirect?.extensionPath==="/stay-focus/blocked-quota.html").length}})()');
    return value.enabled===true&&value.usage===beforeRestart&&value.quotaRules>=2?value:null;
  },'persisted quota and owned DNR rule after full Chrome restart',22000);
  const postRestartVisit=await client.send('Target.createTarget',{url:page});
  const redirectedAfterRestart=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===postRestartVisit.targetId)?.url?.includes(
      '/stay-focus/blocked-quota.html');
  },'actual HTTP navigation still blocked after Chrome restart',15000);
  assert.ok(redirectedAfterRestart.startsWith('chrome-extension://'+id+'/'));
  report.restart='PASS';
  note('chrome-restart-restores-quota-and-navigation',{sameProfile:true,
    extensionId:restoredId,usageMs:restoredQuota.usage,quotaRules:restoredQuota.quotaRules});

  // Reopen the REAL Side Panel for removal; don't mutate extension storage
  // using CDP or silently remove the package behind the user's UI.
  await click(client,reopenedSession,'#catalog-open-dev-sidebar');
  const restoredContext=await until(async()=>{
    const contexts=await evalRead(client,reopenedSession,
      'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return contexts.find(row=>row.documentUrl?.includes('/ui/tool.html')&&row.documentId);
  },'Side Panel reopened after Chrome restart');
  sid=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const target=targets.find(row=>row.url===restoredContext.documentUrl);
    return target?(await client.send('Target.attachToTarget',
      {targetId:target.targetId,flatten:true})).sessionId:null;
  },'restarted Side Panel CDP');
  await client.send('Runtime.enable',{},sid);
  await client.send('Page.enable',{},sid);
  await click(client,sid,'#tab-tools');
  await click(client,sid,installed);
  await click(client,sid,'#sidebar-tool-remove');
  await click(client,sid,'#sidebar-tool-inline-remove-confirm');
  await until(async()=>{
    const result=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get(['+
      JSON.stringify(store)+',"opendesk.sidebar-tools.installed.v1"]);'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {present:Object.hasOwn(x,'+
      JSON.stringify(store)+'),installed:x["opendesk.sidebar-tools.installed.v1"]?.some(t=>t.id==="stay-focus"),owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length};})()');
    return result.present===false&&result.installed===false&&result.owned===0?result:null;
  },'uninstall removes independent data and all DNR rules',15000);
  const restored=await client.send('Target.createTarget',{url:page});
  const allowedURL=await until(async()=>{
    const x=(await client.send('Target.getTargets')).targetInfos.find(row=>row.targetId===restored.targetId);
    return x?.url===page?x.url:null;
  },'real HTTP becomes available after removal',12000);
  assert.equal(allowedURL,page);
  report.unregister='PASS';report.uninstall='PASS';passed=true;
  note('uninstall-restores-access',{realHTTP:true,ownedRules:0});
});