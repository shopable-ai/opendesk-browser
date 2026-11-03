// Component evidence: real Host + original durable ledger with injected Chrome/Controller boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTFixedBridgeHost} from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger,installChatGPTBridgeTriggerGate} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {createMethodRoutes} from '../../../src/platform/host/broker.js';

const protocol='opendesk.chatgpt.bridge.r12.v1';
const source={tabId:9,documentId:'chat-document',url:'https://chatgpt.com/c/webflow-auto-12345678'};
function harness({profiles=[],requestPermission=true,saveError=null,grantError=null}={}){
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
  const events={starts:[],deliveries:[],gates:[],controls:[],order:[],permissions:[],profileWrites:[]};
  let projectedRequest=null;
  const session=()=>({url:source.url,requestId:projectedRequest,status:'current',actions:{cancel:true},fields:{},tasks:[]});
  const sender={id:'extension',frameId:0,url:source.url,documentId:source.documentId,
    tab:{id:source.tabId,url:source.url,windowId:2,incognito:false}};
  const api={runtime:{id:'extension',async sendMessage(msg){
    events.order.push(msg.kind);
    if(msg.protocol==='opendesk.web-task.v1'){
      if(msg.kind==='profiles-read')return {ok:true,data:{profiles:structuredClone(profiles)}};
      if(saveError)return {ok:false,error:{code:saveError,message:'Profile save failed'}};
      assert.deepEqual(msg.expectedProfiles,profiles);
      events.profileWrites.push(msg);profiles=structuredClone(msg.profiles);
      return {ok:true,data:{profiles:structuredClone(profiles)}};
    }
    events.gates.push(msg);
    if(msg.kind==='auto-grant'&&grantError)return {ok:false,error:{code:grantError,message:'grant failed'}};
    try{
      const data=await (msg.kind==='auto-settings'?ledger.readAutoSettings():msg.kind==='auto-enable'?ledger.setAutoEnabled(msg.enabled):
        msg.kind==='auto-grant'?ledger.approveAuto(msg.scope,{pendingRequest:msg.pendingRequest}):msg.kind==='auto-revoke'?ledger.revokeAuto(msg.taskId):
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
  permissions:{contains:async value=>{events.permissions.push(value);return permission;},
    request:value=>{events.order.push('permission-request');events.permissions.push(value);permission=requestPermission;return Promise.resolve(requestPermission);},onRemoved:{addListener(){},removeListener(){}}}};
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
  return {bridge,ledger,next,run,events,scope,installed,resolved,catalog,sender,source,projectRequest:value=>{projectedRequest=value;},replaceProfiles:value=>{profiles=value;},
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
test('Host reviews new Schema parameters from the original candidate and approves the original request only',async()=>{
 const h=harness();await h.approve();
 const args={query:'OpenDesk Browser SDK',limit:3},message=h.next('wf-host-new-scope',{args});
 await assert.rejects(h.bridge.admitAutoTask(h.next('wf-host-five-results',{args:{...args,limit:5}}),h.sender));
 assert.equal(h.events.gates.filter(m=>m.kind==='auto-admit').length,0,'unsupported parameters never enter pending approval');
 h.next('wf-host-new-scope',{args});
 const admitted=await h.bridge.admitAutoTask(message,h.sender);
 assert.equal(admitted.pendingApproval,true);assert.equal(h.events.starts.length,0);
 h.projectRequest(admitted.requestId);await h.bridge.readBridgeState();
 const command={action:'approve-range',source:h.source,requestId:admitted.requestId,
  pendingAuto:{scope:{...h.scope,args},candidate:admitted.candidate}};
 await assert.rejects(h.bridge.controlBridge(command,{isTrusted:false}));
 await assert.rejects(h.bridge.controlBridge({...command,pendingAuto:{...command.pendingAuto,
  scope:{...h.scope,args:{query:'changed',limit:3}}}},{isTrusted:true}));
 assert.equal(h.events.starts.length,0);
 await h.bridge.controlBridge(command,{isTrusted:true});
 const adoptedRequest={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,
  requestId:admitted.requestId,...command.pendingAuto.scope};
 const reply=await h.bridge.handle({...message,kind:'execute',mode:'auto',requestId:admitted.requestId,
  adoptedRequest,source:h.source,sourceUrl:h.source.url},h.sender);
 assert.equal(reply.sent,true);assert.equal(h.events.starts.length,1);
 assert.equal(h.events.starts[0].requestId,admitted.requestId);
 await assert.rejects(h.bridge.controlBridge(command,{isTrusted:true}));
});
test('lost pending-approval ACK never sends the execute control or allocates a replacement request',async()=>{
 const h=harness();await h.approve();const args={query:'SDK',limit:3};
 const message=h.next('wf-pending-approval-ack',{args});
 const admitted=await h.bridge.admitAutoTask(message,h.sender);
 h.projectRequest(admitted.requestId);await h.bridge.readBridgeState();
 h.afterGate(async msg=>{if(msg.kind==='auto-grant')throw Error('approval ACK lost');});
 const command={action:'approve-range',source:h.source,requestId:admitted.requestId,
  pendingAuto:{scope:{...h.scope,args},candidate:admitted.candidate}};
 await assert.rejects(h.bridge.controlBridge(command,{isTrusted:true}));
 h.afterGate(async()=>{});
 await assert.rejects(h.bridge.controlBridge(command,{isTrusted:true}));
 await assert.rejects(h.bridge.admitAutoTask(message,h.sender));
 assert.equal(h.events.controls.length,0);assert.equal(h.events.starts.length,0);
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

const siteOrigin='https://source.example';
const genericProfile={id:'site-existing',version:'1.0.0',origin:siteOrigin,adapter:'generic',adapterVersion:'1.0.0',
 protocols:['webflow.task.intent.v1'],enabled:true};
test('Generic review binds canonical source, registers only on approval and preserves gesture permission order',async()=>{
 const h=harness();h.denyPermission();
 const review=await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin});
 assert.equal(review.sourceOrigin,siteOrigin);assert.equal(h.events.profileWrites.length,0);
 assert.equal(h.events.permissions.length,0,'preparation can review a site before Chrome permission is granted');
 h.events.order.length=0;
 const pending=h.bridge.approveAutoTask(review,{isTrusted:true});
 assert.deepEqual(h.events.order,['permission-request'],'request runs before the first await');
 await pending;
 assert.deepEqual(h.events.permissions[0],{origins:['https://source.example/*','https://www.baidu.com/*']});
 assert.ok(h.events.permissions.slice(1).some(value=>value.origins.includes('https://source.example/*')));
 assert.ok(h.events.order.indexOf('profiles-save')>h.events.order.indexOf('profiles-read'));
 assert.ok(h.events.order.indexOf('auto-grant')>h.events.order.indexOf('profiles-save'));
 const write=h.events.profileWrites[0];
 assert.deepEqual(write.expectedProfiles,[]);
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(siteOrigin))).toString('hex');
 assert.deepEqual(write.profiles,[{...genericProfile,id:'site-'+hash.slice(0,16)}]);
 assert.equal((await h.ledger.readAutoSettings()).grants[h.scope.taskId].scope.sourceOrigin,siteOrigin);
 assert.equal(h.events.starts.length,0);
});
test('ChatGPT retains default source and never requests new Chrome permission or a Generic Profile',async()=>{
 const h=harness();await h.approve();
 assert.equal(h.events.order.includes('permission-request'),false);
 assert.equal(h.events.order.includes('profiles-read'),false);
 assert.equal((await h.ledger.readAutoSettings()).grants[h.scope.taskId].scope.sourceOrigin,'https://chatgpt.com');
});
test('source tampering and noncanonical origins cannot reuse a reviewed approval',async()=>{
 const h=harness();const review=await h.bridge.prepareAutoGrant(h.scope);
 assert.equal(Reflect.set(review,'sourceOrigin',siteOrigin),false);
 await assert.rejects(h.bridge.approveAutoTask({...review,sourceOrigin:siteOrigin},{isTrusted:true}),{code:'E_BRIDGE_CONTEXT'});
 for(const origin of [siteOrigin+'/',siteOrigin+'/path','https://user@source.example','*','file:///tmp','https://*.example'])
  await assert.rejects(h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:origin}));
 assert.equal(h.events.order.includes('permission-request'),false);
 assert.equal(h.events.gates.some(msg=>msg.kind==='auto-grant'),false);
});
test('review and nested scope are immutable; hidden toJSON cannot request unreviewed origins',async()=>{
 const h=harness();const review=await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin});
 const bytes=JSON.stringify(review);
 assert.equal(Object.isFrozen(review),true);assert.equal(Object.isFrozen(review.args),true);
 assert.equal(Object.isFrozen(review.installation),true);
 assert.equal(Reflect.set(review,'sourceOrigin','https://unreviewed.example'),false);
 assert.equal(Reflect.defineProperty(review,'toJSON',{value:()=>JSON.parse(bytes)}),false);
 const forged={...review,sourceOrigin:'https://unreviewed.example',targetUrl:'https://other.example/'};
 Object.defineProperty(forged,'toJSON',{value:()=>JSON.parse(bytes)});
 await assert.rejects(h.bridge.approveAutoTask(forged,{isTrusted:true}),{code:'E_BRIDGE_CONTEXT'});
 assert.equal(h.events.permissions.length,0);assert.equal(h.events.profileWrites.length,0);
});
test('denied Generic permission writes neither Profile nor grant',async()=>{
 const h=harness({requestPermission:false});const review=await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin});
 await assert.rejects(h.bridge.approveAutoTask(review,{isTrusted:true}),{code:'E_BRIDGE_PERMISSION'});
 assert.equal(h.events.profileWrites.length,0);assert.equal(h.events.gates.some(msg=>msg.kind==='auto-grant'),false);
});
test('existing compatible Profile is reused; disabled or incompatible Profiles cannot be revived',async()=>{
 const h=harness({profiles:[genericProfile]});
 await h.bridge.approveAutoTask(await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin}),{isTrusted:true});
 assert.equal(h.events.profileWrites.length,0);
 for(const patch of [{enabled:false},{adapterVersion:'2.0.0'},{protocols:[]},{adapter:'other'}]){
  const item=harness({profiles:[{...genericProfile,...patch}]});
  await assert.rejects(item.bridge.prepareAutoGrant({...item.scope,sourceOrigin:siteOrigin}),/Profile|恢复/);
  assert.equal(item.events.profileWrites.length,0);assert.equal(item.events.gates.some(msg=>msg.kind==='auto-grant'),false);
 }
});

test('Profile CAS/write failures stop before grant; grant failure never executes or replays',async()=>{
 for(const saveError of ['E_WEB_TASK_PROFILE_CHANGED','E_WEB_TASK_UNKNOWN']){
  const h=harness({saveError});const review=await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin});
  await assert.rejects(h.bridge.approveAutoTask(review,{isTrusted:true}),{code:saveError});
  assert.equal(h.events.gates.some(msg=>msg.kind==='auto-grant'),false);assert.equal(h.events.starts.length,0);
 }
 const h=harness({grantError:'E_WEBFLOW_AUTO_UNKNOWN'});
 const review=await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin});
 await assert.rejects(h.bridge.approveAutoTask(review,{isTrusted:true}),{code:'E_WEBFLOW_AUTO_UNKNOWN'});
 assert.equal(h.events.profileWrites.length,1);assert.equal(h.events.starts.length,0);
 assert.equal(Object.keys((await h.ledger.readAutoSettings()).grants).length,0);
 await assert.rejects(h.bridge.approveAutoTask(review,{isTrusted:true}),{code:'E_BRIDGE_CONTEXT'});
 assert.equal(h.events.gates.filter(msg=>msg.kind==='auto-grant').length,1);
});
test('Profile disabled after review and changed task catalog or arguments cannot bypass original validation',async()=>{
 const h=harness();const review=await h.bridge.prepareAutoGrant({...h.scope,sourceOrigin:siteOrigin});
 h.replaceProfiles([{...genericProfile,enabled:false}]);
 await assert.rejects(h.bridge.approveAutoTask(review,{isTrusted:true}),/恢复/);
 assert.equal(h.events.profileWrites.length,0);assert.equal(h.events.gates.some(msg=>msg.kind==='auto-grant'),false);
 for(const change of ['catalog','installation','args','target']){
  const item=harness({profiles:[genericProfile]});
  const scope={...item.scope,sourceOrigin:siteOrigin};
  if(change==='catalog')item.catalog.stage='unavailable';
  if(change==='installation')item.installed.generation++;
  if(change==='args')scope.args={...scope.args,limit:4};
  if(change==='target')scope.targetUrl='https://unapproved.example/';
  await assert.rejects(item.bridge.prepareAutoGrant(scope));
  assert.equal(item.events.profileWrites.length,0);assert.equal(item.events.gates.some(msg=>msg.kind==='auto-grant'),false);
 }
});

test('opening a blank ChatGPT tab clears the sidebar projection of a previous conversation',async()=>{
 const h=harness();
 const first=await h.bridge.readBridgeState();assert.equal(first.source.url,source.url);
 h.sender.tab.url='https://chatgpt.com/';
 const next=await h.bridge.readBridgeState();
 assert.equal(next.session,null);assert.equal(next.receipt,null);assert.equal(next.source,undefined);
 assert.equal(h.events.starts.length,0);
});

test('one returned search row stays identical through delivery and sidebar; replay and closed approval cannot start another run',async()=>{
 const h=harness();await h.approve();
 const message=h.next('wf-core-single-result');
 const completed=await h.run(message);
 const expected={status:'success',query:'OpenDesk Browser',
  sourceUrl:'https://www.baidu.com/s?wd=OpenDesk%20Browser',count:1,
  results:[{title:'Fixture page run-1',url:'https://example.com/run-1'}]};
 assert.equal(h.events.starts.length,1);assert.equal(h.events.deliveries.length,1);
 const sent=h.events.deliveries[0];
 const payload=JSON.parse(sent.text.slice(sent.text.indexOf('{')));
 assert.equal(payload.protocol,'opendesk.task.result.v1');
 assert.equal(payload.requestId,h.events.starts[0].requestId);
 assert.equal(payload.taskId,'baidu.search.top3');
 assert.equal(payload.scriptId,h.scope.installation.scriptId);
 assert.equal(payload.sourceHash,h.scope.installation.contentHash);
 assert.equal(payload.targetUrl,'https://www.baidu.com/');
 assert.equal(payload.runId,'run-1');assert.equal(payload.resultId,'result-1');
 assert.equal(sent.runId,payload.runId);assert.equal(sent.resultId,payload.resultId);
 assert.equal(sent.sourceUrl,source.url);assert.equal(sent.requestId,payload.requestId);
 assert.deepEqual(payload.data,expected);
 assert.deepEqual(JSON.parse(completed.resultPreview),expected);
 const view=await h.bridge.readBridgeState();
 assert.deepEqual(view.source,source);
 assert.equal(view.session.requestId,payload.requestId);
 assert.equal(view.receipt.requestId,payload.requestId);
 assert.equal(view.receipt.runId,payload.runId);assert.equal(view.receipt.resultId,payload.resultId);
 assert.deepEqual(view.receipt.value,expected);
 assert.equal(view.receipt.execution,'completed');assert.equal(view.receipt.persistence,'verified');
 assert.equal(view.receipt.release,'released');assert.equal(view.receipt.delivery,'confirmed');
 await assert.rejects(h.run(message));
 await h.bridge.readBridgeState();
 assert.equal(h.events.starts.length,1);assert.equal(h.events.deliveries.length,1);
 await h.bridge.setAutoEnabled(false,{isTrusted:true});
 await h.bridge.revokeAutoTask(h.scope.taskId,{isTrusted:true});
 const settings=await h.ledger.readAutoSettings();
 assert.equal(settings.enabled,false);assert.equal(settings.grants['baidu.search.top3'].state,'revoked');
 await assert.rejects(h.run(h.next('wf-core-after-cleanup')));
 assert.equal(h.events.starts.length,1);assert.equal(h.events.deliveries.length,1);
});
