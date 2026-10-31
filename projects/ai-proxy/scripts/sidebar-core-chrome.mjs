// Full source UI in a genuine Chrome side panel, installed through official review.
// Uses an owned Profile and real input events; never writes installation/config storage.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {serializeSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';
const usage='Usage: sidebar-core-chrome.mjs <fresh-owned-output-directory> [--phase panel|review|mounted|core] [--close]';
if(process.argv.includes('--help')){console.log(usage+'\nDefault: panel, held for leader. Ctrl-C closes owned Chrome. Run after React + Shared UI Preview is stable.');process.exit(0);}
if(!process.argv[2]||process.argv[2].startsWith('--'))throw Error(usage);
let phase='panel',keepOpen=true;
const options=process.argv.slice(3);
for(let i=0;i<options.length;i++){
 if(options[i]==='--phase')phase=options[++i];
 else if(options[i]==='--close')keepOpen=false;
 else throw Error('Unknown option '+options[i]+'; '+usage);
}
if(!['panel','review','mounted','core'].includes(phase))throw Error('Invalid phase '+phase);
let stopping=false,releaseHold;
const stop=()=>{stopping=true;releaseHold?.();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const out=resolve(process.argv[2]);
const extension=resolve(process.env.AI_PROXY_EXTENSION||'dist/development');
const file=resolve('projects/ai-proxy/ai-proxy.opendesk-tool.json');
const chrome=process.env.CHROME_BIN||resolve('tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),mode:'DEVELOPMENT_CONNECTION_UNVERIFIED',phase,keepOpen,serveConnected:false,extension,profile:join(out,'profile'),sdkMock:false,installation:'NOT_TESTED',core:'NOT_TESTED',steps:[],traffic:[],errors:[]};
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=()=>writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
const step=(name,data={})=>{report.steps.push({name,at:new Date().toISOString(),...data});console.log(name,JSON.stringify(data));return save();};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let proc,socket,seq=0,host,frame,worker,extensionId;
const pending=new Map(),attached=new Map();
function call(method,params={},sessionId){return new Promise((ok,no)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout '+method));},12000);pending.set(id,{ok:r=>{clearTimeout(timer);ok(r)},no:e=>{clearTimeout(timer);no(e)}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
async function until(fn,label,ms=20000){const end=Date.now()+ms;let last;while(Date.now()<end){if(stopping)throw Error("Driver stopped");try{const r=await fn();if(r)return r;}catch(e){last=e.message;}await delay(100);}throw Error('WAIT '+label+' '+(last||''));}
async function ev(s,expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function attach(id){if(attached.has(id))return attached.get(id);const {sessionId}=await call('Target.attachToTarget',{targetId:id,flatten:true});await call('Runtime.enable',{},sessionId);attached.set(id,sessionId);return sessionId;}
async function click(s,selector){
 await until(()=>ev(s,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)return false;e.scrollIntoView({block:'center'});e.focus();return document.activeElement===e})()`),'focus '+selector);
 const isCheck=await ev(s,'["checkbox","radio"].includes(document.activeElement?.type)');
 const key=isCheck?{key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '}:{key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'};
 await call('Input.dispatchKeyEvent',{type:'keyDown',...key},s);await call('Input.dispatchKeyEvent',{type:'keyUp',key:key.key,code:key.code,windowsVirtualKeyCode:key.windowsVirtualKeyCode},s);
}
async function fill(selector,value){await until(()=>ev(frame,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!e.getClientRects().length)return false;e.focus();return document.activeElement===e})()`),'field '+selector);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},frame);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},frame);await call('Input.insertText',{text:value},frame);}
async function native(){return ev(worker,`chrome.proxy.settings.get({incognito:false}).then(r=>({level:r.levelOfControl,mode:r.value?.mode,pacSha:r.value?.pacScript?.data||null}))`);}
async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png'},host);await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));}
async function key(key,code=key,extra={}){await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,...extra},host);await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,...extra},host);}
async function choose(selector,value){
 const index=await ev(host,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();return [...e.options].findIndex(o=>o.value===${JSON.stringify(value)})})()`);
 assert(index>=0);await key('Home','Home');for(let i=0;i<index;i++)await key('ArrowDown','ArrowDown');await key('Tab','Tab',{windowsVirtualKeyCode:9});
 assert.equal(await ev(host,`document.querySelector(${JSON.stringify(selector)}).value`),value);
}
async function textButton(text,scope='.proxy-app'){
 const point=await until(()=>ev(host,`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled&&e.getClientRects().length);if(!e)return;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`),'button '+text);
 await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},host);await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},host);
}
// DetailActions uses IconButton.label = action label + product title.
const installEntry='#extension-center-detail button[data-ec-detail-action="install"][aria-label="审阅并安装「AI Proxy」"]';
async function openOfficialReview(){
 await click(host,row);
 if(!await ev(host,'!!document.querySelector("#sidebar-tool-preview")?.getClientRects().length'))await click(host,installEntry);
 await until(()=>ev(host,'!!document.querySelector("#sidebar-tool-preview")?.getClientRects().length&&!document.querySelector("#sidebar-tool-install")?.disabled'),'official review');
 report.installReview=await ev(host,'document.querySelector("#sidebar-tool-preview")?.innerText');
}
async function observeMount(){return ev(host,`(()=>{const roots=[...document.querySelectorAll('[data-ai-proxy-trusted=true]')];return {url:location.href,rootCount:roots.length,ready:!!roots[0]?.querySelector('#proxy-ready'),iframeCount:roots.reduce((n,e)=>n+e.querySelectorAll('iframe').length,0)}})()`);}
const row='#extension-center-list button[data-extension-key="app:ai-proxy"][data-extension-action="main"]';
async function storedConfig(){return ev(worker,`chrome.storage.local.get(null).then(xs=>Object.values(xs).flatMap(v=>v&&typeof v==='object'?Object.values(v):[]).find(v=>v?.schemaVersion===2&&Array.isArray(v.endpoints))||null)`);}
try{
 workflow:{
 const catalog=JSON.parse(await readFile(join(extension,'official-tools/catalog.json'),'utf8'));
 const release=catalog.apps.find(row=>row.toolId==='ai-proxy');assert(release,'development official release');
 const packageBytes=await readFile(join(extension,release.packagePath));
 assert.equal(sha(packageBytes),release.sha256,'development release hash');
 const pkg=JSON.parse(packageBytes);report.package={id:pkg.id,version:pkg.version,sha256:sha(packageBytes),path:join(extension,release.packagePath)};
 report.formalPackage={path:file,sha256:sha(await readFile(file)),matchesDevelopment:sha(await readFile(file))===sha(packageBytes)};
 const update=JSON.parse(await readFile(join(extension,'development-update.json'),'utf8'));report.build=update;
 report.hostServiceWorkerSha256=sha(await readFile(join(extension,'sw.js')));
 // A fresh owned Profile prevents stale endpoints and mixed installation evidence.
 try{await readFile(join(report.profile,'DevToolsActivePort'));throw Error('Profile already used; choose a fresh output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
 proc=spawn(chrome,['--no-proxy-server','--no-first-run','--no-default-browser-check','--disable-background-networking','--use-mock-keychain','--password-store=basic','--remote-debugging-port=0','--user-data-dir='+report.profile,'--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'],{stdio:['ignore','ignore','pipe']});
 report.chromePid=proc.pid;proc.on('error',e=>{report.launchError=e.message;});
 proc.stderr.on('data',b=>{report.chromeLog=((report.chromeLog||'')+b.toString()).slice(-4000);});
 const lines=await until(async()=>{if(report.launchError)throw Error(report.launchError);try{return (await readFile(join(report.profile,'DevToolsActivePort'),'utf8')).trim().split('\n')}catch{}},'Chrome startup');
 report.cdp={http:'http://127.0.0.1:'+lines[0],webSocket:'ws://127.0.0.1:'+lines[0]+lines[1]};
 socket=new WebSocket(report.cdp.webSocket);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.no(Error(m.error.message)):p.ok(m.result||{});}if(m.method==='Runtime.exceptionThrown')report.errors.push((m.params.exceptionDetails?.exception?.description||m.params.exceptionDetails?.text||'').slice(0,2000));});
 report.chrome=await call('Browser.getVersion');
 const sw=await until(async()=>(await call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'OpenDesk service worker');worker=await attach(sw.targetId);extensionId=new URL(sw.url).host;report.extensionId=extensionId;
 report.loadedExtension=await until(()=>ev(worker,`typeof chrome!=="undefined"&&chrome.runtime?.id&&({id:chrome.runtime.id,url:chrome.runtime.getURL(''),manifest:chrome.runtime.getManifest()})`),'worker extension context');
 report.extensionPathEvidence={launchArgument:extension,loadedBytesMatch:false,chromeReportedFilesystemPath:'NOT_AVAILABLE'};
 // The worker exposes its extension URL, not an OS path. Compare loaded bytes
 // to the requested on-disk path rather than claiming that URL is a filesystem path.
 report.loadedServiceWorkerSha256=await ev(worker,`fetch(chrome.runtime.getURL('sw.js')).then(r=>r.arrayBuffer()).then(b=>crypto.subtle.digest('SHA-256',b)).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))`);
 assert.equal(report.loadedServiceWorkerSha256,report.hostServiceWorkerSha256,'loaded worker matches launch path');report.extensionPathEvidence.loadedBytesMatch=true;
 const tab=await call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/sidepanel.html'});const boot=await attach(tab.targetId);
 const windowId=await until(()=>ev(boot,'typeof chrome!=="undefined"&&chrome.windows?.getCurrent().then(w=>w.id)'),'extension bootstrap document');
 const opened=await call('Runtime.evaluate',{expression:'chrome.sidePanel.open({windowId:'+windowId+'})',userGesture:true,awaitPromise:true,returnByValue:true},boot);assert(!opened.exceptionDetails,'real Chrome side panel');
 const context=await until(()=>ev(boot,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>x.documentUrl.includes("hostInstanceId")))'),'genuine SIDE_PANEL');report.sidePanelContext=context.contextType;report.sidePanel=context;
 const panel=await until(async()=>(await call('Target.getTargets')).targetInfos.find(t=>t.url===context.documentUrl),'panel target');report.sidePanelTargetId=panel.targetId;host=await attach(panel.targetId);frame=host;await call('Page.enable',{},host);
 await until(()=>ev(host,'!!document.querySelector("#extension-center-more")&&!document.querySelector("#tab-tools")?.disabled'),'extension center');await click(host,'#tab-tools');
 report.developmentStatus=await until(()=>ev(host,'[...document.querySelectorAll("body *")].filter(e=>e.childElementCount===0).map(e=>e.textContent).find(x=>x.includes("开发服务已连接"))'),'serve connection');report.serveConnected=true;report.mode='CONTINUOUS_DEVELOPMENT';
 report.trustedUI=await observeMount();
 await step('REAL_SIDE_PANEL_READY',{extensionId,extension,loadedExtension:report.loadedExtension,extensionPathEvidence:report.extensionPathEvidence,serveConnected:report.serveConnected,developmentStatus:report.developmentStatus,sidePanel:report.sidePanel,cdp:report.cdp,trustedUI:report.trustedUI});
 if(phase==='panel')break workflow;
 await click(host,'#extension-center-more');await click(host,'[data-ec-scope="available"]');
 await openOfficialReview();await step('OFFICIAL_REVIEW_VISIBLE',{review:report.installReview});
 if(phase==='review')break workflow;
 await click(host,'#sidebar-tool-import-close');assert.equal(await ev(worker,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>(x["opendesk.sidebar-tools.installed.v1"]||[]).some(t=>t.id==="ai-proxy"))'),false);await step('INSTALL_CANCEL_HAS_NO_RECORD');
 await openOfficialReview();await click(host,'#sidebar-tool-install');
 const installed=await until(()=>ev(worker,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(x=>(x["opendesk.sidebar-tools.installed.v1"]||[]).find(t=>t.id==="ai-proxy"&&t.version==='+JSON.stringify(pkg.version)+'))'),'durable official install');
 assert.equal(sha(Buffer.from(serializeSidebarToolPackage(installed))),report.package.sha256);report.installation='PASS';await step('INSTALLED_OFFICIAL_CURRENT_BYTES');
 await click(host,'#extension-center-more');await click(host,'[data-ec-scope="smart"]');
 await click(host,row);await until(()=>ev(host,'!!document.querySelector("[data-ai-proxy-trusted=true] #proxy-ready")'),'trusted full UI ready');assert.equal(await ev(host,'document.querySelectorAll("[data-ai-proxy-trusted=true] iframe").length'),0);report.trustedUI=await observeMount();assert.equal(report.trustedUI.rootCount,1);
 await step('TRUSTED_SINGLE_ROOT_READY',{trustedUI:report.trustedUI});
 if(phase==='mounted'){await screenshot('mounted');break workflow;}
 const baseline=await native();report.baseline=baseline;await screenshot('01-main');
 await click(host,'.proxy-app button[aria-label="打开设置"]');await until(()=>ev(host,'!!document.querySelector(".options nav [data-page=profiles]")'),'settings seven sections');
 await textButton('＋ 添加代理');await fill('#ep-host','first-entry.example.com');assert.equal(await ev(host,'document.querySelector("#ep-host").value'),'first-entry.example.com');await fill('#ep-port','8443');await choose('#ep-scheme','https');await fill('#ep-name','Sidebar core proxy');await click(host,'.proxyEditorForm button[type=submit]:not([data-add-another])');
 await until(()=>ev(host,'!document.querySelector(".proxyEditorForm")?.getClientRects().length&&document.querySelector(".options")?.innerText.includes("Sidebar core proxy")'),'saved proxy visible');assert.deepEqual(await native(),baseline);await step('FIRST_INPUT_SAVE_PRESERVES_ROUTE');
 await click(host,'.proxy-back');await until(()=>ev(host,'!!document.querySelector(".r86Side")||!document.querySelector(".options")'),'back main');assert((await ev(host,'document.querySelector(".proxy-app").innerText')).includes('Sidebar core proxy'));await screenshot('02-saved-main');await step('RETURN_MAIN_SAVED_LIST');
 await click(host,'.proxy-app button[aria-label="打开设置"]');await click(host,'.proxy-app [data-page=rules]');await fill('#rule-domain','draft.example.net');await click(host,'.proxy-app [data-page=subscriptions]');await click(host,'#proxy-draft-cancel');assert.equal(await ev(host,'document.querySelector("#rule-domain").value'),'draft.example.net');await click(host,'.proxy-app [data-page=subscriptions]');await click(host,'#proxy-draft-accept');await until(()=>ev(host,'document.querySelector(".options nav [aria-current=page]")?.dataset.page==="subscriptions"'),'discard navigation');await step('DRAFT_KEEP_DISCARD_NO_HISTORY_ERROR');
 for(const page of ['profiles','rules','subscriptions','backup','diagnostic','general','official']){await click(host,'.proxy-app nav [data-page="'+page+'"]');await until(()=>ev(host,'document.querySelector(".options nav [aria-current=page]")?.dataset.page==='+JSON.stringify(page)),'section '+page);}
 await step('ALL_SEVEN_SECTIONS_REACHABLE');await screenshot('03-management');
 await click(host,'.proxy-app nav [data-page=profiles]');await textButton('＋ 添加代理');await fill('#ep-host','auth.example.com');await fill('#ep-port','8080');await click(host,'.proxyAuthDetails summary');await fill('#ep-username','test-user');await fill('#ep-password','test-placeholder-only');await click(host,'.proxyEditorForm button[type=submit]:not([data-add-another])');await until(()=>ev(host,'!!document.querySelector(".proxyEditorForm [role=alert]")'),'auth refusal');assert.equal(await ev(host,'document.querySelector("#ep-host").value'),'auth.example.com');assert.equal(await ev(host,'document.querySelector("#ep-username").value'),'test-user');assert.deepEqual(await native(),baseline);await step('AUTH_REFUSED_WITH_DRAFT_RETAINED');
 await textButton('取消','.proxyEditorForm');assert.equal(await ev(host,'document.querySelectorAll(".profileRecords .proxyRecord").length'),1);
 assert(!report.errors.some(x=>/SecurityError|replaceState|environment missing/i.test(x)));report.core='PASS';await step('CORE_PASS');
 }
 report.phaseResult='READY';await save();
 if(keepOpen&&!stopping){
  report.heldOpen=true;await step('HELD_FOR_LEADER',{phase,result:join(out,'result.json'),cdp:report.cdp,stop:'Ctrl-C closes this owned Chrome'});
  await new Promise(resolve=>{releaseHold=resolve;proc.once('exit',resolve);socket.addEventListener('close',resolve,{once:true});if(stopping||proc.exitCode!==null||socket.readyState!==1)resolve();});
 }
}catch(e){report.failure={message:e.message,stack:e.stack};report.phaseResult='FAIL';if(phase==='core')report.core='FAIL';await save();console.error(e);process.exitCode=1;try{if(host){report.failureUI=await ev(host,'document.body.innerText');await screenshot('failure');}}catch{}}
finally{if(socket?.readyState===1){await call('Browser.close').catch(()=>{});socket.close();}else if(proc&&proc.exitCode===null)proc.kill('SIGTERM');if(proc&&proc.exitCode===null)await Promise.race([new Promise(r=>proc.once('exit',r)),delay(5000)]);report.heldOpen=false;report.resourcesReleased=!proc||proc.exitCode!==null||proc.signalCode!==null;report.finishedAt=new Date().toISOString();await save();}
