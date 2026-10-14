// Native macOS Chrome acceptance: installed release -> trusted opt-in ->
// actual HTTP navigation redirected by Chrome DNR -> uninstall -> URL restores.
// No fake DNR, storage writes, synthetic DOM clicks or user-grant injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {lookup} from 'node:dns/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
const BIN=process.env.CHROME_BIN,ROOT=path.resolve('dist/production');
const OUT=path.resolve(process.env.OPENDESK_FOCUS_NATIVE_EVIDENCE||'artifacts/stay-focus-r1-native');
const ENABLED=process.env.OPENDESK_STAY_FOCUS_NATIVE==='1';
const LIFECYCLE_ONLY=process.env.OPENDESK_FOCUS_NATIVE_LIFECYCLE_ONLY==='1';
const protocol='opendesk.stay-focus.v1',store='opendesk.stay-focus.state.v1';
const inputParents=new Map();
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
  const parent=inputParents.get(session);
  // Scroll with actual input, never scrollIntoView or DOM focus/value writes.
  const point=await until(async()=>{
    const p=await evalRead(c,session,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});
      if(!n||n.disabled||!n.getClientRects().length)return null;
      const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,width:innerWidth,height:innerHeight,w:r.width,h:r.height,
        hit:x>0&&x<innerWidth&&y>0&&y<innerHeight&&n.contains(document.elementFromPoint(x,y))};})()`);
    if(!p)return false;
    if(p.hit&&p.w>0&&p.h>0){
      if(Boolean(parent)){
        const frame=await evalRead(c,parent,`(()=>{const n=document.querySelector("#sidebar-tool-frame iframe"),r=n.getBoundingClientRect();
          const x=r.x+${p.x},y=r.y+${p.y};return {x:r.x,y:r.y,width:innerWidth,height:innerHeight,
          hit:x>0&&x<innerWidth&&y>${p.h/2}+85&&y<innerHeight-${p.h/2}-8&&document.elementFromPoint(x,y)===n};})()`);
        if(frame.hit)return {...p,x:p.x+frame.x,y:p.y+frame.y};
        const globalY=p.y+frame.y;
        await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.max(8,Math.min(frame.width-8,p.x+frame.x)),
          y:Math.max(8,Math.min(frame.height-8,Math.max(frame.y+16,frame.height/2))),deltaX:0,
          deltaY:globalY<85?-180:180},parent);
        await sleep(250);
        return false;
      }
      return p;
    }
    if(p.y<0||p.y>=p.height){
      const frame=Boolean(parent)?await evalRead(c,parent,'(()=>{const r=document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect();return {x:r.x,y:r.y};})()'):{x:0,y:0};
      // Host toolbar controls can scroll above a long sandbox. Wheel in the
      // host gutter, otherwise Chrome scrolls the iframe instead of the host.
      await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:parent?frame.x+Math.max(8,Math.min(p.width-8,p.x)):8,
        y:frame.y+Math.max(8,Math.min(p.height-8,p.height/2)),deltaX:0,deltaY:p.y<0?-250:250},Boolean(parent)?parent:session);
    }
    return false;
  },'Visible real control '+selector);
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},parent||session);
  for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',
    {type,x:point.x,y:point.y,button:'left',clickCount:1},Boolean(parent)?parent:session);

}
async function fill(c,session,selector,value){
  await focusField(c,session,selector);
  await c.send('Input.insertText',{text:value},inputParents.get(session)||session);
  assert.equal(await evalRead(c,session,'document.querySelector('+JSON.stringify(selector)+').value'),value);
}
async function focusField(c,session,selector){
  // A native macOS select popup may consume the first click merely to close.
  // Verify focus before typing; repeated focus clicks cannot save any policy.
  await until(async()=>{
    await click(c,session,selector);
    return evalRead(c,session,'document.activeElement===document.querySelector('+JSON.stringify(selector)+')');
  },'native field focus '+selector);
}
// Real CDP keyboard input, not changing DOM values or local usage via evaluate.
async function replaceField(c,session,selector,value){
  await focusField(c,session,selector);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',
    modifiers:4,commands:['selectAll']},inputParents.get(session)||session);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',
    modifiers:4},inputParents.get(session)||session);
  await c.send('Input.insertText',{text:value},inputParents.get(session)||session);
  assert.equal(await evalRead(c,session,'document.querySelector('+JSON.stringify(selector)+').value'),
    value,'native keyboard replacement must actually replace '+selector);
}
async function press(c,session,key,code,virtualKey){
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtualKey},inputParents.get(session)||session);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey},inputParents.get(session)||session);
}
test('Real Chrome default sharing, live page reminder, DNR and uninstall',{skip:!ENABLED,timeout:720000},async t=>{
  assert.equal(process.platform,'darwin','Native CI must be macOS');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0);
  const packageFile=path.join(ROOT,'official-tools/stay-focus/stay-focus.opendesk-tool.json');
  const bytes=await readFile(packageFile),pkg=JSON.parse(bytes);
  const sourceConfig=JSON.parse(await readFile(path.resolve('examples/sidebar-tools/stay-focus/tool.config.json'),'utf8'));
  assert.equal(pkg.id,'stay-focus');
  assert.equal(pkg.version,sourceConfig.version,'native candidate must match the current official source version');
  await mkdir(OUT,{recursive:true});
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-stay-focus-r1-'));
  const serve=(_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><title>Stay Focus native HTTP test</title><h1>Allowed site before rules</h1>');
  };
  // Two different loopback hostnames, two real Chrome HTTP tabs, ONE trusted
  // entertainment budget. Do not depend on live third-party network access.
  const http=createServer(serve),localHttp=createServer(serve);
  await new Promise((resolve,reject)=>{
    http.once('error',reject);
    http.listen(0,'127.0.0.1',()=>{http.removeListener('error',reject);resolve();});
  });
  await new Promise((resolve,reject)=>{
    // Fail explicitly if this macOS runner unexpectedly lacks IPv6 loopback.
    // Do not leave a pending Promise or misreport a website DNR failure.
    localHttp.once('error',reject);
    localHttp.listen(0,'::1',()=>{localHttp.removeListener('error',reject);resolve();});
  });
  const page='http://127.0.0.1:'+http.address().port+'/real-navigation';
  const secondPage='http://localhost:'+localHttp.address().port+'/real-navigation';
  const chromeArgs=['--use-mock-keychain','--password-store=basic','--no-sandbox',
    '--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+ROOT,'--load-extension='+ROOT,'about:blank'];
  const launchChrome=()=>spawn(BIN,chromeArgs,{stdio:['ignore','ignore','pipe']});
  let chrome=launchChrome();
  let errors='',client=null,passed=false,diagnosticSessions=[];
  const swBytes=await readFile(path.join(ROOT,'sw.js'));
  const report={candidate:process.env.GITHUB_SHA||null,loadedRoot:ROOT,
    profileDir:profile,localhostAddresses:await lookup('localhost',{all:true}),
    httpListeners:[http.address(),localHttp.address()],
    chromeBin:BIN,swBytes:swBytes.length,swSHA256:createHash('sha256').update(swBytes).digest('hex'),
    pkgSHA256:createHash('sha256').update(bytes).digest('hex'),
    nativeChrome:'NOT_TESTED',approval:'NOT_TESTED',actualNavigation:'NOT_TESTED',
    quota:'NATIVE_NOT_TESTED',zeroConfig:'NOT_TESTED',pageReminder:'NOT_TESTED',
    realSharedTwoHosts:'NOT_TESTED',quotaTrace:[],screenshots:[],
    background:'NOT_TESTED',closedSidePanel:'NOT_TESTED',workerRestart:'NOT_TESTED',
    permissionRevocation:'NOT_TESTED',otherTools:'NOT_TESTED',
    disabled:'NOT_TESTED',reenabled:'NOT_TESTED',restart:'NOT_TESTED',
    unregister:'NOT_TESTED',uninstall:'NOT_TESTED',steps:[]};
  const note=(name,details)=>{report.steps.push({name,...details});console.log('STAY_FOCUS_NATIVE '+name+' '+JSON.stringify(details));};
  const captureChromeErrors=process=>process.stderr.on('data',x=>{
    errors=(errors+String(x)).slice(-2200);
  });
  captureChromeErrors(chrome);
  t.after(async()=>{
    if(client&&!passed){
      report.failureUI=[];
      for(const {name,session} of diagnosticSessions){
        try{report.failureUI.push({name,...await evalRead(client,session,
          '(()=>({text:document.body.innerText,fields:[...document.querySelectorAll("input")].map(x=>({id:x.id,value:x.value,valid:x.checkValidity()}))}))()')});
          report.screenshots.push(await screenshot(client,session,'failure-'+name));}catch{}
      }
    }
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
  report.debugPort=remote;
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
  let sideTargetId;
  let sid=await until(async()=>{const x=(await client.send('Target.getTargets')).targetInfos;
    const target=x.find(row=>row.url===context.documentUrl);if(!target)return null;
    sideTargetId=target.targetId;
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
  let frame=await until(async()=>{
    const x=(await client.send('Target.getTargets')).targetInfos;
    const target=x.find(row=>row.type==='iframe'&&row.url?.includes('/sidebar-tools/sandbox.html'));
    return target?(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId:null;
  },'sandbox iframe');
  await client.send('Runtime.enable',{},frame);await client.send('Page.enable',{},frame);
  inputParents.set(frame,sid);
  diagnosticSessions=[{name:'side-panel',session:sid},{name:'sandbox',session:frame}];
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
  assert.equal(report.nativePermissionBefore,false,'clean profile must not pre-grant native enforcement');
  const beforeGrant=await evalRead(client,sid,
    'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"]||null)');
  assert.ok(!beforeGrant?.enabled&&!beforeGrant?.authorizedHash,'unapproved tool must not enforce');
  const beforeGrantVisit=await client.send('Target.createTarget',{url:page});
  await until(async()=>{const rows=(await client.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.targetId===beforeGrantVisit.targetId)?.url===page;},'HTTP available before opt-in');
  const beforeGrantSession=(await client.send('Target.attachToTarget',{targetId:beforeGrantVisit.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},beforeGrantSession);
  await until(()=>evalRead(client,beforeGrantSession,'document.querySelector("h1")?.textContent==="Allowed site before rules"'),
    'IPv4 real HTTP content loaded, not an error URL');
  await client.send('Target.activateTarget',{targetId:ui.targetId});
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
    '{managed:v.sites.length,minutes:v.groups.entertainment,used:v.usage,sites:v.sites}:null})()'),
    'true first-activation default 30-minute shared pool',15000);
  report.zeroConfig='PASS';report.approval='PASS';
  assert.equal(defaultPool.managed,11);
  assert.ok(defaultPool.sites.every(site=>site.enabled&&site.mode==='limit'&&site.group==='entertainment'));
  assert.ok(!defaultPool.sites.some(site=>site.host==='github.com'),'work sites excluded by default');
  note('native-zero-config',defaultPool);
  report.screenshots.push(await screenshot(client,sid,'zero-config-30-minute-pool'));
  // Settings deliberately hides the sandbox. Return via the shipped toggle
  // before editing the tool rather than clicking an invisible iframe control.
  await click(client,sid,'#sidebar-tool-settings-open');
  // The native acceptance uses two minutes of real Chrome browsing, never
  // edits storage usage or creates a fake DNR rule. That also crosses the
  // last-one-minute page reminder with no 30-minute stress run.
  await until(()=>evalRead(client,frame,
    '(()=>{const x=document.querySelector("#daily-budget-minutes");return !!x&&!x.disabled})()'),
    'daily total editable after activation',45000);
  await replaceField(client,frame,'#daily-budget-minutes','2');
  await click(client,frame,'#daily-budget-save');
  await until(()=>evalRead(client,sid,
    '!document.querySelector("#sidebar-tool-action-review").hidden'),
    'real trusted daily budget review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,sid,
    'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"]?.groups?.entertainment===2)'),
    'trusted two-minute shared quota',15000);
  note('native-shared-budget-edited',{minutes:2,approvedViaUI:true});
  if(process.env.OPENDESK_FOCUS_NATIVE_MANUAL_SITES==='1'){
    report.siteEntryDriver='ASSISTED_NATIVE_UI';
    await click(client,frame,'#manual-site > summary');
    note('await-native-site-entry',{hosts:['127.0.0.1','localhost'],group:'entertainment',minutes:2});
    await until(()=>evalRead(client,sid,'chrome.storage.local.get("'+store+'")'+
      '.then(x=>["127.0.0.1","localhost"].every(host=>x["'+store+'"]?.sites?.some('+
      's=>s.host===host&&s.enabled&&s.group==="entertainment"&&s.mode==="limit")))'),
      'two hosts saved via assisted native UI',360000);
  }else{
  await click(client,frame,'#manual-site > summary');
  await click(client,frame,'#site-group');
  await press(client,frame,'End','End',35);
  await press(client,frame,'Enter','Enter',13);
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-group").value'),'entertainment');
  await fill(client,frame,'#site-host','127.0.0.1');
  // The macOS menu used by always-block mode cannot be driven by CDP.
  // Keep that historical scene explicitly blocked and continue the requested
  // shared-quota path with the real UI's default limit mode.
  report.alwaysMode='NATIVE_BLOCKED_MACOS_SELECT_MENU';
  assert.equal(await evalRead(client,frame,'document.querySelector("#site-mode").value'),'limit');
  await click(client,frame,'#site-save');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),
    'trusted two-minute shared quota review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(async()=>{
    const result=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {site:x["'+store+'"]?.sites?.find(s=>s.host==="127.0.0.1"),'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199).length}})()');
    return result.site?.mode==='limit'&&result.site.minutes===15&&
      result.site.group==='entertainment'&&result.owned===0;
  },'real UI saved an unused two-minute shared quota');
  // Configure another LOCAL host through the same reviewed sandbox UI.
  // Its time contributes to the existing g:entertainment ledger.
  await replaceField(client,frame,'#site-host','localhost');
  await click(client,frame,'#site-save');
  await until(()=>evalRead(client,sid,
    '!document.querySelector("#sidebar-tool-action-review").hidden'),
    'second loopback domain shares the trusted budget');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,sid,
    'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"]?.sites?.some('+
    's=>s.host==="localhost"&&s.group==="entertainment"&&s.mode==="limit"))'),
    'second actual site joins the same shared group');
  }
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
    'notices:saved["'+store+'"]?.notices,'+
    'idle:await chrome.idle.queryState(60),focused:win.focused,'+
    'activeUrl:tabs[0]?.url||null,tabId:tabs[0]?.id||null};})()';
  // Leave entertainment pages behind a real work tab. No synthetic idle
  // state or ledger writes enter this test.
  const workTab=await client.send('Target.createTarget',{url:'about:blank'});
  await client.send('Target.activateTarget',{targetId:workTab.targetId});
  await sleep(1500);
  const backgroundBefore=await evalRead(client,uid,quotaObservation);
  await sleep(32000);
  const backgroundAfter=await evalRead(client,uid,quotaObservation);
  assert.equal(backgroundAfter.activeUrl,'about:blank');
  assert.equal(backgroundAfter.usedMs,backgroundBefore.usedMs,'background entertainment must not charge');
  report.background='PASS';note('background-does-not-charge',{before:backgroundBefore,after:backgroundAfter});
  // Use Chrome's own close operation so its Side Panel lifecycle retires the
  // view correctly; killing only its CDP target can leave a dangling view.
  await evalRead(client,uid,'chrome.sidePanel.close({windowId:'+focusedTab.windowId+'})');
  await until(()=>evalRead(client,uid,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(x=>x.length===0)'),
    'Side Panel document really closed');
  diagnosticSessions=[{name:'catalog',session:uid}];
  await client.send('Target.activateTarget',{targetId:live.targetId});
  await evalRead(client,uid,'(async()=>{const rows=await chrome.tabs.query({url:'+JSON.stringify(page)+'});'+
    'await chrome.windows.update(rows.at(-1).windowId,{focused:true});'+
    'await chrome.tabs.update(rows.at(-1).id,{active:true});})()');
  const quotaStart=Date.now();
  let reached=null,secondTarget=null,usedAtSwitch=null,secondTabId=null;
  while(!LIFECYCLE_ONLY&&Date.now()-quotaStart<360000){
    // Keep this isolated test window genuinely foreground while other CFT
    // profiles may exist on the Mac. queryState still supplies native idle.
    const foreground=await evalRead(client,uid,quotaObservation);
    if(!foreground.focused||foreground.tabId!==(secondTabId||focusedTab.tabId)){
      await client.send('Target.activateTarget',{targetId:secondTarget?.targetId||live.targetId});
      await evalRead(client,uid,'chrome.windows.update('+focusedTab.windowId+',{focused:true})');
    }
    // Keep performing real interaction with the opened Chrome page during
    // the quota window; the idle API is still independently read and recorded.
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',
      x:60+(report.quotaTrace.length%3)*24,y:85},liveSession);
    const snapshot=await evalRead(client,uid,quotaObservation);
    const elapsedMs=Date.now()-quotaStart;
    const notice=await evalRead(client,liveSession,
      '!!document.querySelector("[data-opendesk-focus-notice]")').catch(()=>false);
    report.quotaTrace.push({elapsedMs,...snapshot,pageNotice:notice});
    if(report.quotaTrace.length%5===0)note('foreground-quota-observation',{elapsedMs,...snapshot,pageNotice:notice});
    // A sustained native idle/blur interval needs actual Mac activity. Stop
    // that blocked branch while still collecting independent lifecycle proof.
    if(elapsedMs>=45000&&report.quotaTrace.slice(-10).length===10&&
       report.quotaTrace.slice(-10).every(x=>!x.focused||x.idle!=='active'))break;
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
      await until(()=>evalRead(client,liveSession,'document.querySelector("h1")?.textContent==="Allowed site before rules"'),
        'localhost real IPv6 HTTP content loaded, not a DNS error');
      secondTabId=await evalRead(client,uid,'(async()=>{'+
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
      assert.equal(snapshot.notices.thresholds.filter(x=>x===1).length,1,'one-minute ledger deduplicates');
      report.reminderProof={...snapshot.notices,usedMs:snapshot.usedMs,
        count:await evalRead(client,liveSession,'document.querySelectorAll("[data-opendesk-focus-notice]").length')};
      assert.equal(report.reminderProof.count,1,'exactly one page notice');
      report.screenshots.push(await screenshot(client,liveSession,'real-one-minute-page-reminder'));
      note('native-in-page-remaining-reminder',{minutes:1,actualContentScript:true});
    }
    if(snapshot.usedMs>=120000&&snapshot.rules.some(r=>r.path==='/stay-focus/blocked-quota.html')){
      reached={elapsedMs,...snapshot};break;
    }
    await sleep(3000);
  }
  if(!reached){
    const blocked=report.quotaTrace.slice(-10).every(x=>!x.focused||x.idle!=='active');
    report.quota=LIFECYCLE_ONLY?'NOT_TESTED_LIFECYCLE_ONLY':blocked?'NATIVE_BLOCKED_REAL_IDLE_OR_FOCUS':'NATIVE_FAIL';
    report.closedSidePanel=LIFECYCLE_ONLY?'NOT_TESTED_LIFECYCLE_ONLY':blocked?'NATIVE_BLOCKED_REAL_IDLE_OR_FOCUS':'NOT_TESTED_QUOTA_FAILED';
    note('quota-incomplete',{status:report.quota,last:report.quotaTrace.slice(-3)});
  }
  if(reached){
  assert.ok(report.quotaTrace.some(x=>x.usedMs<120000),
    'quota trace needs actual pre-threshold foreground observations');
  assert.ok(report.quotaTrace.some(x=>x.focused&&x.idle==='active'&&x.tabId===focusedTab.tabId),
    'first actual website must have focused non-idle time');
  assert.ok(Number.isInteger(secondTabId)&&usedAtSwitch>=30000&&reached.usedMs-usedAtSwitch>=45000,
    'second actual website must contribute substantial positive time to the same pool');
  assert.ok(report.quotaTrace.some(x=>x.focused&&x.idle==='active'&&x.tabId===secondTabId&&
    x.activeUrl===secondPage),'real foreground observation must include the second host');
  report.realSharedTwoHosts='PASS';
  assert.ok(reached.usedMs-backgroundAfter.usedMs<=reached.elapsedMs+2000,
    'multiple open entertainment tabs must not double-charge elapsed foreground time');
  report.closedSidePanel='PASS';
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
    const url=targets.find(row=>row.targetId===quotaVisit.targetId)?.url;
    return url?.includes('/stay-focus/blocked-quota.html')?url:null;
  },'new real HTTP main-frame navigation denied by quota DNR',15000);
  assert.ok(quotaRedirect.startsWith('chrome-extension://'+id+'/stay-focus/blocked-quota.html'));
  const visitSecond=await client.send('Target.createTarget',{url:secondPage});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(row=>row.targetId===visitSecond.targetId)?.url?.includes(
      '/stay-focus/blocked-quota.html');
  },'second real HTTP hostname blocked by the same quota',15000);
  report.actualQuotaNavigation='PASS';report.actualNavigation='PASS';
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

  }

  // Restart the actual worker while the Side Panel remains closed. Native
  // Chrome's own ServiceWorker domain stops it; reopening the shipped UI
  // wakes a fresh worker and must recover the existing quota and DNR.
  const oldWorker=(await client.send('Target.getTargets')).targetInfos.find(x=>
    x.type==='service_worker'&&x.url==='chrome-extension://'+id+'/sw.js');
  await client.send('ServiceWorker.enable',{},uid);
  await client.send('ServiceWorker.stopAllWorkers',{},uid);
  await until(async()=>!(await client.send('Target.getTargets')).targetInfos.some(x=>x.targetId===oldWorker.targetId),
    'original Chrome worker stopped');
  await client.send('Target.activateTarget',{targetId:ui.targetId});
  await click(client,uid,'#catalog-open-dev-sidebar');
  const nextContext=await until(()=>evalRead(client,uid,
    'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(x=>x[0]||null)'), 'Side Panel reopen');
  sid=await until(async()=>{const targets=(await client.send('Target.getTargets')).targetInfos;
    const candidates=targets.filter(x=>x.targetId!==ui.targetId&&x.type!=='iframe'&&
      x.url.startsWith('chrome-extension://'+id+'/ui/tool.html'));
    const target=targets.find(x=>x.url===nextContext.documentUrl)||(candidates.length===1?candidates[0]:null);
    if(!target)return null;sideTargetId=target.targetId;
    return (await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;},'reopened panel target');
  await client.send('Runtime.enable',{},sid);await client.send('Page.enable',{},sid);
  await click(client,sid,'#tab-tools');await click(client,sid,installed);
  frame=await until(async()=>{const target=(await client.send('Target.getTargets')).targetInfos.find(x=>x.type==='iframe'&&x.url.includes('/sidebar-tools/sandbox.html'));
    return target?(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId:null;},'reopened sandbox');
  await client.send('Runtime.enable',{},frame);inputParents.set(frame,sid);
  diagnosticSessions=[{name:'side-panel',session:sid},{name:'sandbox',session:frame}];
  const nextWorker=await until(async()=>(await client.send('Target.getTargets')).targetInfos.find(x=>
    x.type==='service_worker'&&x.url===oldWorker.url&&x.targetId!==oldWorker.targetId),'fresh Chrome worker');
  const workerQuota=await evalRead(client,uid,quotaObservation);
  assert.ok(workerQuota.usedMs>=backgroundAfter.usedMs,'fresh worker retains recorded usage');
  if(reached)assert.ok(workerQuota.usedMs>=120000&&workerQuota.rules.length>=2,'fresh worker restores exhausted rules');
  report.workerRestart=reached?'PASS':'PASS_DATA_ONLY_DNR_NOT_TESTED';note('real-worker-restart',{old:oldWorker.targetId,current:nextWorker.targetId,quota:workerQuota});

  await until(()=>evalRead(client,frame,'!!document.querySelector("#managed-site-details")'),'reopened tool rendered');
  await click(client,frame,'#managed-site-details > summary');
  await click(client,frame,'button[aria-label="暂停 youtube.com"]');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),'pause site trusted review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,uid,'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"].sites.some(s=>s.host==="youtube.com"&&!s.enabled))'),
    'individual site paused');
  report.sitePause=reached?'PASS':'PASS_UI_STATE_ONLY';
  await click(client,frame,'button[aria-label="恢复 youtube.com"]');
  await until(()=>evalRead(client,sid,'!document.querySelector("#sidebar-tool-action-review").hidden'),'resume site trusted review');
  await click(client,sid,'#sidebar-tool-action-continue');
  await until(()=>evalRead(client,uid,'chrome.storage.local.get("'+store+'").then(x=>x["'+store+'"].sites.some(s=>s.host==="youtube.com"&&s.enabled))'),
    'individual site restored');

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
  report.disabled=reached?'PASS':'PASS_STATE_ONLY_NO_ACTIVE_DNR';
  note('trusted-disable-restores-access',{url:page,ownedRules:0});

  await click(client,sid,'#stay-focus-enable-native');
  const reenableProof=await until(async()=>{
    const state=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+store+'");'+
      'const rules=await chrome.declarativeNetRequest.getDynamicRules();return {enabled:x["'+store+'"]?.enabled,'+
      'owned:rules.filter(r=>r.id>=730000&&r.id<=730199&&'+
      'r.action?.redirect?.extensionPath==="/stay-focus/blocked-quota.html").length}})()');
    return state.enabled===true&&(reached?state.owned>=2:state.owned===0)?state:null;
  },'trusted reenable state and rule readback',15000);
  const reblocked=await client.send('Target.createTarget',{url:page});
  await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const url=targets.find(row=>row.targetId===reblocked.targetId)?.url;
    return reached?url?.includes('/stay-focus/blocked-quota.html'):url===page;
  },'real HTTP restriction resumes when Stay Focus is reenabled',15000);
  report.reenabled=reached?'PASS':'PASS_STATE_ONLY_QUOTA_NOT_TESTED';
  note('reenable-state-and-rule-readback',{enabled:reenableProof.enabled,
    ownedQuotaRules:reenableProof.owned,exhaustedQuotaTested:Boolean(reached)});

  // Actual full Chrome restart with the SAME profile, not only an MV3 worker
  // restart or a storage/permission fixture. Do not seed rules or usage.
  const beforeRestart=await evalRead(client,sid,'(async()=>{const x=await chrome.storage.local.get("'+
    store+'");return x["'+store+'"]?.usage?.["g:entertainment"]||0})()');
  if(reached)assert.ok(beforeRestart>=120000,'real exhausted shared quota must survive restart');
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
    return value.enabled===true&&value.usage===beforeRestart&&(reached?value.quotaRules>=2:value.quotaRules===0)?value:null;
  },'persisted quota and owned DNR rule after full Chrome restart',22000);
  const postRestartVisit=await client.send('Target.createTarget',{url:page});
  const redirectedAfterRestart=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const url=targets.find(row=>row.targetId===postRestartVisit.targetId)?.url;
    return (reached?url?.includes('/stay-focus/blocked-quota.html'):url===page)?url:null;
  },'actual HTTP navigation still blocked after Chrome restart',15000);
  if(reached)assert.ok(redirectedAfterRestart.startsWith('chrome-extension://'+id+'/'));
  report.restart=reached?'PASS':'PASS_DATA_ONLY_EXHAUSTED_DNR_NOT_TESTED';
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
  report.unregister='PASS';report.uninstall=reached?'PASS':'PASS_DATA_ONLY_ACTIVE_DNR_NOTICE_NOT_TESTED';
  passed=report.quota==='PASS';
  note('uninstall-restores-access',{realHTTP:true,ownedRules:0,hadActiveDnr:!!reached});
  assert.equal(report.quota,'PASS','native shared quota must pass; independent lifecycle evidence does not replace it');
});
