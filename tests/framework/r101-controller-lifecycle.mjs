import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadInstall} from '../../native-agent/install.mjs';
import {approveNativePermission} from './native-chrome-consent.mjs';
import {TraceMap,generatedPositionFor,LEAST_UPPER_BOUND} from '@jridgewell/trace-mapping';

const execute=promisify(execFile);

// Only actual browser APIs and the exact owned Native process are faulted.
// Result reads after recovery never redispatch the original mutation.
export async function runNativeLifecycle({project,bindingId,mcpClient,until,report,record,target,targetTabId,options,browser,chrome,settingsTabId,origin,requestAgent,nativeStatus,out,tool,observedWorker}) {
  const file=project+'/src/extract.js',source=fs.readFileSync(file,'utf8');
  const cases=(process.env.OPENDESK_DEV_LIFECYCLE_CASES||'permission,port,navigation,external').split(',');
  assert.ok(cases.length&&new Set(cases).size===cases.length&&cases.every(c=>['permission','port','navigation','external','late'].includes(c)),'known nonduplicate lifecycle cases');
  report.lifecycleCases=cases;
  const current=async()=> (await requestAgent('target.current',{},crypto.randomUUID(),3000)).result.target;
  const settled=runId=>until(async()=>{const r=await mcpClient.tool('result',{runId});return r.run.retirementState==='released'&&r.results.length?r:null;},'original Controller retirement',30000);
  const snapshot=(name,r,extra={})=>{
    assert.equal(r.results.length,1,'one durable result for the original admission');
    assert.equal(r.results[0].revision.sourceHash,r.run.revision.sourceHash);
    const row={name,status:'PASS',runId:r.runId,resultId:r.results[0].resultId,sourceHash:r.sourceHash,
      documentId:r.run.target.documentId,state:r.run.state,error:r.error,retirement:r.run.retirementState,...extra};
    report.tests.push(row);record('r101.native-lifecycle',row);return row;
  };
  async function startWaiting(kind) {
    fs.writeFileSync(file,'export async function readSummary(page){await page.waitForSelector("#r101-never-present",{timeout:8000});return 99;}\n');
    const requestId='r101-'+kind+'-'+crypto.randomUUID();
    const started=await mcpClient.tool('run',{bindingId,requestId,deadlineMs:20000});
    const running=await mcpClient.tool('result',{runId:started.runId});
    assert.equal(running.run.state,'running');assert.equal(running.results.length,0);
    record('r101.in-flight',{kind,requestId,runId:started.runId,sourceHash:started.source.sourceHash,documentId:running.run.target.documentId});
    return {started,requestId};
  }
  async function reconnect({permissionPrompt=false}={}) {
    await browser.call('Target.activateTarget',{targetId:settingsTabId});
    if(process.platform==='darwin')await execute('/usr/bin/osascript',['-e','tell application "System Events" to set frontmost of first application process whose unix id is '+chrome.pid+' to true'],{timeout:10000});
    await options.click('#bridge-enable');
    if(permissionPrompt){
      // Chrome can remember this exact optional grant after remove(). Observe
      // the real API after the trusted click before expecting another bubble.
      const alreadyRestored=await options.read('chrome.permissions.contains({permissions:["nativeMessaging"]})');
      record('native.permission.restoration-input',alreadyRestored
        ?{kind:'trusted-settings-click',permission:'nativeMessaging',contains:true,modal:'not presented for previously approved permission'}
        :await approveNativePermission({pid:chrome.pid,evidenceDirectory:out}));
    }
    await until(()=>options.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),'actual Native permission restored');
    await until(async()=>{const s=await nativeStatus();return s.ok&&s.data.enabled&&s.data.nativeConnected;},'Native connection restored');
    await until(async()=> (await requestAgent('bridge.status',{},crypto.randomUUID(),3000)).result?.nativeConnected,'new Native handshake');
    await browser.call('Target.activateTarget',{targetId:targetTabId});
    await until(async()=> (await current()).origin===origin,'original demo target after settings');
  }
  try {
    if(cases.includes('permission')){
    const permissionRun=await startWaiting('permission');
    const removed=await options.read('chrome.permissions.remove({permissions:["nativeMessaging"]})');
    assert.equal(removed,true);assert.equal(await options.read('chrome.permissions.contains({permissions:["nativeMessaging"]})'),false);
    const disabled=await until(async()=>{const s=await nativeStatus();return s.ok&&!s.data.enabled&&!s.data.nativeConnected?s.data:null;},'real permission onRemoved fence');
    let refusal;try{await mcpClient.tool('result',{runId:permissionRun.started.runId});}catch(error){refusal={code:error.code,outcome:error.outcome};}
    assert.ok(refusal,'Native reads unavailable while actual permission is absent');
    record('native.permission.removed',{api:'chrome.permissions.remove',permission:'nativeMessaging',removed,contains:false,settings:disabled,readRefusal:refusal});
    await reconnect({permissionPrompt:true});
    const restored=await settled(permissionRun.started.runId);
    assert.equal(restored.results[0].outcome.ok,false,'waiting source must not return its success value');
    snapshot('r101-real-Native-permission-revoke-restore',restored,{admissionRequestId:permissionRun.requestId,readRefusal:refusal,restoration:'trusted settings click and actual native consent'});
    }

    if(cases.includes('port')){
    const portRun=await startWaiting('port-loss');
    const installation=loadInstall();
    const pids=(await execute('/usr/sbin/lsof',['-t',installation.socketPath],{timeout:5000})).stdout.trim().split(/\s+/).map(Number);
    assert.equal(pids.length,1,'one owned Native socket process');
    const pid=pids[0],processInfo=(await execute('/bin/ps',['-p',String(pid),'-o','ppid=,command='],{timeout:5000})).stdout.trim();
    assert.ok(processInfo.includes(path.join(installation.installRoot,'native-host.mjs')),'exact isolated Native host executable');
    assert.equal(Number(processInfo.split(/\s+/)[0]),chrome.pid,'Native host belongs to this controlled Chrome');
    record('native.port.owned-process',{pid,parentPid:chrome.pid,instance:process.env.OPENDESK_NATIVE_INSTANCE,executable:path.join(installation.installRoot,'native-host.mjs')});
    process.kill(pid,'SIGTERM');
    const disconnected=await until(async()=>{const s=await nativeStatus();return s.ok&&s.data.enabled&&!s.data.nativeConnected?s.data:null;},'actual Native port disconnected');
    let portRefusal;try{await mcpClient.tool('result',{runId:portRun.started.runId});}catch(error){portRefusal={code:error.code,outcome:error.outcome};}
    assert.ok(portRefusal);record('native.port.disconnected',{disconnected,readRefusal:portRefusal});
    await reconnect();
    const recovered=await settled(portRun.started.runId);assert.equal(recovered.results[0].outcome.ok,false);
    snapshot('r101-real-Native-port-loss-read-only-recovery',recovered,{admissionRequestId:portRun.requestId,killedNativePid:pid,readRefusal:portRefusal,replayCount:0});
    }

    if(cases.includes('navigation')){
    const initial=await current(),navigationUrl=origin+'/demo-form.html?r101-navigation=controller';
    fs.writeFileSync(file,'export async function readSummary(page){await page.goto('+JSON.stringify(navigationUrl)+');return {title:await page.title(),url:await page.url()};}\n');
    const navigation=await mcpClient.tool('run',{bindingId,requestId:'r101-navigation-'+crypto.randomUUID(),deadlineMs:20000});
    const moving=await mcpClient.tool('result',{runId:navigation.runId});assert.equal(moving.run.state,'running');
    const navigated=await settled(navigation.runId),newDocument=await current();
    assert.equal(navigated.results[0].outcome.ok,true);assert.equal(navigated.value.url,navigationUrl);
    assert.notEqual(newDocument.documentId,initial.documentId);
    snapshot('r101-real-Controller-owned-navigation',navigated,{value:navigated.value,initialDocumentId:initial.documentId,newDocumentId:newDocument.documentId});
    }

    if(cases.includes('external')){
    const before=await current();
    const interrupted=await startWaiting('external-navigation');
    await target.call('Page.reload');
    const after=await until(async()=>{const d=await current();return d.documentId!==before.documentId?d:null;},'external navigation new document');
    const fenced=await settled(interrupted.started.runId);assert.equal(fenced.results[0].outcome.ok,false);
    assert.ok(['E_DOCUMENT_STALE','E_DOCUMENT_REPLACED','E_TARGET_CHANGED'].includes(fenced.error?.code),'old document operation must be rejected');
    // Wait beyond the original asynchronous command timeout, then read again.
    // This observes durable stability; it does not manufacture a late ACK.
    await new Promise(resolve=>setTimeout(resolve,8500));
    const later=await mcpClient.tool('result',{runId:interrupted.started.runId});
    assert.deepEqual(later.results,fenced.results);assert.equal(later.run.retirementState,'released');
    snapshot('r101-real-external-navigation-old-document-fence',later,{newDocumentId:after.documentId,lateObservationMs:8500,lateAckInjection:false});
    }
    if(cases.includes('late')){
      // Debugger breakpoints delay the real Host reply; no response, sender,
      // dispatchId or receiver state is constructed or assigned by this test.
      fs.writeFileSync(file,'export async function readSummary(page){return {version:401,title:await page.title()};}\n');
      const started=await mcpClient.tool('run',{bindingId,requestId:'r101-late-baseline-'+crypto.randomUUID()});
      const baseline=await settled(started.runId);assert.equal(baseline.value.version,401);
      const bridge=(await requestAgent('bridge.status',{},crypto.randomUUID(),3000)).result;
      assert.equal(bridge.hostRegistrations.length,1);const registrationId=bridge.hostRegistrations[0];
      const requestId='r101-late-read-'+crypto.randomUUID();
      const adapterCode=fs.readFileSync(path.join(report.packageDirectory,'ui/tool-shell.js'),'utf8');
      const adapterVariable=adapterCode.match(/replyNativeAgent\(\{requestId:([\w$]+)\.dispatchId/)[1];
      const transportCode=fs.readFileSync(path.join(report.packageDirectory,'native-agent/transport.js'),'utf8');
      const locals=transportCode.match(/acceptHostResponse:function\(([\w$]+),([\w$]+)\)\{.*?const ([\w$]+)=([\w$]+)\.get\(\2\.requestId\)/);
      assert.ok(locals,'actual compiled Native response consumer');
      const [,from,msg,item]=locals;
      async function breakpoint(session,file,sourceSuffix,line,column,condition){
        const map=JSON.parse(fs.readFileSync(path.join(report.packageDirectory,file+'.map'),'utf8'));
        const source=map.sources.find(s=>s.endsWith(sourceSuffix));assert.ok(source);
        const generated=generatedPositionFor(new TraceMap(map),{source,line,column,bias:LEAST_UPPER_BOUND});assert.ok(generated.line);
        const b=await session.call('Debugger.setBreakpointByUrl',{url:'chrome-extension://'+report.extensionId+'/'+file,lineNumber:generated.line-1,columnNumber:generated.column,condition});
        assert.ok(b.locations.length,'breakpoint resolves to the installed script');
        record('r101.late.breakpoint',{file,sourceSuffix,line,column,generated,locations:b.locations});return b.breakpointId;
      }
      let hostPause,workerPause;
      const offHost=tool.on('Debugger.paused',e=>{hostPause=e;}),offWorker=observedWorker.on('Debugger.paused',e=>{workerPause=e;});
      await tool.call('Debugger.enable');await observedWorker.call('Debugger.enable');
      try{
        const hostBreakpoint=await breakpoint(tool,'ui/tool-shell.js','host-adapter.js',139,10,adapterVariable+'.requestId==='+JSON.stringify(requestId));
        const original=requestAgent('run.get',{registrationId,runId:started.runId},requestId,15000).then(reply=>({reply}),e=>({error:{code:e.code,outcome:e.outcome}}));
        const paused=await until(()=>hostPause,'actual original Host reply paused',10000);
        const actual=(await tool.call('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:adapterVariable,returnByValue:true})).result.value;
        assert.equal(actual.requestId,requestId);assert.equal(actual.method,'run.get');assert.ok(actual.dispatchId);
        record('r101.late.original-dispatch',{requestId,dispatchId:actual.dispatchId,runId:started.runId,registrationId});
        await tool.call('Debugger.removeBreakpoint',{breakpointId:hostBreakpoint});
        const workerBreakpoint=await breakpoint(observedWorker,'native-agent/transport.js','service-worker.js',107,4,msg+'.requestId==='+JSON.stringify(actual.dispatchId));
        // Extension pages share a renderer: a paused Host also pauses Settings.
        // Fault the exact owned Native process instead of invoking a paused UI.
        const installation=loadInstall();
        const pids=(await execute('/usr/sbin/lsof',['-t',installation.socketPath],{timeout:5000})).stdout.trim().split(/\s+/).map(Number);
        assert.equal(pids.length,1);const pid=pids[0];
        const owned=(await execute('/bin/ps',['-p',String(pid),'-o','ppid=,command='],{timeout:5000})).stdout.trim();
        assert.equal(Number(owned.split(/\s+/)[0]),chrome.pid);assert.ok(owned.includes(path.join(installation.installRoot,'native-host.mjs')));
        process.kill(pid,'SIGTERM');
        await until(()=>!fs.existsSync(installation.socketPath),'terminated owned Native socket released');
        const originalOutcome=await original;
        record('r101.late.original-outcome',originalOutcome);
        assert.ok(originalOutcome.error||originalOutcome.reply?.error,'original disconnected read cannot claim delivery');
        await tool.call('Debugger.resume');
        const received=await until(()=>workerPause,'real old Host ACK reaches Native response consumer',10000);
        const expression='({requestId:'+msg+'.requestId,registrationId:'+msg+'.registrationId,pendingItemPresent:!!'+item+',hostRegistrationId:'+from+'.registrationId,resultRunId:'+msg+'.result?.runId})';
        const receipt=(await observedWorker.call('Debugger.evaluateOnCallFrame',{callFrameId:received.callFrames[0].callFrameId,expression,returnByValue:true})).result.value;
        assert.equal(receipt.requestId,actual.dispatchId);assert.equal(receipt.pendingItemPresent,false);
        record('r101.late.received-and-fenced',{...receipt,originalOutcome,rejection:'original pending dispatch removed by Native disconnect'});
        await observedWorker.call('Debugger.removeBreakpoint',{breakpointId:workerBreakpoint});await observedWorker.call('Debugger.resume');
        await reconnect();
        const fresh=await requestAgent('run.get',{registrationId,runId:started.runId},requestId,10000);
        assert.ok(fresh.result);assert.deepEqual(fresh.result.results,baseline.results);
        snapshot('r101-real-old-Native-ACK-received-and-rejected',baseline,{externalRequestId:requestId,oldDispatchId:actual.dispatchId,receivedAck:receipt,freshReadAccepted:true,mutationReplayCount:0,delayMethod:'CDP debugger pauses real Host before reply'});
      }finally{
        try{await tool.call('Debugger.resume');}catch{}try{await observedWorker.call('Debugger.resume');}catch{}
        await tool.call('Debugger.disable');await observedWorker.call('Debugger.disable');offHost();offWorker();
      }
    }
    await options.screenshot('native-lifecycle-restored.png');await target.screenshot('navigation-final-document.png');
  } finally {fs.writeFileSync(file,source);}
}

export async function runControllerLifecycle({project,bindingId,mcpClient,until,report,record}) {
 const source=fs.readFileSync(project+'/src/extract.js','utf8');
 try {
  fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){await page.waitForSelector("#r101-never-present",{timeout:10000});return 99;}\n');
  for(const kind of ['stop','deadline']){
   const started=await mcpClient.tool('run',{bindingId,requestId:'r101-'+kind+'-'+crypto.randomUUID(),deadlineMs:kind==='deadline'?1000:30000});
   const running=await mcpClient.tool('result',{runId:started.runId});assert.equal(running.run.state,'running');assert.equal(running.results.length,0);
   if(kind==='stop')await mcpClient.tool('stop',{runId:started.runId,requestId:'r101-stop-ack-'+crypto.randomUUID()});
   const result=await until(async()=>{const value=await mcpClient.tool('result',{runId:started.runId});return value.run.retirementState==='released'&&value.results.length?value:null;},'real Controller '+kind+' retirement',20000);
   assert.equal(result.results[0].outcome.ok,false);assert.equal(result.results[0].revision.sourceHash,started.source.sourceHash);
   if(kind==='deadline')assert.equal(result.error.code,'E_TIMEOUT');else assert.equal(result.run.state,'stopped');
   const row={name:'r101-real-Controller-'+kind,status:'PASS',runId:result.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,documentId:result.run.target.documentId,state:result.run.state,error:result.error,retirement:result.run.retirementState};
   report.tests.push(row);record('r101.lifecycle',row);
  }
 }finally{fs.writeFileSync(project+'/src/extract.js',source);}
}
