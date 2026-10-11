import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {KNOWLEDGE_DATA_KEY} from '../../src/knowledge/policy.js';

// Browser-backed smoke: a real unpacked production MV3 extension and real
// user-input CDP clicks, using a local fixture. Public-site acceptance remains
// NOT TESTED until a separately recorded genuine public website run.
const chromeCandidates=[process.env.CHROME_BIN,'google-chrome','chromium','google-chrome-stable'].filter(Boolean);
const chromeBinary=chromeCandidates.find(x=>spawnSync(x,['--version'],{stdio:'ignore'}).status===0);
function socket(url){
 const ws=new WebSocket(url),pending=new Map();let seq=0,observe=()=>{};
 const ready=new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
 ws.onmessage=event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id)return observe(msg);
  const result=pending.get(msg.id);if(!result)return;
  clearTimeout(result.timer);pending.delete(msg.id);
  msg.error?result.reject(Error(msg.error.message)):result.resolve(msg.result);
 };
 return {ready,onEvent(fn){observe=fn;},
  send(method,params={},timeout=15000,sessionId){
   return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
   });
  },close(){ws.close();for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('CDP_CLOSED'));}pending.clear();}
 };
}
async function evalIn(target,expression){
 const result=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},20000);
 if(result.exceptionDetails)throw Error('CDP_PAGE_EXCEPTION '+JSON.stringify(result.exceptionDetails).slice(0,350));
 return result.result.value;
}
async function until(fn,what){
 for(let i=0;i<90;i++){try{const out=await fn();if(out)return out;}catch{}await pause(170);}
 throw Error('Native Chrome timeout: '+what);
}
async function click(target,selector){
 await evalIn(target,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled||!e.getClientRects().length)throw Error("CONTROL_UNAVAILABLE");e.scrollIntoView({block:"center"});return true;})()');
 // Sandbox resize messages are asynchronous. Settle layout before mouse down
 // so the release cannot hit a different position after the iframe grows.
 await pause(120);
 const rect=await evalIn(target,"(()=>{const e=document.querySelector("+JSON.stringify(selector)+
  ");if(!e||e.disabled||!e.getClientRects().length)throw Error('CONTROL_UNAVAILABLE');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 for(const type of ['mousePressed','mouseReleased'])await target.send('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1});
}
const fixture=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>知识收件箱 · 受控页面</title>
<style>body{font:16px/1.6 system-ui;max-width:820px;margin:35px auto;padding:20px}article{padding:14px;border-bottom:1px solid #ddd}button{padding:8px}pre{background:#eee;padding:15px}</style>
<button id="fixture-stream">切换生成状态</button><button id="fixture-spa">切换对话</button>
<main><article data-testid="conversation-turn-0"><div data-message-author-role="user">怎样建立自己的知识库？</div></article>
<article data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="fixture-answer-1">
<div class="markdown"><h2>知识资产</h2><p>第一段包含中文、<strong>粗体</strong>和可复用想法。</p>
<pre><code class="language-js">const first = 1;


const second = 2;</code></pre></div>
<div class="markdown"><h3>后续整理</h3><ul><li>补充标签</li><li>编辑草稿</li></ul><p>第二块 Markdown 必须一起保存。</p></div></div>
<div class="official-actions"><button data-testid="copy-turn-action-button">官方复制</button><button>反馈</button></div></article>
<article data-testid="conversation-turn-2"><div data-message-author-role="user">有什么灵感？</div></article>
<article data-testid="conversation-turn-3"><div data-message-author-role="assistant" data-message-id="fixture-answer-2"><p>这是另一条独立回答。</p></div><div><button data-testid="copy-turn-action-button">官方复制</button></div></article>
<article hidden><div data-message-author-role="assistant" data-message-id="hidden-answer" class="result-streaming">隐藏的分支</div></article></main>
<script>
document.querySelector('#fixture-stream').onclick=()=>{const node=document.querySelector('[data-message-id="fixture-answer-2"]');node.classList.toggle('result-streaming');};
document.querySelector('#fixture-spa').onclick=()=>{history.pushState({},'', '/c/another-controlled-fixture');document.querySelector('main').innerHTML='<article><div data-message-author-role="assistant" data-message-id="new-chat-answer"><h2>新对话</h2><p>只应该有一排新的保存按钮。</p></div><div><button data-testid="copy-turn-action-button">官方复制</button></div></article>';};
</script></html>`;
async function nativeText(target,selector,text){
 await click(target,selector);
 const modifiers=process.platform==='darwin'?4:2;
 await target.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers,commands:['selectAll']});
 await target.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers});
 const selection=await evalIn(target,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');return {focused:document.activeElement===e,start:e.selectionStart,end:e.selectionEnd,length:e.value.length};})()');
 assert.ok(selection.focused&&selection.start===0&&selection.end===selection.length,'Native select-all must select the entire control '+JSON.stringify(selection));
 await target.send('Input.insertText',{text});
 assert.equal(await evalIn(target,'document.querySelector('+JSON.stringify(selector)+').value'),text,'Native text input must replace the full control');
}
async function nativeKey(target,key,virtualKey,modifiers=0){
 const code={a:'KeyA',s:'KeyS','/':'Slash'}[key]||key;
 const mac={Tab:48,ArrowDown:125,ArrowUp:126,Home:115,End:119,Enter:36,Escape:53,a:0,s:1,'/':44};
 const params={key,code,windowsVirtualKeyCode:virtualKey,modifiers,
  ...(process.platform==='darwin'?{nativeVirtualKeyCode:mac[key]??virtualKey}:{})};
 await target.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...params});
 if(key==='Enter')await target.send('Input.dispatchKeyEvent',{type:'char',...params,text:'\r',unmodifiedText:'\r'});
 if(key==='/')await target.send('Input.dispatchKeyEvent',{type:'char',...params,text:'/',unmodifiedText:'/'});
 await target.send('Input.dispatchKeyEvent',{type:'keyUp',...params});
}
async function tabTo(target,selector){
 for(let i=0;i<35;i++){
  if(await evalIn(target,'document.activeElement?.matches('+JSON.stringify(selector)+')'))return;
  await nativeKey(target,'Tab',9);
 }
 throw Error('Native Tab could not reach '+selector);
}
async function pageButton(target,messageId,label){
 const expression=`(()=>{const reply=document.querySelector('[data-message-id="${messageId}"]');const root=reply.closest('article').querySelector('[data-opendesk-capture-root]');return [...root.shadowRoot.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});})()`;
 const rect=await evalIn(target,`(()=>{const b=${expression};if(!b||b.disabled)throw Error('disabled');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 for(const type of ['mousePressed','mouseReleased'])await target.send('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1});
}
test('Knowledge R1 Chrome: reviewed install, capture, persistent editor and inline confirmation',{timeout:190000},async t=>{
 assert.ok(chromeBinary,'Real Chrome for Testing is required; fixture-only/node test cannot replace it');
 const screenshots=resolve(process.env.OPENDESK_KNOWLEDGE_EVIDENCE_DIR||'artifacts/knowledge-inbox-r1');
 await mkdir(screenshots,{recursive:true});
 const profile=await mkdtemp(join(tmpdir(),'opendesk-knowledge-r1-cft-'));
 const url='https://chatgpt.com/c/opendesk-controlled-fixture';
 const extension=resolve(process.env.OPENDESK_KNOWLEDGE_EXTENSION_DIR||'dist/production');
 assert.equal(JSON.parse(await readFile(join(extension,'manifest.json'),'utf8')).name,'OpenDesk Browser');
 const args=[...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
  '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+profile,'--disable-extensions-except='+extension,
  '--load-extension='+extension,'about:blank'];
 const chrome=spawn(chromeBinary,args,{stdio:['ignore','ignore','pipe']});
 let browser=null,host=null,article=null,side=null,clip=null,workbench=null,logs='',passed=false;
 chrome.stderr.on('data',b=>{logs=(logs+b).slice(-3000);});
 t.after(async()=>{
  await writeFile(join(screenshots,'chrome-stderr.log'),logs.replaceAll(profile,'<isolated-profile>'));
  if(!passed){
   const diagnostics={status:'FAIL',platform:process.platform,sourceCommit:process.env.GITHUB_SHA||null};
   if(clip)try{diagnostics.tool=await evalIn(clip,'(()=>{const ids=["ki-save","ki-note","ki-content","ki-status"];return {viewport:{width:innerWidth,height:innerHeight,scrollY},active:document.activeElement?.id,controls:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,disabled:e.disabled,text:e.textContent?.slice(0,180),value:id==="ki-note"?e.value:undefined,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})};})()');}catch{}
   for(const [name,target] of [['side',side],['article',article]])if(target){
    try{const shot=await target.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},3000);
     await writeFile(join(screenshots,'failure-'+name+'.png'),Buffer.from(shot.data,'base64'));}catch{}
   }
   await writeFile(join(screenshots,'failure.json'),JSON.stringify(diagnostics,null,2)+'\n');
  }
  for(const c of [workbench,clip,host,article,browser])c?.close?.();
  if(chrome.exitCode===null&&chrome.signalCode===null){
   await new Promise(done=>{const timer=setTimeout(()=>chrome.kill('SIGKILL'),2500);
    chrome.once('close',()=>{clearTimeout(timer);done();});chrome.kill('SIGTERM');});
  }
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
 });
 let port=0;
 for(let i=0;i<120;i++){
  if(chrome.exitCode!==null)throw Error('Chrome exited: '+logs);
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
  await pause(150);
 }
 assert(port,'Chrome DevToolsActivePort not available: '+logs);
 const base='http://127.0.0.1:'+port;
 const version=await(await fetch(base+'/json/version')).json();
 browser=socket(version.webSocketDebuggerUrl);await browser.ready;
 async function openTab(address){
  const {targetId}=await browser.send('Target.createTarget',{url:address});
  const ws=await until(async()=>{
   const list=await(await fetch(base+'/json/list')).json();
   return list.find(x=>x.id===targetId)?.webSocketDebuggerUrl;
  },'tab target');
  const cdp=socket(ws);await cdp.ready;await cdp.send('Runtime.enable');await cdp.send('Page.enable');
  return {targetId,cdp};
 }
 async function iframeWith(selector){
  const target=await until(async()=>{
   const {targetInfos}=await browser.send('Target.getTargets');
   return targetInfos.find(x=>x.type==='iframe'&&x.url?.includes('/sidebar-tools/sandbox.html'));
  },'sandbox CDP target');
  const attached=await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const frame={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
  await frame.send('Runtime.enable');await frame.send('Page.enable');
  await until(()=>evalIn(frame,'!!document.querySelector('+JSON.stringify(selector)+')'),'tool UI '+selector);
  return frame;
 }

 const page=await openTab('about:blank');article=page.cdp;
 article.onEvent(event=>{if(event.method==='Fetch.requestPaused')void article.send('Fetch.fulfillRequest',{
   requestId:event.params.requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'text/html; charset=utf-8'}],body:Buffer.from(fixture).toString('base64')});});
 await article.send('Fetch.enable',{patterns:[{urlPattern:'https://chatgpt.com/*',resourceType:'Document'}]});
 await article.send('Page.navigate',{url});
 await until(()=>evalIn(article,'document.title.includes("受控页面")'),'controlled ChatGPT-shaped fixture loaded');
 const extensionId=await until(async()=>{
  const items=(await browser.send('Target.getTargets')).targetInfos;
  return items.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[^/]+\/sw\.js/.test(x.url||''))?.url?.split('/')[2];
 },'MV3 worker');
 const ui=await openTab('chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID());host=ui.cdp;
 await until(()=>evalIn(host,'!!document.querySelector("#sidebar-tool-official-knowledge-inbox-install")'),'tool host');
 // Test harness control opens a real SIDE_PANEL with a real Chrome gesture.
 // It supplies no content, grants, package data or fake native acknowledgement.
 const windowId=await evalIn(host,'chrome.windows.getCurrent().then(w=>w.id)');
 await evalIn(host,"(()=>{const b=document.createElement('button');b.id='knowledge-test-open-panel';b.textContent='Open test Side Panel';b.style.cssText='position:fixed;top:70px;left:20px;min-width:200px;min-height:45px;z-index:999999';b.addEventListener('click',()=>chrome.sidePanel.open({windowId:"+windowId+"}));document.body.append(b);return true;})()");
 await click(host,'#knowledge-test-open-panel');
 const context=await until(async()=>{const rows=await evalIn(host,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");return rows.find(x=>x.documentUrl?.includes('/ui/tool.html'));},'real SIDE_PANEL context');
 const sideTarget=await until(async()=>{const {targetInfos}=await browser.send('Target.getTargets');return targetInfos.find(x=>x.url===context.documentUrl);},'Side Panel target');
 const attached=await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true});
 side={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
 await side.send('Runtime.enable');await side.send('Page.enable');
 await until(()=>evalIn(side,'!!document.querySelector("#tab-tools")'),'Tools tab');await click(side,'#tab-tools');
 // R4.8 separates installed tools from discovery. The official install
 // button exists in the DOM but is not actionable until this tab is opened.
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-discover-tab")?.disabled'),'Discovery tab ready');
 await click(side,'#sidebar-tool-discover-tab');
 await until(()=>evalIn(side,'document.querySelector("#sidebar-tool-discover-tab")?.getAttribute("aria-selected")==="true" && !document.querySelector("#sidebar-tool-discover-panel").hidden'),'visible official discovery');
 assert.equal(await evalIn(article,'document.querySelectorAll("[data-opendesk-capture-root]").length'),0,'No controls before installation and consent');
 try{
   await until(()=>evalIn(side,'(()=>{const b=document.querySelector("#sidebar-tool-official-knowledge-inbox-install");return !!b&&!b.disabled&&!!b.getClientRects().length;})()'),'official knowledge install button ready');
 }catch(error){
   const detail=await evalIn(side,'(()=>{const root=document.querySelector("#sidebar-tool-official-catalog"),button=document.querySelector("#sidebar-tool-official-knowledge-inbox-install");return {rootPresent:!!root,rootText:root?.textContent?.slice(0,650),buttonPresent:!!button,disabled:button?.disabled,buttonLabel:button?.textContent,rootHidden:root?.hidden,discoverySelected:document.querySelector("#sidebar-tool-discover-tab")?.getAttribute("aria-selected"),discoveryHidden:document.querySelector("#sidebar-tool-discover-panel")?.hidden,toolsSelected:document.querySelector("#tab-tools")?.getAttribute("aria-selected"),toolStatus:document.querySelector("#sidebar-tool-status")?.textContent?.slice(0,300)};})()');
   console.log('KNOWLEDGE_STAGE: official catalog diagnostic',JSON.stringify(detail));
   throw error;
 }
 await click(side,'#sidebar-tool-official-knowledge-inbox-install');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-preview").hidden'),'review');
 assert.equal(await evalIn(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0,'Review does not execute the package');
 await click(side,'#sidebar-tool-install');
 console.log('KNOWLEDGE_STAGE: package reviewed and installation clicked');
 const installed='[data-sidebar-tool-action=open][data-sidebar-tool-id=knowledge-inbox]';
 try{
   await until(()=>evalIn(side,'(()=>{const b=document.querySelector('+JSON.stringify(installed)+');return !!b&&!b.disabled&&!!b.getClientRects().length;})()'),'installed');
 }catch(error){
   const detail=await evalIn(side,'(()=>({list:document.querySelector("#sidebar-tool-list")?.textContent?.slice(0,500),myVisible:!document.querySelector("#sidebar-tool-my-panel")?.hidden,previewHidden:document.querySelector("#sidebar-tool-preview")?.hidden,status:document.querySelector("#sidebar-tool-status")?.textContent?.slice(0,300)}))()');
   console.log('KNOWLEDGE_STAGE: installed-list diagnostic',JSON.stringify(detail));
   throw error;
 }
 assert.equal(await evalIn(article,'document.querySelectorAll("[data-opendesk-capture-root]").length'),0,'Install alone does not grant content access');
 let acceptDialog=true,dialogs=0;
 browser.onEvent(event=>{if(event.method==='Page.javascriptDialogOpening'&&event.sessionId===attached.sessionId){dialogs++;void browser.send('Page.handleJavaScriptDialog',{accept:acceptDialog},15000,attached.sessionId);}});
 await browser.send('Target.activateTarget',{targetId:page.targetId});await article.send('Page.bringToFront');
 // The product now keeps authorization in the installed tool's detail Settings,
 // not in the compact installed-tools list.
 await click(side,installed);
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-display").hidden'),'knowledge detail');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-open").hidden'),'knowledge Settings available');
 await click(side,'#sidebar-tool-settings-open');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-view").hidden'),'knowledge Settings opened');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-allow").disabled'),'ChatGPT origin available');
 await click(side,'#sidebar-tool-settings-allow');
 console.log('KNOWLEDGE_STAGE: origin consent clicked through tool Settings');
 await until(()=>evalIn(article,'document.querySelectorAll("[data-opendesk-capture-root]").length===2'),'one row per visible reply');
 await until(()=>evalIn(article,'![...document.querySelector("[data-opendesk-capture-root]").shadowRoot.querySelectorAll("button")][0].disabled'),'settled reply');
 assert.ok(dialogs<=1,'A single explicit site grant must not trigger repeated browser dialogs');
 assert.equal(await evalIn(article,'(()=>{const t=document.querySelector("[data-testid=conversation-turn-1]");return t.querySelector("[data-opendesk-capture-root]").getBoundingClientRect().top>=t.querySelector(".official-actions").getBoundingClientRect().bottom;})()'),true,'Row below official controls');
 await pageButton(article,'fixture-answer-1','保存');
 const dataKey=KNOWLEDGE_DATA_KEY;
 const readStore='chrome.storage.local.get('+JSON.stringify(dataKey)+').then(v=>v['+JSON.stringify(dataKey)+'])';
 const captured=await until(async()=>{const result=await evalIn(side,readStore);return result?.records?.length===1?result:null;},'actual extension persistence');
 console.log('KNOWLEDGE_STAGE: native capture persisted');
 assert.match(captured.records[0].markdown,/第二块 Markdown/);assert.match(captured.records[0].markdown,/const first = 1;\n\n\nconst second = 2;/);
 assert.match(captured.records[0].question,/怎样建立/);assert.equal(captured.records[0].source,url);
 await pageButton(article,'fixture-answer-1','保存');
 await until(()=>evalIn(article,'document.querySelector("[data-opendesk-capture-root]").shadowRoot.querySelector(".status").textContent.includes("已在收件箱")'),'dedup confirmation');
 assert.equal((await evalIn(side,readStore)).records.length,1);
 await click(article,'#fixture-stream');
 await until(()=>evalIn(article,'document.querySelector("[data-testid=conversation-turn-3] [data-opendesk-capture-root]").shadowRoot.querySelector("button").disabled'),'streaming blocks capture');
 await click(article,'#fixture-stream');
 // Reopen after capture so its initial list reads already-persisted knowledge
 // through the same sandbox request path as a real user opening the tool.
 await click(side,'#sidebar-tool-back'); // Settings → tool detail
 await click(side,'#sidebar-tool-back'); // tool detail → installed list
 await click(side,installed);
 clip=await iframeWith('#ki-records');
 const visualMetrics=[];
 async function captureState(state,widths=[360,400,600,1000]){
   for(const width of widths){
     await side.send('Emulation.setDeviceMetricsOverride',{width,height:869,deviceScaleFactor:1,mobile:false});
     for(const mode of ['light','dark']){
       const media={features:[{name:'prefers-color-scheme',value:mode}]};
       await side.send('Emulation.setEmulatedMedia',media);
       await clip.send('Emulation.setEmulatedMedia',media);
       await pause(80);
       const metrics=await evalIn(clip,'({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,reader:!document.querySelector("#ki-reader").hidden,editor:!document.querySelector("#ki-editor").hidden})');
       visualMetrics.push({state,width,theme:mode,...metrics});
       assert.ok(metrics.scroll<=metrics.client+2,'Knowledge iframe horizontal overflow '+JSON.stringify(visualMetrics.at(-1)));
       const shot=await side.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
       await writeFile(join(screenshots,state+'-'+width+'-'+mode+'.png'),Buffer.from(shot.data,'base64'));
     }
   }
   await side.send('Emulation.clearDeviceMetricsOverride');
 }

 await until(()=>evalIn(clip,'document.querySelectorAll(".ki-record").length===1'),'saved inbox');
 await captureState('list');
 // Search-empty is not the same as an empty inbox. Exercise real keyboard input and clear action.
 await nativeText(clip,'#ki-search','R24-no-matching-answer-987654321');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-empty").hidden && document.querySelector("#ki-empty-title").textContent==="没有符合条件的记录"'),'search without results');
 await captureState('search-empty',[360,400]);
 await click(clip,'#ki-clear');
 await until(()=>evalIn(clip,'document.querySelectorAll(".ki-record").length===1 && document.querySelector("#ki-search").value===""'),'cleared search restores result');
 await click(clip,'.ki-record');await until(()=>evalIn(clip,'!document.querySelector("#ki-detail").hidden'),'record reader');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-editor").hidden'),true,'opens in reading mode');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-view-title").textContent'),'知识资产','record title remains visible');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-markdown h2")===null'),true,'identical first Markdown heading is not shown twice');
  assert.equal((await evalIn(side,readStore)).records[0].markdown.includes('## 知识资产'),true,'original Markdown heading remains intact');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-markdown pre code")?.textContent.includes("const first = 1")'),true);
 await captureState('reader');
 await click(clip,'#ki-edit');
 await until(()=>evalIn(clip,'document.activeElement?.id==="ki-content"'),'edit focuses enabled Markdown field');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-save").disabled'),true,'save stays disabled before edits');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-detail").dataset.mode'),'edit');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-toolbar").hidden'),true,'read-only actions hidden in edit mode');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-view-title").hidden'),true,'duplicate read title is removed from editing');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-editor-extra").open'),false,'low-frequency metadata stays collapsed');
  const firstBodyTop=await evalIn(clip,'document.querySelector("#ki-content").getBoundingClientRect().top');
  assert.ok(firstBodyTop<230,'Markdown body must start within compact edit header: '+firstBodyTop);
  await captureState('edit-compact',[360,400]);
  // Ensure Save is visible within the actual outer Side Panel viewport,
  // not merely within an oversized sandbox iframe.
  await side.send('Emulation.setDeviceMetricsOverride',{width:360,height:869,deviceScaleFactor:1,mobile:false});
  await pause(120);
  const frameArea=await evalIn(side,'(()=>{const r=document.querySelector("#sidebar-tool-frame iframe").getBoundingClientRect();return {top:r.top,viewport:window.innerHeight};})()');
  const saveBottom=await evalIn(clip,'document.querySelector("#ki-save").getBoundingClientRect().bottom');
  assert.ok(frameArea.top+saveBottom<frameArea.viewport-10,'Save must be visible without scrolling outer panel: '+JSON.stringify({frameArea,saveBottom}));
  await side.send('Emulation.clearDeviceMetricsOverride');
  const edited='# 我的编辑稿\n\n已整理内容\n\n<script>alert(1)</script>\n\n![远程图片](https://evil.example/track.png)';
  await nativeText(clip,'#ki-content',edited);
 await click(clip,'#ki-editor-extra>summary');
 await nativeText(clip,'#ki-tags',Array.from({length:13},(_,i)=>'标签'+i).join(', '));
 await until(()=>evalIn(clip,'document.querySelector("#ki-save").disabled'),'invalid tag count blocks saving');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-edit-validation").textContent.includes("12 个标签")'),true,'limit error is visible without hiding the writing area');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-editor-extra").dataset.invalid'),'true','metadata affordance indicates invalid values');
 await nativeText(clip,'#ki-tags','可复用, 项目知识');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-save").disabled'),'valid tags recover Save without retrying');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-editor-extra-summary").textContent.includes("2 标签")'),true,'metadata summary describes saved edits');
 await captureState('edit-dirty',[360,400]);
 // Browser dialog events are not consistently surfaced for extension Side Panels.
 // Verify the actual product safety condition: rejecting navigation while dirty
 // must retain the same iframe and the exact user's uncommitted text.
 acceptDialog=false;await click(side,'#sidebar-tool-back');
 await until(()=>evalIn(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length===1'),'cancelled close retains frame');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-content").value'),edited);
 await click(clip,'#ki-edit-cancel');await until(()=>evalIn(clip,'!document.querySelector("#ki-confirm").hidden'),'inline discard confirmation');
 await captureState('confirm',[360]);
 await click(clip,'#ki-confirm-no');assert.equal(await evalIn(clip,'document.querySelector("#ki-editor").hidden'),false);
 // Declining discard keeps the editor active: focus returns to its visible
 // Cancel button, not the read-only Edit button hidden in edit mode.
 await until(()=>evalIn(clip,'document.activeElement?.id==="ki-edit-cancel"'),'discard cancellation restores visible trigger focus');
 await nativeKey(clip,'s',83,process.platform==='darwin'?4:2);
 await until(async()=>{const data=await evalIn(side,readStore);return data.records[0].draft?.includes('已整理内容');},'draft saved');
 assert.match((await evalIn(side,readStore)).records[0].markdown,/第二块 Markdown/,'Original remains intact');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-editor").hidden'),true,'save returns to reader');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-toolbar").hidden'),false,'read controls return after saving');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-markdown").querySelector("script,img,iframe")===null'),true,'Markdown does not mount scripts or images');
  assert.equal(await evalIn(clip,'document.querySelector("#ki-markdown").textContent.includes("<script>alert(1)</script>")'),true,'HTML is displayed as literal text');
 // Confirming discard must restore saved fields before a later metadata-only save.
 await click(clip,'#ki-edit');
 await nativeText(clip,'#ki-content','# 不应保存的修改\n\n明确放弃');
 // Read-only Edit is intentionally hidden while editing. The visible Cancel
 // action is the correct user path for abandoning this temporary draft.
 await click(clip,'#ki-edit-cancel');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-confirm").hidden'),'discard confirmation');
 await click(clip,'#ki-confirm-yes');
 await until(()=>evalIn(clip,'document.querySelector("#ki-editor").hidden'),'discard returns to reader');
 await click(clip,'#ki-edit');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-content").value'),edited,'Discarded text must not reappear when editing again');
 await click(clip,'#ki-editor-extra > summary');
 await nativeText(clip,'#ki-note','仅更新备注');
 await click(clip,'#ki-save');
 await until(async()=>{const data=await evalIn(side,readStore);return data.records[0].note==='仅更新备注';},'metadata-only save');
 assert.equal((await evalIn(side,readStore)).records[0].draft,edited,'Metadata-only save cannot persist discarded text');
 // Cancel discards temporary form values and re-entering starts from the last
 // durable revision, not from a previously hidden stale input.
 await click(clip,'#ki-edit');
 await nativeText(clip,'#ki-title','应当放弃的临时标题');
 await click(clip,'#ki-edit-cancel');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-confirm").hidden'),'dirty cancel protected');
 await click(clip,'#ki-confirm-yes');
 await until(()=>evalIn(clip,'document.querySelector("#ki-editor").hidden'),'cancel returns to reader');
 await click(clip,'#ki-edit');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-title").value'),'知识资产','reopen discards unsaved title');
 // A restored original followed by new typing is still a draft, never silently erased.
 await click(clip,'#ki-restore');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-confirm").hidden'),'restore confirmation');
 await click(clip,'#ki-confirm-yes');
 await nativeText(clip,'#ki-content','# 重新编辑的草稿\n\n恢复原文后继续编辑');
 await click(clip,'#ki-save');
 await until(async()=>{
   const data=await evalIn(side,readStore);
   return data.records[0].draft?.includes('恢复原文后继续编辑');
 },'post-restore re-edit preserved');
 assert.match((await evalIn(side,readStore)).records[0].markdown,/第二块 Markdown/,'Captured original remains immutable');
 await click(clip,'#ki-more>summary');
 await click(clip,'#ki-outline-toggle');
 await until(()=>evalIn(clip,'document.querySelector("#ki-outline").textContent.includes("重新编辑的草稿")'),'structure outline');
 await captureState('saved-outline',[360,400,600]);
 await click(clip,'#ki-back');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-list-view").hidden && document.querySelectorAll(".ki-record").length===1'),'list restored after detail');
 await until(()=>evalIn(clip,'[...document.querySelector("#ki-tag-filter").options].some(o=>o.value==="可复用")'),'saved tags populate filter after fresh asynchronous list');
 // Keep the native input and observable value assertion on every platform.
 // A macOS popup that does not commit remains a failed acceptance stage.
 await click(clip,'#ki-search');await tabTo(clip,'#ki-tag-filter');
 await nativeKey(clip,'ArrowDown',40);await nativeKey(clip,'Enter',13);
 await until(()=>evalIn(clip,'document.querySelector("#ki-tag-filter").value!==""'),'tag filter chosen');
 assert.equal(await evalIn(clip,'document.querySelectorAll(".ki-record").length'),1,'matching tagged record remains visible');
 await click(clip,'.ki-filters button[data-kind="archived"]');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-empty").hidden && document.querySelector("#ki-empty-title").textContent==="没有符合条件的记录"'),'category plus tag empty state');
 await captureState('category-empty',[360]);
 await until(()=>evalIn(clip,'!document.querySelector("#ki-reset").disabled'),'reset filter ready');
 await click(clip,'#ki-reset');
 await until(()=>evalIn(clip,'document.querySelectorAll(".ki-record").length===1 && document.querySelector("#ki-tag-filter").value===""'),'reset shows result');
 await until(()=>evalIn(clip,'!document.querySelector(".ki-record").disabled'),'record ready after filter reset');
 await click(clip,'.ki-record');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-detail").hidden'),'detail reopened for delete');
 await writeFile(join(screenshots,'visual-metrics.json'),JSON.stringify(visualMetrics,null,2)+'\n');
 await click(clip,'#ki-delete');await until(()=>evalIn(clip,'!document.querySelector("#ki-confirm").hidden'),'visible detail delete');
 await click(clip,'#ki-confirm-yes');
 await until(async()=>!(await evalIn(side,readStore)).records.length,'record removed');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-list-view").hidden && !document.querySelector("#ki-empty").hidden'),'empty inbox after removal');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-empty-title").textContent'),'收件箱还是空的','real empty state after delete');
 await captureState('empty',[360,400]);
 // A true sandbox-side manual creation, not storage injection or a test-only API.
 await click(clip,'#ki-empty-new');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-create-view").hidden'),'manual create form');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-create-extra").open'),false);
 const createBodyTop=await evalIn(clip,'document.querySelector("#ki-create-body").getBoundingClientRect().top');
 assert.ok(createBodyTop<230,'Manual body should be top-level: '+createBodyTop);
 await captureState('manual-create',[360]);
 await nativeText(clip,'#ki-create-title','用户手动新增');
 await nativeText(clip,'#ki-create-body','## 用户手动新增\n\n离线记录正文');
 await click(clip,'#ki-create-save');
 const manual=await until(async()=>{
   const saved=await evalIn(side,readStore);
   return saved?.records?.length===1&&saved.records[0].mode==='manual'?saved.records[0]:null;
 },'manual note saved through trusted worker');
 assert.equal(manual.source,'','manual note does not counterfeit ChatGPT provenance');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-detail").hidden'),'manual reader');
 assert.equal(await evalIn(clip,'document.querySelector("#ki-source").hidden'),true,'manual entry hides source navigation');
 await captureState('manual-detail',[360]);
 await click(clip,'#ki-delete');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-confirm").hidden'),'manual delete confirmation');
 await click(clip,'#ki-confirm-yes');
 await until(async()=>!(await evalIn(side,readStore)).records.length,'manual deletion persisted');
 await until(()=>evalIn(clip,'!document.querySelector("#ki-list-view").hidden'),'manual deletion returns to list');
 // Populate two records through actual ChatGPT Save controls, not injected storage.
 await browser.send('Target.activateTarget',{targetId:page.targetId});
 await article.send('Page.bringToFront');
 await pageButton(article,'fixture-answer-2','保存');
 await until(async()=>(await evalIn(side,readStore))?.records?.length===1,'one resaved answer');
 await pageButton(article,'fixture-answer-1','保存');
 await until(async()=>(await evalIn(side,readStore))?.records?.length===2,'two persisted answers');
 await click(clip,'#ki-manage>summary');
 await click(clip,'#ki-refresh');
 await until(()=>evalIn(clip,'document.querySelectorAll(".ki-record").length===2'),'two-record list refreshed');
 await captureState('list-two-records',[360,400]);
 await click(clip,'#ki-search');await tabTo(clip,'.ki-record');
 const firstId=await evalIn(clip,'document.activeElement.dataset.recordId');
 async function pressKey(key,code){
   await nativeKey(clip,key,code);
 }
 await pressKey('ArrowDown',40);
 const secondId=await evalIn(clip,'document.activeElement.dataset.recordId');
 assert.notEqual(secondId,firstId,'ArrowDown focuses another record');
 await captureState('list-keyboard',[360]);
 await pressKey('ArrowUp',38);
 assert.equal(await evalIn(clip,'document.activeElement.dataset.recordId'),firstId,'ArrowUp returns focus');
 await pressKey('End',35);
 assert.equal(await evalIn(clip,'document.activeElement.dataset.recordId'),secondId,'End focuses last record');
 await pressKey('Home',36);
 assert.equal(await evalIn(clip,'document.activeElement.dataset.recordId'),firstId,'Home focuses first record');
 await pressKey('Enter',13);
 await until(()=>evalIn(clip,'!document.querySelector("#ki-detail").hidden'),'Enter opens focused record');
 await pressKey('Escape',27);
 await until(()=>evalIn(clip,'!document.querySelector("#ki-list-view").hidden'),'Escape returns to list');
 await until(()=>evalIn(clip,'document.activeElement?.dataset?.recordId==='+JSON.stringify(firstId)),'keyboard return focus');
 await nativeKey(clip,'Tab',9,8);
 assert.equal(await evalIn(clip,'document.activeElement?.id'),'ki-sort','Shift+Tab returns from first record to sort');
 await nativeKey(clip,'Tab',9);
 await nativeKey(clip,'/',191);
 assert.equal(await evalIn(clip,'document.activeElement?.id'),'ki-search','Slash focuses search');
 await writeFile(join(screenshots,'visual-metrics.json'),JSON.stringify(visualMetrics,null,2)+'\n');
 const dialogsBeforeCleanClose=dialogs;
 acceptDialog=true;
 await click(side,'#sidebar-tool-back');
 const postClose=await evalIn(side,'({listHidden:document.querySelector("#sidebar-tool-list-view").hidden,displayHidden:document.querySelector("#sidebar-tool-display").hidden,toolsSelected:document.querySelector("#tab-tools")?.getAttribute("aria-selected")})');
 console.log('KNOWLEDGE_STAGE: tool closed',JSON.stringify(postClose));
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-list-view").hidden'),'tool list visible after closing knowledge');
 assert.equal(dialogs,dialogsBeforeCleanClose,'Clean tool exit must not show another browser-level confirmation');
 await click(side,'#tab-tools');
 await click(article,'#fixture-spa');
 await until(()=>evalIn(article,'document.querySelectorAll("[data-opendesk-capture-root]").length===1'),'SPA does not leak old controls');
 // Site consent is scoped to the currently active top-level page, not a background tab.
 await browser.send('Target.activateTarget',{targetId:page.targetId});
 await article.send('Page.bringToFront');
 await until(()=>evalIn(side,'(()=>{const b=document.querySelector('+JSON.stringify(installed)+');return !!b&&!b.disabled&&!!b.getClientRects().length;})()'),'knowledge installed list ready for revocation');
 await click(side,installed);
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-display").hidden'),'knowledge detail reopened');
 await click(side,'#sidebar-tool-settings-open');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-view").hidden'),'knowledge Settings reopened');
 await until(()=>evalIn(side,'!document.querySelector("#sidebar-tool-settings-deny").disabled'),'ChatGPT grant controls ready after returning to page');
 const grantVisibility=await evalIn(side,'(()=>{const el=document.querySelector("#sidebar-tool-settings-deny"),pane=document.querySelector("#sidebar-tool-settings-view");return {exists:!!el,disabled:el?.disabled,rects:el?.getClientRects().length,settingsHidden:pane?.hidden,selected:el?.getAttribute("aria-pressed")};})()');
 console.log('KNOWLEDGE_STAGE: revocation control',JSON.stringify(grantVisibility));
 acceptDialog=true;await click(side,'#sidebar-tool-settings-deny');
 await until(()=>evalIn(article,'document.querySelectorAll("[data-opendesk-capture-root]").length===0'),'Revocation removes buttons');
 assert.equal((await evalIn(side,readStore)).records.length,2,'Revocation cannot delete already saved records');
 const result={result:'NATIVE_CHROME_CONTROLLED_FIXTURE_PASS',sourceCommit:process.env.GITHUB_SHA||null,
  reviewedInstall:true,independentConsent:true,persistentCapture:true,fullReply:true,dedup:true,streamGuard:true,
  draftOriginalSeparation:true,dirtyCloseProtection:true,inlineConfirmation:true,manualCreate:true,manualDelete:true,structureOutline:true,spa:true,revocation:true,keyboardRecordNavigation:true,revocationPreservesRecords:true,
  publicChatGPT:'NOT_TESTED',macOSNativeDisk:'NOT_TESTED',imagesDownload:'NOT_TESTED',systemClipboard:'NOT_TESTED'};
 result.chromeVersion=version.Browser;result.platform=process.platform;
 await writeFile(join(screenshots,'result.json'),JSON.stringify(result,null,2)+'\n');passed=true;console.log(JSON.stringify(result));
});
