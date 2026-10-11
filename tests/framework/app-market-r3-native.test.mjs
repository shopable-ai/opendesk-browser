// Real production Chrome MV3 smoke with an isolated temporary profile.
// No user Chrome profile, mocks of install receipts, or fixture-only DOM tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const chromeBinary=[process.env.CHROME_BIN,'google-chrome','chromium','google-chrome-stable']
  .filter(Boolean).find(exe=>spawnSync(exe,['--version'],{stdio:'ignore'}).status===0);
const storageKey='opendesk.sidebar-tools.installed.v1';

function cdpSocket(url){
  const ws=new WebSocket(url),pending=new Map();let nextId=0;
  const ready=new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const result=JSON.parse(event.data);if(!result.id)return;
    const job=pending.get(result.id);if(!job)return;
    clearTimeout(job.timer);pending.delete(result.id);
    result.error?job.reject(Error(result.error.message)):job.resolve(result.result);
  };
  return {ready,send(method,params={},timeout=20000,sessionId){
    return new Promise((resolve,reject)=>{
      const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
      pending.set(id,{resolve,reject,timer});
      ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  },close(){ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP_CLOSED'));}pending.clear();}};
}
async function evaluate(session,expression){
  const row=await session.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(row.exceptionDetails)throw Error('PAGE_EXCEPTION '+JSON.stringify(row.exceptionDetails).slice(0,600));
  return row.result.value;
}
async function until(fn,why){
  for(let i=0;i<100;i++){try{const result=await fn();if(result)return result;}catch{}await sleep(160);}
  throw Error('Chrome timeout: '+why);
}
async function click(session,selector){
  const point=await evaluate(session,
    "(()=>{const el=document.querySelector("+JSON.stringify(selector)+");"+
    "if(!el||el.disabled||!el.getClientRects().length)throw Error('CONTROL_NOT_VISIBLE');"+
    "el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();"+
    "return {x:b.x+b.width/2,y:b.y+b.height/2};})()");
  for(const type of ['mousePressed','mouseReleased'])
    await session.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
}

test('R3 production Chrome: Side Panel → official market → review → install → my apps → open',{timeout:180000},async t=>{
  assert.ok(chromeBinary,'A real Chrome for Testing binary is required, not a fake browser');
  const extension=resolve('dist/production'),profile=await mkdtemp(join(tmpdir(),'opendesk-market-r3-'));
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
  assert.equal(manifest.name,'OpenDesk Browser');
  assert.equal(manifest.externally_connectable,undefined,'unconfigured public origins must not open external install authority');
  const chrome=spawn(chromeBinary,[
    ...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
    '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let logs='',browser=null,host=null,side=null,market=null,opened=null;
  chrome.stderr.on('data',b=>{logs=(logs+b).slice(-3500);});
  t.after(async()=>{
    for(const x of [opened,market,side,host,browser])x?.close?.();
    if(chrome.exitCode===null&&chrome.signalCode===null)
      await new Promise(done=>{const timer=setTimeout(()=>chrome.kill('SIGKILL'),2500);
        chrome.once('close',()=>{clearTimeout(timer);done();});chrome.kill('SIGTERM');});
    await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  });
  let port=0;
  for(let i=0;i<120;i++){
    if(chrome.exitCode!==null)throw Error('Chrome stopped: '+logs);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
    await sleep(150);
  }
  assert(port,'Chrome did not publish DevToolsActivePort: '+logs);
  const local='http://127.0.0.1:'+port;
  const version=await(await fetch(local+'/json/version')).json();
  browser=cdpSocket(version.webSocketDebuggerUrl);await browser.ready;
  async function openTab(url){
    const {targetId}=await browser.send('Target.createTarget',{url});
    const info=await until(async()=>{
      const rows=await(await fetch(local+'/json/list')).json();
      return rows.find(x=>x.id===targetId)?.webSocketDebuggerUrl;
    },'CDP tab '+url);
    const cdp=cdpSocket(info);await cdp.ready;
    await cdp.send('Runtime.enable');await cdp.send('Page.enable');
    return {cdp,targetId};
  }
  const id=await until(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(x=>x.type==='service_worker'&&
      /^chrome-extension:\/\/[^/]+\/sw\.js/.test(x.url||''))?.url?.split('/')[2];
  },'OpenDesk SW extension identity');
  host=(await openTab('chrome-extension://'+id+'/ui/tool.html?hostInstanceId='+randomUUID())).cdp;
  await until(()=>evaluate(host,'!!document.querySelector("#sidebar-tool-market")'),'host market button');
  const windowId=await evaluate(host,'chrome.windows.getCurrent().then(w=>w.id)');
  await evaluate(host,"(()=>{const b=document.createElement('button');b.id='r3-open-test-panel';"+
    "b.textContent='Open Side Panel';b.style.cssText='position:fixed;z-index:999999;top:80px;left:30px;min-width:210px;min-height:50px';"+
    "b.addEventListener('click',()=>chrome.sidePanel.open({windowId:"+windowId+"}));document.body.append(b);return true})()");
  await click(host,'#r3-open-test-panel');
  const sideInfo=await until(async()=>{
    const contexts=await evaluate(host,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
    return contexts.find(x=>x.documentUrl?.includes('/ui/tool.html'));
  },'genuine Chrome Side Panel context');
  const sideTarget=await until(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(t=>t.url===sideInfo.documentUrl);
  },'Side Panel target');
  const attached=await browser.send('Target.attachToTarget',{targetId:sideTarget.targetId,flatten:true});
  side={send:(method,params={},timeout=20000)=>browser.send(method,params,timeout,attached.sessionId)};
  await side.send('Runtime.enable');await side.send('Page.enable');
  await until(()=>evaluate(side,'!!document.querySelector("#tab-tools")'),'tool tab visible');
  await click(side,'#tab-tools');
  await until(()=>evaluate(side,'!document.querySelector("#workbench-tools").hidden'),'tool tab open');
  await click(side,'#sidebar-tool-market');
  const marketInfo=await until(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(t=>t.type==='page'&&t.url?.includes('chrome-extension://'+id+'/ui/marketplace.html'));
  },'market opened by Side Panel');
  const socketInfo=await until(async()=>{
    const targets=await(await fetch(local+'/json/list')).json();
    return targets.find(t=>t.id===marketInfo.targetId)?.webSocketDebuggerUrl;
  },'market CDP websocket');
  market=cdpSocket(socketInfo);await market.ready;
  await market.send('Runtime.enable');await market.send('Page.enable');
  await until(()=>evaluate(market,'document.querySelectorAll(".app-card").length===5'),'five official app cards');
  const before=await evaluate(market,
    "chrome.storage.local.get("+JSON.stringify(storageKey)+").then(x=>(x["+JSON.stringify(storageKey)+"]||[]).length)");
  assert.equal(before,0,'market landing never silently installs tools');
  await click(market,'a[href="#/apps/opendesk/reading-toc/versions/1.0.2"]');
  await until(()=>evaluate(market,'!!document.querySelector(".screen-demo")'),'independent detail');
  assert.equal(await evaluate(market,'document.querySelectorAll(".review").length'),0);
  await click(market,'#market-root .detail-layout aside .actions button');
  await until(()=>evaluate(market,'!!document.querySelector(".review")'),'review confirmation');
  assert.equal(await evaluate(market,
    "chrome.storage.local.get("+JSON.stringify(storageKey)+").then(x=>(x["+JSON.stringify(storageKey)+"]||[]).length)"),0,
    'review only, not installation');
  await click(market,'.review .actions .primary');
  const rows=await until(async()=>{
    const found=await evaluate(market,
      "chrome.storage.local.get("+JSON.stringify(storageKey)+").then(x=>x["+JSON.stringify(storageKey)+"]||[])");
    return found.length===1&&found[0].id==='reading-toc'?found:null;
  },'persisted tool installation');
  assert.equal(rows[0].version,'1.0.2');
  assert.equal(await evaluate(market,'document.querySelectorAll("iframe").length'),0,
    'install must never auto-run tool iframe');
  const grants=await evaluate(market,
    "chrome.storage.local.get('opendesk.sidebar-tools.toc-sites.v1').then(x=>x['opendesk.sidebar-tools.toc-sites.v1']||{})");
  assert.equal(Boolean(grants['reading-toc']),false,'install does not grant site access');
  await click(market,'#market-my');
  await until(()=>evaluate(market,'location.hash==="#/my"'),'My Apps navigation');
  await until(()=>evaluate(market,'!!document.querySelector(".action-row button")'),'installed application row');
  await click(market,'.action-row button');
  const openedInfo=await until(async()=>{
    const {targetInfos}=await browser.send('Target.getTargets');
    return targetInfos.find(row=>row.type==='page'&&row.url?.includes('/ui/tool.html')&&row.url?.includes('toolId=reading-toc'));
  },'use tool explicit open in independent page');
  assert.ok(openedInfo.url.includes('toolId=reading-toc'));
  // Official fixed-revision collection is a real multi-tool transaction:
  // the already installed TOC is skipped, two other shipped packages install
  // through the same audited registry, and every result persists after reload.
  await click(market,'#market-collection');
  await until(()=>evaluate(market,
    'location.hash==="#/collections/reading-kit/revisions/1"'),'official collection details');
  await click(market,'#market-root .surface .actions .primary');
  await until(()=>evaluate(market,'!!document.querySelector(".review .actions .primary")'),'collection review');
  assert.equal(await evaluate(market,
    "chrome.storage.local.get("+JSON.stringify(storageKey)+").then(x=>(x["+JSON.stringify(storageKey)+"]||[]).length)"),1,
    'preflight never installs before confirmation');
  await click(market,'.review .actions .primary');
  const batchResult=await until(async()=>{
    const data=await evaluate(market,
      "chrome.storage.local.get(['opendesk.market.batch.v1',"+JSON.stringify(storageKey)+"]).then(x=>({"+
      "batch:x['opendesk.market.batch.v1'],installed:x["+JSON.stringify(storageKey)+"]||[]}))");
    const statuses=data.batch?.items?.map(row=>row.status);
    return data.installed.length===3&&JSON.stringify(statuses)===
      JSON.stringify(['skip','succeeded','succeeded'])?data:null;
  },'real batch committed with installed skip and two successes');
  assert.deepEqual(batchResult.installed.map(row=>row.id),
    ['reading-toc','web-markdown-clipper','quick-notes']);
  assert.equal(batchResult.batch.collectionId,'reading-kit');
  assert.equal(batchResult.batch.revision,1);
  const operations=new Set(batchResult.batch.items.map(row=>row.operationId));
  assert.equal(operations.size,3,'fixed members keep distinct durable operation IDs');
  await market.send('Page.reload');
  await until(()=>evaluate(market,
    'document.querySelectorAll("#market-root .surface").length>=1' ),'market reloaded after batch');
  const persisted=await evaluate(market,
    "chrome.storage.local.get('opendesk.market.batch.v1').then(x=>x['opendesk.market.batch.v1'])");
  assert.deepEqual(persisted.items.map(row=>row.status),['skip','succeeded','succeeded'],
    'batch success, skip and operation identity persist across document reload');
  assert.deepEqual(persisted.items.map(row=>row.operationId),batchResult.batch.items.map(row=>row.operationId));
  await click(market,'#market-home');
  await until(()=>evaluate(market,'document.querySelectorAll(".app-card").length===5'),'catalog after batch');
  const remaining=[
    {id:'markdown-workbench',version:'1.0.0'},
    {id:'knowledge-inbox',version:'1.0.0'}
  ];
  // Exercise all released packages through real mouse events in the same
  // extension/profile, not mock writes or a copied HTML prototype.
  for(const app of remaining){
    await click(market,'#market-home');
    await until(()=>evaluate(market,'document.querySelectorAll(".app-card").length===5'),'market catalog');
    await click(market,'a[href="#/apps/opendesk/'+app.id+'/versions/'+app.version+'"]');
    await until(()=>evaluate(market,
      'document.querySelector(".detail-layout") && document.querySelector("#market-root h1")?.textContent==='+JSON.stringify(
       app.id==='web-markdown-clipper'?'网页剪藏':app.id==='quick-notes'?'网页笔记':
       app.id==='markdown-workbench'?'Markdown 工作台':'知识收件箱')),'market pinned detail '+app.id);
    await click(market,'#market-root .detail-layout aside .actions button');
    await until(()=>evaluate(market,'!!document.querySelector(".review .actions .primary")'),'review '+app.id);
    await click(market,'.review .actions .primary');
    await until(async()=>{
      const installed=await evaluate(market,
        "chrome.storage.local.get("+JSON.stringify(storageKey)+").then(x=>x["+JSON.stringify(storageKey)+"]||[])");
      return installed.some(row=>row.id===app.id&&row.version===app.version);
    },'actual persisted install '+app.id);
    assert.equal(await evaluate(market,'document.querySelectorAll("iframe").length'),0,
      'installing '+app.id+' must not automatically execute its UI');
  }
  const allRows=await evaluate(market,
    "chrome.storage.local.get("+JSON.stringify(storageKey)+").then(x=>x["+JSON.stringify(storageKey)+"]||[])");
  assert.deepEqual(allRows.map(row=>row.id),['reading-toc','web-markdown-clipper','quick-notes',...remaining.map(row=>row.id)]);
  await click(market,'#market-my');
  await until(()=>evaluate(market,
    'document.querySelectorAll("#market-root .action-row button").length>=5'),'five My Apps rows');
  for(let i=1;i<5;i++){
    await click(market,'#market-root .surface .action-row:nth-child('+(i+1)+') button');
    await until(async()=>{
      const {targetInfos}=await browser.send('Target.getTargets');
      return targetInfos.some(row=>row.type==='page'&&row.url?.includes('/ui/tool.html')&&
        row.url?.includes('toolId='+allRows[i].id));
    },'explicitly open '+allRows[i].id);
  }
  const receipt=JSON.parse(await readFile(resolve('docs/framework/evidence/wxt/builds/build-production.json'),'utf8'));
  const artifactDir=resolve('artifacts/app-market-r3');
  await mkdir(artifactDir,{recursive:true});
  const image=await market.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(artifactDir,'market-my-apps.png'),Buffer.from(image.data,'base64'));
  const evidence={result:'REAL_CHROME_FIXTURE_PASS',commit:process.env.GITHUB_SHA||'LOCAL_UNPINNED',
    extensionId:id,chromeVersion:version.Browser,packageHash:receipt.report?.packageHash||null,
    installed:allRows.map(row=>({id:row.id,version:row.version})),batch:{collectionId:'reading-kit',revision:1,
      statuses:persisted.items.map(row=>row.status),reloadVerified:true},sidePanel:true,reviewed:true,autoRun:false,
    siteGrant:false,openedToolUrl:openedInfo.url,marketScreenshot:'artifacts/app-market-r3/market-my-apps.png',
    publicOrigin:'NOT_CONFIGURED',macManual:'NOT_TESTED'};
  await writeFile(join(artifactDir,'native-result.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log('R3_NATIVE_RESULT '+JSON.stringify(evidence));
});
