// Real Chromium + existing NetworkService + independent loopback server capture.
// Never creates a production Grant, installed HTTP Task, or v1 RunReceipt.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {launchOwned,openNativePanel,click,until,sha} from './native-session.mjs';
import {checkHeaderTransitions,checkFinalTransitionRequests} from './http-header-transition-checks.mjs';

const root=resolve(new URL('../../../../',import.meta.url).pathname);
const opt=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const out=resolve(opt('out','artifacts/scrapyjs/http-header-proof-20261030'));
const seedPath=resolve(opt('seed','artifacts/scrapyjs/r242-local-acceptance/native-app-lifecycle/report.json'));
const scenario=opt('scenario','baseline');
assert(['baseline','transitions'].includes(scenario),'Unknown diagnostic scenario');
await mkdir(out,{recursive:false}); // Preserve previous runs; choose a new output on retry.
const report={status:'RUNNING',scope:'REAL_CHROMIUM_LOOPBACK_HTTP_TRANSPORT_ONLY',
  mode:'STATIC_DEVELOPMENT_SNAPSHOT_NO_SERVE',productionHttp:'BLOCKED',
  installedHttpGrant:'NOT_TESTED',httpOperationRetirement:'NOT_TESTED',
  hostResultIdentityAndSha:'NOT_TESTED',desktopHttp:'NOT_TESTED',ai:'NOT_TESTED'};
const sourcePaths=[
  'src/platform/chrome/network.js','src/framework/sdk/registry.js',
  'src/framework/utils/network-info.js','src/platform/protocol.js','src/platform/schema.js',
  'examples/sidebar-tools/scrapyjs/adapters/static-http-trial.mjs',
  'examples/sidebar-tools/scrapyjs/contracts/execution-v1.mjs',
  'examples/sidebar-tools/scrapyjs/fixtures/http-header-probe.mjs'
];
const sources=new Map(await Promise.all(sourcePaths.map(async name=>['/'+name,await readFile(join(root,name))])));
report.sources=Object.fromEntries([...sources].map(([name,bytes])=>[name,{sha256:sha(bytes),bytes:bytes.length}]));
const seen=[],bodies=[],wire=[];
const held=new Map(),streams=[];
let slowClosed=false,slowFinished=false,slowTimer;
const server=createServer((req,res)=>{
  res.setHeader('cache-control','no-store');
  if(req.url==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><title>ScrapyJS loopback Header diagnostic</title>');}
  if(sources.has(req.url)){res.setHeader('content-type','text/javascript');return res.end(sources.get(req.url));}
  seen.push({url:req.url,method:req.method,headers:req.headers,rawHeaders:req.rawHeaders,
    remoteAddress:req.socket.remoteAddress,localAddress:req.socket.localAddress});
  const target=new URL(req.url,'http://fixture.invalid');
  if(/^\/transition\/(page|hold|slow)\/[123]$/.test(target.pathname)){
    const runId=target.searchParams.get('runId'),request=Number(target.searchParams.get('request'));
    const observation=seen.at(-1);
    Object.assign(observation,{runId,request});
    const finish=()=>{
      const id=target.pathname.at(-1),titles=['第一项','第二项','第三项'];
      const body='<article data-id="'+id+'"><h2>'+titles[Number(id)-1]+'</h2></article>';
      bodies.push({runId,request,url:req.url,body,sha256:sha(body)});
      res.setHeader('content-type','text/html; charset=utf-8');res.end(body);
    };
    if(target.pathname.includes('/hold/')){
      held.set(runId,finish);res.once('close',()=>held.delete(runId));return;
    }
    if(target.pathname.includes('/slow/')){
      const stream={runId,request,finished:false,closed:false};streams.push(stream);
      res.setHeader('content-type','text/html');res.write('<article>pending');
      const timer=setTimeout(()=>{stream.finished=true;res.end('</article>');},10000);
      res.once('close',()=>{stream.closed=true;clearTimeout(timer);});return;
    }
    return finish();
  }
  if(/^\/page\/[123]$/.test(req.url)){
    if(req.headers.accept!=='text/html'||req.headers['x-client-tag']!=='scrapyjs-local-header-proof'){
      res.writeHead(406);return res.end('Fixture requires reviewed safe headers');
    }
    const id=req.url.at(-1),titles=['第一项','第二项','第三项'];
    const body='<article data-id="'+id+'"><h2>'+titles[Number(id)-1]+'</h2></article>';
    bodies.push({url:req.url,body,sha256:sha(body)});
    res.setHeader('content-type','text/html; charset=utf-8');return res.end(body);
  }
  if(req.url==='/agent'){
    res.setHeader('content-type','application/json');
    return res.end(JSON.stringify({userAgent:req.headers['user-agent']}));
  }
  if(req.url==='/slow'){
    res.setHeader('content-type','text/plain');res.write('first chunk');
    res.once('close',()=>{slowClosed=true;clearTimeout(slowTimer);});
    slowTimer=setTimeout(()=>{slowFinished=true;res.end('last chunk');},10000);return;
  }
  res.writeHead(404);res.end();
});
let browser;
try{
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const origin='http://127.0.0.1:'+server.address().port;
  report.fixtureOrigin=origin;
  const seedBytes=await readFile(seedPath),seed=JSON.parse(seedBytes);
  assert.equal(seed.ownedBrowserReleased,true,'Only a previously closed task-owned Profile');
  report.seed={path:seedPath,sha256:sha(seedBytes)};
  const owned=seed.browser;
  browser=await launchOwned({root,out,binary:owned.binary,extension:owned.loadedExtension||owned.snapshot,
    seedProfile:owned.profile});
  report.browser=browser.metadata;report.chrome=await browser.call('Browser.getVersion');
  // Inspect the original installed entry, without running a Task, changing config or sending AI.
  const view=await openNativePanel(browser,origin+'/');
  report.extensionId=view.extensionId;
  await click(view.panel,'#tab-tools');
  await click(view.panel,'button[data-extension-key="app:scrapyjs"][data-extension-action="main"]');
  const target=await until(async()=> (await browser.call('Target.getTargets')).targetInfos.find(t=>
    t.type==='iframe'&&t.url.startsWith('chrome-extension://'+view.extensionId+'/')&&t.url.includes('/sidebar-tools/sandbox.html')),'original installed App');
  const app=await browser.attach(target.targetId);
  await until(()=>app.read('!!document.querySelector("#start")'),'original App ready');
  report.originalEntry=await app.read(`({origin,hasDomStart:!!document.querySelector('#start'),
    runnableHttpButtons:[...document.querySelectorAll('button')].filter(b=>!b.disabled&&/HTTP.*(?:试采|运行)|(?:试采|运行).*HTTP/i.test(b.textContent)).map(b=>b.textContent),
    title:document.title})`);
  assert.equal(report.originalEntry.origin,'null');
  assert.deepEqual(report.originalEntry.runnableHttpButtons,[]);
  report.originalEntry.installedHttp='BLOCKED_NO_APP_HTTP_ENTRY';
  if(scenario==='transitions'){
    const packageBytes=await readFile(join(root,'examples/sidebar-tools/scrapyjs/scrapyjs.opendesk-tool.json'));
    const formal=JSON.parse(packageBytes);
    const installed=await view.panel.read(`chrome.storage.local.get('opendesk.sidebar-tools.installed.v1')
      .then(row=>row['opendesk.sidebar-tools.installed.v1'].find(tool=>tool.id==='scrapyjs'))`);
    for(const key of Object.keys(formal))assert.deepEqual(installed[key],formal[key],'Installed package field '+key);
    report.originalEntry.identityReadback={id:installed.id,version:installed.version,
      capabilities:installed.capabilities,delegatedTasks:installed.delegatedTasks,
      matchedFormalPackageFields:true,formalFileSha256:sha(packageBytes)};
  }
  // This separate page runs only the fixed, local diagnostic module.
  const page=view.target;
  await page.call('Network.enable');
  await page.call('Network.setCacheDisabled',{cacheDisabled:true});
  const modulePath='/examples/sidebar-tools/scrapyjs/fixtures/http-header-probe.mjs';
  if(scenario==='transitions'){
    report.transitions=await checkHeaderTransitions({page,browser,modulePath,seen,streams,
      release:runId=>{assert(held.has(runId),'Expected held response');held.get(runId)();held.delete(runId);}});
    report.status='PASS_CHROMIUM_HEADER_TRANSITIONS_DIAGNOSTIC_ONLY';
  }else{
  report.collection=await page.read(`import(${JSON.stringify(modulePath)}).then(m=>m.collect())`);
  const expected=[{title:'第一项',id:'1'},{title:'第二项',id:'2'},{title:'第三项',id:'3'}];
  assert.deepEqual(report.collection.records,expected,'Independent expected records from three actual HTTP bodies');
  assert.equal(report.collection.pages.length,3);
  assert(report.collection.pages.every(p=>p.status===200&&p.bytes<=8192));
  const pageRequests=seen.filter(r=>r.url.startsWith('/page/'));
  assert.deepEqual(pageRequests.map(r=>r.url),['/page/1','/page/2','/page/3']);
  assert.equal(report.collection.submitted.length,3);
  for(const row of report.collection.submitted){
    assert.deepEqual(row.headers,{accept:'text/html','x-client-tag':'scrapyjs-local-header-proof'});
    assert.equal(row.credentials,'omit');assert.equal(row.redirect,'manual');
  }
  for(const row of pageRequests){
    assert.equal(row.headers.accept,'text/html');assert.equal(row.headers['x-client-tag'],'scrapyjs-local-header-proof');
    assert.equal(row.headers.cookie,undefined);assert.equal(row.headers.authorization,undefined);
  }
  const recordsPath=join(out,'records.json'),serialized=JSON.stringify(report.collection.records);
  await writeFile(recordsPath,serialized,{flag:'wx'});
  const reread=await readFile(recordsPath);
  assert.deepEqual(JSON.parse(reread),expected);assert.equal(sha(reread),sha(serialized));
  report.fileReadback={path:recordsPath,sha256:sha(reread),bytes:reread.length,
    scope:'NODE_FIXTURE_FILE_ONLY_NOT_HOST_PERSISTENCE'};
  report.managedHeaders=await page.read(`import(${JSON.stringify(modulePath)}).then(m=>m.probeManagedAndForbidden())`);
  assert(report.managedHeaders.rejected.every(r=>r.error==='E_CONFIG_UNSUPPORTED'));
  assert.equal(report.managedHeaders.rejection,'E_CONFIG_UNSUPPORTED');
  assert.equal(report.managedHeaders.submitted.length,0,'Managed and forbidden headers never dispatch');
  assert.equal(seen.filter(r=>r.url==='/agent').length,0);
  assert.equal(report.managedHeaders.serverEcho,null);
  await page.read(`import(${JSON.stringify(modulePath)}).then(m=>{m.startSlow();return true;})`);
  await until(()=>seen.some(r=>r.url==='/slow'),'actual streaming HTTP request before Stop');
  report.transportStop=await page.read('globalThis.httpHeaderStop()');
  assert.equal(report.transportStop.error,'E_CANCELLED');
  await until(()=>slowClosed,'server observes aborted connection');
  assert.equal(slowFinished,false,'Abort before the streaming response finishes');
  report.transportStop.serverClosedBeforeEnd=true;
  report.transportStop.scope='FETCH_ABORT_ONLY_NOT_INSTALLED_OPERATION_RETIREMENT';
  for(const e of browser.events)if(e.sessionId===page.sessionId&&
    e.method==='Network.requestWillBeSentExtraInfo')wire.push(e.params);
  report.wireEvidence={kind:'CDP_REQUEST_EXTRA_INFO_OBSERVATION',entries:wire};
  assert(wire.some(e=>Object.entries(e.headers).some(([k,v])=>k.toLowerCase()==='x-client-tag'&&v==='scrapyjs-local-header-proof')));
  report.status='PASS_CHROMIUM_HEADER_TRANSPORT_FIXTURE_ONLY';
  }
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  if(browser)try{await browser.close();report.ownedBrowserReleased=true;}
  catch(error){report.cleanupError=error.message;report.status='FAIL_CLEANUP';process.exitCode=1;}
  clearTimeout(slowTimer);
  server.closeAllConnections();await new Promise(ok=>server.close(ok));report.fixtureServerClosed=true;
  report.serverObserved=seen;report.servedBodies=bodies;
  if(report.transitions)try{report.transitions.finalServerAudit=checkFinalTransitionRequests(report.transitions,seen);}
  catch(error){report.status='FAIL_FINAL_SERVER_AUDIT';report.finalAuditError=error.message;process.exitCode=1;}
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,out,error:report.error?.message,
    configuredUserAgentObserved:report.managedHeaders?.configuredEqualsServerObserved}));
}
