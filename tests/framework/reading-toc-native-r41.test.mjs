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
  return {send(method,params={},timeout=15000){return new Promise((ok,fail)=>{
    const n=++id,timer=setTimeout(()=>{requests.delete(n);fail(Error('CDP_TIMEOUT: '+method));},timeout);
    requests.set(n,{resolve:ok,reject:fail});socket.send(JSON.stringify({id:n,method,params}));
  });},close(){socket.close();for(const waiter of requests.values()){
    clearTimeout(waiter.timer);waiter.reject(Error('CDP_DISCONNECTED'));
  }requests.clear();}};
}
async function evaluate(target,expression,timeout=15000){
  const result=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);
  if(result.exceptionDetails)throw Error('PAGE_EXCEPTION '+JSON.stringify(result.exceptionDetails).slice(0,500));
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
    chrome.kill('SIGTERM');server.close();
    await rm(profile,{recursive:true,force:true});
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
  const first=await openTab(origin+'/article.html');articlePage=first.cdp;
  const extensionId=await eventually(async()=>{
    const targets=await browser.send('Target.getTargets');
    const service=targets.targetInfos.find(item=>item.type==='service_worker'&&
      item.url?.startsWith('chrome-extension://'));
    return service?.url?.match(/^chrome-extension:\/\/([^/]+)\//)?.[1];
  },'Compiled MV3 service worker did not register',{attempts:100,delay:150});
  const ownUrl='chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID();
  const panel=await openTab(ownUrl);host=panel.cdp;
  await eventually(()=>evaluate(host,'document.readyState==="complete" && !!document.querySelector("#sidebar-tool-official-install")'),
    'Real tool shell did not mount');
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0,
    'No website should obtain TOC before installation/approval');
  // Test the actual official installer HTML event path and bundled JSON, not a
  // synthetic package installed directly into chrome.storage.
  await evaluate(host,'document.querySelector("#sidebar-tool-official-install").click();true');
  await eventually(()=>evaluate(host,'!document.querySelector("#sidebar-tool-preview").hidden'),
    'Official TOC package was not staged for review');
  assert.equal(await evaluate(host,'document.querySelector("#sidebar-tool-preview-title").textContent'),pkg.title);
  await evaluate(host,'document.querySelector("#sidebar-tool-install").click();true');
  const installed=await eventually(async()=>{
    const rows=await evaluate(host,'chrome.storage.local.get("opendesk.sidebar-tools.installed.v1")');
    return rows?.['opendesk.sidebar-tools.installed.v1']?.find(x=>x.id==='reading-toc')||null;
  },'Official installation did not save the v1 package');
  assert.equal(installed.version,pkg.version);
  assert.deepEqual(installed.capabilities,['page.toc']);
  assert.equal(await evaluate(articlePage,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0,
    'Installed package alone must not expose current page headings');
  // The installed tool is now granted exactly this loopback origin for the
  // browser-runtime smoke; the interactive site consent UI is still Mac-manual.
  await evaluate(host,`chrome.storage.local.set({'opendesk.sidebar-tools.toc-sites.v1':{'reading-toc':[${JSON.stringify(origin)}]}}).then(()=>true)`);
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
  const snapshot=await eventually(async()=>{
    const result=await panelSend(articleUrl,'toc.snapshot');
    return result?.ok&&result.data?.items?.length>=4?result:null;
  },'Trusted sender could not read actual page title snapshot');
  assert.equal(snapshot.data.items.filter(x=>x.rank===1).length,2,
    'Internal article H1s must survive even if the page title is excluded');
  assert.equal(new Set(snapshot.data.items.map(x=>x.id)).size,snapshot.data.items.length,
    'Duplicate original DOM ids must not collide');
  const jumpTarget=snapshot.data.items.find(x=>x.label==='正文内 H1 一');
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
});