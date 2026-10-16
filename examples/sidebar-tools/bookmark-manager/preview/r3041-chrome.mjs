#!/usr/bin/env node
// R3.0.4 React browser preview regression. MOCK only, NOT SOURCE BOUND / NOT NATIVE.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const out=resolve(process.argv[2]||'artifacts/preview-chrome-r3041');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'bm-r3041-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--ozone-platform=x11','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--window-size=1800,1100','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
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
 const bytes=Buffer.from(reply.data,'base64');
 await writeFile(join(out,name),bytes);
 return createHash('sha256').update(bytes).digest('hex');
}
// Preserve the entire document from y=0, even when Chrome Zoom makes the
// desktop preview taller than the physical screenshot viewport.
async function screenshotFull(name){
 const layout=await cdp('Page.getLayoutMetrics');
 const area=layout.cssContentSize;
 assert.ok(area.width>0&&area.height>0,'Chrome full-page capture dimensions');
 const reply=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
  clip:{x:0,y:0,width:Math.ceil(area.width),height:Math.ceil(area.height),scale:1}});
 const bytes=Buffer.from(reply.data,'base64');
 await writeFile(join(out,name),bytes);
 return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
  cssSize:{width:area.width,height:area.height}};
}
// Page.navigate resolves before the new document and nested React iframe mount.
// Never reuse a preceding width/zoom context as screenshot evidence.
async function settledPreview(width){
 const outer=await waitFor(async()=>{
  for(const candidate of [...contexts.values()]){
   try{
    if(await evaluate('Boolean(document.getElementById("od-preview-bookmark-lab") && location.search==="?width='+width+'")',candidate))
     return candidate;
   }catch{}
  }
  return null;
 },'new outer document width '+width,170);
 const inner=await waitFor(async()=>{
  for(const candidate of [...contexts.values()]){
   try{
    if(await evaluate('Boolean(globalThis.__BookmarkReactPreview?.version==="R3.0.4" && innerWidth==='+width+' && document.querySelector(".bm-tree-row"))',candidate))
     return candidate;
   }catch{}
  }
  return null;
 },'fresh React iframe width '+width,170);
 return {outer,ctx:inner};
}
async function setInput(ctx,id,value){
 return invoke(ctx,
  "const el=document.getElementById("+JSON.stringify(id)+");if(!el)throw Error('Missing input '+"
  +JSON.stringify(id)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,"
  +JSON.stringify(value)+");el.dispatchEvent(new Event('input',{bubbles:true}));return el.value;");
}


const previewPath=resolve('examples/sidebar-tools/bookmark-manager/preview/index.html');
const report=[], {createHash}=await import('node:crypto');
let browserInfo={};
async function zoomKeys(steps){
 await new Promise((ok,fail)=>{
  const child=spawn('python3',[resolve('examples/sidebar-tools/bookmark-manager/preview/chrome-zoom-x11.py'),String(steps)],{stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',d=>stderr+=d);
  child.on('error',fail);
  child.on('close',code=>code===0?ok():fail(Error('REAL_ZOOM_NOT_TESTED '+stderr)));
 });
 await delay(350);
}
async function realKey(key,code,vk,modifiers=0){
 for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,modifiers});
}
async function hit(ctx,selector){
 return invoke(ctx,'const el=document.querySelector('+JSON.stringify(selector)+');if(!el)return {found:false};const b=el.getBoundingClientRect(),x=b.left+Math.min(45,b.width/2),y=b.top+b.height/2,at=document.elementFromPoint(x,y);return {found:true,x,y,visible:y>=0&&y<innerHeight,hit:at===el||el.contains(at)}');
}
async function clickReal(ctx,outer,selector){
 const p=await hit(ctx,selector);
 assert.ok(p.found&&p.visible&&p.hit,'target must be unobstructed '+selector+' '+JSON.stringify(p));
 const f=await invoke(outer,'const b=document.getElementById("opendesk-preview-frame").getBoundingClientRect();return {x:b.left,y:b.top,w:b.width}');
 const inside=await evaluate('innerWidth',ctx);
 const x=f.x+p.x*f.w/inside, y=f.y+p.y*f.w/inside;
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
}
async function clipboard(){
 return new Promise((ok,fail)=>{
  const p=spawn('xclip',['-selection','clipboard','-o'],{stdio:['ignore','pipe','pipe']});
  let s='',err='';const timer=setTimeout(()=>{p.kill();fail(Error('clipboard read timeout'))},3500);
  p.stdout.on('data',d=>s+=d);p.stderr.on('data',d=>err+=d);
  p.on('error',e=>{clearTimeout(timer);fail(e)});
  p.on('close',code=>{clearTimeout(timer);code===0?ok(s):fail(Error(err))});
 });
}
async function keyboardCase(ctx,outer){
 await invoke(ctx,'const t=document.querySelector(".bm-tree-scroll");t.scrollTop=0;t.dispatchEvent(new Event("scroll",{bubbles:true}));t.focus();return true');
 await until(ctx,'!!document.querySelector("#bm-treeitem-100")','first row');
 await realKey('Home','Home',36);
 await realKey('ArrowDown','ArrowDown',40);
 await realKey('Enter','Enter',13);
 await until(ctx,'!!document.querySelector("[data-testid=bookmark-preview]")','Enter shows readonly');
 await realKey('Escape','Escape',27);
 await until(ctx,'!document.querySelector("[data-testid=bookmark-preview]")','Escape closes readonly from Tree');
 assert.equal(await invoke(ctx,'return document.activeElement?.classList.contains("bm-tree-scroll")'),true,'Tree still focused');
 await realKey(' ','Space',32);
 await until(ctx,'!!document.querySelector("[data-testid=bookmark-preview]")','Space shows readonly');
 await realKey('F2','F2',113);
 await until(ctx,'!!document.querySelector("[data-testid=bookmark-editor]")','F2 reuses editor');
 await realKey('Escape','Escape',27);
 await until(ctx,'!document.querySelector("[data-testid=bookmark-sheet]")','Escape dismisses clean editor');
 await invoke(ctx,'document.querySelector(".bm-tree-scroll").focus();return true');
 await realKey('F10','F10',121,8);
 await until(ctx,'!!document.querySelector("[data-testid=action-menu]")','Shift+F10 opens row menu');
 await realKey('Escape','Escape',27);
 await until(ctx,'!document.querySelector("[data-testid=action-menu]")','Escape closes menu only');
 assert.equal(await invoke(ctx,'return !!document.querySelector("[data-testid=bookmark-preview]")'),true,'menu Escape preserves readonly');
 await invoke(ctx,'document.querySelector("#bm-treeitem-100 .bm-node-title").click();return true');
 const url=await invoke(ctx,'return document.querySelector("[data-testid=bookmark-preview] .bm-detail-url").href');
 await clickReal(ctx,outer,'[data-testid="bookmark-preview"] [aria-label="复制网址"]');
 const value=await waitFor(async()=>{try{const x=await clipboard();return x===url?x:null}catch{return null}},'real OS clipboard exact URL',36);
 assert.equal(value,url,'clipboard contents must be exact');
 return ['real-enter','real-space','real-escape','real-F2','real-shift-F10','real-X11-clipboard'];
}
try{
 assert.ok(process.env.DISPLAY,'REAL_ZOOM_NOT_TESTED: X11 required');
 const html=await readFile(previewPath,'utf8');
 assert.match(html,/sandbox="allow-scripts"/);
 await connect();browserInfo=await cdp('Browser.getVersion');
 const url=pathToFileURL(previewPath).href;
 await cdp('Page.navigate',{url:url+'?width=360'});
 let outer=await outerContext();
 const base={dpr:await evaluate('devicePixelRatio',outer),width:await evaluate('innerWidth',outer)};
 assert.ok(base.dpr>0&&base.width>300);
 // file:// pages may reset Chrome site zoom upon Page.navigate. Therefore each
 // tested width must receive and prove its OWN real X11 browser zoom.
 const supportedZoom=[100,110,125,150];
 for(const zoom of [{percent:100},{percent:125},{percent:150}]){
  for(const width of [360,400,960]){
   await cdp('Page.navigate',{url:url+'?width='+width});
   const ready=await settledPreview(width);outer=ready.outer;
   const ctx=ready.ctx;
   // Navigation to a file:// preview can reset per-document zoom to 100%.
   // Read the actual NEW page DPR, then send only the necessary real XTEST
   // Ctrl+plus/minus keystrokes; never replace this with CDP emulation.
   const startingDpr=await evaluate('devicePixelRatio',outer);
   const startingZoom=supportedZoom.findIndex(p=>Math.abs(startingDpr/base.dpr-p/100)<.025);
   assert.ok(startingZoom>=0,'unexpected Chrome zoom after navigation '+startingDpr);
   const requiredKeys=supportedZoom.indexOf(zoom.percent)-startingZoom;
   if(requiredKeys)await zoomKeys(requiredKeys);
   await waitFor(async()=>Math.abs((await evaluate('devicePixelRatio',outer))/base.dpr-zoom.percent/100)<.025,
    'REAL_X11_ZOOM_ADJUSTMENT at '+width+' / '+zoom.percent+'%',110);
   const actualDpr=await evaluate('devicePixelRatio',outer);
   const outerScale=await evaluate('visualViewport.scale',outer);
   assert.ok(Math.abs(outerScale-1)<.02,'pinch/page scale must remain one');
   const actualViewport=await evaluate('innerWidth',outer);
   const frameDpr=await evaluate('devicePixelRatio',ctx);
   assert.ok(Math.abs(actualDpr/base.dpr-zoom.percent/100)<.025,
    'REAL_ZOOM_AFTER_NAVIGATION_FAILED at '+width+' / '+zoom.percent+'%: DPR '+actualDpr);
   assert.ok(Math.abs(frameDpr/actualDpr-1)<.025,
    'iframe must inherit actual Chrome Zoom at '+width+' / '+zoom.percent+'%');
   assert.ok(Math.abs(actualViewport-base.width/(zoom.percent/100))<9,
    'Chrome viewport must retain zoom after page navigation at '+width+' / '+zoom.percent+'%');
   const frameRight=await invoke(outer,'return document.getElementById("opendesk-preview-frame").getBoundingClientRect().right');
   const pageWidth=await evaluate('innerWidth',outer);
   assert.ok(frameRight<=pageWidth+1,'React preview must not be cropped by outer Chrome viewport at '+zoom.percent+'% '+width);
   await until(ctx,'document.querySelector(".bm-heading span")?.textContent.includes("2,159")','React data at '+width+' '+zoom.percent);
   const dimensions=await invoke(ctx,'const t=document.querySelector(".bm-tree-scroll");return {h:t.clientHeight,root:innerWidth,scroll:document.documentElement.scrollWidth,scale:visualViewport.scale}');
   assert.ok(dimensions.h>180&&dimensions.scroll<=dimensions.root+1&&Math.abs(dimensions.scale-1)<.02,'zoom fits tree '+width);
   await invoke(outer,'window.scrollTo(0,0);return true');
   const listSha=await screenshot('bookmark-r3041-'+width+'-zoom'+zoom.percent+'-list.png');
   const listFull=await screenshotFull('bookmark-r3041-'+width+'-zoom'+zoom.percent+'-list-full.png');
   await invoke(ctx,'document.querySelector("#bm-treeitem-100 .bm-node-title").click();return true');
   await until(ctx,'!!document.querySelector("[data-testid=bookmark-preview]")','nonmodal '+width);
   assert.equal(await invoke(ctx,'return !!document.querySelector("[data-testid=bookmark-sheet]")'),false);
   const bounds=await invoke(ctx,'const r=document.querySelector(".bm-preview-pane").getBoundingClientRect();return {left:r.left,right:r.right}');
   assert.ok(bounds.left>=-1&&bounds.right<=dimensions.root+1,'preview within viewport');
   await invoke(outer,'window.scrollTo(0,0);return true');
   const previewSha=await screenshot('bookmark-r3041-'+width+'-zoom'+zoom.percent+'-preview.png');
   const previewFull=await screenshotFull('bookmark-r3041-'+width+'-zoom'+zoom.percent+'-preview-full.png');
   if(width===400&&zoom.percent===100)report.push({width,zoom:100,keyboard:await keyboardCase(ctx,outer)});
   await invoke(ctx,'const t=document.querySelector(".bm-tree-scroll");t.scrollTop=t.scrollHeight;t.dispatchEvent(new Event("scroll",{bubbles:true}));return true');
   await until(ctx,'!!document.querySelector("#bm-treeitem-2651")','last virtual row mounted '+width);
   const last=await hit(ctx,'[data-node-id="2651"]');
   assert.ok(last.found&&last.visible&&last.hit,'last bookmark must not be blocked by readonly preview: '+JSON.stringify(last));
   await invoke(ctx,'document.querySelector("#bm-treeitem-2651 .bm-node-title").click();return true');
   await until(ctx,'document.querySelector("[data-testid=bookmark-preview] .bm-detail-title span")?.textContent.includes("2152")','last item readonly '+width);
   const top=await invoke(ctx,'return document.querySelector(".bm-tree-scroll").scrollTop');
   await invoke(ctx,'document.querySelector(".bm-preview-close").click();return true');
   await until(ctx,'!document.querySelector("[data-testid=bookmark-preview]")','close preview '+width);
   assert.equal(await invoke(ctx,'return document.querySelector(".bm-tree-scroll").scrollTop'),top,'close preserves virtual scroll');
   report.push({width,zoom:zoom.percent,realBrowserDprRatio:actualDpr/base.dpr,cssViewport:actualViewport,
    frameDpr,frameCssWidth:dimensions.root,viewportScreenshotSha256:{list:listSha,preview:previewSha},
    fullPage:{list:listFull,preview:previewFull},nonModal:true,uncoveredBottom:true,scrollPreserved:true});
  }
 }
 assert.deepEqual(network,[],'offline model and assets only');
 assert.deepEqual(exceptions,[],'no Chrome JS exceptions');
 await writeFile(join(out,'bookmark-r3041-interaction.json'),JSON.stringify({kind:'REAL_CHROMIUM_X11_BROWSER_ZOOM',browser:browserInfo.product,base,report,htmlSha256:createHash('sha256').update(html).digest('hex'),zoomMethod:'XTEST keyboard, corroborated by actual viewport change; no CSS, pinch or DPR override'},null,2));
 console.log('R3041_REAL_ZOOM_PASS '+JSON.stringify(report));
}catch(error){
 await writeFile(join(out,'bookmark-r3041-failure.txt'),String(error?.stack||error));console.error(error);process.exitCode=1;
}finally{
 try{socket?.close()}catch{}
 try{chrome.kill('SIGTERM')}catch{}
 await delay(180);try{await rm(profile,{recursive:true,force:true})}catch{}
}
