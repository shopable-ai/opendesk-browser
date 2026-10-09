import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAgentService} from '../../src/native-agent/service-worker.js';
import {AGENT_LEDGER_KEY,AGENT_ENABLED_KEY} from '../../src/native-agent/protocol.js';

const drain=()=>new Promise(resolve=>setTimeout(resolve,0));
function mock({enabled=true,granted=true}={}){
  const stored={[AGENT_ENABLED_KEY]:enabled}, requests=[],responses=[];
  let native;
  const event=()=>{const listeners=new Set();return {
    addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l),fire:(...args)=>{for(const l of listeners)l(...args);}
  };};
  const api={
    runtime:{id:'abcdefghijklmnopabcdefghijklmnop',getManifest:()=>({version:'0.1.0'}),
      getURL:page=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+page,
      connectNative:()=>{native={onMessage:event(),onDisconnect:event(),
        postMessage:msg=>responses.push(msg),disconnect(){this.onDisconnect.fire();}};return native;}},
    permissions:{contains:async()=>granted,onRemoved:event()},
    storage:{local:{get:async key=>({[key]:structuredClone(stored[key])}),
      set:async values=>Object.assign(stored,structuredClone(values))}}
  };
  const port={registrationId:'registration-1',postMessage:msg=>requests.push(msg)};
  const hostPorts=new Map([['doc-1',port]]);
  const service=createNativeAgentService({api,hostPorts});
  return {api,stored,requests,responses,port,hostPorts,service,native:()=>native};
}
const message=(requestId,method,params={})=>({v:1,kind:'request',requestId,method,params});
const settingsSender=f=>({id:f.api.runtime.id,
  url:f.api.runtime.getURL('native-agent/settings.html'),documentId:'settings-document'});
test('approved permission with stale Chrome API binding reports reload without interrupting hosts',async t=>{
  const f=mock({enabled:false});t.after(()=>f.service.dispose());await f.service.ready;
  f.api.runtime.connectNative=undefined;
  await f.service.handleSettings({type:'enable'},settingsSender(f));
  const status=await f.service.handleSettings({type:'status'},settingsSender(f));
  assert.equal(status.enabled,true);assert.equal(status.requiresReload,true);
  assert.equal(status.nativeConnected,false);assert.equal(f.hostPorts.size,1);
  assert.equal(f.stored[AGENT_ENABLED_KEY],true);
});
const deferred=()=>{
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
};

for(const boundary of ['permission-removed','dispose']) {
  test(`startup permission check cannot reconnect after ${boundary}`,async t=>{
    const f=mock();t.after(()=>f.service.dispose());
    const entered=deferred(),grant=deferred();
    f.api.permissions.contains=()=>{entered.resolve();return grant.promise;};
    await entered.promise;
    if(boundary==='permission-removed')f.api.permissions.onRemoved.fire({permissions:['nativeMessaging']});
    else f.service.dispose();
    grant.resolve(true);await f.service.ready;await drain();
    assert.equal((await f.service.handleSettings({type:'status'},settingsSender(f))).enabled,false);
    assert.equal(f.native(),undefined);
    if(boundary==='permission-removed')assert.equal(f.stored[AGENT_ENABLED_KEY],false);
  });
}

for(const boundary of ['disable','permission-removed','disconnect-reconnect','disable-enable','dispose']) {
  test(`reserved mutation never dispatches across ${boundary}`,async t=>{
    const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
    f.native().onMessage.fire({v:1,kind:'hello'});
    const entered=deferred(),release=deferred(),originalSet=f.api.storage.local.set;
    let held=false;
    f.api.storage.local.set=async values=>{
      await originalSet(values);
      if(!held&&values[AGENT_LEDGER_KEY]?.['held-save']?.state==='OUTCOME_UNKNOWN') {
        held=true;entered.resolve();await release.promise;
      }
    };
    const payload={registrationId:'registration-1',scriptId:'held',expectedRevision:0,
      sourceUtf8:'async function main(){return 1}'};
    f.native().onMessage.fire(message('held-save','script.save',payload));
    await entered.promise;
    if(boundary==='disable'||boundary==='disable-enable')
      await f.service.handleSettings({type:'disable'},settingsSender(f));
    else if(boundary==='permission-removed')
      f.api.permissions.onRemoved.fire({permissions:['nativeMessaging']});
    else if(boundary==='dispose')f.service.dispose();
    else f.native().onDisconnect.fire();
    if(boundary==='disconnect-reconnect'||boundary==='disable-enable') {
      await f.service.handleSettings({type:'enable'},settingsSender(f));
      f.native().onMessage.fire({v:1,kind:'hello'});
    }
    release.resolve();
    for(let i=0;i<80&&f.stored[AGENT_LEDGER_KEY]['held-save'].state==='OUTCOME_UNKNOWN';i++)
      await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.requests.length,0,'no Host operation may begin after its admission authority changed');
    const entry=f.stored[AGENT_LEDGER_KEY]['held-save'];
    assert.equal(entry.state,'FAILED_CONFIRMED');
    assert.equal(entry.reply.error.outcome,'NOT_DISPATCHED');
  });
}

test('Native permission is rechecked immediately before dispatch',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  f.native().onMessage.fire({v:1,kind:'hello'});
  f.api.permissions.contains=async()=>false;
  f.native().onMessage.fire(message('removed-before-event','script.save',{
    registrationId:'registration-1',scriptId:'s',expectedRevision:0,sourceUtf8:'async function main(){}'}));
  for(let i=0;i<80&&!f.responses.some(r=>r.requestId==='removed-before-event');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,0);
  assert.equal(f.responses.findLast(r=>r.requestId==='removed-before-event')?.error?.code,'E_PERMISSION');
  assert.equal(f.stored[AGENT_LEDGER_KEY]['removed-before-event'].state,'FAILED_CONFIRMED');
});

test('a late disconnect from an old Native port cannot cancel a new connection request',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  const old=f.native();old.onMessage.fire({v:1,kind:'hello'});old.onDisconnect.fire();
  await f.service.handleSettings({type:'enable'},settingsSender(f));
  f.native().onMessage.fire({v:1,kind:'hello'});
  f.native().onMessage.fire(message('new-save','script.save',{
    registrationId:'registration-1',scriptId:'s',expectedRevision:0,sourceUtf8:'async function main(){}'}));
  for(let i=0;i<80&&!f.requests.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,1);
  old.onDisconnect.fire();
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',registrationId:'registration-1',
    requestId:f.requests.at(-1).request.dispatchId,result:{revision:1,contentHash:'a'.repeat(64)}});
  for(let i=0;i<80&&!f.responses.some(r=>r.requestId==='new-save');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.responses.findLast(r=>r.requestId==='new-save')?.result?.revision,1);
  assert.equal(f.stored[AGENT_LEDGER_KEY]['new-save'].state,'ACKNOWLEDGED');
});

for(const boundary of ['disable','permission-removed']) {
  test(`a pending enable permission check cannot overwrite ${boundary}`,async t=>{
    const f=mock({enabled:false});t.after(()=>f.service.dispose());await f.service.ready;
    const entered=deferred(),grant=deferred();
    f.api.permissions.contains=()=>{entered.resolve();return grant.promise;};
    const enabling=f.service.handleSettings({type:'enable'},settingsSender(f));
    await entered.promise;
    if(boundary==='disable')await f.service.handleSettings({type:'disable'},settingsSender(f));
    else f.api.permissions.onRemoved.fire({permissions:['nativeMessaging']});
    const rejected=assert.rejects(enabling,{code:'E_PERMISSION'});
    grant.resolve(true);await rejected;await drain();
    assert.equal((await f.service.handleSettings({type:'status'},settingsSender(f))).enabled,false);
    assert.equal(f.stored[AGENT_ENABLED_KEY],false);
    assert.equal(f.native(),undefined,'the withdrawn enable must not open a Native connection');
  });
}

test('a pending enable storage write cannot persist over a newer disable',async t=>{
  const f=mock({enabled:false});t.after(()=>f.service.dispose());await f.service.ready;
  const entered=deferred(),release=deferred(),originalSet=f.api.storage.local.set;
  f.api.storage.local.set=async values=>{
    if(values[AGENT_ENABLED_KEY]===true){entered.resolve();await release.promise;}
    return originalSet(values);
  };
  const enabling=f.service.handleSettings({type:'enable'},settingsSender(f));
  await entered.promise;
  const rejected=assert.rejects(enabling,{code:'E_PERMISSION'});
  const disabling=f.service.handleSettings({type:'disable'},settingsSender(f));
  await drain();release.resolve();
  await rejected;assert.equal((await disabling).enabled,false);
  assert.equal(f.stored[AGENT_ENABLED_KEY],false);
  assert.equal(f.native(),undefined);
});

test('an old Host ACK cannot match a new connection read with the same external requestId',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  f.stored[AGENT_LEDGER_KEY]={
    owner1:{method:'run.start',runId:'run-1',registrationId:'registration-1',state:'ACKNOWLEDGED'},
    owner2:{method:'run.start',runId:'run-2',registrationId:'registration-1',state:'ACKNOWLEDGED'}
  };
  const old=f.native();old.onMessage.fire({v:1,kind:'hello'});
  old.onMessage.fire(message('reused-read','run.get',{registrationId:'registration-1',runId:'run-1'}));
  for(let i=0;i<80&&f.requests.length<1;i++)await new Promise(resolve=>setTimeout(resolve,5));
  const first=f.requests[0];assert.ok(first);old.onDisconnect.fire();
  await f.service.handleSettings({type:'enable'},settingsSender(f));
  f.native().onMessage.fire({v:1,kind:'hello'});
  f.native().onMessage.fire(message('reused-read','run.get',{registrationId:'registration-1',runId:'run-2'}));
  for(let i=0;i<80&&f.requests.length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
  const second=f.requests[1];assert.ok(second);
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',registrationId:'registration-1',
    requestId:first.request.dispatchId,result:{runId:'run-1'}});
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',registrationId:'registration-1',
    requestId:second.request.dispatchId,result:{runId:'run-2'}});
  for(let i=0;i<80&&!f.responses.some(r=>r.requestId==='reused-read');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.notEqual(first.request.dispatchId,second.request.dispatchId);
  assert.equal(f.responses.findLast(r=>r.requestId==='reused-read')?.result?.runId,'run-2');
});
test('enabled Native handshake sends version and correct extension identity',async t=>{
  const f=mock();t.after(()=>f.service.dispose());
  await f.service.ready;
  assert.ok(f.native());
  f.native().onMessage.fire({v:1,kind:'hello'});
  assert.equal(f.responses[0].kind,'welcome');
  f.native().onMessage.fire(message('s1','bridge.status'));
  await drain();assert.equal(f.responses.at(-1).result.nativeConnected,true);
});
test('default-off requires a packaged Settings sender and real granted Native permission',async t=>{
  const f=mock({enabled:false,granted:false});t.after(()=>f.service.dispose());
  await f.service.ready;assert.equal(f.native(),undefined,'no background Native connection before opt-in');
  const sender={id:f.api.runtime.id,url:f.api.runtime.getURL('native-agent/settings.html'),documentId:'settings-document'};
  await assert.rejects(()=>f.service.handleSettings({type:'enable'},
    {...sender,url:'chrome-extension://invalid/settings.html'}),{code:'E_OWNER'});
  await assert.rejects(()=>f.service.handleSettings({type:'enable'},sender),{code:'E_PERMISSION_REQUIRED'});
  assert.equal(f.native(),undefined,'unapproved page does not launch a Host');
});
test('request hash journal deduplicates after real Host admission; conflicting bytes fail',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  f.native().onMessage.fire({v:1,kind:'hello'});
  const payload={registrationId:'registration-1',source:{kind:'draft',sourceUtf8:'async function main(){}'},
    target:{windowId:1,tabId:2,frameId:0,documentId:'d',url:'https://example.test',origin:'https://example.test'},
    params:{}};
  f.native().onMessage.fire(message('call-1','run.start',payload));
  await drain();await drain();
  assert.equal(f.requests.length,1);
  const forwarded=f.requests[0];
  assert.equal(forwarded.request.requestId,'call-1','Controller admission retains the CLI request ID');
  assert.notEqual(forwarded.request.dispatchId,'call-1','Host ACK uses an independent dispatch correlation');
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',registrationId:'registration-1',
    requestId:forwarded.request.dispatchId,result:{runId:'run-1',state:'running'}});
  await drain();await drain();
  assert.equal(f.responses.at(-1).result.runId,'run-1');
  assert.equal(f.stored[AGENT_LEDGER_KEY]['call-1'].runId,'run-1');
  f.native().onMessage.fire(message('call-1','run.start',payload));
  await drain();await drain();
  assert.equal(f.requests.length,1,'identical call never executes twice');
  assert.equal(f.responses.at(-1).result.runId,'run-1');
  f.native().onMessage.fire(message('call-1','run.start',{...payload,source:{kind:'draft',sourceUtf8:'DIFFERENT'}}));
  await drain();await drain();
  assert.equal(f.responses.at(-1).error.code,'E_REQUEST_CONFLICT');
});
test('dispatched but unanswered calls are never retried, even if same id reappears',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;f.native().onMessage.fire({v:1,kind:'hello'});
  const p={registrationId:'registration-1',scriptId:'s',sourceUtf8:'async function main(){}',expectedRevision:0};
  f.native().onMessage.fire(message('save-1','script.save',p));
  // Reservation, storage.local persistence and permission checks are async.
  // Observe the first real Host dispatch instead of assuming two event-loop turns.
  for(let i=0;i<100&&f.requests.length<1;i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,1);
  f.native().onDisconnect.fire();
  const sender={id:f.api.runtime.id,url:f.api.runtime.getURL('native-agent/settings.html'),documentId:'s'};
  await f.service.handleSettings({type:'enable'},sender);
  f.native().onMessage.fire({v:1,kind:'hello'});
  f.native().onMessage.fire(message('save-1','script.save',p));
  // Native onDisconnect and storage.local persistence complete asynchronously.
  // Wait for the exact request's response, not a fixed number of event-loop turns.
  for(let i=0;i<200&&!f.responses.some(x=>x.requestId==='save-1'&&x.error?.code==='E_EFFECT_UNKNOWN');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,1);
  assert.equal(f.responses.findLast(x=>x.requestId==='save-1')?.error?.code,'E_EFFECT_UNKNOWN');
  assert.equal(f.stored[AGENT_LEDGER_KEY]['save-1'].state,'OUTCOME_UNKNOWN');
});
test('no live registered Host means no run reservation or Worker execution',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;f.native().onMessage.fire({v:1,kind:'hello'});
  f.hostPorts.clear();
  f.native().onMessage.fire(message('n1','run.start',{source:{kind:'draft',sourceUtf8:'x'},params:{}}));
  await drain();assert.equal(f.responses.at(-1).error.code,'E_HOST_NOT_READY');
  assert.equal(f.stored[AGENT_LEDGER_KEY],undefined);
});
test('run.get and run.stop cannot inspect arbitrary Sidebar-owned Run records',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;f.native().onMessage.fire({v:1,kind:'hello'});
  f.native().onMessage.fire(message('peek','run.get',{runId:'UI-OWNED'}));
  await drain();assert.equal(f.responses.at(-1).error.code,'E_PERMISSION');
  assert.equal(f.requests.length,0);
});

test('ACK journal write failure after Host action remains OUTCOME_UNKNOWN and never replays',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  f.native().onMessage.fire({v:1,kind:'hello'});
  const payload={registrationId:'registration-1',scriptId:'draft-a',
    sourceUtf8:'async function main(){return 1}',expectedRevision:0};
  f.native().onMessage.fire(message('save-ack-failure','script.save',payload));
  for(let i=0;i<80&&!f.requests.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,1,'request dispatched exactly once');
  const originalSet=f.api.storage.local.set;
  let blocked=false;
  f.api.storage.local.set=async values=>{
    if(!blocked && values[AGENT_LEDGER_KEY]?.['save-ack-failure']?.state==='ACKNOWLEDGED'){
      blocked=true;throw new Error('simulated storage failure after actual Host ACK');
    }
    return originalSet(values);
  };
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',
    registrationId:'registration-1',requestId:f.requests.at(-1).request.dispatchId,result:{revision:1,contentHash:'a'.repeat(64)}});
  for(let i=0;i<80&&!f.responses.some(x=>x.requestId==='save-ack-failure');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(blocked,true);
  const first=f.responses.findLast(x=>x.requestId==='save-ack-failure');
  assert.equal(first?.error?.code,'E_EFFECT_UNKNOWN');
  assert.equal(first?.error?.outcome,'OUTCOME_UNKNOWN',
    'cannot claim confirmed failure after Host performed a mutation');
  assert.equal(f.stored[AGENT_LEDGER_KEY]['save-ack-failure'].state,'OUTCOME_UNKNOWN');
  f.native().onMessage.fire(message('save-ack-failure','script.save',payload));
  for(let i=0;i<80&&f.responses.filter(x=>x.requestId==='save-ack-failure').length<2;i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,1,'duplicate request never dispatches after uncertain ACK');
  assert.equal(f.responses.findLast(x=>x.requestId==='save-ack-failure')?.error?.outcome,'OUTCOME_UNKNOWN');
});

test('run.get and run.stop remain pinned to the original authenticated Host registration',async t=>{
  const f=mock();t.after(()=>f.service.dispose());await f.service.ready;
  f.native().onMessage.fire({v:1,kind:'hello'});
  const payload={registrationId:'registration-1',
    source:{kind:'draft',sourceUtf8:'async function main(){return 2}'},
    target:{windowId:1,tabId:2,frameId:0,documentId:'d',
      url:'https://example.test',origin:'https://example.test'},params:{}};
  f.native().onMessage.fire(message('original-start','run.start',payload));
  for(let i=0;i<80&&!f.requests.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.requests.length,1);
  f.service.acceptHostResponse(f.port,{type:'native-agent.response',
    registrationId:'registration-1',requestId:f.requests.at(-1).request.dispatchId,
    result:{runId:'owned-run',state:'running'}});
  for(let i=0;i<80&&!f.stored[AGENT_LEDGER_KEY]?.['original-start']?.runId;i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.stored[AGENT_LEDGER_KEY]['original-start'].state,'ACKNOWLEDGED');
  const other={registrationId:'registration-2',
    postMessage:()=>{throw new Error('wrong Host must never receive an Agent-owned run');}};
  f.hostPorts.set('doc-2',other);
  f.native().onMessage.fire(message('wrong-get','run.get',
    {registrationId:'registration-2',runId:'owned-run'}));
  for(let i=0;i<80&&!f.responses.some(x=>x.requestId==='wrong-get');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.responses.findLast(x=>x.requestId==='wrong-get')?.error?.code,'E_PERMISSION');
  f.native().onMessage.fire(message('wrong-stop','run.stop',
    {registrationId:'registration-2',runId:'owned-run'}));
  for(let i=0;i<80&&!f.responses.some(x=>x.requestId==='wrong-stop');i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.responses.findLast(x=>x.requestId==='wrong-stop')?.error?.code,'E_PERMISSION');
  assert.equal(f.requests.length,1,'neither wrong-Host read nor stop is forwarded');
  assert.equal(f.stored[AGENT_LEDGER_KEY]['wrong-stop'],undefined,
    'unowned stop must not reserve a mutation journal entry');
});
