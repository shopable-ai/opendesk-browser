// One targeted Linux CFT UI acceptance of the original React TOC example.
// It imports its frozen JSON, draws actual ECharts, updates website headings,
// resizes the real container with Chrome window/zoom controls, Stops and installs.
// User source enters ONLY through the real product file-input / Run controls.
// CDP is used for trusted pointer/key/file input, read-only evidence and screenshots.
// No permissions preference edits, dependency execution in privileged pages,
// runtime CDN injection, synthetic events, alternate Page executor or Native mock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const options=Object.fromEntries(process.argv.slice(2).map(arg=>{
  assert(arg.startsWith('--'),'Use named CLI options');
  const at=arg.indexOf('=');
  return at<0?[arg.slice(2),true]:[arg.slice(2,at),arg.slice(at+1)];
}));
const allowed=new Set(['repo','package','draft','artifact','chrome','output','probe',
  'container-no-sandbox','install','kind','fixture-controls','headed','browser-source']);
for(const key of Object.keys(options))assert(allowed.has(key),'Unknown option '+key);
if(options.kind)assert(['toc','echarts'].includes(options.kind),'Only the original ECharts TOC example is supported');
const repo=fs.realpathSync(path.resolve(options.repo||process.cwd()));
const binary=fs.realpathSync(options.chrome||process.env.CHROME_FOR_TESTING_BIN||
  '/tmp/opendesk-r5-cft/chrome-linux64/chrome');
assert.equal(process.platform,'linux','This driver is the Linux headless evidence slice');
if(options['container-no-sandbox']){
  assert.equal(process.getuid?.(),0,'No-sandbox is restricted to an explicit root container invocation');
  assert(fs.existsSync('/.dockerenv')||fs.existsSync('/run/.containerenv')||
    fs.readFileSync('/proc/1/cgroup','utf8').includes('docker')||
    fs.existsSync('/opt/codex'),'Expected the isolated coding container');
}
const output=options.output?path.resolve(options.output):
  fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-url-import-evidence-'));
if(options.output){assert(!fs.existsSync(output),'Preserve old evidence; choose a fresh --output');fs.mkdirSync(output,{recursive:true});}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-url-import-profile-'));
const profileIdentity=fs.statSync(profile);
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const write=(name,value)=>fs.writeFileSync(path.join(output,name),
  typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n');
const report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),sourceHead:null,
  sourceWorkingTree:null,platform:process.platform,chromeBinary:binary,
  chromeVersion:execFileSync(binary,['--version'],{encoding:'utf8'}).trim(),
  headless:!options.headed,nativeHostConfigured:false,sandbox:options['container-no-sandbox']?
    'explicit --no-sandbox for this isolated root-container Chrome child':'default',
  profile,tests:[],network:[],limits:[
    'Linux CFT, not user Mac Native acceptance.',
    'This is one frozen-JSON UI acceptance, not the browser source editor new-origin preparation flow.',
    'Browser loading/Stop races, renderer error injection, source/version switching and uninstall remain NOT_TESTED.',
    'DOM disposal is observed directly; observer/listener resource counts use the separate lifecycle component tests.'
  ]};
try{
  report.sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
  report.sourceWorkingTree=execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'});
}catch(error){report.sourceIdentityError=error.message;}
write('driver-source.mjs',fs.readFileSync(process.argv[1],'utf8'));
report.driverSha256=sha(fs.readFileSync(process.argv[1]));
const record=(type,value)=>{
  fs.appendFileSync(path.join(output,'events.jsonl'),JSON.stringify({at:new Date().toISOString(),type,value})+'\n');
  console.log(type+' '+JSON.stringify(value));
};
async function until(fn,label,timeout=20000){
  const end=Date.now()+timeout;let cause;
  while(Date.now()<end){
    try{const value=await fn();if(value)return value;}catch(error){cause=error;}
    await pause(100);
  }
  throw Error(label+' timed out'+(cause?': '+cause.message:''));
}
async function cdp(uri,label){
  const ws=new WebSocket(uri),pending=new Map(),handlers=new Map();let serial=0;
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  ws.addEventListener('message',event=>{
    const data=JSON.parse(String(event.data));
    if(data.id){
      const task=pending.get(data.id);if(!task)return;
      pending.delete(data.id);clearTimeout(task.timer);
      data.error?task.reject(Error(data.error.message)):task.resolve(data.result);
    }else for(const handler of handlers.get(data.method)||[])handler(data.params);
  });
  ws.addEventListener('close',()=>{
    for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error(label+' CDP closed'));}
    pending.clear();
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},30000);
    pending.set(id,{resolve,reject,timer});
    try{ws.send(JSON.stringify({id,method,params}));}
    catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
  const read=async expression=>{
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
  };
  const on=(method,fn)=>{
    const rows=handlers.get(method)||new Set();rows.add(fn);handlers.set(method,rows);
    return ()=>rows.delete(fn);
  };
  if(label!=='browser')await call('Runtime.enable');
  on('Runtime.exceptionThrown',p=>record('browser-exception',{surface:label,exception:p.exceptionDetails}));
  return {call,read,on,close:()=>ws.close(),label};
}
async function clickReal(session,expression,{beforeRelease}={}){
  const handle=await session.call('Runtime.evaluate',{expression,returnByValue:false});
  assert(handle.result?.objectId,'Real input node exists: '+expression);
  try{
    await session.call('DOM.scrollIntoViewIfNeeded',{objectId:handle.result.objectId});
    const rect=await session.read('(()=>{const e=('+expression+');if(!e||e.disabled)return null;'+
      'const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()');
    assert(rect?.width>0&&rect.height>0&&rect.x>0&&rect.y>0,'Visible enabled real input: '+expression);
    record('trusted-input-target',{surface:session.label,expression,rect,url:await session.read('location.href')});
    for(const type of ['mousePressed','mouseReleased']){
      if(type==='mouseReleased')beforeRelease?.();
      await session.call('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1});
    }
  }finally{await session.call('Runtime.releaseObject',{objectId:handle.result.objectId});}
}
async function key(session,keyValue,code,keyCode,modifiers=0){
  for(const type of ['rawKeyDown','keyUp'])
    await session.call('Input.dispatchKeyEvent',{type,key:keyValue,code,windowsVirtualKeyCode:keyCode,modifiers});
}
async function setNativeTabZoom(sidebar,tabId,factor){
  // Chrome's own tabs API changes the actual browser zoom and thus the site's
  // CSS pixel viewport. This is not a CSS/DOM assignment or device emulation.
  // X11 _NET_WM_PID is not reliable for Chrome's multi-process Xvfb window.
  assert(Number.isInteger(tabId)&&tabId>=0,'Real Chrome tab identity required');
  assert(Number.isFinite(factor)&&factor>=1&&factor<=2,'Restrict this acceptance to browser zoom 100%-200%');
  const before=await sidebar.read('chrome.tabs.getZoom('+tabId+')');
  await sidebar.read('chrome.tabs.setZoom('+tabId+','+factor+')');
  const after=await until(async()=>{
    const z=await sidebar.read('chrome.tabs.getZoom('+tabId+')');
    return Math.abs(z-factor)<0.001?z:null;
  },'Native Chrome tabs.setZoom changes the real tab zoom',5000);
  const evidence={tabId,before,after,requested:factor,mechanism:'chrome.tabs.setZoom'};
  record('native-chrome-tab-zoom',evidence);
  return evidence;
}
async function typeReal(session,selector,value){
  const expr='document.querySelector('+JSON.stringify(selector)+')';
  assert.equal(await session.read(expr+'.readOnly'),false,'Native input must be editable');
  await clickReal(session,expr);
  await key(session,'a','KeyA',65,2); // Linux Ctrl+A, following a trusted focus click.
  if(value==='')await key(session,'Backspace','Backspace',8);
  else await session.call('Input.insertText',{text:value});
  await until(()=>session.read(expr+'.value==='+JSON.stringify(value)),'Native input preserves authored bytes');
}
async function selectIndex(session,selector,index){
  const expr='document.querySelector('+JSON.stringify(selector)+')';
  const expected=await session.read('('+expr+').options['+index+']?.value');
  assert.notEqual(expected,undefined);
  await clickReal(session,expr);
  await key(session,'Home','Home',36);
  for(let i=0;i<index;i++)await key(session,'ArrowDown','ArrowDown',40);
  await key(session,'Enter','Enter',13);
  await until(()=>session.read(expr+'.value==='+JSON.stringify(expected)),'Real selected option');
}
async function details(session,id){
  const expr='document.getElementById('+JSON.stringify(id)+')';
  if(!await session.read(expr+'.open'))await clickReal(session,expr+'.querySelector("summary")');
  assert(await session.read(expr+'.open'));
}
async function screenshot(session,name){
  const data=await session.call('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(output,name),Buffer.from(data.data,'base64'));
}
async function nodeHandle(session,expression){
  const result=await session.call('Runtime.evaluate',{expression,returnByValue:false});
  assert(result.result?.objectId,'Observed real DOM node exists: '+expression);
  const {node}=await session.call('DOM.describeNode',{objectId:result.result.objectId});
  return {objectId:result.result.objectId,backendNodeId:node.backendNodeId};
}
async function releaseHandle(session,handle){
  if(handle)await session.call('Runtime.releaseObject',{objectId:handle.objectId});
}
async function readChartDisposal(session,handle){
  // Read a retained DOM node after product cleanup. This never calls ECharts
  // or executes user code in the webpage or an extension host.
  const result=await session.call('Runtime.callFunctionOn',{
    objectId:handle.objectId,returnByValue:true,
    functionDeclaration:'function(){return {connected:this.isConnected,'+
      'instanceId:this.getAttribute("_echarts_instance_"),svgCount:this.querySelectorAll("svg").length,'+
      'childElementCount:this.childElementCount}}'
  });
  if(result.exceptionDetails)throw Error('Could not observe retained chart DOM');
  return result.result.value;
}
const chartSelector='[role="img"][aria-label^="ECharts 标题层级分布"]';
function chartExpression(host){return '('+host+')?.shadowRoot?.querySelector('+JSON.stringify(chartSelector)+')';}
async function chartSnapshot(session,host){
  const value=await session.read('(()=>{const root=('+host+')?.shadowRoot;'+
    'const container=root?.querySelector('+JSON.stringify(chartSelector)+');const svg=container?.querySelector("svg");'+
    'if(!svg)return null;const rect=e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y}};'+
    'const ariaLabel=container.getAttribute("aria-label");'+
    'return {state:root.querySelector("[data-echarts-state]")?.dataset.echartsState,'+
    'instanceId:container.getAttribute("_echarts_instance_"),ariaLabel,'+
    'counts:Array.from(ariaLabel.matchAll(/H([1-6])：(\\d+)/g),m=>({level:Number(m[1]),count:Number(m[2])})),'+
    'container:rect(container),svg:rect(svg),viewport:{width:innerWidth,height:innerHeight},'+
    'svgWidth:svg.getAttribute("width"),svgHeight:svg.getAttribute("height"),'+
    'text:Array.from(svg.querySelectorAll("text"),n=>n.textContent),'+
    'paths:Array.from(svg.querySelectorAll("path"),n=>({d:n.getAttribute("d"),fill:n.getAttribute("fill"),stroke:n.getAttribute("stroke")})),'+
    'errors:Array.from(root.querySelectorAll("[role=alert]"),n=>n.textContent)}})()');
  if(!value)return null;
  return {...value,geometrySha256:sha(JSON.stringify(value.paths))};
}
async function websiteHeadingCounts(session){
  // The original fixture has one <main> and all scanner-relevant headings
  // are ordinary visible descendants. Observe its actual data independently
  // of the component's accessible labels and ECharts output.
  return session.read('(()=>{const counts=[0,0,0,0,0,0];'+
    'for(const n of document.querySelectorAll("main h1,main h2,main h3,main h4,main h5,main h6")){'+
    'if(n.closest("nav,aside,footer,pre,code,template,[hidden],[inert],[aria-hidden=true],[role=navigation],[contenteditable=true],[data-opendesk-ui-owner]"))continue;'+
    'const style=getComputedStyle(n);if(n.getClientRects().length&&style.display!=="none"&&style.visibility!=="hidden"&&n.textContent.trim())'+
    'counts[Number(n.tagName.slice(1))-1]++}return counts})()');
}
function assertChart(snapshot,expected){
  assert.equal(snapshot.state,'ready','ECharts initialization and painting completed');
  assert(snapshot.instanceId,'Actual ECharts instance marker is present');
  assert.deepEqual(snapshot.counts.map(row=>row.level),[1,2,3,4,5,6]);
  assert.deepEqual(snapshot.counts.map(row=>row.count),expected,'ECharts data matches actual visible website headings');
  assert(snapshot.svg.width>0&&snapshot.svg.height>0&&snapshot.paths.length>0,'Actual SVG paths are visible');
  assert(Math.abs(snapshot.svg.width-snapshot.container.width)<2,'SVG follows its real container width');
  assert(Math.abs(snapshot.svg.height-snapshot.container.height)<2,'SVG follows its real container height');
  for(const level of ['H1','H2','H3','H4','H5','H6'])assert(snapshot.text.includes(level),'SVG category text '+level);
  assert.deepEqual(snapshot.errors,[],'No chart error is hidden behind a ready state');
}
async function fileInput(session,id,file){
  // The real file input is opened by a trusted pointer. CDP supplies its
  // chosen file via the browser's file chooser; no change event is fabricated.
  let chooser;
  const off=session.on('Page.fileChooserOpened',event=>{chooser=event;});
  await session.call('Page.setInterceptFileChooserDialog',{enabled:true});
  try{
    await clickReal(session,'document.getElementById('+JSON.stringify(id)+')');
    await until(()=>chooser,'Real file chooser');
    assert.equal(chooser.mode,'selectSingle');
    await session.call('DOM.setFileInputFiles',{files:[file],backendNodeId:chooser.backendNodeId});
  }finally{
    off();await session.call('Page.setInterceptFileChooserDialog',{enabled:false});
  }
}
async function readInstalled(session,programId){
  return session.read('(async()=>{const rows=[];for(const info of await indexedDB.databases()){'+
    'if(!info.name)continue;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);'+
    'r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});'+
    'try{if(db.objectStoreNames.contains("frameworkKV"))rows.push(...await new Promise((resolve,reject)=>{'+
    'const r=db.transaction("frameworkKV","readonly").objectStore("frameworkKV").getAll();'+
    'r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}))}finally{db.close()}}'+
    'return rows.filter(r=>r.programId==='+JSON.stringify(programId)+'||r.manifest?.programId==='+JSON.stringify(programId)+').map(r=>Object.fromEntries('+
    '["tag","programId","revision","manifest","manifestHash","candidateId","stage","sourceHash","pageRules","enabled","nativeId","nativeState",'+
    '"authorization","status","receiptHash","receipt","state","documentId","installationId","grantGeneration",'+
    '"lastExecution","result","receiptId","receiptNonce","world","tabId","effectConfirmed","error"].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))})()');
}

let chrome,browser,proxy,packageRoot,packageFingerprint,verifyPackage,launchAttempted=false;
const sessions=[];
const D3_URL='https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const D3_HASH='691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const D3_AUTHORITY='raw.githubusercontent.com:443';
let allowD3Tunnel=false,downloadPhase='closed',sourceNetworkSession;
const sourceRequests=[],sourceResponses=[],sourceTunnels=new Set();
function closeD3Tunnels(){
  allowD3Tunnel=false;
  for(const socket of sourceTunnels)socket.destroy();
  sourceTunnels.clear();
}
async function readBrowserSourceStore(session,programId){
  return session.read('(async()=>{const rows=[];for(const info of await indexedDB.databases()){'+
    'if(!info.name)continue;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);'+
    'r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});'+
    'try{if(db.objectStoreNames.contains("frameworkKV"))rows.push(...await new Promise((resolve,reject)=>{'+
    'const r=db.transaction("frameworkKV","readonly").objectStore("frameworkKV").getAll();'+
    'r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}))}finally{db.close()}}'+
    'const dependencyRows=rows.filter(r=>["component-esm-review-v1","component-esm-lock-v1"].includes(r.tag)&&'+
    'r.manifest?.roots?.includes('+JSON.stringify(D3_URL)+')).map(r=>Object.fromEntries('+
    '["tag","reviewId","reviewDigest","sourceHash","manifest","manifestDigest","entries","status","lockId","remoteLock","graph","createdAt","approvedAt"]'+
    '.filter(k=>r[k]!==undefined).map(k=>[k,r[k]])));'+
    'const asset=rows.find(r=>r.tag==="userscript-asset-v1"&&r.sha256==='+JSON.stringify(D3_HASH)+');'+
    'const candidate=rows.find(r=>r.tag==="page-candidate-v1"&&r.manifest?.programId==='+JSON.stringify(programId)+');'+
    'return {dependencyRows,asset:asset?{sha256:asset.sha256,byteLength:asset.byteLength,integrityStatus:asset.integrityStatus,'+
    'bytes:Array.from(asset.bytes)}:null,candidate:candidate?{candidateId:candidate.candidateId,stage:candidate.stage,'+
    'manifestHash:candidate.manifestHash,manifest:candidate.manifest,sourceUtf8:candidate.sourceUtf8}:null}})()');
}
async function runBrowserSourceScenario({sidebar,website,browser,frameworkSha256}){
  const programId='cft-browser-d3-source',source=[
    "import {createElement} from 'react';",
    "import max from '"+D3_URL+"';",
    '',
    'export default function App(){',
    '  const value=max([2,5,3]);',
    "  return createElement('div',{'data-browser-d3-value':String(value),role:'status',",
    "    style:{padding:16,background:'#fff',color:'#183c65',font:'18px sans-serif'}},",
    "    'D3 max([2,5,3]) = '+value);",
    '}',''
  ].join('\n');
  const authoringHash=sha(source),host='document.querySelector("[data-od-id=\\"browser-react\\"]")';
  report.browserSource={status:'IN_PROGRESS',phase:'editor',sourceUrl:D3_URL,authoringHash};
  write('browser-source-authored.jsx',source);
  const connections=()=>report.network.filter(row=>row.method==='CONNECT'&&row.authority===D3_AUTHORITY);
  const noMount=()=>website.session.read('!('+host+')');
  assert.deepEqual(connections(),[],'No D3 CONNECT occurred during frozen JSON execution');
  assert.deepEqual(sourceRequests,[],'No hidden D3 HTTPS request preceded source preparation');
  await browser.call('Target.activateTarget',{targetId:website.id});
  await until(()=>sidebar.read('!document.querySelector("#program-new-script").hidden'),'Original new-source control');
  await clickReal(sidebar,'document.querySelector("#program-new-script")');
  await until(()=>sidebar.read('document.querySelector("#script-source").readOnly===false'),'Single-file editor becomes editable');
  if(!await sidebar.read('document.querySelector("#page-component-react").checked'))
    await clickReal(sidebar,'document.querySelector("label[for=page-component-react]")');
  await until(()=>sidebar.read('document.querySelector("#page-component-react").checked'),'Actual React source selection');
  await details(sidebar,'script-library-tools');
  await typeReal(sidebar,'#script-id',programId);
  await typeReal(sidebar,'#script-revision','');
  await typeReal(sidebar,'#script-source',source);
  assert.equal(sha(await sidebar.read('document.querySelector("#script-source").value')),authoringHash);
  assert(await noMount(),'Typing component source never mounts it');
  await until(()=>sidebar.read('!document.querySelector("#page-component-remote").hidden&&'+
    '!document.querySelector("#page-component-remote-prepare").disabled'),'Original URL preparation control available');
  const before=await readBrowserSourceStore(sidebar,programId);
  assert(!before.dependencyRows.some(row=>row.tag==='component-esm-lock-v1'),'This is a first source approval in the fresh profile');
  const remoteState=()=>sidebar.read('(()=>{const n=document.querySelector("#page-component-remote-status");'+
    'return {state:n.dataset.state,text:n.textContent,sources:document.querySelector("#page-component-remote-sources").textContent,'+
    'button:document.querySelector("#page-component-remote-prepare").textContent,'+
    'detail:document.querySelector("#page-component-remote-detail-body").textContent}})()');
  await clickReal(sidebar,'document.querySelector("#page-component-remote-prepare")');
  const inspected=await until(async()=>{const state=await remoteState();return ['download','error'].includes(state.state)?state:null;},
    'Original inspector lists unprepared HTTPS source');
  assert.equal(inspected.state,'download',inspected.text);
  assert.deepEqual(inspected.sources.split('\n').filter(Boolean),[D3_URL]);
  assert.equal(inspected.button,'确认获取所列模块');
  assert.deepEqual(connections(),[],'Inspection must not open any D3 HTTPS tunnel');
  assert.deepEqual(sourceRequests,[],'Inspection must not request new D3 code');
  assert(await noMount());
  write('browser-source-inspected.json',inspected);
  await screenshot(sidebar,'browser-source-review-before-download.png');
  report.tests.push({name:'browser-source-native-input-and-source-inspection-without-download-or-run',status:'PASS',
    authoringHash,url:D3_URL,connectAttempts:0,httpsRequests:0});

  report.browserSource.phase='explicit-download';
  // The network gate opens at the trusted release that activates the actual
  // product confirmation button. The proxy only passes end-to-end TLS.
  await clickReal(sidebar,'document.querySelector("#page-component-remote-prepare")',{
    beforeRelease(){
      downloadPhase='download-confirmed';allowD3Tunnel=true;
      report.browserSource.downloadActionAt=new Date().toISOString();
      record('browser-source-explicit-download-pointer',{url:D3_URL,authoringHash});
    }
  });
  let downloaded;
  try{
    downloaded=await until(async()=>{const state=await remoteState();return ['review','error'].includes(state.state)?state:null;},
      'Real HTTPS download and complete graph review',45000);
  }finally{closeD3Tunnels();downloadPhase='closed-after-download';}
  assert.equal(downloaded.state,'review',downloaded.text);
  const actualRequests=sourceRequests.filter(row=>row.phase==='download-confirmed');
  assert(actualRequests.length>0,'Service Worker observed the actual HTTPS source request');
  assert(sourceRequests.every(row=>row.url===D3_URL&&row.method==='GET'&&row.phase==='download-confirmed'),
    'Only the explicitly confirmed fixed HTTPS URL was requested');
  assert(connections().length>0&&connections().every(row=>row.allowed&&row.phase==='download-confirmed'&&row.connectedAt),
    'Only a confirmed real raw.githubusercontent.com TLS tunnel was allowed');
  assert(sourceResponses.some(row=>row.url===D3_URL&&row.status===200&&!row.fromDiskCache&&!row.fromServiceWorker),
    'Actual public HTTPS response arrived without a fixture or browser cache replacement');
  assert(downloaded.detail.includes('502 bytes')&&downloaded.detail.includes(D3_HASH),'Real UI exposes the exact acquired pin');
  const review=await readBrowserSourceStore(sidebar,programId);
  const pending=review.dependencyRows.find(row=>row.tag==='component-esm-review-v1'&&row.status==='pending');
  assert(pending&&pending.sourceHash===authoringHash,'Original source-bound pending review exists');
  assert.deepEqual(pending.entries.map(({url,sha256,bytes})=>({url,sha256,bytes})),[{url:D3_URL,sha256:D3_HASH,bytes:502}]);
  assert.equal(review.asset.byteLength,502);
  assert.equal(review.asset.bytes.length,502);
  assert.equal(sha(Buffer.from(review.asset.bytes)),D3_HASH,'Hash actual acquired, persisted raw bytes independently');
  assert.equal(review.asset.integrityStatus,'verified');
  assert(!review.dependencyRows.some(row=>row.tag==='component-esm-lock-v1'),'Download alone does not approve a version');
  assert(await noMount(),'Dependency acquisition never executes the component');
  write('browser-source-downloaded-review.json',{ui:downloaded,store:review,requests:sourceRequests,responses:sourceResponses,connects:connections()});
  write('browser-source-acquired-max.mjs',Buffer.from(review.asset.bytes));
  await screenshot(sidebar,'browser-source-hash-review.png');
  const networkCount=connections().length,requestCount=sourceRequests.length;
  assert.equal(downloaded.button,'确认固定此版本');
  report.browserSource.phase='explicit-pin';
  await clickReal(sidebar,'document.querySelector("#page-component-remote-prepare")');
  const approvedState=await until(async()=>{const state=await remoteState();return ['ready','error'].includes(state.state)?state:null;},
    'Original explicit immutable dependency approval');
  assert.equal(approvedState.state,'ready',approvedState.text);
  const approvedStore=await readBrowserSourceStore(sidebar,programId);
  const approved=approvedStore.dependencyRows.find(row=>row.tag==='component-esm-lock-v1'&&row.status==='approved');
  assert(approved?.lockId&&approved?.manifestDigest,'Original approved lock identity');
  assert.deepEqual(approved.remoteLock,{format:'opendesk.remote-lock.v1',modules:{[D3_URL]:{sha256:D3_HASH,bytes:502}}});
  assert.deepEqual(approved.graph,[{url:D3_URL,children:[]}],'Complete real D3 transitive graph contains only the acquired module');
  assert(await noMount());
  report.browserSource={...report.browserSource,lockId:approved.lockId,manifestDigest:approved.manifestDigest,
    reviewId:pending.reviewId,reviewDigest:pending.reviewDigest,dependencyHash:D3_HASH,dependencyBytes:502};
  write('browser-source-approved-lock.json',approvedStore);
  report.tests.push({name:'browser-source-real-HTTPS-download-hash-review-and-explicit-fixed-lock',status:'PASS',
    ...report.browserSource,httpsRequests:requestCount,connects:networkCount});

  report.browserSource.phase='save-only';
  await until(()=>sidebar.read('!document.querySelector("#script-save").disabled'),'Original prepare-and-save enabled');
  await clickReal(sidebar,'document.querySelector("#script-save")');
  await until(()=>sidebar.read('document.querySelector("#page-candidate-status").dataset.state==="saved"&&'+
    'document.querySelector("#page-candidate-status").textContent.includes('+JSON.stringify(programId)+')'),
    'Single-file component Save prepares and persists the original Candidate',30000);
  const saved=await readBrowserSourceStore(sidebar,programId),candidate=saved.candidate;
  assert(candidate?.stage==='Candidate','Save creates only a Candidate');
  assert.equal(sha(candidate.sourceUtf8),candidate.manifest.sourceHash);
  assert(candidate.sourceUtf8.includes(D3_HASH),'Fixed D3 pin is linked into the saved program');
  assert(await noMount(),'Save never operates the target webpage');
  const installedRows=await readInstalled(sidebar,programId);
  assert(!installedRows.some(row=>row.tag==='page-installed-v1'||row.tag==='page-verification-v1'),'Save never verifies or installs');
  assert.equal(connections().length,networkCount,'Approval and Save cannot acquire new code');
  assert.equal(sourceRequests.length,requestCount);
  write('browser-source-prepared-program.js',candidate.sourceUtf8);
  write('browser-source-saved-candidate.json',{...candidate,sourceUtf8:undefined,sourceBytes:Buffer.byteLength(candidate.sourceUtf8)});
  report.browserSource.sourceHash=candidate.manifest.sourceHash;
  report.browserSource.candidateId=candidate.candidateId;
  report.browserSource.manifestHash=candidate.manifestHash;
  report.tests.push({name:'browser-source-Save-only-prepares-fixed-Candidate-no-DOM-or-install',status:'PASS',
    authoringHash,sourceHash:candidate.manifest.sourceHash,candidateId:candidate.candidateId,manifestHash:candidate.manifestHash});

  report.browserSource.phase='explicit-run';
  await details(sidebar,'page-preview-tools');
  await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),'Original component Run enabled');
  await clickReal(sidebar,'document.querySelector("#page-preview-run")');
  const result=await until(()=>sidebar.read('(()=>{const state=document.querySelector("#page-preview-status");'+
    'if(state.dataset.state==="error")return {error:state.textContent};try{const r=JSON.parse(document.querySelector("#page-preview-technical").textContent);'+
    'return r.sourceHash==='+JSON.stringify(candidate.manifest.sourceHash)+'&&state.dataset.state==="completed"?r:null}catch{return null}})()'),
    'Actual browser-authored USER_SCRIPT execution receipt',30000);
  assert(!result.error,result.error);
  assert.equal(result.state,'preview-evaluated');assert.equal(result.world,'USER_SCRIPT');
  assert.equal(result.sourceHash,candidate.manifest.sourceHash);
  assert.equal(result.packagedFrameworkId,'react');assert.equal(result.packagedFrameworkSha256,frameworkSha256);
  assert.equal(result.managedUI,true);assert(result.managedPreviewId&&result.documentId);
  assert.deepEqual(result.authoring.remoteModules,[{url:D3_URL,sha256:D3_HASH,bytes:502}]);
  const nativeFrame=await sidebar.read('chrome.webNavigation.getFrame({documentId:'+JSON.stringify(result.documentId)+'})');
  assert.equal(nativeFrame.url,await website.session.read('location.href'));
  const rendered=await until(()=>website.session.read('(()=>{const n=('+host+')?.shadowRoot?.querySelector("[data-browser-d3-value]");'+
    'const r=n?.getBoundingClientRect();return n?.dataset.browserD3Value==="5"&&r.width>0&&r.height>0?'+
    '{value:n.dataset.browserD3Value,text:n.textContent,width:r.width,height:r.height}:null})()'),'Imported D3 really renders max([2,5,3]) = 5');
  assert.equal(rendered.text,'D3 max([2,5,3]) = 5');
  write('browser-source-preview-receipt.json',result);
  await screenshot(website.session,'browser-source-d3-rendered.png');
  report.tests.push({name:'browser-source-direct-D3-URL-renders-real-max-in-fixed-React-USER_SCRIPT',status:'PASS',
    authoringHash,sourceHash:result.sourceHash,previewId:result.managedPreviewId,documentId:result.documentId,
    frameworkSha256,remoteModules:result.authoring.remoteModules,rendered});
  await until(()=>sidebar.read('!document.querySelector("#script-stop").disabled'),'Original browser component Stop enabled');
  await clickReal(sidebar,'document.querySelector("#script-stop")');
  const stopped=await until(()=>sidebar.read('(()=>{try{const r=JSON.parse(document.querySelector("#page-preview-technical").textContent).stop;'+
    'return r?.previewId==='+JSON.stringify(result.managedPreviewId)+'?r:null}catch{return null}})()'),'Original browser-source Stop receipt');
  assert.equal(stopped.state,'preview-retired');assert.equal(stopped.sourceHash,result.sourceHash);
  assert.equal(stopped.receipt.ok,true);assert.equal(stopped.receipt.scope,'managed-ui-only');
  await until(noMount,'Browser-authored D3 component actually removed');
  await pause(250);assert(await noMount(),'No late browser-source remount');
  assert.equal(connections().length,networkCount,'Run and Stop never redownload approved code');
  assert.equal(sourceRequests.length,requestCount);
  assert.equal(await sidebar.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),false);
  write('browser-source-stop-receipt.json',stopped);
  await screenshot(website.session,'browser-source-d3-stopped.png');
  report.browserSource={...report.browserSource,status:'PASS',phase:'stopped',previewId:result.managedPreviewId,
    documentId:result.documentId,frameworkSha256,rendered,stop:stopped};
  report.tests.push({name:'browser-source-fixed-D3-offline-Run-and-managed-Stop',status:'PASS',
    ...report.browserSource,httpsRequests:requestCount,connects:networkCount});
}
async function main(){
  const inputPackage=options.package&&path.resolve(options.package);
  if(inputPackage){
    assert(fs.existsSync(path.join(inputPackage,'manifest.json')),'Actual MV3 package missing');
    const verifier=await import(pathToFileURL(path.join(repo,'scripts/verify-package.mjs')));
    packageFingerprint=verifier.packageFingerprint;verifyPackage=verifier.verifyPackage;
    const first=await verifyPackage(inputPackage,{mode:'production'});
    assert.equal(first.status,'passed');
    packageRoot=path.join(output,'extension');
    fs.cpSync(inputPackage,packageRoot,{recursive:true,errorOnExist:true});
    const copied=await packageFingerprint(packageRoot),unchanged=await packageFingerprint(inputPackage);
    assert.equal(copied.packageHash,first.packageHash,'Copied exact verified immutable bytes');
    assert.equal(unchanged.packageHash,first.packageHash,'No dist drift while copying');
    report.packageHash=first.packageHash;report.packageInput=inputPackage;
    report.loadedPackage=packageRoot;report.packageVerified=true;
    write('package-identity.json',first);
  }else{
    assert(options.probe,'Non-probe needs the actual built extension --package');
    report.limits.push('No extension package supplied: Chrome-only environment probe.');
  }
  // Chromium's process singleton requires a local Unix socket even with
  // --no-sandbox. Detect an environment denial without changing its controls.
  const socketProbe=net.createServer(),socketPath=path.join(profile,'preflight.sock');
  await new Promise((resolve,reject)=>{
    socketProbe.once('error',error=>reject(Object.assign(new Error(
      'Chrome requires AF_UNIX; this execution environment rejected it: '+error.code),
      {code:'E_CFT_ENV_UNIX_SOCKET',cause:error})));
    socketProbe.listen(socketPath,()=>socketProbe.close(resolve));
  });
  report.unixSocketPreflight='allowed';
  // Preserve the original example's canonical pathname and match rules
  // without binding the shared 43111 port. The original fixture is served
  // unchanged except for an explicit test query that loads a static website-
  // owned controls script. It is not a user library or a CDP DOM mutation.
  const fixture=fs.readFileSync(path.join(repo,'examples/tasks/demo-form.html'));
  const controlsPath=path.resolve(options['fixture-controls']||path.join(repo,
    'tests/framework/fixtures/page-url-import-controls.js'));
  const controls=options.probe?null:fs.readFileSync(controlsPath);
  const controlledFixture=controls?Buffer.concat([fixture,Buffer.from(
    '\n<script src="/opendesk-url-import-controls.js"></script>\n')]):fixture;
  report.fixture={url:'http://127.0.0.1:43111/demo-form.html'+(controls?'?opendesk-url-import=1':''),
    originalPath:'examples/tasks/demo-form.html',originalBytes:fixture.length,originalSha256:sha(fixture),
    servedBytes:controlledFixture.length,servedSha256:sha(controlledFixture),
    controls:controls?{path:controlsPath,bytes:controls.length,sha256:sha(controls)}:null,
    transport:'task-owned HTTP proxy on OS-assigned loopback port'};
  write('fixture-original.html',fixture);
  if(controls){write('fixture-controls.js',controls);write('fixture-served.html',controlledFixture);}
  proxy=http.createServer((req,res)=>{
    let url;try{url=new URL(req.url);}catch{}
    const allowed=url?.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port==='43111'&&
      (url.pathname==='/demo-form.html'||controls&&url.pathname==='/opendesk-url-import-controls.js')&&req.method==='GET';
    const row={method:req.method,url:allowed?url.href:url?url.origin+url.pathname:String(req.url).slice(0,200),
      allowed:Boolean(allowed),at:new Date().toISOString()};
    report.network.push(row);
    if(!allowed){res.writeHead(451,{'Content-Type':'text/plain'});res.end('Offline acceptance: request denied');return;}
    const script=url.pathname==='/opendesk-url-import-controls.js';
    res.writeHead(200,{'Content-Type':script?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(script?controls:controls&&url.searchParams.get('opendesk-url-import')==='1'?controlledFixture:fixture);
  });
  proxy.on('connect',(req,socket,head)=>{
    const allowed=Boolean(options['browser-source']&&allowD3Tunnel&&req.url===D3_AUTHORITY);
    const row={method:'CONNECT',authority:String(req.url).slice(0,240),allowed,
      phase:downloadPhase,at:new Date().toISOString()};
    report.network.push(row);
    if(!allowed){
      // CONNECT sockets are owned by this handler, not by Node's normal HTTP
      // request/error lifecycle. Chrome may reset its rejected tunnel before
      // the 451 write drains; observe the reset without bypassing the denial.
      socket.on('error',error=>{
        row.clientError=error.code||error.message;
        record('denied-proxy-connect-socket-error',row);
      });
      socket.end('HTTP/1.1 451 Unavailable For Legal Reasons\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    // End-to-end TLS remains between Chrome and the actual public origin.
    // Do not terminate TLS, forge certificates, replace bytes or serve pins.
    const upstream=net.connect({host:'raw.githubusercontent.com',port:443});
    sourceTunnels.add(socket);sourceTunnels.add(upstream);
    const timer=setTimeout(()=>{row.error='upstream-connect-timeout';upstream.destroy();socket.destroy();},15000);
    upstream.once('connect',()=>{
      clearTimeout(timer);row.connectedAt=new Date().toISOString();
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)upstream.write(head);
      socket.pipe(upstream);upstream.pipe(socket);
    });
    const close=()=>{clearTimeout(timer);sourceTunnels.delete(socket);sourceTunnels.delete(upstream);socket.destroy();upstream.destroy();};
    upstream.on('error',error=>{row.error=error.code||error.message;close();});
    socket.on('error',error=>{row.clientError=error.code||error.message;close();});
    upstream.once('close',close);socket.once('close',close);
  });
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
  const proxyPort=proxy.address().port;report.fixture.proxyPort=proxyPort;
  const argv=[...(options.headed?[]:['--headless=new']),'--window-size=1440,1000','--no-first-run','--no-default-browser-check',
    '--disable-gpu','--disable-background-networking','--disable-sync','--password-store=basic',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
    '--proxy-server=http://127.0.0.1:'+proxyPort,'--proxy-bypass-list=<-loopback>',
    ...(options['container-no-sandbox']?['--no-sandbox']:[]),
    ...(packageRoot?['--disable-extensions-except='+packageRoot,'--load-extension='+packageRoot]:[]),'about:blank'];
  const {launchLocalDevChrome}=await import(pathToFileURL(path.join(repo,'tests/framework/local-dev-cft-launcher.mjs')));
  launchAttempted=true;
  const launched=await launchLocalDevChrome({root:repo,out:output,binary,argv,profile});
  chrome=launched.chrome;report.launch=launched.launch;
  const base='http://127.0.0.1:'+launched.lines[0];
  report.cdpPort=Number(launched.lines[0]);
  browser=await cdp('ws://127.0.0.1:'+launched.lines[0]+launched.lines[1],'browser');
  report.browserVersion=await browser.call('Browser.getVersion');
  const newTab=async(url,label)=>{
    const created=await browser.call('Target.createTarget',{url:'about:blank'});
    const info=await until(async()=>(await(await fetch(base+'/json/list')).json()).find(x=>x.id===created.targetId),
      label+' CDP target');
    const session=await cdp(info.webSocketDebuggerUrl,label);sessions.push(session);
    await session.call('Page.enable');await session.call('Page.navigate',{url});
    await until(()=>session.read('location.href==='+JSON.stringify(url)+'&&document.readyState==="complete"'),label+' DOM loaded');
    return {id:info.id,session};
  };
  const website=await newTab(report.fixture.url,'website');
  assert.equal(await website.session.read('location.href'),report.fixture.url);
  assert.match(await website.session.read('document.title'),/OpenDesk Browser/);
  assert(report.network.some(x=>x.allowed),'Fixture received a real task-owned HTTP request');
  if(controls)await until(()=>website.session.read('!!document.querySelector("#url-import-add-heading")'),'Static website test controls loaded');
  report.tests.push({name:'real-cft-and-original-http-fixture',status:'PASS',fixture:report.fixture});
  if(!packageRoot){report.status='CHROME_ONLY_PROBE_PASS';return;}
  const extensionId=await until(async()=>{
    const list=await(await fetch(base+'/json/list')).json();
    return list.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(x.url))?.url.split('/')[2];
  },'Actual loaded extension Service Worker');
  report.extensionId=extensionId;
  if(options['browser-source']){
    const target=await until(async()=>{
      const list=await(await fetch(base+'/json/list')).json();
      return list.find(x=>x.type==='service_worker'&&x.url==='chrome-extension://'+extensionId+'/sw.js');
    },'Real dependency Service Worker network observation target');
    sourceNetworkSession=await cdp(target.webSocketDebuggerUrl,'dependency-network');sessions.push(sourceNetworkSession);
    await sourceNetworkSession.call('Network.enable');
    sourceNetworkSession.on('Network.requestWillBeSent',event=>{
      if(event.request.url.startsWith('https://raw.githubusercontent.com/')){
        const row={requestId:event.requestId,url:event.request.url,method:event.request.method,
          phase:downloadPhase,at:new Date().toISOString()};
        sourceRequests.push(row);record('browser-source-https-request',row);
      }
    });
    sourceNetworkSession.on('Network.responseReceived',event=>{
      if(event.response.url.startsWith('https://raw.githubusercontent.com/'))
        sourceResponses.push({requestId:event.requestId,url:event.response.url,status:event.response.status,
          mimeType:event.response.mimeType,fromDiskCache:event.response.fromDiskCache,
          fromServiceWorker:event.response.fromServiceWorker,at:new Date().toISOString()});
    });
    sourceNetworkSession.on('Network.loadingFailed',event=>{
      if(sourceRequests.some(row=>row.requestId===event.requestId))
        record('browser-source-https-failed',{requestId:event.requestId,errorText:event.errorText,
          blockedReason:event.blockedReason,canceled:event.canceled});
    });
    report.browserSourceNetwork={requests:sourceRequests,responses:sourceResponses,
      transport:'raw CONNECT to real raw.githubusercontent.com:443, browser-verified end-to-end HTTPS'};
  }
  const catalog=await newTab('chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+crypto.randomUUID(),'catalog');
  await until(()=>catalog.session.read('!!document.querySelector("#catalog-open-dev-sidebar")'),'Original catalog UI');
  report.tests.push({name:'actual-verified-extension-package-loaded',status:'PASS',
    extensionId,packageHash:report.packageHash});
  if(options.probe){await screenshot(catalog.session,'extension-probe.png');report.status='EXTENSION_PROBE_PASS';return;}

  assert(options.draft,'A built frozen --draft is required');
  const draftBytes=fs.readFileSync(path.resolve(options.draft));
  const {validateProgramDraft}=await import(pathToFileURL(path.join(repo,'src/ui/program-source.js')));
  const draft=await validateProgramDraft(JSON.parse(draftBytes));
  assert(['opendesk.program-draft.v1','opendesk.program-draft.v2'].includes(draft.format));
  assert.equal(draft.runtimeKind,'page-userscript');
  assert.equal(draft.project.entryMode,'component');
  assert.equal(sha(draft.sourceUtf8),draft.build.sourceHash);
  assert.equal(Buffer.byteLength(draft.sourceUtf8),draft.build.byteLength);
  const draftFile=path.join(output,'program.opendesk-draft.json');fs.writeFileSync(draftFile,draftBytes);
  report.program={format:draft.format,project:draft.project,sourceHash:draft.build.sourceHash,sourceBytes:draft.build.byteLength,
    jsonBytes:draftBytes.length,jsonSha256:sha(draftBytes),authoring:draft.authoring.files.map(f=>({path:f.path,sha256:f.sha256}))};
  if(draft.format==='opendesk.program-draft.v2'){
    const {validatePageSource}=await import(pathToFileURL(path.join(repo,'src/scripting/user-scripts/page-bundle.js')));
    const bundle=await validatePageSource(draft.sourceUtf8);
    report.program.linkedResource=bundle.descriptor;
    write('remote-lock.json',draft.authoring.remoteLock);
  }
  const artifactPath=path.resolve(options.artifact||path.join(path.dirname(path.resolve(options.draft)),'artifact.json'));
  if(fs.existsSync(artifactPath)){
    const bytes=fs.readFileSync(artifactPath),artifact=JSON.parse(bytes);
    assert.equal(artifact.format,'opendesk.build-artifact.v1');
    assert.equal(artifact.sourceHash,draft.build.sourceHash);
    assert.equal(artifact.sourceBytes,draft.build.byteLength);
    assert.deepEqual(artifact.sourceModules.map(f=>({path:f.path,sha256:f.sha256})),report.program.authoring);
    report.program.buildArtifactSha256=sha(bytes);
    report.program.remoteModules=artifact.remoteModules;
    if(report.program.linkedResource){
      const graph=report.program.linkedResource.dependencies;
      assert.equal(artifact.remoteModules.length,graph.moduleCount);
      assert.equal(artifact.remoteModules.reduce((total,row)=>total+row.bytes,0),graph.sourceBytes);
      for(const row of artifact.remoteModules)
        assert.equal(draft.authoring.remoteLock.modules[row.url]?.sha256,row.sha256,'Artifact matches the reviewed remote graph');
    }
    write('build-artifact.json',artifact);
  }else throw Error('Use the original builder artifact.json to bind source and dependency graph evidence');
  const host='document.querySelector('+JSON.stringify('[data-od-id="'+draft.project.id+'"]')+')';
  const settings=await newTab('chrome://extensions/?id='+extensionId,'extension-settings');
  const toggle='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")'+
    '?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
  await until(()=>settings.session.read('!!('+toggle+')'),'Original Chrome userScripts control');
  await browser.call('Target.activateTarget',{targetId:settings.id});
  if(!await settings.session.read('('+toggle+').checked'))await clickReal(settings.session,toggle);
  await until(()=>settings.session.read('('+toggle+').checked===true'),'Trusted userScripts opt-in');
  report.tests.push({name:'real-Chrome-userScripts-permission-toggle',status:'PASS'});
  await browser.call('Target.activateTarget',{targetId:catalog.id});
  await clickReal(catalog.session,'document.querySelector("#catalog-open-dev-sidebar")');
  await until(()=>catalog.session.read('document.querySelector("#catalog-dev-sidebar-status").textContent.includes("已打开侧栏")'),
    'Original Sidebar open acknowledgement');
  const panelInfo=await until(async()=>{
    const list=await(await fetch(base+'/json/list')).json();
    return list.find(t=>t.url?.startsWith('chrome-extension://'+extensionId+'/ui/tool.html')&&t.id!==catalog.id&&t.webSocketDebuggerUrl);
  },'Real Side Panel target');
  const sidebar=await cdp(panelInfo.webSocketDebuggerUrl,'sidebar');sessions.push(sidebar);
  await sidebar.call('Page.enable');
  // The manifest opens bare tool.html once; its original bootstrap then commits
  // a new canonical hostInstanceId document. Do not click the first HTML's tabs
  // before that navigation and the existing workbench listeners are complete.
  const panelReady=await until(()=>sidebar.read('(async()=>{const href=location.href,url=new URL(href);'+
    'const tab=document.querySelector("#tab-develop"),r=tab?.getBoundingClientRect();'+
    'const selected=document.documentElement.dataset.opendeskTab;'+
    'if(document.readyState!=="complete"||!url.searchParams.get("hostInstanceId")||'+
    '!selected||!r||r.width<=0||r.height<=0||document.querySelector("#tab-cloud")?.hidden!==false)return null;'+
    'const contexts=await chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"],documentUrls:[href]});'+
    'const context=contexts.find(x=>x.contextType==="SIDE_PANEL"&&x.documentUrl===href);'+
    'return context&&location.href===href?{context,href,selected,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}:null})()'),
    'Canonical initialized actual Side Panel document');
  const {toolDocumentIdentity}=await import(pathToFileURL(path.join(repo,'src/tool-document-url.js')));
  const panelIdentity=toolDocumentIdentity('chrome-extension://'+extensionId+'/ui/tool.html',panelReady.href);
  assert(panelIdentity?.hostInstanceId&&!panelIdentity.hasLocator,'Original canonical Sidebar sender identity');
  report.sidePanelContext=panelReady.context;report.sidePanelReady=panelReady;
  record('canonical-sidebar-ready',panelReady);
  await browser.call('Target.activateTarget',{targetId:website.id});
  const activePanel=await sidebar.read('(async()=>{const contexts=await chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"],documentUrls:[location.href]});'+
    'return {url:location.href,context:contexts.find(x=>x.documentUrl===location.href)}})()');
  assert.equal(activePanel.url,panelReady.href,'Sidebar remains on its initialized host after website activation');
  assert.equal(activePanel.context?.documentId,panelReady.context.documentId,'The same original Sidebar document receives the input');
  await clickReal(sidebar,'document.querySelector("#tab-develop")');
  await until(()=>sidebar.read('document.querySelector("#tab-develop").getAttribute("aria-selected")==="true"'),'Developer tab selected');
  assert.equal(await sidebar.read('chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})'),true,
    'Original installation must provide website permission; no bypass');
  assert.equal(await sidebar.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),false,
    'This fresh profile has no Native Messaging permission');
  report.nativeEvidence={nativeMessagingPermission:false,hostInstalledByDriver:false,
    localProjectEntryUsed:false,observedAt:'before-JSON-import'};
  assert.equal(await website.session.read('!!('+host+')'),false,'No component before import');

  await browser.call('Target.activateTarget',{targetId:catalog.id});
  await fileInput(catalog.session,'task-package-file',draftFile);
  await until(()=>catalog.session.read('document.querySelector("#task-catalog-status").textContent.includes("已导入同窗口")'),
    'Original catalog-to-Sidebar frozen JSON handoff');
  await until(()=>sidebar.read('document.querySelector("#program-source-info").textContent.includes('+JSON.stringify(draft.build.sourceHash)+')'),
    'Exact frozen program hash displayed');
  assert.equal(sha(await sidebar.read('document.querySelector("#script-source").value')),draft.build.sourceHash);
  const authorIndex=await sidebar.read('Array.from(document.querySelector("#program-source-files").options).findIndex(o=>o.value==='+
    JSON.stringify(draft.project.entry)+')');
  await selectIndex(sidebar,'#program-source-files',authorIndex);
  const authorSource=await sidebar.read('document.querySelector("#script-source").value');
  assert.match(authorSource,/\bfrom\s*['"]https:\/\//,'Top-level HTTPS URL is visible in authoring snapshot');
  for(const url of [
    'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/core.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/chart/bar/install.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/component/grid/install.js',
    'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/renderer/installSVGRenderer.js'
  ])assert(authorSource.includes(url),'Actual fixed ESM import is visible: '+url);
  assert.equal(await sidebar.read('document.querySelector("#script-source").readOnly'),true);
  await selectIndex(sidebar,'#program-source-files',0);
  await pause(250);
  assert.equal(await website.session.read('!!('+host+')'),false,'JSON import and source inspection never execute');
  report.tests.push({name:'frozen-JSON-import-original-UI-no-auto-run',status:'PASS',
    sourceHash:draft.build.sourceHash,packageHash:report.packageHash});

  await browser.call('Target.activateTarget',{targetId:website.id});
  await until(()=>sidebar.read('document.querySelector("#script-current-page-url").textContent==='+
    JSON.stringify(report.fixture.url)),'Original current-document identity');
  await details(sidebar,'page-preview-tools');
  await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),'Original explicit Run enabled');
  await clickReal(sidebar,'document.querySelector("#page-preview-run")');
  const result=await until(()=>sidebar.read('(()=>{const n=document.querySelector("#page-preview-status");return ["completed","error"].includes(n?.dataset.state)?'+
    '{state:n.dataset.state,text:n.textContent}:null})()'),'Real USER_SCRIPT execution receipt',30000);
  assert.equal(result.state,'completed',result.text);
  const receipt=JSON.parse(await sidebar.read('document.querySelector("#page-preview-technical").textContent'));
  write('preview-receipt.json',receipt);
  assert.equal(receipt.sourceHash,draft.build.sourceHash);
  assert.equal(receipt.world,'USER_SCRIPT');
  const {PAGE_FRAMEWORK_RUNTIMES}=await import(pathToFileURL(path.join(repo,'src/libs/page-frameworks/contract.js')));
  assert.equal(receipt.packagedFrameworkId,'react');
  assert.equal(receipt.packagedFrameworkSha256,PAGE_FRAMEWORK_RUNTIMES.react.sha256,'One original fixed React runtime');
  assert.equal(receipt.managedUI,true,'Frozen component JSON must retain managed Run/Stop ownership');
  assert(receipt.managedPreviewId,'Real original preview identity');
  assert(receipt.documentId,'Real Chrome document identity');
  await until(()=>website.session.read('(()=>{const n=('+host+');const r=n?.getBoundingClientRect();'+
    'return !!(n?.shadowRoot&&r?.width>0&&r.height>0)})()'),'Visible mounted React component');
  const nativeFrame=await sidebar.read('chrome.webNavigation.getFrame({documentId:'+JSON.stringify(receipt.documentId)+'})');
  assert.equal(nativeFrame.documentId,receipt.documentId);
  assert.equal(nativeFrame.url,report.fixture.url);
  report.preview={previewId:receipt.managedPreviewId,documentId:receipt.documentId,
    sourceHash:receipt.sourceHash,frameworkSha256:receipt.packagedFrameworkSha256,world:receipt.world};

  const statsButton='('+host+').shadowRoot.querySelector('+JSON.stringify('[aria-label="统计视图"]')+')';
  await clickReal(website.session,statsButton);
  const baselineCounts=await websiteHeadingCounts(website.session);
  const initialChart=await until(async()=>{
    const value=await chartSnapshot(website.session,host);
    return value?.state==='ready'?value:null;
  },'Actual ECharts SVG drawing completed');
  assertChart(initialChart,baselineCounts);
  const initialChartHandle=await nodeHandle(website.session,chartExpression(host));
  const initialSVGHandle=await nodeHandle(website.session,chartExpression(host)+'?.querySelector("svg")');
  report.statistics=initialChart;
  write('echarts-initial.json',initialChart);
  await screenshot(website.session,'echarts-initial.png');
  report.tests.push({name:'real-frozen-React-ECharts-URL-import-SVG-render',status:'PASS',
    ...report.preview,instanceId:initialChart.instanceId,svgBackendNodeId:initialSVGHandle.backendNodeId,
    headingCounts:baselineCounts,geometrySha256:initialChart.geometrySha256});

  // The website, through its own static script and a trusted button click,
  // changes real headings. The imported React/ECharts component observes them.
  await clickReal(website.session,'document.querySelector("#url-import-add-heading")');
  const increased=[...baselineCounts];increased[2]++;
  const updatedChart=await until(async()=>{
    const value=await chartSnapshot(website.session,host);
    return value?.state==='ready'&&value.counts[2]?.count===increased[2]&&
      value.geometrySha256!==initialChart.geometrySha256?value:null;
  },'A real heading change updates ECharts bar paths');
  assert.deepEqual(await websiteHeadingCounts(website.session),increased);
  assertChart(updatedChart,increased);
  assert.equal(updatedChart.instanceId,initialChart.instanceId,'setOption keeps the initialized chart');
  const updatedSVGHandle=await nodeHandle(website.session,chartExpression(host)+'?.querySelector("svg")');
  assert.equal(updatedSVGHandle.backendNodeId,initialSVGHandle.backendNodeId,'Existing SVG updates without remount');
  await releaseHandle(website.session,updatedSVGHandle);
  write('echarts-data-updated.json',updatedChart);
  await screenshot(website.session,'echarts-data-updated.png');
  await clickReal(website.session,'document.querySelector("#url-import-remove-heading")');
  const revertedChart=await until(async()=>{
    const value=await chartSnapshot(website.session,host);
    return value?.state==='ready'&&value.counts[2]?.count===baselineCounts[2]&&
      value.geometrySha256===initialChart.geometrySha256?value:null;
  },'Removing the heading restores original ECharts paths');
  assertChart(revertedChart,baselineCounts);
  assert.equal(revertedChart.instanceId,initialChart.instanceId);
  report.tests.push({name:'real-website-heading-data-updates-existing-ECharts-SVG',status:'PASS',
    ...report.preview,instanceId:initialChart.instanceId,before:baselineCounts,after:increased,
    beforeGeometry:initialChart.geometrySha256,afterGeometry:updatedChart.geometrySha256,
    restoredGeometry:revertedChart.geometrySha256,svgBackendNodeId:initialSVGHandle.backendNodeId});

  const nativeWindow=await browser.call('Browser.getWindowForTarget',{targetId:website.id});
  const originalBounds=await browser.call('Browser.getWindowBounds',{windowId:nativeWindow.windowId});
  const getZoom=()=>sidebar.read('chrome.tabs.getZoom('+receipt.tabId+')');
  const originalZoom=await getZoom();
  assert.equal(originalZoom,1,'This fresh Chrome profile starts at its original 100% zoom');
  const resizeEvidence={before:{bounds:originalBounds,zoom:originalZoom,chart:initialChart},
    requestedBounds:{width:640,height:1000},attempts:[]};
  let resizedChart,resizedBounds,resizedZoom;
  write('echarts-resize-observations.json',resizeEvidence);
  try{
    await browser.call('Target.activateTarget',{targetId:website.id});
    await browser.call('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:resizeEvidence.requestedBounds});
    await pause(200);
    const observe=async input=>{
      const value={input,bounds:await browser.call('Browser.getWindowBounds',{windowId:nativeWindow.windowId}),
        zoom:await getZoom(),chart:await chartSnapshot(website.session,host)};
      resizeEvidence.attempts.push(value);write('echarts-resize-observations.json',resizeEvidence);
      record('actual-browser-resize-observation',{bounds:value.bounds,zoom:value.zoom,
        viewport:value.chart?.viewport,container:value.chart?.container,svg:value.chart?.svg});
      return value;
    };
    let actual=await observe({operation:'Browser.setWindowBounds',requested:resizeEvidence.requestedBounds});
    // Chrome's native minimum window leaves a 402px website viewport with
    // Sidebar open, above the card's 332px breakpoint. That correctly keeps
    // its 300px card unchanged. Use Chrome's real tab zoom API until
    // the actual container changes; never assign CSS or emulate a viewport.
    for(let step=0;step<3&&Math.abs((actual.chart?.container.width??0)-initialChart.container.width)<=5;step++){
      const beforeZoom=actual.zoom,beforeWidth=actual.chart.viewport.width;
      const input=await setNativeTabZoom(sidebar,receipt.tabId,1.25+0.25*step);
      await until(async()=>await getZoom()>beforeZoom,'Native Chrome Zoom In changes the actual tab zoom',5000);
      await until(async()=>{
        const value=await chartSnapshot(website.session,host);
        return value?.viewport.width<beforeWidth;
      },'The real website layout follows the native zoom change',5000);
      actual=await observe(input);
    }
    assert(actual.chart&&Math.abs(actual.chart.container.width-initialChart.container.width)>5,
      'Resize assertion requires a real change in the existing container width');
    resizedChart=await until(async()=>{
      const value=await chartSnapshot(website.session,host);
      return value?.state==='ready'&&Math.abs(value.svg.width-initialChart.svg.width)>5&&
        Math.abs(value.svg.width-value.container.width)<2?value:null;
    },'Actual container resize updates the existing ECharts SVG width');
    resizedBounds=await browser.call('Browser.getWindowBounds',{windowId:nativeWindow.windowId});
    resizedZoom=await getZoom();
    assertChart(resizedChart,baselineCounts);
    assert.equal(resizedChart.instanceId,initialChart.instanceId,'Resize preserves the original ECharts instance');
    const resizedSVGHandle=await nodeHandle(website.session,chartExpression(host)+'?.querySelector("svg")');
    assert.equal(resizedSVGHandle.backendNodeId,initialSVGHandle.backendNodeId);
    await releaseHandle(website.session,resizedSVGHandle);
    write('echarts-resized.json',{...resizeEvidence,after:{bounds:resizedBounds,zoom:resizedZoom,chart:resizedChart}});
    await screenshot(website.session,'echarts-resized.png');
  }finally{
    if(await getZoom()!==originalZoom){
      await browser.call('Target.activateTarget',{targetId:website.id});
      await setNativeTabZoom(sidebar,receipt.tabId,originalZoom);
      await until(async()=>await getZoom()===originalZoom,'Original native Chrome zoom restored',5000);
    }
    await browser.call('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:{
      width:originalBounds.bounds.width,height:originalBounds.bounds.height}});
    const restored=await until(async()=>{
      const value=await chartSnapshot(website.session,host),bounds=await browser.call('Browser.getWindowBounds',{windowId:nativeWindow.windowId});
      return value?.state==='ready'&&Math.abs(value.svg.width-initialChart.svg.width)<2&&
        value.viewport.width===initialChart.viewport.width&&bounds.bounds.width===originalBounds.bounds.width&&
        bounds.bounds.height===originalBounds.bounds.height?value:null;
    },'Original native window and chart size restored');
    resizeEvidence.restored={bounds:await browser.call('Browser.getWindowBounds',{windowId:nativeWindow.windowId}),
      zoom:await getZoom(),chart:restored};
    write('echarts-resize-observations.json',resizeEvidence);
  }
  report.tests.push({name:'real-Chrome-window-and-tab-zoom-resize-existing-ECharts-SVG',status:'PASS',
    ...report.preview,instanceId:initialChart.instanceId,
    windowBefore:originalBounds,windowAfter:resizedBounds,zoomBefore:originalZoom,zoomAfter:resizedZoom,
    containerBefore:initialChart.container,containerAfter:resizedChart.container,
    svgBefore:initialChart.svg,svgAfter:resizedChart.svg,
    viewportBefore:initialChart.viewport,viewportAfter:resizedChart.viewport});

  await clickReal(website.session,'('+host+').shadowRoot.querySelector('+JSON.stringify('[aria-label="全部视图"]')+')');
  const hiddenDisposal=await until(async()=>{
    const value=await readChartDisposal(website.session,initialChartHandle);
    return !value.connected&&!value.instanceId&&value.svgCount===0?value:null;
  },'Changing the actual React view disposes ECharts');
  await releaseHandle(website.session,initialChartHandle);
  await releaseHandle(website.session,initialSVGHandle);
  report.tests.push({name:'real-React-effect-view-cleanup-clears-ECharts-instance-and-SVG',status:'PASS',
    ...report.preview,instanceId:initialChart.instanceId,observed: hiddenDisposal});
  const nav='('+host+').shadowRoot.querySelectorAll("nav button")';
  await until(()=>website.session.read(nav+'.length>1'),'All real chapter links visible');
  const last='Array.from('+nav+').at(-1)';
  const label=await website.session.read('('+last+').textContent');
  const before=await website.session.read('scrollY');
  await clickReal(website.session,last);
  const jumped=await until(()=>website.session.read('(()=>{const e=Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))'+
    '.find(n=>n.textContent.replace(/\\s+/g," ").trim().slice(0,160)==='+JSON.stringify(label)+');'+
    'const r=e?.getBoundingClientRect();return r&&r.top>=-2&&r.top<innerHeight&&scrollY>'+before+
    '?{top:r.top,scrollY,label:e.textContent}:null})()'),'Trusted chapter jump changed actual page scroll');
  report.chapterJump=jumped;await screenshot(website.session,'toc-chapter-jump.png');
  report.tests.push({name:'real-TOC-chapter-jump-retained',status:'PASS',...report.preview,...jumped});

  // Stop while the chart is mounted, after separately observing the effect
  // cleanup on a mode change. Keep only read-only DOM handles for evidence.
  await clickReal(website.session,statsButton);
  const stopChart=await until(async()=>{
    const value=await chartSnapshot(website.session,host);
    return value?.state==='ready'?value:null;
  },'Statistics remounts a fresh actual ECharts chart');
  assertChart(stopChart,baselineCounts);
  assert.notEqual(stopChart.instanceId,initialChart.instanceId,'A disposed ECharts instance is not reused');
  const stopChartHandle=await nodeHandle(website.session,chartExpression(host));

  // Saving the candidate is a separate explicit action and must not replay.
  if(options.install){
    await until(()=>sidebar.read('!document.querySelector("#page-candidate-save").disabled'),'Candidate save enabled');
    await clickReal(sidebar,'document.querySelector("#page-candidate-save")');
    await until(()=>sidebar.read('document.querySelector("#page-candidate-status").dataset.state==="saved"'),'Frozen Page candidate saved');
    const afterSave=await chartSnapshot(website.session,host);
    assert.equal(afterSave.instanceId,stopChart.instanceId,'Saving never replays or replaces the running chart');
    const afterSaveHandle=await nodeHandle(website.session,chartExpression(host));
    assert.equal(afterSaveHandle.backendNodeId,stopChartHandle.backendNodeId);
    await releaseHandle(website.session,afterSaveHandle);
    const programId=await sidebar.read('document.querySelector("#script-id").value.trim()');
    const savedRows=await readInstalled(sidebar,programId);
    assert(savedRows.some(row=>row.tag==='page-candidate-v1'&&row.stage==='Candidate'&&
      row.manifest?.sourceHash===draft.build.sourceHash),'Saved exact frozen candidate identity');
    assert(!savedRows.some(row=>row.tag==='page-installed-v1'),'Save never installs a program');
    write('saved-candidate.json',{programId,status:await sidebar.read('document.querySelector("#page-candidate-status").textContent'),rows:savedRows});
    report.tests.push({name:'real-Save-preserves-frozen-source-and-running-chart-without-install',status:'PASS',
      ...report.preview,programId,instanceId:stopChart.instanceId});
  }
  await until(()=>sidebar.read('!document.querySelector("#script-stop").disabled'),'Original managed Stop enabled');
  await clickReal(sidebar,'document.querySelector("#script-stop")');
  await until(()=>website.session.read('!('+host+')'),'Managed React root actually removed');
  const stop=await until(()=>sidebar.read('(()=>{try{const r=JSON.parse(document.querySelector("#page-preview-technical").textContent);'+
    'return r.stop?.receipt?.ok===true?r:null}catch{return null}})()'),'Original managed Stop acknowledgement');
  write('stop-receipt.txt',await sidebar.read('document.querySelector("#page-preview-technical").textContent'));
  assert.equal(stop.stop.state,'preview-retired');
  assert.equal(stop.stop.previewId,receipt.managedPreviewId);
  assert.equal(stop.stop.sourceHash,draft.build.sourceHash);
  assert.equal(stop.stop?.receipt?.ok,true,'Original managed cleanup receipt');
  assert.equal(stop.stop?.receipt?.scope,'managed-ui-only');
  const stoppedDisposal=await until(async()=>{
    const value=await readChartDisposal(website.session,stopChartHandle);
    return !value.connected&&!value.instanceId&&value.svgCount===0?value:null;
  },'Stop clears the real ECharts marker and SVG from the retained chart node');
  await releaseHandle(website.session,stopChartHandle);
  // Trigger another real website mutation after Stop. A late scan or delayed
  // result must not recreate the removed component.
  await clickReal(website.session,'document.querySelector("#url-import-add-heading")');
  await until(()=>website.session.read('document.querySelector("#url-import-dynamic-headings").childElementCount===1'),
    'Real website remains usable after Stop');
  await pause(350);
  assert.equal(await website.session.read('!!('+host+')'),false,'No late remount after Stop');
  await screenshot(website.session,'component-stopped.png');
  await clickReal(website.session,'document.querySelector("#url-import-remove-heading")');
  report.tests.push({name:'real-managed-Stop-disposes-ECharts-and-root-no-late-remount',status:'PASS',
    ...report.preview,stop:stop.stop,instanceId:stopChart.instanceId,disposal:stoppedDisposal});

  if(options.install){
    await until(()=>sidebar.read('!document.querySelector("#page-program-verify").disabled'),'Frozen version verification enabled');
    await clickReal(sidebar,'document.querySelector("#page-program-verify")');
    await until(()=>sidebar.read('!document.querySelector("#page-program-install").disabled'),'Frozen version verified');
    const programId=await sidebar.read('(()=>{const s=document.querySelector("#page-program-list").value;return s.slice(0,s.lastIndexOf(":"))})()');
    const beforeInstall=await readInstalled(sidebar,programId);
    const verified=beforeInstall.find(r=>r.tag==='page-verification-v1'&&r.sourceHash===draft.build.sourceHash);
    assert(verified,'Original verification receipt is bound to the frozen JSON source');
    assert.equal(verified.receipt.sourceHash,draft.build.sourceHash);
    assert.equal(verified.receipt.documentId,receipt.documentId);
    assert.equal(verified.receipt.world,'USER_SCRIPT');
    assert.equal(verified.receipt.packagedFrameworkSha256,receipt.packagedFrameworkSha256);
    await until(()=>website.session.read('!!('+host+')?.shadowRoot'),'Explicit Verify executes the frozen candidate');
    const verifiedRoot=await nodeHandle(website.session,host);
    assert(!beforeInstall.some(row=>row.tag==='page-installed-v1'),'Verify never installs');
    write('verification.json',verified);
    await clickReal(sidebar,'document.querySelector("#page-program-install")');
    const installed=await until(async()=>{
      const rows=await readInstalled(sidebar,programId);
      return rows.find(r=>r.tag==='page-installed-v1'&&r.nativeState==='registered')?rows:null;
    },'Actual Page installation registered');
    write('installation.json',installed);report.installation=installed;
    assert(!installed.some(row=>row.tag==='page-execution-v1'&&row.documentId===receipt.documentId),
      'Install never replays the current document');
    const afterInstallRoot=await nodeHandle(website.session,host);
    assert.equal(afterInstallRoot.backendNodeId,verifiedRoot.backendNodeId,'Installation keeps the current verified DOM unchanged');
    await releaseHandle(website.session,verifiedRoot);
    await releaseHandle(website.session,afterInstallRoot);
    report.tests.push({name:'real-Verify-and-explicit-Install-preserve-frozen-identity-no-current-page-replay',
      status:'PASS',sourceHash:draft.build.sourceHash,programId,
      manifestHash:verified.manifestHash,verification:verified.receipt});
    const nextURL=new URL(report.fixture.url);nextURL.searchParams.set('url-import-installed','1');
    const next=nextURL.href;
    await website.session.call('Page.navigate',{url:next});
    await until(()=>website.session.read('location.href==='+JSON.stringify(next)+'&&document.readyState==="complete"'),'Fresh installed document');
    await until(()=>website.session.read('!!('+host+')?.shadowRoot'),'Installed frozen component on new document');
    await until(()=>sidebar.read('!document.querySelector("#page-program-refresh").disabled'),'Original library refresh is ready after installation');
    await clickReal(sidebar,'document.querySelector("#page-program-refresh")');
    const executed=await until(async()=>{
      const rows=await readInstalled(sidebar,programId);
      return rows.find(r=>r.tag==='page-execution-v1'&&r.sourceHash===draft.build.sourceHash&&r.documentId!==receipt.documentId&&r.state==='completed')?rows:null;
    },'Installed original execution receipt');
    write('installed-execution.json',executed);
    const execution=executed.find(r=>r.tag==='page-execution-v1'&&r.sourceHash===draft.build.sourceHash&&
      r.documentId!==receipt.documentId&&r.state==='completed');
    assert.equal(execution.result.sourceHash,draft.build.sourceHash);
    assert.equal(execution.result.documentId,execution.documentId);
    assert.equal(execution.result.world,'USER_SCRIPT');
    assert.equal(execution.result.packagedFrameworkSha256,receipt.packagedFrameworkSha256);
    const installedFrame=await sidebar.read('chrome.webNavigation.getFrame({documentId:'+JSON.stringify(execution.documentId)+'})');
    assert.equal(installedFrame.url,next);
    await clickReal(website.session,statsButton);
    const installedChart=await until(async()=>{
      const value=await chartSnapshot(website.session,host);
      return value?.state==='ready'?value:null;
    },'The installed JSON actually draws ECharts in its new document');
    assertChart(installedChart,await websiteHeadingCounts(website.session));
    write('installed-echarts.json',installedChart);
    report.tests.push({name:'frozen-JSON-verified-installed-offline-new-document',status:'PASS',
      sourceHash:draft.build.sourceHash,programId,documentId:execution.documentId,
      receiptId:execution.receiptId,receiptNonce:execution.receiptNonce,
      instanceId:installedChart.instanceId,geometrySha256:installedChart.geometrySha256,rows:executed});
    await screenshot(website.session,'installed-new-document-echarts.png');

    // Use the existing product's stop-future-runs control and navigate. It
    // explicitly does not roll back an installed script's existing effects.
    await until(()=>sidebar.read('!document.querySelector("#page-program-toggle").disabled'),'Installed program can be disabled');
    await clickReal(sidebar,'document.querySelector("#page-program-toggle")');
    const disabled=await until(async()=>{
      const rows=await readInstalled(sidebar,programId);
      return rows.find(r=>r.tag==='page-installed-v1'&&r.enabled===false&&r.nativeState==='disabled')?rows:null;
    },'Original installation is disabled');
    const disabledURL=new URL(report.fixture.url);disabledURL.searchParams.set('url-import-disabled','1');
    await website.session.call('Page.navigate',{url:disabledURL.href});
    await until(()=>website.session.read('location.href==='+JSON.stringify(disabledURL.href)+
      '&&document.readyState==="complete"'),'New document after disabling installation');
    await pause(500);
    const disabledFrame=await sidebar.read('chrome.webNavigation.getFrame({tabId:'+receipt.tabId+',frameId:0})');
    assert(disabledFrame.documentId&&disabledFrame.documentId!==execution.documentId);
    assert.equal(await website.session.read('!!('+host+')'),false,'Disabled program does not remount after navigation');
    const afterDisable=await readInstalled(sidebar,programId);
    assert(!afterDisable.some(row=>row.tag==='page-execution-v1'&&row.documentId===disabledFrame.documentId),
      'Disabled navigation has no new execution receipt');
    assert.deepEqual(afterDisable.find(row=>row.receiptId===execution.receiptId),execution,
      'Original installed execution receipt is retained unchanged');
    write('disabled-installation.json',{disabled,afterDisable,document:disabledFrame});
    await screenshot(website.session,'disabled-new-document.png');
    report.tests.push({name:'real-disable-auto-run-and-navigation-cleanup-preserve-original-receipt',status:'PASS',
      sourceHash:draft.build.sourceHash,programId,previousDocumentId:execution.documentId,
      newDocumentId:disabledFrame.documentId,originalReceiptId:execution.receiptId});
  }
  const moduleAttempts=report.network.filter(row=>/raw\.githubusercontent\.com|cdn\.jsdelivr\.net|esm\.sh/.test(row.url||row.authority||''));
  assert.deepEqual(moduleAttempts,[],'Frozen execution must not attempt CDN dependency downloads');
  assert.equal(await sidebar.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),false,
    'JSON Run/Stop/installation never required or granted Native Messaging');
  report.nativeEvidence.verifiedAfterCompletion=true;
  report.tests.push({name:'frozen-URL-dependency-no-CDN-runtime-requests',status:'PASS',
    requestsObserved:report.network.length,remoteModuleCount:report.program.remoteModules.length,
    linkedResource:report.program.linkedResource??null});
  report.status=options.install?'PASS_REAL_LINUX_JSON_RUN_STOP_INSTALL':'PASS_REAL_LINUX_JSON_RUN_STOP';
  if(options['browser-source']){
    await runBrowserSourceScenario({sidebar,website,browser,frameworkSha256:receipt.packagedFrameworkSha256});
    report.status+='_BROWSER_SOURCE';
    report.limits=report.limits.filter(line=>!line.includes('browser source editor new-origin preparation flow'));
    report.limits.push('Browser source preparation is tested only for this single fixed 502-byte D3 module, not arbitrary URL graphs.');
  }
}
try{await main();}
catch(error){
  report.status=error.code==='E_CFT_ENV_UNIX_SOCKET'?'BLOCKED_ENVIRONMENT':'FAIL';
  report.error={message:error.message,stack:error.stack,code:error.code??null};process.exitCode=1;
  record('failure',report.error);
  for(let i=0;i<sessions.length;i++){
    try{await screenshot(sessions[i],'failure-'+i+'-'+sessions[i].label+'.png');}catch{}
    try{write('failure-'+i+'-'+sessions[i].label+'.json',await sessions[i].read('({url:location.href,title:document.title,text:document.body?.innerText})'));}catch{}
  }
}finally{
  closeD3Tunnels();
  try{await browser?.call('Browser.close');}catch{}
  for(const session of sessions)session.close();browser?.close();
  let forced=false;
  if(chrome){
    const end=Date.now()+5000;
    while(chrome.exitCode===null&&chrome.signalCode===null&&Date.now()<end)await pause(100);
    if(chrome.exitCode===null&&chrome.signalCode===null){
      forced=true;chrome.kill('SIGTERM');
      const deadline=Date.now()+5000;
      while(chrome.exitCode===null&&chrome.signalCode===null&&Date.now()<deadline)await pause(100);
    }
    report.cleanup={pid:chrome.pid,exitCode:chrome.exitCode,signalCode:chrome.signalCode,forced};
    if(chrome.exitCode===null&&chrome.signalCode===null){
      report.cleanup.needsManualReview=true;
      report.cleanup.reason='Owned CFT child still running; profile retained.';
      report.status='FAIL_CLEANUP';process.exitCode=1;
    }
  }
  if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
  if(launchAttempted&&!chrome){
    report.cleanup={...report.cleanup,needsManualReview:true,
      reason:'Existing launcher failed before returning a child handle; preserve profile rather than assume the child exited.'};
  }
  if((!launchAttempted||chrome)&&!report.cleanup?.needsManualReview&&fs.existsSync(profile)){
    const now=fs.lstatSync(profile);
    assert(now.isDirectory()&&now.dev===profileIdentity.dev&&now.ino===profileIdentity.ino,'Do not remove changed profile');
    fs.rmSync(profile,{recursive:true});
  }
  report.cleanup={...report.cleanup,profileRemoved:!fs.existsSync(profile)};
  if(packageRoot&&packageFingerprint){
    const after=await packageFingerprint(packageRoot);
    assert.equal(after.packageHash,report.packageHash,'Loaded package never changed during acceptance');
  }
  if(forced&&report.status.includes('PASS')){report.status='FAIL_CLEANUP';process.exitCode=1;}
  report.finishedAt=new Date().toISOString();
  write('acceptance.json',report);
  console.log('URL_IMPORT_CFT '+JSON.stringify({status:report.status,output,sourceHead:report.sourceHead,
    sourceHash:report.program?.sourceHash,packageHash:report.packageHash,preview:report.preview,
    tests:report.tests.map(x=>({name:x.name,status:x.status})),error:report.error,cleanup:report.cleanup}));
}
