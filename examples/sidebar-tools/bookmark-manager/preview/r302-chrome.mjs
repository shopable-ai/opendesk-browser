#!/usr/bin/env node
// R2.9 stored design preview Chromium regression. MOCK only, NOT SOURCE BOUND / NOT NATIVE.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const out=resolve(process.argv[2]||'artifacts/preview-chrome-r302');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'bm-r302-chrome-'));
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
   try{if(await evaluate("Boolean(globalThis.__BookmarkReactPreview?.version==='R3.0.2' && document.querySelector('.bm-tree-row'))",ctx))return ctx}catch{}
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
const original=await readFile(previewPath,'utf8');
assert.match(original,/sandbox="allow-scripts"/);
assert.doesNotMatch(original,/sandbox="[^"]*allow-same-origin/);
assert.match(original,/"reactRuntime":true/);
assert.match(original,/"previewBuild":"R3\.0\.2 REACT COMPONENT CANDIDATE"/);
const manifest=JSON.parse(original.match(/id="opendesk-preview-manifest">([^<]+)<\/script>/)[1]);
assert.equal(manifest.sourceBound,false);
assert.equal(manifest.nativeVerified,false);
let browserInfo={};
const reports=[];
try{
 await connect();
 browserInfo=await cdp('Browser.getVersion');
 for(const width of [360,400,960]){
  await cdp('Emulation.setDeviceMetricsOverride',{width:1350,height:1100,deviceScaleFactor:1,mobile:false});
  const url=pathToFileURL(previewPath).href+'?width='+width;
  await cdp('Page.navigate',{url});
  const ctx=await findReactFrame(),outer=await outerContext();
  await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,159')",'2159 all-tree nodes '+width);
  const state=await invoke(ctx,"const t=document.querySelector('.bm-tree-scroll'),i=document.querySelector('.bm-inspector');const b=t.getBoundingClientRect();return {react:globalThis.__BookmarkReactPreview?.version,all:document.querySelector('.bm-heading span').textContent,frameWidth:innerWidth,treeHeight:Math.round(b.height),inspectorHeight:Math.round(i?.getBoundingClientRect().height||0),visibleRows:[...document.querySelectorAll('.bm-tree-row')].filter(el=>{const r=el.getBoundingClientRect();return r.bottom>b.top&&r.top<b.bottom}).length,scrollWidth:document.documentElement.scrollWidth};");
  assert.equal(state.react,'R3.0.2');
  assert.ok(state.scrollWidth<=state.frameWidth+1,'no horizontal overflow '+width);
  assert.ok(state.visibleRows>=3,'initial tree usable rows '+width);
  await screenshot('bookmark-r302-'+width+'-default.png');
  await setInput(ctx,'bm-search','模拟书签 2152');
  await until(ctx,"Boolean(document.querySelector('[data-node-id=\"2651\"]'))",'search last of 2159 '+width);
  await invoke(ctx,"document.querySelector('[data-node-id=\"2651\"]').click();return true");
  await until(ctx,"document.querySelector('.bm-detail-title')?.textContent.includes('2152')",'selection is read-only '+width);
  assert.equal(await invoke(ctx,"return document.querySelector('[data-testid=\"bookmark-editor\"]')===null"),true);
  await invoke(ctx,"document.querySelector('.bm-inspector-heading .bm-quiet-action').click();return true");
  await until(ctx,"Boolean(document.getElementById('bm-edit-url'))",'edit form URL '+width);
  await setInput(ctx,'bm-edit-name','模拟书签 2152 · React 更新');
  await setInput(ctx,'bm-edit-url','https://example.org/react-2152');
  await invoke(ctx,"globalThis.__bmNativeSubmitCount=0;document.querySelector('form.bm-editor')?.addEventListener('submit',()=>globalThis.__bmNativeSubmitCount++,{capture:true});document.querySelector('[data-testid=\"bookmark-save\"]').click();return true");
  try{
   await until(ctx,"document.querySelector('.bm-detail-title')?.textContent.includes('React 更新')",'confirmed write readback '+width);
  }catch(failure){
   const diag=await invoke(ctx,"return {error:document.querySelector('.bm-error')?.textContent,notice:document.querySelector('.bm-notice')?.textContent,editor:document.querySelector('[data-testid=\"bookmark-editor\"]')?.outerHTML?.slice(0,900),detail:document.querySelector('.bm-detail-title')?.textContent,formName:document.getElementById('bm-edit-name')?.value,formUrl:document.getElementById('bm-edit-url')?.value,valid:document.querySelector('form.bm-editor')?.checkValidity(),fieldValidity:[...document.querySelectorAll('form.bm-editor input')].map(x=>({id:x.id,valid:x.validity.valid,why:x.validationMessage})),buttonDisabled:document.querySelector('[data-testid=\"bookmark-save\"]')?.disabled,saveStage:globalThis.__bmReactSaveStage,submitObserved:globalThis.__bmNativeSubmitCount,selected:document.getElementById('bm-inspector-id')?.textContent,search:document.getElementById('bm-search')?.value};");
   await screenshot('bookmark-r302-'+width+'-save-failure.png');
   throw Error(failure.message+'; DOM_DIAGNOSTIC='+JSON.stringify(diag));
  }
  assert.equal(await invoke(ctx,"return document.querySelector('.bm-detail-url')?.textContent.includes('https://example.org/react-2152')"),true);
  await screenshot('bookmark-r302-'+width+'-detail.png');
  // Keep tree visible in edit mode, and avoid dirty alerts for empty creation.
  await setInput(ctx,'bm-search','');
  await until(ctx,"Boolean(document.querySelector('[data-node-id=\"10\"]'))",'folder tree '+width);
  await invoke(ctx,"document.querySelector('[data-node-id=\"10\"]').click();return true");
  await until(ctx,"document.querySelector('.bm-detail-title')?.textContent.includes('设计资料')",'selected target folder before new bookmark '+width);
  await invoke(ctx,"document.querySelector('.bm-create-actions button').click();return true");
  await until(ctx,"Boolean(document.getElementById('bm-edit-url'))",'new bookmark from selected folder '+width);
  await invoke(ctx,"document.querySelector('.bm-editor-actions button:last-child').click();return true");
  await until(ctx,"!document.querySelector('[data-testid=\"bookmark-editor\"]')",'clean cancel '+width);
  await invoke(ctx,"document.querySelectorAll('.bm-create-actions button')[1].click();return true");
  await until(ctx,"Boolean(document.querySelector('[data-testid=\"bookmark-editor\"]'))",'new folder form '+width);
  assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-url')===null"),true);
  await setInput(ctx,'bm-edit-name','脏草稿需要保护');
  await setInput(ctx,'bm-search','产品研究');
  await until(ctx,"Boolean(document.querySelector('[data-node-id=\"11\"]'))",'virtualized folder 11 search '+width);
  await invoke(ctx,"document.querySelector('[data-node-id=\"11\"]').click();return true");
  await until(ctx,"Boolean(document.querySelector('[data-testid=\"confirm-dialog\"]'))",'dirty guard '+width);
  await invoke(ctx,"document.querySelector('[data-testid=\"confirm-dialog\"] button').click();return true");
  assert.equal(await invoke(ctx,"return Boolean(document.querySelector('[data-testid=\"bookmark-editor\"]'))"),true);
  await invoke(ctx,"document.querySelector('[data-node-id=\"11\"]').click();return true");
  await until(ctx,"Boolean(document.querySelector('[data-testid=\"confirm-dialog\"]'))",'second dirty guard '+width);
  await invoke(ctx,"document.querySelector('[data-testid=\"confirm-dialog\"] button:last-child').click();return true");
  await until(ctx,"!document.querySelector('[data-testid=\"bookmark-editor\"]')",'explicit discard '+width);
  // The list menu must be separate from selecting/editing, Escape restores a usable state.
  await setInput(ctx,'bm-search','');
  await until(ctx,"Boolean(document.querySelector('[data-node-id=\"10\"]'))",'virtualized folder 10 after clear '+width);
  await invoke(ctx,"document.querySelector('[data-node-id=\"10\"] .bm-row-more').click();return true");
  await until(ctx,"Boolean(document.querySelector('[data-testid=\"action-menu\"]'))",'row menu '+width);
  await invoke(ctx,"document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true");
  await until(ctx,"!document.querySelector('[data-testid=\"action-menu\"]')",'Escape menu '+width);
  await screenshot('bookmark-r302-'+width+'-tree.png');
  reports.push({width,...state,passed:['load','search-2159','read-only','save-readback','clean-cancel','dirty-guard','folder-type','menu-escape']});
  if(width===400){
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('extra-folders');document.querySelector('button[aria-label=\"刷新书签\"]').click();return true");
   await until(ctx,"document.querySelector('.bm-heading span')?.textContent.includes('2,289')",'130 more folders');
   await invoke(ctx,"document.querySelector('[data-node-id=\"100\"]').click();return true");
   await until(ctx,"document.querySelector('.bm-detail-title')?.textContent.includes('OpenDesk 产品资料')",'selected item 100');
   await invoke(ctx,"document.querySelector('.bm-inspector-heading .bm-quiet-action').click();return true");
   await until(ctx,"Boolean(document.getElementById('bm-edit-name'))",'edit for folder picker');
   await invoke(ctx,"[...document.querySelectorAll('.bm-parent-line button')][0].click();return true");
   await until(ctx,"Boolean(document.getElementById('bm-folder-search'))",'folder picker visible');
   await setInput(ctx,'bm-folder-search','性能文件夹 0130');
   await until(ctx,"document.querySelectorAll('.bm-picker-item').length===1",'folder picker global search 130');
   await screenshot('bookmark-r302-400-picker.png');
   await invoke(ctx,"document.querySelector('.bm-picker-item').click();return true");
   await until(ctx,"document.querySelector('.bm-parent-path')?.textContent.includes('性能文件夹 0130')",'folder selection committed');
   await invoke(ctx,"document.querySelector('.bm-editor-actions button:last-child').click();return true");
   await until(ctx,"Boolean(document.querySelector('[data-testid=\"confirm-dialog\"]'))",'dirty move cancel guard');
   await invoke(ctx,"document.querySelector('[data-testid=\"confirm-dialog\"] button:last-child').click();return true");
   await invoke(ctx,"document.querySelector('[data-node-id=\"100\"] .bm-row-more').click();return true");
   await until(ctx,"Boolean(document.querySelector('[data-testid=\"action-menu\"]'))",'menu mounted for delete');
   await invoke(ctx,"document.querySelector('[data-testid=\"action-menu\"] button:last-child').click();return true");
   await until(ctx,"Boolean(document.querySelector('[data-testid=\"confirm-dialog\"]'))",'delete confirm');
   await invoke(ctx,"document.querySelector('[data-testid=\"confirm-dialog\"] button:first-child').click();return true");
   // Error injection must retain the edited draft and report a genuine failure.
   await invoke(ctx,"document.querySelector('[data-node-id=\"100\"]').click();return true");
   await until(ctx,"document.querySelector('.bm-detail-title')?.textContent.includes('OpenDesk 产品资料')",'selected 100 for failure');
   await invoke(ctx,"document.querySelector('.bm-inspector-heading .bm-quiet-action').click();return true");
   await until(ctx,"Boolean(document.getElementById('bm-edit-name'))",'edit before failure');
   await setInput(ctx,'bm-edit-name','失败的模拟草稿');
   await invoke(ctx,"globalThis.__opendeskBookmarkMockDiagnostic('write-fail');document.querySelector('[data-testid=\"bookmark-save\"]').click();return true");
   await until(ctx,"Boolean(document.querySelector('.bm-error'))",'mock write failure preserved');
   assert.equal(await invoke(ctx,"return document.getElementById('bm-edit-name')?.value"),'失败的模拟草稿');
   await screenshot('bookmark-r302-400-failure.png');
  }
 }
 assert.deepEqual(network,[],'no HTTP(S) network requests');
 assert.deepEqual(exceptions,[],'no Chromium JS exceptions');
 const report={kind:'CHROMIUM_OFFLINE_REACT_MOCK',browser:browserInfo.product||'unknown',manifest,previewSha256:(await import('node:crypto')).createHash('sha256').update(original).digest('hex'),network,exceptions,reports};
 await writeFile(join(out,'bookmark-r302-interaction.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'R302_REACT_CHROMIUM_PASS',browser:report.browser,results:reports},null,2));
}catch(error){
 await writeFile(join(out,'bookmark-r302-failure.txt'),String(error?.stack||error));
 console.error(error);process.exitCode=1;
}finally{
 try{socket?.close()}catch{}
 try{chrome.kill('SIGTERM')}catch{}
 await delay(180);
 try{await rm(profile,{recursive:true,force:true})}catch{}
}
