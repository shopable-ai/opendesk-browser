// Observe Chrome directly, without Playwright's automatic Worker debugger attachment.
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {platform,release,arch} from 'node:os';
const root=dirname(fileURLToPath(import.meta.url)), fixture=resolve(root,'fixture');
const planHash='da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1';
const output=resolve(root,'evidence/m5-round6-'+(process.env.OPENDESK_M5_LABEL||'native')+'-'+new Date().toISOString().replaceAll(':','-'));
const profile=resolve(output,'profile');
const loopOnly=process.env.OPENDESK_M5_LOOP_ONLY==='1';
const mainOnly=process.env.OPENDESK_M5_MAIN_ONLY==='1';
const raceOnly=process.env.OPENDESK_M5_PERMISSION_RACE_ONLY==='1';
if([loopOnly,mainOnly,raceOnly].filter(Boolean).length>1)throw new Error('Choose one bounded diagnostic');
const retireMode=process.env.OPENDESK_M5_RETIRE_MODE||'remove';
if(!['terminate-only','remove','navigate'].includes(retireMode))throw new Error('Invalid realm retirement diagnostic'); await mkdir(profile,{recursive:true});
const executable=process.env.OPENDESK_TEST_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hits=[],events=[],cases=[],logs=[],traceEvents=[],ownedTargets=new Set();let traceCompletions=0; let child, socket, report={output,planHash,runScope:loopOnly?'loop-only diagnostic':mainOnly?'MAIN-only diagnostic':raceOnly?'permission-await-race diagnostic':'full F1 author matrix',retireMode},id=0;
const sourceFiles=['run.mjs','run-native.mjs','fixture/manifest.json','fixture/sw.js','fixture/host.html','fixture/host.js','fixture/sandbox.html','fixture/worker-harness.js','fixture/attacker.html','fixture/attacker.js'];
async function sourceManifest(){const files=[];for(const path of sourceFiles){const bytes=await readFile(resolve(root,path));files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}return {planManifestSha256:planHash,files};}
const frozenSource=await sourceManifest();
const historicalPaths=['evidence/chrome-149/report.json','evidence/chrome-149/console.json','evidence/chrome-149/attempt-2-debugger-attached/report.json','evidence/native-2026-10-02T15-19-01.724Z/report.json','evidence/native-2026-10-02T15-19-50.488Z/report.json'];
async function historicalHashes(){const result=[];for(const path of historicalPaths)result.push({path,sha256:createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')});return result;}
const historicalBefore=await historicalHashes();
const waiters=new Map(), listeners=new Set();
function call(method,params={},sessionId) {
  return new Promise((resolve,reject)=>{
    const number=++id;
    const timer=setTimeout(()=>{waiters.delete(number);reject(new Error(method+' timed out'));},20000);
    waiters.set(number,{resolve,reject,timer,sessionId,method});
    socket.send(JSON.stringify({id:number,method,params,...(sessionId?{sessionId}:{})}));
  });
}
const server=createServer((request,response)=>{
  hits.push({url:request.url,method:request.method,origin:request.headers.origin||null,at:Date.now(),monoMs:performance.now(),kind:'http'}); response.setHeader('Access-Control-Allow-Origin','*');
  if(request.url.startsWith('/probe.js')) {response.setHeader('Content-Type','text/javascript');response.end('self.__f1NetworkImported=true;');return;}
  if(request.url.startsWith('/probe')) {response.end('reachable');return;}
  response.setHeader('Content-Type','text/html');
  response.end(`<!doctype html><title>OpenDesk real form</title><input id="name" value="Base"><button id="submit">Submit</button><script>
    document.querySelector('#submit').onclick=()=>{const token=new URL(location.href).searchParams.get('permissionRaceClick');if(token)navigator.sendBeacon('/probe?permissionRaceEffect='+encodeURIComponent(token),'clicked');setTimeout(()=>{let e=document.createElement('p');e.id='result';e.textContent=document.querySelector('#name').value;document.body.append(e)},60)};
  </script>`);
});
server.on('upgrade',(request,connection)=>{hits.push({url:request.url,method:request.method,origin:request.headers.origin||null,at:Date.now(),kind:'websocket-upgrade'});const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');connection.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
try {
  child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--use-mock-keychain','--headless=new',`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`,'about:blank'],{stdio:['ignore','ignore','pipe'],detached:true});
  child.stderr.on('data',bytes=>logs.push({source:'browser-stderr',text:bytes.toString()}));
  let portFile;
  for(let i=0;i<100;i++){try{portFile=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');break;}catch{await sleep(100);}}
  assert(portFile,'Chrome debug endpoint absent');
  socket=new WebSocket(`ws://127.0.0.1:${portFile[0]}${portFile[1]}`);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const waiter=waiters.get(message.id);if(!waiter)return;waiters.delete(message.id);clearTimeout(waiter.timer);if(message.error)waiter.reject(new Error(JSON.stringify(message.error)));else waiter.resolve(message.result);return;}
    if(message.method==='Tracing.dataCollected')traceEvents.push(...message.params.value);
    if(message.method==='Tracing.tracingComplete')traceCompletions++;
    if(message.method==='Log.entryAdded'||message.method==='Runtime.exceptionThrown'||message.method?.startsWith('Target.')||message.method?.startsWith('ServiceWorker.')||message.method?.startsWith('Page.frame'))events.push({...message,observedAt:Date.now(),observedMonoMs:performance.now()});
    if(message.method==='Target.detachedFromTarget'){for(const [requestId,waiter] of waiters)if(waiter.sessionId===message.params.sessionId){clearTimeout(waiter.timer);waiters.delete(requestId);waiter.reject(new Error('Owned CDP target detached: '+message.params.targetId));}}
    for(const listener of listeners)listener(message);
  });
  await call('Target.setDiscoverTargets',{discover:true});
  report.browser={...(await call('Browser.getVersion')),executable,profile,headed:false,os:{platform:platform(),release:release(),arch:arch()}};
  const initialBinaryHash=createHash('sha256');for await(const bytes of createReadStream(executable))initialBinaryHash.update(bytes);report.browser.binarySha256=initialBinaryHash.digest('hex');
  const expectedManifest=JSON.parse(await readFile(resolve(fixture,'manifest.json'),'utf8'));
  let extensionId, extensionIdentity;
  const identityAttempts=[];
  for(let attempt=0;attempt<100&&!extensionId;attempt++){
    const {targetInfos}=await call('Target.getTargets');
    for(const target of targetInfos.filter(x=>x.type==='service_worker'&&x.url.startsWith('chrome-extension://')&&new URL(x.url).pathname==='/sw.js')){
      let probeSession;
      try{
        ({sessionId:probeSession}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
        const response=await call('Runtime.evaluate',{expression:'({id:chrome.runtime.id,manifest:chrome.runtime.getManifest()})',returnByValue:true},probeSession);
        const actual=response.result.value;
        identityAttempts.push({target,actual});
        if(actual?.id===new URL(target.url).host&&actual.manifest.name===expectedManifest.name&&actual.manifest.version===expectedManifest.version&&actual.manifest.background.service_worker==='sw.js'){
          extensionId=actual.id;extensionIdentity={target,actual};break;
        }
      }finally{if(probeSession)await call('Target.detachFromTarget',{sessionId:probeSession}).catch(()=>{});}
    }
    if(!extensionId)await sleep(100);
  }
  assert(extensionId,'Exact fixture extension identity not found');
  report.identity={expectedManifest,extensionIdentity,identityAttempts};report.browser.extensionId=extensionId;
  const hostURL=`chrome-extension://${extensionId}/host.html?network=${encodeURIComponent(origin+'/probe')}&retire=${retireMode}`;
  let targetId,sessionId,initialized,clockCalibration;
  async function evaluate(expression,awaitPromise=true){const response=await call('Runtime.evaluate',{expression,awaitPromise,returnByValue:true},sessionId);if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));return response.result.value;}
  async function wait(expression,timeout=5000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await evaluate(expression))return;await sleep(20);}throw new Error('Barrier timed out: '+expression);}
  async function calibrateClock(){
    const samples=[];
    for(let i=0;i<3;i++){
      const beforeMonoMs=performance.now();const actual=await evaluate('({now:performance.now(),timeOrigin:performance.timeOrigin})');const afterMonoMs=performance.now();
      samples.push({beforeMonoMs,afterMonoMs,actual,offsetLowerMs:beforeMonoMs-actual.now-0.2,offsetUpperMs:afterMonoMs-actual.now+0.2});
    }
    const offsetLowerMs=Math.max(...samples.map(x=>x.offsetLowerMs)),offsetUpperMs=Math.min(...samples.map(x=>x.offsetUpperMs));
    assert(offsetLowerMs<=offsetUpperMs&&offsetUpperMs-offsetLowerMs<10,'Monotonic clock calibration inconsistent or too uncertain');
    return {nodeDomain:'node:perf_hooks performance.now',hostDomain:'Window performance.now',quantizationAllowanceMs:0.2,offsetLowerMs,offsetUpperMs,samples};
  }
  async function cpuSample(){const beforeMonoMs=performance.now();const sample=await call('SystemInfo.getProcessInfo');return {beforeMonoMs,afterMonoMs:performance.now(),sample};}
  function processExitObservation(pid){
    const beforeMonoMs=performance.now();const result=spawnSync('ps',['-p',String(pid),'-o','pid=,ppid=,pgid=,time=,command='],{encoding:'utf8'});
    return {pid,beforeMonoMs,afterMonoMs:performance.now(),exitStatus:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message,confirmedExited:result.status===1&&!result.stdout.trim()&&!result.error};
  }
  async function openHost(){
    ({targetId}=await call('Target.createTarget',{url:'about:blank'}));ownedTargets.add(targetId);
    ({sessionId}=await call('Target.attachToTarget',{targetId,flatten:true}));
    await call('Runtime.enable',{},sessionId);await call('Log.enable',{},sessionId);await call('Page.enable',{},sessionId);
      const navigation=await call('Page.navigate',{url:hostURL},sessionId);assert(!navigation.errorText,'Host navigation failed: '+navigation.errorText);
    await wait('location.href.startsWith('+JSON.stringify('chrome-extension://'+extensionId+'/host.html')+')&&typeof harness!=="undefined"');
    initialized=await evaluate('harness.initialize()');
    clockCalibration=await calibrateClock();
    assert(initialized.runtimeId===extensionId&&initialized.manifest.name===expectedManifest.name,'Wrong extension host');
    const bytes=await evaluate('Promise.all(["manifest.json","worker-harness.js"].map(async path=>({path,bytes:Array.from(new Uint8Array(await (await fetch(path)).arrayBuffer()))})))');
    const resources=bytes.map(item=>({path:item.path,sha256:createHash('sha256').update(Buffer.from(item.bytes)).digest('hex')}));
    assert(resources.every(item=>item.sha256===frozenSource.files.find(f=>f.path==='fixture/'+item.path).sha256),'Loaded fixture source bytes mismatch');
    assert(initialized.positiveNetwork==='reachable','Positive network failed');
    assert(initialized.sandbox.origin==='null'&&!initialized.sandbox.extensionAPI&&!initialized.sandbox.parentAccess,'Opaque sandbox isolation failed');
    report.hosts ||= [];report.hosts.push({targetId,initialized,resources,document:await call('Page.getFrameTree',{},sessionId)});
  }
  await openHost();
  const targets=async()=>(await call('Target.getTargets')).targetInfos.filter(x=>x.type==='worker');
  const baseline=await targets();
  const sameTargets=(a,b)=>a.length===b.length&&a.every(x=>b.some(y=>y.targetId===x.targetId));
  async function exactWorker(owner,before){
    assert(owner.name==='OpenDesk-F1-'+owner.runId&&owner.url.startsWith('blob:null/'),'Invalid private Worker registration');
    for(let i=0;i<100;i++){
      const after=await targets();const candidates=after.filter(x=>!before.some(y=>y.targetId===x.targetId));
      const direct=candidates.filter(x=>x.url===owner.url);
      const candidate=direct.length===1?direct[0]:candidates.length===1&&!candidates[0].url?candidates[0]:null;
      if(candidate){assert(!candidate.attached,'Controlled Worker unexpectedly debugger-attached');const parent=await call('Page.getFrameTree',{},sessionId);report.workerAssociations||=[];report.workerAssociations.push({owner,before,after,chosenTargetId:candidate.targetId,method:candidate.url?'native URL plus private run registration':'unique fresh target during private start/bound barrier; native URL/title empty',parent});return candidate;}
      await sleep(20);
    }throw new Error('No unique exact run/Blob Worker association');
  }
  async function idle(){await wait('!harness.evidence().active&&harness.evidence().retired.length===harness.evidence().records.length');for(let i=0;i<100;i++){const r=await evaluate('harness.resources()');if(r.pending===0&&r.pageWaits===0)return r;await sleep(20);}throw new Error('Resources did not become idle');}
  const resourceBaseline=await evaluate('harness.resources()');
  async function run(body,params={},timeout=5000,held=false,observeResource=false){return evaluate(`harness.run(${JSON.stringify(body)},${JSON.stringify(params)},${timeout},${held},${observeResource})`);}
  async function test(id,body,params,expected,validate,timeout){
    const before=await evaluate('harness.evidence()');
    try{
      const actual=await run(body,params,timeout);const cleanup=await idle();const after=await evaluate('harness.evidence()');
      const effect=after.operations.slice(before.operations.length),delivery=after.deliveries.slice(before.deliveries.length);
      assert(validate(actual),'Assertion failed: '+expected);
      cases.push({id,status:'PASS',input:{body,params,timeout:timeout||5000},expected,actual,effect,delivery,cleanup,documentId:initialized.documentId,world:initialized.world});
    }catch(error){cases.push({id,status:'FAIL',input:{body,params,timeout},expected,error:{message:error.message,stack:error.stack}});}
  }
  const cpuDelta=(a,b)=>b.processInfo.filter(x=>x.type==='renderer').reduce((sum,x)=>sum+Math.max(0,x.cpuTime-(a.processInfo.find(y=>y.id===x.id)?.cpuTime??x.cpuTime)),0);
  if(!mainOnly&&!raceOnly)for(const trigger of ['stop','deadline','host-close']){
    const evidenceBefore=await evaluate('harness.evidence()'),beforeLoopTargets=await targets();
    assert(beforeLoopTargets.length===0,'Loop domain contains another control Worker');
    const traceStart=traceEvents.length,completionBefore=traceCompletions;
    await call('Tracing.start',{categories:'-*,__metadata,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',transferMode:'ReportEvents'});
    const body='await page.mark("loop-entered"); while(true){}';
    const loopPending=run(body,{},trigger==='deadline'?1000:8000,true).then(value=>({value}),error=>({hostLost:{message:error.message}}));
    await wait('harness.evidence().workers.some(x=>x.kind==="worker-bound"&&x.held&&x.runId===harness.evidence().active?.runId)');
    const owner=await evaluate('harness.evidence().workers.find(x=>x.kind==="worker-created"&&x.runId===harness.evidence().active.runId)');
    const bound=await evaluate('harness.evidence().workers.find(x=>x.kind==="worker-bound"&&x.runId==='+JSON.stringify(owner.runId)+')');
    assert(bound.held&&bound.identity?.url===owner.url&&bound.identity?.name===owner.name&&bound.identity?.origin==='null','Held Worker identity does not match actual run Blob');
    const loopTarget=await exactWorker(owner,beforeLoopTargets),loopHost=targetId,loopSession=sessionId;
    const observerBefore=events.filter(x=>x.method==='Target.attachedToTarget'&&(x.params.targetInfo.type==='worker'||x.params.targetInfo.type==='iframe')&&x.sessionId===loopSession);
    assert(observerBefore.length===0,'Loop creator was inspector-attached');
    const cpuHeld=await cpuSample();await sleep(150);const cpuBefore=await cpuSample();
    await evaluate('harness.release()');
    await wait('harness.evidence().operations.some(x=>x.method==="mark"&&x.args[0]==="loop-entered"&&x.runId===harness.evidence().active?.runId)');
    await sleep(350);const cpuLoop=await cpuSample();
    const oldHost=targetId;let beforeHostClose,closeRequestedMonoMs;
    if(trigger==='stop')await evaluate('harness.stop()');
    if(trigger==='host-close'){
      beforeHostClose=await evaluate('harness.evidence()');report.closedHostEvidence||=[];report.closedHostEvidence.push({hostTarget:oldHost,evidence:beforeHostClose});
      await evaluate('harness.retireOwnedTab()');closeRequestedMonoMs=performance.now();
      await call('Target.closeTarget',{targetId:oldHost});ownedTargets.delete(oldHost);
    }
    const loopResult=await loopPending;
    const triggerInterval=trigger==='host-close'?{lowerMonoMs:closeRequestedMonoMs,upperMonoMs:closeRequestedMonoMs}:{lowerMonoMs:loopResult.value.terminalTriggeredMonoMs+clockCalibration.offsetLowerMs,upperMonoMs:loopResult.value.terminalTriggeredMonoMs+clockCalibration.offsetUpperMs};
    const admissionObservation=trigger==='host-close'?{hostTargetClosed:true}:await evaluate('({active:harness.evidence().active,records:harness.evidence().records,observedMonoMs:performance.now()})');
    const cpuStop=await cpuSample();await sleep(150);const cpuEarly=await cpuSample();
    const cpuSamples=[cpuStop,cpuEarly],targetSamples=[];let after;
    while(performance.now()-triggerInterval.lowerMonoMs<3300){
      const beforeMonoMs=performance.now();after=await targets();targetSamples.push({beforeMonoMs,afterMonoMs:performance.now(),targets:after});
      assert(!after.some(x=>x.targetId===loopTarget.targetId&&x.attached),'Loop Worker became inspector-attached');
      cpuSamples.push(await cpuSample());
      if(!after.some(x=>x.targetId===loopTarget.targetId))break;
      await sleep(100);
    }
    const postSamples=[await cpuSample()];await sleep(150);postSamples.push(await cpuSample());await sleep(150);postSamples.push(await cpuSample());
    await call('Tracing.end');for(let i=0;i<100&&traceCompletions===completionBefore;i++)await sleep(20);assert(traceCompletions>completionBefore,'Native trace incomplete');
    const nativeTrace=traceEvents.slice(traceStart);
    const causalCandidates=nativeTrace.filter(x=>/Worker/i.test(x.name)&&JSON.stringify(x.args||{}).includes(owner.url));
    report.traceCausalCandidates||=[];report.traceCausalCandidates.push({trigger,owner,loopTarget,candidates:causalCandidates});
    const workerTrace=causalCandidates.find(x=>x.name==='TracingSessionIdForWorker'&&String(x.args?.data?.workerId).toUpperCase()===loopTarget.targetId.toUpperCase());
    const mappedPid=workerTrace?.pid;
    const nativeCreatorFrame=workerTrace?.args?.data?.frame;
    const nativeHostFrame=report.workerAssociations.find(x=>x.chosenTargetId===loopTarget.targetId)?.parent.frameTree.frame.id;
    const creatorAttachedToHost=events.find(x=>x.method==='Page.frameAttached'&&x.sessionId===loopSession&&x.params.frameId===nativeCreatorFrame&&x.params.parentFrameId===nativeHostFrame);
    const creatorExecution=nativeTrace.find(x=>x.name==='FunctionCall'&&x.pid===mappedPid&&x.args?.data?.frame===nativeCreatorFrame&&x.args?.data?.url==='chrome-extension://'+extensionId+'/sandbox.html');
    const causalWorker={nativeTraceEvent:workerTrace||null,pid:mappedPid??null,threadId:workerTrace?.args?.data?.workerThreadId??null,nativeCreatorFrame,nativeHostFrame,creatorAttachedToHost:creatorAttachedToHost||null,creatorExecution:creatorExecution||null,verified:!!workerTrace&&workerTrace.args.data.url===owner.url&&Number.isInteger(mappedPid)&&Number.isInteger(workerTrace.args.data.workerThreadId)&&!!creatorAttachedToHost&&!!creatorExecution};
    const cpuFor=x=>x.sample.processInfo.find(p=>p.id===mappedPid&&p.type==='renderer')?.cpuTime??null;
    const heldCPU=cpuFor(cpuHeld),beforeCPU=cpuFor(cpuBefore),loopCPUValue=cpuFor(cpuLoop),stopCPU=cpuFor(cpuStop),earlyCPUValue=cpuFor(cpuEarly);
    const loopCPU=beforeCPU!==null&&loopCPUValue!==null?loopCPUValue-beforeCPU:null,earlyCPU=stopCPU!==null&&earlyCPUValue!==null?earlyCPUValue-stopCPU:null;
    const postCPUValues=postSamples.map(cpuFor);
    const lifecycleObservation=causalWorker.verified?processExitObservation(mappedPid):{confirmedExited:false,reason:'No causal PID'};
    const postDeltas=postCPUValues.slice(1).map((v,i)=>v!==null&&postCPUValues[i]!==null?v-postCPUValues[i]:null);
    const allCPUAvailable=postCPUValues.every(x=>x!==null&&Number.isFinite(x));
    const cpuQuiescent=allCPUAvailable?postDeltas.every(x=>x>=0&&x<0.03):postCPUValues.every(x=>x===null)&&lifecycleObservation.confirmedExited;
    const cessationObservedMonoMs=allCPUAvailable?postSamples.at(-1).afterMonoMs:lifecycleObservation.afterMonoMs;
    const destroyed=events.find(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===loopTarget.targetId);
    const absentSample=targetSamples.find(x=>!x.targets.some(t=>t.targetId===loopTarget.targetId));
    const destroyedMilliseconds=destroyed?destroyed.observedMonoMs-triggerInterval.lowerMonoMs:null,absenceMilliseconds=absentSample?absentSample.afterMonoMs-triggerInterval.lowerMonoMs:null,cessationMilliseconds=cessationObservedMonoMs===undefined?null:cessationObservedMonoMs-triggerInterval.lowerMonoMs;
    const withinBound=ms=>ms!==null&&ms>=0&&ms<=3000;
    const observerThroughout=events.filter(x=>x.method==='Target.attachedToTarget'&&(x.params.targetInfo.targetId===loopTarget.targetId||x.sessionId===loopSession&&x.params.targetInfo.type==='iframe'));
    const hostResponsive=trigger==='host-close'?!(await call('Target.getTargets')).targetInfos.some(x=>x.targetId===oldHost):await evaluate('1+1')===2;
    const terminal=trigger==='host-close'?!!loopResult.hostLost:loopResult.value?.kind===(trigger==='stop'?'stopped':'timeout');
    const evidenceAfter=trigger==='host-close'?null:await evaluate('harness.evidence()');
    const newOps=(evidenceAfter||beforeHostClose).operations.slice(evidenceBefore.operations.length),delivery=(evidenceAfter||beforeHostClose).deliveries.slice(evidenceBefore.deliveries.length);
    const immediateFence=trigger==='host-close'?admissionObservation.hostTargetClosed:admissionObservation.active===null&&loopResult.value.admissionClosedMonoMs-loopResult.value.terminalTriggeredMonoMs<10;
    const cleanup=trigger==='host-close'?{hostTargetDestroyed:true}:await idle();
    const common=terminal&&causalWorker.verified&&observerThroughout.length===0&&loopCPU!==null&&loopCPU>0.1&&cpuQuiescent&&immediateFence&&hostResponsive&&newOps.length===1&&delivery.length===1;
    const status=common&&withinBound(destroyedMilliseconds)&&withinBound(absenceMilliseconds)&&withinBound(cessationMilliseconds)?'PASS':'FAIL';
    const old2sContractStatus=common&&[destroyedMilliseconds,absenceMilliseconds,cessationMilliseconds].every(x=>x!==null&&x>=0&&x<=2000)?'PASS':'FAIL';
    cases.push({id:'F1-INFINITE-LOOP-'+trigger.toUpperCase(),status,old2sContractStatus,input:{body,trigger,deadline:trigger==='deadline'?1000:8000},expected:'approved round5: exact causal run/Blob Worker physical execution cessation, targetDestroyed and independently observed absence within 3000ms calibrated actual trigger; no Worker/creator inspector attachment; immediate fence; host responsive; no late effect',actual:{loopResult,owner,bound,loopTarget,loopHost,causalWorker,clockCalibration,triggerInterval,closeRequestedMonoMs,admissionObservation,immediateFence,cpuHeld,cpuBefore,cpuLoop,cpuStop,cpuEarly,cpuSamples,postSamples,postCPUValues,postDeltas,lifecycleObservation,heldCPU,beforeCPU,loopCPU,earlyCPU,cpuQuiescent,cessationMilliseconds,destroyed,absentSample,destroyedMilliseconds,absenceMilliseconds,targetSamples,after,observerBefore,observerThroughout,hostResponsive,retirement:evidenceAfter?.retired.find(x=>x.runId===owner.runId),realmRetirement:evidenceAfter?.realmRetirements.find(x=>x.runId===owner.runId)},effect:newOps,delivery,documentId:initialized.documentId,world:initialized.world,cleanup});
    if(trigger!=='host-close'){await evaluate('harness.dispose()');await call('Target.closeTarget',{targetId:oldHost});ownedTargets.delete(oldHost);}
    await openHost();
    await test('F1-AFTER-TERMINATION-'+trigger.toUpperCase(),'return await page.title();',{},'genuine later control works after physical retirement and fresh channel',r=>r.kind==='result'&&r.value==='OpenDesk real form');
  }
  if(!loopOnly&&!mainOnly)for(const trigger of ['stop','deadline','host-close','new-run','new-target'])for(const method of ['goto','click']){
    const token='permission-race-'+trigger+'-'+method+'-'+crypto.randomUUID(), positiveToken=token+'-positive';
    const preparedURL=origin+'/form?raceOwnedTarget='+token+(method==='click'?'&permissionRaceClick='+token:'');
    const forbiddenURL=method==='goto'?origin+'/form?permissionRaceEffect='+token:origin+'/probe?permissionRaceEffect='+token;
    const body=method==='goto'?'await page.goto(params.url); return "OLD-RESUMED";':'await page.click("#submit"); return "OLD-RESUMED";';
    const timeout=trigger==='deadline'?500:6000;
    const actual={token,positiveToken,trigger,method,forbiddenURL,clockCalibration};let status='FAIL',error,hostClosed=false;
    try{
      actual.preparation=await run('await page.goto(params.url); return await page.url();',{url:preparedURL});await idle();
      assert(actual.preparation.value===preparedURL,'Race preparation did not navigate the real target');
      const targetInfo=(await call('Target.getTargets')).targetInfos.filter(x=>x.type==='page'&&x.url===preparedURL);
      assert(targetInfo.length===1,'Permission race owned target is ambiguous');actual.originalTarget=targetInfo[0];
      actual.before=await evaluate('harness.evidence()');actual.barrierId=await evaluate('harness.armPermissionBarrier()');
      const pending=run(body,{url:forbiddenURL},timeout).then(value=>({value}),error=>({hostDestroyedError:error.message}));
      await wait('harness.evidence().permissionBarriers.some(x=>x.id==='+JSON.stringify(actual.barrierId)+'&&x.held&&x.nativeResult===true)');
      actual.held=await evaluate('harness.evidence()');actual.owner=actual.held.active;
      actual.barrier=actual.held.permissionBarriers.find(x=>x.id===actual.barrierId);
      assert(actual.owner&&actual.barrier.runId===actual.owner.runId&&actual.barrier.apiUnchanged,'Barrier did not hold an original native permission call');
      actual.triggerRequestedMonoMs=performance.now();
      if(trigger==='host-close'){
        actual.hostTarget=targetId;await call('Target.closeTarget',{targetId});ownedTargets.delete(targetId);hostClosed=true;
        actual.pending=await pending;
        for(let i=0;i<100&&!events.some(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===actual.hostTarget);i++)await sleep(20);
        actual.hostDestroyed=events.find(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===actual.hostTarget);
        assert(actual.hostDestroyed&&!((await call('Target.getTargets')).targetInfos.some(x=>x.targetId===actual.hostTarget)),'Owned host did not actually close');
        // Keep the fixture-owned form alive while checking the lost continuation cannot dispatch.
        await sleep(350);actual.oldTargetAfterClose=(await call('Target.getTargets')).targetInfos.find(x=>x.targetId===actual.originalTarget.targetId);
        assert(actual.oldTargetAfterClose?.url===preparedURL,'Host-close race navigated the surviving form');
        await call('Target.closeTarget',{targetId:actual.originalTarget.targetId});
        await openHost();hostClosed=false;
      }else{
        if(trigger!=='deadline')await evaluate('harness.stop()');
        actual.pending=await pending;actual.terminal=actual.pending.value;
        assert(actual.terminal?.kind===(trigger==='deadline'?'timeout':'stopped'),'Legal cancellation did not settle the original run');
        await wait('harness.evidence().retired.length===harness.evidence().records.length');
        if(trigger==='new-target'){
          actual.oldTargetRetired=await evaluate('harness.retireOwnedTab()');initialized=await evaluate('harness.initialize()');
          actual.replacementTarget={tabId:initialized.tabId,documentId:initialized.documentId};
          assert(initialized.tabId!==actual.barrier.target.tabId&&initialized.documentId!==actual.barrier.target.documentId,'Replacement target was not new');
        }
        if(trigger==='new-run'||trigger==='new-target'){
          const replacementBody='await page.goto(params.url); '+(method==='click'?'await page.click("#submit"); ':'')+'await page.mark("new-owner-live"); await new Promise(r=>setTimeout(r,500)); return await page.title();';
          const positiveURL=origin+'/form?'+(method==='click'?'permissionRaceClick=':'permissionRaceEffect=')+positiveToken;
          const replacement=run(replacementBody,{url:positiveURL});
          await wait('harness.evidence().active?.runId!=='+JSON.stringify(actual.owner.runId)+'&&harness.evidence().operations.some(x=>x.runId===harness.evidence().active?.runId&&x.method==="mark"&&x.args[0]==="new-owner-live")');
          actual.replacementLive=await evaluate('harness.evidence()');
          await evaluate('harness.releasePermissionBarrier('+JSON.stringify(actual.barrierId)+')');
          await wait('harness.resources().then(x=>x.pending===0&&x.permissionBarriers===0)');
          actual.afterReleaseWhileNewRun=await evaluate('harness.evidence()');
          assert(actual.afterReleaseWhileNewRun.active?.runId===actual.replacementLive.active.runId,'Old continuation disturbed the replacement run');
          actual.recovery=await replacement;await idle();
        }else{
          await evaluate('harness.releasePermissionBarrier('+JSON.stringify(actual.barrierId)+')');await idle();
        }
        actual.after=await evaluate('harness.evidence()');
        actual.barrier=actual.after.permissionBarriers.find(x=>x.id===actual.barrierId);
        actual.oldDispatches=actual.after.effectDispatches.filter(x=>x.runId===actual.owner.runId);
        actual.oldDeliveries=actual.after.deliveries.filter(x=>x.runId===actual.owner.runId);
        actual.fenced=actual.after.rejects.filter(x=>x.runId===actual.owner.runId&&x.reason==='operation-owner-fenced');
        assert(actual.barrier.resumedMonoMs>=actual.terminal.terminalTriggeredMonoMs&&actual.oldDispatches.length===0&&actual.oldDeliveries.length===0&&actual.fenced.length===1,'Original operation dispatched, replied, or revived after its terminal fence');
      }
      if(!actual.recovery){
        const positiveURL=origin+'/form?'+(method==='click'?'permissionRaceClick=':'permissionRaceEffect=')+positiveToken;
        actual.recovery=await run('await page.goto(params.url); '+(method==='click'?'await page.click("#submit"); ':'')+'return await page.title();',{url:positiveURL});await idle();
      }
      assert(actual.recovery.kind==='result'&&actual.recovery.value==='OpenDesk real form','Genuine later operation failed');
      await sleep(350);
      actual.rawForbiddenHits=hits.filter(x=>new URL(x.url,origin).searchParams.get('permissionRaceEffect')===token);
      actual.rawPositiveHits=hits.filter(x=>new URL(x.url,origin).searchParams.get('permissionRaceEffect')===positiveToken);
      actual.observationEndedMonoMs=performance.now();actual.cleanup=await evaluate('harness.resources()');
      assert(actual.rawForbiddenHits.length===0&&actual.rawPositiveHits.length===1,'Raw server saw a cancelled effect or missed the positive native effect');
      assert(actual.cleanup.pending===0&&actual.cleanup.permissionBarriers===0&&actual.cleanup.pageWaits===0,'Permission race resources did not return to baseline');
      status='PASS';
    }catch(caught){error={message:caught.message,stack:caught.stack};}
    cases.push({id:'F1-PERMISSION-AWAIT-'+trigger.toUpperCase()+'-'+method.toUpperCase(),status,input:{body,params:{url:forbiddenURL},trigger,method,timeout,barrier:'hold continuation only after unchanged native chrome.permissions.contains resolves; no fake permission or tabs/scripting API'},expected:'original owner permanently fenced; zero real navigation/click requests after legal cancellation; native positive recovery works',actual,error,cleanup:actual.cleanup,documentId:initialized.documentId,world:initialized.world});
    if(!hostClosed){await evaluate('harness.dispose()');await call('Target.closeTarget',{targetId});ownedTargets.delete(targetId);}
    await openHost();
  }
  if(!loopOnly&&!raceOnly){
  if(!mainOnly){
  await test('F1-USER-GOTO-TITLE-URL','await page.goto(params.url); return {title:await page.title(),url:await page.url()};',{url:origin+'/form?navigation'},'await navigation then actual title/url',r=>r.kind==='result'&&r.value.title==='OpenDesk real form'&&r.value.url===origin+'/form?navigation');
  await test('F1-USER-TYPE-CLICK-WAIT-READ',"const type=await page.type('#name','Alice'); const click=await page.click('#submit'); await page.waitForSelector('#result'); return {type,click,text:await page.text('#result')};",{},'Typed/clicked and BaseAlice after actual page effect',r=>r.kind==='result'&&r.value.type==='Typed'&&r.value.click==='clicked'&&r.value.text==='BaseAlice');
  await test('F1-USER-THROW','await page.title(); throw new Error("actual-user-error");',{},'actual user rejection',r=>r.kind==='error'&&r.error.message==='actual-user-error');
  await test('F1-USER-SYNTAX','const = ;',{},'SyntaxError compiled only in Worker',r=>r.kind==='error'&&r.error.name==='SyntaxError');
  await test('F1-ADAPTER-REJECTION','await page.goto(params.url);',{url:'https://example.com/'},'unauthorized origin rejects without navigation',r=>r.kind==='error'&&r.error.message==='Origin not authorized');
  for(const value of ['false','0','null','undefined'])await test('F1-RETURN-'+value,'return '+value+';',{},'preserve '+value,r=>r.kind==='result'&&(value==='undefined'?r.valueType==='undefined'&&r.valuePresent:r.value===JSON.parse(value)));
  await test('F1-UNSERIALIZABLE','return ()=>7;',{},'typed DataCloneError',r=>r.kind==='error'&&r.error.name==='DataCloneError');
  await test('F1-GLOBAL-FORGERY-PATCH',`self.postMessage({kind:'result',value:'FORGED'});self.postMessage({kind:'naturalEnd',value:true});
    Map.prototype.get=()=>{throw 7};Map.prototype.set=()=>{throw 8};Promise.prototype.then=()=>{throw 9};MessagePort.prototype.postMessage=()=>{throw 10};globalThis.structuredClone=()=>{throw 11};Object.freeze=()=>{throw 12};
    return {title:await page.title(),extensionAPI:!!self.chrome?.runtime?.id,dom:typeof document};`,{},'captured private primitives survive; forged result does not settle',r=>r.kind==='result'&&r.value.title==='OpenDesk real form'&&!r.value.extensionAPI&&r.value.dom==='undefined');
  await test('F1-DEADLINE','await new Promise(()=>{}); return 7;',{},'timeout once and retire',r=>r.kind==='timeout',150);
  await test('F1-PENDING-PAGE-DEADLINE','await page.waitForSelector("#never-exists"); return 7;',{},'timeout cancels real page wait observer/timer',r=>r.kind==='timeout',150);
  const replayBefore=await evaluate('harness.evidence()');
  const pending=run('await page.title(); await new Promise(()=>{}); return "late";',{},5000);
  await wait('harness.evidence().active?.lastId===1');
  await evaluate('harness.replay();harness.rebindAttack();harness.wrongRun()');await sleep(100);await evaluate('harness.stop()');
  const stopped=await pending,replayCleanup=await idle(),replayAfter=await evaluate('harness.evidence()');
  const replayOperations=replayAfter.operations.slice(replayBefore.operations.length),replayRejects=replayAfter.rejects.slice(replayBefore.rejects.length);
  cases.push({id:'F1-REPLAY-REBIND-WRONG-RUN-STOP',input:{body:'await page.title(); await new Promise(()=>{}); return "late";',attacks:['replay seq','rebinding','wrong run/epoch']},expected:'one genuine operation, rejected attacks, only stopped settlement',status:stopped.kind==='stopped'&&replayOperations.length===1&&replayRejects.some(x=>x.reason==='invalid-or-replayed-request')&&replayRejects.some(x=>x.reason==='fenced-or-wrong-run')?'PASS':'FAIL',actual:{stopped,replayRejects},effect:replayOperations,cleanup:replayCleanup});
  const fakePending=run('await page.title(); await new Promise(r=>setTimeout(r,250)); return "REAL";');
  const fakePeer=await evaluate(`new Promise(resolve=>{let bound=false;const listener=event=>{if(event.data?.kind==='attacker-bound')bound=true;if(event.data?.kind==='attack-sent'){window.removeEventListener('message',listener);frame.remove();resolve({bound});}};window.addEventListener('message',listener);const frame=document.createElement('iframe');frame.src='attacker.html';document.body.append(frame);})`);
  const fakeResult=await fakePending;
  cases.push({id:'F1-FAKE-PEER',input:{peer:'sibling iframe attacker.html',messages:['bind-host','forged result']},expected:'wrong source never bound; genuine REAL result',status:!fakePeer.bound&&fakeResult.value==='REAL'?'PASS':'FAIL',actual:{fakePeer,fakeResult},cleanup:await idle()});
  await call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true,filter:[{type:'iframe',exclude:false},{exclude:true}]},sessionId);
  const networkToken='network-'+Date.now();
  const networkParams={fetch:origin+'/probe?worker=blocked&kind=fetch&token='+networkToken,xhr:origin+'/probe?worker=blocked&kind=xhr&token='+networkToken,ws:origin.replace('http:','ws:')+'/probe?worker=blocked&kind=ws&token='+networkToken,script:origin+'/probe.js?worker=blocked&token='+networkToken};
  const positiveURLs=Object.values(networkParams).map(x=>x.replace('worker=blocked','positive=extension'));
  const positiveBefore=await evaluate('harness.networkPositive('+JSON.stringify(positiveURLs)+')');
  const networkBody=`const out={};try{await fetch(params.fetch);out.fetch={blocked:false};}catch(e){out.fetch={blocked:true,name:e.name,message:e.message};}
    out.xhr=typeof XMLHttpRequest==='undefined'?{exposed:false}:await new Promise(resolve=>{const x=new XMLHttpRequest();x.open('GET',params.xhr);x.onload=()=>resolve({exposed:true,blocked:false,status:x.status});x.onerror=()=>resolve({exposed:true,blocked:true});x.send();});
    out.ws=typeof WebSocket==='undefined'?{exposed:false}:await new Promise(resolve=>{try{const s=new WebSocket(params.ws);s.onopen=()=>{s.close();resolve({exposed:true,blocked:false});};s.onerror=()=>resolve({exposed:true,blocked:true});}catch(e){resolve({exposed:true,blocked:true,name:e.name,message:e.message});}});
    out.script={exposed:typeof importScripts!=='undefined'};try{importScripts(params.script);out.script.blocked=false;}catch(e){out.script.blocked=true;out.script.name=e.name;out.script.message=e.message;}return out;`;
  const networkBeforeTargets=await targets();
  const networkPending=run(networkBody,networkParams,8000,true);
  await wait('harness.evidence().workers.some(x=>x.runId===harness.evidence().active?.runId&&x.kind==="worker-bound")');
  const networkOwner=await evaluate('harness.evidence().workers.find(x=>x.runId===harness.evidence().active.runId&&x.kind==="worker-created")');
  const networkTarget=await exactWorker(networkOwner,networkBeforeTargets);
  let sandboxSession,sandboxIdentity;
  const liveFrameTargets=(await call('Target.getTargets')).targetInfos.filter(x=>x.type==='iframe');
  for(const attachment of events.filter(x=>x.method==='Target.attachedToTarget'&&x.params.targetInfo.type==='iframe'&&x.sessionId===sessionId&&liveFrameTargets.some(t=>t.targetId===x.params.targetInfo.targetId))){
    const candidateSession=attachment.params.sessionId;
    await call('Runtime.enable',{},candidateSession);await call('Page.enable',{},candidateSession);
    const response=await call('Runtime.evaluate',{expression:'({url:location.href,origin:self.origin,extensionAPI:!!self.chrome?.runtime?.id})',returnByValue:true},candidateSession);
    if(response.result.value.url==='chrome-extension://'+extensionId+'/sandbox.html'){
      sandboxSession=candidateSession;sandboxIdentity={attachment,actual:response.result.value,frame:await call('Page.getFrameTree',{},candidateSession)};break;
    }
  }
  assert(sandboxSession,'Opaque sandbox inspector routing missing');report.sandboxIdentity=sandboxIdentity;
  await call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true,filter:[{type:'worker',exclude:false},{exclude:true}]},sandboxSession);
  let networkAttachment;for(let i=0;i<100;i++){networkAttachment=events.find(x=>x.method==='Target.attachedToTarget'&&x.params.targetInfo.targetId===networkTarget.targetId);if(networkAttachment)break;await sleep(20);}
  assert(networkAttachment,'Finite network observer attachment missing');
  const networkSession=networkAttachment.params.sessionId;
  await call('Runtime.enable',{},networkSession);await call('Log.enable',{},networkSession);
  await evaluate('harness.release()');const networkResult=await networkPending;
  await call('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true},sandboxSession);await idle();await sleep(100);
  const positiveAfter=await evaluate('harness.networkPositive('+JSON.stringify(positiveURLs)+')');
  const networkLogs=events.filter(x=>x.sessionId===networkSession&&x.method==='Log.entryAdded');
  const denialEvidence=networkLogs.filter(x=>/Content Security Policy|connect-src|script-src/i.test(x.params.entry.text));
  const forbiddenHits=hits.filter(x=>x.url.includes(networkToken)&&x.url.includes('worker=blocked'));
  const networkEvidence=await evaluate('harness.evidence()');
  cases.push({id:'F1-CSP-NETWORK-ATTRIBUTION',input:{body:networkBody,params:networkParams},expected:'real connect-src/script-src denial, CORS-reachable HTTP/WS positive controls before/after, zero forbidden server hits',status:networkResult.kind==='result'&&networkResult.value.fetch.blocked&&networkResult.value.xhr.blocked&&networkResult.value.ws.blocked&&networkResult.value.script.blocked&&positiveBefore.every(x=>x.status===200||x.opened)&&positiveAfter.every(x=>x.status===200||x.opened)&&denialEvidence.some(x=>x.params.entry.text.includes('connect-src'))&&denialEvidence.some(x=>x.params.entry.text.includes('script-src'))&&!forbiddenHits.length?'PASS':'FAIL',actual:{networkResult,networkOwner,networkTarget,networkSession,positiveBefore,positiveAfter,denialEvidence,workerPolicyEvents:networkEvidence.policy,serverHits:hits.filter(x=>x.url.includes(networkToken))},cleanup:await evaluate('harness.resources()')});
  await call('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true},sessionId);
  const resourceRounds=[];
  for(let i=0;i<5;i++)for(const outcome of ['success','throw','timeout','cancel']){
    const caseId='F1-RESOURCE-'+outcome.toUpperCase()+'-'+i;
    const body=outcome==='success'?'return 0;':outcome==='throw'?'throw new Error("repeat");':'await page.waitForSelector("#'+outcome+'-'+i+'");';
    const timeout=outcome==='timeout'?600:5000;
    const before=await evaluate('harness.evidence()');let status='FAIL',error;const observation={outcome,round:i};
    try{
      for(let j=0;j<100&&(await targets()).length;j++)await sleep(20);
      observation.beforeTargets=await targets();assert(observation.beforeTargets.length===0,'Resource round did not begin with an empty native Worker set');
      const pending=run(body,{},timeout,true,true);
      await wait('harness.evidence().workers.some(x=>x.kind==="worker-bound"&&x.held&&x.runId===harness.evidence().active?.runId)');
      observation.owner=await evaluate('harness.evidence().workers.find(x=>x.kind==="worker-created"&&x.runId===harness.evidence().active.runId)');
      observation.bound=await evaluate('harness.evidence().workers.find(x=>x.kind==="worker-bound"&&x.runId===harness.evidence().active.runId)');
      observation.target=await exactWorker(observation.owner,observation.beforeTargets);
      observation.positive=await evaluate('harness.observeRunResource()');
      assert(observation.positive.runId===observation.owner.runId&&observation.positive.url===observation.owner.url&&observation.positive.sandboxEpoch===observation.owner.sandboxEpoch&&observation.positive.positive.loaded,'Actual per-run Blob did not load in its creating opaque realm');
      observation.heldResources=await evaluate('harness.resources()');
      await evaluate('harness.release()');
      if(outcome==='cancel'||outcome==='timeout'){
        await wait('harness.resources().then(x=>x.pageWaits===1&&x.pending===1)');
        observation.liveResources=await evaluate('harness.resources()');
        assert(observation.liveResources.pageWaits===1&&observation.liveResources.pending===1&&observation.liveResources.timer===1,'Resource cancellation did not reach the real DOM observer');
        if(outcome==='cancel')await evaluate('harness.stop()');
      }
      observation.result=await pending;observation.cleanup=await idle();
      const after=await evaluate('harness.evidence()');observation.retired=after.retired.find(x=>x.runId===observation.owner.runId);
      observation.blob=observation.retired?.resourceObservation;
      observation.effect=after.operations.slice(before.operations.length);observation.delivery=after.deliveries.slice(before.deliveries.length);
      for(let j=0;j<150;j++){
        const nativeTargets=await targets();
        if(!nativeTargets.some(x=>x.targetId===observation.target.targetId)&&events.some(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===observation.target.targetId)){
          observation.afterTargets=nativeTargets;observation.absentObservedMonoMs=performance.now();break;
        }
        await sleep(20);
      }
      observation.destroyed=events.find(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===observation.target.targetId);
      const blob=observation.blob;
      assert(blob?.runId===observation.owner.runId&&blob.url===observation.owner.url&&blob.creatingOrigin==='null'&&blob.positive?.url===blob.url&&blob.positive.loaded&&blob.positive.finishedMonoMs<=blob.revokedMonoMs&&blob.negative.url===blob.url&&blob.negative.startedMonoMs>=blob.revokedMonoMs&&!blob.negative.loaded&&!blob.negative.timedOut&&blob.negative.error,'Per-run actual Blob revoke oracle was incomplete');
      assert(Object.values(blob.actual).every(x=>x===0)&&observation.destroyed&&observation.afterTargets?.length===0&&JSON.stringify(observation.cleanup)===JSON.stringify(resourceBaseline),'Per-run native target, ports, Blob, or host resources did not return to baseline');
      assert(outcome==='success'?observation.result.kind==='result'&&observation.result.value===0:outcome==='throw'?observation.result.kind==='error':observation.result.kind===(outcome==='timeout'?'timeout':'stopped'),'Resource run did not exercise its actual outcome');
      status='PASS';
    }catch(caught){error={message:caught.message,stack:caught.stack};}
    resourceRounds.push({caseId,status,...observation});
    cases.push({id:caseId,status,input:{body,timeout,held:true,observeResource:true},expected:'real outcome; exact run/epoch/Blob positive load before revoke and negative after in creating realm; exact Worker destroyed/absent and resources return to baseline',actual:observation.result,independentObservation:observation,error,effect:observation.effect,delivery:observation.delivery,cleanup:observation.cleanup,documentId:initialized.documentId,world:initialized.world});
  }
  report.resourceRounds=resourceRounds;
  await test('F1-AFTER-CLEANUP-VALID','return await page.title();',{},'later genuine run works',r=>r.kind==='result'&&r.value==='OpenDesk real form');
  const resourceEvidence=await evaluate('harness.evidence()');report.resourceEvidence=resourceEvidence;
  const probe=await evaluate('harness.resourceProbe()');
  for(let i=0;i<100&&!sameTargets(await targets(),baseline);i++)await sleep(20);
  const finalTargets=await targets(),finalResources=await evaluate('harness.resources()');
  cases.push({id:'F1-RESOURCE-INDEPENDENT-OBSERVATION',input:{rounds:{success:5,throw:5,timeout:5,cancel:5},oracle:'same worker-src allows fixed harness ready before revocation; actual revoked URL Worker load fails'},expected:'exact browser target baseline; actual pending/page observer/timer/port/Blob baseline; later valid run',status:resourceRounds.length===20&&resourceRounds.every(x=>x.status==='PASS')&&new Set(resourceRounds.map(x=>x.owner?.runId)).size===20&&sameTargets(finalTargets,baseline)&&probe.positive.loaded&&probe.negative.every(x=>!x.loaded&&!x.timedOut&&x.error)&&Object.values(probe.actual).every(x=>x===0)&&JSON.stringify(finalResources)===JSON.stringify(resourceBaseline)?'PASS':'FAIL',actual:{baseline,finalTargets,resourceBaseline,finalResources,probe,perRun:resourceRounds}});

  await call('ServiceWorker.enable',{},sessionId);
  const swBefore=await evaluate('harness.swIdentity()');await sleep(100);
  const versions=events.filter(x=>x.method==='ServiceWorker.workerVersionUpdated').flatMap(x=>x.params.versions).filter(x=>x.scriptURL==='chrome-extension://'+extensionId+'/sw.js'&&x.runningStatus==='running');
  const swVersion=versions.at(-1);assert(swVersion,'Exact owned SW version absent');
  const controllerPending=run('await page.title(); await new Promise(r=>setTimeout(r,600)); return "controller-survived-SW";');
  await wait('harness.evidence().active?.lastId===1');
  await call('ServiceWorker.stopWorker',{versionId:swVersion.versionId},sessionId);await sleep(100);
  const swAfter=await evaluate('harness.swIdentity()'),controllerResult=await controllerPending;
  const reconnectBefore=await evaluate('harness.evidence()'),disposeBeforeReconnect=await evaluate('harness.dispose()');
  await call('Page.navigate',{url:hostURL},sessionId);await wait('typeof harness!=="undefined"&&harness.evidence().hostEpoch!=='+JSON.stringify(reconnectBefore.hostEpoch));
  initialized=await evaluate('harness.initialize()');const reconnectResult=await run('return await page.title();');await idle();
  cases.push({id:'F1-SW-HOST-RECONNECT',input:{sequence:['stop exact SW version','wake through genuine runtime message','dispose private host port','navigate fresh extension host and bind fresh channel']},expected:'SW epoch changes while control Worker survives; old resources released; new verified host epoch and genuine run',status:swBefore.id===extensionId&&swAfter.id===extensionId&&swBefore.epoch!==swAfter.epoch&&controllerResult.value==='controller-survived-SW'&&initialized.hostEpoch!==reconnectBefore.hostEpoch&&Object.values(disposeBeforeReconnect).every(x=>x===0)&&reconnectResult.value==='OpenDesk real form'?'PASS':'FAIL',actual:{swVersion,swBefore,swAfter,controllerResult,oldHostEpoch:reconnectBefore.hostEpoch,newHostEpoch:initialized.hostEpoch,runtimeId:initialized.runtimeId,reconnectResult},cleanup:disposeBeforeReconnect});
  }
  const borrowedURL=origin+'/form?borrowed-sentinel='+Date.now();
  const {targetId:borrowedTarget}=await call('Target.createTarget',{url:borrowedURL});ownedTargets.add(borrowedTarget);
  await sleep(150);
  const ownedPage=(await call('Target.getTargets')).targetInfos.filter(x=>x.type==='page'&&x.url===origin+'/form');assert(ownedPage.length===1,'Owned MAIN-loop target ambiguous');
  await call('Target.activateTarget',{targetId:ownedPage[0].targetId});
  const mainToken='main-loop-'+Date.now();
  const mainCpuBefore=await call('SystemInfo.getProcessInfo'),mainArm=await evaluate('harness.armOwnedMainLoop('+JSON.stringify(mainToken)+')');
  const mainCpuSamples=[];let mainCpuActive;
  for(let i=0;i<30;i++){await sleep(100);mainCpuActive=await call('SystemInfo.getProcessInfo');mainCpuSamples.push({at:Date.now(),sample:mainCpuActive});if(cpuDelta(mainCpuBefore,mainCpuActive)>0.1)break;}
  const mainEntered=hits.filter(x=>x.method==='POST'&&x.url.includes('mainLoop='+mainToken));
  const mainRetire=await evaluate('harness.retireOwnedTab()');await sleep(150);
  const targetsAfterMain=(await call('Target.getTargets')).targetInfos;
  const borrowedBinding=await evaluate('harness.borrowByUrl('+JSON.stringify(borrowedURL)+')');
  const borrowedRefusal=await evaluate('harness.retireOwnedTab()');const borrowedDispose=await evaluate('harness.dispose()');
  const borrowedStillPresent=(await call('Target.getTargets')).targetInfos.some(x=>x.targetId===borrowedTarget&&x.url===borrowedURL);
  cases.push({id:'F1-OWNED-MAIN-LOOP-BORROWED-BOUNDARY',input:{ownedMainBody:'setTimeout(()=>{document.body.dataset.loopEntered="true";while(true){}},50)',borrowedURL,roles:{controllerOwned:ownedPage[0].targetId,runnerOwnedAdapterBorrowed:borrowedTarget}},expected:'MAIN loop has no fake terminate; retire only explicitly owned page; borrowed page survives adapter retirement and dispose',status:mainEntered.length===1&&mainArm[0]?.result?.armed&&cpuDelta(mainCpuBefore,mainCpuActive)>0.1&&mainRetire.removed&&!targetsAfterMain.some(x=>x.targetId===ownedPage[0].targetId)&&borrowedRefusal.reason==='borrowed'&&!borrowedRefusal.removed&&borrowedStillPresent?'PASS':'FAIL',actual:{mainToken,mainEntered,mainArm,mainCpuBefore,mainCpuActive,mainCpuSamples,mainRetire,ownedTargetDestroyed:events.find(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===ownedPage[0].targetId),borrowedBinding,borrowedRefusal,borrowedStillPresent},cleanup:borrowedDispose});
  await call('Target.closeTarget',{targetId:borrowedTarget});ownedTargets.delete(borrowedTarget);
  // MAIN retirement is the final adapter exercise; its dispose is already verified.
  report.siteAccess=await evaluate('harness.permissions()');
  const {targetId:uiTarget}=await call('Target.createTarget',{url:'chrome://extensions/?id='+extensionId});ownedTargets.add(uiTarget);
  const {sessionId:uiSession}=await call('Target.attachToTarget',{targetId:uiTarget,flatten:true});await call('Runtime.enable',{},uiSession);await call('Page.enable',{},uiSession);await sleep(300);
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:500,y:300,deltaX:0,deltaY:300},uiSession);await sleep(150);
  const uiResponse=await call('Runtime.evaluate',{expression:`(()=>{const controls=[];function walk(root){for(const element of root.querySelectorAll('*')){if(element.shadowRoot)walk(element.shadowRoot);if(['select','option','cr-radio-button','cr-toggle','button','input'].includes(element.localName)){const r=element.getBoundingClientRect();controls.push({tag:element.localName,id:element.id,text:element.textContent.trim(),parentText:element.parentElement?.textContent.trim(),hostTag:element.getRootNode().host?.localName,hostText:element.getRootNode().host?.textContent.trim(),hostId:element.getRootNode().host?.id,value:element.value,checked:element.checked,disabled:element.disabled,aria:element.getAttribute('aria-label'),box:{x:r.x,y:r.y,w:r.width,h:r.height}});}}}walk(document);return {url:location.href,title:document.title,controls};})()`,returnByValue:true},uiSession);report.extensionUi=uiResponse.result.value;
  await writeFile(resolve(output,'extension-ui.json'),JSON.stringify(report.extensionUi,null,2)+'\n');const uiImage=await call('Page.captureScreenshot',{format:'png'},uiSession);await writeFile(resolve(output,'extension-ui.png'),Buffer.from(uiImage.data,'base64'));
  await call('Target.closeTarget',{targetId:uiTarget});ownedTargets.delete(uiTarget);
  }
  const finalEvidence=await evaluate('harness.evidence()');
  const {data}=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(resolve(output,'workbench.png'),Buffer.from(data,'base64'));
  const disposedResources=await evaluate('harness.dispose()');
  for(let i=0;i<100&&(await targets()).length;i++)await sleep(20);
  report={...report,scope:'F1 control prototype only; author execution, not independent acceptance or product migration',cases,initialized,evidence:finalEvidence,networkServerHits:hits,resourceBaseline,disposedResources,workerTargetsAfterDispose:await targets(),browser:{...(await call('Browser.getVersion')),executable,profile,extensionId,headed:false,os:{platform:platform(),release:release(),arch:arch()}},notTested:['F2/F3 product migration','userScripts dimensions owned by separate lane'],historicalBefore};
  const executableHasher=createHash('sha256');for await(const bytes of createReadStream(executable))executableHasher.update(bytes);report.browser.binarySha256=executableHasher.digest('hex');
}catch(error){report={...report,fixtureFailure:{message:error.message,stack:error.stack},cases};}
finally{
  if(socket?.readyState===1){try{await call('Browser.close');}catch{}socket.close();}
  if(child&&child.exitCode===null){for(let i=0;i<20&&child.exitCode===null;i++)await sleep(100);if(child.exitCode===null){process.kill(-child.pid,'SIGTERM');for(let i=0;i<20&&child.exitCode===null;i++)await sleep(100);if(child.exitCode===null){process.kill(-child.pid,'SIGKILL');for(let i=0;i<20&&child.exitCode===null;i++)await sleep(100);}}}
  report.cleanup={ownedBrowserExited:child?.exitCode!==null||child?.signalCode!==null,ownedBrowserPid:child?.pid,exitCode:child?.exitCode,signalCode:child?.signalCode,ownedProfile:profile,ownedTargets:[...ownedTargets],serverClosed:false,cdpWaiters:waiters.size};
  await new Promise(resolve=>server.close(resolve));report.cleanup.serverClosed=true;
  report.networkServerHits=hits;
  for(const testCase of cases.filter(x=>x.id.startsWith('F1-PERMISSION-AWAIT-'))){
    testCase.actual.rawForbiddenHitsThroughBrowserExit=hits.filter(x=>new URL(x.url,origin).searchParams.get('permissionRaceEffect')===testCase.actual.token);
    if(testCase.actual.rawForbiddenHitsThroughBrowserExit.length){testCase.status='FAIL';testCase.error={message:'Cancelled native effect reached the raw server before browser exit'};}
  }
  report.cleanup.abortedCdpRequests=waiters.size;for(const waiter of waiters.values())clearTimeout(waiter.timer);waiters.clear();report.cleanup.cdpWaiters=waiters.size;
  const afterSource=await sourceManifest();report.sourceUnchangedDuringRun=JSON.stringify(afterSource)===JSON.stringify(frozenSource);
  const manifest=JSON.stringify(frozenSource,null,2)+'\n';await writeFile(resolve(output,'candidate-manifest.json'),manifest);
  report.prototypeCandidateSha256=createHash('sha256').update(manifest).digest('hex');report.backendPrototypePassed=false;report.requiresIndependentReview=true;
  report.historicalAfter=await historicalHashes();report.historicalEvidenceUnchanged=JSON.stringify(report.historicalAfter)===JSON.stringify(historicalBefore);
  await writeFile(resolve(output,'trace.json'),JSON.stringify({traceEvents},null,2)+'\n');
  await writeFile(resolve(output,'protocol.json'),JSON.stringify(events,null,2)+'\n');
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(resolve(output,'console.json'),JSON.stringify({events,logs},null,2)+'\n');
}
console.log(JSON.stringify({report:resolve(output,'report.json'),cases:cases.map(({id,status,error})=>({id,status,error})),fixtureFailure:report.fixtureFailure},null,2));
process.exitCode=report.fixtureFailure||cases.some(c=>c.status!=='PASS')||!report.sourceUnchangedDuringRun||!report.historicalEvidenceUnchanged?1:0;
