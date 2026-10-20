#!/usr/bin/env node
// R1.6 C1: real Chrome pointer/file input through the current visible Extension Center.
// This is NOT a Side Panel PASS unless a real SIDE_PANEL context is observed.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {serializeSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {REVIEWED_MANAGED_PROXY_PROFILES} from '../../src/platform/chrome/browser-managed-proxy-profiles.js';
import {MANAGED_PROXY_STORE} from '../../src/platform/chrome/browser-managed-proxy.js';
import {exerciseManagedProxyDevelopmentCore,sanitizeManagedProxyEvidence} from './managed-proxy-development-core.mjs';

const buildMode=process.env.OPENDESK_PROXY_C1_BUILD||'production';
assert(['production','development'].includes(buildMode),'Unknown C1 build mode');
const development=buildMode==='development';
const developmentCore=process.env.OPENDESK_PROXY_DEV_CORE==='1';
assert(!developmentCore||development,'Local positive-flow driver requires development mode');
const cookieDevelopment=process.env.OPENDESK_PROXY_DEV_COOKIE==='1';
const staticDevelopment=process.env.OPENDESK_PROXY_C1_STATIC==='1';
const extensionOverride=process.env.OPENDESK_PROXY_C1_EXTENSION_PATH;
assert(!cookieDevelopment||developmentCore,'Cookie flow requires DEV_CORE=1 in development mode');
assert(!staticDevelopment||cookieDevelopment&&developmentCore,'Static development requires DEV_CORE+Cookie opt-in');
assert(!extensionOverride||cookieDevelopment&&developmentCore,'Extension path override requires DEV_CORE+Cookie opt-in');
assert(!extensionOverride||isAbsolute(extensionOverride),'Extension path override must be absolute');
const PATH=extensionOverride||resolve('dist',buildMode);
// dist/development is two directories below the snapshot project root.
const candidateRoot=extensionOverride?resolve(PATH,'../..'):resolve('.');
const devRunDirectory=(developmentCore?'artifacts/managed-proxy-r19/dev-runs/':'artifacts/managed-proxy-r18/dev-runs/')+
  new Date().toISOString().replaceAll(':','-');
const screenshotPrefix=development?devRunDirectory.slice('artifacts/'.length)+'/':'managed-proxy-c1-';
const OUTPUT=resolve(development?'artifacts/managed-proxy-installed-dev-c1.json':'artifacts/managed-proxy-installed-c1.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const receipt={schema:'opendesk.managed-proxy.c1.v1',sha:process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  build:buildMode.toUpperCase(),extensionPath:PATH,mockSdk:false,installed:false,sidePanelObserved:false,
  result:'NOT_TESTED',steps:[],screenshots:[],errors:[]};
if(cookieDevelopment)receipt.cookiePrivacy={responseCookieValues:'omitted',screenshots:'disabled',netLog:'disabled'};
if(staticDevelopment){
  receipt.mode='STATIC_DEVELOPMENT';
  receipt.developmentConnection={connected:false,reason:'static frozen development test snapshot'};
}
let child,profile,client,page,sidePanelSession,cookieFixture;
const cookieFixtureRequests=[];
function step(name,data){receipt.steps.push({name,at:new Date().toISOString(),
  ...(cookieDevelopment?sanitizeManagedProxyEvidence(data):data)});}
async function until(fn,label){
  let last='';
  for(let i=0;i<160;i++){
    if(child?.exitCode!==null&&child?.exitCode!==undefined)throw Error('Chrome exited '+child.exitCode);
    try{const result=await fn();if(result)return result;}catch(e){last=e.message;}
    await sleep(125);
  }
  throw Error('Timeout '+label+' '+last);
}
async function connect(url){
  const ws=new WebSocket(url),waiters=new Map();let next=0;
  await Promise.race([new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});
    ws.addEventListener('error',no,{once:true});}),
    new Promise((_,no)=>setTimeout(()=>no(Error('CDP connect timeout')),9000))]);
  ws.addEventListener('message',event=>{
    let reply;try{reply=JSON.parse(event.data);}catch{return;}
    if(developmentCore&&['Network.responseReceived','Network.loadingFailed'].includes(reply.method)){
      receipt.networkEvents??=[];
      const p=reply.params,r=p.response;
      const row={sessionId:reply.sessionId,method:reply.method,
        params:{type:p.type,errorText:p.errorText,response:r?{url:r.url,status:r.status,
          remoteIPAddress:r.remoteIPAddress,remotePort:r.remotePort,protocol:r.protocol,
          securityState:r.securityState,fromDiskCache:r.fromDiskCache}:undefined}};
      if(receipt.networkEvents.length<300)receipt.networkEvents.push(row);
      if(cookieDevelopment&&p.type==='Document'&&r?.url==='http://127.0.0.1:7898/session/'){
        // Keep target evidence available after AI pages exhaust the broad trace.
        receipt.cookieTargetNetworkEvents??=[];
        receipt.cookieTargetNetworkEvents.push(row);
      }
    }
    if(['Page.frameNavigated','Runtime.exceptionThrown','Runtime.executionContextsCleared'].includes(reply.method)&&
      !(cookieDevelopment&&reply.method==='Runtime.exceptionThrown')){
      receipt.cdpEvents??=[];
      if(receipt.cdpEvents.length<200)receipt.cdpEvents.push({at:new Date().toISOString(),...reply});
    }
    const pending=waiters.get(reply.id);if(!pending)return;
    waiters.delete(reply.id);clearTimeout(pending.timeout);
    if(reply.error)pending.no(Error(reply.error.message));else pending.ok(reply.result||{});
  });
  return {close:()=>ws.close(),send(method,params={},sessionId){
    return new Promise((ok,no)=>{
      const id=++next,timeout=setTimeout(()=>{waiters.delete(id);no(Error('CDP '+method+' timed out'));},12000);
      waiters.set(id,{ok,no,timeout});
      ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }};
}
async function attach(targetId,pageTarget=false){
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Runtime.enable',{},sessionId);
  if(pageTarget)await client.send('Page.enable',{},sessionId);
  return sessionId;
}
async function evalAt(session,expression,contextId=null){
  const reply=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,
    ...(contextId?{contextId}:{})},session);
  if(reply.exceptionDetails)throw Error(cookieDevelopment?
    'Cookie opt-in Runtime.evaluate failed: '+reply.exceptionDetails.text:
    reply.exceptionDetails.exception?.description||reply.exceptionDetails.text);
  return reply.result?.value;
}
async function elementIn(session,selector){
  const script='(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);'+
    'return {visible:r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"'+
    '&&!e.disabled&&!e.closest("[hidden]"),x:r.x+r.width/2,y:r.y+r.height/2,'+
    'viewport:{width:innerWidth,height:innerHeight},'+
    'hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.id,'+
    'text:e.textContent?.slice(0,100),disabled:!!e.disabled};})()';
  return evalAt(session,script);
}
const element=selector=>elementIn(page,selector);
async function clickIn(session,selector,surface='tool-tab'){
  await evalAt(session,'document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"center"})');
  const a=await elementIn(session,selector);
  assert(a?.visible,'Chrome input cannot reach '+selector+': '+JSON.stringify(a));
  assert(a.x>=0&&a.y>=0&&a.x<a.viewport.width&&a.y<a.viewport.height,
    'Chrome input point is outside the visible viewport: '+selector);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:a.x,y:a.y},session);
  step('CHROME_MOUSE_INPUT',{selector,surface,api:'Input.dispatchMouseEvent',point:a});
}
const click=selector=>clickIn(page,selector);

function frameFromTree(tree,urlPart){
  if(tree?.frame?.url?.includes(urlPart))return tree.frame;
  for(const child of tree?.childFrames||[]){
    const found=frameFromTree(child,urlPart);if(found)return found;
  }
  return null;
}
async function sandboxTargets(){
  const {targetInfos=[]}=await client.send('Target.getTargets');
  return targetInfos.filter(x=>x.url?.includes('/sidebar-tools/sandbox.html'));
}
async function toolFrame(hostSession=page,requiredSelector='#tool-root'){
  const {root}=await client.send('DOM.getDocument',{depth:1},hostSession);
  const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-frame iframe'},hostSession);
  assert(nodeId,'The current host has no installed sandbox iframe');
  const {node}=await client.send('DOM.describeNode',{nodeId},hostSession);
  const expectedFrameId=node.frameId;
  assert(expectedFrameId,'The current host iframe has no Chrome frame identity');
  // Sandbox may be a separate OOPIF target; match the exact installed tool DOM.
  const presence='document.querySelector('+JSON.stringify(requiredSelector)+')!==null';
  const tree=(await client.send('Page.getFrameTree',{},hostSession)).frameTree;
  const frame=frameFromTree(tree,'/sidebar-tools/sandbox.html');
  let parentWorldError=null;
  if(frame){
    assert.equal(frame.id,expectedFrameId,'Sandbox frame tree must match the current host iframe');
    try{
      const world=await client.send('Page.createIsolatedWorld',{
        frameId:frame.id,worldName:'opendesk-proxy-c1-readonly'
      },hostSession);
      const candidate={session:hostSession,hostSession,frameId:frame.id,expectedFrameId,
        contextId:world.executionContextId,via:'parent-frame'};
      if(await evalAt(candidate.session,presence,candidate.contextId))
        return candidate;
      parentWorldError='Parent isolated world did not resolve the installed sandbox DOM';
    }catch(error){parentWorldError=String(error?.message||error);}
  }
  const targets=await sandboxTargets();
  for(const target of targets){
    try{
      const session=await attach(target.targetId);
      const targetTree=(await client.send('Page.getFrameTree',{},session)).frameTree;
      if(targetTree?.frame?.id!==expectedFrameId)continue;
      const candidate={session,hostSession,frameId:targetTree.frame.id,expectedFrameId,
        contextId:null,via:'oopif-target',targetId:target.targetId};
      if(await evalAt(session,presence))
        return candidate;
    }catch(error){parentWorldError=String(error?.message||error);}
  }
  const children=(node)=>[
    ...(node?.frame?[{id:node.frame.id,url:node.frame.url}]:[]),
    ...(node?.childFrames||[]).flatMap(children)];
  throw Error('Sandbox CDP context inaccessible: '+JSON.stringify({
    frames:children(tree),targets:targets.map(t=>({type:t.type,url:t.url,id:t.targetId})),
    parentWorldError
  }));
}
async function toolResult(frame){
  const text=await evalAt(frame.session,
    'document.getElementById("proxy-c2-result")?.textContent??null',frame.contextId);
  if(!text)return null;
  try{return JSON.parse(text);}catch{return null;}
}
async function clickSandbox(frame,selector,hostSession=page){
  assert.equal(frame.hostSession,hostSession,'Sandbox input must use its owning host');
  if(cookieDevelopment){
    // Settings can reveal a retained iframe before the compositor has moved its
    // hit target. Wait for actual painting before the single trusted click.
    await evalAt(hostSession,'new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
    await evalAt(frame.session,'new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))',frame.contextId);
  }
  const local=await evalAt(frame.session,'(()=>{const e=document.querySelector('+
    JSON.stringify(selector)+');if(!e)return null;const r=e.getBoundingClientRect();'+
    'return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};})()',frame.contextId);
  assert(local?.width>0&&local?.height>0,'Sandbox test UI target unavailable: '+selector);
  const parent=await evalAt(hostSession,'(()=>{const e=document.querySelector("#sidebar-tool-frame iframe");'+
    'if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left,y:r.top};})()');
  assert(parent,'Trusted parent sandbox iframe unavailable');
  const x=parent.x+local.x,y=parent.y+local.y;
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x,y},hostSession);
  step('CHROME_SANDBOX_MOUSE_INPUT',{selector,surface:hostSession===page?'tool-tab':'native-side-panel',
    api:'Input.dispatchMouseEvent'});
}
async function installerDiagnostics(){
  return evalAt(page,'(()=>{const ids=["extension-center-more","extension-center-menu",'+
    '"extension-center-import","extension-center-import-host","sidebar-tool-import",'+
    '"sidebar-tool-file","sidebar-tool-install","sidebar-tool-import-trigger","sidebar-tool-back"];'+
    'const elements=Object.fromEntries(ids.map(id=>{const e=document.getElementById(id);'+
    'if(!e)return [id,null];const rect=e.getBoundingClientRect();'+
    'const chain=[];for(let x=e;x&&chain.length<7;x=x.parentElement){'+
    'chain.push({id:x.id,hidden:x.hidden,display:getComputedStyle(x).display});}'+
    'return [id,{width:rect.width,height:rect.height,disabled:!!e.disabled,'+
    'text:e.textContent?.slice(0,120),chain}];}));'+
    'return {href:location.href,surface:document.documentElement.dataset.opendeskSurface,'+
    'tabTools:document.getElementById("tab-tools")?.getAttribute("aria-selected"),'+
    'status:document.getElementById("sidebar-tool-status")?.textContent?.slice(0,240),elements};})()');
}
async function openExtensionCenterImporter(){
  // The old .sidebar-tools-head importer is intentionally hidden by the
  // current Extension Center. Never reveal or click that obsolete entrypoint.
  await until(async()=>{const e=await element('#extension-center-more');return e?.visible&&e;},
    'visible current Extension Center toolbar');
  await click('#extension-center-more');
  await until(async()=>{const e=await element('#extension-center-import');return e?.visible&&e;},
    'visible current Extension Center import menu action');
  await click('#extension-center-import');
  await until(async()=>{
    const input=await element('#sidebar-tool-file'),panel=await element('#sidebar-tool-import');
    return input?.visible&&panel?.visible;
  },'visible trusted importer inside current Extension Center');
  step('EXTENSION_CENTER_TRUSTED_IMPORT',{status:'PASS',
    route:['#extension-center-more','#extension-center-import','#sidebar-tool-file','#sidebar-tool-install'],
    nativeInput:'Input.dispatchMouseEvent + DOM.setFileInputFiles'});
}
async function installFixtureForC1(expected){
  // All writes are performed through the existing trusted extension installer.
  // This fixture is never bundled in the production official releases.
  await click('#sidebar-tool-back');
  await openExtensionCenterImporter();
  const {root}=await client.send('DOM.getDocument',{depth:1},page);
  const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},page);
  assert(nodeId,'Trusted installer input disappeared');
  await client.send('DOM.setFileInputFiles',{nodeId,
    files:[resolve('tests/fixtures/managed-proxy-c2-test-tool.json')]},page);
  await until(async()=>{const e=await element('#sidebar-tool-install');return e?.visible&&e;},
    'independent test-only fixture review');
  await click('#sidebar-tool-install');
  const record=await until(async()=>evalAt(page,'(async()=>{const saved=await chrome.storage.local.get('+
    '"opendesk.sidebar-tools.installed.v1");return saved["opendesk.sidebar-tools.installed.v1"]'+
    '?.find(x=>x.id==="managed-proxy-c2-fixture")??null;})()'),
  'actual test-only installed package');
  assert.equal(serializeSidebarToolPackage(record),serializeSidebarToolPackage(expected));
  step('ISOLATED_TOOL_UI_INSTALLED',{status:'PASS',id:record.id,
    packageHash:await sidebarToolPackageHash(record)});
}
async function exerciseProductionDeniedSdk(extensionId){
  const fixture=JSON.parse(await readFile('tests/fixtures/managed-proxy-c2-test-tool.json','utf8'));
  assert.equal(fixture.id,'managed-proxy-c2-fixture');
  await installFixtureForC1(fixture);
  await client.send('Page.navigate',{url:'chrome-extension://'+extensionId+
    '/sidepanel.html?toolId=managed-proxy-c2-fixture'},page);
  let frameError='';
  let sandboxFrame;
  try{
    sandboxFrame=await until(async()=>{
      try{return await toolFrame();}catch(error){frameError=String(error?.message||error);return null;}
    },'installed test-only sandbox native frame');
  }catch(error){
    receipt.frameDiagnostics={lastError:frameError,
      parent:await evalAt(page,'(()=>{const e=document.querySelector("#sidebar-tool-frame iframe");'+
        'return e?{src:e.src,sandbox:e.getAttribute("sandbox"),connected:e.isConnected,'+
        'width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}:null;})()').catch(e=>String(e)),
      targets:(await client.send('Target.getTargets').catch(()=>({targetInfos:[]}))).targetInfos
        .filter(t=>['iframe','page'].includes(t.type)).map(t=>({type:t.type,url:t.url}))};
    throw error;
  }
  step('C1_SANDBOX_CDP_FRAME',{status:'PASS',via:sandboxFrame.via});
  const initial=await until(async()=>{
    const row=await toolResult(sandboxFrame);return row?.method==='getStatus'&&row.state!=='pending'?row:null;
  },'formal public SDK getStatus result');
  assert.equal(initial.ok,true,'Real installed SDK getStatus failed: '+JSON.stringify(initial));
  assert(['disabled','unavailable','conflict'].includes(initial.data?.state),
    'Unexpected production active proxy state');
  assert.equal(initial.data?.canStop,false,'Fresh isolated tool claims another owner STOP');
  step('C1_SDK_STATUS',{status:'PASS',output:initial});
  await clickSandbox(sandboxFrame,'#proxy-c2-enable');
  await until(async()=>{const e=await element('#sidebar-tool-action-continue');return e?.visible&&e;},
    'trusted requestEnable confirmation');
  await click('#sidebar-tool-action-continue');
  const denied=await until(async()=>{
    const row=await toolResult(sandboxFrame);
    return row?.method==='requestEnable'&&row.state!=='pending'?row:null;
  },'real Host rejected an unreviewed production proxy');
  assert.equal(denied.ok,false,'An unreviewed production ENABLE must be rejected');
  assert(['E_PROXY_PROFILE_NOT_APPROVED','E_CHROME_PERMISSION_REQUIRED'].includes(denied.code),
    'Unexpected production rejection '+JSON.stringify(denied));
  step('C1_PRODUCTION_ENABLE_DENIED',{status:'PASS',output:denied,
    profileReviewed:false});
  await clickSandbox(sandboxFrame,'#proxy-c2-disable');
  await until(async()=>{const e=await element('#sidebar-tool-action-continue');return e?.visible&&e;},
    'trusted requestDisable confirmation');
  await click('#sidebar-tool-action-continue');
  const stopped=await until(async()=>{
    const row=await toolResult(sandboxFrame);
    return row?.method==='requestDisable'&&row.state!=='pending'?row:null;
  },'formal SDK STOP for a tool without an active journal');
  assert.equal(stopped.ok,true,'Formal STOP must remain callable: '+JSON.stringify(stopped));
  step('C1_SDK_STOP',{status:'PASS',output:stopped});
  await screenshot('sdk-deny-and-stop');
}

async function screenshot(name,session=page){
  if(cookieDevelopment)return; // No screenshot can retain delivered Cookie values.
  const frame=await client.send('Page.captureScreenshot',{format:'png'},session);
  const bytes=Buffer.from(frame.data,'base64'),file=resolve('artifacts/'+screenshotPrefix+name+'.png');
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,bytes);
  receipt.screenshots.push({name,sha256:hash(bytes),bytes:bytes.length,
    path:'artifacts/'+screenshotPrefix+name+'.png'});
}
async function startCookieFixture(extensionId){
  const fixtureFile=join(candidateRoot,'examples/sidebar-tools/ai-vip-share/dev/local-test/local-fixture-server.mjs');
  const {createLocalFixture}=await import(fixtureFile);
  const extensionOrigin='chrome-extension://'+extensionId;
  cookieFixture=createLocalFixture({proxyPort:7897,proxyKind:'http',extensionOrigin});
  cookieFixture.server.on('request',request=>{
    // Never capture Cookie headers or response bodies; preserve IPv4's ledger.
    cookieFixtureRequests.push({method:request.method,path:(request.url||'').split('?')[0]});
  });
  await new Promise((done,fail)=>{
    const failed=error=>fail(new Error('Owned IPv6 fixture could not bind [::1]:7898: '+error.code));
    cookieFixture.server.once('error',failed);
    cookieFixture.server.listen({host:'::1',port:7898,ipv6Only:true},()=>{
      cookieFixture.server.removeListener('error',failed);done();
    });
  });
  const address=cookieFixture.server.address();
  assert.equal(address.address,'::1');assert.equal(address.port,7898);
  receipt.cookieFixture={host:'::1',port:7898,ipv6Only:true,proxyPort:7897,extensionOrigin,
    source:fixtureFile,sourceSha256:hash(await readFile(fixtureFile))};
  step('DEV_COOKIE_OWNED_FIXTURE',{status:'PASS',...receipt.cookieFixture});
}
async function readNative(worker){
  const expression='(async()=>{const permission=await chrome.permissions.contains({permissions:["proxy"]});'+
    'const settings=permission?await chrome.proxy.settings.get({incognito:false}):null;'+
    'const state=await chrome.storage.local.get('+JSON.stringify(MANAGED_PROXY_STORE)+');'+
    'const panels=await chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]});'+
    'return {permission,settings,journal:state['+JSON.stringify(MANAGED_PROXY_STORE)+']??null,'+
    'panels:panels.map(x=>({type:x.contextType,url:x.documentUrl,id:x.documentId}))};})()';
  return evalAt(worker,expression);
}
// Read-only failure evidence from the exact attached native Side Panel document.
// Do not reveal hidden UI, alter saved installation state, or synthesize events.
async function nativeSidePanelDiagnostics(session,worker){
  const dom=session?await evalAt(session,`(()=>{
    const selectors=['#tab-tools','#workbench-tools','#sidebar-tool-list-view',
      '#extension-center-list-view','#extension-center-list','#extension-center-status',
      '#extension-center-empty','#sidebar-tool-display','#sidebar-tool-frame'];
    const elements=Object.fromEntries(selectors.map(selector=>{
      const el=document.querySelector(selector);
      if(!el)return [selector,null];
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      return [selector,{hidden:el.hidden,ancestorHidden:el.closest('[hidden]')?.id||null,
        display:style.display,visibility:style.visibility,width:rect.width,height:rect.height,
        ariaSelected:el.getAttribute('aria-selected'),text:el.textContent?.trim().slice(0,220)}];
    }));
    return {url:location.href,readyState:document.readyState,
      surface:document.documentElement.dataset.opendeskSurface,
      tab:document.documentElement.dataset.opendeskTab,
      events:globalThis.__proxyC1InputTrace??[],
      reactOwner:document.querySelector('#extension-center-list')?.dataset.opendeskReactOwner,
      entries:[...document.querySelectorAll('#extension-center-list [data-extension-key]')]
        .slice(0,30).map(el=>({key:el.dataset.extensionKey,action:el.dataset.extensionAction,
          disabled:el.disabled,text:el.textContent?.trim().slice(0,80)})),
      elements};
  })()`).catch(error=>({error:String(error)})):null;
  const installed=session?await evalAt(session,`(async()=>{
    const value=await chrome.storage.local.get('opendesk.sidebar-tools.installed.v1');
    return (value['opendesk.sidebar-tools.installed.v1']||[])
      .map(row=>({id:row.id,version:row.version}));
  })()`).catch(error=>({error:String(error)})):null;
  return {dom,installed,native:await readNative(worker).catch(error=>({error:String(error)}))};
}
async function exerciseNativeSidePanel({panel,extensionId,worker,tabTargetId}){
  const base='chrome-extension://'+extensionId+'/sidepanel.html';
  const candidate=await until(async()=>{
    const {targetInfos=[]}=await client.send('Target.getTargets');
    const other=targetInfos.filter(x=>x.targetId!==tabTargetId&&x.url?.startsWith(base));
    return other.length===1?other[0]:null;
  },'CDP Target belonging only to Chrome native SIDE_PANEL');
  const panelSession=await attach(candidate.targetId,true);
  sidePanelSession=panelSession;
  receipt.sidePanelTarget={id:candidate.targetId,type:candidate.type,url:candidate.url};
  const panelTab=await until(async()=>{
    const e=await elementIn(panelSession,'#tab-tools');
    return e?.visible&&e;
  },'real Side Panel Tools navigation control');
  assert(panelTab.visible);
  const live=await readNative(worker);
  const current=live.panels.find(x=>x.type==='SIDE_PANEL');
  assert(current?.id,'Chrome lost the native SIDE_PANEL context');
  const hostUrl=await evalAt(panelSession,'location.href');
  assert(hostUrl.startsWith(base),'CDP target is not the real installed Side Panel host');
  assert.equal(hostUrl,current.url,'CDP target must match the current SIDE_PANEL document URL');
  assert(new URL(hostUrl).searchParams.get('hostInstanceId'),'Side Panel canonical document not ready');
  // Opening context can precede the hostInstanceId location.replace(). Keep
  // that observation separately; acceptance belongs to the canonical document.
  receipt.sidePanelOpeningContexts=receipt.sidePanelContexts;
  receipt.sidePanelContexts=live.panels;
  receipt.sidePanelTarget={...receipt.sidePanelTarget,hostUrl,documentId:current.id,
    hostInstanceId:new URL(hostUrl).searchParams.get('hostInstanceId')};
  if(development&&!staticDevelopment){
    receipt.developmentConnection=await until(async()=>{
      const state=await evalAt(panelSession,`(()=>{const e=document.getElementById('opendesk-development-status');
        return e?{text:e.textContent,title:e.title}:null;})()`);
      return state?.text.includes('开发服务已连接')&&state.title.includes(receipt.developmentRevision)?state:null;
    },'live development client and exact watcher revision');
  }
  await evalAt(panelSession,`(()=>{
    const rows=globalThis.__proxyC1InputTrace=[];
    const requests=globalThis.__proxyC1Requests=[];
    window.addEventListener('message',event=>{
      const m=event.data;
      if(event.source===document.querySelector('#sidebar-tool-frame iframe')?.contentWindow&&
        m?.kind==='request'&&m.operation==='browser.proxy.managed.getStatus')
        requests.push({toolId:m.toolId,requestId:m.requestId,instance:m.instance,operation:m.operation});
    });
    for(const type of ['pointerdown','mousedown','mouseup','click'])
      document.addEventListener(type,event=>rows.push({type,isTrusted:event.isTrusted,
        target:event.target?.id,x:event.clientX,y:event.clientY,at:performance.now(),
        tab:document.documentElement.dataset.opendeskTab}),true);
    return true;
  })()`);
  step('C1_SIDE_PANEL_BEFORE_CLICK',{documentId:current.id,hostUrl,
    diagnostics:await nativeSidePanelDiagnostics(panelSession,worker)});
  await clickIn(panelSession,'#tab-tools','native-side-panel');
  await until(async()=>{
    const state=await evalAt(panelSession,`(()=>{
      const tab=document.getElementById('tab-tools');
      const pane=document.getElementById('workbench-tools');
      const list=document.getElementById('sidebar-tool-list-view');
      return {selected:tab?.getAttribute('aria-selected'),
        paneVisible:!!pane&&!pane.hidden&&!pane.closest('[hidden]'),
        listVisible:!!list&&!list.hidden&&!list.closest('[hidden]')};
    })()`);
    return state?.selected==='true'&&state.paneVisible&&state.listVisible?state:null;
  },'trusted native Side Panel Tools navigation and visible list');
  const clickTrace=await evalAt(panelSession,'globalThis.__proxyC1InputTrace');
  for(const type of ['pointerdown','mousedown','mouseup','click'])
    assert(clickTrace.some(event=>event.type===type&&event.isTrusted&&event.target==='tab-tools'),
      'Missing trusted Side Panel '+type+' on Tools tab');
  step('C1_SIDE_PANEL_TOOLS_VISIBLE',{status:'PASS',documentId:current.id,clickTrace});
  const officialSelector='#extension-center-list button[data-extension-key="app:ai-vip-share"][data-extension-action="main"]';
  await until(async()=>{const e=await elementIn(panelSession,officialSelector);return e?.visible&&e;},
    'installed official AI VIP Share visible in native Side Panel');
  await clickIn(panelSession,officialSelector,'native-side-panel');
  const officialFrame=await until(async()=>{
    try{return await toolFrame(panelSession,'#ai-vip-member-state');}catch{return null;}
  },'official AI VIP Share sandbox inside native Side Panel');
  if(developmentCore){
    await exerciseManagedProxyDevelopmentCore({client,panelSession,worker,officialFrame,
      evalAt,until,clickIn,clickSandbox,toolFrame,readNative,screenshot,step,receipt,
      cookieFixtureRequests:()=>cookieFixtureRequests.slice()});
    if(cookieDevelopment){
      // Bind the final Cookie/proxy evidence to the exact candidate observed at
      // startup, and preserve the connected watcher contract outside static mode.
      assert.equal(hash(await readFile(join(PATH,'sw.js'))),receipt.formal.swSha256,'Candidate SW changed during Cookie flow');
      const pkg=JSON.parse(await readFile(join(PATH,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json'),'utf8'));
      assert.equal(await sidebarToolPackageHash(pkg),receipt.formal.packageHash,'Candidate tool changed during Cookie flow');
      if(staticDevelopment){
        assert.equal(hash(await readFile(receipt.developmentBuildReceipt.path)),receipt.developmentBuildReceipt.sha256,
          'Static development build evidence changed during Cookie flow');
      }else{
        const update=JSON.parse(await readFile(join(PATH,'development-update.json'),'utf8'));
        assert.equal(update.revision,receipt.developmentRevision,'Watcher revision changed during Cookie flow');
        const connection=await evalAt(panelSession,`(()=>{const e=document.getElementById('opendesk-development-status');
          return e?{text:e.textContent,title:e.title}:null;})()`);
        assert(connection?.text.includes('开发服务已连接')&&connection.title.includes(receipt.developmentRevision),
          'Exact candidate development connection lost during Cookie flow');
        receipt.developmentConnection=connection;
      }
      step('DEV_COOKIE_CANDIDATE_IDENTITY',{status:'PASS',formal:receipt.formal,
        extensionId:receipt.extensionId,installEpoch:receipt.installEpoch,
        mode:staticDevelopment?'STATIC_DEVELOPMENT':'CONTINUOUS_DEVELOPMENT',
        developmentConnection:receipt.developmentConnection});
    }
    receipt.sidePanelDocumentId=current.id;receipt.sidePanelInteracted=true;
    return;
  }
  const officialState=await until(async()=>{
    const result=await evalAt(officialFrame.session,'(()=>({member:document.querySelector("#ai-vip-member-state")?.textContent,'+
      'detail:document.querySelector("#ai-vip-proxy-detail")?.textContent,'+
      'enableHidden:document.querySelector("#ai-vip-proxy-toggle")?.hidden,'+
      'refreshHidden:document.querySelector("#ai-vip-proxy-refresh")?.hidden}))()',officialFrame.contextId);
    return result?.member==='服务未配置'&&result.detail?.includes('代理服务尚未接入')?result:null;
  },'formal AI VIP production unconfigured presentation');
  assert.equal(officialState.enableHidden,true,'Unreviewed production ENABLE must be hidden');
  assert.equal(officialState.refreshHidden,false,'Public SDK STATUS refresh must be visible');
  const sandbox=await evalAt(panelSession,`(()=>{const e=document.querySelector('#sidebar-tool-frame iframe');
    const manifest=chrome.runtime.getManifest();
    return {src:e.src,htmlSandbox:e.getAttribute('sandbox'),
      expectedSrc:chrome.runtime.getURL('sidebar-tools/sandbox.html'),
      manifestVersion:manifest.manifest_version,pages:manifest.sandbox?.pages,
      csp:manifest.content_security_policy};})()`);
  assert.equal(sandbox.manifestVersion,3,'Official sandbox requires the installed MV3 manifest');
  assert.equal(sandbox.src,sandbox.expectedSrc,'Official iframe must load the installed extension sandbox');
  assert(sandbox.pages?.includes('sidebar-tools/sandbox.html'),'Official iframe must be a manifest sandbox page');
  const sandboxDirectives=sandbox.csp?.sandbox?.split(';').map(value=>value.trim().split(/\s+/))||[];
  const sandboxRules=sandboxDirectives.filter(tokens=>tokens[0]==='sandbox');
  assert.equal(sandboxRules.length,1,'Manifest sandbox CSP must define one sandbox directive');
  assert(sandboxRules[0].includes('allow-scripts'),'Manifest sandbox must permit its scripts');
  assert(!sandboxRules[0].includes('allow-same-origin'),'Manifest sandbox must remain opaque');
  assert.equal(sandbox.csp.extension_pages,"script-src 'self'; object-src 'self'",
    'Trusted extension CSP must retain its existing strict policy');
  if(sandbox.htmlSandbox!==null){
    const tokens=sandbox.htmlSandbox.split(/\s+/);
    assert(tokens.includes('allow-scripts'),'An additional HTML sandbox must permit scripts');
    assert(!tokens.includes('allow-same-origin'),'An additional HTML sandbox must remain opaque');
  }
  await evalAt(officialFrame.session,`(()=>{
    globalThis.__proxyC1Responses=[];
    window.addEventListener('message',event=>{
      if(event.source===parent&&event.data?.kind==='response')globalThis.__proxyC1Responses.push(event.data);
    });return true;
  })()`,officialFrame.contextId);
  const requestCount=await evalAt(panelSession,'globalThis.__proxyC1Requests.length');
  await clickSandbox(officialFrame,'#ai-vip-proxy-refresh',panelSession);
  const statusRequest=await until(async()=>{
    const requests=await evalAt(panelSession,'globalThis.__proxyC1Requests');
    return requests.slice(requestCount).find(row=>row.toolId==='ai-vip-share');
  },'new official public SDK STATUS request after trusted refresh click');
  const officialStatus=await until(async()=>{
    const responses=await evalAt(officialFrame.session,'globalThis.__proxyC1Responses',officialFrame.contextId);
    return responses.find(row=>row.requestId===statusRequest.requestId&&row.instance===statusRequest.instance);
  },'official public SDK STATUS response');
  assert.equal(officialStatus.ok,true,'Official public SDK STATUS failed');
  assert.equal(officialStatus.result.state,'disabled');
  assert.equal(officialStatus.result.canStop,false);
  await screenshot('native-side-panel-ai-vip',panelSession);
  step('C1_SIDE_PANEL_OFFICIAL_UI',{status:'PASS',documentId:current.id,
    chromeTargetType:candidate.type,hostUrl,via:officialFrame.via,frameId:officialFrame.frameId,
    expectedFrameId:officialFrame.expectedFrameId,hostSession:officialFrame.hostSession,
    sandbox,officialState,statusRequest,officialStatus});

  // A separately installed fixture proves ENABLE rejection and STOP through
  // the *same* actual SIDE_PANEL, never by direct privileged Driver calls.
  await clickIn(panelSession,'#sidebar-tool-back','native-side-panel');
  const fixtureSelector='#extension-center-list button[data-extension-key="app:managed-proxy-c2-fixture"][data-extension-action="main"]';
  await until(async()=>{const e=await elementIn(panelSession,fixtureSelector);return e?.visible&&e;},
    'installed independent fixture in native Side Panel Extension Center');
  await clickIn(panelSession,fixtureSelector,'native-side-panel');
  const frame=await until(async()=>{
    try{return await toolFrame(panelSession,'#proxy-c2-result');}catch{return null;}
  },'independent test tool sandbox inside native Side Panel');
  const status=await until(async()=>{
    const result=await toolResult(frame);return result?.method==='getStatus'&&result.state!=='pending'?result:null;
  },'native Side Panel installed public SDK status');
  assert.equal(status.ok,true,'Native Side Panel STATUS failed '+JSON.stringify(status));
  assert.equal(status.data?.canStop,false);
  await clickSandbox(frame,'#proxy-c2-enable',panelSession);
  await until(async()=>{const e=await elementIn(panelSession,'#sidebar-tool-action-continue');return e?.visible&&e;},
    'native Side Panel ENABLE trusted approval');
  await clickIn(panelSession,'#sidebar-tool-action-continue','native-side-panel');
  const rejected=await until(async()=>{
    const row=await toolResult(frame);return row?.method==='requestEnable'&&row.state!=='pending'?row:null;
  },'native Side Panel Host rejection of unreviewed production ENABLE');
  assert.equal(rejected.ok,false);
  assert.equal(rejected.code,'E_PROXY_PROFILE_NOT_APPROVED');
  await clickSandbox(frame,'#proxy-c2-disable',panelSession);
  await until(async()=>{const e=await elementIn(panelSession,'#sidebar-tool-action-continue');return e?.visible&&e;},
    'native Side Panel STOP trusted approval');
  await clickIn(panelSession,'#sidebar-tool-action-continue','native-side-panel');
  const stopped=await until(async()=>{
    const row=await toolResult(frame);return row?.method==='requestDisable'&&row.state!=='pending'?row:null;
  },'native Side Panel STOP confirmation');
  assert.equal(stopped.ok,true);
  assert.equal(stopped.data?.canStop,false);
  const final=await readNative(worker);
  assert.equal(final.journal,null,'Native Side Panel changed managed proxy journal despite production denial');
  if(final.settings)assert.notEqual(final.settings.value?.mode,'pac_script');
  const fresh=final.panels.find(x=>x.type==='SIDE_PANEL');
  assert.equal(fresh?.id,current.id,'Native SIDE_PANEL document changed during trusted operations');
  assert.equal(fresh?.url,hostUrl,'Native SIDE_PANEL URL changed during C1');
  await screenshot('native-side-panel-sdk-denied-stop',panelSession);
  receipt.sidePanelDocumentId=current.id;receipt.sidePanelInteracted=true;
  step('C1_SIDE_PANEL_SDK_HOST_NATIVE',{status:'PASS',documentId:current.id,
    statusOutput:status,enableDenied:rejected,stopOutput:stopped,readback:final.settings,
    journal:final.journal,frameMode:frame.via,frameId:frame.frameId,
    expectedFrameId:frame.expectedFrameId,hostSession:frame.hostSession,chromeTargetType:candidate.type});
}
async function main(){
  receipt.driverSha256=hash(await readFile(new URL(import.meta.url)));
  if(developmentCore)receipt.developmentCoreDriverSha256=hash(await readFile(new URL('./managed-proxy-development-core.mjs',import.meta.url)));
  assert(process.env.CHROME_FOR_TESTING_BIN,'Pinned Chrome for Testing required');
  const candidate=await createSidebarToolPackage(join(candidateRoot,'examples/sidebar-tools/ai-vip-share'));
  const config=JSON.parse(await readFile(join(candidateRoot,'examples/sidebar-tools/ai-vip-share/tool.config.json'),'utf8'));
  assert.equal(candidate.id,'ai-vip-share');assert.equal(candidate.version,config.version,
    'Candidate version must match same-SHA official tool configuration');
  assert.deepEqual(REVIEWED_MANAGED_PROXY_PROFILES,[]);
  const official=JSON.parse(await readFile(join(PATH,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json'),'utf8'));
  assert.equal(serializeSidebarToolPackage(official),serializeSidebarToolPackage(candidate));
  const identityHash=await sidebarToolPackageHash(candidate);
  const manifest=JSON.parse(await readFile(join(PATH,'manifest.json'),'utf8'));
  assert.equal(manifest.manifest_version,3);
  assert([...(manifest.permissions||[]),...(manifest.optional_permissions||[])].includes('proxy'));
  if(cookieDevelopment){
    assert([...(manifest.permissions||[]),...(manifest.optional_permissions||[])].includes('cookies'));
    assert(candidate.capabilities.includes('browser.cookies.write'));
  }
  const sw=await readFile(join(PATH,'sw.js'));
  if(staticDevelopment){
    const path=join(candidateRoot,'docs/framework/evidence/wxt/builds/build-development.json');
    const bytes=await readFile(path),buildReceipt=JSON.parse(bytes.toString('utf8'));
    assert.equal(hash(sw),buildReceipt.report.files.find(x=>x.path==='sw.js')?.sha256,
      'Static snapshot SW must match its development build report');
    receipt.developmentBuildReceipt={path,sha256:hash(bytes),swSha256:hash(sw)};
  }else if(development){
    const update=JSON.parse(await readFile(join(PATH,'development-update.json'),'utf8'));
    assert.equal(hash(sw),update.files['sw.js'],'Development watcher fingerprint drift');
    receipt.developmentRevision=update.revision;
  }else{
    const receiptFile=JSON.parse(await readFile('docs/framework/evidence/wxt/builds/build-production.json','utf8'));
    assert.equal(hash(sw),receiptFile.report.files.find(x=>x.path==='sw.js')?.sha256);
  }
  assert(!sw.toString().includes('R15_C2_TEST_ONLY_PROFILE'));
  receipt.formal={id:candidate.id,version:candidate.version,packageHash:identityHash,swSha256:hash(sw)};
  step(development?'DEVELOPMENT_BUILD':'PRODUCTION_BUILD',{status:'PASS',version:candidate.version,packageHash:identityHash});
  const noSandbox=process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&
    process.env.GITHUB_REF==='refs/heads/main'&&
    process.env.OPENDESK_PROXY_C1_RUNNER==='github-hosted'&&
    process.env.OPENDESK_PROXY_C1_ALLOW_NO_SANDBOX==='yes';
  profile=await mkdtemp(join(tmpdir(),'opendesk-managed-c1-'));
  const headedMode=process.env.OPENDESK_PROXY_C1_HEADED||'headless';
  assert(['headless','xvfb','native'].includes(headedMode),'Unknown C1 headed mode');
  assert(headedMode!=='native'||process.platform==='darwin','Native C1 mode requires macOS');
  const headed=headedMode!=='headless';
  const args=['--no-first-run','--no-default-browser-check','--disable-sync',
    '--window-size=1440,1000','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+PATH,'--load-extension='+PATH,'about:blank'];
  if(developmentCore&&!cookieDevelopment){
    receipt.netLog=resolve(devRunDirectory,'chrome-netlog.json');
    await mkdir(devRunDirectory,{recursive:true});
    args.unshift('--log-net-log='+receipt.netLog,'--net-log-capture-mode=Default');
  }
  if(cookieDevelopment)args.unshift('--host-rules=MAP 127.0.0.1:7898 [::1]:7898');
  if(!headed)args.unshift('--headless=new');
  if(noSandbox)args.unshift('--no-sandbox');
  child=spawn(process.env.CHROME_FOR_TESTING_BIN,args,{stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-8000);});
  const location=await until(async()=>{
    const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
    return lines.length===2?lines:null;
  },'Chrome debugger');
  client=await connect('ws://127.0.0.1:'+location[0]+location[1]);
  receipt.chrome={...(await client.send('Browser.getVersion')),noSandbox,headed,headedMode,
    executable:resolve(process.env.CHROME_FOR_TESTING_BIN),platform:process.platform,profile,args};
  const targets=()=>client.send('Target.getTargets').then(x=>x.targetInfos||[]);
  const swTarget=await until(async()=>(await targets()).find(x=>
    x.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(x.url)),'production SW');
  const extensionId=swTarget.url.split('/')[2],worker=await attach(swTarget.targetId);
  receipt.extensionId=extensionId;
  if(cookieDevelopment)await startCookieFixture(extensionId);
  // A newly attached MV3 worker can precede Chrome API/context initialization.
  // Reuse the existing native SW smoke test's real readiness wait; never mock chrome.
  const first=await until(()=>readNative(worker),'real MV3 chrome API ready');
  assert.equal(first.journal,null,'Fresh Chrome profile has an unexpected proxy journal');
  if(first.settings)assert.notEqual(first.settings.value?.mode,'pac_script');
  const tab=await until(async()=>(await targets()).find(x=>x.type==='page'&&x.url==='about:blank'),'Chrome tab');
  page=await attach(tab.targetId,true);
  const url='chrome-extension://'+extensionId+'/sidepanel.html?toolId=ai-vip-share';
  await client.send('Page.navigate',{url},page);
  step('FORMAL_EXTENSION_HOST',{status:'PASS',url:await evalAt(page,'location.href')});
  const installedQuery='(async()=>{const values=await chrome.storage.local.get(['+
    '"opendesk.sidebar-tools.installed.v1","opendesk.sidebar-tools.revocation-epochs.v1",'+
    '"opendesk.sidebar-tools.enabled.v1","opendesk.market.provenance.v1"]);'+
    'const pkg=values["opendesk.sidebar-tools.installed.v1"]?.find(x=>x.id==="ai-vip-share");'+
    'return pkg?{pkg,epoch:values["opendesk.sidebar-tools.revocation-epochs.v1"]?.["ai-vip-share"]??null,'+
    'enabled:values["opendesk.sidebar-tools.enabled.v1"]?.["ai-vip-share"]!==false,'+
    'provenance:values["opendesk.market.provenance.v1"]?.["ai-vip-share"]??null}:null;})()';
  // A formal official build may initialize its default tools automatically.
  // An active tool hides the list importer by design. Compare that actual
  // registry with the SAME SHA official package rather than click hidden UI.
  let available;
  try{
    available=await until(async()=>{
      const registered=await evalAt(page,installedQuery);
      if(registered?.pkg)return {kind:'already-installed',registered};
      const menu=await element('#extension-center-more');
      return menu?.visible?{kind:'extension-center-import'}:null;
    },'installed official package or visible trusted importer');
  }catch(error){
    receipt.uiDiagnostics=await installerDiagnostics().catch(e=>({error:String(e)}));
    await screenshot('installer-blocked').catch(()=>{});
    throw error;
  }
  let installed;
  if(available.kind==='already-installed'){
    installed=available.registered;
    step('OFFICIAL_PREINSTALLED',{status:'PASS',source:'Chrome native storage, not test insertion'});
  }else{
    await openExtensionCenterImporter();
    const {root}=await client.send('DOM.getDocument',{depth:1},page);
    const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},page);
    assert(nodeId,'Official installer file field missing');
    await client.send('DOM.setFileInputFiles',{nodeId,
      files:[join(PATH,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json')]},page);
    await until(async()=>{
      const btn=await element('#sidebar-tool-install');
      return btn?.visible&&btn.text?.includes('确认安装');
    },'genuine package review');
    await screenshot('review');
    await click('#sidebar-tool-install');
    installed=await until(()=>evalAt(page,installedQuery),'actual Chrome-installed package');
    step('OFFICIAL_INSTALLED_BY_CHROME_INPUT',{status:'PASS',source:'trusted file input and browser pointer'});
  }
  assert.equal(installed.pkg.version,candidate.version);
  assert.equal(serializeSidebarToolPackage(installed.pkg),serializeSidebarToolPackage(candidate));
  assert.equal(await sidebarToolPackageHash(installed.pkg),identityHash);
  assert.equal(installed.enabled,true,'Formal AI VIP Share is not enabled after install');
  // A first install has a null revocation epoch by contract. An update,
  // disable or uninstall may rotate it to a UUID; never fabricate one in CI.
  assert(installed.epoch===null||/^[0-9a-f-]{36}$/i.test(installed.epoch),
    'Malformed installed revocation epoch');
  receipt.installed=true;receipt.installEpoch=installed.epoch;
  receipt.installedSource=installed.provenance?'reviewed-market':'production-package-local-import';
  step('FORMAL_INSTALL_IDENTITY',{status:'PASS',packageHash:identityHash,installEpoch:installed.epoch,
    enabled:installed.enabled,installationRoute:available.kind,provenance:installed.provenance});
  await screenshot('installed');
  await client.send('Page.navigate',{url},page);
  await until(async()=>{const e=await element('#sidebar-tool-frame iframe');return e?.visible&&e;},
    'installed tool sandbox');
  await screenshot('tool');
  // C1 needs an actual installed Consumer to exercise Host rejection, because
  // the production AI VIP UI correctly disables commercial ENABLE without Provider.
  // This isolated tool is not an official release and has no approved profile.
  if(!developmentCore)await exerciseProductionDeniedSdk(extensionId);
  const after=await until(()=>readNative(worker),'post-UI native Chrome proxy readback');
  assert.equal(after.journal,null,'Unconfigured official tool wrote managed proxy journal');
  if(after.settings)assert.notEqual(after.settings.value?.mode,'pac_script');
  step('NO_UNAPPROVED_NATIVE_SET',{status:'PASS',permission:after.permission,
    mode:after.settings?.value?.mode??null,journal:after.journal});
  // A tool tab is not the native Chrome Side Panel. Explicitly attempt to
  // OPEN the real Side Panel through a Chrome-originated pointer event.
  // Never invoke chrome.sidePanel.open from Runtime.evaluate.
  let panel=after.panels.find(x=>x.type==='SIDE_PANEL')||null;
  if(!panel){
    const catalog='chrome-extension://'+extensionId+'/sidepanel.html';
    await client.send('Page.navigate',{url:catalog},page);
    try{
      await until(async()=>{const el=await element('#catalog-open-dev-sidebar');return el?.visible&&el;},
        'trusted Side Panel opener in catalog tab');
      await click('#catalog-open-dev-sidebar');
      const observed=await until(async()=>{
        const state=await readNative(worker);
        return state.panels.find(x=>x.type==='SIDE_PANEL')||null;
      },'real Chrome Side Panel context');
      panel=observed;
      step('CHROME_SIDE_PANEL_OPEN',{status:'OBSERVED_NOT_INTERACTION_VERIFIED',context:observed});
    }catch(error){
      receipt.sidePanelBlocker=String(error?.message||error);
      receipt.sidePanelCatalogStatus=await evalAt(page,
        'document.getElementById("catalog-dev-sidebar-status")?.textContent??null').catch(()=>null);
      step('CHROME_SIDE_PANEL_OPEN',{status:'NATIVE_UI_BLOCKED',
        error:receipt.sidePanelBlocker,visibleStatus:receipt.sidePanelCatalogStatus});
    }
  }
  receipt.sidePanelObserved=Boolean(panel);
  receipt.sidePanelContexts=panel?[panel]:after.panels;
  if(panel){
    try{
      await exerciseNativeSidePanel({panel,extensionId,worker,tabTargetId:tab.targetId});
    }catch(error){
      receipt.sidePanelBlocker=String(error?.stack||error);
      receipt.sidePanelTargets=(await client.send('Target.getTargets').catch(()=>({targetInfos:[]}))).targetInfos
        .filter(t=>!['service_worker','browser'].includes(t.type))
        .map(t=>({type:t.type,url:t.url,id:t.targetId}));
      receipt.sidePanelDiagnostics=await nativeSidePanelDiagnostics(sidePanelSession,worker)
        .catch(diagnosticError=>({error:String(diagnosticError)}));
      if(developmentCore&&sidePanelSession){
        receipt.developmentCoreFailure=await (async()=>{
          const frame=await toolFrame(sidePanelSession,'#ai-vip-member-state');
          return evalAt(frame.session,`({text:${cookieDevelopment?'undefined':'document.body.innerText'},
            cookieUI:${cookieDevelopment?`Object.fromEntries(['ai-vip-member-state','ai-vip-cookie-status',
              'ai-vip-cookie-results'].map(id=>[id,document.getElementById(id)?.textContent]))`:'undefined'},
            responses:(${sanitizeManagedProxyEvidence.toString()})(globalThis.__managedDevResponses),
            input:globalThis.__managedDevInput,
            controls:[...document.querySelectorAll('button,input')].map(e=>({id:e.id,disabled:e.disabled,
              hidden:!!e.closest('[hidden]'),text:e.tagName==='BUTTON'?e.textContent:null}))})`,frame.contextId);
        })().catch(error=>({error:String(error)}));
      }
      await screenshot('native-side-panel-blocked',sidePanelSession).catch(()=>{});
      step('C1_SIDE_PANEL_INTERACTION',{status:'NATIVE_UI_BLOCKED',error:receipt.sidePanelBlocker});
      console.error('MANAGED_PROXY_C1_SIDE_PANEL_DIAGNOSTICS='+
        JSON.stringify(receipt.sidePanelDiagnostics));
    }
  }
  const required=developmentCore?['FORMAL_INSTALL_IDENTITY','C1_SIDE_PANEL_TOOLS_VISIBLE',
    'DEV_MEMBER_REDEEMED','DEV_PROXY_ENABLED','DEV_NETWORK_RESPONSES','DEV_ACTIVE_STOP','DEV_REOPEN_RELEASED']:['FORMAL_INSTALL_IDENTITY','C1_SDK_STATUS',
    'C1_PRODUCTION_ENABLE_DENIED','C1_SDK_STOP','NO_UNAPPROVED_NATIVE_SET',
    'C1_SIDE_PANEL_TOOLS_VISIBLE','C1_SIDE_PANEL_OFFICIAL_UI',
    'C1_SIDE_PANEL_SDK_HOST_NATIVE'];
  if(cookieDevelopment)required.push('DEV_COOKIE_OWNED_FIXTURE','DEV_COOKIE_TARGET_MAPPED',
    'DEV_COOKIE_SITE_GRANTED','DEV_COOKIE_READY_BEFORE_REDEEM','DEV_COOKIE_DELIVERY_VALIDATED',
    'DEV_COOKIE_TRUSTED_BATCH_APPROVED','DEV_COOKIE_SAVED_VERIFIED','DEV_COOKIE_SESSION_ESTABLISHED',
    'DEV_COOKIE_SESSION_PROXY_ENABLED','DEV_REOPEN_ACTIVE','DEV_COOKIE_SESSION_REOPEN_ACTIVE',
    'DEV_COOKIE_SESSION_PROXY_STOPPED','DEV_COOKIE_SESSION_REOPEN_STOPPED','DEV_COOKIE_CANDIDATE_IDENTITY');
  const missing=required.filter(name=>!receipt.steps.some(row=>row.name===name&&row.status==='PASS'));
  if(!panel||!receipt.installed||!receipt.sidePanelObserved||
    !receipt.sidePanelInteracted||!receipt.sidePanelDocumentId||missing.length){
    receipt.result='NATIVE_UI_BLOCKED';
    receipt.errors.push('FORMAL_C1_NATIVE_PASS blocked: '+
      JSON.stringify({observed:receipt.sidePanelObserved,
        interacted:!!receipt.sidePanelInteracted,documentId:receipt.sidePanelDocumentId||null,
        missing,reason:receipt.sidePanelBlocker||null}));
    // A genuine installed tab and observed context are never a successful C1.
    process.exitCode=1;
    console.error('MANAGED_PROXY_C1=NATIVE_UI_BLOCKED');
    return;
  }
    receipt.result=developmentCore?'DEV_CORE_NATIVE_PASS':development?'DEV_C1_NATIVE_PASS':'FORMAL_C1_NATIVE_PASS';
  console.log('MANAGED_PROXY_C1='+receipt.result);
}
try{await main();}catch(e){receipt.result='FAIL';receipt.errors.push(String(e.stack||e));
  if(page){
    receipt.uiDiagnostics??=await installerDiagnostics().catch(error=>({error:String(error)}));
    await screenshot('failure').catch(()=>{});
  }
  console.error('MANAGED_PROXY_C1=FAIL',e);process.exitCode=1;
}finally{
  if(developmentCore&&child?.exitCode===null){
    try{await client?.send('Browser.close');}catch{}
    await sleep(500);
  }
  if(cookieFixture?.server.listening){
    // Close only this run's server; leave the existing IPv4 fixture untouched.
    const closed=new Promise(done=>cookieFixture.server.close(done));
    cookieFixture.server.closeAllConnections();
    await closed;
    step('DEV_COOKIE_OWNED_FIXTURE_CLOSED',{status:'PASS',host:'::1',port:7898});
  }
  await mkdir(dirname(OUTPUT),{recursive:true});
  if(development){
    await mkdir(devRunDirectory,{recursive:true});
    await writeFile(join(devRunDirectory,'receipt.json'),JSON.stringify(
      cookieDevelopment?sanitizeManagedProxyEvidence(receipt):receipt,null,2)+'\n');
  }
  await writeFile(OUTPUT,JSON.stringify(cookieDevelopment?sanitizeManagedProxyEvidence(receipt):receipt,null,2)+'\n');
  try{client?.close()}catch{}
  if(child?.exitCode===null){child.kill('SIGTERM');await sleep(300);
    if(child.exitCode===null)child.kill('SIGKILL');}
  if(profile)await rm(profile,{force:true,recursive:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
