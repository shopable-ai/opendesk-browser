#!/usr/bin/env node
// R1.7 actual unpacked OpenDesk Browser extension, actual reviewed package
// import, real browser-owned Sandbox, real Card/Switch and close/reopen.
// Default: actual headful Chrome Side Panel, opened by trusted input and
// verified with getContexts. A catalog tab has no installation workbench.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateSidebarToolPackage,serializeSidebarToolPackage,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';

const extension=resolve(process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
const toolFile=resolve(process.env.OPENDESK_SHARED_UI_TOOL_FILE||'examples/sidebar-tools/shared-ui-demo/shared-ui-demo.opendesk-tool.json');
const output=resolve(process.argv[2]||'artifacts/sidebar-tools/shared-ui-demo/installed-chrome');
await mkdir(output,{recursive:true});
const native=process.env.OPENDESK_SHARED_UI_NATIVE!=='0';
const endpoint=process.env.OPENDESK_SHARED_UI_CDP_URL;
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
let chrome,profile,socket,sequence=0,launchError,host,catalog,pkg,pkgHash,workerSession;
const pending=new Map(),exceptions=[],remoteRequests=[],consoleErrors=[],resourceFailures=[],browserLog=[];
const requests=new Map(),sessions=new Map();
const lifecycleEvents=[];
function cdp(method,params={},sessionId=null){
  if(!socket)throw Error('CDP not connected');
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},18000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});
    try{socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}
    catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
  });
}
async function connect(){
  let websocket=endpoint;
  if(endpoint&&/^https?:/.test(endpoint)){
    const version=await (await fetch(endpoint.replace(/\/$/,'')+'/json/version')).json();
    websocket=version.webSocketDebuggerUrl;
  }
  if(!endpoint){
    let lines;
    for(let i=0;i<130;i++){
      if(launchError)throw launchError;
      if(chrome.exitCode!==null||chrome.signalCode!==null)
        throw Error('Chrome exit before extension load '+String(chrome.exitCode??chrome.signalCode));
      try{lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');if(lines?.length>=2)break;}catch{}
      await sleep(100);
    }
    assert.ok(lines?.[0]&&lines?.[1],'Chrome debugging endpoint must exist');
    result.cdpUrl='http://127.0.0.1:'+lines[0];
    websocket='ws://127.0.0.1:'+lines[0]+lines[1];
  }
  socket=new WebSocket(websocket);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data);
    if(row.id&&pending.has(row.id)){
      const job=pending.get(row.id);pending.delete(row.id);
      row.error?job.reject(Error(row.error.message)):job.resolve(row.result);
    }
    const p=row.params,session=row.sessionId;
    if(row.method==='Runtime.bindingCalled'&&p.name==='__r19Lifecycle')
      lifecycleEvents.push({session,...JSON.parse(p.payload)});
    if(row.method==='Runtime.exceptionThrown')
      exceptions.push({session,description:p.exceptionDetails?.exception?.description||p.exceptionDetails?.text});
    if(row.method==='Network.requestWillBeSent'){
      requests.set(session+':'+p.requestId,p.request?.url);
      if(/^https?:/i.test(p.request?.url||''))remoteRequests.push({session,url:p.request.url});
    }
    if(row.method==='Network.loadingFailed')resourceFailures.push({session,url:requests.get(session+':'+p.requestId),...p});
    if(row.method==='Network.responseReceived'&&p.response.status>=400)
      resourceFailures.push({session,url:p.response.url,status:p.response.status});
    if(row.method==='Runtime.consoleAPICalled'&&p.type==='error')
      consoleErrors.push({session,text:p.args.map(a=>a.value??a.description).join(' ')});
    if(row.method==='Log.entryAdded'&&p.entry.level==='error')consoleErrors.push({session,...p.entry});
  });
  socket.addEventListener('close',()=>{for(const job of pending.values())job.reject(Error('CDP_SOCKET_CLOSED'));pending.clear();});
  await cdp('Target.setDiscoverTargets',{discover:true});
}
async function until(fn,label,timeout=14000){
  let last;
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    try{const result=await fn();if(result)return result;}catch(e){last=e.message;}
    await sleep(100);
  }
  throw Error('TIMED_OUT '+label+(last?': '+last:''));
}
async function attach(targetId){
  if(sessions.has(targetId))return sessions.get(targetId);
  const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
  await cdp('Runtime.enable',{},sessionId);
  await cdp('Network.enable',{},sessionId);
  // Service workers do not implement every Page/Log command.
  await cdp('Log.enable',{},sessionId).catch(()=>{});
  sessions.set(targetId,sessionId);
  return sessionId;
}
async function evaluate(sessionId,code){
  const result=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true},sessionId);
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result?.value;
}
const q=selector=>'document.querySelector('+JSON.stringify(selector)+')';
async function click(sessionId,selector,element=q(selector)){
  const point=await until(async()=>{
    const p=await evaluate(sessionId,'(()=>{const e='+element+';if(!e||e.disabled||e.hidden)return null;e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,visible:r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&e.contains(e.getRootNode().elementFromPoint(x,y))};})()');
    return p?.visible?p:null;
  },'visible click '+selector);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y},sessionId);
  for(const type of ['mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1},sessionId);
}
async function reloadFromChromeManager(){
  const target=await cdp('Target.createTarget',{url:'chrome://extensions/'});
  const session=await attach(target.targetId);
  // Traverse the actual Chrome WebUI shadow DOM. No developerPrivate API,
  // storage mutation, extension reinstallation or synthetic click is used.
  const find='function find(root,id){for(const e of root.querySelectorAll("*")){if(e.id===id)return e;if(e.shadowRoot){const hit=find(e.shadowRoot,id);if(hit)return hit;}}}';
  const expression=id=>'(()=>{'+find+'return find(document,'+JSON.stringify(id)+');})()';
  const identity=await until(()=>evaluate(session,'(()=>{'+find+'const e=find(document,'+
    JSON.stringify(result.extensionId)+');return e?.data?{path:e.data.path,state:e.data.state}:null;})()'),
    'actual loaded extension in Chrome manager');
  assert.equal(identity.path,extension,'reload only the exact tested extension path');
  assert.equal(identity.state,'ENABLED');
  if(!await evaluate(session,expression('devMode')+'.checked'))
    await click(session,'Chrome developer mode',expression('devMode'));
  const button='(()=>{'+find+'const item=find(document,'+JSON.stringify(result.extensionId)+');return item?.shadowRoot?find(item.shadowRoot,"dev-reload-button"):null;})()';
  await until(()=>evaluate(session,'Boolean('+button+')'),'real Chrome reload button');
  await evaluate(session,button+'.addEventListener("click",event=>{globalThis.__r19ReloadTrusted=event.isTrusted;},{once:true})');
  await click(session,'Chrome reload button',button);
  assert.equal(await evaluate(session,'globalThis.__r19ReloadTrusted'),true,'actual trusted Chrome reload input');
  return {method:'chrome://extensions real Reload button',inputTrusted:true,...identity};
}
async function frameState(frame,expected){
  return until(async()=>{
    const state=await evaluate(frame,'(()=>{const s=document.querySelector("[data-slot=switch]");return {status:document.querySelector("#tool-app [aria-live]")?.textContent||null,selected:s?.hasAttribute("data-selected"),checked:s?.querySelector("input")?.checked,ready:document.querySelector("#tool-status")?.dataset.state,react:globalThis.OpenDeskPageReact?.version,aria:typeof globalThis.OpenDeskSidebarUI?.Switch,sdk:typeof globalThis.OpenDeskTool?.request,chromeRuntime:typeof globalThis.chrome?.runtime};})()');
    return state.status===expected&&state.ready==='ready'&&
      state.selected===(expected==='已开启')&&state.checked===(expected==='已开启')?state:null;
  },'real sandbox controlled state '+expected);
}
async function toolFrame(host){
  const row=await until(async()=>{
    const frames=(await cdp('Page.getFrameTree',{},host)).frameTree;
    const descendants=new Set();
    const visit=node=>{descendants.add(node.frame.id);for(const child of node.childFrames||[])visit(child);};visit(frames);
    const targets=(await cdp('Target.getTargets')).targetInfos;
    // Chrome's native Side Panel can omit its OOPIF from Page.getFrameTree.
    // CDP still binds that genuine child target to the verified panel parent.
    const owner=native?result.native.target.targetId:result.catalogTarget;
    return targets.find(x=>x.type==='iframe'&&
      (descendants.has(x.targetId)||x.parentId===owner)&&
      x.url.includes('/sidebar-tools/sandbox.html'));
  },'real opaque sandbox iframe');
  return {target:row,session:await attach(row.targetId)};
}
async function key(session,key,code,virtualKey,modifiers=0){
  for(const type of ['keyDown','keyUp'])
    await cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:virtualKey,modifiers},session);
}
async function tabToSwitch(session){
  for(let tabs=1;tabs<=24;tabs++){
    await key(session,'Tab','Tab',9);
    if(await evaluate(session,'document.activeElement===document.querySelector("[data-slot=switch] input")'))return tabs;
  }
  throw Error('REAL_TAB_DID_NOT_REACH_SHARED_SWITCH');
}
async function accessibility(session,disabled,selected=false){
  const dom=await evaluate(session,'(()=>{const s=document.querySelector("[data-slot=switch]"),i=s?.querySelector("input");return {count:document.querySelectorAll("[data-slot=switch]").length,role:i?.getAttribute("role"),label:i?.getAttribute("aria-label"),disabled:i?.disabled,ariaDisabled:i?.getAttribute("aria-disabled"),dataDisabled:s?.hasAttribute("data-disabled")};})()');
  assert.equal(dom.count,1,'one real shared Switch; no copied UI');
  assert.equal(dom.role,'switch');assert.equal(dom.disabled,disabled);
  if(disabled)assert.equal(dom.dataDisabled,true,'React Aria isDisabled state');
  const tree=await cdp('Accessibility.getFullAXTree',{},session);
  const node=tree.nodes.find(n=>!n.ignored&&n.role?.value==='switch');
  assert.ok(node,'real Chromium AX switch role');assert.ok(node.name?.value,'accessible Switch name');
  assert.equal(node.properties?.find(p=>p.name==='disabled')?.value?.value===true,disabled);
  const checked=node.properties?.find(p=>p.name==='checked')?.value?.value;
  assert.equal(String(checked),String(selected),'actual AX checked state follows controlled React state');
  return {dom,ax:{role:node.role.value,name:node.name.value,disabled,checked}};
}
async function settledSwitch(session,selected){
  const visual=await evaluate(session,'(async()=>{const s=document.querySelector("[data-slot=switch]"),t=s.querySelector("[data-slot=switch-thumb]");s.getBoundingClientRect();await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));return {background:getComputedStyle(s).backgroundColor,thumbX:new DOMMatrixReadOnly(getComputedStyle(t).transform).m41};})()');
  assert.ok(Math.abs(visual.thumbX-(selected?14:0))<0.1,'settled Switch thumb matches selected state');
  return visual;
}
async function disabledProbe(session){
  // Production JSX stays untouched. Its normal pagehide releases the root;
  // reuse that one container with the published fixed component's real prop.
  await evaluate(session,'(()=>{dispatchEvent(new Event("pagehide"));const R=globalThis.OpenDeskPageReact,U=globalThis.OpenDeskSidebarUI,target=document.getElementById("tool-app");if(target.childElementCount)throw Error("APP_ROOT_NOT_RELEASED");if(typeof R.createRoot!=="function")throw Error("FIXED_REACT_CREATE_ROOT_MISSING");globalThis.__r18DisabledChanges=0;globalThis.__r18DisabledRoot=R.createRoot(target);globalThis.__r18DisabledRoot.render(R.createElement(U.Card,null,R.createElement(U.CardContent,null,R.createElement(U.Switch,{isDisabled:true,isSelected:false,"aria-label":"Shared Switch disabled probe",onChange:()=>{globalThis.__r18DisabledChanges++}}))));})()');
  await until(()=>evaluate(session,'document.querySelector("[data-slot=switch] input")?.disabled===true'),'real shared component isDisabled render');
  const ax=await accessibility(session,true);
  // click() targets the Aria label (not the disabled input); real user input
  // must leave its controlled state and onChange untouched.
  await click(session,'[data-slot=switch]');
  for(let i=0;i<3;i++){
    await key(session,'Tab','Tab',9);
    assert.equal(await evaluate(session,'document.activeElement===document.querySelector("[data-slot=switch] input")'),false,'Tab skips disabled Switch');
  }
  await key(session,' ','Space',32);
  assert.deepEqual(await evaluate(session,'({changes:globalThis.__r18DisabledChanges,checked:document.querySelector("[data-slot=switch] input").checked})'),{changes:0,checked:false});
  await evaluate(session,'globalThis.__r18DisabledRoot.unmount();delete globalThis.__r18DisabledRoot;delete globalThis.__r18DisabledChanges');
  return {scope:'FIXED_SHARED_COMPONENT_IS_DISABLED_PROP_AFTER_APP_UNMOUNT',...ax,tabSkipped:true,changes:0};
}
async function zoom200(host,frame){
  if(process.env.OPENDESK_SHARED_UI_ZOOM==='0')return {status:'NOT_TESTED',reason:'disabled by option'};
  const metrics=session=>evaluate(session,'({dpr:devicePixelRatio,width:innerWidth,visualScale:visualViewport?.scale})');
  const before=await metrics(host),modifiers=process.platform==='darwin'?4:2;
  let tab,originalZoom,method='browser shortcut; measured DPR and CSS viewport';
  try{
    {
      // Real chrome.tabs zoom changes the actual catalog document and iframe;
      // it is not CSS zoom, device metrics, or pinch emulation.
      tab=await evaluate(native?catalog:host,'chrome.tabs.getCurrent().then(t=>t?.id)');
      assert.ok(Number.isInteger(tab),'actual catalog tab for browser zoom');
      originalZoom=await evaluate(host,'chrome.tabs.getZoom('+tab+')');
      await evaluate(host,'chrome.tabs.setZoom('+tab+',2)');
      method='chrome.tabs.setZoom(actual same-origin catalog tab, 2); measure actual panel and iframe';
    }
    await sleep(200);
    const after=await metrics(host),frameMetrics=await metrics(frame);
    const factor=originalZoom===undefined?after.dpr/before.dpr:after.dpr/before.dpr*originalZoom;
    const widthFactor=after.width/before.width;
    const actual=Math.abs(factor-2)<0.03&&Math.abs(widthFactor-(originalZoom??1)/2)<0.04;
    if(actual){
      await tabToSwitch(frame);await key(frame,' ','Space',32);await frameState(frame,'已关闭');
      await settledSwitch(frame,false);
      const shot=await cdp('Page.captureScreenshot',{format:'png'},host);
      await writeFile(join(output,'installed-zoom-200.png'),Buffer.from(shot.data,'base64'));
    }
    return {status:actual?'PASS':'NOT_TESTED',method,before,after,frameMetrics,
      ...(!actual?{reason:'actual 200% browser zoom was not established; native panel zoom may require CUA'}:{})};
  }finally{
    if(tab!==undefined&&originalZoom!==undefined)await evaluate(host,'chrome.tabs.setZoom('+tab+','+originalZoom+')');
    else if(native)await key(host,'0','Digit0',48,modifiers);
  }
}
async function nativeSidePanel(catalog){
  // Observe the genuine product handler without modifying it or injecting a
  // fake user activation. Input.dispatchMouseEvent supplies trusted input.
  await evaluate(catalog,'(()=>{const e=document.getElementById("catalog-open-dev-sidebar");if(!e)throw Error("NATIVE_OPENER_MISSING");e.addEventListener("click",event=>{globalThis.__r18NativeClick={isTrusted:event.isTrusted,active:navigator.userActivation.isActive};},{once:true,capture:true});})()');
  await click(catalog,'#catalog-open-dev-sidebar');
  result.native.input=await evaluate(catalog,'globalThis.__r18NativeClick');
  assert.equal(result.native.input?.isTrusted,true,'Side Panel opener requires actual trusted CDP input');
  result.native.method='existing catalog button -> trusted CDP mouse input -> product chrome.sidePanel.open';
  const handoff={status:'WAITING_FOR_ACTUAL_SIDE_PANEL',cdpUrl:result.cdpUrl||endpoint,
    chromePid:chrome?.pid,profile,extensionId:result.extensionId,extensionDir:extension,toolFile,
    catalogTarget:result.catalogTarget,nativeUiAction:'Open OpenDesk from the Chrome toolbar if the trusted catalog click is rejected'};
  await writeFile(join(output,'native-handoff.json'),JSON.stringify(handoff,null,2)+'\n');
  console.log('R18_NATIVE_UI_HANDOFF '+JSON.stringify(handoff));
  try{
    return await until(async()=>{
      const contexts=await evaluate(workerSession,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
      const context=contexts.find(c=>c.documentUrl?.startsWith('chrome-extension://'+result.extensionId+'/')&&c.documentId);
      if(!context)return null;
      const targets=(await cdp('Target.getTargets')).targetInfos;
      for(const row of targets.filter(t=>t.targetId!==result.catalogTarget&&t.url===context.documentUrl&&t.type!=='service_worker'&&t.type!=='iframe')){
        const session=await attach(row.targetId);
        const identity=await evaluate(session,'(async()=>({url:location.href,tab:await chrome.tabs.getCurrent(),ready:document.readyState==="complete"&&!!document.querySelector("#tab-tools")}))()');
        if(identity.tab?.id||!identity.ready)continue;
        result.native.context=context;result.native.target=row;result.native.identity=identity;
        result.native.status='ATTACHED_REAL_SIDE_PANEL';
        await cdp('Page.bringToFront',{},session);
        return session;
      }
      return null;
    },'actual SIDE_PANEL runtime context and non-tab target',Number(process.env.OPENDESK_SHARED_UI_NATIVE_WAIT_MS||45000));
  }catch(error){
    result.native.openerStatus=await evaluate(catalog,'document.getElementById("catalog-dev-sidebar-status")?.textContent').catch(()=>null);
    result.native.blocker=error.message;
    throw Object.assign(Error('NATIVE_UI_REQUIRED: no verified native Side Panel target; leader must use Chrome toolbar with native CUA. '+(result.native.openerStatus||'')),{code:'NATIVE_UI_REQUIRED'});
  }
}
const result={
  scope:native?'REAL_UNPACKED_EXTENSION_NATIVE_SIDE_PANEL':'REAL_UNPACKED_EXTENSION_CATALOG_UI',
  explicitExclusions:[...(!native?['NOT_NATIVE_MAC_SIDE_PANEL']:[]),'NOT_PERSISTED_BROWSER_RESTART'],
  extensionDir:extension,toolFile,externalBrowser:Boolean(endpoint),
  checks:[],cycles:[],status:'IN_PROGRESS',zoom:{status:'NOT_TESTED',reason:'not attempted'},
  native:{requested:native,status:'NOT_TESTED',platform:process.platform}
};
try{
  const bytes=await readFile(toolFile);
  pkg=validateSidebarToolPackage(JSON.parse(bytes));
  assert.equal(pkg.id,'shared-ui-demo');assert.equal(pkg.uiRuntime,'opendesk.react-ui.v1');assert.deepEqual(pkg.capabilities,[]);
  pkgHash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(pkgHash,createHash('sha256').update(serializeSidebarToolPackage(pkg)).digest('hex'),
    'Package must be canonical bytes; a canonical unpromoted CANDIDATE is valid');
  result.package={id:pkg.id,version:pkg.version,sha256:pkgHash,bytes:bytes.length};
  const manifestBytes=await readFile(resolve(extension,'manifest.json'));
  const manifest=JSON.parse(manifestBytes);
  result.manifestSha256=createHash('sha256').update(manifestBytes).digest('hex');
  if(!endpoint){
    profile=await mkdtemp(join(tmpdir(),'opendesk-r18-installed-'));
    const flags=['--disable-gpu','--disable-dev-shm-usage','--no-first-run',
      '--use-mock-keychain','--password-store=basic',
      '--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port=0',
      '--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'];
    if(!native&&process.env.OPENDESK_SHARED_UI_HEADFUL!=='1')flags.unshift('--headless=new');
    // Hosted Ubuntu CI blocks user namespaces. Never disable the OS sandbox in
    // production or on a local Mac; this exception is for isolated Linux CI.
    if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
      flags.unshift('--no-sandbox');
    chrome=spawn(process.env.CHROME_BIN||'chromium',flags,{stdio:['ignore','ignore','pipe']});
    chrome.on('error',error=>{launchError=error;});
    chrome.stderr.on('data',data=>browserLog.push(String(data)));
  }
  await connect();
  result.browser=await cdp('Browser.getVersion');
  if(native)assert.ok(!/HeadlessChrome/i.test(result.browser.product+' '+result.browser.userAgent),'native mode requires headful Chrome');
  const worker=await until(async()=>{
    const rows=(await cdp('Target.getTargets')).targetInfos;
    return rows.find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://')&&
      (!process.env.OPENDESK_SHARED_UI_EXTENSION_ID||new URL(t.url).host===process.env.OPENDESK_SHARED_UI_EXTENSION_ID)&&
      t.url.endsWith('/'+manifest.background.service_worker));
  },'real extension service worker');
  result.extensionId=new URL(worker.url).host;
  workerSession=await attach(worker.targetId);
  const target=await cdp('Target.createTarget',{url:'chrome-extension://'+result.extensionId+'/ui/tool.html'});
  catalog=await attach(target.targetId);host=catalog;
  await cdp('Page.enable',{},catalog);
  result.catalogTarget=target.targetId;
  await until(()=>evaluate(host,'document.readyState==="complete"&&!!document.querySelector("#tab-tools")'),'actual extension UI');
  if(native)host=await nativeSidePanel(catalog);
  await cdp('Page.enable',{},host);
  await click(host,'#tab-tools');
  await until(()=>evaluate(host,'!document.querySelector("#workbench-tools").hidden'),'Extension tab visible');
  // The file is selected using Chrome's file input binding and installed via
  // actual trusted UI review. No storage mutation, fake Host receipt or mock.
  await cdp('Page.setInterceptFileChooserDialog',{enabled:true},host);
  await click(host,'#extension-center-more');
  await click(host,'#extension-center-import');
  await cdp('DOM.enable',{},host);
  const dom=(await cdp('DOM.getDocument',{depth:1},host)).root;
  const node=(await cdp('DOM.querySelector',{nodeId:dom.nodeId,selector:'#sidebar-tool-file'},host)).nodeId;
  assert.ok(node,'genuine package import input exists');
  await cdp('DOM.setFileInputFiles',{nodeId:node,files:[toolFile]},host);
  const review=await until(async()=>{
    const s=await evaluate(host,'({hidden:document.querySelector("#sidebar-tool-preview").hidden,version:document.querySelector("#sidebar-tool-preview-version")?.textContent,title:document.querySelector("#sidebar-tool-preview-title")?.textContent,disabled:document.querySelector("#sidebar-tool-install")?.disabled})');
    return s&&!s.hidden&&!s.disabled?s:null;
  },'tool package review and enabled install');
  assert.equal(review.title.trim(),pkg.title,'real review title matches tested candidate');
  await click(host,'#sidebar-tool-install');
  const installed=await until(async()=>{
    const rows=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_STORE)+').then(r=>r['+JSON.stringify(SIDEBAR_TOOL_STORE)+']||[])');
    return rows.find(x=>x.id===pkg.id&&x.version===pkg.version)||null;
  },'real Chrome Storage installation');
  assert.equal(createHash('sha256').update(serializeSidebarToolPackage(installed)).digest('hex'),pkgHash,'Installed package SHA identical');
  result.checks.push('REVIEW_AND_REAL_FILE_INSTALL','STORED_CANONICAL_PACKAGE_SHA');
  const opener='#extension-center-list button[data-extension-key="app:'+pkg.id+'"][data-extension-action="primary"]';
  for(let cycle=1;cycle<=3;cycle++){
    if(cycle===3){
      const before={workerTarget:worker.targetId,nativeContext:result.native.context};
      const ui=await reloadFromChromeManager();
      await until(async()=>!(await cdp('Target.getTargets')).targetInfos.some(t=>t.targetId===before.workerTarget),
        'old service worker destroyed by actual extension reload');
      // MV3 workers may remain dormant after reload until a real extension
      // document requests them. Open the product before waiting for its worker.
      const reopened=await cdp('Target.createTarget',{url:'chrome-extension://'+result.extensionId+'/ui/tool.html'});
      catalog=await attach(reopened.targetId);host=catalog;
      result.catalogTarget=reopened.targetId;
      await until(()=>evaluate(catalog,'document.readyState==="complete"&&!!document.querySelector("#tab-tools")'),
        'catalog ready after extension reload');
      const reloadedWorker=await until(async()=>{
        const rows=(await cdp('Target.getTargets')).targetInfos;
        return rows.find(t=>t.type==='service_worker'&&t.targetId!==before.workerTarget&&
          t.url===worker.url);
      },'new service worker after actual extension reload');
      workerSession=await attach(reloadedWorker.targetId);
      if(native)host=await nativeSidePanel(catalog);
      await cdp('Page.enable',{},host);
      await click(host,'#tab-tools');
      await until(()=>evaluate(host,'!document.querySelector("#workbench-tools").hidden'),
        'Extension tab visible after reload');
      const persisted=await evaluate(host,'chrome.storage.local.get('+JSON.stringify(SIDEBAR_TOOL_STORE)+').then(r=>(r['+
        JSON.stringify(SIDEBAR_TOOL_STORE)+']||[]).find(x=>x.id==='+JSON.stringify(pkg.id)+'))');
      assert.equal(createHash('sha256').update(serializeSidebarToolPackage(persisted)).digest('hex'),pkgHash,
        'extension reload preserves the same installed candidate');
      if(native)assert.notEqual(result.native.context.documentId,before.nativeContext.documentId,
        'reload must create a new native panel document');
      result.reload={status:'PASS',ui,before,workerTarget:reloadedWorker.targetId,
        nativeContext:result.native.context,installedSha256:pkgHash};
      result.checks.push('ACTUAL_EXTENSION_RELOAD_AND_PERSISTED_PACKAGE');
    }
    const openedAt=performance.now();
    await click(host,opener);
    const frame=await toolFrame(host);
    const first=await frameState(frame.session,'已关闭');
    const offVisual=await settledSwitch(frame.session,false);
    const openReadyMs=performance.now()-openedAt;
    const initialHeap=await cdp('Runtime.getHeapUsage',{},frame.session);
    const resources=await evaluate(frame.session,'performance.getEntriesByType("resource").map(r=>({url:r.name,initiatorType:r.initiatorType,duration:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize}))');
    assert.equal(first.react,'19.2.0');
    assert.equal(first.aria,'function');
    assert.equal(first.sdk,'function');
    assert.equal(first.chromeRuntime,'undefined','sandbox cannot access privileged APIs');
    const toggleAt=performance.now();
    await click(frame.session,'[data-slot="switch"]');
    await frameState(frame.session,'已开启');
    const onVisual=await settledSwitch(frame.session,true);
    const toggleSettledMs=performance.now()-toggleAt;
    assert.notEqual(onVisual.background,offVisual.background,'selected Switch has distinct track color');
    await click(frame.session,'[data-slot="switch"]');
    await frameState(frame.session,'已关闭');
    await settledSwitch(frame.session,false);
    const ax=await accessibility(frame.session,false),tabs=await tabToSwitch(frame.session);
    const focus=await evaluate(frame.session,'(()=>{const s=document.querySelector("[data-slot=switch]"),c=getComputedStyle(s);return {visible:s.hasAttribute("data-focus-visible"),style:c.outlineStyle,width:c.outlineWidth};})()');
    assert.equal(focus.visible,true,'React Aria keyboard focus-visible state');
    assert.equal(focus.style,'solid','keyboard focus ring must be visible');
    assert.equal(focus.width,'2px');
    await key(frame.session,' ','Space',32);
    await frameState(frame.session,'已开启');
    await settledSwitch(frame.session,true);
    const checkedAx=await accessibility(frame.session,false,true);
    if(cycle===1)result.zoom=await zoom200(host,frame.session);
    const screenshot=await cdp('Page.captureScreenshot',{format:'png'},host);
    await writeFile(join(output,'installed-cycle-'+cycle+'.png'),Buffer.from(screenshot.data,'base64'));
    // The second close destroys the still-mounted business root.
    const disabled=cycle===1?await disabledProbe(frame.session):null;
    if(cycle>1){
      await cdp('Runtime.addBinding',{name:'__r19Lifecycle'},frame.session);
      // Observe after the production bootstrap's pagehide listener. A genuine
      // iframe close must synchronously unmount its root before this runs.
      await evaluate(frame.session,'addEventListener("pagehide",event=>__r19Lifecycle(JSON.stringify({trusted:event.isTrusted,children:document.getElementById("tool-app").childElementCount})),{once:true})');
    }
    await click(host,'#sidebar-tool-back');
    // Input changes participate in the existing unsaved-content guard.
    if(await evaluate(host,'!document.querySelector("#sidebar-tool-action-review").hidden'))
      await click(host,'#sidebar-tool-action-continue');
    await until(async()=>{
      const domCount=await evaluate(host,'document.querySelectorAll("#sidebar-tool-frame iframe").length');
      const targets=(await cdp('Target.getTargets')).targetInfos;
      return domCount===0&&!targets.some(t=>t.targetId===frame.target.targetId);
    },'real iframe destruction after close');
    const rootRelease=cycle>1?await until(()=>lifecycleEvents.find(e=>e.session===frame.session),
      'actual close pagehide after production Root release'):null;
    if(rootRelease){
      assert.equal(rootRelease.trusted,true,'Root release must follow real browser pagehide');
      assert.equal(rootRelease.children,0,'production Root unmount clears its own container on close');
    }
    await cdp('HeapProfiler.collectGarbage',{},host);
    const hostResources=await cdp('Memory.getDOMCounters',{},host);
    const hostHeapAfterGc=await cdp('Runtime.getHeapUsage',{},host);
    result.checks.push('REAL_SANDBOX_CYCLE_'+cycle+'_OFF_ON_OFF_CLOSE');
    result.cycles.push({cycle,frameTarget:frame.target.targetId,keyboard:{tabs,space:true,focus},accessibility:ax,checkedAccessibility:checkedAx,visual:{off:offVisual,on:onVisual},disabled,rootRelease,iframeDestroyed:true,hostResources,performance:{openReadyMs,toggleSettledMs,initialHeap,hostHeapAfterGc,resources,scope:'Three real user cycles; includes CDP round trips and animation settling. Heap is per observed isolate, not total browser memory or a long-term leak proof.'}});
  }
  assert.ok(result.cycles[1].hostResources.jsEventListeners<=result.cycles[0].hostResources.jsEventListeners,
    'reopening must not accumulate host event listeners after garbage collection');
  assert.deepEqual(remoteRequests,[],'no observed remote requests after each CDP target attachment');
  assert.deepEqual(exceptions,[],'no uncaught page exceptions');
  assert.deepEqual(consoleErrors,[],'no console/log errors');
  assert.deepEqual(resourceFailures,[],'no failed resources');
  result.status='PASS';
  result.networkRequests=remoteRequests.length;
  result.exceptions=exceptions.length;
  if(native)result.native.status='PASS';
  console.log('R18_REAL_EXTENSION_'+(native?'NATIVE_SIDE_PANEL':'CATALOG')+'_PASS '+JSON.stringify(result));
}catch(error){
  result.status=error.code==='NATIVE_UI_REQUIRED'?'BLOCKED':'FAIL';
  result.error={message:error.message,stack:error.stack};process.exitCode=1;
  if(native&&result.native.status!=='PASS')result.native.status=result.status;
  if(socket?.readyState===WebSocket.OPEN){
    try{result.failureTargets=(await cdp('Target.getTargets')).targetInfos;}catch{}
    if(host){
      try{result.failureDocument=await evaluate(host,'({url:location.href,ready:document.readyState,text:document.body?.innerText?.slice(0,8000)})');}catch{}
      try{const shot=await cdp('Page.captureScreenshot',{format:'png'},host);await writeFile(join(output,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
    }
  }
  console.error('R18_REAL_EXTENSION_'+result.status+' '+error.message);
}finally{
  result.diagnostics={exceptions,consoleErrors,resourceFailures,remoteRequests,lifecycleEvents,
    networkObservation:'Host observed before tool open; OOPIF observed after attachment. Startup no-CDN is also checked by the source-bound preview (Network enabled before navigation), package source and sandbox CSP.'};
  await writeFile(join(output,'installed-report.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(join(output,'chrome.log'),browserLog.join(''));
  try{socket?.close();}catch{}
  if(chrome&&chrome.exitCode===null&&!launchError){
    if(native&&result.status==='BLOCKED'){
      // Preserve this isolated headful CFT/profile for the leader's native CUA.
      // Re-run with OPENDESK_SHARED_UI_CDP_URL from native-handoff.json.
      chrome.stderr.destroy();chrome.unref();
      console.log('R18_NATIVE_BROWSER_RETAINED '+JSON.stringify({pid:chrome.pid,profile,cdpUrl:result.cdpUrl}));
    }else{
      const closed=new Promise(done=>chrome.once('close',done));chrome.kill();
      await Promise.race([closed,sleep(2000)]);
      if(chrome.exitCode===null){chrome.kill('SIGKILL');await closed;}
    }
  }
  if(profile&&!(native&&result.status==='BLOCKED'))await rm(profile,{recursive:true,force:true});
}
