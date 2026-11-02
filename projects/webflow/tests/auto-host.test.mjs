// Component evidence: real Host + original durable ledger with injected Chrome/Controller boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTFixedBridgeHost} from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger,installChatGPTBridgeTriggerGate} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {createMethodRoutes} from '../../../src/platform/host/broker.js';

const protocol='opendesk.chatgpt.bridge.r12.v1';
const source={tabId:9,documentId:'chat-document',url:'https://chatgpt.com/c/webflow-auto-12345678'};
function harness(){
  const installation={version:'1.1.1',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
    scriptId:'task:baidu.search.top3:1.1.1',revision:1,installationId:'real-install',generation:1};
  const scope={taskId:'baidu.search.top3',args:{query:'OpenDesk Browser',limit:3},targetUrl:'https://www.baidu.com/',installation};
  const manifest={taskId:scope.taskId,version:installation.version,title:'百度搜索',siteOrigins:['https://www.baidu.com'],
    program:{revision:1,sourceHash:installation.contentHash},paramsSchema:{type:'object',additionalProperties:false,
      properties:{query:{type:'string',title:'搜索词',maxLength:120},limit:{type:'integer',title:'条数',enum:[3]}},required:['query','limit']}};
  const installed={taskId:scope.taskId,...installation,enabled:true},resolved={...installed,manifest};
  const catalog={taskId:scope.taskId,version:installation.version,manifestHash:installation.manifestHash,stage:'available',manifest};
  let data={},counter=0,permission=true,verified=true,afterGate=async()=>{},deliveryUnknown=false,runUnknown=false;
  let observed,snapshot;
  const storage={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))};
  const ledger=createChatGPTBridgeTriggerLedger({storage,generateId:()=>`66666666-6666-4666-8666-${String(++counter).padStart(12,'0')}`});
  const events={starts:[],deliveries:[],gates:[],controls:[]};
  let projectedRequest=null;
  const session=()=>({url:source.url,requestId:projectedRequest,status:'current',actions:{cancel:true},fields:{},tasks:[]});
  const sender={id:'extension',frameId:0,url:source.url,documentId:source.documentId,
    tab:{id:source.tabId,url:source.url,windowId:2,incognito:false}};
  const api={runtime:{id:'extension',async sendMessage(msg){
    events.gates.push(msg);
    try{
      const data=await (msg.kind==='auto-settings'?ledger.readAutoSettings():msg.kind==='auto-enable'?ledger.setAutoEnabled(msg.enabled):
        msg.kind==='auto-grant'?ledger.approveAuto(msg.scope):msg.kind==='auto-revoke'?ledger.revokeAuto(msg.taskId):
        msg.kind==='auto-admit'?ledger.admitAuto(msg):msg.kind==='reserve'?ledger.reserve(msg):
        msg.kind==='revoke-request'?ledger.revokeRequest(msg):ledger.assertConsumed(msg));
      await afterGate(msg);return {ok:true,data};
    }catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
  }},tabs:{query:async()=>[{...sender.tab}],get:async()=>({...sender.tab}),async sendMessage(tab,msg,options){
    assert.equal(tab,source.tabId);assert.equal(options.documentId,source.documentId);
    if(msg.kind==='sidebar-read')return {ok:true,data:session()};
    if(msg.kind==='sidebar-control'){events.controls.push(msg);return {ok:true,data:session()};}
    if(msg.kind==='progress'){projectedRequest=msg.requestId;return {};}
    events.deliveries.push(msg);await bridge.checkDelivery({...msg,kind:'check-delivery'},sender);
    if(deliveryUnknown)throw Error('send ACK lost');
    return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};
  }},webNavigation:{getFrame:async()=>({...source,documentLifecycle:'active'})},
  permissions:{contains:async()=>permission,onRemoved:{addListener(){},removeListener(){}}}};
  const client={request:async method=>method==='listTaskCatalog'?{installed:[installed],catalog:[catalog]}:resolved,
    controller:{snapshotControllerRun:async()=>structuredClone(snapshot)}};
  const authority={async startControllerRun(input){
    events.starts.push(input);const runId='run-'+events.starts.length,resultId='result-'+events.starts.length;
    const revision={scriptId:installation.scriptId,revision:1,sourceHash:installation.contentHash};
    snapshot={run:{runId,resultId,state:'completed',retirementState:'released',sourceKind:'saved',
      scriptId:installation.scriptId,contentHash:installation.contentHash,revision},results:[{runId,resultId,
      state:'completed',tag:'controller-result',sourceKind:'saved',revision,outcome:{ok:true,valueWire:encodeValue({
        status:'success',query:scope.args.query,sourceUrl:'https://www.baidu.com/s?wd=OpenDesk%20Browser',count:1,
        results:[{title:'Fixture page '+runId,url:'https://example.com/'+runId}]})}}]};
    return {runId};
  }};
  const route=createMethodRoutes(authority,['startControllerRun'],{startControllerRun:(request,_sender,submit)=>ledger.withControllerAdmission(request,submit)});
  const host={currentRun:null,start:input=>route.startControllerRun({...input,paramsWire:encodeValue(input.params)},sender),
    get completion(){return Promise.resolve({runId:snapshot.run.runId,state:runUnknown?'unknown':'completed',
    retirement:{state:'released'},result:{resultId:snapshot.run.resultId}});}};
  const bridge=createChatGPTFixedBridgeHost({api,client,host,currentPageTarget:{snapshot:{windowId:2}},
    isVerifiedSidePanel:()=>verified,checkTarget:async()=>{},readReply:async()=>structuredClone(observed)});
  const next=(id,changes={})=>{
    const intent={protocol:'webflow.task.intent.v1',candidateId:id,taskId:scope.taskId,targetUrl:scope.targetUrl,args:scope.args,...changes};
    observed={turnKey:'turn-'+id,answerKey:'answer-'+id,blocks:[JSON.stringify(intent)],answerComplete:true};
    return {protocol,kind:'auto-task',persistentAuto:true,candidateText:observed.blocks[0],turnKey:observed.turnKey,answerKey:observed.answerKey};
  };
  const run=async message=>{
    const admitted=await bridge.admitAutoTask(message,sender);
    const adoptedRequest={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,
      requestId:admitted.requestId,taskId:admitted.taskId,args:admitted.args,targetUrl:admitted.targetUrl,installation:admitted.installation};
    return bridge.handle({...message,kind:'execute',mode:'auto',requestId:admitted.requestId,adoptedRequest,source,sourceUrl:source.url},sender);
  };
  return {bridge,ledger,next,run,events,scope,installed,resolved,catalog,sender,projectRequest:value=>{projectedRequest=value;},
    denyPermission:()=>{permission=false;},unverify:()=>{verified=false;},
    afterGate:fn=>{afterGate=fn;},loseSend:()=>{deliveryUnknown=true;},unknownRun:()=>{runUnknown=true;},
    async approve(){const review=await bridge.prepareAutoGrant(scope);await bridge.approveAutoTask(review,{isTrusted:true});
      await bridge.setAutoEnabled(true,{isTrusted:true});}};
}
test('trusted approval then two independent candidates use original Host, durable result and original-chat delivery once each',async()=>{
  const h=harness();await h.approve();
  const a=await h.run(h.next('wf-host-first1')),b=await h.run(h.next('wf-host-second'));
  assert.equal(a.sent,true);assert.equal(a.aiReplyObserved,true);assert.notEqual(a.runId,b.runId);assert.notEqual(a.resultId,b.resultId);
  assert.equal(h.events.starts.length,2);assert.equal(h.events.deliveries.length,2);
  assert.notEqual(h.events.starts[0].requestId,h.events.starts[1].requestId);
  assert.equal(h.events.starts[0].expectedTaskInstallationId,h.scope.installation.installationId);
  await h.bridge.revokeAutoTask(h.scope.taskId,{isTrusted:true});await assert.rejects(h.run(h.next('wf-host-denied')));
  assert.equal(h.events.starts.length,2);
});
test('Host rejects missing gestures, sandbox/page attempts, disabled task, permissions and changed installation',async()=>{
  const h=harness();const review=await h.bridge.prepareAutoGrant(h.scope);
  for(const event of [undefined,{isTrusted:false}])await assert.rejects(h.bridge.approveAutoTask(review,event));
  for(const failure of ['disabled','generation','permission']){
    const item=harness();await item.approve();
    if(failure==='disabled')item.installed.enabled=false;
    if(failure==='generation')item.installed.generation++;
    if(failure==='permission')item.denyPermission();
    await assert.rejects(item.run(item.next('wf-reject-'+failure)),
      {code:failure==='disabled'?'E_BRIDGE_INSTALL':failure==='generation'?'E_BRIDGE_REVISION':'E_BRIDGE_PERMISSION'});
    assert.equal(item.events.starts.length,0);
  }
  assert.equal(h.events.starts.length,0);
  h.unverify();await assert.rejects(h.bridge.setAutoEnabled(true,{isTrusted:true}));
});
test('revocation immediately before start, UNKNOWN run and lost delivery ACK never replay effects',async()=>{
  for(const failure of ['revoke','late-revoke','run','send']){
    const h=harness();await h.approve();
    if(failure==='revoke')h.afterGate(async msg=>{if(msg.kind==='reserve')await h.ledger.revokeAuto(h.scope.taskId);});
    if(failure==='late-revoke')h.afterGate(async msg=>{if(msg.kind==='check-consumed')await h.ledger.revokeAuto(h.scope.taskId);});
    if(failure==='run')h.unknownRun();if(failure==='send')h.loseSend();
    const message=h.next('wf-unknown-'+failure);
    await assert.rejects(h.run(message));await assert.rejects(h.run(message));
    assert.equal(h.events.starts.length,['revoke','late-revoke'].includes(failure)?0:1);
    assert.equal(h.events.deliveries.length,failure==='send'?1:0);
  }
});
test('SW denies auto settings mutation from websites, sandbox, extension tabs and fake Side Panel context',async()=>{
  let listener;
  const event={addListener(){}};
  const api={runtime:{id:'extension',getURL:path=> 'chrome-extension://extension/'+String(path).replace(/^\//,''),getContexts:async()=>[],
    onMessage:{addListener:fn=>{listener=fn;}}},storage:{local:{get:async()=>({}),set:async()=>{}},session:{get:async()=>({}),set:async()=>{}}},
    webNavigation:{onCommitted:event,onHistoryStateUpdated:event},tabs:{onRemoved:event},permissions:{onRemoved:event}};
  installChatGPTBridgeTriggerGate({api});
  for(const sender of [{id:'extension',url:source.url,tab:{id:9}},
    {id:'extension',url:'chrome-extension://extension/sandbox.html',documentId:'sandbox'},
    {id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=fake',documentId:'fake'},
    {id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=fake',documentId:'tab',tab:{id:10}}]){
    const reply=await new Promise(resolve=>listener({protocol,kind:'auto-enable',enabled:true},sender,resolve));
    assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_BRIDGE_SENDER');
  }
});
test('SW accepts the actual Side Panel context, stores a grant, and denies a later navigation identity',async()=>{
  const h=harness();let listener,data={},currentUrl=source.url;
  const panel={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real',documentId:'panel-document'};
  const event={addListener(){}};
  const store={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))};
  const api={runtime:{id:'extension',getURL:path=> 'chrome-extension://extension/'+String(path).replace(/^\//,''),
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:panel.documentId,documentUrl:panel.url,frameId:0,incognito:false}],
    onMessage:{addListener:fn=>{listener=fn;}}},storage:{local:store},
    webNavigation:{onCommitted:event,onHistoryStateUpdated:event,
      getFrame:async()=>({url:currentUrl,documentId:source.documentId,documentLifecycle:'active'})},
    tabs:{onRemoved:event,get:async()=>({id:source.tabId,url:currentUrl,incognito:false})},permissions:{onRemoved:event}};
  installChatGPTBridgeTriggerGate({api});
  const send=message=>new Promise(resolve=>listener({protocol,...message},panel,resolve));
  assert.equal((await send({kind:'auto-grant',scope:h.scope})).ok,true);
  assert.equal((await send({kind:'auto-enable',enabled:true})).ok,true);
  const message=h.next('wf-real-panel-01'),candidate={candidateId:'wf-real-panel-01',text:message.candidateText,
    turnKey:message.turnKey,answerKey:message.answerKey};
  const admitted=await send({kind:'auto-admit',source,...h.scope,candidate});
  assert.equal(admitted.ok,true);assert.equal(admitted.data.persistentAuto,true);
  currentUrl='https://chatgpt.com/c/another-chat-12345678';
  assert.equal((await send({kind:'auto-admit',source,...h.scope,candidate})).error.code,'E_BRIDGE_SOURCE');
});
test('permission removal fences a delayed trusted enable before its first asynchronous context check returns',async()=>{
  let listener,onRemoved,held=false,data={};const wait=Promise.withResolvers();
  const panel={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real',documentId:'panel'};
  const contexts=[{contextType:'SIDE_PANEL',documentId:'panel',documentUrl:panel.url,frameId:0,incognito:false}],event={addListener(){}};
  const store={get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))};
  const gate=installChatGPTBridgeTriggerGate({api:{runtime:{id:'extension',getURL:path=> 'chrome-extension://extension/'+String(path).replace(/^\//,''),
    getContexts:async()=>held?wait.promise:contexts,onMessage:{addListener:fn=>{listener=fn;}}},storage:{local:store},
    webNavigation:{onCommitted:event,onHistoryStateUpdated:event},tabs:{onRemoved:event},
    permissions:{onRemoved:{addListener:fn=>{onRemoved=fn;}}}}});
  held=true;
  const enabling=new Promise(resolve=>listener({protocol,kind:'auto-enable',enabled:true},panel,resolve));
  await Promise.resolve();onRemoved();await gate.readAutoSettings();
  held=false;wait.resolve(contexts);
  const reply=await enabling;assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_WEBFLOW_AUTO_DENIED');
  assert.equal((await gate.readAutoSettings()).enabled,false);
});

function nativePanelHarness(contexts, senderChanges={}){
 let listener;const event={addListener(){}};let queries=[];
 const panel={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=native',...senderChanges};
 const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+String(path).replace(/^\//,''),
  getContexts:async query=>{queries.push(query);return typeof contexts==='function'?contexts(query):contexts;},
  onMessage:{addListener:fn=>{listener=fn;}}},storage:{local:{get:async()=>({}),set:async()=>{}}},
  webNavigation:{onCommitted:event,onHistoryStateUpdated:event},tabs:{onRemoved:event},permissions:{onRemoved:event}};
 installChatGPTBridgeTriggerGate({api});
 return {queries,send:()=>new Promise(resolve=>listener({protocol,kind:'auto-settings'},panel,resolve))};
}
const nativePanel={contextType:'SIDE_PANEL',documentId:'native-document',frameId:0,incognito:false,
 documentUrl:'chrome-extension://extension/sidepanel.html?hostInstanceId=native'};
test('real native Side Panel recovers Chrome omitted documentId from one exact context',async()=>{
 const h=nativePanelHarness([nativePanel]);assert.equal((await h.send()).ok,true);
 assert.deepEqual(h.queries[0],{contextTypes:['SIDE_PANEL'],documentUrls:[nativePanel.documentUrl]});
 assert.deepEqual(h.queries[1],{contextTypes:['SIDE_PANEL'],documentIds:[nativePanel.documentId]});
});
test('Side Panel recovery rejects missing, ambiguous, wrong, nested and incognito native contexts',async()=>{
 for(const contexts of [[],[nativePanel,nativePanel],...[
  {contextType:'TAB'},{documentUrl:nativePanel.documentUrl+'&toolId=webflow'},
  {frameId:1},{incognito:true},{documentId:''}
 ].map(change=>[{...nativePanel,...change}])]){
  assert.equal((await nativePanelHarness(contexts).send()).ok,false);
 }
});
test('native recovery never replaces explicit stale IDs or accepts foreign, tab, preview and nested senders',async()=>{
 for(const change of [{id:'foreign'},{tab:{id:3}},{frameId:1},{documentLifecycle:'cached'},
  {url:nativePanel.documentUrl+'&toolId=webflow'},{url:nativePanel.documentUrl+'&previewId=00000000-0000-4000-8000-000000000000'},
  {url:nativePanel.documentUrl+'&scheduledRunner=1'},{url:nativePanel.documentUrl+'#fake'},
  {documentId:'stale-document'}]){
  const h=nativePanelHarness([nativePanel],change);assert.equal((await h.send()).ok,false,JSON.stringify(change));
  if(!change.documentId)assert.equal(h.queries.length,0);
 }
});
test('recovered native identity stays pinned if context is replaced during the next asynchronous check',async()=>{
 let query=0;
 const h=nativePanelHarness(()=>[++query===1?nativePanel:{...nativePanel,documentId:'replacement'}]);
 assert.equal((await h.send()).ok,false);
});

// The new trusted projection cannot make a page/sandbox click into approval.
test('sidebar controls require a native gesture and the exact observed source; polling never executes',async()=>{
 const h=harness();
 const view=await h.bridge.readBridgeState();
 assert.deepEqual(view.source,source);assert.equal(h.events.starts.length,0);
 const value={source,requestId:null,action:'cancel'};
 for(const event of [undefined,{isTrusted:false}])await assert.rejects(h.bridge.controlBridge(value,event),{code:'E_WEBFLOW_GESTURE'});
 for(const patch of [{tabId:10},{documentId:'other'},{url:'https://chatgpt.com/c/other-session'}])
  await assert.rejects(h.bridge.controlBridge({...value,source:{...source,...patch}},{isTrusted:true}),{code:'E_BRIDGE_CONTEXT'});
 assert.equal(h.events.controls.length,0);
 await h.bridge.controlBridge(value,{isTrusted:true});assert.equal(h.events.controls.length,1);
 assert.equal(h.events.controls[0].kind,'sidebar-control');assert.equal(h.events.starts.length,0);
 h.unverify();await assert.rejects(h.bridge.readBridgeState(),{code:'E_WEBFLOW_GESTURE'});
});
test('sidebar receipt separates durable result, release and delivery and never attaches old results to a new request',async()=>{
 for(const unknown of [false,true]){
  const h=harness();await h.approve();if(unknown)h.loseSend();
  const run=h.run(h.next('wf-sidebar-result-'+unknown));
  if(unknown)await assert.rejects(run);else await run;
  const view=await h.bridge.readBridgeState();
  assert.equal(view.receipt.execution,'completed');assert.equal(view.receipt.persistence,'verified');
  assert.equal(view.receipt.release,'released');assert.equal(view.receipt.delivery,unknown?'unknown':'confirmed');
  assert.equal(view.receipt.value.count,1);assert.ok(view.receipt.runId);assert.ok(view.receipt.resultId);
  const starts=h.events.starts.length;await h.bridge.readBridgeState();assert.equal(h.events.starts.length,starts);
  h.projectRequest('different-request');assert.equal((await h.bridge.readBridgeState()).receipt,null);
 }
});
