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
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE,marketBatchUnresolved} from '../../src/marketplace/batch.js';
import {OFFICIAL_COLLECTIONS} from '../../src/marketplace/catalog.js';
import {sidebarToolStorageKey,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {READING_TOC_SITE_STORE,tocSiteAllowed} from '../../src/reading-toc/policy.js';
import {observeMarketSender,armMarketCut,assertObservedMarketConnection,assertMarketRecoveryObserverStable} from './app-market-r5-observers.mjs';
import {marketUIAudit} from './app-market-r5-ui.mjs';
import {runMarketNaturalLifecycle,runMarketRealExpiry} from './app-market-r5-natural.mjs';
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
  const naturalOnly=process.env.OPENDESK_NATIVE_MARKET_R5_NATURAL_ONLY==='1';
  const expiryOnly=process.env.OPENDESK_NATIVE_MARKET_R5_EXPIRY_ONLY==='1';
  const idleOnly=process.env.OPENDESK_NATIVE_MARKET_R5_IDLE_ONLY==='1';
  const reuseHTTP=process.env.OPENDESK_NATIVE_MARKET_REUSE_HTTP==='1';
  assert(!idleOnly||naturalOnly,'idle-only is a separately scoped natural acceptance run');
  assert(!expiryOnly||!naturalOnly,'expiry-only and natural-only are separate acceptance scopes');
  assert(!expiryOnly||process.env.OPENDESK_NATIVE_MARKET_R5_LONG==='1','a real TTL run requires its long timeout');
  assert(!naturalOnly||idleOnly||process.env.OPENDESK_NATIVE_MARKET_R5_LONG==='1','a real TTL run requires its long timeout');
  assert(!reuseHTTP||naturalOnly||expiryOnly,'only scoped lifecycle acceptance may reuse its owner website');
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
    result:'IN_PROGRESS',scope:expiryOnly?'REAL_TTL_ONLY':naturalOnly?(idleOnly?'NATURAL_IDLE_ONLY':'NATURAL_IDLE_AND_REAL_TTL'):'FULL_MARKET_R5',formalHttps:'BLOCKED_NO_REVIEWED_PRODUCTION_CHANNEL',macChrome:process.platform==='darwin'?'IN_PROGRESS':'NOT_TESTED',
    notTested:['formal-https-and-web-store-channel','configured-production-manifest-real-chrome','user-local-mac-profile',
      'native-five-second-connection-timeout',
      'native-tabs-create-acknowledgement-loss','native-storage-set-acknowledgement-loss',
      'native-capacity-and-artifact-corruption-faults','real-30-minute-intent-expiry','natural-idle-worker-shutdown']};
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
  if(reuseHTTP){
    const received=Buffer.from(await(await fetch(channel.origin+'/site-build.json')).arrayBuffer());
    assert.equal(hash(received),hash(siteBytes),'reused owner website must serve the exact candidate manifest');
    for(const file of site.files){
      const response=await fetch(channel.origin+'/'+file.path);assert.equal(response.status,200,file.path);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())),file.sha256,file.path);
    }
    evidence.r5.reusedWebsite={origin:channel.origin,siteBuildId:site.buildId,manifestSha256:hash(received),filesVerified:site.files.length};
  }
  const http=reuseHTTP?{origin:channel.origin}:await serverAt(Number(new URL(channel.origin).port),publicHandler);
  if(!reuseHTTP)d.t.after(http.close);
  const wrongPort=await serverAt(0,publicHandler);d.t.after(wrongPort.close);
  const demoBytes=await readFile('examples/tasks/demo-form.html');
  const demoPort=process.env.OPENDESK_NATIVE_MARKET_DEMO_PORT??'43111';
  assert(/^\d{1,5}$/.test(demoPort)&&Number(demoPort)<=65535,'isolated demo port must be 0..65535');
  const demo=await serverAt(Number(demoPort),async(req,res)=>{if(new URL(req.url,'http://127.0.0.1').pathname!=='/demo-form.html'){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':mime['.html']});res.end(demoBytes);});d.t.after(demo.close);
  evidence.r5.demo={url:demo.origin+'/demo-form.html',source:'examples/tasks/demo-form.html',sha256:hash(demoBytes)};
  const intentRows=async()=>((await readStore(MARKET_INTENTS_STORE,host()))?.intents||[]);
  const storedCutState=async()=>({intents:await intentRows(),operations:(await readStore(MARKET_OPERATIONS_STORE,host()))||{},
    registry:await installed(),provenance:(await readStore(MARKET_PROVENANCE_STORE,host()))||{},
    batch:(await readStore(MARKET_BATCH_STORE,host()))||null});
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
  async function interruptedHandoff(page){
    const initialState=await storedCutState();
    const beforeTargets=(await targets()).map(row=>({targetId:row.targetId,url:row.url}));
    const wakeAfterContextDestroyed=async()=>{
      const url=await evaluate(page,'location.href');
      // client.js is an ES module. Observe the real trusted click and its DOM
      // transition instead of inventing access to module-local probeGeneration.
      const watch=await page.send('Runtime.evaluate',{expression:`(()=>{
        const button=document.querySelector('#connect-button'),state=document.querySelector('#connection-state');
        let finish;const promise=new Promise(resolve=>{
          const events=[];let settled=false,trustedClick=false,pending=false;
          const observer=new MutationObserver(()=>snapshot('mutation'));
          const timer=setTimeout(()=>finish({status:'TIMEOUT'}),12000);
          finish=result=>{if(settled)return;settled=true;clearTimeout(timer);observer.disconnect();
            button?.removeEventListener('click',onClick,true);resolve({...result,url:location.href,events});};
          function snapshot(kind){
            const row={kind,at:Date.now(),disabled:button.disabled,text:state.textContent};events.push(row);
            if(!trustedClick)return;
            if(row.disabled&&row.text==='正在连接 OpenDesk…')pending=true;
            if(pending&&!row.disabled)finish({status:row.text.startsWith('已连接 OpenDesk')?'CONNECTED':'FAILED',response:row});
          }
          function onClick(event){
            events.push({kind:'click',at:Date.now(),isTrusted:event.isTrusted});
            if(!event.isTrusted||trustedClick)return finish({status:'INVALID_CLICK'});
            trustedClick=true;snapshot('before-handler');
          }
          if(!button||!state||button.disabled)return finish({status:'NOT_READY'});
          button.addEventListener('click',onClick,true);
          observer.observe(button,{attributes:true,attributeFilter:['disabled']});
          observer.observe(state,{childList:true,subtree:true,characterData:true});
        });
        Object.defineProperty(promise,'cancel',{value:()=>finish({status:'CANCELLED'})});return promise;
      })()`,returnByValue:false,awaitPromise:false});
      assert.equal(watch.exceptionDetails,undefined);assert.equal(watch.result?.subtype,'promise');
      const objectId=watch.result.objectId;
      try{
        await click(page,'#connect-button');
        const observed=await page.send('Runtime.awaitPromise',{promiseObjectId:objectId,returnByValue:true},15000);
        assert.equal(observed.exceptionDetails,undefined);const result=observed.result?.value;
        try{assertObservedMarketConnection(result,url);}catch(error){
          error.marketConnectionObservation={expectedURL:url,result,rawResponse:observed};throw error;
        }
        return {selector:'#connect-button',...result};
      }finally{
        await page.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){this.cancel();}',returnByValue:true}).catch(()=>{});
        await page.send('Runtime.releaseObject',{objectId}).catch(()=>{});
      }
    };
    const a1=await armMarketCut(d,'A1',{wakeAfterContextDestroyed});
    await click(page,'#open-review');const hit1=await a1.wait();
    assert.equal(hit1.value.intent.phase,'prepared');assert.equal(hit1.value.intent.tabId,null);
    assert(!(await targets()).some(row=>row.url===hit1.value.reviewURL));
    await a1.terminate();const after1=await storedCutState(),row1=after1.intents.find(row=>row.intentId===hit1.value.intent.intentId);
    assert.deepEqual(row1,hit1.value.intent);assert.equal(row1.consumedAt,null);
    assert.deepEqual(after1.operations,initialState.operations);assert.deepEqual(after1.registry,initialState.registry);
    Object.assign(a1.record,{beforeTargets,afterTermination:after1});
    await until(()=>evaluate(page,'document.querySelector("#handoff-state").dataset.state==="error"'),'interrupted handoff returns unknown/transport error');
    if(!a1.record.termination.webProbeWake?.initiated)await click(page,'#connect-button');
    await until(()=>evaluate(page,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'HTTP probe wakes worker after prepared interruption');
    if(a1.record.termination.webProbeWake)Object.assign(a1.record.termination.webProbeWake,
      {connectedObservedAt:Date.now(),responseText:await evaluate(page,'document.querySelector("#connection-state").textContent')});
    const a2=await armMarketCut(d,'A2',{wakeAfterContextDestroyed});
    assert.notEqual(a2.record.executionContext.uniqueId,a1.record.executionContext.uniqueId,'real replacement worker context');
    await click(page,'#open-review');const hit2=await a2.wait();
    assert.equal(hit2.value.intent.intentId,row1.intentId);assert.equal(hit2.value.intent.operationId,row1.operationId);
    assert.equal(hit2.value.intent.phase,'prepared');assert.equal(hit2.value.intent.tabId,null);
    assert(Number.isSafeInteger(hit2.value.tab.id));
    const created=await until(async()=>{const rows=(await targets()).filter(row=>row.url===hit2.value.reviewURL);return rows.length===1&&rows;},'created review target commits its fixed URL while worker remains held');
    assert.equal(created.length,1);assert(!beforeTargets.some(row=>row.targetId===created[0].targetId),'real newly created review');
    await a2.terminate();const after2=await storedCutState();
    assert.equal(after2.intents.find(row=>row.intentId===row1.intentId).phase,'prepared');
    assert.deepEqual(after2.operations,initialState.operations);assert.deepEqual(after2.registry,initialState.registry);
    Object.assign(a2.record,{afterTermination:after2,createdReview:created[0]});
    await until(()=>evaluate(page,'document.querySelector("#handoff-state").dataset.state==="error"'),'created-before-persist interruption becomes unknown');
    if(!a2.record.termination.webProbeWake?.initiated)await click(page,'#connect-button');
    await until(()=>evaluate(page,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'HTTP probe wakes worker after create interruption');
    if(a2.record.termination.webProbeWake)Object.assign(a2.record.termination.webProbeWake,
      {connectedObservedAt:Date.now(),responseText:await evaluate(page,'document.querySelector("#connection-state").textContent')});
    await click(page,'#open-review');
    await until(()=>evaluate(page,'document.querySelector("#handoff-state").dataset.state==="success"'),'same HTTP intent recovers existing review');
    const recovered=(await intentRows()).find(row=>row.intentId===row1.intentId),actual=(await targets()).filter(row=>row.url===hit2.value.reviewURL);
    assert.equal(actual.length,1);assert.equal(actual[0].targetId,created[0].targetId);
    assert.equal(recovered.reviewId,row1.reviewId);assert.equal(recovered.operationId,row1.operationId);assert.equal(recovered.phase,'opened');
    assert.equal(recovered.tabId,hit2.value.tab.id);assert.deepEqual(await installed(),initialState.registry);
    for(const cut of [a1,a2])Object.assign(cut.record,{status:'PASS',recovered});
    check('native-worker-prepared-before-create-and-created-before-persist-recovery',{intentId:row1.intentId,reviewId:row1.reviewId,operationId:row1.operationId});
  }
  async function websiteSubjectReview(subject,{existingPage=null,details=false,keyboard=false,audit=false,handoffCuts=false}={}){
    await newIntentBudget();
    const route=subject.kind==='app'?subject.marketId+'/versions/'+subject.version+'/':
      'collections/'+subject.collectionId+'/revisions/'+subject.revision+'/';
    const url=channel.origin+(details?(subject.kind==='app'?'/apps/':'/'):'/install/')+route;
    const page=existingPage||await openTab(url);await visible(page,'#open-review');
    await until(()=>evaluate(page,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'real page script and external probe ready');
    if(audit)await ui.detail(page,'r5-web-detail','#open-review');
    if(handoffCuts)await interruptedHandoff(page);
    else if(keyboard)await ui.enter(page,'#open-review','r5-first-website-handoff');
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
  if(expiryOnly){
    await runMarketRealExpiry({d,websiteReview,check,mark});
    assert.deepEqual(evidence.dialogErrors,[]);assert.equal(evidence.dialogs.length,0);
    assert.equal(evidence.protectedStorageWritesFromDriver,0);
    evidence.publicMarket='LOCAL_HTTP_ONLY';await d.save();return;
  }
  if(naturalOnly){
    await mark('natural-scope-normal-browser-restart-before-quiescence');
    await d.restartChrome();
    evidence.r5.naturalEnvironment='steady state after a normal browser restart; first-install idle remains separately unobserved';
    await runMarketNaturalLifecycle({d,websiteReview,check,mark,idleOnly});
    assert.deepEqual(evidence.dialogErrors,[]);assert.equal(evidence.dialogs.length,0);
    assert.equal(evidence.protectedStorageWritesFromDriver,0);
    evidence.publicMarket='LOCAL_HTTP_ONLY';await d.save();return;
  }
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
  assert.deepEqual(await evaluate(website,'[...document.querySelectorAll(".app-card h2 a")].map(row=>row.getAttribute("href")).sort()'),
    evidence.releases.map(row=>'/apps/'+row.id+'/').sort(),'website lists every actual current official release exactly once');
  await inputText(website,'#app-search','Markdown');
  const visibleAppLinks=()=>evaluate(website,'[...document.querySelectorAll(".app-card")].filter(row=>!row.hidden).map(row=>row.querySelector("h2 a").getAttribute("href")).sort()');
  assert.deepEqual(await visibleAppLinks(),['/apps/opendesk/markdown-workbench/','/apps/opendesk/web-markdown-clipper/']);
  await inputText(website,'#app-search','Markdown 工作台');
  assert.deepEqual(await visibleAppLinks(),['/apps/opendesk/markdown-workbench/']);
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
    // Position only the visual inspection viewport; no product state changes.
    await evaluate(website,'scrollTo({top:0,left:0,behavior:"instant"})');
    await until(()=>evaluate(website,'scrollY===0'),'home screenshot begins at actual page top');
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
  await until(()=>evaluate(first.review,'location.href==='+JSON.stringify(first.reviewURL+'#/apps/opendesk/time-review/versions/1.3.0')+'&&document.querySelector("h1")?.textContent==='+JSON.stringify(immutableTitle)),'actual hash navigation cannot replace reviewed candidate');
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
  await click(first.review,'[data-market-action="open-installed"]');
  const trustedOpen=await until(async()=>(await targets()).find(row=>row.type==='page'&&row.url.startsWith('chrome-extension://'+id+'/ui/tool.html?')&&
    new URL(row.url).searchParams.get('toolId')==='markdown-workbench'),'trusted installed action opens actual fixed tool');
  await d.iframeWith('markdown-workbench');
  const openedToolPage=await attach(trustedOpen.targetId);
  const actualToolURL=await evaluate(openedToolPage,'location.href');assert(new URL(actualToolURL).searchParams.get('hostInstanceId'));
  const hostResources=await until(()=>evaluate(openedToolPage,'(()=>{const value=globalThis.OpenDeskResourceDiagnostics?.snapshot();return value?.owners?.client?.ports===1&&value;})()'),'trusted opened tool uses actual connected Foundation host');
  await close(openedToolPage);
  await until(async()=>(await targets()).every(row=>row.type!=='iframe'||!row.url.includes('/sidebar-tools/sandbox.html')),'trusted opened tool closes its real sandbox');
  check('trusted-install-result-open-action-reaches-current-installed-tool',{targetId:trustedOpen.targetId,url:actualToolURL,resources:hostResources});
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

  await mark('real-website-connection-timeout-and-explicit-reconnect');
  const beforeTimeout=await storedCutState(),timeoutObserver=await observeMarketSender(d,{holdProbe:true});
  let timeoutPage,timeoutState;
  try{
    timeoutPage=await openTab(channel.origin+'/how-to-install/');
    await until(()=>Number.isSafeInteger(timeoutObserver.record.heldAt),'actual unchanged PROBE paused at source-bound validator');
    const heldSender=timeoutObserver.record.observations[timeoutObserver.record.heldObservation].value.sender;
    assert.equal(heldSender.url.value,channel.origin+'/how-to-install/');assert.equal(heldSender.origin.value,channel.origin);
    assert.equal(heldSender.frameId.value,0);assert.equal(heldSender.documentLifecycle.value,'active');
    timeoutState=await until(()=>evaluate(timeoutPage,'(()=>{const state=document.querySelector("#connection-state"),button=document.querySelector("#connect-button");return state?.textContent.includes("等待响应超时")&&!button.disabled&&({text:state.textContent,buttonDisabled:button.disabled,url:location.href,at:Date.now()});})()'),'real website five-second connection timeout');
    assert.match(timeoutState.text,/无法连接 OpenDesk/);assert.doesNotMatch(timeoutState.text,/未安装|没有安装/);
    timeoutObserver.record.timeoutUI=timeoutState;
    timeoutObserver.record.timeoutControlFocus=await ui.reach(timeoutPage,'#connect-button','r5-timeout-reconnect-focus');
    await ui.layout(timeoutPage,'r5-real-connection-timeout','#connect-button');
  }finally{await timeoutObserver.dispose();}
  assert.equal(timeoutObserver.record.status,'OBSERVED');assert.deepEqual(timeoutObserver.record.errors,[]);
  await click(timeoutPage,'#connect-button');
  await until(()=>evaluate(timeoutPage,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'explicit real reconnect after delayed PROBE');
  const afterTimeout=await storedCutState();
  assert.deepEqual(afterTimeout.registry,beforeTimeout.registry);assert.deepEqual(afterTimeout.operations,beforeTimeout.operations);
  assert.deepEqual(afterTimeout.intents,beforeTimeout.intents);assert.deepEqual(afterTimeout.provenance,beforeTimeout.provenance);
  await close(timeoutPage);check('real-website-five-second-timeout-does-not-claim-uninstalled-and-explicit-reconnect',
    {heldAt:timeoutObserver.record.heldAt,resumedAt:timeoutObserver.record.resumedAt,timeout:timeoutState});
  evidence.r5.notTested=evidence.r5.notTested.filter(name=>name!=='native-five-second-connection-timeout');

  await mark('real-handoff-and-first-journal-interruption-recovery');
  const cutInitial=await installed();
  const abandoned=await websiteReview('knowledge-inbox',packages.get('knowledge-inbox').version,{details:true,handoffCuts:true});
  await visible(abandoned.review,'[data-market-action="confirm-install"]');
  const beforeConsume=await storedCutState(),consumeCut=await armMarketCut(d,'B',{targetId:abandoned.review.targetId});
  const consumeGesture=click(abandoned.review,'[data-market-action="confirm-install"]').then(()=>({status:'ACKNOWLEDGED'}),error=>({status:'TARGET_CLOSED',message:error.message}));
  const consumeHit=await consumeCut.wait();
  assert.equal(consumeHit.value.operationId,abandoned.row.operationId);assert.equal(consumeHit.value.toolId,'knowledge-inbox');
  await consumeCut.terminate();consumeCut.record.gesture=await consumeGesture;
  const afterConsume=await storedCutState(),consumed=afterConsume.intents.find(row=>row.intentId===abandoned.row.intentId);
  assert(Number.isSafeInteger(consumed.consumedAt));assert.equal(consumed.settledAt,null);
  assert.equal(afterConsume.operations[abandoned.row.operationId],undefined);
  assert.deepEqual(afterConsume.operations,beforeConsume.operations);assert.deepEqual(afterConsume.registry,cutInitial);
  Object.assign(consumeCut.record,{afterTermination:afterConsume});
  const unjournaled=await websiteReview('knowledge-inbox',packages.get('knowledge-inbox').version,{existingPage:abandoned.page,details:true});
  assert.equal(unjournaled.row.reviewId,abandoned.row.reviewId);assert.equal(unjournaled.row.operationId,abandoned.row.operationId);
  await visible(unjournaled.review,'[data-market-action="close-unjournaled"]');
  assert.equal(await evaluate(unjournaled.review,'!!document.querySelector("[data-market-action=confirm-install]")'),false);
  await screenshot(unjournaled.review,'r5-consumed-without-journal.png');
  await click(unjournaled.review,'[data-market-action="close-unjournaled"]');
  const closedUnknown=await until(async()=>(await intentRows()).find(row=>row.intentId===consumed.intentId&&row.settledAt!==null),'explicit unknown-without-journal closure');
  assert.equal(closedUnknown.closureReason,'unknown-without-journal');assert.equal(closedUnknown.consumedAt,consumed.consumedAt);
  assert.equal((await readStore(MARKET_OPERATIONS_STORE,host()))?.[abandoned.row.operationId],undefined);
  assert.deepEqual(await installed(),cutInitial);
  await close(unjournaled.review);await close(unjournaled.page);
  Object.assign(consumeCut.record,{status:'PASS',recovered:closedUnknown});
  check('native-consumed-before-first-journal-interruption-never-replays-and-explicitly-closes-unknown',
    {intentId:closedUnknown.intentId,operationId:closedUnknown.operationId,closureReason:closedUnknown.closureReason});
  const freshAfterUnknown=await websiteReview('knowledge-inbox',packages.get('knowledge-inbox').version);
  assert.notEqual(freshAfterUnknown.row.intentId,closedUnknown.intentId);
  assert.notEqual(freshAfterUnknown.row.operationId,closedUnknown.operationId);
  assert.equal(freshAfterUnknown.row.consumedAt,null);
  await visible(freshAfterUnknown.review,'[data-market-action="confirm-install"]');
  await click(freshAfterUnknown.review,'[data-market-action="cancel-install"]');
  await close(freshAfterUnknown.review);await close(freshAfterUnknown.page);
  assert.deepEqual(await installed(),cutInitial,'a new review after explicit closure still cannot install automatically');

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
  // ServiceWorker target IDs are debugger identities, not a guarantee that
  // the V8 execution has stopped. Chrome can retain the same target across
  // a real version stop/restart. Prove the *actual* stopped version and old
  // context loss before asking the unmodified HTTP page to connect again.
  const swURL='chrome-extension://'+id+'/sw.js',controller=host();
  let oldContext,newContext,versionSequence=0,eventSequence=0;
  const versions=[],contextEvents=[],targetSnapshots=[];
  const offStop=d.onBrowserEvent(event=>{
    if(event.sessionId===controller.sessionId&&event.method==='ServiceWorker.workerVersionUpdated')
      versions.push({sequence:++versionSequence,receivedAt:Date.now(),versions:event.params.versions});
    if(oldContext&&event.sessionId===oldContext.sessionId&&
       ['Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Inspector.detached'].includes(event.method))
      contextEvents.push({sequence:++eventSequence,at:Date.now(),method:event.method,params:event.params});
  });
  async function workerContext(){
    const info=await until(async()=>(await targets()).find(row=>row.type==='service_worker'&&row.url===swURL),'actual worker target');
    const {sessionId}=await d.sendBrowser('Target.attachToTarget',{targetId:info.targetId,flatten:true});let context;
    const off=d.onBrowserEvent(event=>{if(event.sessionId===sessionId&&event.method==='Runtime.executionContextCreated')context=event.params.context;});
    try{
      await d.sendBrowser('Runtime.enable',{},20000,sessionId);
      await until(()=>context?.uniqueId,'worker execution context');
    }finally{off();}
    return {targetId:info.targetId,sessionId,contextId:context.id,uniqueId:context.uniqueId};
  }
  try{
    oldContext=await workerContext();
    const originalProbe={expression:'void 0',uniqueContextId:oldContext.uniqueId,
      throwOnSideEffect:true,returnByValue:true};
    const before=await d.sendBrowser('Runtime.evaluate',originalProbe,10000,oldContext.sessionId);
    assert.equal(before.exceptionDetails,undefined);
    assert.equal(before.result?.type,'undefined','original worker context must exist before stop');
    await controller.send('ServiceWorker.enable');
    const running=await until(()=>versions.flatMap(event=>event.versions.filter(row=>
      row.scriptURL===swURL&&row.targetId===oldContext.targetId&&row.runningStatus==='running')
      .map(version=>({event,version}))).at(-1),'actual running worker version');
    const afterSequence=versionSequence;
    const stopResponse=await controller.send('ServiceWorker.stopWorker',{versionId:running.version.versionId});
    const stopped=await until(()=>versions.flatMap(event=>event.sequence>afterSequence
      ?event.versions.filter(row=>row.versionId===running.version.versionId&&
        row.registrationId===running.version.registrationId&&row.scriptURL===swURL&&row.runningStatus==='stopped')
        .map(version=>({event,version})):[]).at(-1),'actual post-request stopped worker version');
    const stopProof=await until(async()=>{
      const snapshot=await targets();targetSnapshots.push({at:Date.now(),targets:snapshot.filter(row=>row.url===swURL)});
      if(snapshot.every(row=>row.targetId!==oldContext.targetId))
        return {type:'physical-target-absent'};
      const destroyed=contextEvents.some(event=>
        event.method==='Runtime.executionContextsCleared'||
        event.method==='Runtime.executionContextDestroyed'&&event.params.executionContextId===oldContext.contextId);
      if(!destroyed)return false;
      let rejection;
      try{await d.sendBrowser('Runtime.evaluate',originalProbe,5000,oldContext.sessionId);}
      catch(error){rejection=error.cdpError;}
      if(rejection?.code===-32602&&rejection.message==='uniqueContextId not found')
        return {type:'same-target-old-unique-context-destroyed',rejection};
      return false;
    },'real stopped worker target or destroyed original unique execution context');
    // A new Worker may start only after the website's real PROBE: never use
    // a synthetic runtime message or release an earlier paused test gesture.
    const restartedBeforeProbe=versions.slice().flatMap(event=>event.sequence>stopped.event.sequence
      ?event.versions.filter(row=>row.scriptURL===swURL&&row.runningStatus==='running'):[]);
    assert.equal(restartedBeforeProbe.length,0,'worker must remain stopped until real HTTP PROBE');
    await click(existing.page,'#connect-button');
    await until(()=>evaluate(existing.page,'document.querySelector("#connection-state").textContent.includes("已连接 OpenDesk")'),'HTTP wakes stopped worker');
    newContext=await workerContext();
    assert.notEqual(newContext.uniqueId,oldContext.uniqueId,'new worker uses a new V8 execution context');
    await click(existing.page,'#open-review');
    await until(()=>evaluate(existing.page,'document.querySelector("#handoff-state").dataset.state==="success"'),'same intent after worker replacement');
    const resumed=(await intentRows()).find(row=>row.intentId===existing.row.intentId);
    assert.equal(resumed.reviewId,existing.row.reviewId);assert.equal(resumed.operationId,existing.row.operationId);
    evidence.r5.workerRestart={method:'ServiceWorker.stopWorker, then real HTTP PROBE',
      versionId:running.version.versionId,registrationId:running.version.registrationId,
      stoppedEvent:stopped.event,stopResponse,stopProof,oldContext,newContext,
      contextEvents,targetSnapshots};
    const resumedTarget=await until(async()=>(await targets()).find(row=>row.url===existing.reviewURL),'reopened exact review');
    await close(await attach(resumedTarget.targetId));await close(existing.page);
    check('real-worker-stop-observed-and-http-wakeup-preserves-identity');
  }finally{offStop();}

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
  await screenshot(upgrade.review,'r5-update-review.png');
  const beforeRegistry=await storedCutState(),registryCut=await armMarketCut(d,'C',{targetId:upgrade.review.targetId});
  const registryGesture=click(upgrade.review,'[data-market-action="confirm-install"]').then(()=>({status:'ACKNOWLEDGED'}),error=>({status:'TARGET_CLOSED',message:error.message}));
  const registryHit=await registryCut.wait();
  assert.equal(registryHit.value.key,SIDEBAR_TOOL_STORE);assert.equal(registryHit.value.scope,'工具安装记录');assert.equal(registryHit.value.failure,null);
  assert.equal(registryHit.value.next.find(row=>row.id==='quick-notes').version,notes.version);
  assert.equal(registryHit.value.previous.find(row=>row.id==='quick-notes').version,'0.0.2');
  await registryCut.terminate();registryCut.record.gesture=await registryGesture;
  const afterRegistry=await storedCutState(),committing=afterRegistry.operations[upgrade.row.operationId];
  assert.equal(committing.state,'committing');assert.equal(committing.toolId,'quick-notes');
  assert.equal(committing.version,notes.version);assert.deepEqual(afterRegistry.registry,registryHit.value.next);
  assert.deepEqual(afterRegistry.provenance,beforeRegistry.provenance);assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);
  Object.assign(registryCut.record,{afterTermination:afterRegistry});
  const resumedUpdate=await websiteReview('quick-notes',notes.version,{existingPage:upgrade.page});
  assert.equal(resumedUpdate.row.operationId,upgrade.row.operationId);assert.equal(resumedUpdate.row.reviewId,upgrade.row.reviewId);
  await visible(resumedUpdate.review,'.review > button');
  assert.equal(await evaluate(resumedUpdate.review,'document.querySelector(".review > button").textContent'),'恢复核对安装结果');
  assert.equal(await evaluate(resumedUpdate.review,'!!document.querySelector("[data-market-action=confirm-install]")'),false);
  await screenshot(resumedUpdate.review,'r5-registry-committed-review-recovery.png');
  const recoveryWrites=await armMarketCut(d,'C',{targetId:resumedUpdate.review.targetId,observeRegistryWrites:true});
  await click(resumedUpdate.review,'.review > button');
  await until(async()=>(await readStore(MARKET_OPERATIONS_STORE,host()))?.[upgrade.row.operationId]?.state==='succeeded','original official update transaction recovered');
  assert.deepEqual(await installed(),afterRegistry.registry,'recovery preserves the actual already-committed candidate');
  const settledUpgrade=await until(async()=>(await intentRows()).find(row=>row.intentId===upgrade.row.intentId&&row.settledAt!==null),'official update handoff settled');
  await visible(resumedUpdate.review,'[data-market-action="open-installed"]');
  // Prove the original review's browser context is still live after the
  // installer recovered. Observer attachment itself can emit an initial
  // executionContextCreated event; only later invalidations are failures.
  const proofRequest={expression:'void 0',uniqueContextId:recoveryWrites.record.executionContext.uniqueId,
    throwOnSideEffect:true,returnByValue:true};
  const proofResponse=await d.sendBrowser('Runtime.evaluate',proofRequest,10000,recoveryWrites.record.sessionId);
  assert.equal(proofResponse.exceptionDetails,undefined);
  assert.equal(proofResponse.result?.type,'undefined');
  recoveryWrites.record.liveContextAfterRecovery={request:proofRequest,response:proofResponse,at:Date.now()};
  assertMarketRecoveryObserverStable(recoveryWrites.record);
  await recoveryWrites.dispose();
  assert.deepEqual(recoveryWrites.record.errors,[]);
  assert.deepEqual(recoveryWrites.record.observations,[],'explicit recovery never resubmits the installed registry');
  recoveryWrites.record.status='PASS_ZERO_REGISTRY_SUBMISSIONS';
  assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);await close(resumedUpdate.page);await close(resumedUpdate.review);
  Object.assign(registryCut.record,{status:'PASS',recoveredOperation:(await readStore(MARKET_OPERATIONS_STORE,host()))[upgrade.row.operationId],recoveredIntent:settledUpgrade});
  check('native-registry-committed-page-interruption-recovers-original-operation-and-user-data',
    {operationId:upgrade.row.operationId,version:notes.version,storageAcknowledgementLoss:'NOT_TESTED; interrupted only after successful native set'});
  frame=await openTool('quick-notes');await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(note)),'same note in updated actual tool');
  await screenshot(side(),'r5-notes-after-update.png');await back();
  evidence.r5.update={fixtureVersions:['0.0.1','0.0.2'],fixtureStatus:'controlled local test packages, not historical official releases',officialVersion:notes.version,
    noteDataSha256:hash(Buffer.from(JSON.stringify(noteData))),operationId:upgrade.row.operationId,operationState:'succeeded',settledAt:settledUpgrade.settledAt};
  check('baseline-change-requires-new-review-and-official-update-preserves-user-data');

  await mark('standard-demo-default-toc-site-stop-restore-and-real-page-use');
  const demoPage=await openTab(demo.origin+'/demo-form.html');await activate(demoPage);
  await until(()=>evaluate(side(),'document.querySelector("#script-current-page-url").textContent.includes('+JSON.stringify(demo.origin+'/demo-form.html')+')'),'current standard demo page');
  await until(()=>evaluate(demoPage,'!!document.querySelector("[data-opendesk-toc-root]")'),'default HTTP demo TOC without a positive grant');
  assert(tocSiteAllowed(await readStore(READING_TOC_SITE_STORE),'reading-toc',demo.origin));
  frame=await openTool('reading-toc');await click(side(),'#sidebar-tool-settings-open');await visible(side(),'#sidebar-tool-settings-allow');
  const dialogsBefore=evidence.dialogs.length;
  await until(()=>evaluate(side(),'document.querySelector("#sidebar-tool-settings-allow").getAttribute("aria-pressed")==="true"'),'site approval visible');
  await click(side(),'#sidebar-tool-settings-deny');
  await until(async()=>!tocSiteAllowed(await readStore(READING_TOC_SITE_STORE),'reading-toc',demo.origin),'real persisted demo website stop');
  await until(()=>evaluate(demoPage,'!document.querySelector("[data-opendesk-toc-root]")'),'stopped website removes its TOC');
  await screenshot(side(),'r5-toc-demo-site-stopped.png');
  await click(side(),'#sidebar-tool-settings-allow');
  await until(async()=>tocSiteAllowed(await readStore(READING_TOC_SITE_STORE),'reading-toc',demo.origin),'real persisted demo website restore');
  await until(()=>evaluate(demoPage,'!!document.querySelector("[data-opendesk-toc-root]")'),'restored website TOC');
  await until(()=>evaluate(side(),'document.querySelector("#sidebar-tool-settings-allow").getAttribute("aria-pressed")==="true"'),'restored website visible');
  await click(side(),'#sidebar-tool-settings-open');frame=await d.iframeWith('reading-toc');
  await click(frame,'button[data-toc-mode="full"]');
  await until(()=>evaluate(frame,'document.querySelector("#toc-list").textContent.includes("简单表单")'),'real demo headings in sandbox');
  const beforeNavigation=await evaluate(demoPage,'({scrollY,top:document.querySelector("#form-title").getBoundingClientRect().top})');
  await click(frame,'#toc-list .toc-link[aria-label="简单表单"]');
  const pageUse=await until(()=>evaluate(demoPage,'(async()=>{const h=document.querySelector("#form-title");const y=scrollY;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const top=h.getBoundingClientRect().top;return y===scrollY&&scrollY>0&&top>=-2&&top<innerHeight/2?{scrollY,heading:h.textContent,top,overlay:!!document.querySelector("[data-opendesk-toc-root]")}:false;})()'),'actual target heading navigation settles in viewport');
  assert.notEqual(pageUse.scrollY,beforeNavigation.scrollY);assert(pageUse.overlay);assert.equal(evidence.dialogs.length,dialogsBefore);
  evidence.r5.demo.beforeNavigation=beforeNavigation;
  evidence.r5.demo.use=pageUse;await screenshot(side(),'r5-toc-demo-use.png');await screenshot(demoPage,'r5-demo-heading-navigation.png');await back();
  check('default-toc-site-stop-restore-and-standard-demo-heading-navigation');

  await mark('uninstall-and-normal-chrome-restart');
  await openTool('markdown-workbench');await click(side(),'#sidebar-tool-remove');await visible(side(),'#sidebar-tool-inline-remove-cancel');
  const beforeCancel=await installed();await click(side(),'#sidebar-tool-inline-remove-cancel');assert.deepEqual(await installed(),beforeCancel);await back();
  await uninstall('markdown-workbench');assert.equal(await readStore(sidebarToolStorageKey('markdown-workbench')),undefined);
  const registryBeforeRestart=await installed();await d.restartChrome();
  assert.deepEqual(await installed(),registryBeforeRestart);assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);
  assert(!((await installed()).some(row=>row.id==='markdown-workbench')));
  frame=await openTool('quick-notes');await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(note)),'persisted note after actual Chrome exit/relaunch');await back();
  assert(tocSiteAllowed(await readStore(READING_TOC_SITE_STORE),'reading-toc',demo.origin));
  check('inline-uninstall-cancel-confirm-and-normal-chrome-restart-with-persisted-updated-data');

  if(process.env.OPENDESK_NATIVE_MARKET_R5_LONG==='1')
    await runMarketNaturalLifecycle({d,websiteReview,check,mark});
  assert.deepEqual(evidence.dialogErrors,[]);assert.equal(evidence.dialogs.length,0,'normal R5 flow has no application dialog');
  assert.equal(evidence.protectedStorageWritesFromDriver,0);
  // The driver grants final PASS only after unchanged package identity and a
  // normal final Chrome exit; a failed teardown must not leave a green receipt.
  evidence.publicMarket='LOCAL_HTTP_ONLY';await d.save();
}
