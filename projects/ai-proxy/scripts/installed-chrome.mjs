// Real product installation and controlled SOCKS5 traffic in an owned Chrome profile.
// No SDK mocks, installation writes, or personal Profile access. The owned browser
// starts direct to avoid the machine's system proxy; the extension applies the PAC.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import {serializeSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';
const out=resolve(process.argv[2]);
const extension=resolve(process.env.AI_PROXY_EXTENSION||'dist/development');
const file=resolve('projects/ai-proxy/ai-proxy.opendesk-tool.json');
const chrome=process.env.CHROME_BIN||resolve('tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),mode:'STATIC_DEVELOPMENT',serveConnected:false,extension,profile:join(out,'profile'),sdkMock:false,installation:'NOT_TESTED',core:'NOT_TESTED',steps:[],traffic:[],errors:[]};
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=()=>writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
const step=(name,data={})=>{report.steps.push({name,at:new Date().toISOString(),...data});console.log(name);return save();};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let proc,socket,seq=0,host,frame,worker,extensionId;
const pending=new Map(),attached=new Map();
function call(method,params={},sessionId){return new Promise((ok,no)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout '+method));},12000);pending.set(id,{ok:r=>{clearTimeout(timer);ok(r)},no:e=>{clearTimeout(timer);no(e)}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function until(fn,label,ms=20000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const r=await fn();if(r)return r;}catch(e){last=e.message;}await delay(100);}throw Error('WAIT '+label+' '+(last||''));}
async function ev(s,expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function attach(id){if(attached.has(id))return attached.get(id);const {sessionId}=await call('Target.attachToTarget',{targetId:id,flatten:true});await call('Runtime.enable',{},sessionId);attached.set(id,sessionId);return sessionId;}
async function click(s,selector){
 await until(()=>ev(s,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return false;e.scrollIntoView({block:'center'});e.focus();return document.activeElement===e})()`),'focus '+selector);
 const isCheck=await ev(s,'["checkbox","radio"].includes(document.activeElement?.type)');
 const key=isCheck?{key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '}:{key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'};
 await call('Input.dispatchKeyEvent',{type:'keyDown',...key},s);await call('Input.dispatchKeyEvent',{type:'keyUp',key:key.key,code:key.code,windowsVirtualKeyCode:key.windowsVirtualKeyCode},s);
}
async function fill(selector,value){await until(()=>ev(frame,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!e.getClientRects().length)return false;e.focus();return document.activeElement===e})()`),'field '+selector);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},frame);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},frame);await call('Input.insertText',{text:value},frame);}
async function select(selector,value){await ev(frame,`document.querySelector(${JSON.stringify(selector)}).focus()`);const key=value==='socks5'?'s':'h';await call('Input.dispatchKeyEvent',{type:'keyDown',key,text:key},frame);await call('Input.dispatchKeyEvent',{type:'keyUp',key},frame);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},frame);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},frame);assert.equal(await ev(frame,`document.querySelector(${JSON.stringify(selector)}).value`),value);}
async function native(){return ev(worker,`chrome.proxy.settings.get({incognito:false}).then(r=>({level:r.levelOfControl,mode:r.value?.mode,pacSha:r.value?.pacScript?.data||null}))`);}
async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png'},host);await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));}
async function findFrame(){frame=await until(async()=>{for(const t of (await call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html'))){const s=await attach(t.targetId);if(await ev(s,'document.querySelector("#proxy-ready")?.dataset.ready==="true"'))return s;}return null;},'installed AI Proxy ready');return frame;}
async function openTool(){await click(host,'#extension-center-list button[data-extension-key="app:ai-proxy"][data-extension-action="main"]');await findFrame();}
async function review(approve=true){await until(()=>ev(host,'!!document.querySelector("#sidebar-tool-action-continue")?.getClientRects().length&&!document.querySelector("#sidebar-tool-action-continue").disabled'),'trusted action review');const summary=await ev(host,'document.querySelector("#sidebar-tool-action-summary")?.textContent');assert(summary.includes('gateway.ai-proxy.test')||summary.includes('停止'));await step(approve?'TRUSTED_APPROVAL':'TRUSTED_CANCEL',{summary});await click(host,approve?'#sidebar-tool-action-continue':'#sidebar-tool-action-cancel');}
const connections=new Set();
const origin=http.createServer((req,res)=>{report.traffic.push({kind:'origin',method:req.method,path:req.url,host:req.headers.host});res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('AI_PROXY_CONTROLLED_TARGET '+req.url);});
const proxy=net.createServer(client=>{connections.add(client);client.on('close',()=>connections.delete(client));client.on('error',()=>{});let buffer=Buffer.alloc(0),phase=0;
 const consume=data=>{buffer=Buffer.concat([buffer,data]);if(phase===0){if(buffer.length<2||buffer.length<2+buffer[1])return;assert.equal(buffer[0],5);buffer=buffer.subarray(2+buffer[1]);client.write(Buffer.from([5,0]));phase=1;}
 if(phase===1){if(buffer.length<5)return;const atyp=buffer[3],length=atyp===3?buffer[4]:atyp===1?4:16;const size=atyp===3?7+length:6+length;if(buffer.length<size)return;const offset=atyp===3?5:4;const dest=atyp===3?buffer.subarray(offset,offset+length).toString():atyp===1?[...buffer.subarray(4,8)].join('.'):'ipv6';const port=buffer.readUInt16BE(offset+length);report.traffic.push({kind:'socks5',host:dest,port});if(!['target.ai-proxy.test','127.0.0.1'].includes(dest)||port!==origin.address().port){client.end(Buffer.from([5,2,0,1,0,0,0,0,0,0]));return;}phase=2;client.off('data',consume);const upstream=net.connect({host:'127.0.0.1',port},()=>{client.write(Buffer.from([5,0,0,1,127,0,0,1,0,0]));if(buffer.length>size)upstream.write(buffer.subarray(size));client.pipe(upstream);upstream.pipe(client);});connections.add(upstream);upstream.on('close',()=>connections.delete(upstream));upstream.on('error',()=>client.destroy());client.on('close',()=>upstream.destroy());}};
 client.on('data',consume);
});
await new Promise(r=>origin.listen(0,'127.0.0.1',r));await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const targetUrl='http://target.ai-proxy.test:'+origin.address().port;
async function browse(label){const before=report.traffic.length;const {targetId}=await call('Target.createTarget',{url:'about:blank'});const page=await attach(targetId);await call('Page.enable',{},page);const nav=await call('Page.navigate',{url:targetUrl+'/'+label},page);assert(!nav.errorText,nav.errorText);await until(()=>ev(page,'document.body?.innerText.includes("AI_PROXY_CONTROLLED_TARGET")'),'controlled target '+label);await call('Target.closeTarget',{targetId});const traffic=report.traffic.slice(before);await step('TARGET_'+label,{traffic});return traffic;}
try{
 const pkg=JSON.parse(await readFile(file,'utf8'));report.package={id:pkg.id,version:pkg.version,sha256:sha(await readFile(file))};
 report.hostManifest={sha256:sha(await readFile(join(extension,'manifest.json')))};
 report.hostServiceWorkerSha256=sha(await readFile(join(extension,'sw.js')));
 await save();
 const args=['--no-proxy-server','--no-first-run','--no-default-browser-check','--disable-background-networking','--use-mock-keychain','--password-store=basic','--remote-debugging-port=0','--user-data-dir='+report.profile,'--disable-extensions-except='+extension,'--load-extension='+extension,'--host-resolver-rules=MAP *.ai-proxy.test 127.0.0.1','about:blank'];
 proc=spawn(chrome,args,{stdio:['ignore','ignore','pipe']});proc.stderr.on('data',b=>{report.chromeLog=(report.chromeLog||'').slice(-4000)+b.toString();});
 const lines=await until(async()=>{if(proc.exitCode!==null)throw Error('Chrome exited');try{return (await readFile(join(report.profile,'DevToolsActivePort'),'utf8')).trim().split('\n')}catch{}},'Chrome startup');
 socket=new WebSocket('ws://127.0.0.1:'+lines[0]+lines[1]);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.no(Error(m.error.message)):p.ok(m.result||{});}if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text);});
 report.chrome=await call('Browser.getVersion');
 const sw=await until(async()=>(await call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'OpenDesk service worker');worker=await attach(sw.targetId);extensionId=new URL(sw.url).host;report.extensionId=extensionId;
 const tab=await call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/sidepanel.html'});const boot=await attach(tab.targetId);const windowId=await ev(boot,'chrome.windows.getCurrent().then(w=>w.id)');
 const opened=await call('Runtime.evaluate',{expression:'chrome.sidePanel.open({windowId:'+windowId+'})',userGesture:true,awaitPromise:true,returnByValue:true},boot);assert(!opened.exceptionDetails,'Chrome real side panel open');
 const context=await until(()=>ev(boot,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>x.documentUrl.includes("hostInstanceId")))'),'genuine SIDE_PANEL');report.sidePanelContext=context.contextType;
 const panel=await until(async()=>(await call('Target.getTargets')).targetInfos.find(t=>t.url===context.documentUrl),'panel target');host=await attach(panel.targetId);await call('Page.enable',{},host);
 await until(()=>ev(host,'!!document.querySelector("#extension-center-more")&&!document.querySelector("#tab-tools")?.disabled'),'extension center');await click(host,'#tab-tools');
 await click(host,'#extension-center-more');await click(host,'#extension-center-import');await call('DOM.enable',{},host);const root=(await call('DOM.getDocument',{depth:1},host)).root;const input=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'},host);assert(input.nodeId);await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]},host);
 await until(()=>ev(host,'!!document.querySelector("#sidebar-tool-preview")?.getClientRects().length&&!document.querySelector("#sidebar-tool-install").disabled'),'install review');
 await step('INSTALL_REVIEW',{title:await ev(host,'document.querySelector("#sidebar-tool-preview-title")?.textContent')});
 await click(host,'#sidebar-tool-import-close');await step('INSTALL_CANCELLED',{installed:await ev(worker,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>(x["opendesk.sidebar-tools.installed.v1"]||[]).some(t=>t.id==="ai-proxy"))')});assert.equal(report.steps.at(-1).installed,false);
 await click(host,'#extension-center-more');await click(host,'#extension-center-import');await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]},host);await until(()=>ev(host,'!document.querySelector("#sidebar-tool-install")?.disabled'),'install review again');await click(host,'#sidebar-tool-install');
 await until(()=>ev(worker,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>(x["opendesk.sidebar-tools.installed.v1"]||[]).some(t=>t.id==="ai-proxy"&&t.version==='+JSON.stringify(pkg.version)+'))'),'durable tool installation');const installed=await ev(worker,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>x["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="ai-proxy"))');assert.equal(sha(Buffer.from(serializeSidebarToolPackage(installed))),report.package.sha256);report.installation='PASS';await step('INSTALLED_THROUGH_PRODUCT_UI',{canonicalInstalledSha256:report.package.sha256});
 await openTool();assert.equal(await ev(frame,'typeof globalThis.chrome?.runtime'),'undefined');await step('OPENED_REAL_SANDBOX');
 const baseline=await native();await step('BASELINE_DIRECT_LAUNCH',{native:baseline,scope:'owned Chrome only; OS proxy unchanged'});assert.equal(baseline.level,'controllable_by_this_extension');await browse('before');
 async function add(name,port,cancel=false){await click(frame,'#proxy-add');await fill('#proxy-name',name);await select('#proxy-scheme','socks5');await fill('#proxy-host','gateway.ai-proxy.test');await fill('#proxy-port',String(port));await fill('#proxy-domains','target.ai-proxy.test');await click(frame,cancel?'#proxy-cancel':'#proxy-save');await until(()=>ev(frame,'!document.querySelector("#proxy-editor")'),'saved/cancelled editor');}
 await add('Cancelled draft',proxy.address().port,true);assert.equal(await ev(frame,'document.querySelectorAll(".profile").length'),0);assert.deepEqual(await native(),baseline);await step('CANCEL_DOES_NOT_APPLY');
 await add('Gateway A',proxy.address().port);assert.deepEqual(await native(),baseline);await step('SAVE_DOES_NOT_APPLY');
 await click(frame,'[data-action="apply"]');await review(false);await until(()=>ev(frame,'!document.querySelector("#proxy-refresh")?.disabled'),'cancel settled');assert.deepEqual(await native(),baseline);await step('REJECTED_REVIEW_DOES_NOT_APPLY');
 await click(frame,'[data-action="apply"]');await review();await until(()=>ev(frame,'document.querySelector("#proxy-status")?.dataset.state==="enabled"'),'proxy enabled');const a=await native();assert.equal(a.level,'controlled_by_this_extension');assert(a.pacSha.includes('gateway.ai-proxy.test'));await step('APPLIED_A',{native:a});await screenshot('01-active');
 const routed=await browse('through-A');assert(routed.some(x=>x.kind==='socks5'));await step('REAL_TAB_SOCKS5_FORWARDING_PASS');
 await add('Pending B',proxy.address().port+1);assert.deepEqual(await native(),a);await step('SAVE_B_PRESERVES_ACTIVE_A');
 await click(frame,'.profile:last-child input[type="radio"]');await until(()=>ev(frame,'!document.querySelector("#proxy-refresh")?.disabled'),'selection saved');assert.deepEqual(await native(),a);await step('SELECT_B_PRESERVES_ACTIVE_A');
 // Close the genuine panel (not just its sandbox); Chrome continues the owned route.
 await call('Runtime.evaluate',{expression:'window.close()'},host);await until(()=>ev(worker,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(x=>x.length===0)'),'panel closed');const closedFlow=await browse('panel-closed');assert(closedFlow.some(x=>x.kind==='socks5'));await step('PANEL_CLOSED_ROUTE_CONTINUES');
 await call('Runtime.evaluate',{expression:'chrome.sidePanel.open({windowId:'+windowId+'})',userGesture:true,awaitPromise:true,returnByValue:true},boot);
 const ctx2=await until(()=>ev(worker,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>x.documentUrl.includes("hostInstanceId")))'),'panel reopened');const panel2=await until(async()=>(await call('Target.getTargets')).targetInfos.find(t=>t.url===ctx2.documentUrl),'reopened target');host=await attach(panel2.targetId);await call('Page.enable',{},host);await click(host,'#tab-tools');await openTool();await until(()=>ev(frame,'document.querySelector("#proxy-status")?.dataset.state==="enabled"'),'status after reopen');assert.equal(await ev(frame,'document.querySelectorAll(".profile").length'),2);await step('REOPEN_RESTORES_CONFIG_READS_NATIVE_STATUS');
 await click(frame,'#proxy-stop');await review();await until(()=>ev(frame,'document.querySelector("#proxy-status")?.dataset.state==="disabled"'),'STOP');const stopped=await native();assert.equal(stopped.level,'controllable_by_this_extension');const direct=await browse('after-stop');assert(!direct.some(x=>x.kind==='socks5'));await step('STOP_RELEASES_OWN_ROUTE',{native:stopped});await screenshot('02-stopped');
 report.core='PASS';report.finishedAt=new Date().toISOString();await save();
}catch(e){report.failure={message:e.message,stack:e.stack};report.core='FAIL';await save();console.error(e);process.exitCode=1;try{if(host)await screenshot('failure');}catch{}}
finally{if(socket?.readyState===1){await call('Browser.close').catch(()=>{});socket.close();}else if(proc&&proc.exitCode===null)proc.kill('SIGTERM');for(const c of connections)c.destroy();await new Promise(r=>proxy.close(r));origin.closeAllConnections();await new Promise(r=>origin.close(r));report.resourcesReleased=true;await save();}
