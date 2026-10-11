import {packageFingerprint} from '../../scripts/verify-package.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
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
  const socket=new WebSocket(url),requests=new Map();let id=0,onEvent=null;
  await new Promise((ok,fail)=>{socket.onopen=ok;socket.onerror=fail;});
  socket.onmessage=event=>{
    const response=JSON.parse(event.data);
    if(!response.id){onEvent?.(response);return;}
    const waiter=requests.get(response.id);
    if(!waiter)return;requests.delete(response.id);clearTimeout(waiter.timer);
    response.error?waiter.reject(Error(String(response.error.message))):waiter.resolve(response.result);
  };
  return {onEvent(listener){onEvent=listener;},
    send(method,params={},timeout=15000,sessionId=null){return new Promise((ok,fail)=>{
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
const single=`<!doctype html><html><meta charset="utf-8"><style>body{padding:30px 100px;font-family:sans-serif}h2{margin:45px 0}</style>
<main><article><h1>一篇只有一个一级标题的文章</h1>${Array.from({length:20},(_,i)=>'<h2>步骤 '+(i+1)+'</h2>').join('')}<div style="height:700px"></div></article></main></html>`;
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
    const html=req.url?.startsWith('/chat')?chat:req.url?.startsWith('/single')?single:req.url?.startsWith('/article')?article:null;
    res.writeHead(html?200:404,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(html||'not found');
  });
  await new Promise((yes,no)=>server.once('error',no).listen(0,'127.0.0.1',yes));
  const origin='http://127.0.0.1:'+server.address().port;
  const extension=resolve('dist/production');
  assert.equal(JSON.parse(await readFile(join(extension,'manifest.json'),'utf8')).name,'OpenDesk Browser');
  const pkg=JSON.parse(await readFile('dist/production/official-tools/reading-toc/reading-toc.opendesk-tool.json','utf8'));
  const args=[...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
    ...(process.platform==='darwin'?['--use-mock-keychain']:[]),
    '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run',
    '--no-default-browser-check','--disable-background-networking','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'];
  const chrome=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let stderr='';
  chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-4000);});
  let browser,articlePage,singlePage,chatPage,host,launcherHost;
  t.after(async()=>{
    const folder=resolve('artifacts/reading-toc-r41');await mkdir(folder,{recursive:true});
    const observation=host&&await evaluate(host,'({url:location.href,page:document.querySelector("#script-current-page-url")?.textContent,status:document.querySelector("#sidebar-tool-status")?.textContent,error:document.querySelector("#sidebar-tool-file-error")?.textContent,importHidden:document.querySelector("#sidebar-tool-import")?.hidden,previewHidden:document.querySelector("#sidebar-tool-preview")?.hidden,official:document.querySelector("[data-official-tool-id=reading-toc]")?.outerHTML})').catch(error=>({unavailable:error.message}));
    await writeFile(join(folder,'native-observation.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,host:observation},null,2)+'\n');
    console.log('TOC_NATIVE_OBSERVATION '+JSON.stringify(observation));
    if(host)await capture(host,'toc-final-host.png').catch(()=>{});
    for(const client of [articlePage,singlePage,chatPage,host,launcherHost,browser])client?.close();
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
    const position=await eventually(()=>evaluate(cdp,`(()=>{
      const node=document.querySelector(${JSON.stringify(selector)});
      if(!node||node.disabled||!node.getClientRects().length)return null;
      node.scrollIntoView({block:'center',inline:'nearest'});
      const rect=node.getBoundingClientRect();
      const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
      if(!node.contains(document.elementFromPoint(x,y)))throw Error('Control obscured');
      return {x,y};
    })()`),'Trusted control not visible/enabled: '+selector);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...position,button:'left',clickCount:1});
    await pause(150);
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
  await mkdir(resolve('artifacts/reading-toc-r41'),{recursive:true});
  await writeFile(resolve('artifacts/reading-toc-r41/browser-identity.json'),JSON.stringify({
    sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    package:await packageFingerprint(extension),
    platform:process.platform,binary,profile,pid:chrome.pid,args,extension,extensionId,
    version,manifest:JSON.parse(await readFile(join(extension,'manifest.json'),'utf8')),
    headed:process.env.OPENDESK_NATIVE_HEADED==='1'
  },null,2)+'\n');
  const ownUrl='chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID();
  const panel=await openTab(ownUrl);host=panel.cdp;
  try {
    await eventually(()=>evaluate(host,'document.readyState==="complete" && !!document.querySelector("#sidebar-tool-official-reading-toc-install")'),
      'Real tool shell did not mount',{attempts:50,delay:120});
  } catch (error) {
    const diagnostic=await evaluate(host,'({url:location.href,ready:document.readyState,title:document.title,text:document.body?.innerText?.slice(0,250),html:document.documentElement?.outerHTML?.slice(0,500),present:!!document.querySelector("#sidebar-tool-official-reading-toc-install")})').catch(e=>({error:String(e)}));
    throw Error(error.message+'; navigation diagnostic='+JSON.stringify(diagnostic)+'; chrome='+stderr.slice(-500));
  }
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0,
    'No website should obtain TOC before installation/approval');
  console.log('TOC_NATIVE_STAGE: extension tool.html loaded');
  // Test the actual official installer HTML event path and bundled JSON, not a
  // synthetic package installed directly into chrome.storage.
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
  const side={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,attached.sessionId),close(){},onEvent(listener){browser.onEvent(event=>{if(event.sessionId===attached.sessionId)listener(event);});}};
  await side.send('Runtime.enable');await side.send('Page.enable');
  await eventually(()=>evaluate(side,'document.readyState==="complete"&&!!document.querySelector("#tab-tools")'),
    'Side Panel did not load the actual OpenDesk UI');
  await trustedClick(side,'#tab-tools');
  await eventually(()=>evaluate(side,'!document.querySelector("#workbench-tools").hidden'),
    'Side Panel Tools tab was not selectable');
  console.log('TOC_NATIVE_STAGE: real Side Panel Tools tab selected');

  launcherHost=host;host=side;
  await browser.send('Target.activateTarget',{targetId:first.targetId});
  await articlePage.send('Page.bringToFront');
  await eventually(()=>evaluate(host,'document.querySelector("#script-current-page-url")?.textContent==='+JSON.stringify(origin+'/article.html')),
    'Side Panel must bind the intended article before official installation');
  host.onEvent(event=>{
    if(event.method==='Page.javascriptDialogOpening')
      host.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
  });
  await trustedClick(host,'#sidebar-tool-official-reading-toc-install');

  await eventually(()=>evaluate(host,'!document.querySelector("#sidebar-tool-preview").hidden'),
    'Official TOC package was not staged for review');
  assert.equal(await evaluate(host,'document.querySelector("#sidebar-tool-preview-title").textContent'),pkg.title);
  console.log('TOC_NATIVE_STAGE: official package preview visible');
  await trustedClick(host,'#sidebar-tool-install');
  const installed=await eventually(async()=>{
    const rows=await evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1")');
    return rows?.['opendesk.sidebar-tools.installed.v1']?.find(x=>x.id==='reading-toc')||null;
  },'Official installation did not save the v1 package');
  console.log('TOC_NATIVE_STAGE: installed package recorded');
  assert.equal(installed.version,pkg.version);
  assert.deepEqual(installed.capabilities,['page.toc']);
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0,
    'Installed package alone must not expose current page headings');
  await eventually(()=>evaluate(host,'!!document.querySelector("[data-sidebar-tool-action=site][data-sidebar-tool-id=reading-toc]:not(:disabled)")'),
    'Site consent control must be enabled');
  await trustedClick(host,'[data-sidebar-tool-action=site][data-sidebar-tool-id=reading-toc]');
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
  const oneH1=await openTab(origin+'/single.html');singlePage=oneH1.cdp;
  await eventually(()=>evaluate(singlePage,
    'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'The single-H1 article did not mount its trusted overlay');
  const adaptive=await panelSend(origin+'/single.html','toc.snapshot');
  assert.equal(adaptive.ok,true,JSON.stringify(adaptive));
  assert.equal(adaptive.data.items.filter(item=>item.depth===0).length,1,
    'Fixture contains exactly one logical top-level heading');
  const adaptiveOverview=adaptive.data.overview[adaptive.data.sources[0].id];
  assert.equal(adaptiveOverview.ids.length,12,
    'A single H1 plus 20 H2 should present 12 overview entries, not one');
  assert.equal(adaptiveOverview.hiddenCount,9,'remaining H2 are available in full mode');
  assert.equal(adaptive.data.items.find(item=>item.id===adaptiveOverview.ids[1]).rank,2);
  await browser.send('Target.activateTarget',{targetId:oneH1.targetId});
  await singlePage.send('Page.bringToFront');
  // R4.6: Chrome Side Panel reduces the webpage CSS width. A desktop-height
  // viewport must not collapse a 12-item directory to the old 160px/125px.
  for(const size of [{width:900,height:820},{width:420,height:700}]){
    await singlePage.send('Emulation.setDeviceMetricsOverride',{
      ...size,deviceScaleFactor:1,mobile:false});
    const measured=await eventually(async()=>{
      const height=await evaluate(singlePage,'document.querySelector("[data-opendesk-toc-root]")?.getBoundingClientRect().height');
      return height>250?height:null;
    },'R4.6 webpage directory still artificially short at '+size.width+'px');
    assert(measured<size.height-8,'R4.6 directory must also remain within the visual viewport');
  }
  await singlePage.send('Emulation.clearDeviceMetricsOverride');
  await capture(singlePage,'toc-r46-adaptive-height.png');
  console.log('TOC_NATIVE_STAGE: R4.6 900px and 420px webpage widths retain a tall readable outline');
  console.log('TOC_NATIVE_STAGE: adaptive single-H1 overview includes H2 with bounded overflow');
  // R4.4 regression: reading a late chapter must not leave the first
  // H1 highlighted simply because the overview only showed early H2s.
  const lastHeading=adaptive.data.items.at(-1);
  const lateJump=await panelSend(origin+'/single.html','toc.navigate',{
    id:lastHeading.id,sourceId:lastHeading.sourceId
  });
  assert.equal(lateJump.ok,true,'must navigate to the final H2 in actual Chrome: '+JSON.stringify(lateJump));
  const atEnd=await panelSend(origin+'/single.html','toc.snapshot');
  assert.equal(atEnd.ok,true);
  const lateOverview=atEnd.data.overview[lastHeading.sourceId];
  assert.equal(lateOverview.ids.length,12,'late chapter keeps the overview bounded');
  assert(lateOverview.ids.includes(lastHeading.id),'late active H2 is included in the compact overview');
  assert.equal(lateOverview.representedId,lastHeading.id,
    'overview directly highlights the current H2, not the root H1');
  assert(lateOverview.ids.includes(atEnd.data.items.at(-2).id),
    'nearby H2 remains visible to provide local reading context');
  await capture(singlePage,'toc-r44-late-heading.png');
  console.log('TOC_NATIVE_STAGE: R4.4 late H2 is visible and highlighted in real Chrome');
  // The settings gear is in the Side Panel immediately before Uninstall,
  // never injected into the website. Appearance does not revoke page.toc.
  await eventually(()=>evaluate(host,'document.querySelector("#script-current-page-url")?.textContent==='+JSON.stringify(origin+'/single.html')),
    'Side Panel did not target the tall article');
  const tocGear='[data-sidebar-tool-action=sites][data-sidebar-tool-id=reading-toc]';
  assert.equal(await evaluate(host,'(()=>{const settings=document.querySelector("[data-sidebar-tool-action=sites][data-sidebar-tool-id=reading-toc]");return settings?.nextElementSibling?.dataset?.sidebarToolAction==="remove"})()'),true,
    'R4.6 settings gear must sit immediately to the left of Uninstall');
  await trustedClick(host,tocGear);
  await eventually(()=>evaluate(host,'!document.querySelector("#sidebar-tool-sites-reading-toc").hidden'),
    'TOC settings did not open');
  await trustedClick(host,'[data-sidebar-tool-action=toc-page-visibility][data-sidebar-tool-id=reading-toc]');
  await eventually(()=>evaluate(singlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),
    'R4.6 page-only hiding did not remove the floating card');
  const hiddenSnapshot=await panelSend(origin+'/single.html','toc.snapshot');
  assert.equal(hiddenSnapshot.ok,true,'Side Panel must retain its granted outline while the webpage card is hidden');
  assert(hiddenSnapshot.data.items.length>=20);
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),1,
    'Page-only hiding must not hide a sibling article');
  await trustedClick(host,'[data-sidebar-tool-action=toc-page-visibility][data-sidebar-tool-id=reading-toc]');
  await eventually(()=>evaluate(singlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'R4.6 re-showing page directory did not restore the card');
  await trustedClick(host,'[data-sidebar-tool-action=toc-site-visibility][data-sidebar-tool-id=reading-toc]');
  await eventually(async()=>await evaluate(singlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0')&&
    await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),
    'Site hiding must remove floating cards from every matching tab');
  assert.equal((await panelSend(origin+'/single.html','toc.snapshot')).ok,true,
    'Site hiding must leave granted Side Panel TOC available');
  await trustedClick(host,'[data-sidebar-tool-action=toc-site-visibility][data-sidebar-tool-id=reading-toc]');
  await eventually(async()=>await evaluate(singlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1')&&
    await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'Restoring site visibility did not restore the floating cards');
  await trustedClick(host,tocGear);
  console.log('TOC_NATIVE_STAGE: R4.6 Side Panel controls page/site visibility without revoking granted snapshots');
  // R4.2: The shadow root is closed by design. Use only genuine CDP mouse
  // input at the visible drag handle/reset control and observe host geometry
  // plus the trusted extension storage key (not synthetic pointer events).
  await browser.send('Target.activateTarget',{targetId:first.targetId});
  await articlePage.send('Page.bringToFront');
  const placementKey='opendesk.sidebar-tools.toc-placement.v1:'+encodeURIComponent(origin);
  const tocRect=()=>evaluate(articlePage,`(()=>{
    const node=document.querySelector('[data-opendesk-toc-root]');
    if(!node)throw Error('TOC host is not mounted');
    const rect=node.getBoundingClientRect();
    return {left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
      width:rect.width,height:rect.height,x:rect.left+26,y:rect.top+26,
      viewportWidth:innerWidth,viewportHeight:innerHeight};
  })()`);
  async function clickAt(x,y){
    await articlePage.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none'});
    await articlePage.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await articlePage.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
  }
  async function dragFromHandle(rect,wantedLeft,wantedTop){
    const finalX=rect.x+wantedLeft-rect.left,finalY=rect.y+wantedTop-rect.top;
    await articlePage.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y,button:'none'});
    await articlePage.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',buttons:1,clickCount:1});
    await articlePage.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:finalX,y:finalY,button:'left',buttons:1});
    await articlePage.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:finalX,y:finalY,button:'left',buttons:0,clickCount:1});
  }
  const beforeDrag=await tocRect();
  await dragFromHandle(beforeDrag,8,beforeDrag.top+60);
  const snappedLeft=await eventually(async()=>{
    const pos=await evaluate(host,`chrome.storage.local.get(${JSON.stringify(placementKey)}).then(x=>x[${JSON.stringify(placementKey)}])`);
    return pos?.dock==='left'?pos:null;
  },'R4.2 real pointer drag did not save a left-edge snap');
  assert.equal(snappedLeft.v,1);
  assert((await tocRect()).left<=9,'R4.2 host must snap visibly to the left edge');
  await articlePage.send('Page.reload',{ignoreCache:true});
  await eventually(async()=>((await tocRect()).left<=9),
    'R4.2 site-specific placement was not restored on real Chrome reload');
  const current=await tocRect();
  const freeLeft=Math.round((current.viewportWidth-current.width)/2);
  await dragFromHandle(current,freeLeft,current.top+45);
  await eventually(async()=>{
    const pos=await evaluate(host,`chrome.storage.local.get(${JSON.stringify(placementKey)}).then(x=>x[${JSON.stringify(placementKey)}])`);
    return pos?.dock==='free';
  },'R4.2 drag to the center should remain free, not force an edge snap');
  await articlePage.send('Emulation.setDeviceMetricsOverride',{
    width:420,height:400,deviceScaleFactor:1,mobile:false});
  await eventually(async()=>{
    const rect=await tocRect();
    return rect.left>=0&&rect.right<=rect.viewportWidth+1&&
      rect.top>=0&&rect.bottom<=rect.viewportHeight+1;
  },'R4.2 TOC placement escaped the smaller viewport');
  await articlePage.send('Emulation.clearDeviceMetricsOverride');
  const toReset=await tocRect();
  await clickAt(toReset.right-25,toReset.top+26);
  await eventually(()=>evaluate(host,`chrome.storage.local.get(${JSON.stringify(placementKey)}).then(
    values=>!Object.hasOwn(values,${JSON.stringify(placementKey)}))`),
  'R4.2 reset did not remove the saved site-specific placement');
  assert((await tocRect()).left>=(await tocRect()).viewportWidth/3,
    'R4.2 reset must restore a right-side responsive default');
  await capture(articlePage,'toc-r42-reset.png');
  console.log('TOC_NATIVE_STAGE: real pointer drag, snap, free position, reload, resize and reset succeeded');
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
  await browser.send('Target.activateTarget',{targetId:panel.targetId});
  await trustedClick(host,'[data-sidebar-tool-action=sites][data-sidebar-tool-id=reading-toc]');
  await trustedClick(host,'.sidebar-tool-site-revoke');
  await eventually(async()=>
    await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0')&&
    await evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),
    'Disabling website origin did not release the real page overlay');
  const revoked=await panelSend(origin+'/chat.html','toc.snapshot');
  assert.equal(revoked.ok,false,'No heading data after site grant was revoked');
  // Real uninstall must remove its origin references and deny the old caller.
  await browser.send('Target.activateTarget',{targetId:second.targetId});
  await chatPage.send('Page.bringToFront');
  await trustedClick(host,'[data-sidebar-tool-action=site][data-sidebar-tool-id=reading-toc]');
  await eventually(()=>evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'Regrant did not complete before uninstall');
  // Persist a page-specific hidden setting, then prove actual uninstall also
  // clears it instead of silently inheriting it after a later reinstallation.
  if(await evaluate(host,'document.querySelector("#sidebar-tool-sites-reading-toc").hidden'))
    await trustedClick(host,'[data-sidebar-tool-action=sites][data-sidebar-tool-id=reading-toc]');
  await trustedClick(host,'[data-sidebar-tool-action=toc-page-visibility][data-sidebar-tool-id=reading-toc]');
  const retained=await evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.toc-visibility.v1")');
  assert(retained['opendesk.sidebar-tools.toc-visibility.v1']?.['reading-toc']?.hiddenPages?.length);
  await trustedClick(host,'[data-sidebar-tool-action=sites][data-sidebar-tool-id=reading-toc]');
  await trustedClick(host,'[data-sidebar-tool-action=remove][data-sidebar-tool-id=reading-toc]');
  await eventually(()=>evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1").then(value=>!value["opendesk.sidebar-tools.installed.v1"]?.some(row=>row.id==="reading-toc"))'),
    'UI uninstall did not remove the package');
  const retiredGrant=await evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.toc-sites.v1")');
  assert.equal(retiredGrant['opendesk.sidebar-tools.toc-sites.v1']?.['reading-toc'],undefined);
  const retiredVisibility=await evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.toc-visibility.v1")');
  assert.equal(retiredVisibility['opendesk.sidebar-tools.toc-visibility.v1']?.['reading-toc'],undefined,
    'R4.6 uninstall must clear prior page/site display preferences');
  await pause(300);
  assert.equal(await evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
  assert.equal(await evaluate(singlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
  assert.equal((await panelSend(origin+'/chat.html','toc.snapshot')).ok,false);

  // After uninstall, the same local reference package is deliberately
  // imported from disk with the browser's native file-input DevTools command.
  await trustedClick(side,'#sidebar-tool-import-trigger');
  await side.send('DOM.enable');
  const documentTree=await side.send('DOM.getDocument',{depth:1});
  const fileNode=await side.send('DOM.querySelector',{
    nodeId:documentTree.root.nodeId,selector:'#sidebar-tool-file'});
  assert(fileNode.nodeId,'Side Panel import input not present');
  await side.send('DOM.setFileInputFiles',{
    files:[resolve('dist/production/official-tools/reading-toc/reading-toc.opendesk-tool.json')],

    nodeId:fileNode.nodeId});
  await eventually(()=>evaluate(side,'!document.querySelector("#sidebar-tool-preview").hidden'),
    'Native file import did not create a validated tool preview');
  assert.equal(await evaluate(side,'document.querySelector("#sidebar-tool-preview-title").textContent'),pkg.title);
  await trustedClick(side,'#sidebar-tool-install');
  await eventually(async()=>{
    const stored=await evaluate(side,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1")');
    return stored?.['opendesk.sidebar-tools.installed.v1']?.some(item=>item.id==='reading-toc');
  },'Real Side Panel local import did not install the package');
  // The website permission must be approved through the visible Side Panel
  // control and the real native Chrome confirmation, not by writing storage.
  await browser.send('Target.activateTarget',{targetId:second.targetId});
  await chatPage.send('Page.bringToFront');
  const grantSelector='#sidebar-tool-list button[data-sidebar-tool-action="site"][data-sidebar-tool-id="reading-toc"]';
  await eventually(()=>evaluate(side,`(()=>{
    const node=document.querySelector(${JSON.stringify(grantSelector)});
    return !!node&&!node.disabled&&node.dataset.enabled==='false';
  })()`),'Side Panel did not bind its website toggle to the active ChatGPT fixture');
  let confirmedDialogs=0;const dialogErrors=[];
  browser.onEvent(event=>{
    if(event.method!=='Page.javascriptDialogOpening'||event.sessionId!==attached.sessionId)return;
    confirmedDialogs++;
    void browser.send('Page.handleJavaScriptDialog',{accept:true},10000,attached.sessionId)
      .catch(error=>dialogErrors.push(String(error.message||error)));
  });
  await trustedClick(side,grantSelector);
  await eventually(()=>evaluate(side,`chrome.storage.local.get('opendesk.sidebar-tools.toc-sites.v1').then(
    value=>value['opendesk.sidebar-tools.toc-sites.v1']?.['reading-toc']?.includes(${JSON.stringify(origin)})===true)`),
    'Real Side Panel website toggle did not authorize the exact origin');
  assert.equal(confirmedDialogs,1,'Site authorization must show one actual Chrome confirmation dialog');
  assert.deepEqual(dialogErrors,[]);
  await eventually(()=>evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'Accepted website grant did not restore the real TOC overlay');
  console.log('TOC_NATIVE_STAGE: real Side Panel website consent approved and page overlay restored');

  const openSelector='#sidebar-tool-list button[data-sidebar-tool-action="open"][data-sidebar-tool-id="reading-toc"]';
  await trustedClick(side,openSelector);
  await eventually(()=>evaluate(side,'!!document.querySelector("#sidebar-tool-frame iframe")'),
    'Actual Side Panel did not mount the installed TOC sandbox');
  const sandboxTarget=await eventually(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(t=>t.type==='iframe'&&t.url?.includes('/sidebar-tools/sandbox.html'));
  },'Actual isolated TOC tool iframe target not found');
  const sandboxSession=await browser.send('Target.attachToTarget',{targetId:sandboxTarget.targetId,flatten:true});
  const sandbox={send:(method,params={},timeout=15000)=>browser.send(method,params,timeout,sandboxSession.sessionId)};
  await sandbox.send('Runtime.enable');
  const labels=await eventually(async()=>{
    const value=await evaluate(sandbox,'[...document.querySelectorAll("#toc-list button")].map(node=>node.textContent.trim())');
    return value.length>=2?value:null;
  },'Side Panel TOC sandbox did not receive the current page headings');
  assert(labels.includes('回答一 H1')&&labels.includes('同一回答第二个 H1'),
    'Side Panel must render two H1 headings from the same answer');
  assert.equal(labels.filter(label=>label==='重复标题').length,2,
    'R4.3 Side Panel default overview must include the H2 titles when only two H1 exist');
  // R4.4: a long AI conversation has many independent answers. The default
  // source picker must follow the current answer, but still allow manual pins.
  assert.equal(await evaluate(sandbox,'document.querySelector("#toc-source").value'),'',
    'Side Panel starts in Auto-follow mode');
  await browser.send('Target.activateTarget',{targetId:second.targetId});
  await chatPage.send('Page.bringToFront');
  await eventually(()=>evaluate(chatPage,'document.visibilityState==="visible"'),
    'Chat tab is not active for heading navigation');
  const answerB=conversation.data.items.find(item=>item.label==='回答二 H1');
  assert.ok(answerB,'second answer fixture must exist');
  const jumpB=await panelSend(origin+'/chat.html','toc.navigate',{id:answerB.id,sourceId:answerB.sourceId});
  assert.equal(jumpB.ok,true,'trusted navigation must activate the second answer');
  await eventually(async()=>{
    const snapshot=await evaluate(sandbox,`({
      selected:document.querySelector('#toc-source').value,
      autoLabel:document.querySelector('#toc-source option')?.textContent,
      labels:[...document.querySelectorAll('#toc-list button')].map(node=>node.textContent.trim())
    })`);
    return snapshot.selected===''&&snapshot.autoLabel?.includes('回答 2')&&
      snapshot.labels.includes('回答二 H1')&&!snapshot.labels.includes('回答一 H1');
  },'R4.4 Side Panel did not automatically follow the active second answer');
  console.log('TOC_NATIVE_STAGE: R4.4 Side Panel followed the active answer automatically');
  await capture(side,'real-sidepanel-toc.png');
  console.log('TOC_NATIVE_STAGE: real Side Panel local import, website consent and two-H1 outline succeeded');
  await trustedClick(side,'#sidebar-tool-back');
  await eventually(()=>evaluate(side,'!document.querySelector("#sidebar-tool-list-view").hidden'),
    'Returning from the TOC iframe did not restore installed tools');
  const manageSelector='#sidebar-tool-list button[data-sidebar-tool-action="sites"][data-sidebar-tool-id="reading-toc"]';
  if(!await evaluate(side,'!!document.querySelector("#sidebar-tool-sites-reading-toc")&&!document.querySelector("#sidebar-tool-sites-reading-toc").hidden'))await trustedClick(side,manageSelector);
  await eventually(()=>evaluate(side,`(()=>{
    const panel=document.querySelector('#sidebar-tool-sites-reading-toc');
    return panel&&!panel.hidden&&panel.textContent.includes(${JSON.stringify(origin)});
  })()`),'Previously approved website was not visible in the manager');
  await trustedClick(side,'#sidebar-tool-sites-reading-toc .sidebar-tool-site-revoke');
  await eventually(()=>evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),
    'Revoking an origin in the actual Side Panel did not clean the webpage');
  assert.equal((await panelSend(origin+'/chat.html','toc.snapshot')).ok,false);
  console.log('TOC_NATIVE_STAGE: site manager revoked origin and removed page overlay');

  // Regrant and then close the *actual SIDE_PANEL target*. The independent
  // content script must stay alive until an explicit revoke/uninstall.
  await trustedClick(side,grantSelector);
  await eventually(()=>evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
    'Site manager did not allow re-enabling a previously revoked origin');
  assert.equal(confirmedDialogs,2);
  assert.deepEqual(dialogErrors,[]);
  const closed=await browser.send('Target.closeTarget',{targetId:sideTarget.targetId});
  assert.equal(closed.success,true,'Actual Chrome Side Panel target could not close');
  await eventually(async()=>{
    const contexts=await evaluate(launcherHost,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return !contexts.some(value=>value.documentUrl===sideContext.documentUrl);
  },'Closing Side Panel did not destroy its Chrome context');
  assert.equal(await evaluate(chatPage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),1,
    'Closing Side Panel must not disable the independently granted TOC overlay');
  console.log('TOC_NATIVE_STAGE: Side Panel closed without revoking the persistent webpage TOC');
});
