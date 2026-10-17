#!/usr/bin/env node
// SOURCE_BOUND_UI_PREVIEW_CHROMIUM: authentic CDP input, offline only.
// Never interpret fixture state as installed Chrome extension or Host proof.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const chromeBin=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chromeBin,'Linux Chromium required');
const html=resolve('prototypes/sidebar/react-preview/index.html');
assert(existsSync(html),'generate source-bound HTML first');
const profile=await mkdtemp(join(tmpdir(),'r3339-cdp-'));
const artifacts=resolve('artifacts/sidebar-six-react-preview');
await mkdir(artifacts,{recursive:true});
let chrome,socket,port=0,sequence=0;
const pending=new Map(),exceptions=[];
function cdp(method,params={}){
  return new Promise((ok,bad)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);bad(Error('CDP timeout '+method));},15000);
    pending.set(id,{ok:r=>{clearTimeout(timer);ok(r);},
      bad:e=>{clearTimeout(timer);bad(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const value=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw Error('Browser: '+JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function until(expression){
  for(let i=0;i<110;i++){
    try{if(await evaluate(expression))return;}catch{}
    await sleep(80);
  }
  throw Error('Condition not reached: '+expression+'; exceptions='+JSON.stringify(exceptions));
}
async function click(selector){
  const s=JSON.stringify(selector);
  const rect=await evaluate('(()=>{const n=document.querySelector('+s+
    ');if(!n)throw Error("missing element");n.scrollIntoView({block:"center",inline:"nearest"});'+
    'const b=n.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),'+
    'y:Math.round(b.top+b.height/2),w:b.width,h:b.height,hidden:!!n.closest("[hidden]"),'+
    'hit:(()=>{const h=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return h===n||n.contains(h);})()}})()');
  assert(rect.w>0&&rect.h>0&&!rect.hidden&&rect.hit,
    selector+' must be visible and receive native pointer input '+JSON.stringify(rect));
  // Allow the Chromium compositor to apply scroll/hit-test before pressing.
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y,button:'none'});
  await sleep(90);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await sleep(155);
}
async function screenshot(name){
  const result=await cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));
}
try{
  chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--window-size=800,1050',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],
  {stdio:['ignore','ignore','pipe']});
  let stderr='';chrome.stderr.on('data',d=>{stderr=(stderr+d).slice(-6000);});
  for(let i=0;i<280;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+stderr);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}
    catch{}
    await sleep(100);
  }
  assert(port,'CDP not ready '+stderr);
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',bad,{once:true});});
  socket.addEventListener('message',e=>{
    const message=JSON.parse(e.data);
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails?.exception?.description||'Runtime exception');
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')
      exceptions.push('console.error '+message.params.args?.map(x=>x.value||x.description).join(' '));
    if(!pending.has(message.id))return;
    const waiter=pending.get(message.id);pending.delete(message.id);
    message.error?waiter.bad(Error(JSON.stringify(message.error))):waiter.ok(message.result);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('DOM.enable');
  await cdp('Page.navigate',{url:pathToFileURL(html).href});
  await until('document.documentElement.dataset.sidebarPreviewReady==="true"');
  await until('document.querySelector("[data-task-id=preview-task]")?.getAttribute("aria-expanded")==="true"');
  await screenshot('my-expanded-360');
  await click('[data-task-id="preview-task"]');
  await until('document.querySelector("[data-task-id=preview-task]").getAttribute("aria-expanded")==="false"');
  assert.equal(await evaluate('document.getElementById("task-selected-workspace").hidden'),true);
  await screenshot('my-collapsed-360');
  await click('[data-task-id="preview-task"]');
  await until('document.querySelector("[data-task-id=preview-task]").getAttribute("aria-expanded")==="true"');
  await click('[data-task-id="preview-off"]');
  await until('document.querySelector("[data-task-id=preview-off]").getAttribute("aria-expanded")==="true"');
  await click('#task-search-toggle');
  await until('!document.getElementById("task-search-panel").hidden');
  await click('#task-open-catalog');
  await until('!document.getElementById("workbench-discover").hidden');
  await click('#catalog-dev-sidebar-status button');
  await until('!document.querySelector("#workbench-tasks .tasks-surface").hidden');
  await click('#schedule-open');
  await until('!document.getElementById("scheduled-panel").hidden');
  await click('#schedule-create');
  await until('!document.getElementById("schedule-form").hidden');
  await click('#schedule-title');await cdp('Input.insertText',{text:'回归演示计划'});
  await click('#schedule-save');
  await until('!document.getElementById("schedule-save-confirm").hidden');
  await click('#schedule-confirm-yes');
  await until('document.getElementById("schedule-plan-list").textContent.includes("回归演示计划")');
  await screenshot('my-plan-confirmed-360');
  await click('#tab-tools');
  await until('!document.getElementById("workbench-tools").hidden');
  await click('#extension-center-more');
  await until('!document.getElementById("extension-center-menu").hidden');
  await click('#extension-center-import');
  await until('!document.getElementById("sidebar-tool-import").hidden');
  assert.equal(await evaluate('document.getElementById("extension-center-menu").hidden'),true,
    'Import action must close the menu, never obscure review or confirm controls');
  const fixture=join(profile,'demo.opendesk-tool.json');
  await writeFile(fixture,JSON.stringify({format:'opendesk.sidebar-tool.v2',
    id:'preview-import',title:'演示导入工具',version:'1.2.0',
    capabilities:['storage.local'],html:'<main>fixture</main>',css:'',js:''}));
  const root=await cdp('DOM.getDocument',{depth:0});
  const file=await cdp('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#sidebar-tool-file'});
  assert(file.nodeId,'Real source file chooser absent');
  await cdp('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[fixture]});
  await until('!document.getElementById("sidebar-tool-preview").hidden');
  assert.equal(await evaluate('document.getElementById("sidebar-tool-install").disabled'),false);
  await screenshot('extension-import-review-360');
  await click('#sidebar-tool-install');
  await until('!!document.querySelector("[data-extension-id=\\"app:preview-import\\"]")');
  assert.equal(await evaluate('document.querySelectorAll("[data-extension-id=\\"app:preview-import\\"]").length'),1);
  await click('[data-extension-id="app:preview-import"] .ec-row-main');
  await sleep(220);
  const rowState=await evaluate('(()=>({detailHidden:document.getElementById("extension-center-detail").hidden,'+
    'listHidden:document.getElementById("extension-center-list-view").hidden,'+
    'menuHidden:document.getElementById("extension-center-menu").hidden,'+
    'rowCount:document.querySelectorAll("[data-extension-id=\\\"app:preview-import\\\"]").length,'+
    'focused:document.activeElement?.outerHTML?.slice(0,250)}))()');
  assert.equal(rowState.detailHidden,false,
    'Trusted pointer should open extension details: '+JSON.stringify(rowState));
  assert((await evaluate('document.getElementById("extension-center-detail-body").textContent')).includes('UI_PREVIEW_ONLY'));
  await click('[data-ec-detail-action="uninstall"]');
  await until('!document.getElementById("sidebar-tool-action-review").hidden');
  await screenshot('extension-uninstall-review-360');
  await click('#sidebar-tool-action-continue');
  await until('!document.getElementById("extension-center-detail").hidden');
  assert.equal(await evaluate('document.querySelectorAll("[data-extension-id=\\"app:preview-import\\"]").length'),1,
    'Uninstalled fixture remains only in available list');
  assert.deepEqual(exceptions,[],'Browser errors');
  console.log(JSON.stringify({kind:'SOURCE_BOUND_UI_PREVIEW_CHROMIUM',status:'PASS',
    checks:['real clicks: task collapse/reopen/switch','search','catalog','schedule form',
      'schedule memory review','extension file choose','import review','in-memory install',
      'uninstall review','UI_PREVIEW_ONLY maintained'],nativeChrome:'NOT_TESTED'}));
}finally{
  try{socket?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  await sleep(140);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
