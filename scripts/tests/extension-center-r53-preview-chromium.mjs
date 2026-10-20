#!/usr/bin/env node
// Authentic Chromium pointer/layout smoke for source-bound React preview only.
// NOT installed MV3 Chrome, Host authority, or native macOS evidence.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const chromeBin=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chromeBin,'Real Chromium binary is required');
const preview=resolve('prototypes/sidebar/react-preview/index.html');
assert.ok(existsSync(preview),'Run the source-bound preview builder first');
const artifacts=resolve('artifacts/extension-center-r53');
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'extension-center-r53-'));
const pause=ms=>new Promise(done=>setTimeout(done,ms));
let chrome,socket,sequence=0;
const pending=new Map(),exceptions=[];
function cdp(method,params={}){
  return new Promise((ok,bad)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{pending.delete(id);bad(Error('CDP timeout: '+method));},15000);
    pending.set(id,{
      ok:r=>{clearTimeout(timeout);ok(r);},
      bad:e=>{clearTimeout(timeout);bad(e);}
    });
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error('Chromium JS exception: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitUntil(expression){
  for(let i=0;i<100;i++){
    try{if(await evaluate(expression))return;}catch{}
    await pause(100);
  }
  throw Error('Condition failed: '+expression+'; '+exceptions.join('; '));
}
async function click(selector){
  const box=await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!n)return null;n.scrollIntoView({block:"center"});const r=n.getBoundingClientRect();'+
    'const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);'+
    'return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,'+
    'hit:h===n||n.contains(h),hidden:Boolean(n.closest("[hidden]"))}})()');
  assert.ok(box&&box.w>0&&box.h>0&&box.hit&&!box.hidden,'Pointer cannot hit '+selector+' '+JSON.stringify(box));
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});
}
async function visit(query){
  await cdp('Page.navigate',{url:pathToFileURL(preview).href+query});
  await waitUntil('document.documentElement.dataset.previewBootScript==="ready" && '+
    'document.querySelectorAll("#extension-center-list > li").length===2');
}
try{
  chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--user-data-dir='+profile,
    '--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
  let stderr='';
  chrome.stderr.on('data',part=>{stderr=(stderr+part).slice(-3000);});
  let port=0;
  for(let i=0;i<220;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited: '+stderr);
    try{
      port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      if(port)break;
    }catch{}
    await pause(100);
  }
  assert.ok(port,'Chrome debugging endpoint missing: '+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(item=>item.type==='page');
  assert.ok(target?.webSocketDebuggerUrl,'No Chromium page CDP target');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',bad,{once:true});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params?.exceptionDetails?.exception?.description||'Runtime exception');
    const waiter=pending.get(message.id);
    if(!waiter)return;
    pending.delete(message.id);
    message.error?waiter.bad(Error(JSON.stringify(message.error))):waiter.ok(message.result);
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',
    {width:360,height:950,deviceScaleFactor:1,mobile:false});
  await visit('?tab=tools');
  assert.equal(await evaluate('document.querySelector("#workbench-tools #trusted-history-panel")'),null,
    'History must not mount in Extensions');
  assert.equal(await evaluate('document.getElementById("extension-center-status").hidden'),true,
    'Empty status must not occupy footer');
  assert.equal(await evaluate('document.getElementById("workbench-debug").hidden'),true,
    'Debug is not visible from Extensions');
  for(const width of [320,360,400,440]){
    await cdp('Emulation.setDeviceMetricsOverride',
      {width,height:950,deviceScaleFactor:1,mobile:false});
    const dimension=await evaluate('({scroll:document.documentElement.scrollWidth,'+
      'client:document.documentElement.clientWidth,rows:document.querySelectorAll("#extension-center-list > li").length})');
    assert.ok(dimension.scroll<=dimension.client+2,
      'Horizontal overflow at '+width+': '+JSON.stringify(dimension));
    assert.equal(dimension.rows,2,'Installed preview rows must render');
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifacts,'extensions-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  await click('[data-extension-key="app:demo-reading"][data-extension-action="main"]');
  await waitUntil('!document.getElementById("extension-center-detail").hidden');
  assert.equal(await evaluate('document.getElementById("extension-center-back").getAttribute("aria-label")'),
    '返回扩展列表','Icon back must remain accessible');
  await click('#extension-center-back');
  await waitUntil('!document.getElementById("extension-center-list-view").hidden');
  await click('#extension-center-search');
  await cdp('Input.insertText',{text:'标注'});
  await waitUntil('document.querySelectorAll("#extension-center-list > li").length===1');
  assert.equal(await evaluate('document.querySelector("#extension-center-list > li").dataset.extensionId'),
    'page:demo-markup','Search should filter React rows');
  await visit('?tab=tools&reset=1');
  // The import sheet must remain visible and clickable regardless of list length.
  await click('#extension-center-more');
  await waitUntil('!document.getElementById("extension-center-menu").hidden');
  await click('#extension-center-import');
  await waitUntil('!document.getElementById("sidebar-tool-import").hidden');
  const sheet=await evaluate(`(()=>{
    const panel=document.getElementById('sidebar-tool-import');
    const overlay=document.querySelector('.od-import-overlay');
    const rect=panel.getBoundingClientRect();
    return {role:panel.getAttribute('role'),modal:panel.getAttribute('aria-modal'),
      portal:panel.parentElement===overlay,position:getComputedStyle(overlay).position,
      top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,
      width:innerWidth,height:innerHeight,active:document.activeElement?.id,
      installDisabled:document.getElementById('sidebar-tool-install').disabled};
  })()`);
  assert.equal(sheet.role,'dialog','Importer must be an accessible dialog');
  assert.equal(sheet.modal,'true','Importer must be a modal sheet');
  assert.equal(sheet.portal,true,'Importer must escape the long list');
  assert.equal(sheet.position,'fixed','Importer must use the viewport');
  assert.equal(sheet.active,'sidebar-tool-file','File chooser should receive initial focus');
  assert.ok(sheet.top>=-2&&sheet.bottom<=sheet.height+2&&sheet.right<=sheet.width+2,
    'Import sheet must fit viewport: '+JSON.stringify(sheet));
  assert.equal(sheet.installDisabled,true,'Offline preview must never enable real install');
  for(const width of [320,360,400,440]){
    await cdp('Emulation.setDeviceMetricsOverride',
      {width,height:620,deviceScaleFactor:1,mobile:false});
    const geometry=await evaluate(`(()=>{
      const panel=document.getElementById('sidebar-tool-import');
      const rect=panel.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
        width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth};
    })()`);
    assert.ok(geometry.left>=-2&&geometry.right<=geometry.width+2&&
      geometry.top>=-2&&geometry.bottom<=geometry.height+2&&
      geometry.overflow<=geometry.width+2,
      'Import drawer overflow at '+width+': '+JSON.stringify(geometry));
    const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifacts,'import-sheet-'+width+'.png'),Buffer.from(capture.data,'base64'));
  }
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await waitUntil('document.getElementById("sidebar-tool-import").hidden');
  await cdp('Emulation.setDeviceMetricsOverride',
    {width:360,height:950,deviceScaleFactor:1,mobile:false});
  // The existing extension filters and list remain intact after closing.
  await click('#extension-center-more');
  await waitUntil('!document.getElementById("extension-center-menu").hidden');
  await click('[data-ec-scope="available"]');
  await waitUntil('document.querySelectorAll("#extension-center-list > li").length===1');
  assert.equal(await evaluate('document.querySelector("#extension-center-list > li").dataset.extensionId'),
    'app:demo-import','Available filter should show demo candidate');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await waitUntil('document.getElementById("extension-center-menu").hidden');
  await click('[data-extension-key="app:demo-import"][data-extension-action="main"]');
  await waitUntil('!document.getElementById("extension-center-detail").hidden');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-detail [data-ec-detail-action]").length'),
    0,'Demo detail must not fabricate installation or removal actions');
  assert.deepEqual(exceptions,[],'No React runtime exceptions');
  console.log(JSON.stringify({evidence:'SOURCE_BOUND_UI_PREVIEW_ONLY',realHost:false,
    realPermission:false,installedChrome:'NOT_TESTED',nativeMac:'NOT_TESTED',
    widths:[320,360,400,440],search:'PASS',scopeFilter:'PASS',
    detail:'PASS',historyPlacement:'PASS'}));
}finally{
  try{socket?.close();}catch{}
  chrome?.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true});
}
