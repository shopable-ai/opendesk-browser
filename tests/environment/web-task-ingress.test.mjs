import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebTaskIngress} from '../../src/page-events/web-task-ingress.js';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY}
  from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {SITE_PROFILES_KEY,WEB_TASK_PROTOCOL} from '../../src/page-events/web-task-contract.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const site={id:'crm',version:'1.0.0',origin:'https://crm.example',adapter:'generic',
  adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true};
const source={tabId:9,documentId:'source-document',url:'https://crm.example/tasks'};
const scope={taskId:'crm.read',args:{id:'one'},targetUrl:'https://target.example/',sourceOrigin:site.origin,
  installation:{version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
    scriptId:'task:crm.read:1.0.0',revision:1,installationId:'installation-one',generation:1}};
const clone=value=>structuredClone(value);
function event(){
  const listeners=[];
  return {addListener:listener=>listeners.push(listener),emit:(...args)=>listeners.forEach(listener=>listener(...args))};
}

// Only Chrome observations and the original Foundation runs/snapshot boundary
// are mocked. Grants, consumption, replay and result validation use production code.
function harness(){
  const data={[SITE_PROFILES_KEY]:[clone(site)]};
  let counter=0,ledger,ingress;
  const state={permitted:true,tab:{id:source.tabId,url:source.url},
    frame:{documentId:source.documentId,url:source.url,documentLifecycle:'active'},
    slot:null,runs:[],results:[],snapshots:[],deliveries:[],ensures:0,submits:0,
    afterWrite:null,afterRead:null,deliveryReply:{ok:true},deliveryError:null};
  const id='extension-under-test',getURL=path=>`chrome-extension://${id}/${path}`;
  const page={id,tab:clone(state.tab),frameId:0,documentId:source.documentId,
    url:source.url,documentLifecycle:'active'};
  const host={id,url:getURL('cloud-control/runner.html'),documentId:'offscreen-one',frameId:0};
  const panel={id,url:getURL('sidepanel.html?hostInstanceId=settings-one'),documentId:'panel-one',frameId:0};
  state.contexts=[{contextType:'OFFSCREEN_DOCUMENT',documentUrl:host.url,documentId:host.documentId,frameId:0},
    {contextType:'SIDE_PANEL',documentUrl:panel.url,documentId:panel.documentId,frameId:0}];
  const storage={async get(key){
    const result={[key]:clone(data[key])};state.afterRead?.(key);return result;
  },async set(values){Object.assign(data,clone(values));state.afterWrite?.(values);}};
  const api={runtime:{id,getURL,async getContexts(filter){
    return clone(state.contexts.filter(context=>
      (!filter.contextTypes||filter.contextTypes.includes(context.contextType))&&
      (!filter.documentIds||filter.documentIds.includes(context.documentId))&&
      (!filter.documentUrls||filter.documentUrls.includes(context.documentUrl))));
  }},storage:{local:storage,onChanged:event()},
  tabs:{onRemoved:event(),async get(tabId){assert.equal(tabId,source.tabId);return clone(state.tab);},
    async sendMessage(tabId,message,options){
      state.deliveries.push({tabId,message:clone(message),options:clone(options),
        deliveryFence:data[CHATGPT_BRIDGE_LEDGER_KEY][message.requestId].webDelivery});
      if(state.deliveryError)throw state.deliveryError;
      return clone(state.deliveryReply);
    }},
  webNavigation:{onCommitted:event(),onHistoryStateUpdated:event(),onReferenceFragmentUpdated:event(),
    async getFrame(query){assert.deepEqual(query,{tabId:source.tabId,frameId:0});return clone(state.frame);}},
  permissions:{onRemoved:event(),async contains(query){
    assert.deepEqual(query,{origins:['https://crm.example/*']});return state.permitted;
  }}};
  const foundation={storage:{async transaction(stores,mode,read){
    assert.deepEqual(stores,['runs']);assert.equal(mode,'readonly');
    return read({get(store,key){assert.equal(store,'runs');assert.equal(key,'@slot');return clone(state.slot);},
      all(store){assert.equal(store,'runs');return clone(state.runs);}});
  }},authority:{async snapshotControllerRun(query,sender){
    state.snapshots.push({query:clone(query),sender:clone(sender)});
    return {run:clone(state.runs.find(run=>run.runId===query.runId)),results:clone(state.results)};
  }}};
  const restart=()=>{
    ledger=createChatGPTBridgeTriggerLedger({storage,
      generateId:()=>`88888888-8888-4888-8888-${String(++counter).padStart(12,'0')}`});
    ingress=createWebTaskIngress({api,ledger,loadFoundation:async()=>foundation,
      ensureRunner:async()=>{state.ensures++;}});
  };
  restart();
  const handle=(kind,body={},sender=page)=>ingress.handle({protocol:WEB_TASK_PROTOCOL,kind,...body},sender);
  const admit=(candidateId='candidate-one',patch={})=>handle('candidate',{candidateText:JSON.stringify({
    protocol:'webflow.task.intent.v1',candidateId,taskId:scope.taskId,args:scope.args,
    targetUrl:scope.targetUrl,...patch})});
  const submit=(request,sender=host)=>ledger.withControllerAdmission({
    ...request,paramsWire:encodeValue(request.params)},async()=>{state.submits++;return {runId:'run-one'};},
  row=>ingress.verifySubmission(row,sender));
  return {api,state,data,page,host,panel,handle,admit,submit,restart,
    get ledger(){return ledger;},
    async approve(value=scope){await ledger.approveAuto(value);await ledger.setAutoEnabled(true);},
    async claimed(){await this.approve();const admitted=await admit();
      return {admitted,request:await handle('claim',{},host)};},
    async completed(){const {admitted,request}=await this.claimed();await submit(request);
      const revision={scriptId:scope.installation.scriptId,revision:1,sourceHash:scope.installation.contentHash};
      state.runs.push({tag:'controller-run',namespace:'tool:'+id,requestId:admitted.requestId,
        hostDocumentId:host.documentId,runId:'run-one',resultId:'result-one',state:'completed',
        retirementState:'released',sourceKind:'saved',scriptId:revision.scriptId,
        contentHash:revision.sourceHash,revision});
      state.results.push({tag:'controller-result',runId:'run-one',resultId:'result-one',state:'completed',
        revision:clone(revision),sourceKind:'saved',outcome:{ok:true,valueWire:encodeValue({value:42})}});
      return admitted;
    }};
}

for(const [name,patch] of [
  ['foreign extension',{id:'forged-extension'}],['iframe',{frameId:2}],
  ['forged document',{documentId:'forged-document'}],['inactive document',{documentLifecycle:'prerender'}],
  ['incognito tab',{tab:{id:source.tabId,incognito:true}}],
  ['forged sender URL',{url:'https://crm.example/forged'}]
])test(`rejects a candidate from ${name}`,async()=>{
  const h=harness();await h.approve();
  await assert.rejects(h.handle('candidate',{candidateText:'{}'},{...h.page,...patch}),{code:'E_WEB_TASK_SOURCE'});
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY],undefined);
  assert.equal(h.state.ensures,0);
});

for(const [name,change] of [
  ['a navigated document',h=>{h.state.frame.documentId='new-document';}],
  ['a pending navigation',h=>{h.state.tab.pendingUrl='https://elsewhere.example/';}],
  ['revoked Chrome permission',h=>{h.state.permitted=false;h.api.permissions.onRemoved.emit({});}]
])test(`rejects admission after ${name}`,async()=>{
  const h=harness();await h.approve();change(h);
  await assert.rejects(h.admit(),{code:'E_WEB_TASK_SOURCE'});
  assert.equal(h.state.ensures,0);
});

test('rejects a registered site whose reviewed grant belongs to another origin',async()=>{
  const h=harness();await h.approve({...scope,sourceOrigin:'https://other.example'});
  await assert.rejects(h.admit(),{code:'E_WEBFLOW_AUTO_DENIED'});
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY],undefined);
});

test('rejects candidates from an unregistered generic site',async()=>{
  const h=harness();await h.approve();h.data[SITE_PROFILES_KEY]=[];
  await assert.rejects(h.admit(),{code:'E_WEB_TASK_PROFILE'});
});

test('admits a registered generic candidate only once across worker restart',async()=>{
  const h=harness();await h.approve();const admitted=await h.admit();
  const row=await h.ledger.inspectWebTask(admitted.requestId);
  assert.deepEqual(row.site,site);assert.deepEqual(row.source,source);
  assert.equal(admitted.state,'approved');assert.equal(h.state.ensures,1);
  h.restart();await assert.rejects(h.admit(),{code:'E_BRIDGE_REPLAY'});
  assert.equal(Object.keys(h.data[CHATGPT_BRIDGE_LEDGER_KEY]).length,1);
});

for(const [name,patch] of [['parameters',{args:{id:'other'}}],['target',{targetUrl:'https://target.example/other'}]])
  test(`rejects candidate ${name} outside the reviewed grant`,async()=>{
    const h=harness();await h.approve();
    await assert.rejects(h.admit('candidate-one',patch),{code:'E_BRIDGE_CONTEXT'});
  });

for(const [name,mutate] of [
  ['a webpage',h=>h.page],['a Side Panel',h=>h.panel],
  ['a forged offscreen document',h=>({...h.host,documentId:'fake-host'})],
  ['an extension tab',h=>({...h.host,tab:{id:2}})],
  ['a missing native offscreen context',h=>{h.state.contexts=[];return h.host;}]
])test(`rejects claim from ${name} without consuming the candidate`,async()=>{
  const h=harness();await h.approve();const admitted=await h.admit();
  await assert.rejects(h.handle('claim',{},mutate(h)),{code:'E_OWNER'});
  assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).status,'approved');
});

for(const slot of [{currentRunId:'running'}, {preview:{id:'preview'}}])
  test(`leaves the candidate approved while the Foundation ${slot.currentRunId?'run':'preview'} slot is busy`,async()=>{
    const h=harness();await h.approve();const admitted=await h.admit();h.state.slot=slot;
    assert.equal(await h.handle('claim',{},h.host),null);
    assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).status,'approved');
    h.state.slot=null;assert.equal((await h.handle('claim',{},h.host)).requestId,admitted.requestId);
  });

test('persists consumption and original host before a lost claim ACK and prevents another host reclaim',async()=>{
  const h=harness();await h.approve();const admitted=await h.admit();
  h.state.afterWrite=values=>{
    const row=values[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId];
    if(row?.status==='consumed'){
      assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].webHostDocumentId,h.host.documentId);
      throw Error('simulated lost claim ACK after durable commit');
    }
  };
  await assert.rejects(h.handle('claim',{},h.host),/lost claim ACK/);
  h.state.afterWrite=null;h.restart();h.host.documentId='offscreen-two';
  h.state.contexts[0].documentId=h.host.documentId;
  assert.equal(await h.handle('claim',{},h.host),null);
  assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).status,'consumed');
});

test('submits the original Controller request exactly once through the ingress verifier',async()=>{
  const h=harness();const {request}=await h.claimed();
  assert.deepEqual(await h.submit(request),{runId:'run-one'});
  await assert.rejects(h.submit(request),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.state.submits,1);
});

for(const [name,change,code] of [
  ['revoked permission',h=>{h.state.permitted=false;},'E_WEB_TASK_SOURCE'],
  ['navigated source',h=>{h.state.frame.documentId='new-source';},'E_WEB_TASK_SOURCE'],
  ['disabled profile',h=>{h.data[SITE_PROFILES_KEY][0].enabled=false;},'E_WEB_TASK_PROFILE'],
  ['revoked task grant',h=>h.ledger.revokeAuto(scope.taskId),'E_WEBFLOW_AUTO_DENIED']
])test(`does not consume a claim with ${name}`,async()=>{
  const h=harness();await h.approve();const admitted=await h.admit();await change(h);
  assert.equal(await h.handle('claim',{},h.host),null);
  const retired=await h.ledger.inspectWebTask(admitted.requestId);
  assert.equal(retired.status,'revoked');assert.equal(retired.webInvalidReason,code);
});

test('rejects submission by another genuine offscreen host',async()=>{
  const h=harness();const {request}=await h.claimed();
  const other={...h.host,documentId:'offscreen-two'};
  h.state.contexts[0].documentId=other.documentId;
  await assert.rejects(h.submit(request,other),{code:'E_WEB_TASK_OWNER'});
  assert.equal(h.state.submits,0);
});

for(const [name,mutate,code] of [
  ['profile version',h=>{h.data[SITE_PROFILES_KEY][0].version='1.0.1';},'E_WEB_TASK_PROFILE'],
  ['installation generation',(_h,request)=>{request.expectedTaskGeneration++;},'E_BRIDGE_CONTEXT'],
  ['source document',h=>{h.state.frame.documentId='navigated';},'E_WEB_TASK_SOURCE'],
  ['Chrome permission',h=>{h.state.permitted=false;},'E_WEB_TASK_SOURCE']
])test(`rejects submission after ${name} changes`,async()=>{
  const h=harness();const {request}=await h.claimed();mutate(h,request);
  await assert.rejects(h.submit(request),{code});assert.equal(h.state.submits,0);
});

for(const [name,emit] of [
  ['permission removal',h=>h.api.permissions.onRemoved.emit({})],
  ['top-frame navigation',h=>h.api.webNavigation.onCommitted.emit({tabId:source.tabId,frameId:0})]
])test(`rejects ${name} during final submission verification`,async()=>{
  const h=harness();const {request}=await h.claimed();let reads=0;
  h.state.afterRead=key=>{if(key===SITE_PROFILES_KEY&&++reads===2)emit(h);};
  await assert.rejects(h.submit(request),{code:'E_WEB_TASK_REVOKED'});
  assert.equal(h.state.submits,0);
});

test('queries same-document persistent run status without resubmitting',async()=>{
  const h=harness();const admitted=await h.completed();h.restart();
  const before=clone(h.data[CHATGPT_BRIDGE_LEDGER_KEY]);
  for(let i=0;i<2;i++)assert.deepEqual(await h.handle('query',{requestId:admitted.requestId}),{
    requestId:admitted.requestId,state:'completed',runId:'run-one',resultId:'result-one',delivery:'not-sent'});
  assert.equal(h.state.submits,1);assert.equal(h.state.deliveries.length,0);
  assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY],before);
});

test('rejects query by a different live document at the same URL',async()=>{
  const h=harness();const {admitted}=await h.claimed();
  h.state.frame.documentId='replacement-document';
  await assert.rejects(h.handle('query',{requestId:admitted.requestId},
    {...h.page,documentId:h.state.frame.documentId}),{code:'E_WEB_TASK_SOURCE'});
});

test('rejects same-document query after its reviewed task grant is revoked',async()=>{
  const h=harness();const {admitted}=await h.claimed();await h.ledger.revokeAuto(scope.taskId);
  await assert.rejects(h.handle('query',{requestId:admitted.requestId}),{code:'E_WEBFLOW_AUTO_DENIED'});
  assert.equal(h.state.submits,0);
});

test('returns UNKNOWN without executing when no durable Foundation run exists',async()=>{
  const h=harness();const {admitted}=await h.claimed();
  assert.deepEqual(await h.handle('settle',{requestId:admitted.requestId},h.host),{
    requestId:admitted.requestId,state:'UNKNOWN'});
  assert.equal(h.state.submits,0);assert.equal(h.state.deliveries.length,0);
});

test('settles the original durable result into the exact source document only once',async()=>{
  const h=harness();const admitted=await h.completed();
  assert.deepEqual(await h.handle('settle',{requestId:admitted.requestId},h.host),{
    requestId:admitted.requestId,state:'completed',runId:'run-one',resultId:'result-one'});
  const delivery=h.state.deliveries[0];
  assert.equal(delivery.tabId,source.tabId);assert.deepEqual(delivery.options,{documentId:source.documentId});
  assert.equal(delivery.deliveryFence,'dispatching');
  assert.deepEqual(delivery.message.result.data,{value:42});
  assert.equal(h.state.snapshots[0].sender.documentId,h.host.documentId);
  h.restart();await assert.rejects(h.handle('settle',{requestId:admitted.requestId},h.host),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.state.deliveries.length,1);
  assert.equal((await h.handle('query',{requestId:admitted.requestId})).delivery,'delivered');
});

test('does not resend a durable result after an unknown delivery ACK',async()=>{
  const h=harness();const admitted=await h.completed();h.state.deliveryReply={ok:false};
  await assert.rejects(h.handle('settle',{requestId:admitted.requestId},h.host),{code:'E_WEB_TASK_UNKNOWN'});
  h.restart();await assert.rejects(h.handle('settle',{requestId:admitted.requestId},h.host),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.state.deliveries.length,1);
  assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).webDelivery,'dispatching');
});

test('fences concurrent settlement before either result delivery can be repeated',async()=>{
  const h=harness();const admitted=await h.completed();
  const settled=await Promise.allSettled([
    h.handle('settle',{requestId:admitted.requestId},h.host),
    h.handle('settle',{requestId:admitted.requestId},h.host)
  ]);
  assert.equal(settled.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(settled.find(result=>result.status==='rejected').reason.code,'E_BRIDGE_REPLAY');
  assert.equal(h.state.deliveries.length,1);
});

test('rejects settlement from a different genuine offscreen document',async()=>{
  const h=harness();const admitted=await h.completed();const host={...h.host,documentId:'offscreen-two'};
  h.state.contexts[0].documentId=host.documentId;
  await assert.rejects(h.handle('settle',{requestId:admitted.requestId},host),{code:'E_WEB_TASK_OWNER'});
  assert.equal(h.state.snapshots.length,0);assert.equal(h.state.deliveries.length,0);
});

test('keeps the dispatch fence if permission is removed immediately before delivery',async()=>{
  const h=harness();const admitted=await h.completed();
  h.state.afterWrite=values=>{
    if(values[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId]?.webDelivery==='dispatching'){
      h.state.permitted=false;h.api.permissions.onRemoved.emit({});
    }
  };
  await assert.rejects(h.handle('settle',{requestId:admitted.requestId},h.host),{code:'E_WEB_TASK_SOURCE'});
  assert.equal(h.state.deliveries.length,0);
  assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).webDelivery,'dispatching');
});

for(const policy of ['revoke','replace'])test(`completed grant ${policy} during final source verification prevents result delivery`,async()=>{
  const h=harness();const admitted=await h.completed();
  const original=h.api.webNavigation.getFrame;
  let revoked=false;
  h.api.webNavigation.getFrame=async query=>{
    if(!revoked&&h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].webDelivery==='dispatching'){
      revoked=true;
      if(policy==='revoke')await h.ledger.revokeAuto(scope.taskId);
      else await h.ledger.approveAuto({...scope,args:{id:'different'}});
    }
    return original(query);
  };
  await assert.rejects(h.handle('settle',{requestId:admitted.requestId},h.host),{code:'E_WEBFLOW_AUTO_DENIED'});
  assert.equal(revoked,true);assert.equal(h.state.deliveries.length,0);
  assert.equal((await h.ledger.inspectWebTask(admitted.requestId)).webDelivery,'dispatching');
});

test('a stale profile request is retired without blocking the next compatible request',async()=>{
  const h=harness();await h.approve();const stale=await h.admit('candidate-stale');
  h.data[SITE_PROFILES_KEY][0].version='1.0.1';
  const valid=await h.admit('candidate-valid');
  const request=await h.handle('claim',{},h.host);
  assert.equal(request.requestId,valid.requestId);
  const retired=await h.ledger.inspectWebTask(stale.requestId);
  assert.equal(retired.status,'revoked');assert.equal(retired.webInvalidReason,'E_WEB_TASK_PROFILE');
  h.restart();await assert.rejects(h.admit('candidate-stale'),{code:'E_BRIDGE_REPLAY'});
});

for(const [name,mutate,code] of [
  ['ambiguous runs',h=>h.state.runs.push({...h.state.runs[0],runId:'run-two'}),'E_WEB_TASK_UNKNOWN'],
  ['missing durable result',h=>{h.state.results=[];},'E_BRIDGE_RESULT'],
  ['result revision mismatch',h=>{h.state.results[0].revision.revision=2;},'E_BRIDGE_RESULT'],
  ['run source hash mismatch',h=>{h.state.runs[0].contentHash='c'.repeat(64);},'E_BRIDGE_DURABLE']
])test(`rejects settlement with ${name}`,async()=>{
  const h=harness();const admitted=await h.completed();mutate(h);
  await assert.rejects(h.handle('settle',{requestId:admitted.requestId},h.host),{code});
  assert.equal(h.state.deliveries.length,0);
});

test('allows profile management only from a Chrome-confirmed Side Panel without issuing a task grant',async()=>{
  const h=harness();const profiles=[{...site,version:'1.0.1'}];
  assert.deepEqual(await h.handle('profiles-save',{profiles,expectedProfiles:[site]},h.panel),{profiles});
  assert.deepEqual(await h.handle('profiles-read',{},h.panel),{profiles});
  assert.equal((await h.ledger.readAutoSettings()).enabled,false);
  assert.deepEqual((await h.ledger.readAutoSettings()).grants,{});
});

test('Chrome storage field ordering does not turn a confirmed profile write into UNKNOWN',async()=>{
  const h=harness(),next={...site,version:'1.0.1'};
  h.state.afterWrite=values=>{
    if(values[SITE_PROFILES_KEY])h.data[SITE_PROFILES_KEY]=values[SITE_PROFILES_KEY].map(row=>
      Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))));
  };
  const saved=await h.handle('profiles-save',{profiles:[next],expectedProfiles:[site]},h.panel);
  assert.deepEqual(saved.profiles,[next]);
  assert.deepEqual((await h.ledger.readAutoSettings()).grants,{});
  // The next reviewed CAS can use a semantically identical object with a different field order.
  await h.handle('profiles-save',{profiles:[site],expectedProfiles:[next]},h.panel);
});

test('profile readback mismatch and invalid CAS input remain fail-closed',async()=>{
  const h=harness();
  await assert.rejects(h.handle('profiles-save',{profiles:[],expectedProfiles:[{...site,unexpected:true}]},h.panel),
    {code:'E_WEB_TASK_PROFILE_CHANGED'});
  h.state.afterWrite=values=>{if(values[SITE_PROFILES_KEY])h.data[SITE_PROFILES_KEY][0].version='1.0.2';};
  await assert.rejects(h.handle('profiles-save',{profiles:[{...site,version:'1.0.1'}],expectedProfiles:[site]},h.panel),
    {code:'E_WEB_TASK_UNKNOWN'});
});

test('stale profile review cannot overwrite a newer trusted registration',async()=>{
  const h=harness();
  await h.handle('profiles-save',{profiles:[{...site,version:'1.0.1'}],expectedProfiles:[site]},h.panel);
  await assert.rejects(h.handle('profiles-save',{profiles:[],expectedProfiles:[site]},h.panel),
    {code:'E_WEB_TASK_PROFILE_CHANGED'});
  assert.equal(h.data[SITE_PROFILES_KEY][0].version,'1.0.1');
});

for(const [name,mutate] of [
  ['webpage',h=>h.page],
  ['forged Side Panel',h=>({...h.panel,documentId:'fake-panel'})],
  ['tab posing as Side Panel',h=>({...h.panel,tab:{id:1}})],
  ['non-Side-Panel Chrome context',h=>{h.state.contexts[1].contextType='TAB';return h.panel;}]
])test(`prevents a ${name} from saving profiles`,async()=>{
  const h=harness();const before=clone(h.data[SITE_PROFILES_KEY]);
  await assert.rejects(h.handle('profiles-save',{profiles:[]},mutate(h)));
  assert.deepEqual(h.data[SITE_PROFILES_KEY],before);
});
