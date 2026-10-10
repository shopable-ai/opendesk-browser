import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

// Formal *real Chrome + unpacked WXT bundle* regression, not mocked tabs/DOM.
// A headless/sandbox-only test is not allowed to claim browser acceptance.
const candidates=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium'].filter(Boolean);
const binary=candidates.find(name=>spawnSync(name,['--version'],{stdio:'ignore'}).status===0);
async function connect(url){
  const socket=new WebSocket(url),requests=new Map();let id=0;
  await new Promise((ok,fail)=>{socket.onopen=ok;socket.onerror=fail;});
  socket.onmessage=event=>{
    const response=JSON.parse(event.data),waiter=requests.get(response.id);
    if(!waiter)return;requests.delete(response.id);clearTimeout(waiter.timer);
    response.error?waiter.reject(Error(String(response.error.message))):waiter.resolve(response.result);
  };
  return {send(method,params={},timeout=15000,sessionId=null){return new Promise((ok,fail)=>{
    const n=++id,timer=setTimeout(()=>{requests.delete(n);fail(Error('CDP_TIMEOUT: '+method));},timeout);
    requests.set(n,{resolve:ok,reject:fail});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));
  });},close(){socket.close();for(const waiter of requests.values()){
    clearTimeout(waiter.timer);waiter.reject(Error('CDP_DISCONNECTED'));
  }requests.clear();}};
}
async function evaluate(target,expression,timeout=15000){
  let result;
  try {
    result=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);
  } catch(error) {
    throw Error('Runtime.evaluate failed on '+expression.slice(0,240)+': '+error.message,{cause:error});
  }
  if(result.exceptionDetails)throw Error('PAGE_EXCEPTION '+JSON.stringify(result.exceptionDetails).slice(0,500)+' for '+expression.slice(0,150));
  return result.result.value;
}
async function eventually(probe,message,{attempts=70,delay=150}={}){
  let value,exception;
  for(let i=0;i<attempts;i++){
    try{value=await probe();if(value)return value;}catch(error){exception=error;}
    await pause(delay);
  }
  throw Error(message+(exception?' / '+exception.message:''));
}
const article=`<!doctype html><html><meta charset="utf-8"><style>body{margin:0;padding:10px 80px;font-family:sans-serif;}article{max-width:680px;}h1,h2{scroll-margin-top:80px;}</style>
<main><article><header><h1 itemprop="headline">文章标题可省略</h1></header><h2>摘要 H2</h2>
<section><header><h2>章节头部 H2</h2></header></section>
<div style="height:1200px">阅读正文</div><h1 id="same">正文内 H1 一</h1><h2 id="same">子章节</h2>
<div style="height:500px">内容</div><h1>正文内 H1 二</h1><h3>跳级 H3</h3></article></main></html>`;
const chat=`<!doctype html><html><meta charset="utf-8"><style>body{padding:24px 90px;font-family:sans-serif;}section[data-part]{margin:30px 0}h1,h2{margin:15px 0}</style>
<main><article data-testid="conversation-turn-1"><div data-message-author-role="assistant">
<section data-part="a"><h1 id="dup">回答一 H1</h1><h2>重复标题</h2></section>
<section data-part="b"><h1 id="dup">同一回答第二个 H1</h1></section>
<section data-part="c"><h2>重复标题</h2></section></div></article>
<article data-testid="conversation-turn-2"><div data-message-author-role="assistant"><h1>回答二 H1</h1><h2>重复标题</h2></div></article></main></html>`;

test('R4.1 real Chrome installs bundled TOC, follows multiple H1, restores and revokes page UI',{timeout:150000},async t=>{
  assert.ok(binary,'Missing Chrome for Testing binary: cannot claim real Chrome acceptance');
  const profile=await mkdtemp(join(tmpdir(),'opendesk-toc-native-r41-'));
  const server=createServer((req,res)=>{
    const html=req.url?.startsWith('/chat')?chat:req.url?.startsWith('/article')?article:null;
    res.writeHead(html?200:404,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(html||'not found');
  });
  await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
  const origin='http://127.0.0.1:'+server.address().port;
  const extension=resolve('dist/production');
  assert.equal(JSON.parse(await readFile(join(extension,'manifest.json'),'utf8')).name,'OpenDesk Browser');
  const pkg=JSON.parse(await readFile('src/sidebar-tools/reading-toc.opendesk-tool.json','utf8'));
  const args=[...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
    '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run',
    '--no-default-browser-check','--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'];
  const chrome=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let stderr='';
  chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-4000);});
  let browser,articlePage,chatPage,host;
  t.after(async()=>{
    for(const client of [articlePage,chatPage,host,browser])client?.close();
    // Do not delete an active Chrome for Testing profile: its helper processes
    // may recreate files while rm() is traversing the directory.
    if(chrome.exitCode===null && chrome.signalCode===null){
      const closed=new Promise(resolve=>{
        const timer=setTimeout(()=>chrome.kill('SIGKILL'),2500);
        chrome.once('close',()=>{clearTimeout(timer);resolve();});
      });
      chrome.kill('SIGTERM');
      await closed;
    }
    await new Promise(resolve=>server.close(resolve));
    await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  });
  let port;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited before launch: '+stderr);
    try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n');port=Number(lines[0]);if(port)break;}catch{}
    await pause(150);
  }
  assert.ok(port,'Could not connect to actual Chrome: '+stderr);
  const base='http://127.0.0.1:'+port;
  const version=await(await fetch(base+'/json/version')).json();
  browser=await connect(version.webSocketDebuggerUrl);
  async function openTab(url){
    const {targetId}=await browser.send('Target.createTarget',{url});
    const wsUrl=await eventually(async()=>{
      const targets=await(await fetch(base+'/json/list')).json();
      return targets.find(item=>item.id===targetId)?.webSocketDebuggerUrl;
    },'CDP did not create tab '+url);
    const cdp=await connect(wsUrl);await cdp.send('Runtime.enable');await cdp.send('Page.enable');
    return {targetId,cdp};
  }
  async function capture(cdp,name){
    const folder=resolve('artifacts/reading-toc-r41');await mkdir(folder,{recursive:true});
    const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(folder,name),Buffer.from(data,'base64'));
  }
  async function trustedClick(cdp,selector){
    // Real CDP pointer input; Element.click() and synthetic events are not
    // acceptable evidence for the installed Side Panel tool controls.
    const position=await evaluate(cdp,`(()=>{
      const node=document.querySelector(${JSON.stringify(selector)});
      if(!node||node.disabled||!node.getClientRects().length)throw Error('Control hidden or disabled');
      node.scrollIntoView({block:'center',inline:'nearest'});
      const rect=node.getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      if(!node.contains(document.elementFromPoint(x,y)))throw Error('Control obscured');
      return {x,y};
    })()`);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...position,button:'left',clickCount:1});
  }
  const first=await openTab(origin+'/article.html');articlePage=first.cdp;
  const extensionId=await eventually(async()=>{
    const targets=await browser.send('Target.getTargets');
    // Chrome itself may run other component/service workers. Never mistake a
    // foreign extension for OpenDesk and navigate to a non-existent tool.html.
    const service=targets.targetInfos.find(item=>item.type==='service_worker'&&
      /^chrome-extension:\/\/[^/]+\/sw\.js(?:[?#]|$)/.test(item.url||''));
    return service?.url?.match(/^chrome-extension:\/\/([^/]+)\//)?.[1];
  },'Compiled MV3 service worker did not register',{attempts:100,delay:150});
  console.log('TOC_NATIVE_STAGE: resolved OpenDesk SW extension identity '+extensionId);
  const ownUrl='chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID();
  const panel=await openTab(ownUrl);host=panel.cdp;
  try {
    await eventually(()=>evaluate(host,'document.readyState==="complete" && !!document.querySelector("#sidebar-tool-official-install")'),
      'Real tool shell did not mount',{attempts:50,delay:120});
  } catch (error) {
    const diagnostic=await evaluate(host,'({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText?.slice(0,250),html:document.documentElement?.outerHTML?.slice(0,500),present:!!document.querySelector("#sidebar-tool-official-install")})').catch(e=>({error:String(e)}));
    throw Error(error.message+'; navigation diagnostic='+JSON.stringify(diagnostic)+'; chrome='+stderr.slice(-500));
  }
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0,
    'No website should obtain TOC before installation/approval');
  console.log('TOC_NATIVE_STAGE: extension tool.html loaded');
  // Test the actual official installer HTML event path and bundled JSON, not a
  // synthetic package installed directly into chrome.storage.
  await evaluate(host,'document.querySelector("#sidebar-tool-official-install").click();true');
  await eventually(()=>evaluate(host,'!document.querySelector("#sidebar-tool-preview").hidden'),
    'Official TOC package was not staged for review');
  assert.equal(await evaluate(host,'document.querySelector("#sidebar-tool-preview-title").textContent'),pkg.title);
  console.log('TOC_NATIVE_STAGE: official package preview visible');
  await evaluate(host,'document.querySelector("#sidebar-tool-install").click();true');
  const installed=await eventually(async()=>{
    const rows=await evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1")');
    return rows?.['opendesk.sidebar-tools.installed.v1']?.find(x=>x.id==='reading-toc')||null;
  },'Official installation did not save the v1 package');
  console.log('TOC_NATIVE_STAGE: installed package recorded');
  assert.equal(installed.version,pkg.version);
  assert.deepEqual(installed.capabilities,['page.toc']);
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0,
    'Installed package alone must not expose current page headings');
  // The installed tool is now granted exactly this loopback origin for the
  // browser-runtime smoke; the interactive site consent UI is still Mac-manual.
  await evaluate(host,`chrome.storage.local.set({'opendesk.sidebar-tools.toc-sites.v1':{'reading-toc':[${JSON.stringify(origin)}]}}).then(()=>true)`);
  console.log('TOC_NATIVE_STAGE: site grant saved');
  await eventually(()=>evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'Actual content script did not mount after verified origin grant');
  async function panelSend(url,operation,details={}){
    const code=`(async()=>{
      const candidates=await chrome.tabs.query({});
      const tab=candidates.find(t=>t.url===${JSON.stringify(url)});
      if(!tab)throw Error('Missing site tab: '+${JSON.stringify(url)});
      const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});
      const frame=frames?.find(f=>f.frameId===0);
      if(!frame?.documentId)throw Error('Missing Chrome document identity');
      return chrome.tabs.sendMessage(tab.id,{protocol:'opendesk.reading-toc.v1',
        operation:${JSON.stringify(operation)},toolId:'reading-toc',expectedUrl:${JSON.stringify(url)},
        ...${JSON.stringify(details)}},{frameId:0,documentId:frame.documentId});
    })()`;
    return evaluate(host,code,18000);
  }
  const articleUrl=origin+'/article.html';
  console.log('TOC_NATIVE_STAGE: webpage widget mounted');
  const snapshot=await eventually(async()=>{
    const result=await panelSend(articleUrl,'toc.snapshot');
    return result?.ok&&result.data?.items?.length>=4?result:null;
  },'Trusted sender could not read actual page title snapshot');
  assert.equal(snapshot.data.items.filter(x=>x.rank===1).length,2,
    'Internal article H1s must survive even if the page title is excluded');
  assert(snapshot.data.items.some(x=>x.label==='章节头部 H2'),
    'H2 inside a section header is content, not an entire page title');
  assert.equal(new Set(snapshot.data.items.map(x=>x.id)).size,snapshot.data.items.length,
    'Duplicate original DOM ids must not collide');
  const jumpTarget=snapshot.data.items.find(x=>x.label==='正文内 H1 一');
  // Navigation is meaningful only while the article is actually visible:
  // requestAnimationFrame is suspended in hidden Chrome tabs.
  await browser.send('Target.activateTarget',{targetId:first.targetId});
  await articlePage.send('Page.bringToFront');
  await eventually(()=>evaluate(articlePage,'document.visibilityState==="visible"'),
    'Article tab was not activated for visual navigation');
  const jump=await panelSend(articleUrl,'toc.navigate',{id:jumpTarget.id,sourceId:jumpTarget.sourceId});
  assert.equal(jump.ok,true,JSON.stringify(jump));
  const rect=await evaluate(articlePage,'document.querySelector("article h1#same").getBoundingClientRect().top');
  assert(rect>=65&&rect<650,'Real Chrome must visibly position the clicked section: top='+rect);
  await browser.send('Target.activateTarget',{targetId:first.targetId});
  await capture(articlePage,'article-jump.png');
  // Reload while grant remains: a fresh isolated-world instance must recover.
  await articlePage.send('Page.reload',{ignoreCache:true});
  await eventually(()=>evaluate(articlePage,'document.readyState==="complete" && document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'Refresh did not restore independently of side panel');
  console.log('TOC_NATIVE_STAGE: article navigation and reload succeeded');
  const second=await openTab(origin+'/chat.html');chatPage=second.cdp;
  await eventually(()=>evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'AI conversation page did not receive the TOC');
  await browser.send('Target.activateTarget',{targetId:second.targetId});
  await capture(chatPage,'chat-multi-h1.png');
  const conversation=await panelSend(origin+'/chat.html','toc.snapshot');
  assert.equal(conversation.ok,true,JSON.stringify(conversation));
  assert.equal(conversation.data.sources.length,2);
  assert.equal(conversation.data.items.filter(x=>x.rank===1).length,3,
    'Multiple H1 across 3 fragments/2 answers must be preserved');
  assert.equal(conversation.data.items[0].sourceId,conversation.data.items[3].sourceId);
  assert.notEqual(conversation.data.items[3].sourceId,conversation.data.items[4].sourceId);
  await evaluate(host,`chrome.storage.local.set({'opendesk.sidebar-tools.toc-sites.v1':{}}).then(()=>true)`);
  await eventually(async()=>
    await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0')&&
    await evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),
    'Disabling website origin did not release the real page overlay');
  const revoked=await panelSend(origin+'/chat.html','toc.snapshot');
  assert.equal(revoked.ok,false,'No heading data after site grant was revoked');
  // Uninstall package and prove content handler is not re-authorized by stale grants.
  await evaluate(host,`chrome.storage.local.set({
    'opendesk.sidebar-tools.installed.v1':[],
    'opendesk.sidebar-tools.toc-sites.v1':{'reading-toc':[${JSON.stringify(origin)}]}
  }).then(()=>true)`);
  await pause(300);
  assert.equal(await evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
  assert.equal((await panelSend(origin+'/chat.html','toc.snapshot')).ok,false);

  // Native Side Panel + local file import: the earlier host tab only tested
  // the authorized transport. This verifies the *actual* Side Panel context.
  await browser.send('Target.activateTarget',{targetId:panel.targetId});
  await host.send('Page.bringToFront');
  const windowId=await evaluate(host,'chrome.windows.getCurrent().then(w=>w.id)');
  assert(Number.isSafeInteger(windowId)&&windowId>=0);
  await evaluate(host,`(()=>{
    const trigger=document.createElement('button');
    trigger.id='native-test-sidepanel-open';
    trigger.textContent='Native test open Side Panel';
    trigger.style.cssText='position:fixed;top:65px;left:14px;z-index:2147483646;min-width:180px;min-height:42px;background:#fff;color:#111';
    trigger.addEventListener('click',e=>{
      window.__nativeSidePanelGesture=e.isTrusted;
      chrome.sidePanel.open({windowId:${windowId}}).then(
        ()=>window.__nativeSidePanelOpened=true,
        error=>window.__nativeSidePanelError=String(error.message||error));
    });
    document.body.append(trigger);
  })()`);
  await trustedClick(host,'#native-test-sidepanel-open');
  await eventually(async()=>{
    const state=await evaluate(host,'({gesture:window.__nativeSidePanelGesture,opened:window.__nativeSidePanelOpened,error:window.__nativeSidePanelError})');
    if(state.error)throw Error('Native Side Panel open denied: '+state.error);
    return state.gesture===true&&state.opened===true;
  },'Actual Chrome Side Panel did not open with trusted pointer gesture');
  console.log('TOC_NATIVE_STAGE: native Side Panel opened via real user gesture');
  const sideContext=await eventually(async()=>{
    const contexts=await evaluate(host,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return contexts.find(x=>x.documentUrl?.includes('/ui/tool.html?hostInstanceId='));
  },'Chrome did not register the actual SIDE_PANEL document');
  const sideTarget=await eventually(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(t=>t.url===sideContext.documentUrl);
  },'Side Panel context lacked an actual CDP target');
  const attached=await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true});
  const side={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId)};
  await side.send('Runtime.enable');await side.send('Page.enable');
  await eventually(()=>evaluate(side,'document.readyState==="complete"&&!!document.querySelector("#tab-tools")'),
    'Side Panel did not load the actual OpenDesk UI');
  await trustedClick(side,'#tab-tools');
  await eventually(()=>evaluate(side,'!document.querySelector("#workbench-tools").hidden'),
    'Side Panel Tools tab was not selectable');
  console.log('TOC_NATIVE_STAGE: real Side Panel Tools tab selected');

  // After uninstall, the same local reference package is deliberately
  // imported from disk with the browser's native file-input DevTools command.
  await trustedClick(side,'#sidebar-tool-import-trigger');
  await side.send('DOM.enable');
  const documentTree=await side.send('DOM.getDocument',{depth:1});
  const fileNode=await side.send('DOM.querySelector',{
    nodeId:documentTree.root.nodeId,selector:'#sidebar-tool-file'});
  assert(fileNode.nodeId,'Side Panel import input not present');
  await side.send('DOM.setFileInputFiles',{
    files:[resolve('artifacts/sidebar-tools/reading-toc/1.0.0/reading-toc.opendesk-tool.json')],
    nodeId:fileNode.nodeId});
  await eventually(()=>evaluate(side,'!document.querySelector("#sidebar-tool-preview").hidden'),
    'Native file import did not create a validated tool preview');
  assert.equal(await evaluate(side,'document.querySelector("#sidebar-tool-preview-title").textContent'),pkg.title);
  await trustedClick(side,'#sidebar-tool-install');
  await eventually(async()=>{
    const stored=await evaluate(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1")');
    return stored?.['opendesk.sidebar-tools.installed.v1']?.some(item=>item.id==='reading-toc');
  },'Real Side Panel local import did not install the package');
  const openSelector='#sidebar-tool-list button[data-sidebar-tool-action="open"][data-sidebar-tool-id="reading-toc"]';
  await trustedClick(side,openSelector);
  await eventually(()=>evaluate(side,'!!document.querySelector("#sidebar-tool-frame iframe")'),
    'Actual Side Panel did not mount the installed TOC sandbox');
  console.log('TOC_NATIVE_STAGE: real Side Panel local import and tool open succeeded');
});