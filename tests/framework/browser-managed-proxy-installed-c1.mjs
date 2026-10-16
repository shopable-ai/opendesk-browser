#!/usr/bin/env node
// R1.5 C1: formal extension, installed official tool, actual CDP mouse and file input.
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
async function evalAt(session,expression){
  const reply=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);
  if(reply.exceptionDetails)throw Error(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text);
  return reply.result?.value;
}
async function element(selector){
  const script='(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);'+
    'return {visible:r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"'+
    '&&!e.disabled&&!e.closest("[hidden]"),x:r.x+r.width/2,y:r.y+r.height/2,'+
    'text:e.textContent?.slice(0,100),disabled:!!e.disabled};})()';
  return evalAt(page,script);
}
async function click(selector){
  const a=await element(selector);
  assert(a?.visible,'Chrome input cannot reach '+selector+': '+JSON.stringify(a));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:a.x,y:a.y},page);
  step('CHROME_MOUSE_INPUT',{selector,api:'Input.dispatchMouseEvent'});
}
async function screenshot(name){
  const frame=await client.send('Page.captureScreenshot',{format:'png'},page);
  const bytes=Buffer.from(frame.data,'base64'),file=resolve('artifacts/managed-proxy-c1-'+name+'.png');
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
async function main(){
  assert(process.env.CHROME_FOR_TESTING_BIN,'Pinned Chrome for Testing required');
  const candidate=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
  assert.equal(candidate.id,'ai-vip-share');assert.equal(candidate.version,'1.3.3');
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
  const args=['--headless=new','--no-first-run','--no-default-browser-check','--disable-sync',
    '--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+PATH,'--load-extension='+PATH,'about:blank'];
  if(noSandbox)args.unshift('--no-sandbox');
  child=spawn(process.env.CHROME_FOR_TESTING_BIN,args,{stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',part=>{stderr=(stderr+part.toString()).slice(-8000);});
  const location=await until(async()=>{
    const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
    return lines.length===2?lines:null;
  },'Chrome debugger');
  client=await connect('ws://127.0.0.1:'+location[0]+location[1]);
  receipt.chrome={...(await client.send('Browser.getVersion')),noSandbox};
  const targets=()=>client.send('Target.getTargets').then(x=>x.targetInfos||[]);
  const swTarget=await until(async()=>(await targets()).find(x=>
    x.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(x.url)),'production SW');
  const extensionId=swTarget.url.split('/')[2],worker=await attach(swTarget.targetId);
  receipt.extensionId=extensionId;
  const first=await readNative(worker);
  assert.equal(first.journal,null,'Fresh Chrome profile has an unexpected proxy journal');
  if(first.settings)assert.notEqual(first.settings.value?.mode,'pac_script');
  const tab=await until(async()=>(await targets()).find(x=>x.type==='page'&&x.url==='about:blank'),'Chrome tab');
  page=await attach(tab.targetId,true);
  const url='chrome-extension://'+extensionId+'/ui/tool.html?toolId=ai-vip-share';
  await client.send('Page.navigate',{url},page);
  await until(()=>element('#sidebar-tool-import-trigger'),'production installer');
  step('FORMAL_EXTENSION_HOST',{status:'PASS',url:await evalAt(page,'location.href')});
  await click('#sidebar-tool-import-trigger');
  const {root}=await client.send('DOM.getDocument',{depth:1},page);
  const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},page);
  assert(nodeId,'Official installer file field missing');
  await client.send('DOM.setFileInputFiles',{nodeId,
    files:[resolve('examples/sidebar-tools/ai-vip-share/ai-vip-share.opendesk-tool.json')]},page);
  await until(async()=>{
    const btn=await element('#sidebar-tool-install');
    return btn?.visible&&btn.text?.includes('确认安装');
  },'genuine package review');
  await screenshot('review');
  await click('#sidebar-tool-install');
  const installed=await until(async()=>evalAt(page,'(async()=>{const values=await chrome.storage.local.get(['+
    '"opendesk.sidebar-tools.installed.v1","opendesk.sidebar-tools.revocation-epochs.v1"]);'+
    'const pkg=values["opendesk.sidebar-tools.installed.v1"]?.find(x=>x.id==="ai-vip-share");'+
    'return pkg?{pkg,epoch:values["opendesk.sidebar-tools.revocation-epochs.v1"]?.["ai-vip-share"]??null}:null;})()'),
  'actual Chrome-installed package');
  assert.equal(installed.pkg.version,candidate.version);
  assert.equal(serializeSidebarToolPackage(installed.pkg),serializeSidebarToolPackage(candidate));
  assert.equal(await sidebarToolPackageHash(installed.pkg),identityHash);
  receipt.installed=true;receipt.installEpoch=installed.epoch;
  step('TRUSTED_INSTALL',{status:'PASS',packageHash:identityHash,installEpoch:installed.epoch});
  await screenshot('installed');
  await client.send('Page.navigate',{url},page);
  await until(async()=>{const e=await element('#sidebar-tool-frame iframe');return e?.visible&&e;},
    'installed tool sandbox');
  await screenshot('tool');
  const after=await readNative(worker);
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
  receipt.result=panel?'NATIVE_TAB_INSTALL_PASS_SIDE_PANEL_OBSERVED_NOT_INTERACTED':
    'NATIVE_TAB_INSTALL_PASS_SIDE_PANEL_BLOCKED';
  console.log('MANAGED_PROXY_C1='+receipt.result);
}
try{await main();}catch(e){receipt.result='FAIL';receipt.errors.push(String(e.stack||e));
  console.error('MANAGED_PROXY_C1=FAIL',e);process.exitCode=1;
}finally{
  await mkdir(dirname(OUTPUT),{recursive:true});
  await writeFile(OUTPUT,JSON.stringify(receipt,null,2)+'\n');
  try{client?.close()}catch{}
  if(child?.exitCode===null){child.kill('SIGTERM');await sleep(300);
    if(child.exitCode===null)child.kill('SIGKILL');}
  if(profile)await rm(profile,{force:true,recursive:true,maxRetries:3,retryDelay:150}).catch(()=>{});
}
