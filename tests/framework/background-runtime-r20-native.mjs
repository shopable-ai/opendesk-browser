// Real Mac Chromium acceptance for the public finite background SDK.
// Input helpers below retain the existing Stay Focus CDP file/pointer path.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
const inputParents=new Map();
let OUT;
function connect(url,onEvent=()=>{}){
  const socket=new WebSocket(url),waiting=new Map();let serial=0;
  const ready=new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(!msg.id){onEvent(msg);return;}
    const p=waiting.get(msg.id);if(!p)return;
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

async function nativeSelectToolPackage(c,session,filename){
  await c.send('DOM.enable',{},session);
  const document=await c.send('DOM.getDocument',{depth:1},session);
  const field=await c.send('DOM.querySelector',{
    nodeId:document.root.nodeId,selector:'#sidebar-tool-file'
  },session);
  assert.ok(field.nodeId>0,'visible Browser import must own a real file input');
  await c.send('DOM.setFileInputFiles',{files:[filename],nodeId:field.nodeId},session);
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
    // The fixed five-tab header can cover a control whose center is still
    // inside the viewport. Scroll it clear before dispatching real input.
    if(p.y<85||p.y>=p.height){
      const frame=Boolean(parent)?await evalRead(c,parent,'(()=>{const r=document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect();return {x:r.x,y:r.y};})()'):{x:0,y:0};
      // Host toolbar controls can scroll above a long sandbox. Wheel in the
      // host gutter, otherwise Chrome scrolls the iframe instead of the host.
      await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:parent?frame.x+Math.max(8,Math.min(p.width-8,p.x)):8,
        y:frame.y+Math.max(8,Math.min(p.height-8,p.height/2)),deltaX:0,deltaY:p.y<85?-250:250},Boolean(parent)?parent:session);
    }
    return false;
  },'Visible real control '+selector);
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},parent||session);
  for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',
    {type,x:point.x,y:point.y,button:'left',clickCount:1},Boolean(parent)?parent:session);

}

async function openFixture(c,side){
  await click(c,side,'#tab-tools');
  await click(c,side,'[data-extension-key="app:budget-fixture"][data-extension-action="main"]');
  const {root}=await c.send('DOM.getDocument',{depth:1},side);
  const {nodeId}=await c.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-frame iframe'},side);
  assert.ok(nodeId,'Current installed tool iframe exists');
  const {node}=await c.send('DOM.describeNode',{nodeId},side);
  assert.ok(node.frameId,'Current tool DOM has a native frame identity');
  const frame=await until(async()=>{
    const targets=(await c.send('Target.getTargets')).targetInfos.filter(x=>x.type==='iframe'&&x.url.includes('/sidebar-tools/sandbox.html'));
    for(const target of targets){
      const attached=(await c.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
      const {frameTree}=await c.send('Page.getFrameTree',{},attached);
      if(frameTree.frame.id===node.frameId)return attached;
      await c.send('Target.detachFromTarget',{sessionId:attached});
    }
    return false;
  },'sandbox belonging to the current installed tool DOM');
  await c.send('Runtime.enable',{},frame);await c.send('Page.enable',{},frame);inputParents.set(frame,side);
  await until(()=>evalRead(c,frame,'!!document.querySelector("#enable")'),'public tool UI');
  return frame;
}

async function main(){
  const args=Object.fromEntries(process.argv.slice(2).map(v=>{const i=v.indexOf('=');return [v.slice(2,i),v.slice(i+1)];}));
  if(process.argv.includes('--help')){console.log('OPENDESK_BACKGROUND_R20_NATIVE=1 node tests/framework/background-runtime-r20-native.mjs --extension=/absolute/production --out=/absolute/evidence [--chrome=/absolute/CFT] [--scenario=core|stop]');return;}
  assert.equal(process.env.OPENDESK_BACKGROUND_R20_NATIVE,'1','Explicit native acceptance opt-in required');
  assert.equal(process.platform,'darwin','Actual Mac Chrome required');
  assert.ok(path.isAbsolute(args.extension||''),'Absolute frozen production candidate required');
  assert.ok(path.isAbsolute(args.out||''),'Absolute owned evidence directory required');
  assert.ok(!args.scenario||['core','stop'].includes(args.scenario),'Supported core or Stop scenario required');
  const stopOnly=args.scenario==='stop';
  OUT=args.out;await mkdir(OUT);
  const report={stage:stopOnly?'CHROMIUM_STOP':'CHROMIUM_CORE',startedAt:new Date().toISOString(),extensionPath:args.extension,
    fixtureId:'budget-fixture',newAppCreated:false,steps:{},events:[],nativeReadbacks:[],
    pending:['idleTransition','naturalSleepWake','coldStart','sourceRace','crossDay','permissionRevocation','stop','uninstall','peerIsolation','B0','independentUpgrade']};
  const note=(name,data={})=>{report.events.push({at:new Date().toISOString(),name,...data});console.log(name,JSON.stringify(data));};
  let client,launcher,websiteServer,side,frame,sideTargetId,managerTargetId,current='launch';
  const persist=()=>writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
  try{
    const manifest=await readFile(path.join(args.extension,'manifest.json'));
    const sw=await readFile(path.join(args.extension,'sw.js'));
    report.manifest=JSON.parse(manifest);report.swSha256=createHash('sha256').update(sw).digest('hex');
    report.manifestSha256=createHash('sha256').update(manifest).digest('hex');
    report.driverSha256=createHash('sha256').update(await readFile(import.meta.filename)).digest('hex');
    const requests=[];websiteServer=createServer((req,res)=>{requests.push({url:req.url,host:req.headers.host,at:Date.now()});res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><title>Budget native site</title><h1>Native budget allowed</h1>');});
    await new Promise(resolve=>websiteServer.listen(0,'127.0.0.1',resolve));
    const website='http://example.com:'+websiteServer.address().port+'/native-budget';report.website=website;
    const launchReport=path.join(OUT,'launch.json');
    launcher=spawn('/usr/bin/python3',['/Users/shopme/.codex/browser-testing/launch.py',...(args.chrome?['--executable',args.chrome]:[]),'--report',launchReport,'--','--remote-debugging-port=0','--remote-allow-origins=*','--no-proxy-server','--host-resolver-rules=MAP example.com 127.0.0.1','--disable-extensions-except='+args.extension,'--load-extension='+args.extension,'about:blank'],{stdio:['ignore','pipe','pipe']});
    let launcherError='';launcher.stderr.on('data',v=>launcherError+=v);
    const owned=await until(async()=>JSON.parse(await readFile(launchReport,'utf8')),'owned launcher '+launcherError,30000);
    report.launch=owned;
    const port=await until(async()=>Number((await readFile(path.join(owned.profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'owned CDP port',30000);
    const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();report.chrome=version.Browser;
    client=connect(version.webSocketDebuggerUrl,event=>{if(['ServiceWorker.workerVersionUpdated','ServiceWorker.workerErrorReported','Network.requestWillBeSent','Network.loadingFailed'].includes(event.method))report.events.push({at:new Date().toISOString(),method:event.method,params:event.params,sessionId:event.sessionId});});await client.ready;
    const extensionId=await until(async()=>(await client.send('Target.getTargets')).targetInfos.find(x=>x.type==='service_worker'&&x.url.endsWith('/sw.js'))?.url.split('/')[2],'loaded production Worker');
    report.extensionId=extensionId;
    const manager=await client.send('Target.createTarget',{url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+randomUUID()});managerTargetId=manager.targetId;
    const managerSession=(await client.send('Target.attachToTarget',{targetId:managerTargetId,flatten:true})).sessionId;
    await client.send('Runtime.enable',{},managerSession);await client.send('Page.enable',{},managerSession);
    await click(client,managerSession,'#catalog-open-dev-sidebar');
    const context=await until(()=>evalRead(client,managerSession,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.find(x=>x.documentUrl.includes("/sidepanel.html")))'),'real Side Panel');
    const target=await until(async()=>(await client.send('Target.getTargets')).targetInfos.find(x=>x.url===context.documentUrl),'Side Panel target');sideTargetId=target.targetId;
    side=(await client.send('Target.attachToTarget',{targetId:sideTargetId,flatten:true})).sessionId;
    await client.send('Runtime.enable',{},side);await client.send('Page.enable',{},side);
    await evalRead(client,side,'globalThis.nativeBudgetFocus=[];chrome.windows.onFocusChanged.addListener(windowId=>nativeBudgetFocus.push({windowId,at:Date.now()}));true');
    report.hostDocument=await evalRead(client,side,'(async()=>({url:location.href,contexts:await chrome.runtime.getContexts({})}))()');
    const identityProbe='native-sender-readback-'+randomUUID();
    await evalRead(client,managerSession,`globalThis.nativeSenderReadback=(message,sender,respond)=>{if(message.protocol===${JSON.stringify(identityProbe)})respond(sender)};chrome.runtime.onMessage.addListener(globalThis.nativeSenderReadback);true`);
    report.nativeMessageSender=await evalRead(client,side,`chrome.runtime.sendMessage({protocol:${JSON.stringify(identityProbe)}})`);
    await evalRead(client,managerSession,'chrome.runtime.onMessage.removeListener(globalThis.nativeSenderReadback);delete globalThis.nativeSenderReadback;true');
    report.steps.realSidePanel='PASS';
    const helper=path.join(OUT,'owned-native-input');
    const compile=spawnSync('swiftc',['tests/framework/time-review-native-input.swift','-o',helper],{encoding:'utf8'});
    assert.equal(compile.status,0,'Compile existing PID-scoped native input helper: '+compile.stderr);
    const activity=(activate=true)=>{for(const command of activate?['activate','activity']:['activity']){const r=spawnSync(helper,[String(owned.pid),command],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,'Owned native input '+command+': '+r.stdout+r.stderr);}};
    activity();
    const project=path.join(OUT,'fixture-source');await mkdir(path.join(project,'src'),{recursive:true});
    const schedule=stopOnly?{enabled:true,days:[0,1,2,3,4,5,6],startMinute:0,endMinute:1440}:
      {enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020};
    const policy={kind:'site-budget.v2',dailyMinutes:1,defaultSites:[],schedule,suggestions:[{host:'example.com',name:'Example',category:'验收',suggestLimit:true,quick:false}]};
    const config={format:'opendesk.sidebar-tool.v2',id:'budget-fixture',version:'1.0.0',title:'Budget Fixture',description:'Existing public budget fixture native acceptance',capabilities:['browser.siteBudget'],requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},files:{html:'src/index.html',css:'src/style.css',js:'src/main.js'},backgroundPolicy:policy};
    await writeFile(path.join(project,'tool.config.json'),JSON.stringify(config,null,2)+'\n');
    await writeFile(path.join(project,'src/index.html'),'<main><h1>网站预算验收</h1><p>仅用户确认后按已审核范围运行。</p><button id="read">读取状态</button><button id="enable">'+(stopOnly?'批准并开始全天时段限制':'批准并开始一分钟预算')+'</button><button id="stop">停止预算</button><pre id="status" aria-live="polite"></pre></main>');
    await writeFile(path.join(project,'src/style.css'),'main{font:14px system-ui;padding:12px}button{display:block;margin:12px 0;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}');
    await writeFile(path.join(project,'src/main.js'),`const {root,request}=OpenDeskTool;const display=root.querySelector('#status');async function read(){const s=await request('browser.siteBudget.getStatus',{});display.textContent=JSON.stringify(s);return s;}function action(fn){return async()=>{try{await fn();}catch(e){display.textContent=JSON.stringify({error:e.code||'ERROR',message:e.message});}};}root.querySelector('#read').onclick=action(read);for(const [id,enabled] of [['enable',true],['stop',false]])root.querySelector('#'+id).onclick=action(async()=>{const s=await read();const r=await request('browser.siteBudget.setPolicy',{enabled,dailyMinutes:1,sites:['example.com'],schedule:${JSON.stringify(schedule)},expectedRev:s.desiredPolicyRev});display.textContent=JSON.stringify(r);});read().catch(e=>display.textContent=JSON.stringify({error:e.code,message:e.message}));`);
    current='fixture-package';const packageFile=path.join(OUT,'budget-fixture.opendesk-tool.json');await buildSidebarTool(project,{out:packageFile});
    const packageBytes=await readFile(packageFile);report.fixturePackageSha256=createHash('sha256').update(packageBytes).digest('hex');
    current='install';await click(client,side,'#tab-tools');
    if(!await evalRead(client,side,'document.querySelector("#sidebar-tool-import")?.hidden===false')){await click(client,side,'#extension-center-more');await click(client,side,'#extension-center-import');}
    await nativeSelectToolPackage(client,side,packageFile);await click(client,side,'#sidebar-tool-install');
    const installed=await until(()=>evalRead(client,side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(v=>v["opendesk.sidebar-tools.installed.v1"]?.find(t=>t.id==="budget-fixture"))'),'original Installer persisted package');
    assert.equal(installed.version,'1.0.0');assert.deepEqual(installed,JSON.parse(packageBytes));report.steps.install='PASS';note('installed-original-package',{sha256:report.fixturePackageSha256});
    frame=await openFixture(client,side);
    const nativeRead=async label=>{const r=await evalRead(client,side,'(async()=>({rules:await chrome.declarativeNetRequest.getDynamicRules(),alarm:await chrome.alarms.get("opendesk.browser.site-budget.tick.v1"),storage:await chrome.storage.local.get(["opendesk.browser.site-budget.resources.v1","opendesk.sidebar-tools.revocation-epochs.v1"]),idle:await chrome.idle.queryState(60).catch(()=>"permission-missing"),window:await chrome.windows.getLastFocused(),tabs:await chrome.tabs.query({active:true}),focusEvents:globalThis.nativeBudgetFocus||[]}))()');report.nativeReadbacks.push({label,at:Date.now(),...r});await persist();return r;};
    current='consent';await click(client,frame,'#enable');
    await click(client,side,'#sidebar-tool-action-continue');
    // Native Chrome may display its optional-permission prompt. Use the
    // original PID-scoped AX helper only when an actual Allow button exists.
    let granted=await until(()=>evalRead(client,side,'chrome.permissions.contains({permissions:["idle"]})'),'native idle grant',4000).catch(()=>false);
    if(!granted){const dump=spawnSync(helper,[String(owned.pid),'dump'],{encoding:'utf8'});await writeFile(path.join(OUT,'permission-ax.json'),dump.stdout);const rows=JSON.parse(dump.stdout||'[]');const label=['Allow','允许'].find(s=>rows.some(x=>x.role==='AXButton'&&(x.title===s||x.description===s)));if(label){const press=spawnSync(helper,[String(owned.pid),'press',label],{encoding:'utf8'});note('native-permission-button',{label,status:press.status});}granted=await until(()=>evalRead(client,side,'chrome.permissions.contains({permissions:["idle"]})'),'native idle permission',10000).catch(()=>false);}
    assert.equal(granted,true,'Native idle permission not granted; no injected grant');
    await until(()=>evalRead(client,side,'document.querySelector("#sidebar-tool-action-continue")?.textContent==="确认预算策略"&&!document.querySelector("#sidebar-tool-action-review")?.hidden'),'trusted exact budget approval');
    await click(client,side,'#sidebar-tool-action-continue');
    await until(()=>evalRead(client,frame,'(()=>{try{return JSON.parse(document.querySelector("#status").textContent).status==="applied"}catch{return false}})()'),'SDK applied receipt');
    report.steps.approval='PASS';await nativeRead('after-explicit-consent');
    const ledgerKey='opendesk.browser.site-budget.resources.v1';let after,pageSession;
    if(stopOnly){
      // Reuse existing timing evidence. A reviewed real all-day schedule creates
      // actual owner rules immediately for this independent Stop/cleanup check.
      current='stop-precondition';const page=await client.send('Target.createTarget',{url:'about:blank',background:true});
      pageSession=(await client.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
      await client.send('Runtime.enable',{},pageSession);
      report.stopBlockedNavigation=await client.send('Page.navigate',{url:website+'?before-stop='+randomUUID()},pageSession);
      assert.equal(report.stopBlockedNavigation.errorText,'net::ERR_BLOCKED_BY_CLIENT','Reviewed schedule creates actual HTTP block before Stop');
      assert.equal(requests.length,0,'Blocked schedule request never reaches HTTP server');
      report.requests=requests;after=await nativeRead('before-original-host-stop');
      assert.ok(after.rules.some(r=>r.id>=752000&&r.id<752040&&r.action.type==='block'),'Stop begins with an actual owner DNR block');
      assert.equal(after.alarm?.periodInMinutes,0.5);report.steps.stopPrecondition='PASS';
    }else{
    current='foreground';const page=await client.send('Target.createTarget',{url:website});pageSession=(await client.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
    await client.send('Runtime.enable',{},pageSession);await client.send('Network.enable',{},pageSession);await client.send('ServiceWorker.enable',{},pageSession);
    await until(()=>evalRead(client,pageSession,'document.querySelector("h1")?.textContent==="Native budget allowed"'),'actual HTTP response before budget');
    report.requests=requests;activity();await client.send('Target.activateTarget',{targetId:page.targetId});
    const started=await nativeRead('active-start');assert.equal(started.idle,'active','Actual Mac must be active');
    assert.equal(started.window.focused,true,'Actual budget window must be focused');
    const before=started.storage[ledgerKey]?.['budget-fixture']?.usage.daily||0;
    // Read-only native storage snapshots observe the existing Alarm. No RPC
    // polling, synthetic tick, clock injection, or ledger write is performed.
    await sleep(34000);const foreground=await nativeRead('foreground-before-activity');
    assert.equal(foreground.window.focused,true,'Foreground interval interrupted by desktop focus change');
    assert.deepEqual(foreground.focusEvents.filter(e=>e.at>=started.at&&e.windowId!==started.window.id),[],
      'Foreground interval must not lose the owned Chrome window');
    activity(false);
    const counted=await nativeRead('active-after-native-alarm');const used=counted.storage[ledgerKey]?.['budget-fixture']?.usage.daily||0;
    assert.ok(used>before,'Real foreground time must accumulate');report.steps.foreground='PASS';note('real-time-increment',{before,used});
    current='closed-panel';assert.equal((await client.send('Target.closeTarget',{targetId:sideTargetId})).success,true,'Close actual Side Panel');side=null;
    await until(()=>evalRead(client,managerSession,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.length===0)'),'no remaining Side Panel context');
    assert.equal((await client.send('Target.closeTarget',{targetId:managerTargetId})).success,true,'Close manager document');managerTargetId=null;
    await client.send('Target.activateTarget',{targetId:page.targetId});activity();
    for(let i=0;i<3;i++){await sleep(22000);activity(false);}
    current='network-block';
    report.closedExtensionDocuments=(await client.send('Target.getTargets')).targetInfos.filter(t=>
      t.url.startsWith('chrome-extension://'+extensionId+'/')&&['page','other','background_page','iframe'].includes(t.type));
    assert.deepEqual(report.closedExtensionDocuments,[],'Every extension document closed before HTTP proof');
    const blockedUrl=website+'?blocked='+randomUUID();const result=await client.send('Page.navigate',{url:blockedUrl},pageSession);report.blockedNavigation={url:blockedUrl,...result};
    assert.equal(result.errorText,'net::ERR_BLOCKED_BY_CLIENT','Actual Chrome DNR navigation must block while every extension document is closed');
    await sleep(600);assert.equal(requests.some(r=>r.url===new URL(blockedUrl).pathname+new URL(blockedUrl).search),false,'Blocked request must not reach the real HTTP server');
    report.steps.nativeHttpBlock='PASS';
    // Reopen an original extension document solely to read native resources,
    // after the sidebar-closed interval has already completed.
    current='native-readback';const readPage=await client.send('Target.createTarget',{url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+randomUUID(),background:true});
    managerTargetId=readPage.targetId;side=(await client.send('Target.attachToTarget',{targetId:readPage.targetId,flatten:true})).sessionId;
    await until(()=>evalRead(client,side,'location.protocol==="chrome-extension:"&&!!chrome.declarativeNetRequest?.getDynamicRules'),'original readback document committed');
    after=await nativeRead('after-closed-side-panel');
    assert.ok(after.rules.some(r=>r.id>=752000&&r.id<752040&&r.action.type==='block'),'Native owner DNR rule after closed panel');
    assert.ok((after.storage[ledgerKey]?.['budget-fixture']?.usage.daily||0)>=60000,'Closed-panel native timing reached budget');
    report.steps.closedPanelBackground='PASS';
    report.steps.dnrReadback='PASS';assert.equal(after.alarm?.periodInMinutes,0.5,'Native budget Alarm must exist with its declared period');report.steps.alarmReadback='PASS';
    note('background-core-pass',{extensionId,used:after.storage[ledgerKey]['budget-fixture'].usage.daily});
    }
    current='original-host-stop';activity();
    if(!stopOnly){
    await client.send('Target.activateTarget',{targetId:managerTargetId});
    await click(client,side,'#catalog-open-dev-sidebar');
    const stopContext=await until(()=>evalRead(client,side,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(c=>c.find(x=>x.documentUrl.includes("/sidepanel.html")))'),'reopened real Side Panel');
    const stopTarget=await until(async()=>(await client.send('Target.getTargets')).targetInfos.find(x=>x.url===stopContext.documentUrl),'reopened Side Panel target');
    sideTargetId=stopTarget.targetId;side=(await client.send('Target.attachToTarget',{targetId:sideTargetId,flatten:true})).sessionId;
    await client.send('Runtime.enable',{},side);await client.send('Page.enable',{},side);inputParents.clear();
    frame=await openFixture(client,side);
    }
    await click(client,frame,'#stop');
    await until(()=>evalRead(client,side,'document.querySelector("#sidebar-tool-action-continue")?.textContent==="确认预算策略"&&!document.querySelector("#sidebar-tool-action-review")?.hidden'),'original Host Stop review');
    report.stopReview=await evalRead(client,side,'document.querySelector("#sidebar-tool-action-review").innerText');
    await click(client,side,'#sidebar-tool-action-continue');
    report.stopReceipt=await until(()=>evalRead(client,frame,'(()=>{try{const s=JSON.parse(document.querySelector("#status").textContent);return s.status==="inactive"&&s.settings?.enabled===false&&s.appliedPolicyRev===s.desiredPolicyRev?s:false}catch{return false}})()'),'public SDK Stop receipt');
    const stopped=await nativeRead('after-original-host-stop');
    const prior=after.storage[ledgerKey]['budget-fixture'],row=stopped.storage[ledgerKey]['budget-fixture'];
    assert.equal(row.settings.enabled,false);assert.equal(row.status,'inactive');assert.equal(row.checkpoint,null);
    assert.equal(row.desiredPolicyRev,prior.desiredPolicyRev+1);assert.equal(row.appliedPolicyRev,row.desiredPolicyRev);
    for(const key of ['slot','packageHash','epoch','source','usage'])assert.deepEqual(row[key],prior[key],'Stop preserves owner and user data: '+key);
    const firstRule=752000+prior.slot*40,ownRule=r=>r.id>=firstRule&&r.id<firstRule+40;
    assert.equal(stopped.rules.filter(ownRule).length,0,'Stop removes every owned native DNR rule');
    assert.deepEqual(stopped.rules.filter(r=>!ownRule(r)),after.rules.filter(r=>!ownRule(r)),'Stop preserves peer rules');
    assert.equal(stopped.alarm??null,null,'Stop clears Alarm when no budget owner remains active');
    report.steps.stop='PASS';report.pending=report.pending.filter(v=>v!=='stop');
    current='http-after-stop';const resumedUrl=website+'?after-stop='+randomUUID();
    const resumed=await client.send('Page.navigate',{url:resumedUrl},pageSession);report.resumedNavigation={url:resumedUrl,...resumed};
    assert.equal(resumed.errorText,undefined,'HTTP navigation succeeds after Stop');
    await until(()=>evalRead(client,pageSession,'document.querySelector("h1")?.textContent==="Native budget allowed"'),'real HTTP response restored after Stop');
    assert.ok(requests.some(r=>r.url===new URL(resumedUrl).pathname+new URL(resumedUrl).search),'Restored HTTP request reaches real server');
    report.steps.stopRestoresHttp='PASS';
    report.status=stopOnly?'STOP_PASS_REMAINING_NATIVE_NOT_TESTED':'CORE_PASS_REMAINING_NATIVE_NOT_TESTED';note('core-pass-with-stop',{extensionId,used:row.usage.daily,remainingRules:stopped.rules.length});
  }catch(error){report.status='FAIL';report.failedStep=current;report.error={message:error.message,stack:error.stack};if(client&&side){try{report.failureUi=await evalRead(client,side,'document.body.innerText.slice(-10000)');report.failureScreenshot=await screenshot(client,side,'failure');}catch{}}process.exitCode=1;note('native-failure',{step:current,message:error.message});}
  finally{report.finishedAt=new Date().toISOString();client?.close();if(launcher&&launcher.exitCode===null){launcher.kill('SIGTERM');await Promise.race([new Promise(resolve=>launcher.once('exit',resolve)),sleep(12000)]);}if(websiteServer)await new Promise(resolve=>websiteServer.close(resolve));report.launcherExit=launcher?.exitCode;await persist();}
}
await main();
