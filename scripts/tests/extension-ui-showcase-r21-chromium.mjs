#!/usr/bin/env node
// R2.1 source-bound React gallery smoke. CDP hardware-like pointer and keyboard.
// An offline preview is NOT installed Chrome, permission/Host or macOS acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile,mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const chromeBin=process.env.CHROME_BIN||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(chromeBin&&existsSync(chromeBin),'Set CHROME_BIN to a real Chromium executable');
const preview=resolve('prototypes/sidebar/react-preview/index.html');
assert.ok(existsSync(preview),'Build the source-bound React preview before review');
const artifactDir=resolve(process.env.ARTIFACTS_DIR||'artifacts/extension-center-r541/preview');
await mkdir(artifactDir,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'opendesk-ui-gallery-'));
const source=await readFile(preview,'utf8');
assert.match(source,/UI_PREVIEW_ONLY/);
assert.match(source,/od-preview-gallery/);
const report={grade:'SOURCE_BOUND_UI_PREVIEW_ONLY',previewSha256:createHash('sha256').update(source).digest('hex'),
  realHost:false,realPermission:false,realInstaller:false,installedMV3:'NOT_TESTED',macChrome:'NOT_TESTED',
  widths:[],checks:[],exceptions:[]};
let chrome,socket,exit,seq=0;
const pending=new Map();
const pause=ms=>new Promise(done=>setTimeout(done,ms));
function cdp(method,params={}){
 return new Promise((resolve,reject)=>{
   const id=++seq;
   const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},12000);
   pending.set(id,{ok:result=>{clearTimeout(timeout);resolve(result);},
     bad:error=>{clearTimeout(timeout);reject(error);}});
   socket.send(JSON.stringify({id,method,params}));
 });
}
async function evalJs(expression){
 const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw Error('Runtime JS exception '+JSON.stringify(result.exceptionDetails));
 return result.result.value;
}
async function waitFor(expression){
 for(let i=0;i<100;i++){
   try{if(await evalJs(expression))return;}catch{}
   await pause(100);
 }
 let diagnostic;
 try{diagnostic=await evalJs('({boot:document.documentElement.dataset.previewBootScript,'+
  'error:document.documentElement.dataset.previewBootError,gallery:document.getElementById("od-preview-gallery")?.outerHTML?.slice(0,600)})');}
 catch(error){diagnostic=String(error);}
 throw Error('Timed out: '+expression+'; '+JSON.stringify(diagnostic)+'; '+report.exceptions.join('; '));
}
async function navigate(width,theme='light'){
 await cdp('Emulation.setDeviceMetricsOverride',{width:Math.max(560,width+80),height:980,
   deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:pathToFileURL(preview).href+'?tab=tools&ui=showcase&width='+width+'&theme='+theme});
 await waitFor('document.documentElement.dataset.previewBootScript==="ready" && '+
  '!!document.querySelector("#od-preview-gallery [data-od-showcase-tab=controls]")');
 const measured=await evalJs('(()=>{const stage=document.getElementById("od-sidebar-preview-stage");'+
  'const gallery=document.getElementById("od-preview-gallery");'+
  'const r=stage.getBoundingClientRect();return {width:r.width,stageOverflow:stage.scrollWidth-stage.clientWidth,'+
  'galleryOverflow:gallery.scrollWidth-gallery.clientWidth,boot:document.documentElement.dataset.previewBootScript,'+
  'proof:document.querySelector("meta[name=od-preview-proof]")?.content}})()');
 assert.ok(Math.abs(measured.width-width)<=3,'Real inner width mismatch '+JSON.stringify({width,measured}));
 assert.ok(measured.stageOverflow<=2&&measured.galleryOverflow<=2,
  'Horizontal overflow '+JSON.stringify({width,measured}));
 assert.equal(measured.proof,'UI_PREVIEW_ONLY');
 report.widths.push({width,theme,measured});
 const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(join(artifactDir,'gallery-'+width+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
}
async function pointer(selector){
 const point=await evalJs('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
  'if(!n)return null;n.scrollIntoView({block:"center",inline:"nearest"});'+
  'const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height}})()');
 assert.ok(point&&point.width>0&&point.height>0,'Target missing or hidden: '+selector);
 await pause(90);
 const hit=await evalJs('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
  'const r=n.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);'+
  'return Boolean(t&&(t===n||n.contains(t)))})()');
 assert.ok(hit,'Pointer hit-test failed: '+selector);
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
}
async function key(k,keyCode=0){
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});
}
try{
 chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],
  {stdio:['ignore','ignore','pipe']});
 exit=new Promise(done=>chrome.once('close',done));
 const stderr=[];
 chrome.stderr.on('data',v=>{stderr.push(v.toString().slice(-500));if(stderr.length>15)stderr.shift();});
 let port=0;
 for(let i=0;i<150;i++){
   try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
   if(port)break;
   if(chrome.exitCode!==null)throw Error('Chromium crashed '+stderr.join(''));
   await pause(100);
 }
 assert.ok(port,'Missing Chromium debugging port '+stderr.join(''));
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const target=targets.find(v=>v.type==='page');
 assert.ok(target?.webSocketDebuggerUrl,'Chromium page CDP missing');
 socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((ok,bad)=>{socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',bad,{once:true});});
 socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.method==='Runtime.exceptionThrown')
     report.exceptions.push(message.params?.exceptionDetails?.exception?.description||'Runtime.exceptionThrown');
   const waiter=pending.get(message.id);if(!waiter)return;
   pending.delete(message.id);
   message.error?waiter.bad(Error(JSON.stringify(message.error))):waiter.ok(message.result);
 });
 await cdp('Runtime.enable');await cdp('Page.enable');
 report.chrome=(await cdp('Browser.getVersion')).product;
 for(const width of [320,360,400,440,960])await navigate(width);
 await pointer('#od-preview-gallery [data-od-showcase-tab=layers]');
 await waitFor('!!document.querySelector("#od-preview-gallery [role=tabpanel] .od-demo-floating") || '+
  '!!document.querySelector("#od-preview-gallery [role=tabpanel] .od-demo-actions")');
 report.checks.push('real tab pointer changes React panel');
 await pointer('#od-preview-gallery [role=tabpanel] .od-demo-actions .od-button');
 await waitFor('!!document.querySelector("[role=menu]")');
 report.checks.push('React Aria Menu opens by pointer');
 await key('Escape',27);
 await waitFor('!document.querySelector("[role=menu]")');
 report.checks.push('Menu Escape dismissal');
 await pointer('#od-preview-gallery [role=tabpanel] .od-demo-actions .od-button--danger');
 await waitFor('!!document.querySelector(".od-uninstall-dialog[role=dialog]")');
 await key('Escape',27);
 await waitFor('!document.querySelector(".od-uninstall-dialog[role=dialog]")');
 report.checks.push('Dialog opens and Escape closes');
 await pointer('#od-preview-gallery [data-od-showcase-tab=controls]');
 await waitFor('!!document.querySelector("#od-preview-gallery #od-demo-panel-controls")');
 const pre=await evalJs('document.querySelector("#od-preview-gallery input[type=search]")?.value');
 await pointer('#od-preview-gallery input[type=search]');
 await cdp('Input.insertText',{text:'abcdef'});
 await waitFor('document.querySelector("#od-preview-gallery input[type=search]")?.value==="abcdef"');
 await pointer('#od-preview-gallery .od-input-action[aria-label="清空搜索"]');
 await waitFor('document.querySelector("#od-preview-gallery input[type=search]")?.value===""');
 report.checks.push('text input and trailing clear action');
 const state=await evalJs('document.querySelector("#od-preview-gallery [data-slot=switch]")?.getAttribute("data-selected")');
 assert.equal(typeof state,'string','Switch exists with React Aria state');
 await pointer('#od-preview-gallery [data-slot=switch]');
 const changed=await evalJs('document.querySelector("#od-preview-gallery [data-slot=switch]")?.getAttribute("data-selected")');
 assert.notEqual(changed,state,'Switch must truly toggle');
 report.checks.push('Switch toggles committed React state');
 await navigate(360,'dark');
 report.checks.push('dark theme source-bound token preview');
 // Exercise the actual production LocaleManager inside the offline React root;
 // its catalog and pack service are the existing preview-isolated adapter.
 await cdp('Page.navigate',{url:pathToFileURL(preview).href+'?tab=tools&width=360&theme=light'});
 await waitFor('document.documentElement.dataset.previewBootScript==="ready" && '+
  '!!document.getElementById("extension-center-language-settings")');
 await pointer('#extension-center-language-settings');
 await waitFor('document.querySelectorAll("#od-locale-global option").length===5 && '+
  '!!document.querySelector("#od-locale-tool-language")');
 const languageState=await evalJs('(()=>({options:[...document.querySelectorAll("#od-locale-tool-language option")].map(x=>x.value),'+
   'current:document.getElementById("od-locale-tool-language")?.value,preview:!!document.querySelector(".od-locale-manager")}))()');
 assert.ok(languageState.preview,'Production LocaleManager never rendered');
 assert.ok(languageState.options.includes('follow'),'Extension language must support following OpenDesk');
 assert.ok(languageState.options.length>=2,'Demo tool must expose valid installed source locale');
 report.checks.push('real LocaleManager renders global five-way and effective tool language Select');
 await pointer('.od-locale-maintenance > summary');
 await waitFor('document.querySelector(".od-locale-maintenance")?.open===true && '+
   '!!document.querySelector("#od-locale-target")');
 const advanced=await evalJs('(()=>({target:document.getElementById("od-locale-target")?.value,'+
   'import:!!document.querySelector(".od-locale-maintenance input[type=file]"),'+
   'languageRows:document.querySelectorAll(".od-locale-resource").length}))()');
 assert.equal(advanced.import,true,'Advanced sheet must present a real file picker');
 report.checks.push('real advanced language sheet and tool-target BCP47 field');
 await key('Escape',27);
 await waitFor('document.querySelector(".od-locale-maintenance")?.open===false');
 report.checks.push('advanced sheet Escape returns to daily languages');
 await key('Escape',27);
 await waitFor('!document.querySelector(".od-locale-manager")');
 report.checks.push('final Escape dismisses trusted Host dialog');
 assert.deepEqual(report.exceptions,[],'React runtime raised unexpected exceptions');
 report.result='PASS';
 await writeFile(join(artifactDir,'gallery-result.json'),JSON.stringify(report,null,2)+'\n');
 console.log('EXTENSION_UI_R21_GALLERY_CHROMIUM_PASS '+JSON.stringify(report));
}catch(error){
 report.result='FAIL';report.error=String(error?.stack||error);
 try{const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(join(artifactDir,'gallery-failure.png'),Buffer.from(screenshot.data,'base64'));}
 catch{}
 await writeFile(join(artifactDir,'gallery-result.json'),JSON.stringify(report,null,2)+'\n');
 console.error('EXTENSION_UI_R21_GALLERY_CHROMIUM_FAIL '+JSON.stringify(report));
 throw error;
}finally{
 try{socket?.close();}catch{}
 chrome?.kill('SIGTERM');
 if(exit)await exit;
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
