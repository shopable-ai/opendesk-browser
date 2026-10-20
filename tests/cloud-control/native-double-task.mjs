// Actual Chrome/Provider acceptance. Smoke requires one independently verified,
// installed and Cloud-approved immutable Task; full E2E requires two.
// Neither mode forges a Host or Run.
// Chrome changes the original webpage; a passive observer records its DOM
// before the existing Controller closes the owned tab during retirement.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {connect,evaluate} from '../framework/sidebar-native-session.mjs';
import {createNativeContextReader} from './native-context-reader.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';

const FIXTURE_URL='http://127.0.0.1:43111/demo-form.html';
const DEFAULT_NATIVE_PHASE={'--smoke-preflight':'01-single-preflight','--smoke':'02-single-smoke',
  '--preflight':'03-double-preflight'}[process.argv[2]]||'04-double-e2e';
const OUT=path.resolve(process.env.OPENDESK_CLOUD_NATIVE_EVIDENCE||
  path.join('artifacts/cloud-double-task-e2e',DEFAULT_NATIVE_PHASE,
    new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)));
const readNativeContexts=createNativeContextReader(evaluate);
async function until(fn,what,ms=90000){
  const end=Date.now()+ms;
  while(Date.now()<end){const value=await fn();if(value)return value;await sleep(250);}
  throw Error('Not observed: '+what);
}
async function privateFile(name){
  const file=process.env[name];
  assert(file,'Missing '+name);
  const entry=await stat(file);
  assert(entry.isFile()&&(entry.mode&0o077)===0,'Credential must be a private file: '+name);
  return (await readFile(file,'utf8')).trim();
}
async function post(base,route,credential,body={}){
  const response=await fetch(base+route,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify(body)});
  const value=await response.json();
  if(!response.ok)throw Error('Provider '+route+': '+(value.error?.code||response.status));
  return value;
}
async function task(filename){
  const pkg=await verifyTaskPackage(JSON.parse(await readFile(filename,'utf8')));
  assert.deepEqual(pkg.manifest.siteOrigins,['http://127.0.0.1:43111']);
  return {taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
}
async function fixture(effects){
  const original=await readFile('examples/tasks/demo-form.html','utf8');
  assert(original.includes('</body>'));
  // Passive, readonly document observation. No test-controlled fill, click,
  // document replacement, DOM write or Provider-emulated result.
  const audit='<script>(()=>{let a=false,b=false;function observe(){'+
    'let d=document.querySelector("#done");'+
    'if(d&&!a){a=true;navigator.sendBeacon("/__opendesk_cloud_proof",JSON.stringify({type:"form",url:location.href,'+
      'name:document.querySelector("#name")?.value,done:d.textContent}));}'+
    'let r=document.querySelector("#results"),s=document.querySelector("#search-status");'+
    'if(r?.textContent?.startsWith("结果：")&&s?.textContent==="搜索完成"&&!b){'+
      'b=true;navigator.sendBeacon("/__opendesk_cloud_proof",JSON.stringify({type:"search",url:location.href,'+
      'keyword:document.querySelector("#keyword")?.value,result:r.textContent,'+
      'count:document.querySelector("#search-count")?.textContent}));}}'+
    'new MutationObserver(observe).observe(document,{subtree:true,childList:true,characterData:true});})();</script>';
  const html=original.replace('</body>',audit+'</body>');
  const server=createServer(async(req,res)=>{
    if(req.url==='/demo-form.html'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(html);return;
    }
    if(req.url==='/__opendesk_cloud_proof'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)break;}
      try{const row=JSON.parse(body);assert(row.url===FIXTURE_URL&&['form','search'].includes(row.type));
        effects.push({at:new Date().toISOString(),...row});res.writeHead(204);res.end();}
      catch{res.writeHead(400);res.end();}
      return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(43111,'127.0.0.1',resolve);});
  return {sha256:createHash('sha256').update(original).digest('hex'),
    close:()=>new Promise(resolve=>server.close(resolve))};
}
async function snapshot(c,jobIds=[],assets=[]){
  const targets=(await c.send('Target.getTargets')).targetInfos;
  const runners=targets.filter(t=>['page','other'].includes(t.type)&&
    /^chrome-extension:\/\/[a-p]{32}\/cloud-control\/runner\.html$/.test(t.url));
  const workers=targets.filter(t=>t.type==='service_worker'&&
    /^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(t.url));
  assert(runners.length<=1&&workers.length<=1&&runners.length+workers.length>0,
    'Cannot uniquely identify an actual OpenDesk Offscreen/Service Worker context');
  // Read the original DB and build bytes from the living Offscreen document,
  // even when MV3 allows the Service Worker to sleep. The real Side Panel
  // separately attests runtime context identities before it is closed.
  const inspected=runners[0]||workers[0];
  const extensionId=new URL(inspected.url).host;
  assert([...runners,...workers].every(t=>new URL(t.url).host===extensionId),
    'Multiple extension identities found; refusing cross-extension inspection');
  const {sessionId}=await c.send('Target.attachToTarget',{targetId:inspected.targetId,flatten:true});
  let inspectedRows;
  try{
    await c.send('Runtime.enable',{},sessionId);
    // Chrome's original IndexedDB, native readonly transactions. Filter
    // by Provider jobId before copying anything into the test process.
    const expression='(async()=>{const wanted='+JSON.stringify(jobIds)+';'+
      'const assetPaths='+JSON.stringify(assets)+';'+
      'const buildAssets=await Promise.all(assetPaths.map(async p=>{const r=await fetch(chrome.runtime.getURL(p),{cache:"no-store"});if(!r.ok)throw Error("Chrome build asset unavailable: "+p);const bytes=await r.arrayBuffer();const hash=await crypto.subtle.digest("SHA-256",bytes);return {path:p,sha256:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("")}}));'+
      'if(!(await indexedDB.databases()).some(d=>d.name==="opendesk-browser"))throw Error("Original DB missing");'+
      'const db=await new Promise((ok,no)=>{const q=indexedDB.open("opendesk-browser");q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});'+
      'try{const names=["frameworkKV","runs","results","commandJournal"],tx=db.transaction(names,"readonly");'+
      'const get=n=>new Promise((ok,no)=>{const q=tx.objectStore(n).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});'+
      'const [kv,allRuns,allResults,journal]=await Promise.all(names.map(get));'+
      'const config=kv.find(x=>x?.providerId&&Array.isArray(x.tasks));'+
      'const rows=kv.filter(x=>x?.tag==="cloud-request-v1"&&wanted.includes(x.assignment?.jobId));'+
      'const runIds=rows.map(x=>x.runId);'+
      'const runs=allRuns.filter(x=>x?.tag==="controller-run"&&runIds.includes(x.runId));'+
      'return {assets:buildAssets,'+
      'cloud:{providerId:config?.providerId,executorId:config?.executorId,grantId:config?.grantId,'+
        'enabled:config?.enabled===true,approved:(config?.tasks||[]).map(x=>({taskId:x.taskId,'+
        'version:x.version,manifestHash:x.manifestHash,sourceHash:x.contentHash,resultAllowed:x.resultAllowed,'+
        'installationId:x.installationId,generation:x.generation}))},'+
      'installed:kv.filter(x=>x?.tag==="task-installed-v1").map(x=>({taskId:x.taskId,version:x.version,'+
        'manifestHash:x.manifestHash,enabled:x.enabled,installationId:x.authorization?.installationId,'+
        'generation:x.authorization?.generation})),'+
      'available:kv.filter(x=>x?.tag==="task-candidate-v1"&&x.stage==="available").map(x=>({'+
        'taskId:x.package?.manifest?.taskId,version:x.package?.manifest?.version,'+
        'manifestHash:x.package?.manifestHash,sourceHash:x.verification?.sourceHash,'+
        'nativeReceiptCount:x.verification?.nativeReceiptCount})),'+
      'requests:rows.map(x=>({jobId:x.assignment?.jobId,assignmentId:x.assignment?.assignmentId,'+
        'requestId:x.requestId,runRef:x.runRef,receiptId:x.receipt?.receiptId,receiptDigest:x.receipt?.digest,'+
        'delivery:x.delivery?.state})),'+
      'runs:runs.map(x=>({runId:x.runId,resultId:x.resultId,cloudRequestId:x.cloudRequestId,'+
        'state:x.state,retirement:x.retirementState,sourceHash:x.revision?.sourceHash})),'+
      'results:allResults.filter(x=>x?.tag==="controller-result"&&runIds.includes(x.runId)).map(x=>({'+
        'runId:x.runId,resultId:x.resultId,state:x.state,ok:x.outcome?.ok===true,'+
        'sourceHash:x.revision?.sourceHash,valueWire:x.outcome?.valueWire})),'+
      'hosts:journal.filter(x=>x?.tag==="host"&&x.active===true&&!x.revoked&&'+
        'x.hostUrl===chrome.runtime.getURL("cloud-control/runner.html")).map(x=>({'+
        'documentId:x.hostDocumentId,registrationId:x.registrationId})),'+
      'native:journal.filter(x=>x?.tag==="controller-operation"&&runIds.includes(x.runId)).map(x=>({'+
        'runId:x.runId,receipts:(x.nativeReceipts||[]).filter(y=>y.stage==="result").length}))};'+
      '}finally{db.close()}})()';
    inspectedRows=await evaluate(c,expression,sessionId);
  }finally{await c.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
  const contextEvidence=await readNativeContexts(c,targets,extensionId);
  return {extensionId,...inspectedRows,contexts:contextEvidence.contexts,
    contextProof:contextEvidence.proof};
}
function nativeContexts(info){
  const origin='chrome-extension://'+info.extensionId+'/';
  return {offscreen:info.contexts.filter(x=>x.type==='OFFSCREEN_DOCUMENT'&&x.url===origin+'cloud-control/runner.html'),
    panel:info.contexts.filter(x=>x.type==='SIDE_PANEL'&&x.url?.startsWith(origin+'sidepanel.html'))};
}
async function panelReadiness(c,info){
  const panels=nativeContexts(info).panel;
  assert.equal(panels.length,1,'Side Panel must be open for a read-only permission check');
  const targets=(await c.send('Target.getTargets')).targetInfos.filter(t=>
    ['page','other'].includes(t.type)&&panels.some(p=>p.url===t.url));
  assert.equal(targets.length,1,'Real Side Panel CDP context missing for permission inspection');
  const {sessionId}=await c.send('Target.attachToTarget',
    {targetId:targets[0].targetId,flatten:true});
  try{
    await c.send('Runtime.enable',{},sessionId);
    // chrome.permissions and chrome.userScripts are unavailable in Offscreen
    // documents (which support chrome.runtime only). Inspect the existing,
    // user-opened Side Panel, with no preference changes or Task execution.
    return await evaluate(c,`(async()=>{
      const sitePermissionGranted=await chrome.permissions.contains({
        origins:["http://127.0.0.1:43111/*"]});
      let userScriptsAvailable=false;
      try{
        if(typeof chrome.userScripts?.getScripts==="function"){
          await chrome.userScripts.getScripts();
          userScriptsAvailable=true;
        }
      }catch{}
      return {sitePermissionGranted,userScriptsAvailable};
    })()`,sessionId);
  }finally{await c.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
}
async function closePanel(c,initial){
  const before=nativeContexts(initial);
  assert.equal(before.offscreen.length,1,'Real Offscreen must exist');
  assert.equal(before.panel.length,1,'Real Side Panel must be open before close');
  const targets=(await c.send('Target.getTargets')).targetInfos;
  const panelTargets=targets.filter(t=>t.url===before.panel[0].url&&['page','other'].includes(t.type));
  assert.equal(panelTargets.length,1,'Actual Side Panel CDP target missing');
  assert.equal((await c.send('Target.closeTarget',{targetId:panelTargets[0].targetId})).success,true);
  return until(async()=>{
    const now=await snapshot(c),contexts=nativeContexts(now);
    return contexts.panel.length===0&&contexts.offscreen.length===1&&
      now.hosts?.filter(x=>x.documentId===contexts.offscreen[0].documentId).length===1?now:null;
  },'Side Panel closed, Offscreen still alive',10000);
}
function matchEvidence(native,job,status,pin,kind,expected,effects){
  assert.deepEqual(job.task,pin,'Provider immutable Task pin differs from installed source');
  const ref=job.runRef;
  assert(ref&&ref.requestId==='cloud:'+job.assignment?.assignmentId,'Actual Provider RunRef missing');
  const request=native.requests.find(x=>x.jobId===job.jobId);
  assert(request,'Durable Browser Cloud request missing');
  assert.equal(request.assignmentId,job.assignment.assignmentId);
  assert.deepEqual(request.runRef,ref);
  const run=native.runs.find(x=>x.runId===ref.runId);
  const result=native.results.find(x=>x.resultId===ref.resultId);
  assert(run&&result,'Original persistent Controller Run/Result missing');
  assert.equal(run.cloudRequestId,ref.requestId);
  assert.equal(run.resultId,result.resultId);
  assert.equal(run.retirement,'released');
  assert.equal(run.state,'completed');
  assert.equal(result.state,'completed');
  assert.equal(result.ok,true);
  assert.equal(run.sourceHash,pin.sourceHash);
  assert.equal(result.sourceHash,pin.sourceHash);
  assert.equal(ref.manifestHash,pin.manifestHash);
  assert.equal(request.receiptId,job.receipt?.receiptId);
  assert.equal(request.receiptDigest,job.receipt?.digest);
  assert.equal(request.delivery,'confirmed');
  assert.equal(status.receiptConfirmed,true);
  assert.deepEqual(status.trace,{
    requestId:ref.requestId,runId:ref.runId,resultId:ref.resultId,
    receiptId:job.receipt?.receiptId,receiptDigest:job.receipt?.digest
  },'External client must receive original Run/Result/Provider receipt IDs');
  assert.equal(status.state,'completed');
  assert.equal(status.result?.state,'completed','External client must have full result consent');
  const actual=decodeValue(result.valueWire);
  assert.deepEqual(decodeValue(status.result.valueWire),actual);
  assert(native.native.some(x=>x.runId===run.runId&&x.receipts>0),'Native Controller operation receipt missing');
  const witnesses=effects.filter(x=>x.type===kind&&x[kind==='form'?'name':'keyword']===expected);
  assert.equal(witnesses.length,1,'Exactly one Chrome DOM effect witness required');
  if(kind==='form'){
    assert.equal(witnesses[0].done,'已提交：'+expected);
    assert.deepEqual(actual,{ok:true,url:FIXTURE_URL});
  }else{
    assert.equal(witnesses[0].result,'结果：'+expected);
    assert.equal(witnesses[0].count,'提交次数：1');
    assert.deepEqual(actual,{result:witnesses[0].result});
  }
  return {taskId:pin.taskId,version:pin.version,jobId:job.jobId,
    requestId:ref.requestId,runId:run.runId,resultId:result.resultId,
    receiptId:request.receiptId,sourceHash:pin.sourceHash,manifestHash:pin.manifestHash,
    pageEffect:kind,originalResultConfirmed:true};
}
async function main(){
  const mode=process.argv[2]??null;
  const preflightOnly=mode==='--preflight'||mode==='--smoke-preflight';
  const smokeOnly=mode==='--smoke'||mode==='--smoke-preflight';
  assert(mode===null||preflightOnly||smokeOnly,
    'Only --preflight, --smoke-preflight and --smoke are supported');
  const report={status:'RUNNING',stage:'config',startedAt:new Date().toISOString(),
    gitSha:process.env.GITHUB_SHA||null,evidenceDirectory:OUT,
    mode:DEFAULT_NATIVE_PHASE,steps:[]},effects=[];
  let c,server,evidenceWritable=true;
  const reportFile=path.join(OUT,'native-double-task-report.json');
  // Hard wall-clock stop for this owned Node verifier only. No Chrome,
  // Provider, profile, or unrelated process is terminated by this watchdog.
  const wallClockMs=preflightOnly?60000:smokeOnly?300000:540000;
  const watchdog=setTimeout(()=>{
    report.status='BLOCKED';
    report.error={code:'E_NATIVE_WALL_CLOCK',stage:report.stage,
      message:'Native verifier exceeded its wall-clock budget without proven completion'};
    report.completedAt=new Date().toISOString();
    report.nativeEvidence=effects;
    console.error('NATIVE_VERIFIER_TIMEOUT '+JSON.stringify(report.error));
    void writeFile(reportFile,JSON.stringify(report,null,2)+'\n',
      {flag:'wx'}).finally(()=>process.exit(124));
  },wallClockMs);
  await mkdir(OUT,{recursive:true});
  try{
    // Reusing an evidence directory must fail BEFORE any external submission.
    try{
      await stat(reportFile);
      evidenceWritable=false;
      throw Object.assign(Error('Evidence report exists; use a fresh phase directory: '+reportFile),
        {code:'E_EVIDENCE_EXISTS'});
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const [nodeMajor,nodeMinor]=process.versions.node.split('.').map(Number);
    assert(nodeMajor>22||(nodeMajor===22&&nodeMinor>=12),
      'Node >=22.12.0 is required before native verification');
    const cdp=new URL(process.env.OPENDESK_CLOUD_NATIVE_CDP);
    assert(cdp.protocol==='ws:'&&cdp.hostname==='127.0.0.1'&&
      cdp.pathname.startsWith('/devtools/browser/')&&!cdp.username&&!cdp.password,'Explicit local Chrome browser CDP required');
    const provider=new URL(process.env.OPENDESK_CLOUD_NATIVE_HTTPS);
    assert(provider.protocol==='https:'&&provider.pathname==='/'&&
      !provider.username&&!provider.password&&!provider.search&&!provider.hash,'Real HTTPS Provider required');
    const token=await privateFile('OPENDESK_CLOUD_NATIVE_TOKEN_FILE');
    assert(/^[a-f0-9]{64}$/.test(token));
    const admin=JSON.parse(await privateFile('OPENDESK_CLOUD_NATIVE_ADMIN_FILE')).adminToken;
    assert(/^[a-f0-9]{64}$/.test(admin));
    const adminPort=Number(process.env.OPENDESK_CLOUD_NATIVE_ADMIN_PORT||43112);
    assert(Number.isInteger(adminPort)&&adminPort>0&&adminPort<=65535);
    const adminURL='http://127.0.0.1:'+adminPort+'/';
    const tasks=[await task('examples/tasks/form-fill.v1.opendesk-task.json')];
    if(!smokeOnly){
      tasks.push(await task('examples/tasks/modern-search.v1.opendesk-task.json'));
      assert.notEqual(tasks[0].taskId,tasks[1].taskId);
    }
    // All reads below are side-effect free: never submit a Provider Job,
    // claim a Task, alter Chrome preferences, or create an Offscreen document.
    report.stage='chrome';
    const buildDir=process.env.OPENDESK_CLOUD_NATIVE_BUILD_DIR;
    assert(buildDir&&path.isAbsolute(buildDir),
      'OPENDESK_CLOUD_NATIVE_BUILD_DIR must name the absolute verified Chrome extension build');
    const assetNames=['manifest.json','sw.js','cloud-control/runner.html'];
    c=await connect(cdp.href);
    report.chrome=await c.send('Browser.getVersion');
    let before=await until(async()=>{
      const native=await snapshot(c);
      return nativeContexts(native).offscreen.length===1?native:null;
    },'Native Offscreen startup',15000);
    report.extensionId=before.extensionId;
    assert.equal(before.cloud.enabled,true,'Cloud not approved/enabled');
    assert.equal(nativeContexts(before).offscreen.length,1,'Offscreen not present');
    if(nativeContexts(before).panel.length!==1)throw Object.assign(
      Error('Real Side Panel must be opened by the user before native acceptance'),
      {code:'HUMAN_ACTION_REQUIRED'});
    before=await until(async()=>{
      const state=await snapshot(c);
      const offscreen=nativeContexts(state).offscreen;
      return offscreen.length===1&&
        state.hosts?.filter(x=>x.documentId===offscreen[0].documentId).length===1?state:null;
    },'Original Offscreen RunHost registered and alive',5000);
    before=await snapshot(c,[],assetNames);
    assert.equal(before.hosts.filter(x=>
      x.documentId===nativeContexts(before).offscreen[0].documentId).length,1,
      'Offscreen context exists but original RunHost registration is not active');
    for(const asset of before.assets){
      const localHash=createHash('sha256').update(await readFile(path.join(buildDir,asset.path))).digest('hex');
      assert.equal(asset.sha256,localHash,'Loaded Chrome asset differs from verified build: '+asset.path);
    }
    const permissions=await panelReadiness(c,before);
    if(permissions.sitePermissionGranted!==true)throw Object.assign(
      Error('Chrome site permission is not granted for the 43111 test origin'),
      {code:'HUMAN_ACTION_REQUIRED'});
    if(permissions.userScriptsAvailable!==true)throw Object.assign(
      Error('Chrome Allow User Scripts is not enabled on the extension details page'),
      {code:'HUMAN_ACTION_REQUIRED'});
    report.stage='provider';
    const [registered,providerState,clientScope]=await Promise.all([
      post(adminURL,'admin/tasks',admin),
      post(adminURL,'admin/state',admin),
      post(provider.href,'v1/client-scope',token)
    ]);
    assert.equal(before.cloud.providerId,providerState.providerId,'Browser paired with another Provider');
    assert.equal(clientScope.providerId,providerState.providerId,'External token belongs to another Provider');
    assert.equal(clientScope.executorId,before.cloud.executorId,'External token belongs to another Executor');
    assert.equal(clientScope.grantId,before.cloud.grantId,'External token belongs to an older Cloud grant');
    assert.equal(clientScope.allowResult,true,'External client has no full result read consent');
    if(smokeOnly){
      assert(clientScope.tasks.some(candidate=>Object.entries(tasks[0]).every(
        ([key,value])=>candidate[key]===value)),
      'External client lacks the fixed Smoke Task pin');
    }else{
      assert.deepEqual([...clientScope.tasks].sort((a,b)=>a.taskId.localeCompare(b.taskId)),
        [...tasks].sort((a,b)=>a.taskId.localeCompare(b.taskId)),
        'External client lacks the two exact immutable Task pins');
    }
    const executor=providerState.executors[clientScope.executorId];
    assert.equal(executor?.connected,true,'Provider has no connected browser Executor');
    for(const pin of tasks){
      const installed=before.installed.find(x=>x.enabled&&x.taskId===pin.taskId&&
        x.version===pin.version&&x.manifestHash===pin.manifestHash&&
        x.installationId&&Number.isSafeInteger(x.generation)&&x.generation>0);
      if(!installed)throw Object.assign(Error('Task not installed/enabled: '+pin.taskId),
        {code:'HUMAN_ACTION_REQUIRED'});
      assert(before.available.some(x=>x.taskId===pin.taskId&&x.version===pin.version&&
        x.manifestHash===pin.manifestHash&&x.sourceHash===pin.sourceHash&&
        x.nativeReceiptCount>0),'Task lacks native Controller verification: '+pin.taskId);
      if(!before.cloud.approved.some(x=>x.taskId===pin.taskId&&x.version===pin.version&&
        x.manifestHash===pin.manifestHash&&x.sourceHash===pin.sourceHash&&
        x.installationId===installed.installationId&&x.generation===installed.generation&&
        x.resultAllowed===true))throw Object.assign(
          Error('Task has no matching Cloud approval and result consent: '+pin.taskId),
          {code:'HUMAN_ACTION_REQUIRED'});
      assert(registered.tasks.some(x=>x.taskId===pin.taskId&&x.version===pin.version&&
        x.manifestHash===pin.manifestHash&&x.sourceHash===pin.sourceHash),
        'Provider has not registered immutable Task: '+pin.taskId);
      assert(executor.capabilities?.some(x=>x.taskId===pin.taskId&&
        x.manifestHash===pin.manifestHash&&x.sourceHash===pin.sourceHash),
        'Provider Executor has not advertised immutable Task: '+pin.taskId);
    }
    // The fixture port must be free BEFORE starting a potentially lengthy Run.
    report.stage='fixture-port';
    const probe=createServer();
    try{
      await new Promise((ok,no)=>{probe.once('error',no);probe.listen(43111,'127.0.0.1',ok);});
    }finally{if(probe.listening)await new Promise(ok=>probe.close(ok));}
    report.steps.push({stage:'preflight',installed:tasks.length,cloudApproved:tasks.length,
      providerRegistered:tasks.length,clientTaskPins:tasks.length,
      clientResultConsent:true,providerConnected:true,
      sitePermissionGranted:true,userScriptsAvailable:true,verifiedChromeAssets:assetNames,
      sidePanelOpen:true,offscreenPresent:true,originalHostRegistered:true,
      contextProof:before.contextProof});
    if(preflightOnly){
      const ready=smokeOnly?'READY_FOR_SMOKE':'READY_FOR_NATIVE_TEST';
      report.status=ready;
      console.log(ready+' '+JSON.stringify({extensionId:before.extensionId,
        taskIds:tasks.map(x=>x.taskId),browser:report.chrome.product,
        buildAssetsVerified:assetNames.length,fixturePortAvailable:true}));
      return;
    }
    report.stage='native-e2e';
    server=await fixture(effects);
    report.fixture={url:FIXTURE_URL,sha256:server.sha256,observer:'passive and read-only, native sendBeacon'};
    const jobIds=[];
    async function execute(pin,params,kind,value){
      const body={requestKey:randomUUID(),...pin,params,target:{mode:'owned',url:FIXTURE_URL}};
      const first=await post(provider.href,'v1/submit',token,body);
      assert(typeof first.jobId==='string'&&first.jobId,'Provider did not issue Job');
      const repeated=await post(provider.href,'v1/submit',token,body);
      assert.equal(repeated.jobId,first.jobId,'Idempotent request produced second Job');
      jobIds.push(first.jobId);
      const status=await until(async()=>{
        const answer=await post(provider.href,'v1/job-status',token,{jobId:first.jobId});
        assert(!['failed','stopped','cancelled','OUTCOME_UNKNOWN','expired_before_admission'].includes(answer.state),
          'Provider terminal failure '+kind+': '+answer.state);
        return answer.state==='completed'&&answer.receiptConfirmed?answer:null;
      },'Provider completed receipt '+kind);
      const state=await post(adminURL,'admin/state',admin);
      const job=state.jobs[first.jobId];
      assert(job?.receipt,'No authentic persisted Provider receipt');
      const native=await until(async()=>{
        const value=await snapshot(c,jobIds),row=value.requests.find(x=>x.jobId===first.jobId);
        return row?.delivery==='confirmed'&&row.receiptId?value:null;
      },'Browser original Run/Result/receipt '+kind);
      await until(()=>effects.some(x=>x.type===kind&&x[kind==='form'?'name':'keyword']===value),
        'Independent real Chrome DOM witness '+kind,8000);
      const proof=matchEvidence(native,job,status,pin,kind,value,effects);
      assert.equal(native.extensionId,report.extensionId);
      assert.equal((await post(provider.href,'v1/submit',token,body)).jobId,first.jobId,
        'Completed request retriggered a Job');
      await sleep(500);
      assert.equal(effects.filter(x=>x.type===kind&&x[kind==='form'?'name':'keyword']===value).length,1,
        'Repeated request caused new real page side effect');
      report.steps.push({stage:kind,...proof,sidePanelOpen:nativeContexts(native).panel.length===1});
      return proof;
    }
    const form='NativeForm-'+randomUUID().slice(0,10);
    const a=await execute(tasks[0],{name:form},'form',form);
    // Gate C checks one original Run/Result, Provider receipt and independent
    // DOM effect. Never close the panel or submit the second Job before it passes.
    if(smokeOnly){
      report.stage='complete';report.status='CLOUD_SINGLE_TASK_SMOKE_PASS';
      console.log('CLOUD_SINGLE_TASK_SMOKE_PASS '+JSON.stringify({
        chrome:report.chrome.product,extensionId:report.extensionId,
        taskId:a.taskId,jobId:a.jobId,runId:a.runId,resultId:a.resultId,
        receiptId:a.receiptId,pageEffect:a.pageEffect}));
      return;
    }
    before=await closePanel(c,await snapshot(c,jobIds));
    report.steps.push({stage:'closed-side-panel',offscreenPresent:nativeContexts(before).offscreen.length===1,
      sidePanelOpen:false,contextProof:before.contextProof});
    const keyword='NativeSearch-'+randomUUID().slice(0,10);
    const b=await execute(tasks[1],{keyword},'search',keyword);
    for(const property of ['taskId','jobId','requestId','runId','resultId','receiptId'])
      assert.notEqual(a[property],b[property],'Independent '+property+' required');
    assert.equal(nativeContexts(await snapshot(c,jobIds)).panel.length,0,
      'Second Job ran only while Side Panel was open');
    report.stage='complete';report.status='CLOUD_DOUBLE_TASK_E2E_PASS';
    console.log('CLOUD_DOUBLE_TASK_E2E_PASS '+JSON.stringify({chrome:report.chrome.product,
      extensionId:report.extensionId,taskIds:[a.taskId,b.taskId],
      jobIds:[a.jobId,b.jobId],receiptIds:[a.receiptId,b.receiptId],panelClosed:true}));
  }catch(error){
    report.status=preflightOnly&&error.code==='HUMAN_ACTION_REQUIRED'?
      'HUMAN_ACTION_REQUIRED':preflightOnly?'BLOCKED_ENV':'BLOCKED';
    report.error={code:error.code||'E_NATIVE_ACCEPTANCE',
      stage:report.stage,message:String(error.message)};
    process.exitCode=1;
    console.error((preflightOnly?'NATIVE_READINESS_BLOCKED ':'CLOUD_DOUBLE_TASK_E2E_BLOCKED ')+
      JSON.stringify(report.error));
  }finally{
    report.completedAt=new Date().toISOString();
    report.nativeEvidence=effects;
    c?.close();if(server)await server.close();
    try{
      if(evidenceWritable)await writeFile(reportFile,JSON.stringify(report,null,2)+'\n',
        {flag:'wx'});
    }finally{clearTimeout(watchdog);}
  }
}
await main();
