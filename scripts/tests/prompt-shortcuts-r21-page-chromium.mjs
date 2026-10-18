#!/usr/bin/env node
// Actual Chromium DOM, trusted source module and CDP mouse gestures.
// Extension Host/storage are simulated: CHROMIUM_FIXTURE_PASS, never INSTALLED_CHROME_PASS.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';

const out=resolve(process.argv[2]||'artifacts/prompt-shortcuts-r21-page-chromium');
await mkdir(out,{recursive:true});
const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
assert.equal(pkg.id,'prompt-shortcuts');
const root=resolve('.');
let boot='',initial={};
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<link rel="icon" href="data:,">'+
  '<style>body{margin:0;font:16px system-ui}main{margin:32px 0 0 100px;'+
  'width:min(78vw,840px);height:640px;padding:20px;background:#f5f6f9}'+
  'textarea{display:block;width:85%;height:110px;margin-top:100px}'+
  'input{display:block;width:75%;height:40px;margin-top:12px}'+
  '#rich-container{margin-top:18px}#rich-container [contenteditable]{'+
  'width:82%;min-height:72px;padding:8px;background:white;border:1px solid #9aa}'+
  '#danger{margin-top:20px;padding:18px}</style></head><body>'+
  '<main id="workspace"><h1>编辑区</h1>'+
  '<button id="danger" type="button">危险操作占位</button>'+
  '<textarea id="draft">旧草稿</textarea>'+
  '<input id="single" type="text" value="旧单行">'+
  '<section id="rich-container"><div>编辑器名称</div>'+
  '<div contenteditable="true"><p>旧富文本</p></div></section></main>'+
  '<section id="other"><div contenteditable="true">其他富文本</div></section>'+
  '<script>window.__loadErrors=[];addEventListener("error",e=>'+
  'window.__loadErrors.push(e.message||e.target?.src||"module error"),true)</script>'+
  '<script type="module" src="/fixture-boot.js"></script></body></html>';
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  // Chrome requests favicon on navigation and reload; it is not part of the fixture.
  if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(pathname==='/fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;}
  if(pathname==='/fixture-boot.js'){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    res.end(boot);return;
  }
  try{
    const full=resolve(root,'.'+decodeURIComponent(pathname));
    if(!full.startsWith(root+sep)||!full.endsWith('.js'))throw Error('not a JS module');
    const data=await readFile(full);
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(data);
  }catch{
    res.writeHead(404);res.end('not found');
  }
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const origin='http://127.0.0.1:'+server.address().port;
const rule={origin,pathScope:'/fixture',containerSelector:'#workspace',
  editorSelector:'#draft',enabled:true};
const body='你好🙂\n\n第二行';
const library={schema:1,items:[{id:'prompt-chromium-r21',body,label:'你好',
  name:'你好',shape:'square',enabled:true,order:0}],settings:{webButtons:true}};
initial={
  'opendesk.sidebar-tools.installed.v1':[pkg],
  'opendesk.sidebar-tools.enabled.v1':{},
  'opendesk.sidebar-tools.revocation-epochs.v1':{'prompt-shortcuts':'fixture-epoch'},
  'opendesk.sidebar-tools.data.v1:prompt-shortcuts':{library,sites:{schema:1,rules:[rule]}}
};
boot=[
  'import {initPromptShortcuts} from "/examples/sidebar-tools/prompt-shortcuts/trusted/page.js";',
  'const initial='+JSON.stringify(initial)+';',
  'const values=JSON.parse(localStorage.getItem("ps-r21-fixture")||"null")||initial;',
  'const changes=new Set(),messages=new Set();',
  'const DATA="opendesk.sidebar-tools.data.v1:prompt-shortcuts";',
  'window.__ready=false;window.__effects=0;window.__edits=[];window.__copied=[];window.__inputs=0;',
  'window.__richInputs=0;window.__richRollback=false;window.__richRollbacks=0;',
  'const rich=document.querySelector("#rich-container [contenteditable]");',
  'rich.addEventListener("input",()=>{window.__richInputs++;if(window.__richRollback)',
  '  setTimeout(()=>{rich.innerHTML="<p>旧富文本</p>";window.__richRollbacks++;},160);});',
  'const danger=document.querySelector("#danger");',
  'for(const type of ["pointerup","mouseup","click","dblclick"])danger.addEventListener(type,()=>window.__effects++);',
  'document.querySelector("#draft").addEventListener("input",()=>window.__inputs++);',
  'const oldExec=document.execCommand.bind(document);',
  'document.execCommand=function(command,show,text){window.__edits.push({command,text});return oldExec(command,show,text)};',
  'Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>window.__copied.push(text)}});',
  'const oldShadow=Element.prototype.attachShadow;',
  'Element.prototype.attachShadow=function(options){const root=oldShadow.call(this,options);',
  ' if(this.hasAttribute("data-opendesk-prompts"))window.__railRoot=root;return root;};',
  'const api={runtime:{id:"fixture-extension",getURL:()=>"chrome-extension://fixture-extension/",',
  '  onMessage:{addListener:fn=>messages.add(fn),removeListener:fn=>messages.delete(fn)}},',
  '  storage:{local:{async get(keys){const out={};for(const key of keys)if(Object.hasOwn(values,key))',
  '    out[key]=structuredClone(values[key]);return out;}},',
  '  onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};',
  'window.__send=(operation,extra={})=>new Promise(resolve=>{const listener=[...messages][0];',
  ' listener({protocol:"opendesk.prompt-shortcuts.picker.v1",toolId:"prompt-shortcuts",',
  ' operation,expectedUrl:location.href,...extra},',
  ' {id:"fixture-extension",url:"chrome-extension://fixture-extension/tool.html"},resolve);});',
  'window.__setRule=next=>{values[DATA].sites={schema:1,rules:next?[next]:[]};',
  ' localStorage.setItem("ps-r21-fixture",JSON.stringify(values));',
  ' for(const fn of changes)fn({[DATA]:{newValue:values[DATA]}},"local");};',
  'window.__rule='+JSON.stringify(rule)+';',
  'localStorage.setItem("ps-r21-fixture",JSON.stringify(values));',
  'window.__initPromptShortcuts=initPromptShortcuts;window.__trustedApi=api;',
  'window.__controller=initPromptShortcuts({api,doc:document,win:window});',
  'window.__ready=true;'
].join('\n');

const profile=await mkdtemp(join(tmpdir(),'prompt-shortcuts-r21-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,seq=0;
const pending=new Map(),jsErrors=[];
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function rpc(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++seq,timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout: '+method));},17000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v);},fail(e){clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;await sleep(100);
  }
  assert(port,'Chrome DevToolsActivePort');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');assert(page?.webSocketDebuggerUrl);
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const response=JSON.parse(event.data);
    if(response.method==='Runtime.exceptionThrown'){
      jsErrors.push(response.params.exceptionDetails.exception?.description||response.params.exceptionDetails.text);
    }
    if(response.method==='Log.entryAdded'&&response.params?.entry?.level==='error')
      jsErrors.push(response.params.entry.text);
    const item=pending.get(response.id);if(!item)return;
    pending.delete(response.id);
    if(response.error)item.fail(Error(response.error.message));else item.ok(response.result);
  });
  await rpc('Page.enable');await rpc('Runtime.enable');await rpc('Log.enable');
  await rpc('Emulation.setDeviceMetricsOverride',{width:1150,height:800,deviceScaleFactor:1,mobile:false});
}
async function evaluate(expression){
  const response=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
  return response.result?.value;
}
async function poll(expression,label){
  for(let n=0;n<100;n++){
    if(await evaluate(expression))return;
    await sleep(80);
  }
  throw Error('Timed out: '+label);
}
async function clickJS(expression,clickCount=1){
  const rect=await evaluate('(()=>{const n='+expression+';if(!n)throw Error("missing target");'+
    'const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()');
  assert(rect.w>0&&rect.h>0,'real visible click target: '+expression);
  for(const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount}],
    ['mouseReleased',{button:'left',clickCount}]])
    await rpc('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,...extra});
}
async function shot(name){
  const response=await rpc('Page.captureScreenshot',{format:'png'});
  await writeFile(join(out,name+'.png'),Buffer.from(response.data,'base64'));
}
const sessionA='01234567-89ab-cdef-0123-456789abcdef';
const sessionB='11234567-89ab-cdef-0123-456789abcdef';
const scenes=[];
try{
  await connect();
  await rpc('Page.navigate',{url:origin+'/fixture'});
  await poll('window.__ready&&window.__railRoot?.querySelector(".item")','ready trusted page rail');
  assert.equal(await evaluate('document.querySelector("#draft").value'),'旧草稿');
  const started=await evaluate('window.__send("prompt.page.pick.start",{kind:"container",session:'+JSON.stringify(sessionA)+'})');
  assert.equal(started.ok,true);
  await clickJS('document.querySelector("#danger")');
  const picked=await evaluate('window.__send("prompt.page.pick.status",{session:'+JSON.stringify(sessionA)+'})');
  assert.equal(picked.data.state,'selected','real pointer click selects container');
  assert.equal(picked.data.selector,'#workspace');
  assert.equal(await evaluate('window.__effects'),0,'no site pointerup/mouseup/click side effects');
  scenes.push({step:'container picker / trusted mouse',selector:picked.data.selector,siteEffects:0});
  const startedEditor=await evaluate('window.__send("prompt.page.pick.start",{kind:"editor",session:'+JSON.stringify(sessionB)+'})');
  assert.equal(startedEditor.ok,true);
  await clickJS('document.querySelector("#draft")');
  const chosen=await evaluate('window.__send("prompt.page.pick.status",{session:'+JSON.stringify(sessionB)+'})');
  assert.equal(chosen.data.selector,'#draft');
  const checked=await evaluate('window.__send("prompt.page.check",{rule:window.__rule})');
  assert.equal(checked.ok,true);assert.equal(checked.data.editorType,'textarea');
  scenes.push({step:'editor picker and live selector check',selector:chosen.data.selector,kind:checked.data.editorType});
  // Two individually unique selectors are unsafe if they refer to different
  // composer regions. Test both explicit validation and runtime SPA retarget.
  const outsideSelector='#other [contenteditable="true"]';
  const outsideRule={...rule,editorSelector:outsideSelector};
  const outsideCheck=await evaluate('window.__send("prompt.page.check",{rule:'+JSON.stringify(outsideRule)+'})');
  assert.equal(outsideCheck.ok,false,'disjoint editor must fail website configuration');
  assert.match(outsideCheck.error,/按钮容器必须包含目标输入框/);
  await evaluate('window.__setRule('+JSON.stringify(outsideRule)+')');
  await poll('document.querySelector("[data-opendesk-prompts]")?.hidden===true',
    'retargeted editor outside region hides buttons');
  await evaluate('window.__setRule(window.__rule)');
  await poll('window.__railRoot?.querySelector(".item")?.isConnected && '+
    '!document.querySelector("[data-opendesk-prompts]").hidden','restore safe editor');
  scenes.push({step:'disjoint container/editor and SPA retarget',safeFailClosed:true});
  // The trusted picker deliberately guards the selected target for 750 ms
  // against late click/double-click events. Do not race its release in CI.
  await sleep(825);
  await clickJS('window.__railRoot.querySelector(".item")');
  await poll('document.querySelector("#draft").value.includes("第二行")','native textarea insertion');
  assert.equal(await evaluate('document.querySelector("#draft").value'),'旧草稿\n'+body);
  assert.equal(await evaluate('window.__edits.length'),1,'exactly one native edit');
  assert.equal(await evaluate('window.__inputs>0'),true,'native input event fired');
  assert.equal(await evaluate('window.__effects'),0,'no form/site action dispatched');
  scenes.push({step:'textarea native insert',preservedDraft:true,unicodeAndBlankLines:true,noAutoSend:true});
  // Chromium native Undo. macOS CDP needs an explicit editing command with
  // Meta+Z; modifier-only key events do not invoke the platform shortcut.
  const macUndo=process.platform==='darwin',undoModifiers=macUndo?4:2;
  await evaluate('document.querySelector("#draft").focus()');
  await rpc('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'z',code:'KeyZ',
    windowsVirtualKeyCode:90,modifiers:undoModifiers,...(macUndo?{commands:['undo']}:{})});
  await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',
    windowsVirtualKeyCode:90,modifiers:undoModifiers});
  await poll('document.querySelector("#draft").value==="旧草稿"',
    'native '+(macUndo?'Meta+Z / CDP undo':'Ctrl+Z')+' restores draft');
  scenes.push({step:'Chromium native textarea undo',restoredOriginalDraft:true,
    input:macUndo?'CDP native undo command (Meta+Z)':'native Ctrl+Z'});
  await shot('desktop-trusted-rail');
  await evaluate('window.__setRule(null)');
  await poll('!document.querySelector("[data-opendesk-prompts]")','site rule disabled');
  await evaluate('window.__setRule(window.__rule)');
  await poll('window.__railRoot?.querySelector(".item")?.isConnected','site rule re-enabled');
  await rpc('Page.reload',{ignoreCache:true});
  await poll('window.__ready&&window.__railRoot?.querySelector(".item")','reload restores stored site rule');
  scenes.push({step:'disabled / reenabled / reload',persisted:true});
  await evaluate('window.__setRule({...window.__rule,editorSelector:"#single"})');
  await poll('window.__railRoot?.querySelector(".item")?.isConnected','input rule mounted');
  await clickJS('window.__railRoot.querySelector(".item")');
  await poll('window.__copied.length===1','multiline input safe clipboard fallback');
  assert.equal(await evaluate('document.querySelector("#single").value'),'旧单行');
  assert.equal(await evaluate('window.__edits.length'),0,'preflight did not touch single-line input');
  assert.equal(await evaluate('window.__copied[0]'),body);
  scenes.push({step:'single-line multiline rejection',draftUnchanged:true,copiedFullPrompt:true});
  // Anonymous contenteditable: two editors exist, so the picker must generate
  // a semantic selector anchored inside the explicitly chosen composer region.
  const richSession='21234567-89ab-cdef-0123-456789abcdef';
  assert.equal((await evaluate('window.__send("prompt.page.pick.start",{kind:"editor",session:'+JSON.stringify(richSession)+'})')).data.state,'selecting');
  await clickJS('document.querySelector("#rich-container [contenteditable]")');
  const richPick=await evaluate('window.__send("prompt.page.pick.status",{session:'+JSON.stringify(richSession)+'})');
  assert.equal(richPick.data.state,'selected','rich editor selected via real click');
  assert.equal(richPick.data.editorType,'richtext');
  assert.equal(richPick.data.selector,'#rich-container div[contenteditable="true"]');
  await evaluate('window.__setRule({...window.__rule,editorSelector:'+JSON.stringify(richPick.data.selector)+'})');
  await poll('window.__railRoot?.querySelector(".item")?.isConnected','richtext rule mounted');
  const richChecked=await evaluate('window.__send("prompt.page.check",{rule:{...window.__rule,editorSelector:'+JSON.stringify(richPick.data.selector)+'}})');
  assert.equal(richChecked.data.editorType,'richtext');
  // The previous single-line clipboard fallback used this same prompt ID.
  // The trusted 700ms double-click guard must finish before a new user journey.
  await sleep(825);
  await clickJS('window.__railRoot.querySelector(".item")');
  await poll('window.__richInputs>0','native contenteditable input event');
  await sleep(420);
  const richOutcome=await evaluate('({html:document.querySelector("#rich-container [contenteditable]").innerHTML,text:document.querySelector("#rich-container [contenteditable]").innerText,feedback:window.__railRoot.querySelector(".feedback").textContent,feedbackHidden:window.__railRoot.querySelector(".feedback").hidden,announcement:window.__railRoot.querySelector(".announcer").textContent,copied:window.__copied,edits:window.__edits})');
  assert.equal(richOutcome.feedbackHidden,true,'verified edit must not display a success toast');
  assert.equal(richOutcome.feedback,'','no visible feedback text remains after verified insertion');
  assert.match(richOutcome.announcement,/已插入草稿，未发送/,JSON.stringify(richOutcome));
  assert.deepEqual(richOutcome.copied,[body],'verified contenteditable avoids duplicate clipboard fallback');
  scenes.push({step:'anonymous contenteditable scoped selector and native multiline commit',
    editorSelector:richPick.data.selector,statePersisted:true});
  // A mock controlled editor discards DOM-only changes after 160 ms. The trusted
  // adapter must report uncertain insertion rather than a false success.
  await sleep(800);
  await evaluate('window.__richRollback=true;window.__copied=[]');
  await clickJS('window.__railRoot.querySelector(".item")');
  await poll('window.__richRollbacks>0','controlled editor rolled back uncommitted DOM edit');
  await poll('window.__copied.length===1','unknown rich editor effect copied for explicit review');
  assert.equal(await evaluate('document.querySelector("#rich-container [contenteditable]").innerText'),'旧富文本');
  assert.equal(await evaluate('window.__copied[0]'),body);
  scenes.push({step:'controlled editor reconciliation rollback',noFalseSuccess:true,
    noAutomaticRetry:true,fullCopyFallback:true});
  await evaluate('window.__setRule(window.__rule)');
  await poll('window.__railRoot?.querySelector(".item")?.isConnected','return to textarea rule');
  await rpc('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:false});
  await sleep(250);
  await shot('narrow-360-trusted-rail');
  // The real Chromium document simulates ChatGPT's native fixed-site adapter.
  // Only the location facade and extension Host/storage are mocked; DOM,
  // MutationObserver, trusted CDP clicks and text editing remain browser-native.
  await rpc('Emulation.setDeviceMetricsOverride',
    {width:1150,height:800,deviceScaleFactor:1,mobile:false});
  await evaluate(`(()=>{
    window.__controller.dispose();
    const real=window,proxy={
      location:{href:'https://chatgpt.com/c/history-1'},
      innerWidth:real.innerWidth,innerHeight:real.innerHeight,
      navigator:real.navigator,MutationObserver:real.MutationObserver,ResizeObserver:real.ResizeObserver,
      addEventListener:real.addEventListener.bind(real),
      removeEventListener:real.removeEventListener.bind(real),
      setTimeout:real.setTimeout.bind(real),clearTimeout:real.clearTimeout.bind(real),
      setInterval:real.setInterval.bind(real),clearInterval:real.clearInterval.bind(real),
      getComputedStyle:real.getComputedStyle.bind(real)
    };
    proxy.top=proxy;window.__chatgptProxy=proxy;
    const main=document.createElement('main');
    main.id='main';main.style.marginLeft='170px';main.style.marginTop='25px';
    main.style.width='680px';main.style.height='600px';
    const area=document.createElement('textarea');
    area.id='prompt-textarea';area.value='旧历史会话草稿';
    main.append(area);document.body.append(main);
    window.__controller=window.__initPromptShortcuts({
      api:window.__trustedApi,doc:document,win:proxy
    });
  })()`);
  await poll('document.querySelector("main#main") && '+
    'document.querySelector("[data-opendesk-prompts]")?.hidden===false && '+
    'window.__railRoot?.querySelector(".item")?.isConnected && '+
    'document.querySelector("[data-opendesk-prompts]").style.left.endsWith("px")',
    'simulated ChatGPT fixed-site adapter mounted and positioned');
  const beforeHistoryLeft=await evaluate('document.querySelector("[data-opendesk-prompts]").style.left');
  await evaluate(`(()=>{
    const old=document.querySelector('main#main');
    const next=old.cloneNode(true);
    next.style.marginLeft='340px';next.querySelector('#prompt-textarea').value='新历史会话草稿';
    old.replaceWith(next);
    const host=document.querySelector('[data-opendesk-prompts]');
    window.__historyHost=host;host.remove();
    window.__chatgptProxy.location.href='https://chatgpt.com/c/history-2';
  })()`);
  await poll('document.querySelector("[data-opendesk-prompts]")===window.__historyHost && '+
    '!window.__historyHost.hidden && window.__historyHost.style.left!=='+JSON.stringify(beforeHistoryLeft)+
    ' && window.__railRoot?.querySelectorAll(".item").length===1',
    'history SPA remount reuses dock and repositions');
  await clickJS('window.__railRoot.querySelector(".item")');
  await poll('document.querySelector("main#main textarea#prompt-textarea").value.includes("第二行")',
    'history conversation native insertion');
  assert.equal(await evaluate('document.querySelector("main#main textarea#prompt-textarea").value'),
    '新历史会话草稿\n'+body);
  assert.equal(await evaluate('document.querySelectorAll("[data-opendesk-prompts]").length'),1);
  scenes.push({step:'ChatGPT-origin simulated SPA history navigation',
    actualChromiumDOM:true,oldHostReused:true,newRegionAnchored:true,
    nativeDraftConfirmed:true,installedExtension:false});
  await shot('chatgpt-spa-history-recovery');
  assert.equal(jsErrors.length,0,JSON.stringify(jsErrors));
  const report={kind:'ACTUAL_CHROMIUM_DOM_FIXED_PAGE_WITH_MOCK_HOST',installedExtension:false,
    realThirdPartySite:false,realMacIme:false,version:pkg.version,scenes,consoleErrors:jsErrors};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PROMPT_SHORTCUTS_R21_PAGE_CHROMIUM_FIXTURE_PASS',JSON.stringify(report));
}catch(error){
  let snapshot;
  try{snapshot=await evaluate('({ready:window.__ready,errors:window.__loadErrors||[],promptRail:!!document.querySelector("[data-opendesk-prompts]"),path:location.pathname,focused:document.activeElement?.id,draft:document.querySelector("#draft")?.value,edits:window.__edits||[],copied:window.__copied||[],inputEvents:window.__inputs||0,hostHidden:document.querySelector("[data-opendesk-prompts]")?.hidden,feedback:window.__railRoot?.querySelector(".feedback")?.textContent,feedbackHidden:window.__railRoot?.querySelector(".feedback")?.hidden,railButton:window.__railRoot?.querySelector(".item")?.getBoundingClientRect()?.toJSON()})');}
  catch(snapshotError){snapshot={diagnosticError:String(snapshotError)};}
  console.error('PROMPT_SHORTCUTS_R21_PAGE_CHROMIUM_FIXTURE_FAIL',
    JSON.stringify({message:String(error?.stack||error),snapshot,jsErrors}));
  throw error;
}finally{
  socket?.close();
  chrome.kill('SIGTERM');
  if(chrome.exitCode===null)
    await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),sleep(1600)]);
  await new Promise(resolve=>server.close(resolve));
  try{await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:120});}
  catch(cleanupError){console.warn('R21_CHROME_PROFILE_CLEANUP_ONLY',cleanupError.message);}
}
