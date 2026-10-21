#!/usr/bin/env node
// Actual Chromium input over the source-bound preview. This is not installed Host proof.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const chromeBin=process.env.CHROME_BIN||['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert(chromeBin,'Chromium required');
const artifacts=resolve('artifacts/sidebar-navigation-r15/preview'),profile=await mkdtemp(join(tmpdir(),'od-clipper-r15-'));
await mkdir(artifacts,{recursive:true});
const browser=spawn(chromeBin,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
let client,host,child;const errors=[],checks=[],screenshots=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ev=(expression,frame=false)=>evaluate(client,expression,frame?child:host);
const command=(method,params={},frame=false)=>client.send(method,params,frame?child:host);
async function until(expression,frame=false){for(let i=0;i<100;i++){try{if(await ev(expression,frame))return;}catch{}await sleep(70);}throw Error('Condition '+expression+' '+JSON.stringify(errors));}
async function click(selector,frame=false,touch=false){
 const s=JSON.stringify(selector);await until('(()=>{const e=document.querySelector('+s+');return !!e&&!e.disabled&&!e.closest("[hidden]")&&!!e.getClientRects().length;})()',frame);
 await ev('document.querySelector('+s+').scrollIntoView({block:"center"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))',frame);
 await until('(()=>{const e=document.querySelector('+s+'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit);})()',frame);
 const point=await ev('(()=>{const e=document.querySelector('+s+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',frame);
 if(touch){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]},frame);await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},frame);}
 else for(const type of ['mouseMoved','mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1},frame);
}
async function type(selector,text,frame=false){await click(selector,frame);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:process.platform==='darwin'?4:2,commands:['selectAll']},frame);await command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:process.platform==='darwin'?4:2},frame);await command('Input.insertText',{text},frame);}
async function title(value){await until('document.getElementById("sidebar-tool-title").textContent==='+JSON.stringify(value));}
async function shot(name){const r=await command('Page.captureScreenshot',{format:'png'});const path=join(artifacts,name+'.png');await writeFile(path,Buffer.from(r.data,'base64'));screenshots.push(path);}
async function attachFrame(){for(let i=0;i<90;i++){const list=(await client.send('Target.getTargets')).targetInfos;const frame=list.find(x=>x.type==='iframe');if(frame){child=(await client.send('Target.attachToTarget',{targetId:frame.targetId,flatten:true})).sessionId;await command('Runtime.enable',{},true);return;}await sleep(80);}throw Error('Sandbox target missing');}
async function control(values){await ev('(()=>{const f=document.querySelector("#sidebar-tool-frame iframe"),instance=f.srcdoc.match(/data-preview-instance="([^"]+)/)[1];f.contentWindow.postMessage({...'+JSON.stringify(values)+',kind:"control",protocol:"opendesk.clipper.preview.v1",toolId:"web-markdown-clipper",instance},"*");})()');}
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}await sleep(100);}
 assert(port,'Chromium CDP unavailable');const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
 client=await connect(version.webSocketDebuggerUrl,{onEvent:event=>{if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails?.exception?.description||event.params.exceptionDetails?.text);}});
 const {targetId}=await client.send('Target.createTarget',{url:pathToFileURL(resolve('prototypes/sidebar/react-preview/index.html')).href+'?tab=tools&tool=web-markdown-clipper'});
 host=(await client.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 await command('Runtime.enable');await command('Page.enable');await until('document.documentElement.dataset.previewBootScript==="ready"');await attachFrame();await until('document.querySelectorAll("#clip-recent-list .clip-note-card").length===4',true);
 assert.equal(await ev('document.querySelector("#sidebar-tool-frame iframe").sandbox.value'),'allow-scripts');
 assert.equal(await ev('document.querySelector(".clip").classList.contains("clip-hosted")',true),true);checks.push('single formal React ToolHost / sandboxed exact sources');
 await click('#clip-recent-list .clip-note-open',true);await title('摘录详情');
 await ev('globalThis.__previewFrame=document.querySelector("iframe")');await click('#sidebar-tool-settings-open');await until('!document.getElementById("sidebar-tool-settings-view").hidden');await click('#sidebar-tool-back');await title('摘录详情');assert.equal(await ev('globalThis.__previewFrame===document.querySelector("iframe")'),true);checks.push('settings/back retains identical iframe and reader');
 await click('#sidebar-tool-primary-action');await title('编辑摘录');await type('#clip-note-body','R15 preview edited body',true);await click('#sidebar-tool-back');await until('!document.getElementById("clip-note-unsaved").hidden',true);await click('#clip-note-continue',true);
 await control({latencyMs:400});await click('#sidebar-tool-primary-action');await until('document.getElementById("sidebar-tool-back").disabled');await shot('busy-save');await title('摘录详情');assert.equal(await ev('document.getElementById("clip-note-read-body").textContent',true),'R15 preview edited body');checks.push('dirty confirmation / continue / busy blocks back / save returns updated reader');await control({latencyMs:0});
 await click('#sidebar-tool-back');await title('网页剪藏');await click('#clip-view-all',true);await title('我的摘录');await type('#clip-search','Markdown',true);await click('#clip-note-list .clip-note-open',true);await title('摘录详情');await click('#sidebar-tool-back');await title('我的摘录');assert.equal(await ev('document.getElementById("clip-search").value',true),'Markdown');checks.push('debounced search/detail interleave and search restoration');
 await click('#sidebar-tool-primary-action');await title('新建便签');await type('#clip-note-body','R15 new preview note',true);await click('#sidebar-tool-primary-action');await title('我的摘录');await type('#clip-search','R15 new preview note',true);await until('document.querySelectorAll("#clip-note-list .clip-note-card").length===1',true);await click('#clip-note-list .clip-note-open',true);await title('摘录详情');await click('#clip-note-read-remove',true);await until('!!document.querySelector(".clip-remove-confirm")',true);await shot('delete-confirmation');await click('.clip-remove-confirm button:not(.confirm-danger)',true);await title('摘录详情');await click('#clip-note-read-remove',true);await click('.clip-remove-confirm .confirm-danger',true);await title('我的摘录');await until('document.querySelectorAll("#clip-note-list .clip-note-card").length===0',true);checks.push('new/save/reader/delete cancel/confirm with original business controller');
 await type('#clip-search','',true);
 const cases=[];
 for(const theme of ['light','dark'])for(const width of [320,360,400,440]){
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]},true);
   await command('Emulation.setDeviceMetricsOverride',{width:width+24,height:1060,deviceScaleFactor:1,mobile:false});await ev('document.querySelector(".od-sidebar-preview-stage").style.width="'+width+'px"');
   await until('innerWidth==='+width,true);assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth',true),true);
   const colors=await ev('(()=>{const e=document.querySelector("#clip-search");return {ink:getComputedStyle(e).color,paper:getComputedStyle(e).backgroundColor,border:getComputedStyle(e.parentElement).borderColor,theme:matchMedia("(prefers-color-scheme:dark)").matches};})()',true);
   assert.equal(colors.theme,theme==='dark');await shot('library-'+theme+'-'+width);cases.push({theme,width,noHorizontalOverflow:true,colors});
 }
 await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},true);await until('matchMedia("(pointer:coarse)").matches',true);await until('[...document.querySelectorAll(".clip-note-buttons")].every(n=>getComputedStyle(n).opacity==="1")',true);await shot('touch-visible-actions');checks.push('320/360/400/440 light/dark and coarse pointer actions visible');
 await command('Emulation.setTouchEmulationEnabled',{enabled:false},true);
 await click('#sidebar-tool-primary-action');await title('新建便签');await type('#clip-note-body','must fail safely',true);await control({storageCase:'failure'});await click('#sidebar-tool-primary-action');await until('document.getElementById("clip-notes-status").textContent.includes("失败")',true);assert.equal(await ev('document.getElementById("clip-note-body").value',true),'must fail safely');await shot('write-failure-keeps-draft');checks.push('failed save preserves draft and error text');
 await control({storageCase:'normal'});await click('#sidebar-tool-back');await click('#clip-note-discard',true);await title('我的摘录');
 await click('#sidebar-tool-back');await title('网页剪藏');await click('#sidebar-tool-back');await until('!document.getElementById("sidebar-tool-list-view").hidden');
 await click('[data-extension-key="app:web-markdown-clipper"][data-extension-action="main"]');await attachFrame();await title('网页剪藏');checks.push('home back returns installed list; reopen starts clean isolated preview');
 assert.deepEqual(errors,[]);
 const report={status:'PASS',scope:'SOURCE_BOUND_CHROMIUM_PREVIEW_ONLY',browser:version.Browser,installedChrome:'NOT_TESTED_BY_THIS_SCRIPT',native:'NOT_TESTED_BY_THIS_SCRIPT',realBrowserZoom200:'NOT_TESTED_BY_THIS_SCRIPT',checks,cases,screenshots,errors};await writeFile(join(artifacts,'interaction-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,screenshots:screenshots.length}));
}catch(error){
 try{await shot('failure');await writeFile(join(artifacts,'failure.json'),JSON.stringify({message:error.message,
   host:await ev('document.body.innerText'),frame:await ev('document.body.innerText',true)},null,2));}catch{}
 throw error;
}finally{if(client){try{await client.send('Browser.close');}catch{}client.close();}browser.kill();await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});}
