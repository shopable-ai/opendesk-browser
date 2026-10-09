// Real Chrome for Testing + real installed Native Host + real stdio MCP.
// CDP is test observation and trusted pointer input only, never the program executor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {setup,cleanup,doctor} from '../../native-agent/install.mjs';
import {requestAgent} from '../../native-agent/cli.mjs';
import {approveNativePermission} from './native-chrome-consent.mjs';
import {AGENT_CONFIG_PROTOCOL} from '../../src/native-agent/protocol.js';
import {PROTOCOL as FOUNDATION_PROTOCOL} from '../../src/platform/protocol.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {prepareR101Projects,runR101Projects} from './r101-local-programs.mjs';
import {runCodexClient} from './r101-codex-cli.mjs';
import {runControllerLifecycle} from './r101-controller-lifecycle.mjs';
import {launchLocalDevChrome} from './local-dev-cft-launcher.mjs';
const r101Enabled=process.env.OPENDESK_R101_ACCEPTANCE==='1';
let r101Projects=[],networkObservation;

const root=process.cwd(),out=path.resolve(process.env.OPENDESK_DEV_EVIDENCE||'docs/framework/evidence/local-dev-r22-native');
fs.mkdirSync(out,{recursive:true});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const execute=promisify(execFile);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,ms=20000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(error){last=error;}await pause(150);}throw new Error(label+' timed out'+(last?': '+last.message:''));}
const events=[];const record=(type,value)=>{const row={time:new Date().toISOString(),type,value};events.push(row);fs.appendFileSync(out+'/events.jsonl',JSON.stringify(row)+'\n');console.log(type+' '+JSON.stringify(value));};
async function cdp(url){
 const ws=new WebSocket(url),requests=new Map(),listeners=new Map();let seq=0;
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);for(const fn of listeners.get(msg.method)||[])fn(msg.params,msg.sessionId);if(!msg.id||!requests.has(msg.id))return;const p=requests.get(msg.id);requests.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);});
 ws.addEventListener('close',()=>{for(const p of requests.values()){clearTimeout(p.timer);p.reject(new Error('CDP disconnected'));}requests.clear();});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{requests.delete(id);reject(new Error('CDP timeout '+method));},15000);requests.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 return {call,on(method,fn){const rows=listeners.get(method)||new Set();rows.add(fn);listeners.set(method,rows);return ()=>rows.delete(fn);},close:()=>ws.close(),read:async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value;},
  async click(selector){const r=await this.read('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');assert.ok(r&&r.x>0&&r.y>0,'visible trusted click '+selector);await call('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});},
  async screenshot(file){const image=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,file),Buffer.from(image.data,'base64'));}};
}
async function clickNode(session,expression){
 const handle=await session.call('Runtime.evaluate',{expression,returnByValue:false});assert.ok(handle.result?.objectId,'actual visible control');
 await session.call('DOM.scrollIntoViewIfNeeded',{objectId:handle.result.objectId});
 const box=await session.read('(()=>{const n=('+expression+');if(!n||n.disabled)return null;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()');
 assert.ok(box?.width>0&&box.height>0&&box.x>0&&box.y>0,'current native control bounds');
 for(const type of ['mousePressed','mouseReleased'])await session.call('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
 await session.call('Runtime.releaseObject',{objectId:handle.result.objectId});
}
async function key(session,key,code,keyCode,modifiers=0){for(const type of ['keyDown','keyUp'])await session.call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:keyCode,modifiers});}
async function selectIndex(session,selector,index){
 const expected=await session.read('(()=>{const e=document.querySelector('+JSON.stringify(selector)+'),o=e?.options['+index+'];return o&&!o.disabled?{value:o.value,label:o.textContent}:null})()');
 assert.ok(expected,'available native option '+selector+' index '+index);
 record('sidebar.select-options',{selector,index,options:await session.read('Array.from(document.querySelector('+JSON.stringify(selector)+').options).map((o,i)=>({index:i,value:o.value,disabled:o.disabled,label:o.textContent}))')});
 let lastSelectionError;
 for(let attempt=0;attempt<3;attempt++){
  try{
 if(process.platform==='darwin'&&!process.env.OPENDESK_DEV_EXTERNAL_SELECT)await execute('/usr/bin/osascript',['-e','tell application "System Events"\ntell first application process whose unix id is '+chrome.pid+'\nset frontmost to true\nif not frontmost then error "Owned Chrome unavailable"\nkey code 53\nend tell\nend tell'],{timeout:10000});
 await clickNode(session,'document.querySelector('+JSON.stringify(selector)+')');
  if(process.platform==='darwin'&&process.env.OPENDESK_DEV_EXTERNAL_SELECT){
    record('sidebar.awaiting-external-select',{pid:chrome.pid,selector,index,...expected});
    await until(()=>session.read('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');return e.selectedIndex==='+index+'&&e.value==='+JSON.stringify(expected.value)+'})()'),'external native selection '+selector,120000);
  }else if(process.platform==='darwin'){
  // Select the actual AppKit menu item by its observed label. AXPress is
  // native UI input and avoids Home/Down index ambiguity and global keys.
  const script='on run argv\nset ownedPid to item 1 of argv as integer\nset wantedLabel to item 2 of argv\nset inputMethod to ""\nset stepCount to item 3 of argv as integer\nset moveDown to item 4 of argv is "down"\ntell application "System Events"\nset candidates to application processes whose unix id is ownedPid\nif (count candidates) is not 1 then error "Owned Chrome process unavailable"\ntell item 1 of candidates\nif not frontmost then return "FOCUS_LOST"\nset matches to {}\nset labels to {}\nrepeat with uiElement in entire contents\ntry\nif role of uiElement is "AXMenuItem" then\nset labelText to name of uiElement as text\nset end of labels to labelText\nif labelText is wantedLabel and enabled of uiElement then set end of matches to uiElement\nend if\nend try\nend repeat\nif (count matches) is 1 then\nperform action "AXPress" of item 1 of matches\nset inputMethod to "NATIVE_SELECT_AXPRESS"\nelse if (count matches) is 0 then\nrepeat stepCount times\nif moveDown then\nkey code 125\nelse\nkey code 126\nend if\nend repeat\nkey code 36\nset inputMethod to "NATIVE_SELECT_KEYS"\nelse\nerror "Ambiguous owned native menu item"\nend if\nend tell\nend tell\nreturn inputMethod\nend run';
  const current=await session.read('document.querySelector('+JSON.stringify(selector)+').selectedIndex');
  const steps=await session.read('Array.from(document.querySelector('+JSON.stringify(selector)+').options).slice('+Math.min(current,index)+','+(Math.max(current,index)+1)+').filter((o,i)=>!o.disabled&&i!=='+(current<index?0:Math.abs(current-index))+').length');
  const result=await execute('/usr/bin/osascript',['-e',script,String(chrome.pid),expected.label,String(steps),current<index?'down':'up'],{timeout:10000});
  record('sidebar.native-menu-input',{selector,expected:expected.label,receipt:result.stdout.trim()});assert.ok(['NATIVE_SELECT_AXPRESS','NATIVE_SELECT_KEYS'].includes(result.stdout.trim()),'owned native menu input must complete');
 }else{await key(session,'Home','Home',36);for(let n=0;n<index;n++)await key(session,'ArrowDown','ArrowDown',40);await key(session,'Enter','Enter',13);}
 await until(()=>session.read('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');return e.selectedIndex==='+index+'&&e.value==='+JSON.stringify(expected.value)+'})()'),'native option selected '+selector,3000);
   lastSelectionError=null;break;
  }catch(error){lastSelectionError=error;record('sidebar.select-retry',{selector,index,attempt,message:error.message});}
 }
 if(lastSelectionError)throw lastSelectionError;
 record('sidebar.native-select',{selector,index,...expected});
}
function mcp(projects,{lostAck=false}={}){
 const args=lostAck?[path.join(root,'tests/framework/local-dev-lost-ack-mcp.mjs'),projects[0]]:[path.join(root,'native-agent/local-dev/mcp.mjs'),...projects.flatMap(project=>['--allow-project',project])];
 const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe']});
 const pending=new Map();let seq=0,buffer='',closed=false;child.stderr.on('data',bytes=>fs.appendFileSync(out+'/mcp-stderr.log',bytes));
 child.stdout.on('data',bytes=>{buffer+=bytes;let index;while((index=buffer.indexOf('\n'))>=0){const value=JSON.parse(buffer.slice(0,index));buffer=buffer.slice(index+1);const item=pending.get(value.id);if(item){clearTimeout(item.timer);pending.delete(value.id);value.error?item.reject(new Error(JSON.stringify(value.error))):item.resolve(value.result);}}});
 const request=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP timeout '+method));},40000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 return {child,request,notify:(method,params)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n'),
  async tool(name,args){const result=await request('tools/call',{name:'opendesk.dev.'+name,arguments:args});record('mcp.'+name,result.structuredContent);if(result.isError)throw Object.assign(new Error(result.structuredContent.error.message),result.structuredContent.error);return result.structuredContent;},
  close(){if(closed)return;closed=true;child.stdin.end();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('MCP closed'));}pending.clear();}};
}
const binary=process.env.CHROME_FOR_TESTING_BIN;
if(!binary||!fs.existsSync(binary))throw new Error('CHROME_FOR_TESTING_BIN must identify an actual controlled Chrome for Testing binary');
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'od-dev-'));
let profile=path.join(workspace,'profile');
const project=path.join(workspace,'project'),pageProject=path.join(workspace,'page-project');
fs.mkdirSync(profile,{mode:0o700});fs.mkdirSync(project);fs.mkdirSync(pageProject);
let chrome,server,browser,options,extensions,tool,target,mcpClient,lostClient,installed=false;
let report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),platform:process.platform,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),packageManifestSha256:sha(fs.readFileSync('dist/production/manifest.json')),buildReceipt:JSON.parse(fs.readFileSync(process.env.OPENDESK_DEV_BUILD_RECEIPT||'docs/framework/evidence/wxt/builds/build-production.json','utf8')),chromeVersion:spawnSync(binary,['--version'],{encoding:'utf8'}).stdout.trim(),profile,tests:[]};
try{
 const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain','--disable-features=Translate','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'--disable-extensions-except='+path.join(root,'dist/production'),'--load-extension='+path.join(root,'dist/production'),'about:blank'];
 if(process.platform==='linux'&&process.getuid()===0)argv.unshift('--no-sandbox');
 const launched=await launchLocalDevChrome({root,out,binary,argv,profile});chrome=launched.chrome;profile=launched.profile;report.profile=profile;report.launch=launched.launch;
 const lines=launched.lines;
 const base='http://127.0.0.1:'+lines[0];browser=await cdp('ws://127.0.0.1:'+lines[0]+lines[1]);
 if(r101Enabled){
   const sessions=new Map(),coverage=[],errors=[],requests=[];
   const filter=[...['worker','shared_worker','service_worker','iframe'].map(type=>({type,exclude:false})),{exclude:true}];
   browser.on('Target.attachedToTarget',async({sessionId,targetInfo})=>{
     sessions.set(sessionId,targetInfo);
     try{await browser.call('Network.enable',{},sessionId);coverage.push({sessionId,...targetInfo});}
     catch(error){errors.push({sessionId,targetInfo,message:error.message});}
     finally{try{await browser.call('Runtime.runIfWaitingForDebugger',{},sessionId);}catch(error){errors.push({sessionId,targetInfo,message:error.message});}}
     try{await browser.call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter},sessionId);}
     catch(error){errors.push({sessionId,targetInfo,message:error.message});}
   });
   for(const event of ['Network.requestWillBeSent','Network.responseReceived'])browser.on(event,(value,sessionId)=>{
     const row={event,sessionId,target:sessions.get(sessionId),...value};requests.push(row);fs.appendFileSync(out+'/runtime-network.jsonl',JSON.stringify(row)+'\n');
   });
   await browser.call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter});
   networkObservation={coverage,errors,requests};
 }
 const observePage=async(session,tab)=>{
   if(!networkObservation)return;
   for(const event of ['Network.requestWillBeSent','Network.responseReceived'])session.on(event,value=>{
     const row={event,target:tab,...value};networkObservation.requests.push(row);fs.appendFileSync(out+'/runtime-network.jsonl',JSON.stringify(row)+'\n');
   });
   await session.call('Network.enable');networkObservation.coverage.push({sessionId:'direct-'+tab.id,...tab,type:'page'});
 };
 const newTab=async url=>{const response=await fetch(base+'/json/new?about%3Ablank',{method:'PUT'});assert.equal(response.status,200);const tab=await response.json(),session=await cdp(tab.webSocketDebuggerUrl);await observePage(session,tab);if(url!=='about:blank')await session.call('Page.navigate',{url});return {tab,session};};
 const extensionId=await until(async()=>{const list=await (await fetch(base+'/json/list')).json();return list.find(row=>row.type==='service_worker'&&/chrome-extension:\/\/[a-p]{32}\/sw\.js/.test(row.url))?.url.split('/')[2];},'OpenDesk extension');report.extensionId=extensionId;
 const install=setup(extensionId,'cft',profile);installed=true;record('native.install',install);
 const nativeOptions=await newTab('about:blank');options=nativeOptions.session;await options.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/native-agent/settings.html'});
 // The HTML button exists before settings.js has installed its trusted handler.
 // Wait for the real settings response, not merely for a DOM node.
 await until(()=>options.read('document.querySelector("#bridge-status")?.textContent.includes('+JSON.stringify('Extension ID：'+extensionId)+')'),'Native Options ready');
 record('native.options.before',await options.read('document.querySelector("#bridge-status").textContent'));
  await browser.call('Target.activateTarget',{targetId:nativeOptions.tab.id});
  await options.call('Page.bringToFront');
  if(process.platform==='darwin'&&!process.env.OPENDESK_DEV_EXTERNAL_CONSENT)await execute('/usr/bin/osascript',['-e','tell application "System Events" to set frontmost of first application process whose unix id is '+chrome.pid+' to true'],{timeout:10000});
 await until(()=>options.read('document.visibilityState==="visible"'),'exact Native settings page visible before trusted input');
 record('native.permission.input-target',await options.read('({url:location.href,title:document.title,visibility:document.visibilityState,focus:document.hasFocus()})'));
 await options.click('#bridge-enable');
 record('native.permission.request-target',await options.read('({url:location.href,title:document.title,visibility:document.visibilityState,focus:document.hasFocus()})'));
 if(process.env.OPENDESK_DEV_EXTERNAL_CONSENT){
   record('native.permission.awaiting-external-ui',{pid:chrome.pid,extensionId});
   await until(()=>options.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),'external real Native permission',120000);
   record('native.permission.input',{kind:'observed-permission-after-trusted-settings-click',pid:chrome.pid,extensionId,permission:'nativeMessaging',verification:'actual permissions.contains; separate native modal input not observed'});
 }else record('native.permission.input',await approveNativePermission({pid:chrome.pid,evidenceDirectory:out,timeoutMs:process.env.OPENDESK_LOCAL_CODEX==='1'?120000:40000}));
 const nativeGranted=await options.read('chrome.permissions.contains({permissions:["nativeMessaging"]})');assert.equal(nativeGranted,true);record('native.permission.granted',nativeGranted);
 ({session:extensions}=await newTab('about:blank'));await extensions.call('Page.navigate',{url:'chrome://extensions/?id='+extensionId});
 const detail='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
 const toggle='('+detail+')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
 await until(()=>extensions.read('('+detail+')?.data?.id==='+JSON.stringify(extensionId)+'&&('+toggle+')!=null'),'actual extension User Scripts control');
 assert.equal(await extensions.read('('+detail+').shadowRoot.querySelector("#name").textContent.trim()'),'OpenDesk Browser');
 if(!await extensions.read('('+toggle+').checked'))await clickNode(extensions,toggle);
 await until(()=>extensions.read('('+toggle+').checked===true'),'User Scripts actual toggle');
 record('page.user-scripts.opt-in',{extensionId,control:await extensions.read('({checked:('+toggle+').checked,ariaChecked:('+toggle+').getAttribute("aria-checked"),ariaPressed:('+toggle+').getAttribute("aria-pressed"),rowChecked:('+detail+').shadowRoot.querySelector("#allow-user-scripts").checked,metadata:('+detail+').data.userScriptsAccess})')});await extensions.screenshot('user-scripts-opt-in.png');
 const nativeStatus=()=>options.read('chrome.runtime.sendMessage('+JSON.stringify({protocol:AGENT_CONFIG_PROTOCOL,type:'status'})+')');
 const enabled=await until(async()=>{const state=await nativeStatus();return state.ok&&state.data?.enabled?state.data:null;},'persisted Native enable state');
 if(enabled.requiresReload){
  // First-time optional API bindings can remain stale in the original worker.
  // Reuse the main Native smoke's observed worker lifecycle recovery, after
  // actual user approval and before any program admission. No grants are edited.
  const versions=new Map(),off=options.on('ServiceWorker.workerVersionUpdated',e=>{for(const v of e.versions)versions.set(v.versionId,v);});
  await options.call('ServiceWorker.enable');
  const original=await until(()=>[...versions.values()].find(v=>v.scriptURL==='chrome-extension://'+extensionId+'/sw.js'&&v.runningStatus==='running'),'original Native worker');
  await options.call('ServiceWorker.stopWorker',{versionId:original.versionId});
  await until(()=>versions.get(original.versionId)?.runningStatus==='stopped','Native worker retirement');
  await nativeStatus();
  const fresh=await until(async()=>{const list=await(await fetch(base+'/json/list')).json();return list.find(x=>x.type==='service_worker'&&x.url===original.scriptURL&&x.id!==original.targetId);},'fresh Native worker');
  const worker=await cdp(fresh.webSocketDebuggerUrl);
  const actual=await worker.read('(async()=>({api:typeof chrome.runtime.connectNative,granted:await chrome.permissions.contains({permissions:["nativeMessaging"]}),userScripts:await chrome.userScripts.getScripts().then(()=>true)}))()');worker.close();off();
  assert.equal(actual.api,'function');assert.equal(actual.granted,true);assert.equal(actual.userScripts,true);record('native.permission.worker-restart',{oldTarget:original.targetId,newTarget:fresh.id,actual});
 }
 const bridge=await until(async()=>{const r=await requestAgent('bridge.status',{},crypto.randomUUID(),3000);return r.result?.nativeConnected?r.result:null;},'real Native handshake');record('native.handshake',bridge);report.tests.push({name:'real-native-handshake',status:'PASS'});
 await options.click('#bridge-refresh');await options.screenshot('native-options.png');
 const toolInfo=await newTab('about:blank');tool=toolInfo.session;await tool.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
 await until(async()=>{const r=await requestAgent('bridge.status',{},crypto.randomUUID(),3000);return r.result?.hostRegistrations?.length===1;},'registered original RunHost');
 const html=fs.readFileSync(path.join(root,'examples/tasks/demo-form.html'));
 server=http.createServer((req,res)=>{if(req.url.split('?')[0]!=='/demo-form.html'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,url=origin+'/demo-form.html';
 const targetInfo=await newTab(url);target=targetInfo.session;await browser.call('Target.activateTarget',{targetId:targetInfo.tab.id});
 await until(()=>target.read('document.readyState==="complete"'),'demo form');
 const selected=await until(async()=>{const r=await requestAgent('target.current',{},crypto.randomUUID(),3000);return r.result?.target?.origin===origin?r.result:null;},'exact demo document');record('native.target',selected);
 fs.cpSync(path.join(root,'examples/programs/local-controller'),project,{recursive:true});
 const pkg=JSON.parse(fs.readFileSync(project+'/package.json','utf8'));
 // Isolate the demo server port while preserving the committed project format.
 pkg.opendesk.siteOrigins=[origin];fs.writeFileSync(project+'/package.json',JSON.stringify(pkg,null,2)+'\n');
 fs.cpSync(path.join(root,'examples/programs/local-page-ui'),pageProject,{recursive:true});
 if(r101Enabled)r101Projects=await prepareR101Projects({root,workspace,origin,out,record});
 mcpClient=mcp([project,pageProject,...r101Projects.map(p=>p.path)]);const initialized=await mcpClient.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'opendesk-real-acceptance',version:'1'}});assert.equal(initialized.protocolVersion,'2025-11-25');mcpClient.notify('notifications/initialized');
 const attached=await mcpClient.tool('attach',{path:project});
 if(process.env.OPENDESK_LOCAL_CODEX==='1'){
   const codexProject=path.join(workspace,'codex-project');fs.cpSync(project,codexProject,{recursive:true});
   const codexPackage=JSON.parse(fs.readFileSync(codexProject+'/package.json','utf8'));codexPackage.opendesk.id='sample.local-ai-r1';fs.writeFileSync(codexProject+'/package.json',JSON.stringify(codexPackage,null,2)+'\n');
   await runCodexClient({root,project:codexProject,origin,documentId:selected.target.documentId,title:await target.read('document.title'),out,report,record});
 }
 async function runVersion(version){
  const started=await mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'acceptance-v'+version+'-'+crypto.randomUUID(),params:{}});assert.ok(started.runId);assert.equal(started.source.sourceHash,started.revision.sourceHash);
  const result=await until(async()=>{const result=await mcpClient.tool('result',{runId:started.runId});return result.run.retirementState==='released'&&result.results.length?result:null;},'durable result',30000);
  assert.equal(result.results[0].outcome.ok,true);assert.equal(result.value.version,version);assert.equal(result.value.title,await target.read('document.title'));assert.equal(result.sourceHash,started.source.sourceHash);
  report.tests.push({name:'multifile-version-'+version,status:'PASS',runId:result.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,documentId:selected.target.documentId,retirement:result.run.retirementState});return result;
 }
 const first=await runVersion(1);
 if(process.env.OPENDESK_LOCAL_CODEX==='1')await runControllerLifecycle({project,bindingId:attached.bindingId,mcpClient,until,report,record});
 fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){return {version:2,title:await page.title(),heading:await page.locator("h1").textContent()};}\n');
 const second=await runVersion(2);assert.notEqual(first.sourceHash,second.sourceHash);assert.equal(second.value.heading,await target.read('document.querySelector("h1").textContent'));
 const original=await mcpClient.tool('result',{runId:first.runId});assert.equal(original.sourceHash,first.sourceHash);assert.equal(original.value.version,1);
 if(r101Enabled)await runR101Projects({projects:r101Projects,mcpClient,until,report,record});
 assert.deepEqual(fs.readdirSync(project).sort(),['README.md','package.json','src']);assert.deepEqual(fs.readdirSync(project+'/src').sort(),['extract.js','main.js']);
 report.tests.push({name:'no-build-or-json-handoff-and-old-result-frozen',status:'PASS'});
 fs.writeFileSync(project+'/src/extract.js','export const invalid=;');await assert.rejects(()=>mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'syntax-'+crypto.randomUUID()}),{code:'E_PROJECT_SYNTAX'});report.tests.push({name:'invalid-source-no-stale-fallback',status:'PASS'});
 fs.unlinkSync(project+'/src/extract.js');await assert.rejects(()=>mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'missing-'+crypto.randomUUID()}),{code:'E_PROJECT_FILE'});
 fs.writeFileSync(project+'/src/extract.js',' '.repeat(256*1024+1));await assert.rejects(()=>mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'oversize-'+crypto.randomUUID()}),{code:'E_DEV_LIMIT'});
 assert.equal((await mcpClient.tool('diagnostics',{bindingId:attached.bindingId})).lastError.outcome,'NOT_DISPATCHED');
 report.tests.push({name:'real-connected-MCP-missing-file-and-source-read-limit-no-dispatch',status:'PASS',scope:'256 KiB individual source read limit; not the Native wire boundary'});
 fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){await page.waitForSelector("#locator-late-target",{timeout:10000});return {version:6,title:await page.title()};}\n');
 assert.equal(await target.read('document.querySelector("#locator-late-target")===null'),true);
 const running=await mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'edit-while-running-'+crypto.randomUUID()});
 const beforeEdit=await mcpClient.tool('result',{runId:running.runId});assert.equal(beforeEdit.run.state,'running');assert.equal(beforeEdit.results.length,0);
 fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){return {version:7,title:await page.title()};}\n');
 await clickNode(target,'document.querySelector("#locator-late-launch")');
 const frozenRun=await until(async()=>{const r=await mcpClient.tool('result',{runId:running.runId});return r.run.retirementState==='released'&&r.results.length?r:null;},'running Controller keeps frozen source');
 assert.equal(frozenRun.value.version,6);assert.equal(frozenRun.sourceHash,running.source.sourceHash);
 const freshRun=await runVersion(7);assert.notEqual(frozenRun.sourceHash,freshRun.sourceHash);
 report.tests.push({name:'edit-while-Controller-is-confirmed-running',status:'PASS',runId:frozenRun.runId,resultId:frozenRun.results[0].resultId,sourceHash:frozenRun.sourceHash,nextRunId:freshRun.runId,nextSourceHash:freshRun.sourceHash});
 const pageBinding=await mcpClient.tool('attach',{path:pageProject});
 const ui='document.querySelector(\'[data-od-id="sample.local-page-ui"]\')';
 const shadow='('+ui+').shadowRoot',counter='('+shadow+').querySelector("output")';
 async function pageVersion(version,{close='native'}={}){
  const started=await mcpClient.tool('run',{bindingId:pageBinding.bindingId,requestId:'page-v'+version+'-'+crypto.randomUUID()});assert.ok(started.previewId);assert.equal(started.runId,undefined);
  const result=await until(async()=>{const r=await mcpClient.tool('result',{previewId:started.previewId});return r.state!=='preview-pending'?r:null;},'Page native completion');
  assert.equal(result.state,'preview-evaluated',JSON.stringify(result));assert.equal(result.result.world,'USER_SCRIPT');assert.equal(result.result.sourceHash,started.source.sourceHash);assert.equal(result.result.documentId,selected.target.documentId);
  assert.equal(JSON.parse(result.result.resultText).label,'Local v'+version);assert.equal(await target.read('('+shadow+').querySelector("img").naturalWidth>0'),true);
  await clickNode(target,'('+shadow+').querySelector(\'[data-action="count"]\')');
  assert.equal(await target.read('('+counter+').textContent'),String(version));
  const color=await target.read('getComputedStyle(('+shadow+').querySelector(\'[data-action="count"]\')).backgroundColor');assert.equal(color,version===1?'rgb(31, 102, 178)':'rgb(178, 47, 89)');
  await target.screenshot('page-ui-v'+version+'.png');report.tests.push({name:'page-user-script-version-'+version,status:'PASS',previewId:started.previewId,sourceHash:started.source.sourceHash,world:result.result.world,worldId:result.result.worldId,documentId:result.result.documentId,color});
  if(close==='native')await clickNode(target,'('+shadow+').querySelector(\'[data-action="close"]\')');
  if(close==='mcp'){const stopped=await mcpClient.tool('stop',{previewId:started.previewId,requestId:'page-stop-'+crypto.randomUUID()});assert.equal(stopped.state,'preview-retired');assert.equal(stopped.sourceHash,result.sourceHash);assert.equal(stopped.receipt.scope,'managed-ui-only');assert.equal(stopped.receipt.ok,true);report.tests.push({name:'typed-MCP-managed-Page-stop',status:'PASS',previewId:started.previewId,sourceHash:stopped.sourceHash,receipt:stopped.receipt});}
  if(close!=='none')await until(()=>target.read('!('+ui+')'),'managed UI close');return result;
 }
 const pageFirst=await pageVersion(1);
 fs.writeFileSync(pageProject+'/src/model.js','export const label="Local v2";\nexport const step=2;\n');
 fs.writeFileSync(pageProject+'/assets/ui.css',fs.readFileSync(pageProject+'/assets/ui.css','utf8').replaceAll('31,102,178','178,47,89'));
 const pageSecond=await pageVersion(2,{close:'mcp'});assert.notEqual(pageFirst.sourceHash,pageSecond.sourceHash);
 const cleanPageMain=fs.readFileSync(pageProject+'/src/main.js','utf8');
 fs.writeFileSync(pageProject+'/src/main.js',cleanPageMain.replace('render(ui,','let ticks=0;ui.setInterval(()=>ui.host.setAttribute("data-dev-ticks",String(++ticks)),20);ui.onDispose(async()=>{await new Promise(resolve=>setTimeout(resolve,80));ui.host.setAttribute("data-dev-cleaned","true");});\n  render(ui,'));
 fs.writeFileSync(pageProject+'/src/model.js','export const label="Local v3";export const step=3;\n');
 const pageThird=await pageVersion(3,{close:'none'});
 const oldHost=(await target.call('Runtime.evaluate',{expression:ui,returnByValue:false})).result.objectId;assert.ok(oldHost);
 fs.writeFileSync(pageProject+'/src/main.js',cleanPageMain.replace('render(ui,','ui.onDispose(()=>{throw new Error("EXPECTED_DISPOSE_FAILURE");});\n  render(ui,'));
 fs.writeFileSync(pageProject+'/src/model.js','export const label="Local v4";export const step=4;\n');
 const pageFourth=await pageVersion(4,{close:'none'});assert.equal(pageFourth.result.previousCleanup.previewId,pageThird.previewId);assert.equal(pageFourth.result.previousCleanup.ok,true);assert.equal(pageFourth.result.previousCleanup.scope,'managed-ui-only');
 const oldState=async()=>{const r=await target.call('Runtime.callFunctionOn',{objectId:oldHost,functionDeclaration:'function(){return {connected:this.isConnected,ticks:this.getAttribute("data-dev-ticks"),cleaned:this.getAttribute("data-dev-cleaned")}}',returnByValue:true});return r.result.value;};
 const oldAfter=await oldState();assert.equal(oldAfter.connected,false);assert.equal(oldAfter.cleaned,'true');await pause(160);assert.deepEqual(await oldState(),oldAfter);
 assert.equal(await target.read('document.querySelectorAll(\'[data-od-id="sample.local-page-ui"]\').length'),1);
 report.tests.push({name:'managed-hot-reload-awaits-cleanup-and-stops-old-timer',status:'PASS',oldPreviewId:pageThird.previewId,previewId:pageFourth.previewId,oldWorldId:pageThird.result.worldId,newWorldId:pageFourth.result.worldId,sourceHash:pageFourth.sourceHash,receipt:pageFourth.result.previousCleanup,oldAfter});
 fs.writeFileSync(pageProject+'/src/model.js','export const label="Local v5";export const step=5;\n');
 const failedPreview=await mcpClient.tool('run',{bindingId:pageBinding.bindingId,requestId:'cleanup-failure-'+crypto.randomUUID()});
 const failedCleanup=await until(async()=>{const r=await mcpClient.tool('result',{previewId:failedPreview.previewId});return r.state!=='preview-pending'?r:null;},'failed cleanup blocks replacement');
 assert.equal(failedCleanup.state,'preview-failed');assert.equal(failedCleanup.error.code,'E_UI_CLEANUP_FAILED');assert.equal(await target.read('!('+ui+')'),true);
 report.tests.push({name:'real-managed-cleanup-failure-does-not-mount-new-source',status:'PASS',oldPreviewId:pageFourth.previewId,rejectedPreviewId:failedPreview.previewId,sourceHash:failedPreview.source.sourceHash,error:failedCleanup.error});
 await target.screenshot('page-ui-cleanup-failure-no-replacement.png');
 await clickNode(target,'document.querySelector("#name")');await target.call('Input.insertText',{text:'Local Dev'});
 await clickNode(target,'document.querySelector("#submit")');
 await until(()=>target.read('document.querySelector("#done")?.textContent==="已提交：Local Dev"'),'original website form submission');
 report.tests.push({name:'page-shadow-assets-native-interaction-and-managed-close',status:'PASS'});
 assert.equal(await target.read('typeof globalThis.chrome?.runtime?.connectNative'), 'undefined');
 assert.equal(await target.read('typeof globalThis.chrome?.runtime?.connect'), 'undefined');
 report.tests.push({name:'ordinary-webpage-has-no-extension-Native-or-project-connector',status:'PASS',scope:'actual page API absence; not a general penetration test'});
 fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){return {version:5,title:await page.title()};}\n');
 lostClient=mcp([project],{lostAck:true});await lostClient.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'real-socket-loss-acceptance',version:'1'}});lostClient.notify('notifications/initialized');
 const lostBinding=await lostClient.tool('attach',{path:project}),admissionRequestId='lost-ack-'+crypto.randomUUID();
 await assert.rejects(()=>lostClient.tool('run',{bindingId:lostBinding.bindingId,requestId:admissionRequestId,params:{}}),{code:'E_EFFECT_UNKNOWN'});
 // Edit the disk BEFORE recovery: read-only request.get must recover the old
 // admitted bytes, even when the newest source is now invalid.
 fs.writeFileSync(project+'/src/extract.js','invalid source after real dispatch');
 const recovered=await until(async()=>{const result=await lostClient.tool('result',{admissionRequestId});return result.run.retirementState==='released'&&result.results.length?result:null;},'original run recovered after real socket loss',30000);
 assert.equal(recovered.value.version,5);assert.equal(recovered.results[0].outcome.ok,true);assert.equal(recovered.requestId,admissionRequestId);
 const faultLog=fs.readFileSync(out+'/mcp-stderr.log','utf8');assert.equal(faultLog.split('FAULT_NATIVE_DISPATCH '+admissionRequestId).length-1,1);
 assert.equal(faultLog.split('FAULT_FIXTURE_RUN_START ').length-1,1,'exactly one original mutation across all recovery queries');
 report.tests.push({name:'real-socket-lost-ACK-read-only-recovery-no-replay',status:'PASS',admissionRequestId,runId:recovered.runId,resultId:recovered.results[0].resultId,sourceHash:recovered.sourceHash,version:recovered.value.version});lostClient.close();
 await tool.screenshot('workbench-after-runs.png');await target.screenshot('demo-after-runs.png');
 // P2 uses actual Chrome Side Panel contexts, opened/closed by the real browser
 // extension action. No page callback invokes sidePanel.open or grants access.
 await browser.call('Target.closeTarget',{targetId:toolInfo.tab.id});tool.close();tool=null;
 await until(async()=>!(await requestAgent('bridge.status',{},crypto.randomUUID(),3000)).result.hostRegistrations.length,'original tool Host closed');
 const {targetInfos}=await browser.call('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]});
 const actionTabs=targetInfos.filter(t=>t.type==='tab'&&t.url===url);assert.equal(actionTabs.length,1);
 const action=async()=>{await browser.call('Target.activateTarget',{targetId:actionTabs[0].targetId});const ack=await browser.call('Extensions.triggerAction',{id:extensionId,targetId:actionTabs[0].targetId});record('sidebar.browser-action',{targetId:actionTabs[0].targetId,ack});};
 const contexts=()=>options.read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
 async function openPanel(){
  await action();const context=await until(async()=>{const rows=(await contexts()).filter(x=>x.documentUrl.includes('/ui/tool.html?'));return rows.length===1?rows[0]:null;},'actual Side Panel context');
  const panelTarget=await until(async()=>{const rows=await(await fetch(base+'/json/list')).json();return rows.find(x=>x.url===context.documentUrl);},'actual Side Panel CDP target');
  tool=await cdp(panelTarget.webSocketDebuggerUrl);
  const status=await until(async()=>{const r=(await requestAgent('bridge.status',{},crypto.randomUUID(),3000)).result;return r.hostRegistrations.length===1?r:null;},'actual Side Panel Host');
  record('sidebar.open',{context,targetId:panelTarget.id,registrationId:status.hostRegistrations[0]});return {context,registrationId:status.hostRegistrations[0]};
 }
 const panel=await openPanel();
 await clickNode(tool,'document.querySelector("#tab-develop")');
 await until(()=>tool.read('document.querySelector("#script-current-page-status").dataset.state==="available"'),'Sidebar target');
 await clickNode(tool,'document.querySelector("#script-source")');
 await tool.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4,commands:['selectAll']});
 await tool.call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4});
 assert.equal(await tool.read('(()=>{const e=document.querySelector("#script-source");return document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length})()'),true,'actual native editor selection');
 if(r101Enabled){
   const plain='async function main() {\n  return document.title;\n}\n';
   await tool.call('Input.insertText',{text:plain});
   await clickNode(tool,'document.querySelector("#page-preview-tools > summary")');
   await until(()=>tool.read('!document.querySelector("#page-preview-run").disabled'),'plain JS Page preview control');
   await clickNode(tool,'document.querySelector("#page-preview-run")');
   await until(()=>tool.read('document.querySelector("#page-preview-status").dataset.state==="completed"'),'plain JS real Sidebar preview',30000);
   const actual=await tool.read('document.querySelector("#page-preview-result").textContent');
   const title=await target.read('document.title');assert.ok(actual.startsWith(JSON.stringify(title)));assert.ok(actual.includes(sha(plain)));
   const identity=(await requestAgent('target.current',{},crypto.randomUUID(),3000)).result.target;assert.equal(identity.documentId,selected.target.documentId);
   report.tests.push({name:'r101-plain-JavaScript-in-real-Sidebar',status:'PASS',sourceHash:sha(plain),documentId:identity.documentId,value:title,receipt:actual,scope:'one-shot Page preview, no Controller runId/resultId'});
   record('r101.plain-sidebar',report.tests.at(-1));await tool.screenshot('r101-plain-sidebar.png');
   await clickNode(tool,'document.querySelector("#script-source")');
   await tool.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4,commands:['selectAll']});
   await tool.call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4});
 }
 const manual='async function main(){return "unsaved manual draft";}';await tool.call('Input.insertText',{text:manual});
 assert.equal(await tool.read('document.querySelector("#script-source").value'),manual);
 await clickNode(tool,'document.querySelector("#local-project-mode").closest("label")');
 await until(()=>tool.read('(()=>{const mode=document.querySelector("#local-project-mode"),tools=document.querySelector("#local-project-tools"),select=document.querySelector("#local-project-select"),refresh=document.querySelector("#local-project-refresh");return mode?.checked&&tools&&!tools.hidden&&!select.disabled&&!refresh.disabled&&select.options.length==='+(3+r101Projects.length)+'})()'),'stable visible attached projects in Sidebar');
 await selectIndex(tool,'#local-project-select',1);await until(()=>tool.read('!document.querySelector("#script-run").disabled'),'local run button');
 async function sidebarVersion(version,panelView){
  const registrationId=panelView.registrationId;
  fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){return {version:'+version+',title:await page.title()};}\n');
  const previous=await tool.read('document.querySelector("#script-task-id").textContent');
  await clickNode(tool,'document.querySelector("#script-run")');
  const runId=await until(async()=>{const text=await tool.read('document.querySelector("#script-task-id").textContent');return text!==previous&&text.startsWith('runId：')?text.slice(6):null;},'Sidebar Controller runId');
  const response=await until(async()=>{const r=await tool.read('chrome.runtime.sendMessage('+JSON.stringify({protocol:FOUNDATION_PROTOCOL,type:'snapshotControllerRun',registrationId,payload:{runId}})+')');return r.ok&&r.data.run?.retirementState==='released'&&r.data.results.length?r.data:null;},'Sidebar durable result');
  const result=response.results.find(x=>x.runId===runId);assert.equal(result.outcome.ok,true);assert.equal(decodeValue(result.outcome.valueWire).version,version);
  assert.equal(result.revision.sourceHash,response.run.revision.sourceHash);assert.equal(response.run.target.documentId,selected.target.documentId);
  assert.equal(await tool.read('document.querySelector("#script-source").value'),manual);
  report.tests.push({name:'actual-sidebar-local-version-'+version,status:'PASS',runId,resultId:result.resultId,sourceHash:result.revision.sourceHash,documentId:response.run.target.documentId,hostDocumentId:panelView.context.documentId});return result;
 }
 const third=await sidebarVersion(3,panel);await tool.screenshot('sidebar-local-v3.png');
 await action();await until(async()=>!(await contexts()).length,'Sidebar actually closed');await until(async()=>!(await requestAgent('bridge.status',{},crypto.randomUUID(),3000)).result.hostRegistrations.length,'Sidebar Host unregistered');tool.close();tool=null;
 const reopened=await openPanel();assert.notEqual(reopened.context.documentId,panel.context.documentId);assert.notEqual(reopened.registrationId,panel.registrationId);
 await clickNode(tool,'document.querySelector("#tab-develop")');
 await until(()=>tool.read('document.querySelector("#local-project-mode").checked&&!document.querySelector("#script-run").disabled'),'reopened local project binding');
 assert.equal(await tool.read('document.querySelector("#script-source").value'),manual);
 const fourth=await sidebarVersion(4,reopened);assert.notEqual(third.revision.sourceHash,fourth.revision.sourceHash);
 await tool.screenshot('sidebar-reopened-v4.png');
 // A new real document discards old worlds, while the original shared runtime
 // observes and validates its new documentId. No test mutates extension state.
 await target.call('Page.reload');
 const newDocument=await until(async()=>{const r=(await requestAgent('target.current',{},crypto.randomUUID(),3000)).result;return r?.target?.documentId!==selected.target.documentId&&r?.target?.url===url?r.target:null;},'navigation creates fresh exact document');
 fs.writeFileSync(pageProject+'/src/main.js',cleanPageMain);fs.writeFileSync(pageProject+'/src/model.js','export const label="Local v6";export const step=6;\n');
 await selectIndex(tool,'#local-project-select',2);await until(()=>tool.read('!document.querySelector("#script-run").disabled'),'Sidebar Page binding');
 await clickNode(tool,'document.querySelector("#script-run")');
 const sidebarPage=await until(async()=>{const value=await tool.read('document.querySelector("#script-task-id").textContent');return value.startsWith('previewId：')?value.slice(10):null;},'Sidebar Page previewId');
 await until(()=>tool.read('!document.querySelector("#script-stop").disabled&&document.querySelector("#script-stop").textContent==="停止受管 UI"'),'Sidebar managed Page completed');
 assert.equal(await target.read('('+shadow+').querySelector(\'[data-action="count"]\').textContent'), 'Local v6');
 await clickNode(target,'('+shadow+').querySelector(\'[data-action="count"]\')');assert.equal(await target.read('('+counter+').textContent'),'6');
 await tool.screenshot('sidebar-page-v6.png');
 mcpClient.close();await until(()=>tool.read('document.querySelector("#local-project-status").dataset.state==="disconnected"&&document.querySelector("#script-run").disabled'),'MCP disconnect disables local execution');
 assert.equal(await tool.read('document.querySelector("#script-stop").disabled'),false,'stopping existing managed UI does not need local disk connection');
 await clickNode(tool,'document.querySelector("#script-stop")');await until(()=>target.read('!('+ui+')'),'Sidebar stops managed UI after MCP disconnect');
 await until(()=>tool.read('document.querySelector("#script-status").textContent.includes("受管 UI 已清理")'),'Sidebar cleanup receipt');
 report.tests.push({name:'actual-Sidebar-Page-new-document-and-stop-after-MCP-disconnect',status:'PASS',previewId:sidebarPage,documentId:newDocument.documentId,previousDocumentId:selected.target.documentId});
 await clickNode(tool,'document.querySelector("#local-project-mode").closest("label")');assert.equal(await tool.read('document.querySelector("#local-project-mode").checked'),false);assert.equal(await tool.read('document.querySelector("#script-source").value'),manual);
 report.tests.push({name:'actual-sidebar-reopen-binding-draft-preservation-and-MCP-disconnect',status:'PASS',oldDocumentId:panel.context.documentId,newDocumentId:reopened.context.documentId});
 if(r101Enabled){
   const remoteJS=networkObservation.requests.filter(row=>{
     const url=row.request?.url||row.response?.url||'';
     return /^https?:/.test(url)&&!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)&&
       (row.type==='Script'||/javascript|ecmascript/.test(row.response?.mimeType||''));
   });
   fs.writeFileSync(out+'/runtime-network-coverage.json',JSON.stringify({coverage:networkObservation.coverage,errors:networkObservation.errors,remoteJS},null,2)+'\n');
   assert.ok(networkObservation.coverage.some(row=>row.type==='worker'),'Controller worker Network observation is required');
   assert.deepEqual(networkObservation.errors,[],'Network observer must attach successfully');
   assert.equal(remoteJS.length,0,'no third-party JavaScript downloaded at runtime');
   report.tests.push({name:'r101-runtime-no-remote-JavaScript',status:'PASS',remoteRequests:remoteJS.length,observedTargets:networkObservation.coverage.length,scope:'CDP Network across Page, extension, iframe and Worker targets'});
 }
 report.status=r101Enabled?'PASS_R101_REAL_CHROME_TARGETED':'PASS_P0_P1_P2_P3_REAL_CHROME';report.scope='Real stdio MCP, Native Messaging, Controller/RunHost, typed USER_SCRIPT and actual Side Panel latest local source. Actual Codex client, final framework/F3 and ZIP installation require separate acceptance.';
}catch(error){report.status='FAIL';report.error={code:error.code||'E_NATIVE_ACCEPTANCE',message:error.message,stack:error.stack};if(error.launchCleanup)report.launchCleanup=error.launchCleanup;record('failure',report.error);process.exitCode=1;
 if(process.platform==='darwin')spawnSync('/usr/sbin/screencapture',['-x',path.join(out,'native-desktop-failure.png')],{timeout:5000});
 if(options){try{record('native.options.failure',await options.read('({url:location.href,status:document.querySelector("#bridge-status")?.textContent,disabled:document.querySelector("#bridge-enable")?.disabled})'));await options.screenshot('native-options-failure.png');}catch(inspection){record('inspection.failure',{message:inspection.message});}}
}
finally{
 mcpClient?.close();lostClient?.close();options?.close();extensions?.close();tool?.close();target?.close();
 try{await browser?.call('Browser.close');}catch{}browser?.close();
 if(chrome?.cleanup){try{report.launchCleanup=await chrome.cleanup();}catch(error){report.launchCleanup={error:error.code||error.message};report.status='FAIL_CLEANUP';process.exitCode=1;}}
 else if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await pause(600);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
 await new Promise(resolve=>server?server.close(resolve):resolve());
 if(installed){for(let i=0;i<40&&doctor().socketExists;i++)await pause(100);try{report.cleanup=cleanup();}catch(error){report.cleanup={error:error.code||error.message};report.status='FAIL_CLEANUP';process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();report.resourcesReleased=!report.cleanup?.error&&!report.launchCleanup?.error&&report.launchCleanup?.chromePidAlive!==true&&report.launchCleanup?.launcherPidAlive!==true&&(!report.launchCleanup||report.launchCleanup.profileRemoved===true);
 if(!report.resourcesReleased){report.status='FAIL_CLEANUP';process.exitCode=1;}
 fs.writeFileSync(out+'/acceptance.json',JSON.stringify(report,null,2)+'\n');console.log('LOCAL_DEV_ACCEPTANCE='+JSON.stringify({status:report.status,sourceHead:report.sourceHead,packageHash:report.buildReceipt.report.packageHash,tests:report.tests,error:report.error,resourcesReleased:report.resourcesReleased}));
}
