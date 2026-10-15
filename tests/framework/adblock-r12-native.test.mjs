// Real macOS Chrome for Testing smoke: reviewed install, native permission,
// actual HTTP image network, DNR readback, global switch, per-site bypass,
// Chrome worker recovery, permission revocation and uninstall.
// No mocked DNR, artificial rule insertion, synthetic click or storage seeding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const BIN=process.env.CHROME_BIN,ROOT=path.resolve('dist/production');
const OUT=path.resolve(process.env.OPENDESK_ADBLOCK_NATIVE_EVIDENCE||'artifacts/adblock-r12-native');
const ENABLED=process.env.OPENDESK_ADBLOCK_NATIVE==='1';
const STORE='opendesk.adblock.state.v1',F=741000,L=741199;
function connect(url){
  const ws=new WebSocket(url),waiting=new Map();let serial=0;
  const ready=new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const obj=JSON.parse(event.data),row=waiting.get(obj.id);if(!row)return;
    waiting.delete(obj.id);clearTimeout(row.timeout);
    obj.error?row.reject(Error(JSON.stringify(obj.error))):row.resolve(obj.result);
  };
  ws.onclose=()=>{for(const row of waiting.values()){clearTimeout(row.timeout);row.reject(Error('CDP closed'));}};
  return {ready,send(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++serial,timeout=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},18000);
    waiting.set(id,{resolve,reject,timeout});
    ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},close(){ws.close();}};
}
async function until(job,label,limit=22000){
  const end=Date.now()+limit;let last;
  while(Date.now()<end){
    try{const value=await job();if(value)return value;}catch(e){last=String(e);}
    await pause(170);
  }
  throw Error(label+' timed out'+(last?' - '+last.slice(0,300):''));
}
async function evaluate(c,s,expression){
  const reply=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);
  if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails).slice(0,500));
  return reply.result.value;
}
async function attach(c,targetId){
  const s=(await c.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  await c.send('Runtime.enable',{},s);await c.send('Page.enable',{},s);
  return s;
}
async function click(c,session,selector){
  const p=await until(()=>evaluate(c,session,
    '(()=>{const x=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!x||x.disabled||x.closest("[hidden]"))return null;'+
    'const r=x.getBoundingClientRect(),mx=r.left+r.width/2,my=r.top+r.height/2;'+
    'return {x:mx,y:my,valid:r.width>0&&r.height>0&&mx>=0&&'+
    'mx<innerWidth&&my>=0&&my<innerHeight&&x.contains(document.elementFromPoint(mx,my))};})()')
    .then(value=>value?.valid?value:null),'visible real input '+selector);
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y},session);
  for(const type of ['mousePressed','mouseReleased'])
    await c.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1},session);
}
async function screenshot(c,s,name){
  const value=await c.send('Page.captureScreenshot',{format:'png'},s);
  const bytes=Buffer.from(value.data,'base64');
  await writeFile(path.join(OUT,name+'.png'),bytes);
  return {file:name+'.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
async function probe(c,s,url){
  return evaluate(c,s,'(()=>new Promise(resolve=>{'+
    'const pic=new Image();let completed=false;'+
    'const end=(success,reason)=>{if(completed)return;completed=true;resolve({success,reason});};'+
    'pic.onload=()=>end(true,"loaded");pic.onerror=()=>end(false,"error");'+
    'setTimeout(()=>end(false,"timeout"),9000);'+
    'pic.src='+JSON.stringify(url)+';document.body.append(pic);}))()');
}
async function getOwned(c,session){
  return evaluate(c,session,'(async()=>{'+
    'const all=await chrome.declarativeNetRequest.getDynamicRules();'+
    'const saved=await chrome.storage.local.get('+JSON.stringify(STORE)+');'+
    'return {state:saved['+JSON.stringify(STORE)+']||null,'+
    'owned:all.filter(x=>x.id>='+F+'&&x.id<='+L+'),'+
    'focus:all.filter(x=>x.id>=730000&&x.id<=730199)};})()');
}
test('macOS Chrome actual AdBlock DNR and network lifecycle',
  {skip:!ENABLED,timeout:680000},async t=>{
  assert.equal(process.platform,'darwin');
  assert.ok(BIN&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,'Chrome for Testing must exist');
  await mkdir(OUT,{recursive:true});
  const bytes=await readFile(path.join(ROOT,'official-tools/adblock/adblock.opendesk-tool.json'));
  const pkg=JSON.parse(bytes);
  assert.equal(pkg.id,'adblock');assert.equal(pkg.version,'1.0.0');
  const report={candidate:process.env.GITHUB_SHA||null,
    chromeBin:BIN,packageSHA256:createHash('sha256').update(bytes).digest('hex'),
    env:'real-macos-chrome',status:'NOT_TESTED',nativePermission:'NOT_TESTED',
    network:'NOT_TESTED',globalToggle:'NOT_TESTED',siteException:'NOT_TESTED',
    otherSite:'NOT_TESTED',iframe:'NOT_TESTED',closedPanel:'NOT_TESTED',
    workerRestart:'NOT_TESTED',browserRestart:'NOT_TESTED',
    revocation:'NOT_TESTED',uninstall:'NOT_TESTED',checks:[],screenshots:[]};
  const note=(name,record)=>{report.checks.push({name,...record});console.log('ADBLOCK_NATIVE '+name+' '+JSON.stringify(record));};
  const counts={ad:0,normal:0,frameAd:0,framePage:0};
  let port;
  const server=createServer((req,res)=>{
    const uri=new URL(req.url,'http://placeholder'),hostname=(req.headers.host||'').split(':')[0];
    res.setHeader('cache-control','no-store');res.setHeader('access-control-allow-origin','*');
    if(uri.pathname==='/page'){
      res.setHeader('content-type','text/html;charset=utf-8');
      res.end('<!doctype html><title>AdBlock controlled page</title><h1>Network fixture ready</h1>');
    }else if(uri.pathname==='/frame'){
      counts.framePage++;
      res.setHeader('content-type','text/html;charset=utf-8');
      const image='http://zedo.com:'+port+'/frame-pixel?nonce='+encodeURIComponent(uri.searchParams.get('n')||'');
      res.end('<!doctype html><h1>iframe served</h1><img src="'+image+'">');
    }else if(uri.pathname==='/ad-pixel'||uri.pathname==='/frame-pixel'||uri.pathname==='/normal-pixel'){
      if(uri.pathname==='/frame-pixel'&&hostname==='zedo.com')counts.frameAd++;
      if(uri.pathname==='/ad-pixel'&&hostname==='zedo.com')counts.ad++;
      if(uri.pathname==='/normal-pixel')counts.normal++;
      res.setHeader('content-type','image/gif');
      res.end(Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64'));
    }else{res.statusCode=404;res.end('not found');}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'::',()=>{server.removeListener('error',reject);resolve();});
  });
  port=server.address().port;
  const page='http://127.0.0.1:'+port+'/page';
  const otherPage='http://localhost:'+port+'/page';
  const adUrl=()=> 'http://zedo.com:'+port+'/ad-pixel?nonce='+randomUUID();
  const normalUrl=()=> 'http://127.0.0.1:'+port+'/normal-pixel?nonce='+randomUUID();
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-adblock-r12-'));
  const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--password-store=basic','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--no-proxy-server','--remote-allow-origins=*',
    '--host-resolver-rules=MAP zedo.com 127.0.0.1, EXCLUDE localhost',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+ROOT,
    '--load-extension='+ROOT,'about:blank'];
  const launch=()=>spawn(BIN,argv,{stdio:['ignore','ignore','pipe']});
  let chrome=launch(),client=null,errors='',passed=false;
  const capture=p=>p.stderr.on('data',chunk=>errors=(errors+chunk).slice(-2000));
  capture(chrome);
  t.after(async()=>{
    try{
      if(client&&!passed){
        try{
          const targets=(await client.send('Target.getTargets')).targetInfos;
          report.failedTargets=targets.map(x=>({type:x.type,url:x.url})).slice(0,20);
        }catch{}
      }
      if(client)try{await client.send('Browser.close');}catch{}
      client?.close();
      if(chrome.exitCode===null&&chrome.signalCode===null){
        chrome.kill('SIGTERM');await pause(1200);
        if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');
      }
      await new Promise(resolve=>server.close(resolve));
      if(path.basename(profile).startsWith('opendesk-adblock-r12-')&&path.dirname(profile)===tmpdir())
        await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
    }finally{
      report.success=passed;report.status=passed?'PASS':'FAIL_OR_BLOCKED_NATIVE';
      report.chromeErrorTail=errors.slice(-1000);
      await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
    }
  });
  async function connected(){
    const debugPort=await until(async()=>{
      const source=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
      const port=Number(source?.split('\n')[0]);return port>0?port:null;
    },'native Chrome CDP port',30000);
    const raw=await(await fetch('http://127.0.0.1:'+debugPort+'/json/version')).json();
    const socket=connect(raw.webSocketDebuggerUrl);await socket.ready;
    return {socket,version:raw.Browser};
  }
  let first=await connected();
  client=first.socket;report.chrome=first.version;
  const id=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'actual loaded extension',20000);
  report.extensionId=id;
  const visit=await client.send('Target.createTarget',{url:page});
  const site=await attach(client,visit.targetId);
  await until(()=>evaluate(client,site,'document.querySelector("h1")?.textContent==="Network fixture ready"'),'first-party fixture');
  const baseline=await probe(client,site,adUrl());
  assert.equal(baseline.success,true,'without AdBlock approval, actual ad host request must load');
  assert.equal(counts.ad,1,'real HTTP server must receive the before sample');
  assert.equal((await probe(client,site,normalUrl())).success,true);
  note('uninstalled-baseline',{adRequests:counts.ad,normalRequests:counts.normal,ad:baseline});

  const ui=await client.send('Target.createTarget',
    {url:'chrome-extension://'+id+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const uid=await attach(client,ui.targetId);
  await until(()=>evaluate(client,uid,'!!document.querySelector("#catalog-open-dev-sidebar")'),
    'extension native launcher');
  await click(client,uid,'#catalog-open-dev-sidebar');
  const context=await until(async()=>{
    const entries=await evaluate(client,uid,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return entries.find(x=>x.documentUrl?.includes('/ui/tool.html')&&x.documentId)||null;
  },'actual Side Panel document');
  const panel=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.url===context.documentUrl)||null;
  },'actual Side Panel target');
  let sid=await attach(client,panel.targetId);
  await click(client,sid,'#tab-tools');
  // The R4 extension center is the only visible installation surface. The
  // historical discovery button still exists in markup but is CSS-hidden.
  await until(()=>evaluate(client,sid,'!document.querySelector("#workbench-tools").hidden'),
    'real Extension Center tab is selected');
  await click(client,sid,'#extension-center-search');
  await client.send('Input.insertText',{text:'广告拦截'},sid);
  const official='#extension-center-list button[data-extension-key="app:adblock"][data-extension-action="primary"]';
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+
    JSON.stringify(official)+');return !!b&&!b.disabled&&b.textContent.trim()==="安装"})()'),
    'official optional AdBlock visible after real search');
  await click(client,sid,official);
  await until(()=>evaluate(client,sid,'!document.querySelector("#sidebar-tool-preview").hidden'),'review fixed AdBlock');
  await click(client,sid,'#sidebar-tool-install');
  const installed='#extension-center-list button[data-extension-key="app:adblock"][data-extension-action="primary"]';
  await until(()=>evaluate(client,sid,'(()=>{const b=document.querySelector('+
    JSON.stringify(installed)+');return !!b&&!b.disabled&&b.textContent.trim()==="打开"})()'),
    'reviewed official AdBlock installed and directly runnable in the unified list');
  await click(client,sid,installed);
  await until(()=>evaluate(client,sid,'(()=>{const x=document.querySelector("#sidebar-tool-adblock-native");return !!x&&!x.hidden&&!!x.querySelector("[role=switch]")})()'),
    'trusted AdBlock switches visible');
  report.screenshots.push(await screenshot(client,sid,'adblock-installed-before-native-grant'));
  note('installed-no-filter-before-opt-in',{adRequests:counts.ad,officialVersion:pkg.version});

  const global='#sidebar-tool-adblock-native button[aria-label="全局广告拦截"]';
  const local='#sidebar-tool-adblock-native button[role="switch"]:nth-of-type(1)';
  assert.equal(await evaluate(client,sid,
    'chrome.permissions.contains({permissions:["declarativeNetRequestWithHostAccess"]})'),
    false,'clean Chrome Profile must not pregrant DNR');
  await click(client,sid,global);
  const grant=await until(()=>evaluate(client,sid,
    'chrome.permissions.contains({permissions:["declarativeNetRequestWithHostAccess"]})'),
    'actual Chrome optional DNR permission',11000).catch(()=>false);
  if(!grant){report.nativePermission='BLOCKED_NATIVE_PERMISSION_PROMPT';
    report.screenshots.push(await screenshot(client,sid,'native-chrome-permission-blocked'));
    throw Error('Chrome native permission not granted; cannot report ad blocking PASS');}
  report.nativePermission='PASS';
  const enabled=await until(async()=>{
    const r=await getOwned(client,uid);
    return r.state?.enabled===true&&r.owned.some(x=>x.id===F)?r:null;
  },'native AdBlock rules added and read back');
  assert.equal(enabled.owned[0].condition.domainType,'thirdParty');
  const beforeBlock=counts.ad;
  const blocked=await probe(client,site,adUrl());
  assert.equal(blocked.success,false,'Chrome must block actual third-party ad image');
  assert.equal(counts.ad,beforeBlock,'the local HTTP server MUST NOT receive the blocked ad');
  assert.equal((await probe(client,site,normalUrl())).success,true,'normal image remains accessible');
  report.network='PASS';note('actual-network-block',{blocked,adServerHits:counts.ad,
    normalServerHits:counts.normal,nativeRuleIds:enabled.owned.map(x=>x.id)});

  await click(client,sid,global);
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.enabled===false&&r.owned.length===0?r:null;},'pause verified by Chrome DNR');
  const paused=await probe(client,site,adUrl());
  assert.equal(paused.success,true,'real ad request should resume after trusted OFF');
  assert.equal(counts.ad,beforeBlock+1);
  await click(client,sid,global);
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.enabled===true&&r.owned.length===1?r:null;},'reenable verified');
  const reblocked=await probe(client,site,adUrl());
  assert.equal(reblocked.success,false,'trusted ON must block the ad again');
  report.globalToggle='PASS';note('trusted-global-pause-resume',
    {paused,reenabled:reblocked,ownedRuleId:F});

  // Real tab selection: no test writes the tool's Chrome state or DNR data.
  await evaluate(client,uid,'(async()=>{const t=(await chrome.tabs.query({url:'+JSON.stringify(page)+'}))[0];'+
    'if(!t)throw Error("page tab unavailable");await chrome.tabs.update(t.id,{active:true});'+
    'await chrome.windows.update(t.windowId,{focused:true});return t.id;})()');
  const nativeSite=await until(()=>evaluate(client,sid,
    '(()=>{const n=document.querySelector("#sidebar-tool-adblock-native");'+
    'return n&&!n.hidden&&n.textContent.includes("127.0.0.1")})()'),
    'current real website reflected in trusted controls');
  assert.equal(nativeSite,true);
  const siteButton=await evaluate(client,sid,
    '(()=>{const n=document.querySelector("#sidebar-tool-adblock-native");'+
    'return [...n.querySelectorAll(\'button[role="switch"]\')].map(x=>({label:x.getAttribute("aria-label"),on:x.getAttribute("aria-checked")}))})()');
  assert.equal(siteButton.length,2);
  const siteSelector='#sidebar-tool-adblock-native button[aria-label="网站 127.0.0.1 的广告过滤"]';
  await click(client,sid,siteSelector);
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.exceptions?.includes('127.0.0.1')&&
      r.owned.some(x=>x.action?.type==='allowAllRequests')?r:null;},
    'hostname-only exception is persisted and native allowAllRequests installed');
  await client.send('Page.reload',{ignoreCache:true},site);
  await until(()=>evaluate(client,site,'document.readyState==="complete"'),'real page refresh after exception');
  const allowed=await probe(client,site,adUrl());
  assert.equal(allowed.success,true,'current-site exception must allow third-party ad after reload');
  report.siteException='PASS';note('exact-host-allow-all-requests',
    {host:'127.0.0.1',passed:allowed,serverAdHits:counts.ad});

  const other=await client.send('Target.createTarget',{url:otherPage});
  const otherSession=await attach(client,other.targetId);
  await until(()=>evaluate(client,otherSession,'document.querySelector("h1")?.textContent==="Network fixture ready"'),
    'other hostname first-party page');
  const otherBlocked=await probe(client,otherSession,adUrl());
  assert.equal(otherBlocked.success,false,'allow 127.0.0.1 must not allow localhost');
  report.otherSite='PASS';note('other-host-remains-filtered',{host:'localhost',request:otherBlocked});
  const frameBefore=counts.frameAd;
  await evaluate(client,site,'(()=>{const n=document.createElement("iframe");n.src='+
    JSON.stringify('http://localhost:'+port+'/frame?n='+randomUUID())+
    ';document.body.append(n);return true;})()');
  await until(()=>counts.framePage>0,'actual nested iframe page received');
  await until(()=>counts.frameAd>frameBefore,'third-party ad from descendant iframe of excepted site');
  report.iframe='PASS';note('cross-origin-nested-frame-inherits-site-exception',{framePageHits:counts.framePage,
    adHits:counts.frameAd});

  await evaluate(client,uid,'(async()=>{const t=(await chrome.tabs.query({url:'+JSON.stringify(page)+'}))[0];'+
    'await chrome.tabs.update(t.id,{active:true});await chrome.windows.update(t.windowId,{focused:true});})()');
  await until(()=>evaluate(client,sid,'document.querySelector('+JSON.stringify(siteSelector)+')?.getAttribute("aria-checked")==="false"'),
    'site switch now off');
  await click(client,sid,siteSelector);
  await until(async()=>{const r=await getOwned(client,uid);
    return r.state?.exceptions?.length===0&&r.owned.length===1?r:null;},'site filter restored');
  await client.send('Page.reload',{ignoreCache:true},site);
  await until(()=>evaluate(client,site,'document.readyState==="complete"'),'page reload after restore');
  assert.equal((await probe(client,site,adUrl())).success,false,'restoring site must reblock ad');
  note('site-filter-restored',{remainingExceptions:0});

  // The native Side Panel can close; DNR belongs to the extension worker.
  await client.send('Target.closeTarget',{targetId:panel.targetId});
  const sideClosed=await until(async()=>!(await client.send('Target.getTargets')).targetInfos
    .some(x=>x.targetId===panel.targetId),'Side Panel target closed');
  assert.equal(sideClosed,true);
  assert.equal((await probe(client,site,adUrl())).success,false);
  report.closedPanel='PASS';
  await client.send('ServiceWorker.enable',{},uid);
  await client.send('ServiceWorker.stopAllWorkers',{},uid);
  assert.equal((await probe(client,site,adUrl())).success,false,
    'Chrome DNR survives its service worker being stopped');
  report.workerRestart='PASS';

  const prior=chrome;
  await client.send('Browser.close').catch(()=>{});
  await until(()=>prior.exitCode!==null||prior.signalCode!==null,'real Chrome browser exited',25000);
  client.close();client=null;
  chrome=launch();capture(chrome);
  first=await connected();client=first.socket;
  const idAgain=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'extension after actual full Chrome restart',25000);
  assert.equal(idAgain,id,'extension ID must not change across restart');
  const uiAgain=await client.send('Target.createTarget',
    {url:'chrome-extension://'+id+'/ui/tool.html?hostInstanceId='+randomUUID()});
  const again=await attach(client,uiAgain.targetId);
  const persisted=await until(async()=>{const r=await getOwned(client,again);
    return r.state?.enabled===true&&r.owned.length===1?r:null;},'persistent DNR after Chrome restart');
  const visitAgain=await client.send('Target.createTarget',{url:page});
  const pageAgain=await attach(client,visitAgain.targetId);
  await until(()=>evaluate(client,pageAgain,'document.querySelector("h1")?.textContent==="Network fixture ready"'),'restarted HTTP page');
  assert.equal((await probe(client,pageAgain,adUrl())).success,false,'real filtering survives browser restart');
  report.browserRestart='PASS';note('actual-chrome-restart',{sameExtensionId:idAgain,owned:persisted.owned.length});

  // Simulates user revoking an optional permission through Chrome's API.
  // The native permission is removed, not merely a mocked storage flag.
  const revoked=await evaluate(client,again,
    'chrome.permissions.remove({permissions:["declarativeNetRequestWithHostAccess"]})');
  assert.equal(revoked,true,'actual Chrome optional permission must be removable');
  await until(async()=>{
    const state=await evaluate(client,again,'chrome.storage.local.get('+JSON.stringify(STORE)+')');
    return state?.[STORE]?.enabled===false?state:null;
  },'worker handles native permission removal');
  report.revocation='PASS_STATE_AND_NATIVE_PERMISSION';
  note('native-permission-revoked',{adblockIntent:false});
  // Native revocation may make DNR API inaccessible; do not infer removal
  // of persisted rule bytes without native network and re-grant evidence.

  // Existing installed tools must uninstall through shipped UI, not by writing
  // directly into storage or mocking onRemoved.
  await click(client,again,'#catalog-open-dev-sidebar');
  const ctx=await until(async()=>{
    const contexts=await evaluate(client,again,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    return contexts.find(x=>x.documentUrl?.includes('/ui/tool.html')&&x.documentId);
  },'reopened Side Panel for uninstallation');
  const target=await until(async()=>{const all=(await client.send('Target.getTargets')).targetInfos;
    return all.find(x=>x.url===ctx.documentUrl)||null;},'reopened Side Panel target');
  sid=await attach(client,target.targetId);
  await click(client,sid,'#tab-tools');
  await click(client,sid,installed);
  await click(client,sid,'#sidebar-tool-remove');
  await click(client,sid,'#sidebar-tool-inline-remove-confirm');
  await until(()=>evaluate(client,again,
    '(async()=>{const all=await chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1",'+
    JSON.stringify(STORE)+']);return !all["opendesk.sidebar-tools.installed.v1"]?.some(x=>x.id==="adblock")&&'+
    '!Object.hasOwn(all,'+JSON.stringify(STORE)+');})()'), 'actual uninstall and data cleared');
  assert.equal((await probe(client,pageAgain,adUrl())).success,true,
    'after native permission removal and uninstall real requests must load');
  report.uninstall='PASS';passed=true;
  note('uninstall-clears-product-data',{stillInstalled:false,realNetworkRestored:true});
  report.screenshots.push(await screenshot(client,sid,'adblock-final-uninstalled'));
});
