#!/usr/bin/env node
// R3.0.4 React browser preview regression. MOCK only, NOT SOURCE BOUND / NOT NATIVE.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const out=resolve(process.argv[2]||'artifacts/preview-chrome-r304');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'bm-r304-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),contexts=new Map(),network=[],exceptions=[];
let socket,seq=0;
function cdp(method,params={},sessionId=null){
  return new Promise((ok,fail)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},25000);
    pending.set(id,{ok(value){clearTimeout(timer);ok(value)},fail(error){clearTimeout(timer);fail(error)}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<110;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break}catch{}
    await delay(100);
  }
  assert.ok(port,'Chrome debugging port must be accessible');
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(item=>item.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome page target');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data),session=row.sessionId||null;
    if(row.id&&pending.has(row.id)){
      const done=pending.get(row.id);pending.delete(row.id);
      if(row.error)done.fail(Error(row.error.message));else done.ok(row.result);
    }
    if(row.method==='Runtime.executionContextCreated'){
      const ctx=row.params.context;
      contexts.set((session||'root')+':'+ctx.id,{contextId:ctx.id,session});
    }
    if(row.method==='Runtime.executionContextDestroyed')
      contexts.delete((session||'root')+':'+row.params.executionContextId);
    if(row.method==='Runtime.executionContextsCleared')
      for(const key of contexts.keys())if(key.startsWith((session||'root')+':'))contexts.delete(key);
    if(row.method==='Target.attachedToTarget'){
      const nested=row.params.sessionId;
      void Promise.all([cdp('Runtime.enable',{},nested),cdp('Network.enable',{},nested)])
        .catch(error=>exceptions.push('Nested context '+error.message));
    }
    if(row.method==='Network.requestWillBeSent'&&/^https?:/i.test(row.params.request?.url||''))
      network.push(row.params.request.url);
    if(row.method==='Runtime.exceptionThrown')
      exceptions.push(row.params.exceptionDetails?.exception?.description||
        row.params.exceptionDetails?.text||'Script exception');
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
async function evaluate(expr,ctx){
  const response=await cdp('Runtime.evaluate',{expression:expr,
    contextId:ctx.contextId,returnByValue:true,awaitPromise:true},ctx.session);
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||
    response.exceptionDetails.text||'Sandbox evaluation exception');
  return response.result?.value;
}

async function waitFor(fn,label,limit=120){
 for(let i=0;i<limit;i++){try{const value=await fn();if(value)return value}catch{}await delay(85)}
 throw Error('Timeout: '+label);
}
async function findReactFrame(){
 return waitFor(async()=>{
  for(const ctx of [...contexts.values()]){
   try{if(await evaluate("Boolean(globalThis.__BookmarkReactPreview?.version==='R3.0.4' && document.querySelector('.bm-tree-row'))",ctx))return ctx}catch{}
  }
  return null;
 },'React iframe mounted',150);
}
async function outerContext(){
 return waitFor(async()=>{
  for(const ctx of [...contexts.values()]){
   try{if(await evaluate("Boolean(document.getElementById('od-preview-bookmark-lab') && document.getElementById('opendesk-preview-frame'))",ctx))return ctx}catch{}
  }
  return null;
 },'outer Side Panel shell');
}
const expr=code=>'(async()=>{'+code+'})()';
async function invoke(ctx,code){return evaluate(expr(code),ctx)}
async function until(ctx,code,label,limit=110){return waitFor(()=>invoke(ctx,'return Boolean('+code+')'),label,limit)}
async function screenshot(name,clip){
 const reply=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});
 await writeFile(join(out,name),Buffer.from(reply.data,'base64'));
}
async function setInput(ctx,id,value){
 return invoke(ctx,
  "const el=document.getElementById("+JSON.stringify(id)+");if(!el)throw Error('Missing input '+"
  +JSON.stringify(id)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,"
  +JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));return el.value;");
}

const previewPath=resolve('examples/sidebar-tools/bookmark-manager/preview/index.html');
const html=await readFile(previewPath,'utf8');
assert.match(html,/sandbox="allow-scripts"/);
assert.doesNotMatch(html,/sandbox="[^"]*allow-same-origin/);
const manifest=JSON.parse(html.match(/id="opendesk-preview-manifest">([^<]+)<\/script>/)[1]);
assert.equal(manifest.reactRuntime,true);
const report=[];
let browserInfo={};
async function click(ctx,sel){
 const q=JSON.stringify(sel);
 return invoke(ctx,"const n=document.querySelector("+q+");if(!n)throw Error('no '+ "+q+");n.click();return true");
}
async function openMenu(ctx,id){
 await click(ctx,'[data-node-id="'+id+'"] .bm-row-more');
 await until(ctx,"!!document.querySelector('[data-testid=\"action-menu\"]')",'menu '+id);
}
async function choose(ctx,index){
 return invoke(ctx,"const el=document.querySelectorAll('[data-testid=\"action-menu\"] [role=\"menuitem\"]')["+index+"];if(!el)throw Error('missing menu choice');el.click();return true");
}
const gone=async(ctx,sel,label)=>until(ctx,"!document.querySelector("+JSON.stringify(sel)+")",label);
try{
 await connect();
 browserInfo=await cdp('Browser.getVersion');
 for(const width of [360,400,960]){
  await cdp('Emulation.setDeviceMetricsOverride',{width:1350,height:1100,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:pathToFileURL(previewPath).href+'?width='+width});
  const ctx=await findReactFrame();
  await outerContext();
  await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,159')",'initial data '+width);
  const originalHeight=await invoke(ctx,"return Math.round(document.querySelector('.bm-tree-scroll').getBoundingClientRect().height)");
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-inspector')===null"),true);
  // A coarse-pointer device must not show a noisy ellipsis on every idle row.
  const idleMenus=await invoke(ctx,"return [...document.querySelectorAll('.bm-tree-row:not(.is-selected) .bm-row-more')].slice(3,9).map(el=>Number(getComputedStyle(el).opacity))");
  assert.ok(idleMenus.length>0&&idleMenus.every(value=>value<0.1),'idle rows hide action controls until selection, hover or keyboard focus');

  assert.equal(await invoke(ctx,"return document.querySelectorAll('.bm-topbar .bm-create-actions .bm-icon-btn[aria-label]').length"),2,'accessible icon-only create controls '+width);
  assert.equal(await invoke(ctx,"return !document.querySelector('.bm-tools .bm-create-actions')"),true,'search-only toolbar '+width);
  await screenshot('bookmark-r304-'+width+'-list.png');
  // R3.0.4 accessibility regression: real tree key events and virtual offscreen scrolling.
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.focus();t.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant')==='bm-treeitem-2651'",'End reaches last visible row '+width);
  assert.equal(await invoke(ctx,"return !!document.getElementById(document.querySelector('[role=tree]').getAttribute('aria-activedescendant'))"),true,'End active node mounted');
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));return true");
  await until(ctx,"document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant')==='bm-treeitem-1'",'Home reaches first row '+width);
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.scrollTop=t.scrollHeight;t.dispatchEvent(new Event('scroll',{bubbles:true}));return true");
  await until(ctx,"!!document.getElementById(document.querySelector('[role=tree]')?.getAttribute('aria-activedescendant'))",'offscreen scroll retains real active-descendant '+width);
  assert.ok(await invoke(ctx,"return document.querySelectorAll('.bm-tree-row').length<90"),'virtual DOM bounded at '+width);
  assert.equal(await invoke(ctx,"const a=document.querySelector('[role=treeitem]');return Boolean(a?.getAttribute('aria-posinset')&&a?.getAttribute('aria-setsize'))"),true,'treeitem positional metadata');
  await screenshot('bookmark-r304-'+width+'-keyboard.png');
  await invoke(ctx,"const t=document.querySelector('[data-testid=\"bookmark-tree\"]');t.scrollTop=0;t.dispatchEvent(new Event('scroll',{bubbles:true}));return true");
  await until(ctx,"!!document.querySelector('[data-node-id=\"100\"]')",'restore tree position '+width);
  await click(ctx,'[data-node-id="100"]');
  await until(ctx,"!!document.querySelector('[data-testid=\"bookmark-preview\"]')",'one click preview '+width);
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-sheet\"]')"),false,'readonly is nonmodal');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-preview\"]')?.getAttribute('aria-modal')"),null,'non-modal aria');
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-detail-title')?.textContent.includes('OpenDesk 产品资料')"),true,'one click shows correct bookmark');
  assert.equal(await invoke(ctx,"return Math.round(document.querySelector('.bm-tree-scroll').getBoundingClientRect().height)"),originalHeight,'preview does not reflow list');
  await screenshot('bookmark-r304-'+width+'-preview.png');
  const five=await invoke(ctx,"return [...document.querySelectorAll('.bm-tree-row')].slice(0,5).map(x=>x.dataset.nodeId)");
  assert.equal(five.length,5);
  for(const id of five){
   await click(ctx,'[data-node-id="'+id+'"] .bm-node-title');
   assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-preview\"] .bm-detail-title span')?.textContent"),await invoke(ctx,"return document.querySelector('[data-node-id=\"'+id+'\"] .bm-node-title')?.textContent"),'five clicks switch five previews '+id);
  }
  if(width===400)await screenshot('bookmark-r304-400-switch.png');
  await click(ctx,'[data-node-id="10"] .bm-node-title');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-preview\"] .bm-detail-title span')?.textContent"),await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"] .bm-node-title')?.textContent"),'folder body preview');
  const expandedBefore=await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"] .bm-disclosure')?.getAttribute('aria-expanded')");
  await click(ctx,'[data-node-id="10"] .bm-disclosure');
  assert.notEqual(await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"] .bm-disclosure')?.getAttribute('aria-expanded')"),expandedBefore,'disclosure solely toggles');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-preview\"] .bm-detail-title span')?.textContent"),await invoke(ctx,"return document.querySelector('[data-node-id=\"10\"] .bm-node-title')?.textContent"),'disclosure did not select another row');
  await click(ctx,'[data-node-id="10"] .bm-disclosure');
  if(width===400)await screenshot('bookmark-r304-400-folder.png');
  await click(ctx,'[data-node-id="100"] .bm-node-title');
  if(width===960){
   assert.equal(await invoke(ctx,"const a=document.querySelector('.bm-explorer').getBoundingClientRect(),b=document.querySelector('.bm-preview-pane').getBoundingClientRect();return b.left>=a.right-1"),true,'wide right-hand details');
   await screenshot('bookmark-r304-960-split.png');
  }
  assert.equal(await invoke(ctx,"return document.documentElement.scrollWidth<=innerWidth+1"),true,'no horizontal overflow');
  const offset=await invoke(ctx,"return document.querySelector('.bm-tree-scroll').scrollTop");
  await click(ctx,'.bm-preview-close');
  await gone(ctx,'[data-testid="bookmark-preview"]','close readonly details');
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-tree-scroll').scrollTop"),offset,'close does not jump scroll');
  await openMenu(ctx,'100');
  await choose(ctx,0);
  await until(ctx,"!!document.querySelector('[data-testid=\"bookmark-preview\"]')",'menu view reuses nonmodal preview');
  await click(ctx,'[data-testid="bookmark-preview"] [aria-label="编辑"]');
  await until(ctx,"!!document.getElementById('bm-edit-url')",'preview enters existing editor');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-sheet\"]')"),true,'editor stays a modal Sheet');
  await screenshot('bookmark-r304-'+width+'-preview-edit.png');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','preview edit cancel');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-preview\"]')"),true,'cancel restores readonly details');
  await openMenu(ctx,'100');
  await choose(ctx,1);
  await until(ctx,"!!document.getElementById('bm-edit-url')",'edit from row menu');
  await setInput(ctx,'bm-edit-name','草稿取消就退出');
  await screenshot('bookmark-r304-'+width+'-edit.png');
  assert.equal(await invoke(ctx,"return Math.round(document.querySelector('.bm-tree-scroll').getBoundingClientRect().height)"),originalHeight,'edit overlay no tree reflow');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel directly');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"confirm-dialog\"]')"),false,'no unsaved prompt');
  // Dirty draft: explicit Cancel is immediate, X requires keep/discard confirmation.
  await openMenu(ctx,'100');
  await choose(ctx,1);
  await until(ctx,"!!document.getElementById('bm-edit-name')",'dirty X editing '+width);
  await setInput(ctx,'bm-edit-name','离开需要确认');
  await click(ctx,'.bm-sheet-close');
  await until(ctx,"!!document.querySelector('[data-testid=\\\"confirm-dialog\\\"]')",'dirty X confirmation '+width);
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\\\"confirm-dialog\\\"] button')?.textContent"),'继续编辑');
  await click(ctx,'[data-testid="confirm-dialog"] button:first-child');
  await gone(ctx,'[data-testid="confirm-dialog"]','continue editing');
  assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name')?.value"),'离开需要确认');
  await click(ctx,'.bm-sheet-close');
  await click(ctx,'[data-testid="confirm-dialog"] button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','explicitly discard');
  await setInput(ctx,'bm-search','模拟书签 2152');
  await until(ctx,"!!document.querySelector('[data-node-id=\"2651\"]')",'last tree node search');
  await click(ctx,'[data-node-id="2651"] .bm-node-title');
  await until(ctx,"document.querySelector('[data-testid=\"bookmark-preview\"] .bm-detail-title span')?.textContent.includes('模拟书签 2152')",'one click search result');
  await openMenu(ctx,'2651');
  await choose(ctx,1);
  await until(ctx,"!!document.getElementById('bm-edit-url')",'edit searched');
  await setInput(ctx,'bm-edit-name','模拟书签 2152 改名');
  await setInput(ctx,'bm-edit-url','https://example.org/react-edited');
  await click(ctx,'[data-testid="bookmark-save"]');
  await gone(ctx,'[data-testid="bookmark-sheet"]','save and verify');
  assert.equal(await invoke(ctx,"return !!document.querySelector('[data-testid=\"bookmark-preview\"]')"),true,'save readback returns readonly');
  assert.equal(await invoke(ctx,"return !!document.querySelector('.bm-notice')"),true,'readback success status');
  await setInput(ctx,'bm-search','');
  await until(ctx,"!!document.querySelector('[data-node-id=\"100\"]')",'clear search');
  await click(ctx,'[data-node-id="10"]');
  await click(ctx,'.bm-create-actions button:first-child');
  await until(ctx,"!!document.getElementById('bm-edit-url')",'new bookmark type');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel empty create');
  await click(ctx,'.bm-create-actions button:nth-child(2)');
  await until(ctx,"!!document.querySelector('[data-testid=\"bookmark-editor\"]')",'new folder');
  assert.equal(await invoke(ctx,"return !document.getElementById('bm-edit-url')"),true);
  await setInput(ctx,'bm-edit-name','脏草稿无需确认');
  await click(ctx,'.bm-editor-actions button:last-child');
  await gone(ctx,'[data-testid="bookmark-sheet"]','cancel dirty create');
  assert.equal(await invoke(ctx,"return !document.querySelector('[data-testid=\"confirm-dialog\"]')"),true);
  await click(ctx,'[data-node-id="10"]');
  await openMenu(ctx,'100');
  assert.equal(await invoke(ctx,"return document.querySelector('[data-node-id=\"100\"]')?.getAttribute('aria-selected')"),'true','menu and target match');
  await choose(ctx,3);
  await until(ctx,"!!document.querySelector('[data-testid=\"confirm-dialog\"]')",'delete dialog');
  const labels=await invoke(ctx,"const d=document.querySelector('[data-testid=\"confirm-dialog\"]');return [d.querySelector('button').textContent,d.querySelector('button:last-child').textContent,d.textContent]");
  assert.equal(labels[0],'取消');
  assert.equal(labels[1],'删除书签');
  assert.match(labels[2],/OpenDesk 产品资料/);
  await screenshot('bookmark-r304-'+width+'-delete.png');
  await click(ctx,'[data-testid="confirm-dialog"] button:first-child');
  await gone(ctx,'[data-testid="confirm-dialog"]','cancel delete');
  assert.equal(await invoke(ctx,"return document.activeElement!==document.body"),true,'focus restored after delete');
  await openMenu(ctx,'100');
  await invoke(ctx,"document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true");
  await gone(ctx,'[data-testid="action-menu"]','Escape menu');
  if(width===400){
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('extra-folders');return true");
   await click(ctx,'button[aria-label="刷新书签"]');
   await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,289')",'130 extra folders');
   await openMenu(ctx,'100');
   await choose(ctx,1);
   await until(ctx,"!!document.getElementById('bm-edit-name')",'edit before folder picker');
   await click(ctx,'.bm-parent-line .bm-text-button');
   await until(ctx,"!!document.getElementById('bm-folder-search')",'folder picker open');
   await setInput(ctx,'bm-folder-search','性能文件夹 0130');
   await until(ctx,"document.querySelectorAll('.bm-picker-item').length===1",'130 folder query');
   await screenshot('bookmark-r304-400-folder-picker.png');
   await click(ctx,'.bm-picker-item');
   await click(ctx,'.bm-editor-actions button:last-child');
   await gone(ctx,'[data-testid="bookmark-sheet"]','cancel pending move without warning');
   await openMenu(ctx,'100');
   await choose(ctx,1);
   await until(ctx,"!!document.getElementById('bm-edit-name')",'failure edit');
   await setInput(ctx,'bm-edit-name','失败后保留输入');
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('write-fail');return true");
   await click(ctx,'[data-testid="bookmark-save"]');
   await until(ctx,"!!document.querySelector('.bm-sheet-error')",'inline error');
   assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name').value"),'失败后保留输入');
   await screenshot('bookmark-r304-400-failure.png');
   await click(ctx,'.bm-editor-actions button:last-child');
   await gone(ctx,'[data-testid="bookmark-sheet"]','cancel failed draft');
  }
  report.push({width,treeHeight:originalHeight,noPersistentInspector:true,passed:['one-click-preview','five-click-five-previews','folder-disclosure','nonmodal-preview','view-detail-on-demand','direct-cancel','edit-no-tree-jump','save-readback','search-2159','create-types','delete-confirm-copy-and-target','focus-restore','menu-Escape',...(width===400?['folder-130','failure-preserve']:[])]});
 }
 assert.deepEqual(network,[],'no network requests');
 assert.deepEqual(exceptions,[],'no browser JS exceptions');
 const crypto=await import('node:crypto');
 await writeFile(join(out,'bookmark-r304-interaction.json'),JSON.stringify({kind:'CHROMIUM_REACT_MOCK',browser:browserInfo.product,manifest,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),report},null,2));
 console.log('R304_REACT_CHROMIUM_PASS '+JSON.stringify(report));
}catch(e){
 await writeFile(join(out,'bookmark-r304-failure.txt'),String(e?.stack||e));
 console.error(e);process.exitCode=1;
}finally{
 try{socket?.close()}catch{}
 try{chrome.kill('SIGTERM')}catch{}
 await delay(180);
 try{await rm(profile,{recursive:true,force:true})}catch{}
}
