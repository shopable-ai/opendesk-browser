#!/usr/bin/env node
// R2.4: install the source-identical candidate in the REAL OpenDesk WXT Host.
// All actions go through the installed React UI, SDK and Trusted Host. An
// independent test observer reads the target webpage in Chrome MAIN world.
// This is NOT the earlier isolated CDP-driver test and never self-grants an App.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const root=resolve('examples/sidebar-tools/browser-fingerprint');
const output=resolve(process.argv[2]||'artifacts/app-ci/browser-fingerprint/chrome');
const candidate=resolve('artifacts/app-ci/browser-fingerprint/candidate.opendesk-tool.json');
const extension=resolve('dist/development');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const digest=b=>createHash('sha256').update(b).digest('hex');
const temp=await mkdtemp(join(tmpdir(),'opendesk-fp-installed-r24-'));
const profile=join(temp,'chrome-profile');
const evidence={
  kind:'CHROMIUM_INSTALLED_FULL_CHAIN_R24',
  installedOpenDeskHost:false,installedReact:false,macChrome:'NOT_TESTED',
  httpAcceptLanguage:'UNVERIFIABLE',geolocation:'UNSUPPORTED',
  uaCH:'LOW_ENTROPY_PLATFORM_ONLY',status:'NOT_TESTED',checks:[],cycles:[],
  sourceCommit:process.env.GITHUB_SHA||'unknown'
};
let chrome,server,ws,stderr='';
try{
  await mkdir(output,{recursive:true});
  const receipt=JSON.parse(await readFile(resolve('artifacts/app-ci/browser-fingerprint/candidate-receipt.json')));
  const bytes=await readFile(candidate);
  const pkg=JSON.parse(bytes);
  evidence.candidate={id:pkg.id,version:pkg.version,sha256:digest(bytes),bytes:bytes.length,
    capabilities:pkg.capabilities,sourceCommit:receipt.sourceCommit};
  assert.equal(receipt.schema,'opendesk.app-ci-candidate.v1');
  assert.equal(receipt.sourceCommit,evidence.sourceCommit,'candidate must belong to current main');
  assert.equal(receipt.sha256,evidence.candidate.sha256);
  assert.equal(receipt.bytes,bytes.length);
  assert.equal(pkg.id,'browser-fingerprint');
  assert.equal(pkg.version,'0.2.2');
  assert(pkg.capabilities.includes('browser.fingerprint.control'));
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json')));
  assert(manifest.permissions.includes('debugger'));
  assert(!manifest.optional_permissions?.includes('debugger'));
  const hostBundle=await readFile(join(extension,'platform/context-menus.js'),'utf8');
  assert(hostBundle.includes('Emulation.setUserAgentOverride'));
  assert(hostBundle.includes('Emulation.setTimezoneOverride'));
  evidence.checks.push('R24_CANDIDATE_SHA_VERSION_CAPABILITY_AND_WXT_HOST_PASS');

  server=createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fingerprint R2.4</title></head><body><h1>Fingerprint R2.4 Test</h1></body></html>');
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  const fixture='http://127.0.0.1:'+server.address().port+'/';
  chrome=spawn(process.env.CHROME_BIN||'chromium',[
    '--no-sandbox','--disable-dev-shm-usage','--no-first-run','--disable-gpu',
    '--remote-debugging-port=0','--window-size=1180,900','--user-data-dir='+profile,
    '--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',c=>{stderr=(stderr+String(c)).slice(-8000)});
  let port;
  for(let i=0;i<240;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited before DevTools endpoint: '+stderr.slice(-1000));
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await pause(100);
  }
  assert(port,'CHROME_DEBUG_ENDPOINT_NOT_AVAILABLE');
  const browserVersion=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  evidence.browser=browserVersion.Browser;
  ws=new WebSocket(browserVersion.webSocketDebuggerUrl);
  await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true})});
  let serial=0;
  const pending=new Map();
  const protocolErrors=[];
  ws.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data)}catch{return}
    if(message.id!==undefined){
      const task=pending.get(message.id);
      if(!task)return;
      pending.delete(message.id);clearTimeout(task.timer);
      message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);
    }else if(message.method==='Runtime.exceptionThrown'){
      protocolErrors.push(JSON.stringify(message.params).slice(0,1000));
    }
  });
  function send(method,params={},sessionId){
    return new Promise((resolve,reject)=>{
      const id=++serial;
      const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method))},30000);
      pending.set(id,{resolve,reject,timer});
      ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  }
  async function until(action,name,max=160){
    let last;
    for(let i=0;i<max;i++){
      try{const value=await action();if(value)return value}catch(e){last=e}
      await pause(150);
    }
    throw Error('WAIT '+name+' '+String(last||'').slice(0,350));
  }
  const targets=async()=>(await send('Target.getTargets')).targetInfos;
  const attach=async id=>(await send('Target.attachToTarget',{targetId:id,flatten:true})).sessionId;
  async function evaluate(expression,session){
    const r=await send('Runtime.evaluate',
      {expression,returnByValue:true,awaitPromise:true},session);
    if(r.exceptionDetails)throw Error('JS_EXCEPTION '+JSON.stringify(r.exceptionDetails).slice(0,700));
    return r.result?.value;
  }
  // Native X11 input is reserved for a verified Chrome SIDE_PANEL target.
  // It must hit the visible Chrome window; CDP Input on the detached panel
  // target was accepted by the protocol but did not activate React controls.
  const physicalSessions=new Map();
  let physicalHost=null;
  const xdotool=(...args)=>execFileSync('xdotool',args,{encoding:'utf8',timeout:5000}).trim();
  function chromeWindowGeometry(){
    const ids=xdotool('search','--onlyvisible','--pid',String(chrome.pid)).split(/\s+/);
    const windows=ids.flatMap(id=>{
      try{
        const pairs=xdotool('getwindowgeometry','--shell',id).split('\n')
          .map(line=>line.split('=')).filter(pair=>pair.length===2);
        const raw=Object.fromEntries(pairs);
        const rect={id,x:Number(raw.X),y:Number(raw.Y),
          width:Number(raw.WIDTH),height:Number(raw.HEIGHT)};
        return rect.width>=600&&rect.height>=500?[rect]:[];
      }catch{return [];}
    });
    const win=windows.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
    if(!win)throw Error('NATIVE_CHROME_WINDOW_NOT_FOUND');
    return win;
  }
  async function nativeClick(selector,session){
    if(!physicalHost)throw Error('PHYSICAL_SIDEPANEL_NOT_BOUND');
    const point=await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!n||n.disabled)return null;n.scrollIntoView({block:"center",inline:"nearest"});'+
      'const r=n.getBoundingClientRect();return r.width>0&&r.height>0?'+
      '{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}:null})()',session);
    assert(point,'CONTROL_NOT_CLICKABLE '+selector);
    const frame=()=>evaluate('(()=>{const n=document.querySelector("#sidebar-tool-frame iframe");'+
      'if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()',physicalHost);
    const sandboxControl=physicalSessions.get(session)==='sandbox';
    let frameOffset=sandboxControl?await frame():{x:0,y:0};
    assert(frameOffset,'INSTALLED_SANDBOX_FRAME_NOT_VISIBLE');
    const viewport=await evaluate('({width:innerWidth,height:innerHeight})',physicalHost);
    // The installed React iframe grows to fit Results. In Chrome Side Panel,
    // #workspace-content is the actual scroll owner; scrolling the iframe's
    // internal document does not bring its bottom controls into the window.
    for(let attempt=0;sandboxControl&&attempt<4;attempt++){
      const visibleY=frameOffset.y+point.y;
      if(visibleY>=55&&visibleY<viewport.height-35)break;
      const delta=Math.round(visibleY-viewport.height*0.63);
      const movement=await evaluate('(()=>{const n=document.querySelector("#workspace-content");'+
        'if(!n)return null;const before=n.scrollTop;n.scrollTop+='+delta+';'+
        'return {before,after:n.scrollTop,max:n.scrollHeight-n.clientHeight}})()',physicalHost);
      evidence.nativeScrolls??=[];
      evidence.nativeScrolls.push({selector,visibleY,delta,movement});
      await pause(80);
      frameOffset=await frame();
      assert(frameOffset,'INSTALLED_SANDBOX_FRAME_LOST_AFTER_SCROLL');
      if(movement?.after===movement?.before)break;
    }
    const win=chromeWindowGeometry();
    // Chrome's Side Panel is right- and bottom-aligned in the browser window.
    // The geometry and attempted physical coordinates are retained on failure.
    const x=Math.round(win.x+win.width-viewport.width+frameOffset.x+point.x);
    const y=Math.round(win.y+win.height-viewport.height+frameOffset.y+point.y);
    assert(x>=win.x&&y>=win.y&&x<win.x+win.width&&y<win.y+win.height,
      'NATIVE_POINT_OUTSIDE_CHROME_WINDOW '+JSON.stringify({selector,x,y,win,viewport}));
    evidence.nativeClicks??=[];
    const hostHit=await evaluate('(()=>{const n=document.elementFromPoint('+ (frameOffset.x+point.x)+','+(frameOffset.y+point.y)+');'+
      'return n?{tag:n.tagName,id:n.id,className:String(n.className).slice(0,80)}:null})()',physicalHost);
    const sandboxHit=sandboxControl?await evaluate('(()=>{const t=document.querySelector('+JSON.stringify(selector)+');'+
      'const r=t?.getBoundingClientRect();const n=r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);'+
      'return {matches:!!n&&(n===t||t.contains(n)),tag:n?.tagName,label:n?.textContent?.trim().slice(0,64)}})()',session):null;
    evidence.nativeClicks.push({selector,x,y,window:win,viewport,frameOffset,hostHit,sandboxHit});
    xdotool('windowfocus',win.id);
    xdotool('mousemove','--sync',String(x),String(y));
    xdotool('click','--clearmodifiers','1');
  }
  const click=async(selector,session)=>{
    if(physicalSessions.has(session))return nativeClick(selector,session);
    const point=await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!n||n.disabled)return null;n.scrollIntoView({block:"center"});'+
      'const r=n.getBoundingClientRect();return r.width&&r.height?'+
      '{x:r.x+r.width/2,y:r.y+r.height/2}:null})()',session);
    assert(point,'CONTROL_NOT_CLICKABLE '+selector);
    for(const type of ['mousePressed','mouseReleased'])
      await send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point},session);
  };
  const originalWorker=await until(async()=>(await targets()).find(t=>
    t.type==='service_worker'&&t.url.endsWith('/sw.js')),'WXT service worker');
  const extensionId=new URL(originalWorker.url).host;
  evidence.extensionId=extensionId;
  const worker=await attach(originalWorker.targetId);
  const created=await send('Target.createTarget',{url:fixture});
  await until(async()=>{const list=await targets();return list.some(t=>t.targetId===created.targetId&&t.url===fixture)},'fixture tab');
  // An ordinary chrome-extension:// tab is CATALOG-ONLY by product design:
  // [data-opendesk-surface=catalog] hides the workbench navigation. Launch the
  // actual SIDE_PANEL via its official catalog action (real CDP pointer input).
  const catalogPage=await send('Target.createTarget',{
    url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+randomUUID()});
  const catalog=await attach(catalogPage.targetId);
  await send('Target.activateTarget',{targetId:catalogPage.targetId});
  await until(()=>evaluate('(()=>{const n=document.querySelector("#catalog-open-dev-sidebar");'+
    'return n&&!n.disabled&&n.getBoundingClientRect().width>0})()',catalog),
    'visible official open Side Panel action');
  await click('#catalog-open-dev-sidebar',catalog);
  const livePanel=await until(async()=>{
    const contexts=await evaluate('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})',catalog);
    const context=contexts?.find(row=>row.contextType==='SIDE_PANEL'&&
      row.documentUrl?.startsWith('chrome-extension://'+extensionId+'/sidepanel.html')&&
      row.documentId&&row.documentLifecycle!=='prerender');
    if(!context)return null;
    const target=(await targets()).find(row=>row.targetId!==catalogPage.targetId&&
      row.url===context.documentUrl&&['page','other'].includes(row.type));
    return target?{target,context}:null;
  },'real SIDE_PANEL target and Chrome runtime identity');
  const host=await attach(livePanel.target.targetId);
  physicalHost=host;
  physicalSessions.set(host,'host');
  evidence.actionSurface='PHYSICAL_CHROME_SIDE_PANEL';
  evidence.realSidePanel=true;
  evidence.sidePanelContext={contextType:livePanel.context.contextType,
    documentUrl:livePanel.context.documentUrl,documentId:livePanel.context.documentId};
  evidence.physicalSidePanelInput='NATIVE_X11_PENDING';
  await until(()=>evaluate('document.readyState==="complete"&&'+
    'document.querySelector("#tab-tools")?.getBoundingClientRect().width>0',host),
    'actual visible React Side Panel tab');
  evidence.hostUIDiagnostics=await evaluate('(()=>{const n=document.querySelector("#tab-tools");'+
    'return {surface:document.documentElement.dataset.opendeskSurface,'+
    'active:document.querySelector("[aria-selected=true]")?.id,'+
    'viewport:{width:innerWidth,height:innerHeight},navRect:document.querySelector(".workbench-nav")?.getBoundingClientRect().toJSON(),'+
    'tabRect:n?.getBoundingClientRect().toJSON(),body:document.body.innerText.slice(0,1000)}})()',host);
  await evaluate('(()=>{globalThis.__r24NavigationProof=null;'+
    'document.addEventListener("click",e=>{if(e.target.closest?.("#tab-tools"))'+
    'globalThis.__r24NavigationProof={isTrusted:e.isTrusted,targetId:e.target.id}},true);return true})()',host);
  await click('#tab-tools',host);
  await pause(350);
  if(!await evaluate('document.querySelector("#tab-tools")?.getAttribute("aria-selected")==="true"',host)){
    // A real Chrome keypress is a second way to activate this focusable tab;
    // .focus() moves focus only and never invokes the action itself.
    await evaluate('document.querySelector("#tab-tools")?.focus()',host);
    xdotool('key','--clearmodifiers','Return');
  }
  await until(()=>evaluate('document.querySelector("#tab-tools")?.getAttribute("aria-selected")==="true"',host),
    'native navigation to Extensions');
  const navProof=await evaluate('globalThis.__r24NavigationProof',host);
  assert.equal(navProof?.isTrusted,true,'physical Side Panel requires trusted native input');
  evidence.nativeNavigationProof=navProof;
  evidence.physicalSidePanelInput='X11_NATIVE_TRUSTED';
  evidence.checks.push('R24_PHYSICAL_SIDEPANEL_NATIVE_TRUSTED_NAVIGATION_PASS');
  // React route mount is asynchronous; native input must not race
  // the extension-center toolbar render or click a hidden old Tab.
  try{
    await until(()=>evaluate('(()=>{const n=document.querySelector("#extension-center-more");'+
      'if(!n||n.disabled)return false;const r=n.getBoundingClientRect();'+
      'return r.width>0&&r.height>0})()',host),'visible installed extension center');
  }catch(error){
    evidence.routeDebug=await evaluate('({activeTab:document.querySelector("[data-workbench-tab][aria-selected=true]")?.id,'+
      'workbenchHidden:document.querySelector("#workbench-tools")?.hidden,'+
      'center:!!document.querySelector("#extension-center"),'+
      'toolbar:!!document.querySelector("#extension-center-more"),'+
      'text:document.body.innerText.slice(0,1800)})',host).catch(()=>null);
    throw error;
  }
  await click('#extension-center-more',host);
  await until(()=>evaluate('(()=>{const n=document.querySelector("#extension-center-import");'+
    'if(!n)return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0})()',host),
    'visible install import action');
  await click('#extension-center-import',host);
  await until(()=>evaluate('!!document.querySelector("#sidebar-tool-file")',host),'candidate import input');
  await send('DOM.enable',{},host);
  const {root:domRoot}=await send('DOM.getDocument',{depth:-1,pierce:true},host);
  const {nodeId}=await send('DOM.querySelector',{nodeId:domRoot.nodeId,selector:'#sidebar-tool-file'},host);
  assert(nodeId,'MISSING_IMPORT_FILE_INPUT');
  await send('DOM.setFileInputFiles',{nodeId,files:[candidate]},host);
  await until(()=>evaluate('!!document.querySelector("#sidebar-tool-install")&&'+
    '!document.querySelector("#sidebar-tool-install").disabled',host),'reviewed candidate ready');
  evidence.installReview=(await evaluate('document.body.innerText',host)).slice(-1500);
  assert(evidence.installReview.includes('浏览器指纹'),'correct tool review visible');
  await click('#sidebar-tool-install',host);
  const appSelector='[data-extension-key="app:browser-fingerprint"][data-extension-action="main"]';
  await until(()=>evaluate('!!document.querySelector('+JSON.stringify(appSelector)+')',host),'installed App row');
  // Verify installation from the Chrome extension's independent persistent
  // registry. The React list alone is not sufficient installation evidence.
  evidence.installedRecord=await evaluate('(async()=>{const saved=await chrome.storage.local.get(['+
    '"opendesk.sidebar-tools.installed.v1","opendesk.sidebar-tools.enabled.v1",'+
    '"opendesk.sidebar-tools.revocation-epochs.v1"]);'+
    'const pkg=(saved["opendesk.sidebar-tools.installed.v1"]||[]).find(x=>x.id==="browser-fingerprint");'+
    'const epoch=saved["opendesk.sidebar-tools.revocation-epochs.v1"]?.["browser-fingerprint"]??null;'+
    'return pkg?{id:pkg.id,version:pkg.version,capabilities:pkg.capabilities,'+
    'epoch,enabled:saved["opendesk.sidebar-tools.enabled.v1"]?.["browser-fingerprint"]!==false}:null;})()',worker);
  assert.equal(evidence.installedRecord?.id,'browser-fingerprint');
  assert.equal(evidence.installedRecord.version,'0.2.2');
  assert.equal(evidence.installedRecord.enabled,true);
  assert.equal(typeof evidence.installedRecord.epoch,'string');
  assert(evidence.installedRecord.capabilities.includes('browser.fingerprint.control'));
  evidence.installedOpenDeskHost=true;
  evidence.checks.push('R24_CANDIDATE_INSTALLED_VIA_OFFICIAL_REVIEW_PASS');
  await click(appSelector,host);
  const iframe=await until(async()=>(await targets()).find(t=>
    t.type==='iframe'&&t.url.endsWith('/sidebar-tools/sandbox.html')),'installed sandbox');
  const sandbox=await attach(iframe.targetId);
  physicalSessions.set(sandbox,'sandbox');
  const appRead=expr=>evaluate(expr,sandbox);
  await until(()=>appRead('!!document.querySelector(".fp-app")&&'+
    '!!document.querySelector(".fp-bottom-actions")'),'installed React');
  assert(!(await appRead('document.body.innerText')).includes('离线同源 React 预览'));
  evidence.installedReact=true;
  evidence.checks.push('R24_REAL_REACT_SDK_SANDBOX_PASS');
  // Passive capture only; never synthesize clicks or mutate React state.
  await appRead('(()=>{globalThis.__r24ButtonClicks=[];document.addEventListener("click",e=>{'+
    'const b=e.target.closest?.(".fp-bottom-actions button");if(b){'+
    'globalThis.__r24ButtonClicks.push({label:b.textContent?.trim(),trusted:e.isTrusted,at:Date.now()})}},true);return true})()');

  // Independent observer calls Chrome scripting directly from the test driver.
  // It does NOT use React's target/receipt or the Trusted Host page reader.
  async function independent(){
    const expr='(async()=>{'+
      'const tab=(await chrome.tabs.query({})).find(t=>t.url==='+JSON.stringify(fixture)+');'+
      'if(!tab)throw Error("FIXTURE_TAB_NOT_FOUND");'+
      'const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:"MAIN",'+
      'func:()=>({url:location.href,ua:navigator.userAgent,'+
      'uaCH:navigator.userAgentData?.platform??null,language:navigator.language,'+
      'languages:[...navigator.languages],'+
      'timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,'+
      'viewport:{width:innerWidth,height:innerHeight}})});'+
      'const targets=await chrome.debugger.getTargets();'+
      'return {tabId:tab.id,documentId:results[0]?.documentId,frameId:results[0]?.frameId,'+
      'values:results[0]?.result,debuggerAttached:targets.find(t=>t.tabId===tab.id)?.attached??false};'+
      '})()';
    const result=await evaluate(expr,worker);
    assert.equal(result?.frameId,0);
    assert.equal(result?.values?.url,fixture);
    assert(result?.documentId,'independent MAIN-world document ID required');
    return {...result,source:'CHROME_SCRIPTING_INDEPENDENT_MAIN_WORLD'};
  }
  await send('Target.activateTarget',{targetId:created.targetId});
  const baseline=await independent();
  evidence.baseline=baseline;
  evidence.checks.push('R24_INDEPENDENT_BASELINE_MAIN_WORLD_PASS');
  const status=()=>appRead('document.querySelector(".fp-status-title")?.textContent?.trim()');
  const action=async index=>{
    // Every action can be disabled while the preceding Host/history request
    // settles; a status label may become visible before that request finishes.
    const selector='.fp-bottom-actions button:nth-child('+index+')';
    await until(()=>appRead('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');'+
      'return n&&!n.disabled&&n.getClientRects().length>0})()'),
      'real React action '+index+' enabled');
    await click(selector,sandbox);
  };
  async function cycle(name,expected){
    const item={preset:name,progress:'STARTED_NOT_PASSED'};
    evidence.cycles.push(item); // Retain partial observations on any failure.
    const initialState=await status();
    assert(initialState==='尚未应用'||initialState.includes('恢复'),'previous cycle not finished');
    await action(1);
    let stage=await until(async()=>{
      // ToolHost mounts this button permanently; existence is NOT consent.
      // Require a real, enabled and visibly presented Host review surface.
      const permission=await evaluate('(()=>{const n=document.querySelector("#sidebar-tool-action-continue");'+
        'if(!n||n.disabled||n.closest("[hidden]"))return false;const r=n.getBoundingClientRect();'+
        'return r.width>0&&r.height>0})()',host);
      if(permission)return 'site-consent';
      const label=await status();
      if(label?.includes('已受理'))return 'accepted';
      if(['环境修改未开放','执行失败','授权被拒绝','执行结果未知'].includes(label))
        return 'failed:'+label;
      return null;
    },'React apply or site review');
    if(stage==='site-consent'){
      item.siteConsent='OFFICIAL_HOST_REVIEW_APPROVED_ONCE';
      await click('#sidebar-tool-action-continue',host);
      stage='accepted';
    }
    assert.equal(stage,'accepted','unexpected application state '+stage);
    await until(async()=>String(await status()).includes('已受理'),'native apply receipt');
    item.nativeReceiptText=(await appRead('document.querySelector(".fp-notice")?.textContent'))||'';
    const applied=await independent();
    item.applied=applied;
    item.progress='APPLIED_INDEPENDENT_VALUES_CAPTURED';
    assert.equal(applied.documentId,baseline.documentId,'native change must stay in original document');
    assert.equal(applied.debuggerAttached,true,'real Chrome debugger attachment required');
    assert(applied.values.ua.includes(expected.ua),'User-Agent remains unchanged');
    assert.equal(applied.values.uaCH,expected.uaCH,'low-entropy UA-CH platform');
    assert.equal(applied.values.language,expected.language,'JS navigator.language');
    assert.equal(applied.values.languages[0],expected.language,'JS navigator.languages[0]');
    assert.equal(applied.values.timezone,expected.timezone,'Intl timezone');
    assert.deepEqual(applied.values.viewport,expected.viewport,'MAIN world viewport');
    await action(2);
    await until(async()=>['有限字段已验证','部分结果 / 存在差异'].includes(await status()),
      'independent Host readback after native apply');
    // React commits the verified status before its asynchronous history write;
    // only then does it switch to Results and mount the source-qualified rows.
    await until(()=>appRead('(()=>{const panel=document.querySelector(".fp-check-list");'+
      'return panel&&panel.getClientRects().length>0&&'+
      'document.querySelector(".fp-tabs button[aria-selected=true]")?.textContent?.trim()==="网页验证"})()'),
      'real React results page after verified status');
    const readbackText=await appRead('document.body.innerText');
    assert(readbackText.includes('网页读回与差异')&&
      readbackText.includes('目标网页运行环境'),
      'installed React must render source-qualified independent page rows');
    const rows=await appRead('[...document.querySelectorAll(".fp-check")].map(n=>n.innerText)');
    assert(rows.some(x=>x.includes('User-Agent')&&x.includes(applied.values.ua)),
      'UI reported UA must match independently observed UA');
    item.verifiedStatus=await status();
    item.readbackRows=rows;
    item.progress='INDEPENDENT_APPLY_READBACK_VERIFIED';
    const gestureBefore=await appRead('globalThis.__r24ButtonClicks.length');
    await action(3);
    try {
      const trusted=()=>appRead('globalThis.__r24ButtonClicks.slice('+gestureBefore+').some(x=>x.trusted===true&&x.label?.includes("停止"))');
      let delivered=false;
      try{delivered=await until(trusted,'trusted X11 restore pointer event',18);}
      catch{/* No React click was delivered; do not infer a Host side effect. */}
      if(!delivered){
        // Safe fallback only when the original gesture never reached React
        // AND the independent target still has its old attached debugger.
        // Unknown/detached outcomes must NOT generate a second restore request.
        const stateBefore=await status();
        const independentBefore=await independent();
        item.noPointerRestoreEvidence={stateBefore,debuggerAttached:independentBefore.debuggerAttached};
        assert(['有限字段已验证','部分结果 / 存在差异'].includes(stateBefore)&&
          independentBefore.debuggerAttached===true,
          'RESTORE_UNKNOWN_RETRY_FORBIDDEN: no proven safe fallback');
        const focused=await appRead('(()=>{const b=document.querySelector(".fp-bottom-actions button:nth-child(3)");'+
          'if(!b||b.disabled)return false;b.focus();return document.activeElement===b})()');
        assert(focused,'RESTORE_KEYBOARD_FOCUS_FAILED');
        xdotool('windowfocus',chromeWindowGeometry().id);
        xdotool('key','--clearmodifiers','Return');
        item.restoreInputFallback='NATIVE_X11_KEYBOARD_AFTER_PROVEN_MISSED_POINTER';
        await until(trusted,'trusted physical keyboard restore event',24);
      }
      item.restoreGestures=await appRead('globalThis.__r24ButtonClicks.slice('+gestureBefore+')');
      assert(item.restoreGestures.some(x=>x.trusted===true&&x.label?.includes('停止')),
        'NATIVE_RESTORE_CLICK_NOT_DISPATCHED: no trusted React restore event');
      const result=await until(async()=>{
        const label=await status();
        if(String(label).includes('待读回'))return 'accepted';
        if(['恢复结果未知','目标网页已失效','授权被拒绝'].includes(label))return 'rejected:'+label;
        return null;
      },'restore native detach receipt');
      assert.equal(result,'accepted','Host restore did not acknowledge '+result);
    }catch(error){
      item.restoreFailureDiagnostics={
        label:await status(),
        notice:await appRead('document.querySelector(".fp-notice")?.textContent'),
        debugger:await independent(),
        trustedGestures:item.restoreGestures,
        screenHit:evidence.nativeClicks.at(-1)
      };
      throw error;
    }
    item.afterDetach=await independent();
    assert.equal(item.afterDetach.debuggerAttached,false,'debugger must detach before restoration verification');
    await action(2);
    await until(async()=>['调试已停止 · 恢复有限验证','已独立核验恢复','恢复结果未知'].includes(await status()),
      'restoration independent readback');
    item.restorationStatus=await status();
    const restored=await independent();
    item.restored=restored;
    assert.equal(restored.documentId,baseline.documentId);
    assert.equal(restored.debuggerAttached,false);
    for(const key of ['ua','uaCH','language','languages','timezone'])
      assert.deepEqual(restored.values[key],baseline.values[key],'restoration mismatch: '+key);
    assert.deepEqual(restored.values.viewport,baseline.values.viewport,'original viewport not restored');
    // The React status changes BEFORE the asynchronous history write and
    // setVerification(result). A visible .fp-check-list can still contain the
    // initial NO_INDEPENDENT_READBACK rows. Wait for the actual verified
    // report (enabled export action), not just the selected Results tab.
    // A genuine restore_unknown remains a FAIL; retain its settled Host rows.
    item.restorationStatusBeforeReport=item.restorationStatus;
    let reportMountError=null;
    try{
      await until(()=>appRead('(()=>{const t=document.querySelector(".fp-tabs button:nth-child(2)");'+
        'const list=document.querySelector(".fp-check-list");'+
        'const exportButton=document.querySelector(".fp-report-actions button");'+
        'return t?.getAttribute("aria-selected")==="true"&&'+
        'list?.getClientRects().length>0&&exportButton&&!exportButton.disabled})()'),
        'restoration live Host report mounted after history settled');
    }catch(error){reportMountError=String(error);}
    item.restorationReportMounted=reportMountError===null;
    if(reportMountError)item.restorationReportMountError=reportMountError;
    item.restorationStatus=await status();
    item.restorationRows=await appRead('[...document.querySelectorAll(".fp-check")].map(n=>n.innerText)');
    item.restorationFieldEvidence=await appRead('[...document.querySelectorAll(".fp-check")].map(n=>({'+
      'name:n.querySelector("strong")?.textContent?.trim(),'+
      'state:n.querySelector(".fp-tag")?.textContent?.trim(),'+
      'values:[...n.querySelectorAll(".fp-verification-values span")].map(x=>x.textContent),'+
      'source:n.querySelector("p.fp-secondary")?.textContent?.trim()}))');
    item.restorationNotice=await appRead('document.querySelector(".fp-notice")?.textContent');
    assert(!reportMountError,'RESTORATION_REPORT_NOT_READY: '+reportMountError);
    assert(['调试已停止 · 恢复有限验证','已独立核验恢复'].includes(item.restorationStatus),
      'restore_unknown is NOT a PASS: '+JSON.stringify(item.restorationFieldEvidence));
    assert(item.restorationRows.some(x=>x.includes('User-Agent')&&x.includes(restored.values.ua)),
      'restoration React report must match the independent original UA');
    item.progress='COMPLETE_INDEPENDENT_RESTORE_VERIFIED';
    evidence.checks.push('R24_'+name+'_REAL_APPLY_READBACK_RESTORE_PASS');
  }

  await cycle('US',{ua:'Windows NT',uaCH:'Windows',language:'en-US',
    timezone:'America/New_York',viewport:{width:1366,height:768}});
  // The readback automatically switches to Results. Return to the actual
  // Config tab before selecting Germany via Chrome keyboard events.
  await click('.fp-tabs button:nth-child(1)',sandbox);
  await until(()=>appRead('document.querySelector(".fp-tabs button:nth-child(1)")?.getAttribute("aria-selected")==="true"'+
    '&&!!document.querySelector(".fp-preset-row select")'),
    'configuration tab after US restoration');
  await click('select[aria-label="选择环境预设"]',sandbox);
  xdotool('key','--clearmodifiers','Down');
  xdotool('key','--clearmodifiers','Return');
  await until(()=>appRead('document.querySelector(".fp-preset-row select")?.value==="de"'),
    'German preset selected');
  await cycle('DE',{ua:'Macintosh',uaCH:'macOS',language:'de-DE',
    timezone:'Europe/Berlin',viewport:{width:1366,height:768}});
  evidence.checks.push('R24_TWO_DISTINCT_SESSION_CYCLES_PASS');
  evidence.protocolErrors=protocolErrors.slice(0,6);
  evidence.status='PASS';
  console.log('CHROMIUM_INSTALLED_FULL_CHAIN_R24_PASS '+JSON.stringify({
    browser:evidence.browser,candidateSha256:evidence.candidate.sha256,
    checked:evidence.checks,cycles:evidence.cycles.map(x=>({preset:x.preset,
      status:x.verifiedStatus,restorationStatus:x.restorationStatus}))}));
}catch(error){
  evidence.status='FAIL';
  evidence.error=String(error?.stack||error);
  evidence.chromeErrors=stderr.slice(-3000);
  console.error('CHROMIUM_INSTALLED_FULL_CHAIN_R24_FAIL',evidence.error);
  process.exitCode=1;
}finally{
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'fingerprint-r24-installed-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  if(ws)try{ws.close()}catch{}
  if(chrome){
    chrome.kill('SIGTERM');
    await pause(1000);
    if(chrome.exitCode===null)chrome.kill('SIGKILL');
  }
  if(server)await new Promise(done=>server.close(done));
  await rm(temp,{force:true,recursive:true});
}