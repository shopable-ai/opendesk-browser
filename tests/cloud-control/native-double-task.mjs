// Actual Chrome/Provider acceptance. Requires two independently verified,
// installed and Cloud-approved immutable Tasks; never forges a Host or Run.
// Chrome changes the original webpage; a passive observer records its DOM
// before the existing Controller closes the owned tab during retirement.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {connect,evaluate} from '../framework/sidebar-native-session.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';

const FIXTURE_URL='http://127.0.0.1:43111/demo-form.html';
const OUT=path.resolve(process.env.OPENDESK_CLOUD_NATIVE_EVIDENCE||'artifacts/cloud-double-task-e2e');
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
async function snapshot(c,jobIds=[]){
  const targets=(await c.send('Target.getTargets')).targetInfos;
  const runners=targets.filter(t=>['page','other'].includes(t.type)&&
    /^chrome-extension:\/\/[a-p]{32}\/cloud-control\/runner\.html$/.test(t.url));
  const workers=targets.filter(t=>t.type==='service_worker'&&
    /^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(t.url));
  assert(runners.length<=1&&workers.length<=1&&runners.length+workers.length>0,
    'Cannot uniquely identify an actual OpenDesk Offscreen/Service Worker context');
  // Prefer the living Offscreen document itself: SW is allowed to sleep.
  // The fallback reads the SAME extension IndexedDB and native contexts.
  const inspected=runners[0]||workers[0];
  const extensionId=new URL(inspected.url).host;
  const {sessionId}=await c.send('Target.attachToTarget',{targetId:inspected.targetId,flatten:true});
  try{
    await c.send('Runtime.enable',{},sessionId);
    // Chrome's original IndexedDB, native readonly transactions. Filter
    // by Provider jobId before copying anything into the test process.
    const expression='(async()=>{const wanted='+JSON.stringify(jobIds)+';'+
      'if(!(await indexedDB.databases()).some(d=>d.name==="opendesk-browser"))throw Error("Original DB missing");'+
      'const db=await new Promise((ok,no)=>{const q=indexedDB.open("opendesk-browser");q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});'+
      'try{const names=["frameworkKV","runs","results","commandJournal"],tx=db.transaction(names,"readonly");'+
      'const get=n=>new Promise((ok,no)=>{const q=tx.objectStore(n).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});'+
      'const [kv,allRuns,allResults,journal]=await Promise.all(names.map(get));'+
      'const config=kv.find(x=>x?.providerId&&Array.isArray(x.tasks));'+
      'const rows=kv.filter(x=>x?.tag==="cloud-request-v1"&&wanted.includes(x.assignment?.jobId));'+
      'const runIds=rows.map(x=>x.runId);'+
      'const runs=allRuns.filter(x=>x?.tag==="controller-run"&&runIds.includes(x.runId));'+
      'return {contexts:(await chrome.runtime.getContexts({})).map(x=>({type:x.contextType,url:x.documentUrl,documentId:x.documentId})),'+
      'cloud:{enabled:config?.enabled===true,approved:(config?.tasks||[]).map(x=>({taskId:x.taskId,'+
        'version:x.version,manifestHash:x.manifestHash,sourceHash:x.contentHash,resultAllowed:x.resultAllowed}))},'+
      'installed:kv.filter(x=>x?.tag==="task-installed-v1").map(x=>({taskId:x.taskId,version:x.version,'+
        'manifestHash:x.manifestHash,enabled:x.enabled})),'+
      'requests:rows.map(x=>({jobId:x.assignment?.jobId,assignmentId:x.assignment?.assignmentId,'+
        'requestId:x.requestId,runRef:x.runRef,receiptId:x.receipt?.receiptId,receiptDigest:x.receipt?.digest,'+
        'delivery:x.delivery?.state})),'+
      'runs:runs.map(x=>({runId:x.runId,resultId:x.resultId,cloudRequestId:x.cloudRequestId,'+
        'state:x.state,retirement:x.retirementState,sourceHash:x.revision?.sourceHash})),'+
      'results:allResults.filter(x=>x?.tag==="controller-result"&&runIds.includes(x.runId)).map(x=>({'+
        'runId:x.runId,resultId:x.resultId,state:x.state,ok:x.outcome?.ok===true,'+
        'sourceHash:x.revision?.sourceHash,valueWire:x.outcome?.valueWire})),'+
      'native:journal.filter(x=>x?.tag==="controller-operation"&&runIds.includes(x.runId)).map(x=>({'+
        'runId:x.runId,receipts:(x.nativeReceipts||[]).filter(y=>y.stage==="result").length}))};'+
      '}finally{db.close()}})()';
    return {extensionId,...await evaluate(c,expression,sessionId)};
  }finally{await c.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
}
function nativeContexts(info){
  const origin='chrome-extension://'+info.extensionId+'/';
  return {offscreen:info.contexts.filter(x=>x.type==='OFFSCREEN_DOCUMENT'&&x.url===origin+'cloud-control/runner.html'),
    panel:info.contexts.filter(x=>x.type==='SIDE_PANEL'&&x.url?.startsWith(origin+'sidepanel.html'))};
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
    return contexts.panel.length===0&&contexts.offscreen.length===1?now:null;
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
  const report={status:'RUNNING',startedAt:new Date().toISOString(),
    gitSha:process.env.GITHUB_SHA||null,steps:[]},effects=[];
  let c,server;
  await mkdir(OUT,{recursive:true});
  try{
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
    const tasks=[
      await task('examples/tasks/form-fill.v1.opendesk-task.json'),
      await task('examples/tasks/modern-search.v1.opendesk-task.json')
    ];
    assert.notEqual(tasks[0].taskId,tasks[1].taskId);
    server=await fixture(effects);
    report.fixture={url:FIXTURE_URL,sha256:server.sha256,observer:'passive and read-only, native sendBeacon'};
    c=await connect(cdp.href);
    report.chrome=await c.send('Browser.getVersion');
    let before=await until(async()=>{
      const native=await snapshot(c);
      return nativeContexts(native).offscreen.length===1?native:null;
    },'Native Offscreen startup',15000);
    report.extensionId=before.extensionId;
    assert.equal(before.cloud.enabled,true,'Cloud not approved/enabled');
    assert.equal(nativeContexts(before).offscreen.length,1,'Offscreen not present');
    assert.equal(nativeContexts(before).panel.length,1,'Side Panel preflight missing');
    const registered=await post(adminURL,'admin/tasks',admin);
    for(const pin of tasks){
      assert(before.installed.some(x=>x.enabled&&x.taskId===pin.taskId&&
        x.version===pin.version&&x.manifestHash===pin.manifestHash),'Task is not installed: '+pin.taskId);
      assert(before.cloud.approved.some(x=>x.taskId===pin.taskId&&x.version===pin.version&&
        x.manifestHash===pin.manifestHash&&x.sourceHash===pin.sourceHash&&x.resultAllowed===true),
        'Task Cloud approval or output consent missing: '+pin.taskId);
      assert(registered.tasks.some(x=>x.taskId===pin.taskId&&x.version===pin.version&&
        x.manifestHash===pin.manifestHash&&x.sourceHash===pin.sourceHash),
        'Provider has not registered immutable Task: '+pin.taskId);
    }
    report.steps.push({stage:'preflight',installed:2,cloudApproved:2,providerRegistered:2,
      sidePanelOpen:true,offscreenPresent:true});
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
    before=await closePanel(c,await snapshot(c,jobIds));
    report.steps.push({stage:'closed-side-panel',offscreenPresent:nativeContexts(before).offscreen.length===1,
      sidePanelOpen:false});
    const keyword='NativeSearch-'+randomUUID().slice(0,10);
    const b=await execute(tasks[1],{keyword},'search',keyword);
    for(const property of ['taskId','jobId','requestId','runId','resultId','receiptId'])
      assert.notEqual(a[property],b[property],'Independent '+property+' required');
    assert.equal(nativeContexts(await snapshot(c,jobIds)).panel.length,0,
      'Second Job ran only while Side Panel was open');
    report.status='CLOUD_DOUBLE_TASK_E2E_PASS';
    console.log('CLOUD_DOUBLE_TASK_E2E_PASS '+JSON.stringify({chrome:report.chrome.product,
      extensionId:report.extensionId,taskIds:[a.taskId,b.taskId],
      jobIds:[a.jobId,b.jobId],receiptIds:[a.receiptId,b.receiptId],panelClosed:true}));
  }catch(error){
    report.status='BLOCKED';report.error={code:error.code||'E_NATIVE_ACCEPTANCE',message:String(error.message)};
    process.exitCode=1;
    console.error('CLOUD_DOUBLE_TASK_E2E_BLOCKED '+JSON.stringify(report.error));
  }finally{
    report.completedAt=new Date().toISOString();
    report.nativeEvidence=effects;
    c?.close();if(server)await server.close();
    await writeFile(path.join(OUT,'native-double-task-report.json'),JSON.stringify(report,null,2)+'\n');
  }
}
await main();
