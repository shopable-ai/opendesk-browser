// Extension of the existing CDP native-input driver. No installation/storage writes
// are arranged here: website messages and trusted UI perform all product actions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {MARKET_HEADERS} from '../../scripts/build-market-site.mjs';
import {MARKET_INTENTS_STORE,MARKET_INTENT_PROTOCOL as protocol} from '../../src/marketplace/intent.js';
import {MARKET_OPERATIONS_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE,marketBatchUnresolved} from '../../src/marketplace/batch.js';
import {OFFICIAL_COLLECTIONS} from '../../src/marketplace/catalog.js';
import {sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {READING_TOC_SITE_STORE} from '../../src/reading-toc/policy.js';
import {observeMarketSender} from './app-market-r5-observers.mjs';
import {marketUIAudit} from './app-market-r5-ui.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.xml':'application/xml','.txt':'text/plain'};
async function serverAt(port,handler){
  const server=createServer((req,res)=>Promise.resolve(handler(req,res)).catch(error=>{res.writeHead(500);res.end(String(error.message));}));
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
  return {server,origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(ok=>{server.closeAllConnections();server.close(ok);})};
}
export async function runMarketR5Acceptance(d){
  const {evidence,click,inputText,evaluate,until,visible,activate,openTab,attach,readStore,installed,
    screenshot,phase,packages,openTool,back,importPackage,uninstall}=d;
  const side=()=>d.getSide(),host=()=>d.getHost(),id=d.getExtensionId();
  const currentKit=OFFICIAL_COLLECTIONS.find(row=>row.id==='reading-kit');
  assert.equal(d.buildMode,'development','R5 HTTP acceptance requires the dev-only trust channel');
  const root=resolve('dist/app-market-public'),siteBytes=await readFile(join(root,'site-build.json'));
  const site=JSON.parse(siteBytes),channel=JSON.parse(await readFile(join(d.extension,'marketplace/channel.json')));
  assert.equal(channel.extensionId,id,'computed unpacked ID must match the actual browser');
  assert.equal(site.channel.extensionId,id);assert.equal(site.origin,channel.origin);
  assert.deepEqual(JSON.parse(await readFile(join(root,'channel.json'))),channel);
  const output=await Promise.all(site.files.map(async file=>{const bytes=await readFile(join(root,file.path));assert.equal(hash(bytes),file.sha256,file.path);return file;}));
  evidence.r5={siteBuildId:site.buildId,siteManifestSha256:hash(siteBytes),origin:channel.origin,
    websiteFiles:output.length,channel,actualBrowser:'Chrome for Testing; real extension and HTTP',
    externalSender:'browser-provided; never supplied by driver',checks:[],negative:[],responsive:[],
    result:'IN_PROGRESS',formalHttps:'BLOCKED_NO_REVIEWED_PRODUCTION_CHANNEL',macChrome:process.platform==='darwin'?'IN_PROGRESS':'NOT_TESTED',
    notTested:['formal-https-and-web-store-channel','user-local-mac-profile','handoff-create-persist-window-interruption',
      'native-install-acknowledgement-loss','native-capacity-and-artifact-corruption-faults']};
  const check=(name,detail={})=>{evidence.r5.checks.push({name,status:'PASS',...detail});};
  const ui=marketUIAudit(d);
  const mark=(name,detail={})=>phase('r5-'+name,detail);
  const targets=async()=>(await d.sendBrowser('Target.getTargets')).targetInfos;
  const navigate=async(target,url)=>{await target.send('Page.navigate',{url});await until(()=>evaluate(target,'document.readyState==="complete"&&location.href==='+JSON.stringify(url)),'actual page navigation '+url);};
  const close=async target=>assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:target.targetId})).success,true);
  const html='<!doctype html><meta charset="utf-8"><title>R5 external-message conformance fixture</title><style>body{font:16px system-ui;display:grid;place-content:center;min-height:140px;margin:0}button{padding:18px;min-width:240px;min-height:60px}pre{white-space:pre-wrap;max-width:640px}</style><button id="send" disabled>Send real external test message</button><pre id="result" role="status">ready</pre><script src="/_r5/conformance.js"></script>';
  const conformanceJS=`const params=new URLSearchParams(location.search);const subject={kind:'app',marketId:'opendesk/markdown-workbench',version:'1.0.1'};const base={protocol:${JSON.stringify(protocol)},action:'PROBE'};
    const cases={protocol:{...base,protocol:'unsupported.v0'},fields:{...base,js:'untrusted()'},rpc:{...base,action:'RUN'},conflict:{protocol:base.protocol,action:'OPEN_INSTALL_REVIEW',intentId:params.get('intent'),subject:{...subject,version:'0.0.1'}}};
    document.querySelector('#send').addEventListener('click',event=>{const result=document.querySelector('#result');result.textContent='pending';const finish=value=>{const out={trusted:event.isTrusted,...value};result.textContent=JSON.stringify(out);if(parent!==window)parent.postMessage(out,location.origin);};
      const target=params.get('case')==='wrong-id'?'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb':${JSON.stringify(id)};
      if(!globalThis.chrome?.runtime?.sendMessage)return finish({error:'NO_RECEIVER_API'});
      chrome.runtime.sendMessage(target,cases[params.get('case')]||base,response=>finish(chrome.runtime.lastError?{error:chrome.runtime.lastError.message}:{response}));});document.querySelector('#send').disabled=false;`;
  const publicHandler=async(req,res)=>{
    const u=new URL(req.url,channel.origin);
    if(u.pathname==='/_r5/conformance.js'){res.writeHead(200,{'content-type':mime['.js']});return res.end(conformanceJS);}
    if(u.pathname==='/_r5/frame.html'){res.writeHead(200,{'content-type':mime['.html']});return res.end('<!doctype html><title>R5 real iframe rejection</title><iframe id="frame" style="width:600px;height:180px;border:0" src="/_r5/conformance.html"></iframe><pre id="result">ready</pre><script src="/_r5/parent.js"></script>');}
    if(u.pathname==='/_r5/parent.js'){res.writeHead(200,{'content-type':mime['.js']});return res.end('window.addEventListener("message",event=>{if(event.origin===location.origin)document.querySelector("#result").textContent=JSON.stringify(event.data)})');}
    if(u.pathname==='/_r5/conformance.html'){res.writeHead(200,{'content-type':mime['.html']});return res.end(html);}
    const path=resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));
    if(!path.startsWith(root+'/')){res.writeHead(400);return res.end();}
    try{const info=await stat(path);if(!info.isFile())throw Error('missing');res.writeHead(200,{...MARKET_HEADERS,'content-type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));}
    catch{res.writeHead(404,{...MARKET_HEADERS,'content-type':mime['.html']});res.end(await readFile(join(root,'404.html')));}
  };
  const http=await serverAt(Number(new URL(channel.origin).port),publicHandler);d.t.after(http.close);
  const wrongPort=await serverAt(0,publicHandler);d.t.after(wrongPort.close);
  const demoBytes=await readFile('examples/tasks/demo-form.html');
  const demo=await serverAt(43111,async(req,res)=>{if(new URL(req.url,'http://127.0.0.1:43111').pathname!=='/demo-form.html'){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':mime['.html']});res.end(demoBytes);});d.t.after(demo.close);
  evidence.r5.demo={url:demo.origin+'/demo-form.html',source:'examples/tasks/demo-form.html',sha256:hash(demoBytes)};
  const intentRows=async()=>((await readStore(MARKET_INTENTS_STORE,host()))?.intents||[]);
  async function newIntentBudget(){
    // Product rate limits remain active; never alter the journal or test clock.
    for(let i=0;i<65;i++){
      const recent=(await intentRows()).filter(row=>row.createdAt>Date.now()-60000);
      if(recent.length<6)return;
      if(i===0)console.log('R5_NATIVE waiting for the real origin rate-limit window');
      await pause(1000);
    }
    throw Error('Real intent rate window did not expire');
  }
  async function websiteSubjectReview(subject,{existingPage=null,details=false,keyboard=false,audit=false}={}){
    await newIntentBudget();
    const route=subject.kind==='app'?subject.marketId+'/versions/'+subject.version+'/':
      'collections/'+subject.collectionId+'/revisions/'+subject.revision+'/';
    const url=channel.origin+(details?(subject.kind==='app'?'/apps/':'/'):'/install/')+route;
    const page=existingPage||await openTab(url);await visible(page,'#open-review');
    await until(()=>evaluate(page,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'real page script and external probe ready');
    if(audit)await ui.detail(page,'r5-web-detail','#open-review');
    if(keyboard)await ui.enter(page,'#open-review','r5-first-website-handoff');
    else await click(page,'#open-review');
    await until(async()=>{const state=await evaluate(page,'document.querySelector("#handoff-state").dataset.state');
      if(state==='error')throw Error(await evaluate(page,'document.querySelector("#handoff-state").textContent'));return state==='success';},'HTTP website opened trusted review');
    const intent=await evaluate(page,'JSON.parse(sessionStorage.getItem('+JSON.stringify('opendesk.market.intent:'+JSON.stringify(subject))+')).id');
    const row=await until(async()=>(await intentRows()).find(r=>r.intentId===intent),'real persisted handoff');
    const reviewURL='chrome-extension://'+id+'/ui/marketplace.html?intent='+row.reviewId;
    const info=await until(async()=>(await targets()).find(target=>target.url===reviewURL),'fixed trusted review tab');
    const review=await attach(info.targetId);await until(()=>evaluate(review,'document.body.innerText.includes("固定版本")||document.body.innerText.includes("固定成员")'),'trusted review loaded');
    if(audit){await visible(review,'[data-market-action="confirm-install"]');await ui.detail(review,'r5-trusted-review','[data-market-action="confirm-install"]');}
    return {page,review,row,reviewURL};
  }
  const websiteReview=(toolId,version,options)=>websiteSubjectReview({kind:'app',marketId:'opendesk/'+toolId,version},options);
  await mark('public-pages-and-responsive-layout');
  const senderObserver=await observeMarketSender(d);
  let website=await openTab(channel.origin+'/');await visible(website,'#app-search');
  await until(()=>evaluate(website,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'real external probe');
  await senderObserver.dispose();
  assert.equal(senderObserver.record.status,'OBSERVED');assert.deepEqual(senderObserver.record.errors,[]);
  assert(senderObserver.record.observations.length>0);
  for(const {value} of senderObserver.record.observations){
    assert.match(value.sender.documentId.value,/^[0-9A-F]{32}$/i);
    assert.equal(value.sender.frameId.value,0);assert.equal(value.sender.documentLifecycle.value,'active');
    assert.equal(value.sender.origin.value,channel.origin);assert.equal(value.sender.url.value,channel.origin+'/');
    assert.equal(value.sender.id.type,'undefined');assert.equal(value.sender.nativeApplication.type,'undefined');
    assert.equal(value.tab.incognito.value,false);assert(Number.isSafeInteger(value.tab.id.value)&&value.tab.id.value>=0);
  }
  check('real-browser-sender-and-live-document-verification',{observations:senderObserver.record.observations.length});
  await ui.reach(website,'.skip-link','r5-home-skip-link');await ui.key(website,'Enter','Enter',13);
  assert.equal(await evaluate(website,'document.activeElement.id'),'content');
  assert.equal(await evaluate(website,'document.querySelectorAll(".app-card").length'),6);
  await inputText(website,'#app-search','Markdown');
  assert.equal(await evaluate(website,'[...document.querySelectorAll(".app-card")].filter(row=>!row.hidden).length'),1);
  await inputText(website,'#app-search','不存在的应用名称');
  assert.equal(await evaluate(website,'document.querySelector("#no-results").hidden'),false);
  await inputText(website,'#app-search','');await click(website,'button[data-filter="阅读"]');
  assert(await evaluate(website,'[...document.querySelectorAll(".app-card")].filter(row=>!row.hidden).every(row=>row.dataset.category==="阅读")'));
  await click(website,'button[data-filter="全部"]');
  await ui.reach(website,'button[data-filter="阅读"]','r5-home-category-space');await ui.key(website,' ','Space',32);
  assert.equal(await evaluate(website,'document.querySelector("button[data-filter=阅读]").getAttribute("aria-pressed")'),'true');
  await click(website,'button[data-filter="全部"]');
  for(const width of [320,360,520,1280]){
    await website.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await until(()=>evaluate(website,'innerWidth==='+width),'website viewport width');
    const result=await evaluate(website,'({width:innerWidth,scroll:document.documentElement.scrollWidth})');
    assert.equal(result.width,width);assert(result.scroll<=width);evidence.r5.responsive.push({page:'home',...result});
    await screenshot(website,'r5-home-'+width+'.png');
  }
  await website.send('Emulation.clearDeviceMetricsOverride');
  await website.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await screenshot(website,'r5-home-dark.png');
  await website.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  for(const path of ['/apps/opendesk/markdown-workbench/','/apps/opendesk/markdown-workbench/versions/1.0.1/',
    '/apps/opendesk/quick-notes/versions/1.1.1/','/collections/','/collections/reading-kit/revisions/1/','/collections/reading-kit/revisions/2/',
    '/collections/reading-kit/revisions/'+currentKit.revision+'/','/how-to-install/']){
    const response=await fetch(channel.origin+path);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    await navigate(website,channel.origin+path);assert((await evaluate(website,'document.title')).includes('OpenDesk'));
    await website.send('Page.reload');await until(()=>evaluate(website,'document.readyState==="complete"'),'share route refresh');
    if(path==='/collections/reading-kit/revisions/'+currentKit.revision+'/')await ui.narrow(website,'r5-web-collection','#open-review');
    if(path==='/how-to-install/')await ui.narrow(website,'r5-web-help','h1');
    if(path==='/apps/opendesk/quick-notes/versions/1.1.1/')await ui.narrow(website,'r5-web-historical-release','h1');
  }
  assert.equal((await fetch(channel.origin+'/missing-r5-route/')).status,404);
  await navigate(website,channel.origin+'/missing-r5-route/');assert.match(await evaluate(website,'document.querySelector("h1").textContent'),/找不到/);
  check('public-routes-search-filters-responsive-dark-refresh-404');await close(website);

  await mark('http-first-install-fixed-review-and-use');
  const initial=await installed();assert(!initial.some(row=>row.id==='markdown-workbench'));
  let first=await websiteReview('markdown-workbench',packages.get('markdown-workbench').version,{details:true,keyboard:true,audit:true});
  await visible(first.review,'[data-market-action="confirm-install"]');
  assert.deepEqual(await installed(),initial,'website handoff cannot install');await d.assertNoFrames();await d.assertNoGrants();
  assert.match(await evaluate(first.review,'document.body.innerText'),/发布者：OpenDesk/);
  const immutableTitle=await evaluate(first.review,'document.querySelector("h1").textContent');
  const other=await websiteReview('knowledge-inbox',packages.get('knowledge-inbox').version);
  await visible(other.review,'[data-market-action="confirm-install"]');
  assert.notEqual(first.row.operationId,other.row.operationId);assert.notEqual(first.review.targetId,other.review.targetId);
  assert.equal(await evaluate(first.review,'document.querySelector("h1").textContent'),immutableTitle);
  assert.deepEqual(await installed(),initial,'two pending candidates are independent and neither installs');
  await click(other.review,'[data-market-action="cancel-install"]');await close(other.review);await close(other.page);
  check('two-real-valid-pending-candidates-cannot-replace-each-other');
  await first.review.send('Page.navigate',{url:first.reviewURL+'#/apps/opendesk/time-review/versions/1.3.0'});
  await until(()=>evaluate(first.review,'document.querySelector("h1")?.textContent==='+JSON.stringify(immutableTitle)),'hash cannot replace reviewed candidate');
  // Restore the fixed URL by actual navigation; no data mutation.
  await navigate(first.review,first.reviewURL);await visible(first.review,'[data-market-action="confirm-install"]');
  await screenshot(first.review,'r5-trusted-review.png');
  const beforeTargets=(await targets()).filter(row=>row.url===first.reviewURL).length;
  await click(first.page,'#open-review');await until(()=>evaluate(first.page,'document.querySelector("#handoff-state").dataset.state==="success"'),'same intent repeated');
  assert.equal((await targets()).filter(row=>row.url===first.reviewURL).length,beforeTargets);
  assert.equal((await intentRows()).find(row=>row.intentId===first.row.intentId).operationId,first.row.operationId);
  await close(first.page);await click(first.review,'[data-market-action="confirm-install"]');
  await until(async()=>(await installed()).some(row=>row.id==='markdown-workbench'&&row.version===first.row.subject.version),'actual registry after explicit install');
  await d.assertNoFrames();await d.assertNoGrants();
  const operation=await until(async()=>{const row=(await readStore(MARKET_OPERATIONS_STORE,host()))?.[first.row.operationId];return row?.state==='succeeded'&&row;},'first install transaction completed');
  const completedIntent=await until(async()=>(await intentRows()).find(row=>row.intentId===first.row.intentId&&row.settledAt!==null),'first install handoff settled');
  await until(()=>evaluate(first.review,'!!document.querySelector("[data-market-action=open-installed]")'),'explicit open after install');
  await screenshot(first.review,'r5-installed-trusted-state.png');
  await close(first.review);
  let frame=await openTool('markdown-workbench');
  await inputText(frame,'#mdw-source','# R5 真实安装\n\n**已运行**');await click(frame,'button[data-mode="preview"]');
  await until(()=>evaluate(frame,'document.querySelector("#mdw-preview h1")?.textContent==="R5 真实安装"&&document.querySelector("#mdw-preview strong")?.textContent==="已运行"'),'real Markdown rendering');
  await screenshot(side(),'r5-markdown-real-use.png');
  await click(side(),'#sidebar-tool-back');await visible(side(),'#sidebar-tool-action-continue');
  assert.match(await evaluate(side(),'document.querySelector("#sidebar-tool-action-review").textContent'),/未保存|修改/);
  assert((await targets()).some(row=>row.targetId===frame.targetId),'draft stays mounted before explicit discard');
  await click(side(),'#sidebar-tool-action-continue');
  await until(()=>evaluate(side(),'!document.querySelector("#sidebar-tool-list-view").hidden'),'explicitly discard test draft and return');
  await until(async()=>(await targets()).every(row=>row.targetId!==frame.targetId),'discarded draft sandbox closed');
  await d.assertNoFrames();
  check('http-real-sender-fixed-review-first-install-close-website-then-confirm-and-real-markdown-use',
    {intentId:first.row.intentId,reviewId:first.row.reviewId,operationId:first.row.operationId,version:first.row.subject.version,
      operationState:operation.state,settledAt:completedIntent.settledAt});

  await mark('negative-external-messages');
  const registryBefore=await installed(),intentsBefore=(await intentRows()).length;
  for(const [name,url,selector,errorCode] of [
    ['unsupported-protocol',channel.origin+'/_r5/conformance.html?case=protocol','#send','E_PROTOCOL'],
    ['arbitrary-fields',channel.origin+'/_r5/conformance.html?case=fields','#send','E_INTENT_FIELDS'],
    ['generic-execution-denied',channel.origin+'/_r5/conformance.html?case=rpc','#send','E_INTENT_FIELDS'],
    ['same-id-different-candidate',channel.origin+'/_r5/conformance.html?case=conflict&intent='+first.row.intentId,'#send','E_INTENT_CONFLICT'],
    ['wrong-extension-id',channel.origin+'/_r5/conformance.html?case=wrong-id','#send'],
    ['wrong-port',wrongPort.origin+'/_r5/conformance.html','#send'],
    ['untrusted-host',channel.origin.replace('127.0.0.1','localhost')+'/_r5/conformance.html','#send'],
    ['iframe',channel.origin+'/_r5/frame.html','#frame','E_SENDER']]){
    const page=await openTab(url);await visible(page,selector);
    if(name==='iframe'){
      await until(()=>evaluate(page,'document.readyState==="complete"'),'parent real iframe listener loaded');
      await page.send('Page.bringToFront');
      const point=await until(()=>evaluate(page,'(()=>{const f=document.querySelector("#frame"),b=f?.contentDocument?.querySelector("#send");if(!b||b.disabled||!b.getClientRects().length)return false;const a=f.getBoundingClientRect(),r=b.getBoundingClientRect();return {x:a.x+r.x+r.width/2,y:a.y+r.y+r.height/2};})()'),'real iframe button position');
      for(const type of ['mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    }else await click(page,selector);
    const result=await until(async()=>{const text=await evaluate(page,'document.querySelector("#result").textContent');try{return JSON.parse(text);}catch{return false;}},'real browser rejection '+name);
    assert.equal(result.trusted,true);
    if(errorCode){assert.equal(result.error,undefined,name);assert.equal(result.response?.ok,false,name);assert.equal(result.response?.error?.code,errorCode,name);}
    else{assert.equal(result.response,undefined,name);assert.match(result.error,/NO_RECEIVER_API|Receiving end does not exist|Could not establish connection/,name);}
    evidence.r5.negative.push({name,url,result});await close(page);
  }
  assert.deepEqual(await installed(),registryBefore);assert.equal((await intentRows()).length,intentsBefore);
  check('actual-browser-origin-port-iframe-protocol-fields-id-and-conflict-rejections');

  await mark('already-installed-missing-version-and-different-review');
  const existing=await websiteReview('markdown-workbench',packages.get('markdown-workbench').version);
  await visible(existing.review,'[data-market-action="open-installed"]');assert.equal(await evaluate(existing.review,'!!document.querySelector("[data-market-action=confirm-install]")'),false);
  const missing=await websiteReview('quick-notes','1.1.1');
  await until(()=>evaluate(missing.review,'document.body.innerText.includes("当前扩展不包含此固定版本")'),'archived missing release');
  assert.notEqual(existing.review.targetId,missing.review.targetId);assert.notEqual(existing.row.reviewId,missing.row.reviewId);
  assert.equal(await evaluate(existing.review,'document.querySelector("h1").textContent'),immutableTitle);
  await close(missing.page);await close(missing.review);await close(existing.review);
  check('already-installed-is-read-from-extension-and-old-fixed-version-stays-missing');

  await mark('worker-stop-and-http-cold-reconnect');
  let oldContext,newContext;
  async function workerContext(){
    const info=await until(async()=>(await targets()).find(row=>row.type==='service_worker'&&row.url==='chrome-extension://'+id+'/sw.js'),'actual worker target');
    const {sessionId}=await d.sendBrowser('Target.attachToTarget',{targetId:info.targetId,flatten:true});let context;
    const off=d.onBrowserEvent(event=>{if(event.sessionId===sessionId&&event.method==='Runtime.executionContextCreated')context=event.params.context;});
    await d.sendBrowser('Runtime.enable',{},20000,sessionId);await until(()=>context?.uniqueId,'worker execution context');off();
    return {targetId:info.targetId,sessionId,uniqueId:context.uniqueId};
  }
  oldContext=await workerContext();
  assert.equal((await d.sendBrowser('Target.closeTarget',{targetId:oldContext.targetId})).success,true);
  await until(async()=>(await targets()).every(row=>row.targetId!==oldContext.targetId),'actual prior worker target ended');
  await click(existing.page,'#connect-button');
  await until(()=>evaluate(existing.page,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'HTTP wakes stopped worker');
  newContext=await workerContext();assert.notEqual(newContext.uniqueId,oldContext.uniqueId);
  await click(existing.page,'#open-review');await until(()=>evaluate(existing.page,'document.querySelector("#handoff-state").dataset.state==="success"'),'same intent after worker replacement');
  const resumed=(await intentRows()).find(row=>row.intentId===existing.row.intentId);
  assert.equal(resumed.reviewId,existing.row.reviewId);assert.equal(resumed.operationId,existing.row.operationId);
  evidence.r5.workerRestart={method:'Target.closeTarget of exact owned worker; observed absence and replacement execution context',oldContext,newContext};
  const resumedTarget=await until(async()=>(await targets()).find(row=>row.url===existing.reviewURL),'reopened exact review');
  await close(await attach(resumedTarget.targetId));await close(existing.page);
  check('real-worker-stop-observed-and-http-wakeup-preserves-identity');

  await mark('website-fixed-collection-batch-and-reload');
  const kit=await websiteSubjectReview({kind:'collection',collectionId:'reading-kit',revision:currentKit.revision},{details:true});
  await visible(kit.review,'[data-market-action="confirm-batch"]');
  const preflight=await evaluate(kit.review,'document.querySelector(".review").textContent');
  assert.match(preflight,/发布者：OpenDesk/);assert.match(preflight,/按网站授权读取正文或选区/);
  assert(!(await installed()).some(row=>row.id==='web-markdown-clipper'));
  await ui.narrow(kit.review,'r5-trusted-collection','[data-market-action="confirm-batch"]');
  await screenshot(kit.review,'r5-collection-review.png');await click(kit.review,'[data-market-action="confirm-batch"]');
  const completedBatch=await until(async()=>{const batch=await readStore(MARKET_BATCH_STORE,host());return batch?.batchId===kit.row.operationId&&!marketBatchUnresolved(batch)&&batch;},'real website fixed batch completed');
  assert.equal(completedBatch.collectionId,'reading-kit');assert.equal(completedBatch.revision,currentKit.revision);
  assert.deepEqual(completedBatch.items.map(row=>row.status),['skip','succeeded','skip']);
  const settledKit=await until(async()=>(await intentRows()).find(row=>row.intentId===kit.row.intentId&&row.settledAt!==null),'website collection handoff settled');
  const previousTime=await evaluate(kit.review,'performance.timeOrigin');await kit.review.send('Page.reload');
  await until(()=>evaluate(kit.review,'performance.timeOrigin!=='+previousTime+'&&document.body.innerText.includes("批量安装与恢复")'),'fixed collection reload reads its original batch');
  assert.deepEqual(await readStore(MARKET_BATCH_STORE,host()),completedBatch);
  await screenshot(kit.review,'r5-collection-results.png');await close(kit.review);await close(kit.page);
  check('website-fixed-revision-real-batch-skips-installed-preserves-operation-ids-and-reloads',
    {batchId:completedBatch.batchId,items:completedBatch.items,settledAt:settledKit.settledAt});

  await mark('native-old-package-note-save-baseline-recheck-and-website-upgrade');
  const notes=packages.get('quick-notes'),oldNotes={...notes,version:'0.0.1',capabilities:['storage.local']};
  await importPackage(oldNotes,'r5-controlled-old-notes',[{parts:['版本回退']}]);
  frame=await openTool('quick-notes');const note='R5 本机笔记：升级和 Chrome 重启后保留 '+randomUUID();
  await inputText(frame,'#note-text',note);await click(frame,'#save-note');
  await until(()=>evaluate(frame,'document.querySelector("#note-status").textContent.includes("已保存")&&!document.querySelector("#save-note").disabled'),'native note save');
  const noteData=await readStore(sidebarToolStorageKey('quick-notes'));assert(JSON.stringify(noteData).includes(note));await back();
  const upgrade=await websiteReview('quick-notes',notes.version);await visible(upgrade.review,'[data-market-action="confirm-install"]');
  assert.match(await evaluate(upgrade.review,'document.body.innerText'),/当前：v0\.0\.1/);
  // A second real native import changes the installed baseline while review remains open.
  await importPackage({...oldNotes,version:'0.0.2'},'r5-controlled-baseline-change');
  await click(upgrade.review,'[data-market-action="confirm-install"]');
  await visible(upgrade.review,'[data-market-action="review-again"]');
  assert.equal((await intentRows()).find(row=>row.intentId===upgrade.row.intentId).consumedAt,null);
  assert.equal((await installed()).find(row=>row.id==='quick-notes').version,'0.0.2');
  await click(upgrade.review,'[data-market-action="review-again"]');await visible(upgrade.review,'[data-market-action="confirm-install"]');
  assert.match(await evaluate(upgrade.review,'document.body.innerText'),/当前：v0\.0\.2/);
  await screenshot(upgrade.review,'r5-update-review.png');await click(upgrade.review,'[data-market-action="confirm-install"]');
  await until(async()=>(await installed()).find(row=>row.id==='quick-notes')?.version===notes.version,'official website update');
  await until(async()=>(await readStore(MARKET_OPERATIONS_STORE,host()))?.[upgrade.row.operationId]?.state==='succeeded','official update transaction completed');
  const settledUpgrade=await until(async()=>(await intentRows()).find(row=>row.intentId===upgrade.row.intentId&&row.settledAt!==null),'official update handoff settled');
  await visible(upgrade.review,'[data-market-action="open-installed"]');
  assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);await close(upgrade.page);await close(upgrade.review);
  frame=await openTool('quick-notes');await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(note)),'same note in updated actual tool');
  await screenshot(side(),'r5-notes-after-update.png');await back();
  evidence.r5.update={fixtureVersions:['0.0.1','0.0.2'],fixtureStatus:'controlled local test packages, not historical official releases',officialVersion:notes.version,
    noteDataSha256:hash(Buffer.from(JSON.stringify(noteData))),operationId:upgrade.row.operationId,operationState:'succeeded',settledAt:settledUpgrade.settledAt};
  check('baseline-change-requires-new-review-and-official-update-preserves-user-data');

  await mark('standard-demo-separate-site-authorization-and-real-page-use');
  const demoPage=await openTab(demo.origin+'/demo-form.html');await activate(demoPage);
  await until(()=>evaluate(side(),'document.querySelector("#script-current-page-url").textContent.includes('+JSON.stringify(demo.origin+'/demo-form.html')+')'),'current standard demo page');
  frame=await openTool('reading-toc');await click(side(),'#sidebar-tool-settings-open');await visible(side(),'#sidebar-tool-settings-allow');
  const dialogsBefore=evidence.dialogs.length;await click(side(),'#sidebar-tool-settings-allow');
  await until(async()=>(await readStore(READING_TOC_SITE_STORE))?.['reading-toc']?.includes(demo.origin),'real persisted demo website grant');
  await until(()=>evaluate(side(),'document.querySelector("#sidebar-tool-settings-allow").getAttribute("aria-pressed")==="true"'),'site approval visible');
  await click(side(),'#sidebar-tool-settings-open');frame=await d.iframeWith('reading-toc');
  await click(frame,'button[data-toc-mode="full"]');
  await until(()=>evaluate(frame,'document.querySelector("#toc-list").textContent.includes("简单表单")'),'real demo headings in sandbox');
  const beforeNavigation=await evaluate(demoPage,'({scrollY,top:document.querySelector("#form-title").getBoundingClientRect().top})');
  await click(frame,'#toc-list .toc-link[aria-label="简单表单"]');
  const pageUse=await until(()=>evaluate(demoPage,'(async()=>{const h=document.querySelector("#form-title");const y=scrollY;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const top=h.getBoundingClientRect().top;return y===scrollY&&scrollY>0&&top>=-2&&top<innerHeight/2?{scrollY,heading:h.textContent,top,overlay:!!document.querySelector("[data-opendesk-toc-root]")}:false;})()'),'actual target heading navigation settles in viewport');
  assert.notEqual(pageUse.scrollY,beforeNavigation.scrollY);assert(pageUse.overlay);assert.equal(evidence.dialogs.length,dialogsBefore);
  evidence.r5.demo.beforeNavigation=beforeNavigation;
  evidence.r5.demo.use=pageUse;await screenshot(side(),'r5-toc-demo-use.png');await screenshot(demoPage,'r5-demo-heading-navigation.png');await back();
  check('separate-site-authorization-and-standard-demo-heading-navigation');

  await mark('uninstall-and-normal-chrome-restart');
  await openTool('markdown-workbench');await click(side(),'#sidebar-tool-remove');await visible(side(),'#sidebar-tool-inline-remove-cancel');
  const beforeCancel=await installed();await click(side(),'#sidebar-tool-inline-remove-cancel');assert.deepEqual(await installed(),beforeCancel);await back();
  await uninstall('markdown-workbench');assert.equal(await readStore(sidebarToolStorageKey('markdown-workbench')),undefined);
  const registryBeforeRestart=await installed();await d.restartChrome();
  assert.deepEqual(await installed(),registryBeforeRestart);assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);
  assert(!((await installed()).some(row=>row.id==='markdown-workbench')));
  frame=await openTool('quick-notes');await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(note)),'persisted note after actual Chrome exit/relaunch');await back();
  assert((await readStore(READING_TOC_SITE_STORE))?.['reading-toc']?.includes(demo.origin));
  check('inline-uninstall-cancel-confirm-and-normal-chrome-restart-with-persisted-updated-data');
  assert.deepEqual(evidence.dialogErrors,[]);assert.equal(evidence.dialogs.length,0,'normal R5 flow has no application dialog');
  assert.equal(evidence.protectedStorageWritesFromDriver,0);
  // The driver grants final PASS only after unchanged package identity and a
  // normal final Chrome exit; a failed teardown must not leave a green receipt.
  evidence.publicMarket='LOCAL_HTTP_ONLY';await d.save();
}
