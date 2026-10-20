#!/usr/bin/env node
// Authentic Chromium pointer/layout smoke for source-bound React preview only.
// NOT installed MV3 Chrome, Host authority, or native macOS evidence.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const chromeBin=process.env.CHROME_BIN||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chromeBin&&existsSync(chromeBin),'Real Chromium binary is required; set CHROME_BIN to its executable');
const preview=resolve('prototypes/sidebar/react-preview/index.html');
assert.ok(existsSync(preview),'Run the source-bound preview builder first');
const artifacts=resolve(process.env.ARTIFACTS_DIR||'artifacts/extension-center-r541/preview');
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'extension-center-r53-'));
const viewport={width:480,height:950,deviceScaleFactor:1,mobile:false};
const previewBytes=await readFile(preview);
const evidence={evidence:'SOURCE_BOUND_UI_PREVIEW_ONLY',realHost:false,realPermission:false,
  installedChrome:'NOT_TESTED',nativeMac:'NOT_TESTED',
  chromeBin,chromeRealPath:await realpath(chromeBin),
  previewSha256:createHash('sha256').update(previewBytes).digest('hex'),
  inputSha256:previewBytes.toString().match(/name="od-source-input-sha256" content="([a-f0-9]+)"/)?.[1],
  viewport:{width:viewport.width,height:viewport.height}};
const pause=ms=>new Promise(done=>setTimeout(done,ms));
let chrome,chromeClosed,launchError,socket,sequence=0;
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
  // Reveal CSS hover actions using real pointer motion before the hit test.
  const point=await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!n)return null;n.scrollIntoView({block:"center"});const r=n.getBoundingClientRect();'+
    'return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  assert.ok(point,'Missing pointer target '+selector);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await pause(180);
  const box=await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!n)return null;const r=n.getBoundingClientRect();'+
    'const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);'+
    'return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,'+
    'hit:h===n||n.contains(h),hidden:Boolean(n.closest("[hidden]"))}})()');
  assert.ok(box&&box.w>0&&box.h>0&&box.hit&&!box.hidden,'Pointer cannot hit '+selector+' '+JSON.stringify(box));
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
  chromeClosed=new Promise(done=>chrome.once('close',done));
  chrome.once('error',error=>{launchError=error;});
  let stderr='';
  chrome.stderr.on('data',part=>{stderr=(stderr+part).slice(-3000);});
  let port=0;
  for(let i=0;i<220;i++){
    if(launchError)throw launchError;
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
  evidence.browser=await cdp('Browser.getVersion');
  await cdp('Emulation.setDeviceMetricsOverride',viewport);
  await visit('');
  assert.equal(await evaluate('document.documentElement.dataset.opendeskTab'),'tools',
    'The standalone HTML file must open the complete Extensions tab by default');
  await visit('?tab=tools');
  assert.equal(await evaluate('document.querySelector("#workbench-tools #trusted-history-panel")'),null,
    'History must not mount in Extensions');
  assert.equal(await evaluate('document.getElementById("extension-center-status").hidden'),true,
    'Empty status must not occupy footer');
  assert.equal(await evaluate('document.getElementById("workbench-debug").hidden'),true,
    'Debug is not visible from Extensions');
  {
    const dimension=await evaluate('({scroll:document.documentElement.scrollWidth,'+
      'client:document.documentElement.clientWidth,rows:document.querySelectorAll("#extension-center-list > li").length})');
    assert.ok(dimension.scroll<=dimension.client+2,
      'Horizontal overflow: '+JSON.stringify(dimension));
    assert.equal(dimension.rows,2,'Installed preview rows must render');
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifacts,'extensions.png'),Buffer.from(shot.data,'base64'));
  }
  // Real Chromium preview: initial hint moves to the last hovered row and remains on pointer exit.
  const pinned=()=>evaluate('document.querySelector("#extension-center-list .ec-row--action-visible")?.dataset.extensionId');
  assert.equal(await pinned(),'app:demo-reading','first installed item shows the initial More affordance');
  const hoverRow=async key=>{
    const box=await evaluate('(()=>{const el=document.querySelector('+JSON.stringify('[data-extension-id="'+key+'"]')+
      ');const rect=el.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()');
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y});
    await waitUntil('document.querySelector("#extension-center-list .ec-row--action-visible")?.dataset.extensionId==='+JSON.stringify(key));
  };
  await hoverRow('page:demo-markup');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:4,y:4});
  assert.equal(await pinned(),'page:demo-markup','last hovered row stays pinned after mouse exit');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list .ec-row--action-visible").length'),1,
    'only one desktop list row retains its menu');
  await hoverRow('app:demo-reading');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:4,y:4});
  assert.equal(await pinned(),'app:demo-reading','hovering the former first row moves the hint back');
  const listMenu='[data-extension-key="app:demo-reading"][data-extension-action="more"]';
  const chooseListUninstall=async key=>{
    await click('[data-extension-key="'+key+'"][data-extension-action="more"]');
    await waitUntil('!!document.querySelector("#extension-center-row-menu [data-ec-context-action=uninstall]")');
    await click('#extension-center-row-menu [data-ec-context-action="uninstall"]');
  };
  await click('[data-extension-key="app:demo-reading"][data-extension-action="main"]');
  await waitUntil('!document.getElementById("extension-center-detail").hidden');
  const iconAction=await evaluate('(()=>{const button=document.querySelector("[data-ec-detail-action=uninstall]");'+
    'return {icon:!!button?.querySelector("svg"),text:button?.textContent?.trim(),title:button?.title,'+
    'label:button?.getAttribute("aria-label"),width:button?.getBoundingClientRect().width}})()');
  assert.equal(iconAction.icon,true,'production React detail uninstall uses shared IconButton');
  assert.equal(iconAction.text,'','detail action no longer displays a long button label');
  assert.equal(iconAction.title,'卸载…');
  assert.ok(iconAction.label?.includes('演示 · 阅读目录'));
  assert.ok(iconAction.width<=44,'detail actions must not reserve wide text-button columns');
  assert.equal(await evaluate('document.getElementById("extension-center-back").getAttribute("aria-label")'),
    '返回扩展列表','Icon back must remain accessible');
  await click('#extension-center-back');
  await waitUntil('!document.getElementById("extension-center-list-view").hidden');
  // The destructive action lives only in the on-demand menu, never on the row.
  assert.equal(await evaluate('document.querySelectorAll("[data-extension-action=uninstall]").length'),
    0,'No installed row exposes a direct delete button');
  await chooseListUninstall('app:demo-reading');
  await waitUntil('!!document.querySelector(".od-uninstall-dialog[aria-modal=true]")');
  assert.equal(await evaluate('document.getElementById("extension-center-detail").hidden'),true,
    'List uninstall must not navigate to detail');
  assert.equal(await evaluate('document.activeElement?.hasAttribute("data-uninstall-cancel")'),
    true,'Uninstall confirmation should first focus Cancel');
  assert.equal(await evaluate('document.querySelectorAll(".od-uninstall-dialog").length'),1,
    'Overflow uninstall opens exactly one modal, centered outside the list');
  assert.match(await evaluate('document.querySelector(".od-uninstall-dialog h2").textContent'),
    /演示 · 阅读/,'The modal identifies the exact selected app');
  {
    const dimensions=await evaluate(`(()=>{
      const panel=document.querySelector('.od-uninstall-dialog');
      const rect=panel.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
        width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth};
    })()`);
    assert.ok(dimensions.left>=-2&&dimensions.right<=dimensions.width+2&&
      dimensions.top>=-2&&dimensions.bottom<=dimensions.height+2&&
      dimensions.scroll<=dimensions.width+2,
      'Uninstall dialog must fit the viewport: '+JSON.stringify(dimensions));
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifacts,'uninstall-dialog.png'),Buffer.from(shot.data,'base64'));
  }
  await click('.od-uninstall-dialog [data-uninstall-cancel]');
  await waitUntil('!document.querySelector(".od-uninstall-dialog")');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list > li").length'),2,
    'Cancel must not remove any installed item');
  assert.equal(await evaluate('document.activeElement?.matches('+JSON.stringify(listMenu)+')'),true,
    'Cancelling restores focus to the reviewed row action');
  await chooseListUninstall('app:demo-reading');
  await click('.od-uninstall-dialog .od-uninstall-confirm');
  await waitUntil('document.querySelectorAll("#extension-center-list > li").length===1');
  assert.equal(await evaluate('document.querySelector("#extension-center-list > li").dataset.extensionId'),
    'page:demo-markup','Only the reviewed App disappears from the in-memory preview');
  assert.match(await evaluate('document.getElementById("extension-center-status").textContent'),
    /仅内存演示/,'Preview success cannot claim any real uninstall');
  await chooseListUninstall('page:demo-markup');
  await waitUntil('!!document.querySelector(".od-uninstall-dialog[aria-modal=true]")');
  assert.match(await evaluate('document.querySelector(".od-uninstall-dialog h2").textContent'),
    /网页内容标注/,'Page modal identifies its own selected identity');
  await click('.od-uninstall-dialog [data-uninstall-cancel]');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list > li").length'),1,
    'Page cancel is also no-op');
  await chooseListUninstall('page:demo-markup');
  await click('.od-uninstall-dialog .od-uninstall-confirm');
  await waitUntil('document.querySelectorAll("#extension-center-list > li").length===0');
  // A fresh isolated preview resets demo data before checking search and import.
  await visit('?tab=tools&reset=uninstall');
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
  await waitUntil('document.activeElement?.id==="sidebar-tool-file"');
  // Layout-only DOM stress: 100 rows are NOT 100 installed records. The
  // production React shell still owns the real two-row preview dataset.
  const countWithLongList=await evaluate(`(()=>{
    const list=document.getElementById('extension-center-list');
    const sample=list.querySelector('li');
    if(!sample)return 0;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<98;i++){
      const clone=sample.cloneNode(true);
      clone.dataset.extensionId='layout-only-'+i;
      clone.dataset.previewLayoutOnly='true';
      clone.querySelectorAll('button').forEach(button=>button.disabled=true);
      fragment.appendChild(clone);
    }
    list.appendChild(fragment);
    return list.children.length;
  })()`);
  assert.equal(countWithLongList,100,'Importer layout stress requires a long DOM list');
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
  {
    const geometry=await evaluate(`(()=>{
      const panel=document.getElementById('sidebar-tool-import');
      const rect=panel.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
        width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth};
    })()`);
    assert.ok(geometry.left>=-2&&geometry.right<=geometry.width+2&&
      geometry.top>=-2&&geometry.bottom<=geometry.height+2&&
      geometry.overflow<=geometry.width+2,
      'Import drawer overflow: '+JSON.stringify(geometry));
    const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifacts,'import-sheet.png'),Buffer.from(capture.data,'base64'));
  }
  assert.equal(await evaluate(`(()=>{
    const clones=document.querySelectorAll('#extension-center-list > [data-preview-layout-only=true]');
    const count=clones.length;
    clones.forEach(node=>node.remove());
    return count;
  })()`),98,'Remove only the temporary layout rows before React filtering');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list > li").length'),2,
    'The source-owned preview list must be restored after layout inspection');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',
    windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await waitUntil('document.getElementById("sidebar-tool-import").hidden');
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
  Object.assign(evidence,{status:'PASS',listUninstall:'PASS',
    search:'PASS',scopeFilter:'PASS',detail:'PASS',historyPlacement:'PASS',importSheet:'PASS'});
  await writeFile(join(artifacts,'chromium-result.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}catch(error){
  Object.assign(evidence,{status:'FAIL',error:String(error?.stack||error),exceptions});
  try{
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifacts,'failure.png'),Buffer.from(shot.data,'base64'));
    await writeFile(join(artifacts,'failure.html'),await evaluate('document.documentElement.outerHTML'));
  }catch{}
  await writeFile(join(artifacts,'chromium-result.json'),JSON.stringify(evidence,null,2)+'\n');
  throw error;
}finally{
  try{socket?.close();}catch{}
  chrome?.kill('SIGTERM');
  if(chromeClosed)await chromeClosed;
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
