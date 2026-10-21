#!/usr/bin/env node
// Actual App.jsx in isolated Chromium. All data/AI are MOCK; never a native profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const out=resolve(process.argv[2]||'artifacts/conversation-r13-local/ui');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(out,'.mock-chromium-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
 '--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--disable-dev-shm-usage',
 '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const contexts=new Map(),pending=new Map(),exceptions=[],network=[],checks=[],matrix=[];
let socket,sequence=0,ctx,outer,currentCase;
function cdp(method,params={},sessionId){return new Promise((ok,fail)=>{
 const id=++sequence,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},15000);
 pending.set(id,{ok:r=>{clearTimeout(timer);ok(r)},fail:e=>{clearTimeout(timer);fail(e)}});
 socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
})}
async function until(fn,label){for(let i=0;i<120;i++){try{const r=await fn();if(r)return r}catch{}await wait(50)}throw Error('Timeout '+label)}
async function evaluate(code,context=ctx){
 const r=await cdp('Runtime.evaluate',{expression:'(async()=>{'+code+'})()',contextId:context.contextId,awaitPromise:true,returnByValue:true},context.session);
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result?.value;
}
async function key(key,modifiers=0){
 const code={a:'KeyA',' ':'Space'}[key]||key;
 const windowsVirtualKeyCode={a:65,' ':32,Enter:13,Tab:9,Escape:27,Home:36,End:35}[key];
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode,...(key==='Enter'?{text:'\r'}:{}),...(key==='a'?{commands:['selectAll']}:{})},ctx.session);
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode},ctx.session);
 await wait(30);
}
async function click(selector){
 await evaluate('const e=document.querySelector('+JSON.stringify(selector)+');if(!e)throw Error("Missing control");e.scrollIntoView({block:"nearest",inline:"nearest"});');
 const point=await evaluate('const e=document.querySelector('+JSON.stringify(selector)+'),b=e.getBoundingClientRect();const x=b.left+b.width/2,y=b.top+b.height/2;return {x,y,hit:e.contains(document.elementFromPoint(x,y)),disabled:e.disabled};');
 assert.ok(point.hit&&!point.disabled,'Mock coordinate click must hit enabled '+selector+' '+JSON.stringify(point));
 // OOPIF sessions accept local viewport coordinates. In a shared renderer add
 // the real outer iframe offset. Never use element.click() as click evidence.
 if(!ctx.session){const offset=await evaluate('const b=document.getElementById("opendesk-preview-frame").getBoundingClientRect();return {x:b.left,y:b.top}',outer);point.x+=offset.x;point.y+=offset.y}
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y},ctx.session);
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y},ctx.session);
 await wait(45);
}
async function ensureDockOpen(){
 const visible=await evaluate('return !!document.querySelector(".od-conversation-dock:not([hidden])")');
 if(!visible)await click('.bm-topbar [aria-label="对话"]');
 await until(()=>evaluate('return !!document.querySelector(".od-conversation-dock:not([hidden])")'),'shared chat Dock visible');
}
async function input(selector,value){await click(selector);await key('a',4);await cdp('Input.insertText',{text:value},ctx.session);await wait(35)}
async function screenshot(name){
 const b=await evaluate('document.getElementById("opendesk-preview-frame").scrollIntoView({block:"start"});const b=document.getElementById("opendesk-preview-frame").getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,width:b.width,height:b.height,scale:1}',outer);
 const r=await cdp('Page.captureScreenshot',{format:'png',clip:b,captureBeyondViewport:true});
 await writeFile(join(out,name+'.png'),Buffer.from(r.data,'base64'));
 return name+'.png';
}
async function check(name,fn){try{const detail=await fn();checks.push({case:currentCase,name,status:'PASS',detail})}catch(e){checks.push({case:currentCase,name,status:'FAIL',error:String(e.stack||e)});await screenshot('failure-'+checks.length).catch(()=>{})}}
async function load(path,width,dark=false,zoom=1){
 await cdp('Emulation.setDeviceMetricsOverride',{width:Math.max(1400,width*zoom+100),height:1200*zoom,deviceScaleFactor:1,mobile:false});
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]});
 contexts.clear();await cdp('Page.navigate',{url:pathToFileURL(path).href+'?width='+width});
 outer=await until(async()=>{for(const c of contexts.values())try{if(await evaluate('return !!document.getElementById("opendesk-preview-frame")',c))return c}catch{}},'outer shell');
 ctx=await until(async()=>{for(const c of contexts.values())try{if(await evaluate('return !!document.querySelector(".bm-tree-row")',c))return c}catch{}},'formal React App');
 if(ctx.session)await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]},ctx.session);
 await evaluate('const d=document.querySelector(".preview-device"),f=document.getElementById("opendesk-preview-frame");d.style.width='+JSON.stringify(width*zoom)+'+(d.clientWidth-f.clientWidth)+"px";d.style.maxWidth="none";f.style.height="'+(800*zoom)+'px";f.style.maxHeight="none";',outer);
 await evaluate('document.documentElement.style.zoom='+JSON.stringify(String(zoom))+';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));');
 const size=await evaluate('const e=document.querySelector(".bm-app");return {viewport:innerWidth,layout:e.offsetWidth,zoom:Number(getComputedStyle(document.documentElement).zoom),dark:matchMedia("(prefers-color-scheme:dark)").matches}');
 assert.equal(size.layout,width);assert.equal(size.viewport,width*zoom);assert.equal(size.zoom,zoom);assert.equal(size.dark,dark);
 return size;
}
async function geometry(){return evaluate(`const app=document.querySelector('.bm-app'),a=app.getBoundingClientRect();
 const controls=[...document.querySelectorAll('.bm-topbar .bm-icon-btn')].map(e=>{
 const b=e.getBoundingClientRect(),s=e.querySelector('svg').getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
 return {label:e.getAttribute('aria-label'),type:e.type,width:b.width,height:b.height,dx:(s.x+s.width/2)-(b.x+b.width/2),dy:(s.y+s.height/2)-(b.y+b.height/2),inside:b.left>=a.left-.5&&b.right<=a.right+.5,hittable:e.contains(hit),padding:getComputedStyle(e).paddingLeft};});
 const overflow=[...app.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.overflowX==='visible'&&e.scrollWidth>e.clientWidth+2&&e.clientWidth>0}).map(e=>({tag:e.tagName,cls:e.className,overflow:e.scrollWidth-e.clientWidth}));
 return {appOverflow:app.scrollWidth-app.clientWidth,controls,overflow};`)}
async function assertDockKeepsTreeVisible(){
 const g=await evaluate('const tree=document.querySelector(".bm-tree-scroll"),input=document.querySelector(".od-conversation-input"),dock=document.querySelector(".od-conversation-dock"),a=input?.getBoundingClientRect(),b=dock?.getBoundingClientRect();return {treeCssHeight:tree?.clientHeight||0,composerVisible:!!a&&!!b&&a.bottom<=b.bottom+1&&a.top>=b.top}');
 assert.ok(g.treeCssHeight>=36,'split Dock collapsed the bookmark tree '+JSON.stringify(g));
 assert.ok(g.composerVisible,'split Dock hid the chat composer '+JSON.stringify(g));
 return g;
}
function assertGeometry(g){assert.ok(g.appOverflow<=1,JSON.stringify(g));for(const e of g.controls){assert.ok(e.inside&&e.hittable,'Icon bounds/hit '+JSON.stringify(e));assert.ok(Math.abs(e.dx)<.7&&Math.abs(e.dy)<.7,'Icon center '+JSON.stringify(e));assert.equal(e.padding,'0px');assert.equal(e.type,'button')}assert.deepEqual(g.overflow,[])}
async function contrast(){return evaluate(String.raw`const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const parse=s=>s.startsWith('color(srgb')?s.match(/[\d.]+/g).map(Number).slice(0,3).map(x=>x*255):s.match(/[\d.]+/g).map(Number);
 const over=(a,b)=>{const alpha=a[3]??1;return a.slice(0,3).map((v,i)=>v*alpha+b[i]*(1-alpha)).concat(1)};
 const bg=e=>{if(!e)return [255,255,255,1];return over(parse(getComputedStyle(e).backgroundColor),bg(e.parentElement))};
 const rows=[];function sample(e,color,text,threshold=4.5){const fg=parse(color),back=bg(e),levels=[lum(over(fg,back)),lum(back)].sort((a,b)=>a-b),ratio=(levels[1]+.05)/(levels[0]+.05);rows.push({text,ratio,threshold,foreground:color,background:back.slice(0,3)})}
 for(const e of document.querySelectorAll('.bm-app *, .od-conversation-dock *')){if(!e.getClientRects().length||!e.textContent.trim()||e.disabled)continue;if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;sample(e,getComputedStyle(e).color,e.textContent.trim().slice(0,65));}
 const input=document.querySelector('.od-conversation-input');if(input?.getClientRects().length)sample(input,getComputedStyle(input,'::placeholder').color,'textarea placeholder');
 for(const e of document.querySelectorAll('.bm-topbar .bm-icon-btn:not(:disabled)')){if(e.getClientRects().length)sample(e,getComputedStyle(e).color,'icon '+e.getAttribute('aria-label'),3)}return rows;`)}
const formal=resolve(process.env.BOOKMARK_REACT_PREVIEW_HTML);
const preview=resolve(here,'../dev.html');
const inputPaths=['../../src/react/App.jsx','../../src/react/style.css','src/main.jsx','src/formal.jsx',
 '../../src/model.js','../../src/service.js','vite.config.mjs','package-lock.json',
 '../../../../../src/ui/design-tokens.css','../../../../../src/ui/design-system.css',
 '../../../../../src/ui/react/components/ui/button.tsx','../../../../../src/ui/react/components/conversation.tsx',
 '../../../../../src/ui/conversation/bookmark-actions.js','../../../../../scripts/preview/bookmark-manager-mock.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(inputPaths.map(async p=>[p,createHash('sha256').update(await readFile(resolve(here,p))).digest('hex')])));
const before=await hashes();let browser;
try{
 const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'isolated Chromium');
 const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true})});
 socket.addEventListener('message',event=>{
  const r=JSON.parse(event.data),session=r.sessionId;
  if(r.id&&pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);r.error?p.fail(Error(r.error.message)):p.ok(r.result)}
  if(r.method==='Runtime.executionContextCreated'){const c=r.params.context;contexts.set((session||'root')+':'+c.id,{contextId:c.id,session})}
  if(r.method==='Runtime.executionContextDestroyed')contexts.delete((session||'root')+':'+r.params.executionContextId);
  if(r.method==='Target.attachedToTarget'){const s=r.params.sessionId;void Promise.all([cdp('Runtime.enable',{},s),cdp('Network.enable',{},s)]).catch(e=>exceptions.push(String(e)))}
  if(r.method==='Runtime.exceptionThrown')exceptions.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);
  if(r.method==='Network.requestWillBeSent'&&/^https?:/.test(r.params.request.url))network.push(r.params.request.url);
 });
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
 await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
 browser=await cdp('Browser.getVersion');
 currentCase='formal-shortest-core';await load(formal,320);
 await check('five header icons: coordinate clicks, sheets, refresh, conversation',async()=>{
  for(const label of ['新建书签','新建文件夹','收藏当前页']){
   await click('.bm-topbar [aria-label="'+label+'"]');
   await until(()=>evaluate('return !!document.querySelector(".bm-sheet")'),'editor '+label);
   const name=await evaluate('return document.querySelector("#bm-edit-name").value');
   if(label==='收藏当前页')assert.ok(name);
   await click('.bm-sheet .bm-editor-actions .bm-button:not(.bm-button--primary)');
  }
  await click('.bm-topbar [aria-label="刷新书签"]');
  await until(()=>evaluate('return !document.querySelector(".bm-topbar [aria-label=刷新书签]").disabled'),'refresh finished');
  await ensureDockOpen();
  assert.equal(await evaluate('return document.activeElement.id'),'od-conversation-input');
  await click('.od-conversation-samples button');
  assert.equal(await evaluate('return document.querySelector(".od-conversation-controls [aria-label=发送]").disabled'),true);
  assert.match(await evaluate('return document.querySelector(".od-conversation-controls").textContent'),/未连接模型/);
  return {screenshot:await screenshot('formal-320-offline-send'),mockOnly:true};
 });
 for(const width of (process.env.BOOKMARK_R13_SMOKE?[320]:[320,360,400,440,960,1280]))for(const dark of [false,true])for(const zoom of [1,2]){
  currentCase={width,theme:dark?'dark':'light',zoom,entry:'App.jsx + offline fixed-phrase adapter'};
  const viewport=await load(preview,width,dark,zoom);
  await check('conversation geometry, icon hit targets, contrast, focus and keyboard',async()=>{
   assertGeometry(await geometry());
   // Select an editable fixture folder. The default Chrome root is locked in
   // this fixture and bookmark-actions rejects it as a write target; that
   // separate action/Host contract belongs to the primary agent.
   await click('[data-node-id="10"]');
   await ensureDockOpen();
   assert.equal(await evaluate('return document.activeElement.id'),'od-conversation-input');
   assert.equal(await evaluate('return document.querySelector(".bm-workspace").getClientRects().length>0 && document.querySelector("#bm-search").getClientRects().length>0'),true,'tree and search remain visible while chat is open');
   const hoveredColors=await contrast();
   assert.deepEqual(hoveredColors.filter(c=>c.ratio<c.threshold),[],'hovered header contrast');
   await click('.od-conversation-samples button');
   assert.match(await evaluate('return document.getElementById("od-conversation-input").value'),/AI 工具/);
   // Keep the action-layer URL canonicalization gap visible in the report;
   // this UI happy path uses an explicit canonical URL accepted by Service.
   await input('#od-conversation-input','创建一个叫 AI 工具的文件夹，并把 https://example.com/ 收藏进去');
   await key('Tab');
   assert.equal(await evaluate('return document.activeElement.getAttribute("aria-label")'),'发送');
   const focus=await evaluate('const s=getComputedStyle(document.activeElement);return {visible:document.activeElement.matches(":focus-visible"),style:s.outlineStyle,width:s.outlineWidth}');
   assert.ok(focus.visible&&focus.style!=='none'&&parseFloat(focus.width)>=2,JSON.stringify(focus));
   await key(' ',0); // browser keyboard activation; submit actual App form
   await until(()=>evaluate('return document.querySelectorAll(".od-conversation-entry").length>=3'),'mock create + bookmark verified');
   assert.match(await evaluate('return document.querySelector(".od-conversation-log").textContent'),/已创建/);
   assertGeometry(await geometry());
   await assertDockKeepsTreeVisible();
   const colors=await contrast();
   assert.ok(colors.length>5,'rendered text contrast samples');
   assert.deepEqual(colors.filter(c=>c.ratio<c.threshold),[],'text/placeholder contrast >=4.5 and enabled icons >=3');
   const name='conversation-'+width+'-'+(dark?'dark':'light')+'-'+(zoom*100);
   const screenshotFile=await screenshot(name);
   await input('#od-conversation-input','把刚才收藏的书签改名为 React 文档');await key('Enter');
   await until(()=>evaluate('return document.querySelectorAll(".od-conversation-entry").length>=5'),'mock multi-turn rename');
   assert.match(await evaluate('return document.querySelector(".od-conversation-log").textContent'),/React 文档/);
   await click('.bm-topbar [aria-label="对话"]');
   await input('#bm-search','React 文档');
   await until(()=>evaluate('return [...document.querySelectorAll(".bm-node-title")].some(e=>e.textContent==="React 文档")'),'list reflects mock rename');
   matrix.push({...currentCase,status:'PASS',viewport,minContrast:Math.min(...colors.map(c=>c.ratio)),focus,screenshot:screenshotFile});
   return {screenshot:screenshotFile,minContrast:Math.min(...colors.map(c=>c.ratio))};
  });
 }
 for(const physicalWidth of (process.env.BOOKMARK_R13_SMOKE?[320]:[320,360,400,440,960,1280]))for(const dark of [false,true]){
  currentCase={physicalWidth,layoutWidth:physicalWidth/2,theme:dark?'dark':'light',zoom:2,fixedPhysicalHeight:800};
  const viewport=await load(preview,physicalWidth/2,dark,2);
  await evaluate('document.getElementById("opendesk-preview-frame").style.height="800px";',outer);
  await check('200% CSS zoom reflow at fixed physical width/height',async()=>{
   assertGeometry(await geometry());
   await ensureDockOpen();
   await click('.od-conversation-samples button');
   assertGeometry(await geometry());
   await assertDockKeepsTreeVisible();
   const screenshotFile=await screenshot('reflow-physical-'+physicalWidth+'-'+(dark?'dark':'light')+'-200');
   matrix.push({...currentCase,status:'PASS',viewport,screenshot:screenshotFile});
   return {screenshot:screenshotFile};
  });
 }
 currentCase='r15-two-turn-verified-folder-and-current-page';
 await load(preview,360);
 await check('R1.5 real React click path: create, follow up, search filter, locate virtual node',async()=>{
  await click('[data-node-id="10"]');
  await ensureDockOpen();
  await input('#od-conversation-input','创建 AI 工具文件夹');await key('Enter');
  await until(()=>evaluate('return [...document.querySelectorAll(".bm-node-title")].some(e=>e.textContent==="AI 工具")'),'R15 folder visible');
  const folderId=await evaluate('return [...document.querySelectorAll(".bm-tree-row")].find(e=>e.querySelector(".bm-node-title")?.textContent==="AI 工具")?.dataset.nodeId');
  assert.ok(folderId,'actual fixture folder ID must be rendered');
  await input('#od-conversation-input','把当前网页收藏进去');await key('Enter');
  await until(()=>evaluate('return [...document.querySelectorAll(".bm-node-title")].some(e=>e.textContent==="模拟当前页")'),'R15 current page readback in tree');
  assert.match(await evaluate('return document.querySelector(".od-conversation-log").textContent'),/已收藏书签/);
  await input('#bm-search','不存在的搜索词');
  await input('#od-conversation-input','创建 R15 测试文件夹');await key('Enter');
  await until(()=>evaluate('return !!document.querySelector(".bm-ai-reveal")'),'filtered verified result offered');
  assert.equal(await evaluate('return document.querySelector("#bm-search").value'),'不存在的搜索词');
  assert.match(await evaluate('return document.querySelector(".bm-ai-reveal").textContent'),/清除搜索并定位/);
  await click('.bm-ai-reveal button');
  await until(()=>evaluate('return [...document.querySelectorAll(".bm-node-title")].some(e=>e.textContent==="R15 测试")'),'R15 revealed target');
  const rect=await evaluate(`const row=[...document.querySelectorAll(".bm-tree-row")].find(e=>e.querySelector(".bm-node-title")?.textContent==="R15 测试");
   const scroller=document.querySelector(".bm-tree-scroll"),a=row.getBoundingClientRect(),b=scroller.getBoundingClientRect();
   return {visible:a.top>=b.top-1&&a.bottom<=b.bottom+1,active:row.classList.contains("is-active"),search:document.querySelector("#bm-search").value};`);
  assert.equal(rect.search,'');
  assert.ok(rect.visible,'verified node remains visible in virtual viewport '+JSON.stringify(rect));
  return {folderId,rect,screenshot:await screenshot('r15-two-turn-verified-reveal-360'),mockOnly:true};
 });
 currentCase='long-unbroken-message-320-dark-200';await load(preview,160,true,2);
 await evaluate('document.getElementById("opendesk-preview-frame").style.height="800px";',outer);
 await check('long message wrapping and multiline keyboard input',async()=>{
  await ensureDockOpen();
  await input('#od-conversation-input','长文本'+('https://example.com/'+('path'.repeat(250))));
  await key('Enter',8);
  assert.ok((await evaluate('return document.getElementById("od-conversation-input").value')).includes('\n'),'Shift+Enter preserves newline');
  assert.equal(await evaluate('return document.querySelectorAll(".od-conversation-entry").length'),0);
  await key('Enter');await until(()=>evaluate('return document.querySelectorAll(".od-conversation-entry").length>=2'),'long mock reply');
  assertGeometry(await geometry());return {screenshot:await screenshot('long-message-physical-320-dark-200')};
 });
 currentCase='transcript-scroll-320';await load(preview,320);
 await ensureDockOpen();
 await check('new conversation replies remain visible after log fills',async()=>{
  for(let i=0;i<9;i++){await input('#od-conversation-input','找出 React 相关书签');await key('Enter');await until(()=>evaluate('return document.querySelectorAll(".od-conversation-entry").length>='+((i+1)*2)),'search reply '+i)}
  const scroll=await evaluate('const e=document.querySelector(".od-conversation-log");return {scrollTop:e.scrollTop,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,bottom:e.scrollHeight-e.clientHeight-e.scrollTop}');
  await screenshot('transcript-scroll-320');assert.ok(scroll.bottom<=2,'latest verified reply must be visible '+JSON.stringify(scroll));return scroll;
 });
 assert.deepEqual(await hashes(),before,'relevant App/preview sources stable');
 assert.deepEqual(exceptions,[],'no uncaught browser exceptions');assert.deepEqual(network,[],'no real network or AI requests');
}catch(e){checks.push({case:currentCase,name:'runner',status:'FAIL',error:String(e.stack||e)})}
finally{
 const failed=checks.filter(c=>c.status==='FAIL');
 const report={kind:'CONVERSATION_R13_CHROMIUM_MOCK_PREVIEW_NOT_NATIVE',status:failed.length?'FAIL':'PASS',nativeVerified:false,installed:false,
  zoomMethod:'DOCUMENT_CSS_ZOOM_WITH_MEASURED_LAYOUT_AND_PHYSICAL_VIEWPORT; NOT_NATIVE_BROWSER_MENU_ZOOM',browser:browser?.product,sourceHashes:before,
  commands:{runner:'CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BOOKMARK_REACT_EVIDENCE_DIR=artifacts/conversation-r13-local/ui node examples/sidebar-tools/bookmark-manager/preview/react/run-chrome.mjs --conversation-r13'},
  knownActionGaps:[{status:'FAIL_OUTSIDE_UI_WRITE_SCOPE',operation:'Send default sample without selecting an editable folder',observed:'bookmark-actions rejects protected default root as target'},
   {status:'FAIL_OUTSIDE_UI_WRITE_SCOPE',operation:'Send sample with non-canonical https://example.com after selecting editable folder',observed:'Folder verified; bookmark URL normalized to trailing slash by Service, action readback rejects expected non-canonical URL; E_OUTCOME_UNKNOWN blocks replay'}],
  checks,matrix,exceptions,network};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,pass:checks.length-failed.length,fail:failed.length,failures:failed.map(c=>({case:c.case,name:c.name,error:c.error})),matrix:matrix.length,report:join(out,'report.json')},null,2));
 if(failed.length)process.exitCode=1;
 socket?.close();chrome.kill('SIGTERM');await wait(200);await rm(profile,{recursive:true,force:true});
}
