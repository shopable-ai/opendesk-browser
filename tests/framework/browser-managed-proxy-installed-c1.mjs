#!/usr/bin/env node
// R1.6 C1: real Chrome pointer/file input through the current visible Extension Center.
// This is NOT a Side Panel PASS unless a real SIDE_PANEL context is observed.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {serializeSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {REVIEWED_MANAGED_PROXY_PROFILES} from '../../src/platform/chrome/browser-managed-proxy-profiles.js';
import {MANAGED_PROXY_STORE} from '../../src/platform/chrome/browser-managed-proxy.js';

const PATH=resolve('dist/production'),OUTPUT=resolve('artifacts/managed-proxy-installed-c1.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const receipt={schema:'opendesk.managed-proxy.c1.v1',sha:process.env.GITHUB_SHA||null,
  build:'PRODUCTION',mockSdk:false,installed:false,sidePanelObserved:false,
  result:'NOT_TESTED',steps:[],screenshots:[],errors:[]};
let child,profile,client,page;
function step(name,data){receipt.steps.push({name,...data});}
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
  if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text);
  return reply.result?.value;
}
async function elementIn(session,selector){
  const script='(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);'+
    'return {visible:r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"'+
    '&&!e.disabled&&!e.closest("[hidden]"),x:r.x+r.width/2,y:r.y+r.height/2,'+
    'text:e.textContent?.slice(0,100),disabled:!!e.disabled};})()';
  return evalAt(session,script);
}
const element=selector=>elementIn(page,selector);
async function clickIn(session,selector,surface='tool-tab'){
  const a=await elementIn(session,selector);
  assert(a?.visible,'Chrome input cannot reach '+selector+': '+JSON.stringify(a));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:a.x,y:a.y},session);
  step('CHROME_MOUSE_INPUT',{selector,surface,api:'Input.dispatchMouseEvent'});
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
  // Sandbox may be a separate OOPIF target; match the exact installed tool DOM.
  const presence='document.querySelector('+JSON.stringify(requiredSelector)+')!==null';
  const tree=(await client.send('Page.getFrameTree',{},hostSession)).frameTree;
  const frame=frameFromTree(tree,'/sidebar-tools/sandbox.html');
  let parentWorldError=null;
  if(frame){
    try{
      const world=await client.send('Page.createIsolatedWorld',{
        frameId:frame.id,worldName:'opendesk-proxy-c1-readonly'
      },hostSession);
      const candidate={session:hostSession,contextId:world.executionContextId,via:'parent-frame'};
      if(await evalAt(candidate.session,presence,candidate.contextId))
        return candidate;
      parentWorldError='Parent isolated world did not resolve the installed sandbox DOM';
    }catch(error){parentWorldError=String(error?.message||error);}
  }
  const targets=await sandboxTargets();
  for(const target of targets){
    try{
      const session=await attach(target.targetId);
      const candidate={session,contextId:null,via:'oopif-target',targetId:target.targetId};
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
    '/ui/tool.html?toolId=managed-proxy-c2-fixture'},page);
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
  const frame=await client.send('Page.captureScreenshot',{format:'png'},session);
  const bytes=Buffer.from(frame.data,'base64'),file=resolve('artifacts/managed-proxy-c1-'+name+'.png');
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,bytes);
  receipt.screenshots.push({name,sha256:hash(bytes),bytes:bytes.length,
    path:'artifacts/managed-proxy-c1-'+name+'.png'});
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
async function exerciseNativeSidePanel({panel,extensionId,worker,tabTargetId}){
  const base='chrome-extension://'+extensionId+'/ui/tool.html';
  const candidate=await until(async()=>{
    const {targetInfos=[]}=await client.send('Target.getTargets');
    const other=targetInfos.filter(x=>x.targetId!==tabTargetId&&x.url?.startsWith(base));
    return other.length===1?other[0]:null;
  },'CDP Target belonging only to Chrome native SIDE_PANEL');
  const panelSession=await attach(candidate.targetId,true);
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
  await clickIn(panelSession,'#tab-tools','native-side-panel');
  const officialSelector='#extension-center-list button[data-extension-key="app:ai-vip-share"][data-extension-action="main"]';
  await until(async()=>{const e=await elementIn(panelSession,officialSelector);return e?.visible&&e;},
    'installed official AI VIP Share visible in native Side Panel');
  await clickIn(panelSession,officialSelector,'native-side-panel');
  const officialFrame=await until(async()=>{
    try{return await toolFrame(panelSession,'#ai-vip-member-state');}catch{return null;}
  },'official AI VIP Share sandbox inside native Side Panel');
  const officialState=await until(async()=>{
    const result=await evalAt(officialFrame.session,'(()=>({member:document.querySelector("#ai-vip-member-state")?.textContent,'+
      'detail:document.querySelector("#ai-vip-proxy-detail")?.textContent,'+
      'enableHidden:document.querySelector("#ai-vip-proxy-toggle")?.hidden,'+
      'refreshHidden:document.querySelector("#ai-vip-proxy-refresh")?.hidden}))()',officialFrame.contextId);
    return result?.member==='服务未配置'&&result.detail?.includes('代理服务尚未接入')?result:null;
  },'formal AI VIP production unconfigured presentation');
  assert.equal(officialState.enableHidden,true,'Unreviewed production ENABLE must be hidden');
  assert.equal(officialState.refreshHidden,false,'Public SDK STATUS refresh must be visible');
  await clickSandbox(officialFrame,'#ai-vip-proxy-refresh',panelSession);
  await until(async()=>{
    const detail=await evalAt(officialFrame.session,
      'document.querySelector("#ai-vip-proxy-detail")?.textContent??null',officialFrame.contextId);
    return detail?.includes('代理服务尚未接入')?detail:null;
  },'public SDK STATUS refresh from trusted native Side Panel');
  await screenshot('native-side-panel-ai-vip',panelSession);
  step('C1_SIDE_PANEL_OFFICIAL_UI',{status:'PASS',documentId:current.id,
    chromeTargetType:candidate.type,hostUrl,via:officialFrame.via,officialState});

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
  await screenshot('native-side-panel-sdk-denied-stop',panelSession);
  receipt.sidePanelDocumentId=current.id;receipt.sidePanelInteracted=true;
  step('C1_SIDE_PANEL_SDK_HOST_NATIVE',{status:'PASS',documentId:current.id,
    statusOutput:status,enableDenied:rejected,stopOutput:stopped,readback:final.settings,
    journal:final.journal,frameMode:frame.via,chromeTargetType:candidate.type});
}
async function main(){
  assert(process.env.CHROME_FOR_TESTING_BIN,'Pinned Chrome for Testing required');
  const candidate=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
  const config=JSON.parse(await readFile('examples/sidebar-tools/ai-vip-share/tool.config.json','utf8'));
  assert.equal(candidate.id,'ai-vip-share');assert.equal(candidate.version,config.version,
    'Candidate version must match same-SHA official tool configuration');
  assert.deepEqual(REVIEWED_MANAGED_PROXY_PROFILES,[]);
  const official=JSON.parse(await readFile(join(PATH,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json'),'utf8'));
  assert.equal(serializeSidebarToolPackage(official),serializeSidebarToolPackage(candidate));
  const identityHash=await sidebarToolPackageHash(candidate);
  const manifest=JSON.parse(await readFile(join(PATH,'manifest.json'),'utf8'));
  assert.equal(manifest.manifest_version,3);
  assert([...(manifest.permissions||[]),...(manifest.optional_permissions||[])].includes('proxy'));
  const receiptFile=JSON.parse(await readFile('docs/framework/evidence/wxt/builds/build-production.json','utf8'));
  const sw=await readFile(join(PATH,'sw.js'));
  assert.equal(hash(sw),receiptFile.report.files.find(x=>x.path==='sw.js')?.sha256);
  assert(!sw.toString().includes('R15_C2_TEST_ONLY_PROFILE'));
  receipt.formal={id:candidate.id,version:candidate.version,packageHash:identityHash,swSha256:hash(sw)};
  step('PRODUCTION_BUILD',{status:'PASS',version:candidate.version,packageHash:identityHash});
  const noSandbox=process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&
    process.env.GITHUB_REF==='refs/heads/main'&&
    process.env.OPENDESK_PROXY_C1_RUNNER==='github-hosted'&&
    process.env.OPENDESK_PROXY_C1_ALLOW_NO_SANDBOX==='yes';
  profile=await mkdtemp(join(tmpdir(),'opendesk-managed-c1-'));
  const headed=process.env.OPENDESK_PROXY_C1_HEADED==='xvfb';
  const args=['--no-first-run','--no-default-browser-check','--disable-sync',
    '--window-size=1440,1000','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+PATH,'--load-extension='+PATH,'about:blank'];
  if(!headed)args.unshift('--headless=new');
  if(noSandbox)args.unshift('--no-sandbox');
  child=spawn(process.env.CHROME_FOR_TESTING_BIN,args,{stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-8000);});
  const location=await until(async()=>{
    const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
    return lines.length===2?lines:null;
  },'Chrome debugger');
  client=await connect('ws://127.0.0.1:'+location[0]+location[1]);
  receipt.chrome={...(await client.send('Browser.getVersion')),noSandbox,headed};
  const targets=()=>client.send('Target.getTargets').then(x=>x.targetInfos||[]);
  const swTarget=await until(async()=>(await targets()).find(x=>
    x.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(x.url)),'production SW');
  const extensionId=swTarget.url.split('/')[2],worker=await attach(swTarget.targetId);
  receipt.extensionId=extensionId;
  // A newly attached MV3 worker can precede Chrome API/context initialization.
  // Reuse the existing native SW smoke test's real readiness wait; never mock chrome.
  const first=await until(()=>readNative(worker),'real MV3 chrome API ready');
  assert.equal(first.journal,null,'Fresh Chrome profile has an unexpected proxy journal');
  if(first.settings)assert.notEqual(first.settings.value?.mode,'pac_script');
  const tab=await until(async()=>(await targets()).find(x=>x.type==='page'&&x.url==='about:blank'),'Chrome tab');
  page=await attach(tab.targetId,true);
  const url='chrome-extension://'+extensionId+'/ui/tool.html?toolId=ai-vip-share';
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
  await exerciseProductionDeniedSdk(extensionId);
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
    const catalog='chrome-extension://'+extensionId+'/ui/tool.html';
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
      step('C1_SIDE_PANEL_INTERACTION',{status:'NATIVE_UI_BLOCKED',error:receipt.sidePanelBlocker});
    }
  }
  receipt.result=receipt.sidePanelInteracted?'FORMAL_C1_NATIVE_PASS':
    panel?'NATIVE_TAB_INSTALL_PASS_SIDE_PANEL_OBSERVED_NOT_INTERACTED':
    'NATIVE_TAB_INSTALL_PASS_SIDE_PANEL_BLOCKED';
  console.log('MANAGED_PROXY_C1='+receipt.result);
}
try{await main();}catch(e){receipt.result='FAIL';receipt.errors.push(String(e.stack||e));
  if(page){
    receipt.uiDiagnostics??=await installerDiagnostics().catch(error=>({error:String(error)}));
    await screenshot('failure').catch(()=>{});
  }
  console.error('MANAGED_PROXY_C1=FAIL',e);process.exitCode=1;
}finally{
  await mkdir(dirname(OUTPUT),{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(receipt,null,2)+'\n');
  try{client?.close()}catch{}
  if(child?.exitCode===null){child.kill('SIGTERM');await sleep(300);
    if(child.exitCode===null)child.kill('SIGKILL');}
  if(profile)await rm(profile,{force:true,recursive:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
