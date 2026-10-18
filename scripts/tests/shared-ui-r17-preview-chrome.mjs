#!/usr/bin/env node
// Real headless Chrome checks of the exact Vite JSX and fixed WXT assets.
// This is a source-bound file:// preview, NOT an installed-extension verdict.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const path=resolve(process.env.OPENDESK_SHARED_UI_PREVIEW_FILE||'examples/sidebar-tools/shared-ui-demo/preview/index.html');
const output=resolve(process.argv[2]||'artifacts/shared-ui-r17/chrome');
await mkdir(output,{recursive:true});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let browser,profile,socket,seq=0,launchError,currentCase;
const pending=new Map(),exceptions=[],remote=[],consoleErrors=[],resourceFailures=[],browserLog=[];
const requests=new Map();
const result={scope:'SOURCE_BOUND_CHROME_PREVIEW_NOT_EXTENSION_INSTALL',status:'IN_PROGRESS',
  previewFile:path,headful:process.env.OPENDESK_SHARED_UI_HEADFUL==='1',reports:[],
  zoom:{status:'NOT_TESTED',reason:'not attempted'}};
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},18000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    try{socket.send(JSON.stringify({id,method,params}));}
    catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<120;i++){
    if(launchError)throw launchError;
    if(browser.exitCode!==null||browser.signalCode!==null)
      throw Error('CHROME_EXIT '+String(browser.exitCode??browser.signalCode));
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
    await sleep(100);
  }
  assert.ok(port,'DevTools port must exist');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(targets.find(item=>item.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id&&pending.has(message.id)){
      const callback=pending.get(message.id);pending.delete(message.id);
      if(message.error)callback.reject(Error(message.error.message));
      else callback.resolve(message.result);
    }
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text);
    const p=message.params;
    if(message.method==='Network.requestWillBeSent'){
      requests.set(p.requestId,p.request?.url);
      if(/^https?:/i.test(p.request?.url||''))remote.push(p.request.url);
    }
    if(message.method==='Network.loadingFailed')resourceFailures.push({url:requests.get(p.requestId),...p});
    if(message.method==='Network.responseReceived'&&p.response.status>=400)
      resourceFailures.push({url:p.response.url,status:p.response.status});
    if(message.method==='Runtime.consoleAPICalled'&&p.type==='error')
      consoleErrors.push(p.args.map(a=>a.value??a.description).join(' '));
    if(message.method==='Log.entryAdded'&&p.entry.level==='error')consoleErrors.push(p.entry);
  });
  socket.addEventListener('close',()=>{for(const job of pending.values())job.reject(Error('CDP_SOCKET_CLOSED'));pending.clear();});
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Log.enable');
}
async function evaluate(source){
  const result=await cdp('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result?.value;
}
async function ready(){
  let last;
  for(let i=0;i<120;i++){
    last=await evaluate('({status:document.querySelector("#tool-app [aria-live]")?.textContent||null,root:!!document.querySelector("[data-slot=card]"),switches:document.querySelectorAll("[data-slot=switch]").length,hasReact:globalThis.OpenDeskPageReact?.version,hasUI:typeof globalThis.OpenDeskSidebarUI?.Switch,scrollWidth:document.documentElement.scrollWidth})');
    if(last.status==='已关闭'&&last.root&&last.switches===1&&last.hasReact==='19.2.0'&&last.hasUI==='function')return last;
    await sleep(75);
  }
  throw Error('COMPILED_PREVIEW_NOT_READY '+JSON.stringify(last));
}
async function click(){
  const point=await evaluate('(()=>{const e=document.querySelector("[data-slot=switch]"),r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0&&r.height>0,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest("[data-slot=switch]")===e};})()');
  assert.ok(point.visible&&point.hit,'Switch must be actually visible and clickable');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  for(const type of ['mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1});
}
async function selected(expected){
  let latest;
  for(let i=0;i<80;i++){
    latest=await evaluate('({selected:document.querySelector("[data-slot=switch]")?.hasAttribute("data-selected"),status:document.querySelector("#tool-app [aria-live]")?.textContent,input:document.querySelector("[data-slot=switch] input")?.checked,focused:document.activeElement===document.querySelector("[data-slot=switch] input")})');
    if(latest.selected===expected&&latest.status===(expected?'已开启':'已关闭')&&latest.input===expected)return latest;
    await sleep(50);
  }
  throw Error('CONTROLLED_REACT_STATE_FAILED '+JSON.stringify({expected,latest}));
}
async function key(key,code,virtualKey,modifiers=0){
  for(const type of ['keyDown','keyUp'])
    await cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:virtualKey,modifiers});
}
async function tabToSwitch(){
  for(let tabs=1;tabs<=24;tabs++){
    await key('Tab','Tab',9);
    if(await evaluate('document.activeElement===document.querySelector("[data-slot=switch] input")'))return tabs;
  }
  throw Error('REAL_TAB_DID_NOT_REACH_SHARED_SWITCH');
}
async function accessibility(disabled,selected=false){
  const dom=await evaluate('(()=>{const s=document.querySelector("[data-slot=switch]"),i=s?.querySelector("input");return {count:document.querySelectorAll("[data-slot=switch]").length,role:i?.getAttribute("role"),label:i?.getAttribute("aria-label"),disabled:i?.disabled,ariaDisabled:i?.getAttribute("aria-disabled"),dataDisabled:s?.hasAttribute("data-disabled")};})()');
  assert.equal(dom.count,1,'one real shared Switch; no duplicate test UI');
  assert.equal(dom.role,'switch');assert.equal(dom.disabled,disabled);
  if(disabled)assert.equal(dom.dataDisabled,true,'React Aria isDisabled state');
  const tree=await cdp('Accessibility.getFullAXTree');
  const node=tree.nodes.find(n=>!n.ignored&&n.role?.value==='switch');
  assert.ok(node,'real Chromium AX switch role');
  assert.ok(node.name?.value,'accessible Switch name');
  assert.equal(node.properties?.find(p=>p.name==='disabled')?.value?.value===true,disabled);
  const checked=node.properties?.find(p=>p.name==='checked')?.value?.value;
  assert.equal(String(checked),String(selected),'actual AX checked state follows controlled React state');
  return {dom,ax:{role:node.role.value,name:node.name.value,disabled,checked}};
}
async function settledSwitch(selected){
  const visual=await evaluate('(async()=>{const s=document.querySelector("[data-slot=switch]"),t=s.querySelector("[data-slot=switch-thumb]");s.getBoundingClientRect();await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));return {background:getComputedStyle(s).backgroundColor,thumbX:new DOMMatrixReadOnly(getComputedStyle(t).transform).m41};})()');
  assert.ok(Math.abs(visual.thumbX-(selected?14:0))<0.1,'settled Switch thumb matches selected state');
  return visual;
}
async function disabledProbe(){
  // Release the production root first, then reuse its ONLY container and the
  // fixed actual component with isDisabled. No copied UI or private React API.
  const mounted=await evaluate('(()=>{dispatchEvent(new Event("pagehide"));const R=globalThis.OpenDeskPageReact,U=globalThis.OpenDeskSidebarUI,target=document.getElementById("tool-app");if(target.childElementCount)throw Error("APP_ROOT_NOT_RELEASED");if(typeof R.createRoot!=="function")throw Error("FIXED_REACT_CREATE_ROOT_MISSING");globalThis.__r18DisabledChanges=0;globalThis.__r18DisabledRoot=R.createRoot(target);globalThis.__r18DisabledRoot.render(R.createElement(U.Card,null,R.createElement(U.CardContent,null,R.createElement(U.Switch,{isDisabled:true,isSelected:false,"aria-label":"Shared Switch disabled probe",onChange:()=>{globalThis.__r18DisabledChanges++}}))));return true;})()');
  assert.equal(mounted,true);
  for(let i=0;i<80;i++){
    if(await evaluate('document.querySelector("[data-slot=switch] input")?.disabled===true'))break;
    await sleep(50);
  }
  const ax=await accessibility(true);
  await click();
  for(let i=0;i<3;i++){
    await key('Tab','Tab',9);
    assert.equal(await evaluate('document.activeElement===document.querySelector("[data-slot=switch] input")'),false,'Tab skips disabled Switch');
  }
  await key(' ','Space',32);
  assert.deepEqual(await evaluate('({changes:globalThis.__r18DisabledChanges,checked:document.querySelector("[data-slot=switch] input").checked})'),{changes:0,checked:false});
  await evaluate('globalThis.__r18DisabledRoot.unmount();delete globalThis.__r18DisabledRoot;delete globalThis.__r18DisabledChanges');
  return {scope:'FIXED_SHARED_COMPONENT_IS_DISABLED_PROP_AFTER_APP_UNMOUNT',...ax,tabSkipped:true,changes:0};
}
async function zoom200(){
  if(process.env.OPENDESK_SHARED_UI_ZOOM==='0')return {status:'NOT_TESTED',reason:'disabled by option'};
  const metrics=()=>evaluate('({dpr:devicePixelRatio,width:innerWidth,visualScale:visualViewport?.scale})');
  const before=await metrics(),modifiers=process.platform==='darwin'?4:2;
  for(let i=0;i<5;i++)await key('+','Equal',187,modifiers);
  await sleep(200);
  const after=await metrics();
  // Browser zoom changes CSS viewport/DPR. Pinch/device emulation cannot pass.
  const actual=Math.abs(after.dpr/before.dpr-2)<0.03&&Math.abs(after.width/before.width-0.5)<0.04;
  try{
    if(actual){await tabToSwitch();await key(' ','Space',32);await selected(false);
      const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'zoom-200.png'),Buffer.from(shot.data,'base64'));}
    return {status:actual?'PASS':'NOT_TESTED',method:'browser shortcut; measured DPR and CSS viewport',before,after,
      ...(!actual?{reason:'CDP keyboard did not establish actual 200% browser zoom; no emulated substitute'}:{})};
  }finally{await key('0','Digit0',48,modifiers);}
}
try{
  const previewBytes=await readFile(path);
  result.previewSha256=createHash('sha256').update(previewBytes).digest('hex');
  profile=await mkdtemp(join(tmpdir(),'shared-ui-r18-chrome-'));
  const flags=['--disable-gpu','--disable-dev-shm-usage','--use-mock-keychain','--password-store=basic',
    '--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'];
  if(!result.headful)flags.unshift('--headless=new');
  // Hosted Ubuntu CI blocks user namespaces. Never disable the OS sandbox in
    // production or on a local Mac; this exception is for isolated Linux CI.
    if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
      flags.unshift('--no-sandbox');
  browser=spawn(process.env.CHROME_BIN||'chromium',flags,{stdio:['ignore','ignore','pipe']});
  browser.on('error',error=>{launchError=error;});
  browser.stderr.on('data',data=>browserLog.push(String(data)));
  await connect();
  result.browser=await cdp('Browser.getVersion');
  for(const width of [320,360,400,440]){
    for(const theme of ['light','dark']){
      currentCase={width,theme};result.currentCase=currentCase;
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});
      await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      await cdp('Page.navigate',{url:pathToFileURL(path).href});
      const original=await ready();
      assert.ok(original.scrollWidth<=width+1,'No horizontal overflow');
      await selected(false);
      const offVisual=await settledSwitch(false);
      await click();await selected(true);
      const onVisual=await settledSwitch(true);
      assert.notEqual(onVisual.background,offVisual.background,'selected Switch has distinct track color');
      await click();await selected(false);
      await settledSwitch(false);
      const ax=await accessibility(false),tabs=await tabToSwitch();
      const focus=await evaluate('(()=>{const s=document.querySelector("[data-slot=switch]"),c=getComputedStyle(s);return {visible:s.hasAttribute("data-focus-visible"),style:c.outlineStyle,width:c.outlineWidth};})()');
      assert.equal(focus.visible,true,'React Aria keyboard focus-visible state');
      assert.equal(focus.style,'solid','keyboard focus ring must be visible');
      assert.equal(focus.width,'2px');
      await key(' ','Space',32);
      const keyboard=await selected(true);
      assert.equal(keyboard.focused,true,'keyboard focus must stay with Switch');
      await settledSwitch(true);
      const checkedAx=await accessibility(false,true);
      const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,theme+'-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
      if(width===440&&theme==='dark')result.zoom=await zoom200();
      // The production mount registers pagehide -> root.unmount. Dispatching
      // pagehide here verifies the handler without claiming real iframe closing.
      const released=await evaluate('(()=>{dispatchEvent(new Event("pagehide"));return document.getElementById("tool-app").childElementCount;})()');
      assert.equal(released,0,'React Root must unmount on pagehide');
      const disabled=await disabledProbe();
      assert.deepEqual(remote,[],'No remote/CDN resource requests');
      assert.deepEqual(exceptions,[],'No Chromium runtime exceptions');
      assert.deepEqual(consoleErrors,[],'No console/log errors');
      assert.deepEqual(resourceFailures,[],'No failed resources');
      result.reports.push({width,theme,states:['已关闭','已开启','已关闭','已开启'],
        react:original.hasReact,keyboard:{tabs,space:true,focus},accessibility:ax,checkedAccessibility:checkedAx,visual:{off:offVisual,on:onVisual},disabled,unmounted:true});
    }
  }
  result.status='PASS';
  console.log('R18_SOURCE_BOUND_CHROME_PASS '+JSON.stringify(result));
}catch(error){
  result.status='FAIL';result.error={message:error.message,stack:error.stack};process.exitCode=1;
  if(socket?.readyState===WebSocket.OPEN){
    try{result.failureDocument=await evaluate('({url:location.href,ready:document.readyState,text:document.body?.innerText?.slice(0,8000)})');}catch{}
    try{const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
  }
  console.error('R18_SOURCE_BOUND_CHROME_FAIL '+error.message);
}finally{
  result.diagnostics={exceptions,consoleErrors,resourceFailures,remoteRequests:remote};
  await writeFile(join(output,'report.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(join(output,'chrome.log'),browserLog.join(''));
  try{socket?.close();}catch{}
  if(browser&&browser.exitCode===null&&!launchError){
    const closed=new Promise(done=>browser.once('close',done));browser.kill();
    await Promise.race([closed,sleep(2000)]);
    if(browser.exitCode===null){browser.kill('SIGKILL');await closed;}
  }
  if(profile)await rm(profile,{recursive:true,force:true});
}
