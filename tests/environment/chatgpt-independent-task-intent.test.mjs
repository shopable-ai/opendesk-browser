// Component evidence only; real Chrome runs are recorded separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {load} from 'cheerio';
import {inspectChatGPTEditsOnPage} from '../../src/native-agent/workspace-chatgpt.js';
import {createChatGPTFixedBridgeHost,verifyChatGPTTaskDurableResult,formatChatGPTInstalledResult}
  from '../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger,installChatGPTBridgeTriggerGate,CHATGPT_BRIDGE_LEDGER_KEY} from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {validateChatGPTTaskIntent} from '../../src/native-agent/chatgpt-task-request.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const protocol='opendesk.chatgpt.bridge.r12.v1';
const id='33333333-3333-4333-8333-333333333333';
const source={tabId:9,documentId:'installed-task-document',url:'https://chatgpt.com/c/task-test-12345678'};
function harness({holdRun=false,clock}={}){
  const installation={version:'1.2.3',manifestHash:'a'.repeat(64),scriptId:'task:article.read:1.2.3',
    revision:1,contentHash:'b'.repeat(64),installationId:'article-install-1',generation:2};
  const manifest={taskId:'article.read',version:'1.2.3',title:'读取文章',description:'按参数读取文章',
    siteOrigins:['https://example.com'],program:{revision:1,sourceHash:installation.contentHash},
    paramsSchema:{type:'object',additionalProperties:false,properties:{
      maxChars:{type:'integer',title:'字数',default:200,minimum:1,maximum:500}},required:[]}};
  const installed={taskId:manifest.taskId,...installation,enabled:true};
  const candidate={taskId:manifest.taskId,version:manifest.version,manifestHash:installation.manifestHash,
    stage:'available',manifest};
  const resolved={...installed,manifest};
  const request={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,
    requestId:id,taskId:manifest.taskId,args:{maxChars:200},targetUrl:'https://example.com/article',installation};
  const message={protocol,kind:'execute',requestId:id,mode:'manual',source,sourceUrl:source.url,
    turnKey:'turn-1',answerKey:'answer-1:0',candidateText:JSON.stringify(request)};
  const revision={scriptId:installation.scriptId,revision:1,sourceHash:installation.contentHash};
  const snapshot={run:{runId:'run-article',state:'completed',retirementState:'released',sourceKind:'saved',
    scriptId:installation.scriptId,contentHash:installation.contentHash,revision,resultId:'result-article'},
    results:[{runId:'run-article',resultId:'result-article',state:'completed',tag:'controller-result',
      sourceKind:'saved',revision,outcome:{ok:true,valueWire:encodeValue({title:'Article',excerpt:'Real page data'})}}]};
  const sender={id:'extid',frameId:0,url:source.url,documentId:source.documentId,
    tab:{id:source.tabId,url:source.url,windowId:2,incognito:false}};
  const intent={protocol:'opendesk.task.intent.v1',candidateId:'candidate-unique-123',taskId:request.taskId,
    targetUrl:request.targetUrl,args:{}};
  const observed={turnKey:message.turnKey,answerKey:message.answerKey,blocks:[JSON.stringify(intent)]};
  let saved={},counter=0,losePrepare=false;
  const storage={get:async key=>({[key]:structuredClone(saved[key])}),set:async value=>{Object.assign(saved,structuredClone(value));}};
  const ledger=createChatGPTBridgeTriggerLedger({storage,clock,generateId:()=>`44444444-4444-4444-8444-${String(++counter).padStart(12,'0')}`});
  const runningReady=Promise.withResolvers(),heldCompletion=Promise.withResolvers();
  const target={mode:'owned',tabId:42,frameId:0,documentId:'article-target-document',
    allowedOrigin:'https://example.com',targetSessionId:'article-session',targetVersion:1};
  const targetFrame={tabId:target.tabId,frameId:0,documentId:target.documentId,
    documentLifecycle:'active',url:request.targetUrl};
  const chromeEvent=()=>{const listeners=new Set();return {
    addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit:value=>{for(const listener of listeners)listener(value);}};};
  const permissionListeners=new Set();
  const events={starts:[],gates:[],progress:[],deliveries:[],snapshots:[],updates:[],stops:[]};
  let permission=true,verified=true,onRead=()=>{},onSend=()=>{};
  const lostACKs=new Set();
  const api={runtime:{id:'extid',async sendMessage(msg){events.gates.push(msg);
    try{
      const data=await (msg.kind==='preapprove-next'?ledger.preapproveNext(msg.source,msg):
        msg.kind==='bind-preapproved'?ledger.bindPreapproved(msg):
        msg.kind==='revoke-request'?ledger.revokeRequest(msg):msg.kind==='prepare'?ledger.prepare(msg.source,msg):
        msg.kind==='authorize'?ledger.authorize(msg):msg.kind==='reserve'?ledger.reserve(msg):ledger.assertConsumed(msg));
      if(msg.kind==='prepare'&&losePrepare||lostACKs.has(msg.kind))throw Error('ACK lost after durable write');
      return {ok:true,data};
    }catch(error){return {ok:false,error:{code:error.code,message:error.message}};}}},
    tabs:{onRemoved:chromeEvent(),onDetached:chromeEvent(),onReplaced:chromeEvent(),
      get:async tabId=>tabId===target.tabId?{id:target.tabId,url:targetFrame.url,incognito:false}:{...sender.tab},
      update:async(tabId,options)=>{events.updates.push({tabId,options});
        return {id:tabId,url:targetFrame.url,active:true,incognito:false};},
      async sendMessage(tab,msg,options){
      assert.equal(tab,source.tabId);assert.equal(options.documentId,source.documentId);
      if(msg.kind==='progress'){events.progress.push(msg);if(msg.stage==='running')runningReady.resolve();return {ok:true,data:{observed:true}};}
      onSend();events.deliveries.push(msg);
      await bridge.checkDelivery({...msg,kind:'check-delivery'},sender);
      return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};}},
    webNavigation:{onBeforeNavigate:chromeEvent(),onCommitted:chromeEvent(),
      getFrame:async()=>({...source,documentLifecycle:'active'}),getAllFrames:async()=>[targetFrame]},
    permissions:{contains:async()=>permission,onRemoved:{addListener:fn=>permissionListeners.add(fn),
      removeListener:fn=>permissionListeners.delete(fn)}}};
  const client={request:async method=>method==='listTaskCatalog'?{installed:[installed],catalog:[candidate]}:resolved,
    controller:{snapshotControllerRun:async input=>{events.snapshots.push(input);return structuredClone(snapshot);}}};
  const terminal={runId:'run-article',state:'completed',retirement:{state:'released'},result:{resultId:'result-article'}};
  const host={currentRun:null,start:async input=>{
    assert.equal(host.currentRun,null);events.starts.push(input);
    if(holdRun){host.currentRun='run-article';snapshot.run.state='running';
      snapshot.run.retirementState='active';snapshot.run.target=structuredClone(target);}
    return {runId:'run-article'};
  },stop:async input=>{events.stops.push(input);return {stopped:true};},
    completion:holdRun?heldCompletion.promise:Promise.resolve(terminal)};
  const finish=()=>{snapshot.run.state='completed';snapshot.run.retirementState='released';
    host.currentRun=null;heldCompletion.resolve(terminal);};
  const bridge=createChatGPTFixedBridgeHost({api,client,host,currentPageTarget:{snapshot:{windowId:2}},
    isVerifiedSidePanel:()=>verified,checkTarget:async()=>{},
    readReply:async(_api,_source,_id,options)=>{
      await onRead(options);
      if(observed.error)throw observed.error;
      return options.identityOnly?{...structuredClone(observed),answerComplete:observed.answerComplete!==false}:
        structuredClone(observed);
    }});
  return {bridge,api,client,request,message,sender,installation,installed,resolved,candidate,events,snapshot,observed,intent,ledger,storage,host,target,finish,
    unverify:()=>{verified=false;},onRead:fn=>{onRead=fn;},loseACK:kind=>lostACKs.add(kind),runningReady:runningReady.promise,
    revokePermission:()=>{permission=false;for(const listener of permissionListeners)listener();},losePrepare:()=>{losePrepare=true;},
    grant:()=>{permission=true;},deny:()=>{permission=false;},onSend:fn=>{onSend=fn;}};
}

const adoption=h=>({protocol,kind:'adopt-task',candidateText:h.observed.blocks[0],
  turnKey:h.observed.turnKey,answerKey:h.observed.answerKey});
async function adopt(h){
  const prepared=await h.bridge.adoptTask(adoption(h),h.sender);
  const {taskId,args,targetUrl,installation,requestId}=prepared;
  const adoptedRequest={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,
    requestId,taskId,args,targetUrl,installation};
  return {protocol,kind:'execute',source,sourceUrl:source.url,requestId,mode:'manual',
    ...adoption(h),kind:'execute',adoptedRequest};
}
const approve=(h,message)=>h.bridge.authorizeTask({...message,kind:'authorize-task'},h.sender);

test('independent intent is strict and contains neither nonce nor installation pin',()=>{
  const h=harness();assert.equal(validateChatGPTTaskIntent(h.observed.blocks[0]).taskId,'article.read');
  for(const change of [{requestId:id},{installation:h.installation},{candidateId:'x'},{args:{x:{}}},
    {protocol:'wrong'},{targetUrl:'https://example.com/#fragment'}])
    assert.throws(()=>validateChatGPTTaskIntent(JSON.stringify({...h.intent,...change})));
});
test('adopt → approve → unique existing Host run, exact ledger identity and default scope',async()=>{
  const h=harness(),message=await adopt(h);
  assert.notEqual(message.requestId,h.intent.candidateId);
  assert.equal(h.events.starts.length,0);
  const rows=(await h.storage.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY];
  assert.deepEqual(rows[message.requestId].candidate,{candidateId:h.intent.candidateId,text:h.observed.blocks[0],
    turnKey:h.observed.turnKey,answerKey:h.observed.answerKey});
  assert.deepEqual(rows[message.requestId].source,source);
  assert.deepEqual(rows[message.requestId].scope.args,{maxChars:200});
  await assert.rejects(h.bridge.handle(message,h.sender),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.events.starts.length,0);
  await approve(h,message);assert.equal(h.events.starts.length,0);
  assert.equal((await h.bridge.handle(message,h.sender)).sent,true);
  assert.equal(h.events.starts.length,1);assert.deepEqual(h.events.starts[0].params,{maxChars:200});
  await assert.rejects(h.bridge.handle(message,h.sender),{code:'E_BRIDGE_REPLAY'});
  await assert.rejects(h.bridge.adoptTask(adoption(h),h.sender),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.events.starts.length,1);
});
test('candidate bytes, turn, answer and ambiguity drift reject before authorization or running',async()=>{
  for(const phase of ['adopt','approve','execute'])for(const drift of ['text','turn','answer','multiple']){
    const h=harness(),initial=adoption(h);
    const message=phase==='adopt'?null:await adopt(h);
    if(phase==='execute')await approve(h,message);
    if(drift==='text')h.observed.blocks[0]+=' ';
    if(drift==='turn')h.observed.turnKey+='-new';
    if(drift==='answer')h.observed.answerKey+='-new';
    if(drift==='multiple')h.observed.blocks.push(h.observed.blocks[0]);
    await assert.rejects(phase==='adopt'?h.bridge.adoptTask(initial,h.sender):
      phase==='approve'?approve(h,message):h.bridge.handle(message,h.sender),{code:'E_BRIDGE_ANSWER'});
    assert.equal(h.events.starts.length,0);
  }
});
test('unknown, disabled, invalid schema, target and missing permission reject adoption without nonce',async()=>{
  for(const change of ['unknown','disabled','schema','target','permission']){
    const h=harness();
    if(change==='unknown')h.intent.taskId='unknown.task';
    if(change==='disabled')h.installed.enabled=false;
    if(change==='schema')h.intent.args={maxChars:999};
    if(change==='target')h.intent.targetUrl='https://foreign.example/article';
    if(change==='permission')h.deny();
    h.observed.blocks=[JSON.stringify(h.intent)];
    await assert.rejects(h.bridge.adoptTask(adoption(h),h.sender));
    assert.equal(h.events.gates.length,0);assert.equal(h.events.starts.length,0);
  }
});
test('installation and schema drift after adoption reject approval and execution',async()=>{
  for(const phase of ['approve','execute'])for(const drift of ['generation','default']){
    const h=harness(),message=await adopt(h);
    if(phase==='execute')await approve(h,message);
    if(drift==='generation')h.installed.generation++;
    else h.candidate.manifest.paramsSchema.properties.maxChars.default=201;
    await assert.rejects(phase==='approve'?approve(h,message):h.bridge.handle(message,h.sender));
    assert.equal(h.events.starts.length,0);
  }
});
test('durable adoption ACK UNKNOWN cannot mint a replacement nonce, including restart and revocation',async()=>{
  const h=harness();h.losePrepare();
  await assert.rejects(h.bridge.adoptTask(adoption(h),h.sender));
  await assert.rejects(h.bridge.adoptTask(adoption(h),h.sender),{code:'E_BRIDGE_REPLAY'});
  const rows=(await h.storage.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY];
  const [requestId]=Object.keys(rows),row=rows[requestId];
  const restarted=createChatGPTBridgeTriggerLedger({storage:h.storage,clock:()=>Date.now()+8*86400000});
  await restarted.revokeSource(source.tabId);
  await assert.rejects(restarted.prepare({...source,documentId:'reloaded-document'},
    {...row.scope,candidate:row.candidate}),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.events.starts.length,0);
});
test('candidate cannot bypass adoption checks using legacy authorization or altered scope',async()=>{
  const h=harness(),message=await adopt(h);
  await assert.rejects(h.ledger.authorize({source,requestId:message.requestId,mode:'manual'}),{code:'E_BRIDGE_CONTEXT'});
  await approve(h,message);
  const gate=h.events.gates.find(row=>row.kind==='authorize');
  await assert.rejects(h.ledger.reserve({...gate,turnKey:message.turnKey,answerKey:message.answerKey,
    candidate:undefined}),{code:'E_BRIDGE_CONTEXT'});
  await assert.rejects(h.ledger.reserve({...gate,turnKey:message.turnKey,answerKey:message.answerKey,
    args:{maxChars:201}}),{code:'E_BRIDGE_CONTEXT'});
  assert.equal(h.events.starts.length,0);
});

function domFixture(){
  const $=load('<main><div data-message-author-role="user">请读取文章</div><div data-message-author-role="assistant"><pre><code class="language-opendesk-task"></code></pre></div></main>');
  const text=JSON.stringify(harness().intent);$('code').text(text);
  const nodes=new WeakMap(),wrap=node=>{
    if(!node)return null;if(nodes.has(node))return nodes.get(node);
    const value={get parentElement(){return wrap($(node).parent()[0]);},get textContent(){return $(node).text();},
      getAttribute:key=>$(node).attr(key)??null,matches:selector=>$(node).is(selector),
      closest:selector=>wrap($(node).closest(selector)[0]),querySelector:selector=>wrap($(node).find(selector)[0]),
      querySelectorAll:selector=>$(node).find(selector).toArray().map(wrap)};
    nodes.set(node,value);return value;
  };
  const sandbox=vm.createContext({location:new URL(source.url),
    document:{querySelectorAll:selector=>$(selector).toArray().map(wrap)},
    getComputedStyle:node=>({display:node.getAttribute?.('data-hidden')==='true'?'none':'block'})});
  const read=(options={})=>vm.runInContext('('+inspectChatGPTEditsOnPage.toString()+')('+JSON.stringify({
    expectedUrl:source.url,taskIntent:true,requireComplete:true,protocols:['opendesk.task.intent.v1'],...options})+')',sandbox);
  return {$,read,text};
}
test('serialized ISOLATED discovery uses only the latest complete assistant, explicit marker and unique code block',()=>{
  const f=domFixture();assert.equal(f.read().blocks[0],f.text);
  assert.equal(f.read().assistantFragments,1); // user has no nonce echo
  f.$('code').attr('class','language-json');assert.equal(f.read().error.code,'E_CHAT_REQUEST_MARKER');
  f.$('code').attr('class','language-opendesk-task');
  f.$('pre').clone().appendTo('[data-message-author-role="assistant"]');
  assert.equal(f.read().error.code,'E_EDIT_AMBIGUOUS');
  f.$('pre').last().remove();f.$('[data-message-author-role="assistant"]').attr('data-is-streaming','true');
  assert.equal(f.read().error.code,'E_CHAT_STREAMING');
  f.$('[data-message-author-role="assistant"]').removeAttr('data-is-streaming');
  f.$('main').append('<div data-message-author-role="assistant">最新回复没有任务</div>');
  assert.equal(f.read().error.code,'E_CHAT_FORMAT');
  f.$('main').append('<div data-message-author-role="user">新问题</div>');
  assert.equal(f.read().error.code,'E_CHAT_PENDING');
});
test('serialized discovery refuses quoted, hidden and unmarked modern intent but accepts the modern marked source',()=>{
  for(const wrapper of ['blockquote','div data-opendesk-file-data','div data-hidden="true"']){
    const f=domFixture();f.$('pre').wrap('<'+wrapper+'></'+wrapper.split(' ')[0]+'>');
    assert.equal(f.read().ok,false);
  }
  const f=domFixture();
  f.$('[data-message-author-role="assistant"]').html('<div data-code-block="true"><div data-markdown-copy="exclude"><div>opendesk-task</div><button>复制</button></div><div data-code-block-source="true"><code></code></div></div>');
  f.$('code').text(f.text);assert.equal(f.read().blocks[0],f.text);
  f.$('[data-markdown-copy] div').text('json');assert.equal(f.read().error.code,'E_CHAT_REQUEST_MARKER');
});
test('consumed UNKNOWN Host start remains fenced against adopting the same candidate again',async()=>{
  const h=harness(),message=await adopt(h);await approve(h,message);
  h.host.start=async()=>{throw Error('UNKNOWN effect after dispatch');};
  await assert.rejects(h.bridge.handle(message,h.sender));
  await assert.rejects(h.bridge.adoptTask(adoption(h),h.sender),{code:'E_BRIDGE_REPLAY'});
  await assert.rejects(h.bridge.handle(message,h.sender),{code:'E_BRIDGE_REPLAY'});
});
test('candidate prepare and authorize require a trusted sidepanel sender at the original SW gate',async()=>{
  const h=harness();let listener;
  const event={addListener(){}};
  const api={storage:{local:h.storage},runtime:{id:'extid',getURL:()=> 'chrome-extension://extid/',
    onMessage:{addListener:fn=>{listener=fn;}}},
    webNavigation:{getFrame:async()=>({...source,documentLifecycle:'active'}),onCommitted:event,onHistoryStateUpdated:event},
    tabs:{get:async()=>({id:source.tabId,url:source.url}),onRemoved:event},permissions:{onRemoved:event}};
  installChatGPTBridgeTriggerGate({api});
  const candidate={candidateId:h.intent.candidateId,text:h.observed.blocks[0],turnKey:'turn-1',answerKey:'answer-1:0'};
  const message={protocol,kind:'prepare',source,taskId:h.request.taskId,args:h.request.args,
    targetUrl:h.request.targetUrl,installation:h.installation,candidate};
  const call=(msg,sender)=>new Promise(resolve=>listener(msg,sender,resolve));
  assert.equal((await call(message,h.sender)).error.code,'E_BRIDGE_SENDER');
  const sender={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=real'};
  const prepared=await call(message,sender);assert.equal(prepared.ok,true);
  const auth={...message,kind:'authorize',mode:'manual',requestId:prepared.data.requestId};
  assert.equal((await call(auth,h.sender)).error.code,'E_BRIDGE_SENDER');
  assert.equal((await call(auth,{...sender,url:sender.url+'&toolId=forged'})).ok,false);
  assert.equal((await call(auth,sender)).ok,true);
});

// Start through adoption, the durable trigger gate and Host.handle. currentRun
// is assigned only by host.start, and completion is held until each test settles.
async function runningHarness(t){
  const h=harness({holdRun:true}),message=await adopt(h);await approve(h,message);
  const execution=h.bridge.handle(message,h.sender).then(receipt=>({receipt}),error=>({error}));
  await h.runningReady;
  assert.equal(h.events.starts.length,1);assert.equal(h.host.currentRun,'run-article');
  const show={protocol,kind:'show-execution-page',requestId:message.requestId,runId:h.host.currentRun,
    source:structuredClone(source),sourceUrl:source.url};
  t.after(async()=>{h.finish();await execution;h.bridge.dispose();});
  return {...h,execution,show,message};
}
test('P3 Host activates the original running snapshot owned target after one admitted incomplete run',async t=>{
  const h=await runningHarness(t);
  assert.equal(h.snapshot.run.state,'running');assert.equal(h.events.deliveries.length,0);
  // A caller-supplied tab ID must never choose the activation target.
  const receipt=await h.bridge.showExecutionPage({...h.show,tabId:999},h.sender);
  assert.deepEqual(receipt,{runId:'run-article',tabId:h.target.tabId,shown:true});
  assert.deepEqual(h.events.snapshots,[{runId:'run-article'},{runId:'run-article'}]);
  assert.deepEqual(h.events.updates,[{tabId:h.target.tabId,options:{active:true}}]);
  assert.equal(h.host.currentRun,'run-article');assert.equal(h.events.starts.length,1);
  h.finish();assert.equal((await h.execution).receipt.sent,true);
});
test('P3 Host rejects wrong request, source and run identities before any tab update',async t=>{
  const h=await runningHarness(t);
  for(const change of [{requestId:'wrong-request'},{runId:'other-run'},
    {source:{...source,tabId:10}},{source:{...source,documentId:'foreign-document'}},
    {source:{...source,url:'https://chatgpt.com/c/other-conversation'}},
    {sourceUrl:'https://chatgpt.com/c/other-conversation'}]){
    await assert.rejects(h.bridge.showExecutionPage({...h.show,...change},h.sender),{code:'E_BRIDGE_TARGET'});
  }
  for(const sender of [{...h.sender,documentId:'foreign-document'},
    {...h.sender,tab:{...h.sender.tab,id:10}}])
    await assert.rejects(h.bridge.showExecutionPage(h.show,sender),{code:'E_BRIDGE_SENDER'});
  assert.deepEqual(h.events.updates,[]);assert.deepEqual(h.events.snapshots,[]);
  assert.equal(h.events.starts.length,1);
});
test('P3 Host cancellation blocks viewing its still-unsettled run and never updates a tab',async t=>{
  const h=await runningHarness(t);
  await h.bridge.cancel({...h.message,kind:'cancel'},h.sender);
  assert.equal(h.host.currentRun,'run-article');assert.equal(h.events.stops.length,1);
  assert.equal(h.events.stops[0].runId,'run-article');
  await assert.rejects(h.bridge.showExecutionPage(h.show,h.sender),{code:'E_BRIDGE_CANCELLED'});
  assert.deepEqual(h.events.updates,[]);
  h.finish();assert.equal((await h.execution).error.code,'E_BRIDGE_CANCELLED');
});
test('P3 Host installation drift and permission revocation block activation during a live run',async t=>{
  for(const change of ['installation','permission','revocation-event','source-approval']){
    await t.test(change,async sub=>{
      const h=await runningHarness(sub);
      if(change==='installation')h.installed.generation++;
      if(change==='permission')h.deny();
      if(change==='revocation-event')h.revokePermission();
      if(change==='source-approval')await h.ledger.revokeSource(source.tabId);
      await assert.rejects(h.bridge.showExecutionPage(h.show,h.sender),
        {code:change==='installation'?'E_BRIDGE_REVISION':change==='permission'?'E_BRIDGE_PERMISSION':'E_BRIDGE_REVOKED'});
      assert.deepEqual(h.events.updates,[]);assert.equal(h.events.starts.length,1);
      assert.equal(h.host.currentRun,'run-article');
    });
  }
});
test('P3 Host cannot show an execution page after the admitted run completes',async t=>{
  const h=await runningHarness(t);h.finish();
  assert.equal((await h.execution).receipt.sent,true);assert.equal(h.host.currentRun,null);
  await assert.rejects(h.bridge.showExecutionPage(h.show,h.sender),{code:'E_BRIDGE_TARGET'});
  assert.deepEqual(h.events.updates,[]);assert.equal(h.events.starts.length,1);
});

function capacityHarness(){
  const h=harness();let serial=0,rows={};
  const ledger=createChatGPTBridgeTriggerLedger({storage:h.storage,clock:()=>10000,
    generateId:()=>`66666666-6666-4666-8666-${String(++serial).padStart(12,'0')}`});
  const scope={taskId:h.request.taskId,args:h.request.args,targetUrl:h.request.targetUrl,installation:h.installation};
  const candidate=(candidateId='capacity-candidate')=>({candidateId,turnKey:'turn-1',answerKey:'answer-1:0',
    text:JSON.stringify({...h.intent,candidateId})});
  const seed=async({ordinary=0,candidates=0}={})=>{
    rows={};
    for(let i=0;i<ordinary+candidates;i++){
      const key=`77777777-7777-4777-8777-${String(i).padStart(12,'0')}`;
      rows[key]={source:{...source,documentId:'previous-document'},scope,createdAt:i+1000,
        expiresAt:0,status:'consumed',...(i>=ordinary?{candidate:candidate('seed-candidate-'+i)}:{})};
    }
    if(candidates){
      // A durable prepare with a lost ACK is UNKNOWN to its caller and must
      // survive capacity handling just like a consumed execution tombstone.
      rows[Object.keys(rows).at(-1)].status='prepared';
      rows[Object.keys(rows).at(-1)].createdAt=-8*86400000;
    }
    await h.storage.set({[CHATGPT_BRIDGE_LEDGER_KEY]:rows});return structuredClone(rows);
  };
  return {ledger,scope,candidate,seed,
    read:async()=>(await h.storage.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY]};
}
test('ledger admits ordinary requests at exactly 512 records by evicting only the oldest ordinary entry',async()=>{
  const h=capacityHarness(),before=await h.seed({ordinary:512});
  const first=await h.ledger.prepare(source);
  let rows=await h.read();assert.equal(Object.keys(rows).length,512);
  assert.equal(rows[Object.keys(before)[0]],undefined);assert.ok(rows[first.requestId]);
  assert.deepEqual(rows[Object.keys(before)[1]],before[Object.keys(before)[1]]);
  const next=await h.ledger.prepare(source);rows=await h.read();
  assert.equal(Object.keys(rows).length,512);assert.ok(rows[next.requestId]);
  assert.equal(rows[Object.keys(before)[1]],undefined);
});
test('full candidate quota never blocks ordinary requests or evicts consumed and UNKNOWN tombstones',async()=>{
  const h=capacityHarness(),before=await h.seed({ordinary:512,candidates:512});
  await assert.rejects(h.ledger.prepare(source,{...h.scope,candidate:h.candidate()}),{code:'E_BRIDGE_LIMIT'});
  assert.deepEqual(await h.read(),before);
  const prepared=await h.ledger.prepare(source),rows=await h.read();
  assert.ok(rows[prepared.requestId]);assert.equal(Object.keys(rows).length,1024);
  assert.equal(Object.values(rows).filter(row=>!row.candidate).length,512);
  assert.equal(Object.values(rows).filter(row=>row.candidate).length,512);
  for(const [key,row] of Object.entries(before))if(row.candidate)assert.deepEqual(rows[key],row);
});
test('ordinary quota does not prevent adoption below the separate candidate quota',async()=>{
  const h=capacityHarness();await h.seed({ordinary:512,candidates:511});
  const prepared=await h.ledger.prepare(source,{...h.scope,candidate:h.candidate()});
  const rows=await h.read();assert.ok(rows[prepared.requestId].candidate);
  assert.equal(Object.values(rows).filter(row=>!row.candidate).length,512);
  assert.equal(Object.values(rows).filter(row=>row.candidate).length,512);
});
test('candidate dedup uses stable conversation identity across document reloads and allows the same ID in another chat',async()=>{
  const h=capacityHarness(),scope={...h.scope,candidate:h.candidate()};
  const first=await h.ledger.prepare(source,scope);
  const restarted=createChatGPTBridgeTriggerLedger({storage:{
    get:async()=>({[CHATGPT_BRIDGE_LEDGER_KEY]:await h.read()}),set:async()=>{throw Error('replay must not write');}}});
  for(const url of [source.url,source.url+'/',source.url.replace('/c/','/g/g-p-project/c/')])
    await assert.rejects(restarted.prepare({...source,tabId:99,documentId:'reloaded-document',url},scope),
      {code:'E_BRIDGE_REPLAY'});
  const other=await h.ledger.prepare({...source,url:'https://chatgpt.com/c/other-conversation'},scope);
  assert.notEqual(first.requestId,other.requestId);
  assert.equal(Object.values(await h.read()).filter(row=>row.candidate).length,2);
});

const preapproval=h=>({protocol,kind:'preapprove-next-task',taskId:h.request.taskId,
  args:{},targetUrl:h.request.targetUrl,installation:structuredClone(h.installation)});
const nextAnswer=h=>{h.observed.turnKey='turn-2';h.observed.answerKey='answer-2:0';};
const binding=(h,grant)=>({...adoption(h),kind:'bind-preapproved-task',requestId:grant.requestId});
const autoExecution=(h,bound)=>({protocol,kind:'execute',mode:'auto',source,sourceUrl:source.url,
  ...adoption(h),kind:'execute',requestId:bound.requestId,
  adoptedRequest:{protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,
    requestId:bound.requestId,taskId:bound.taskId,args:bound.args,targetUrl:bound.targetUrl,installation:bound.installation}});
const rowsOf=async h=>(await h.storage.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY];

test('P0 preapproval requires a complete idle baseline and rechecks it without minting on drift',async()=>{
  for(const state of ['streaming','pending','incomplete','turn-drift','answer-drift','unverified','busy']){
    const h=harness();let reads=0;
    h.onRead(options=>{
      assert.deepEqual(options,{identityOnly:true,taskIntent:true,requireComplete:true});
      if(++reads===2&&state==='turn-drift')h.observed.turnKey+='-changed';
      if(reads===2&&state==='answer-drift')h.observed.answerKey+='-changed';
    });
    if(['streaming','pending'].includes(state))h.observed.error={code:state==='pending'?'E_CHAT_PENDING':'E_CHAT_STREAMING'};
    if(state==='incomplete')h.observed.answerComplete=false;
    if(state==='unverified')h.unverify();
    if(state==='busy')h.host.currentRun='other-run';
    await assert.rejects(h.bridge.preapproveNextTask(preapproval(h),h.sender));
    assert.equal(h.events.gates.length,0);assert.equal(h.events.starts.length,0);
  }
});
test('P0 grants persist one approved auto row; exact binding preserves nonce, scope and five minute expiry through execution',async()=>{
  const h=harness({clock:()=>1000}),grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);
  assert.deepEqual(grant.baseline,{turnKey:'turn-1',answerKey:'answer-1:0'});
  assert.equal(grant.expiresAt,301000);assert.deepEqual(grant.args,{maxChars:200});
  let rows=await rowsOf(h);assert.equal(Object.keys(rows).length,1);
  assert.equal(rows[grant.requestId].status,'approved');assert.equal(rows[grant.requestId].mode,'auto');
  await assert.rejects(h.ledger.reserve({...grant,mode:'auto',turnKey:'turn-2',answerKey:'answer-2:0'}),{code:'E_BRIDGE_CONTEXT'});
  nextAnswer(h);const bound=await h.bridge.bindPreapprovedTask(binding(h,grant),h.sender);
  assert.equal(bound.requestId,grant.requestId);assert.equal(bound.expiresAt,grant.expiresAt);
  rows=await rowsOf(h);assert.equal(Object.keys(rows).length,1);assert.ok(rows[grant.requestId].candidate);
  assert.equal((await h.bridge.handle(autoExecution(h,bound),h.sender)).sent,true);
  assert.equal(h.events.starts.length,1);
  await assert.rejects(h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),{code:'E_BRIDGE_REPLAY'});
});
test('P0 binding rejects changed URL, args, task, installation, old turn or old answer',async()=>{
  for(const change of ['url','args','task','installation','turn','answer','multiple','bytes']){
    const h=harness(),grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);
    nextAnswer(h);
    if(change==='url')h.intent.targetUrl+='?changed=1';
    if(change==='args')h.intent.args={maxChars:201};
    if(change==='task')h.intent.taskId='unknown.task';
    if(change==='installation'){h.installed.generation++;h.resolved.generation++;}
    if(change==='turn')h.observed.turnKey=grant.baseline.turnKey;
    if(change==='answer')h.observed.answerKey=grant.baseline.answerKey;
    h.observed.blocks=[JSON.stringify(h.intent)];
    if(change==='multiple')h.observed.blocks.push(h.observed.blocks[0]);
    const message=binding(h,grant);if(change==='bytes')message.candidateText+=' ';
    await assert.rejects(h.bridge.bindPreapprovedTask(message,h.sender));
    assert.equal((await rowsOf(h))[grant.requestId].candidate,undefined);
    assert.equal(h.events.starts.length,0);
  }
});
test('P0 preapproval fails closed on source, verified Host or authority drift while awaiting and after persistence',async()=>{
  for(const phase of ['before','after'])for(const change of ['source','authority','host']){
    const h=harness();let reads=0;
    h.onRead(()=>{if(++reads===(phase==='before'?2:3)){
      if(change==='source')h.sender.tab.url='https://chatgpt.com/c/changed-conversation';
      if(change==='authority')h.revokePermission();
      if(change==='host')h.unverify();
    }});
    await assert.rejects(h.bridge.preapproveNextTask(preapproval(h),h.sender));
    const rows=await rowsOf(h);
    if(phase==='before')assert.equal(h.events.gates.length,0);
    else assert.equal(Object.values(rows)[0].status,'revoked');
  }
});
test('P0 expiry and source/permission revocation cannot be bound or extended after worker restart',async()=>{
  for(const change of ['expiry','source','permission']){
    let now=1000;const h=harness({clock:()=>now});
    const grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);
    if(change==='expiry')now=grant.expiresAt;
    if(change==='source')await h.ledger.revokeSource(source.tabId);
    if(change==='permission')await h.ledger.revokeApprovals();
    nextAnswer(h);await assert.rejects(h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),{code:'E_BRIDGE_REPLAY'});
    const restarted=createChatGPTBridgeTriggerLedger({storage:h.storage,clock:()=>now});
    const msg=h.events.gates.at(-1);
    await assert.rejects(restarted.bindPreapproved(msg),{code:'E_BRIDGE_REPLAY'});
    assert.equal((await rowsOf(h))[grant.requestId].expiresAt,grant.expiresAt);
  }
});
test('P0 lost grant ACK cannot mint a replacement; lost binding ACK retains durable conversation tombstone',async()=>{
  const lost=harness();lost.loseACK('preapprove-next');
  await assert.rejects(lost.bridge.preapproveNextTask(preapproval(lost),lost.sender),{code:'E_BRIDGE_OUTCOME_UNKNOWN'});
  await assert.rejects(lost.bridge.preapproveNextTask(preapproval(lost),lost.sender),{code:'E_BRIDGE_REPLAY'});
  assert.equal(Object.keys(await rowsOf(lost)).length,1);
  const h=harness(),grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);nextAnswer(h);
  h.loseACK('bind-preapproved');
  await assert.rejects(h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),{code:'E_BRIDGE_OUTCOME_UNKNOWN'});
  await assert.rejects(h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),{code:'E_BRIDGE_REPLAY'});
  const restarted=createChatGPTBridgeTriggerLedger({storage:h.storage});
  await assert.rejects(restarted.prepare({...source,documentId:'reloaded'},
    {...grant,candidate:(await rowsOf(h))[grant.requestId].candidate}),{code:'E_BRIDGE_REPLAY'});
  assert.equal(h.events.starts.length,0);
});
test('P0 bind shares the candidate quota and conversation dedup with ordinary adoption',async()=>{
  const h=capacityHarness();await h.seed({candidates:512});
  const grant=await h.ledger.preapproveNext(source,{...h.scope,baseline:{turnKey:'old-turn',answerKey:'old-answer'}});
  await assert.rejects(h.ledger.bindPreapproved({...grant,candidate:h.candidate()}),{code:'E_BRIDGE_LIMIT'});
  const other=harness(),adopted=await adopt(other);
  const pre=await other.bridge.preapproveNextTask(preapproval(other),other.sender);nextAnswer(other);
  await assert.rejects(other.bridge.bindPreapprovedTask(binding(other,pre),other.sender),{code:'E_BRIDGE_REPLAY'});
  assert.ok((await rowsOf(other))[adopted.requestId].candidate);
});
test('P0 SW accepts preapprove/bind only from the original trusted sidepanel, never content or a tool shell',async()=>{
  const h=harness();let listener;const event={addListener(){}};
  installChatGPTBridgeTriggerGate({api:{storage:{local:h.storage},runtime:{id:'extid',getURL:()=> 'chrome-extension://extid/',
    onMessage:{addListener:fn=>{listener=fn;}}},
    webNavigation:{getFrame:async()=>({...source,documentLifecycle:'active'}),onCommitted:event,onHistoryStateUpdated:event},
    tabs:{get:async()=>({id:source.tabId,url:source.url}),onRemoved:event},permissions:{onRemoved:event}}});
  const trusted={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=real'};
  const call=(msg,sender)=>new Promise(resolve=>listener({protocol,...msg},sender,resolve));
  const message={...preapproval(h),kind:'preapprove-next',source,baseline:{turnKey:'old-turn',answerKey:'old-answer'}};
  for(const sender of [h.sender,{...trusted,url:trusted.url+'&toolId=tool'},
    {...trusted,url:trusted.url+'&scheduledRunner=1'},{...trusted,id:'foreign'}]){
    assert.equal((await call(message,sender)).error.code,'E_BRIDGE_SENDER');
    assert.equal((await call({kind:'bind-preapproved',source,requestId:id},sender)).error.code,'E_BRIDGE_SENDER');
  }
  const grant=await call(message,trusted);assert.equal(grant.ok,true);
  const candidate={candidateId:h.intent.candidateId,text:h.observed.blocks[0],turnKey:'turn-1',answerKey:'answer-1:0'};
  assert.equal((await call({...grant.data,kind:'bind-preapproved',candidate},trusted)).ok,true);
});
test('failed durable permission/source revocation stays fail closed after access returns, then flushes before reserve',async()=>{
  for(const method of ['revokeApprovals','revokeSource']){
    const h=harness(),msg=await adopt(h);await approve(h,msg);
    const gate={...h.events.gates.at(-1),turnKey:msg.turnKey,answerKey:msg.answerKey};
    const set=h.storage.set;let failing=true;
    h.storage.set=async value=>{if(failing)throw Error('storage unavailable');return set(value);};
    await assert.rejects(h.ledger[method](source.tabId),/storage unavailable/);
    await assert.rejects(h.ledger.reserve(gate),/storage unavailable/);
    failing=false;
    await assert.rejects(h.ledger.reserve(gate),{code:'E_BRIDGE_REPLAY'});
    const restarted=createChatGPTBridgeTriggerLedger({storage:h.storage});
    await assert.rejects(restarted.reserve(gate),{code:'E_BRIDGE_REPLAY'});
    assert.equal((await rowsOf(h))[msg.requestId].status,'revoked');
  }
});
test('Host admission uses the verified installed manifest deadline, including short and long budgets',async()=>{
  for(const budget of [1000,120000,undefined]){
    const h=harness();if(budget!==undefined)h.candidate.manifest.deadlineMs=budget;
    const msg=await adopt(h);await approve(h,msg);const before=Date.now();
    assert.equal((await h.bridge.handle(msg,h.sender)).sent,true);
    const after=Date.now(),deadline=h.events.starts[0].deadlineAt;
    assert.ok(deadline>=before+(budget??30000)&&deadline<=after+(budget??30000));
  }
});

test('real SW revocation events fence failed storage writes and worker restart before any repair, including consumed delivery',async()=>{
  for(const event of ['permission','navigation'])for(const state of ['approved','consumed']){
    const h=harness();let listener;
    h.api.storage={local:h.storage,session:sessionStorage()};
    h.api.runtime.getURL=()=> 'chrome-extension://extid/';
    h.api.runtime.onMessage={addListener:fn=>{listener=fn;}};
    const trusted={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=real'};
    const call=message=>new Promise(resolve=>listener(message,trusted,resolve));
    h.api.runtime.sendMessage=call;
    installChatGPTBridgeTriggerGate({api:h.api});
    const msg=await adopt(h);msg.mode='auto';await approve(h,msg);
    const row=(await rowsOf(h))[msg.requestId];
    const context={protocol,source,requestId:msg.requestId,mode:'auto',...row.scope,
      candidate:row.candidate,turnKey:msg.turnKey,answerKey:msg.answerKey};
    if(state==='consumed')assert.equal((await call({...context,kind:'reserve'})).ok,true);
    const set=h.storage.set;let failing=true;
    h.storage.set=async value=>{if(failing)throw Error('event revocation write failure');return set(value);};
    if(event==='permission')h.revokePermission();
    else h.api.webNavigation.onCommitted.emit({tabId:source.tabId,frameId:0});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal((await rowsOf(h))[msg.requestId].status,state); // durable write really failed
    assert.ok((await h.api.storage.session.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY]);
    const kind=state==='consumed'?'check-consumed':'reserve';
    const failed=await call({...context,kind});
    assert.equal(failed.ok,false);assert.match(failed.error.message,/event revocation write failure/);
    // Restart before storage recovers: the new worker has no old in-memory latch.
    installChatGPTBridgeTriggerGate({api:h.api});
    await new Promise(resolve=>setImmediate(resolve));
    failing=false;h.grant();
    assert.equal((await call({...context,kind})).ok,false);
    assert.equal((await rowsOf(h))[msg.requestId].status,'revoked');
    await assert.rejects(h.bridge.handle(msg,h.sender));
    assert.equal(h.events.starts.length,0);assert.equal(h.events.deliveries.length,0);
  }
});

test('P0 concurrent bindings admit exactly one candidate on the original nonce; UNKNOWN execution cannot bind again',async()=>{
  const h=harness(),grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);nextAnswer(h);
  const results=await Promise.allSettled([h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),
    h.bridge.bindPreapprovedTask(binding(h,grant),h.sender)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(results.find(row=>row.status==='rejected').reason.code,'E_BRIDGE_REPLAY');
  const bound=results.find(row=>row.status==='fulfilled').value;
  h.host.start=async()=>{throw Error('UNKNOWN after dispatch');};
  await assert.rejects(h.bridge.handle(autoExecution(h,bound),h.sender),/UNKNOWN after dispatch/);
  await assert.rejects(h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),{code:'E_BRIDGE_REPLAY'});
  assert.equal((await rowsOf(h))[grant.requestId].status,'consumed');
});

test('failed explicit request cancellation keeps its deny fence and never revokes a different source',async()=>{
  const h=harness(),grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);
  await assert.rejects(h.ledger.revokeRequest({source:{...source,documentId:'foreign'},requestId:grant.requestId}),{code:'E_BRIDGE_REQUEST'});
  assert.equal((await rowsOf(h))[grant.requestId].status,'approved');
  const set=h.storage.set;let failing=true;
  h.storage.set=async value=>{if(failing)throw Error('cancel write failure');return set(value);};
  await assert.rejects(h.ledger.revokeRequest(grant),/cancel write failure/);
  await assert.rejects(h.ledger.revokeRequest({source:{...source,documentId:'foreign'},requestId:grant.requestId}),/cancel write failure/);
  failing=false;nextAnswer(h);
  await assert.rejects(h.bridge.bindPreapprovedTask(binding(h,grant),h.sender),{code:'E_BRIDGE_REPLAY'});
  assert.equal((await rowsOf(h))[grant.requestId].status,'revoked');
});


test('P0 serialized baseline inspection accepts idle text without a candidate and rejects streaming or a pending user turn',()=>{
  const f=domFixture();f.$('[data-message-author-role="assistant"]').text('已完成的普通回答');
  const options={identityOnly:true,taskIntent:true,requireComplete:true};
  const baseline=f.read(options);assert.equal(baseline.ok,true);assert.equal(baseline.answerComplete,true);
  assert.ok(baseline.turnKey);assert.ok(baseline.answerKey);
  f.$('[data-message-author-role="assistant"]').attr('data-is-streaming','true');
  assert.equal(f.read(options).error.code,'E_CHAT_STREAMING');
  f.$('[data-message-author-role="assistant"]').removeAttr('data-is-streaming');
  f.$('main').append('<div data-message-author-role="user">等待新回答</div>');
  assert.equal(f.read(options).error.code,'E_CHAT_PENDING');
});


function sessionStorage(){
  let values={};
  return {get:async key=>({[key]:structuredClone(values[key])}),
    set:async update=>{Object.assign(values,structuredClone(update));}};
}
function restartableGate(h,clock){
  let listener;
  h.api.storage={local:h.storage,session:sessionStorage()};
  h.api.runtime.getURL=()=> 'chrome-extension://extid/';
  h.api.runtime.onMessage={addListener:fn=>{listener=fn;}};
  const trusted={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=real'};
  const send=message=>new Promise(resolve=>listener({protocol,...message},trusted,resolve));
  h.api.runtime.sendMessage=send;
  const restart=()=>installChatGPTBridgeTriggerGate({api:h.api,clock});
  restart();return {send,restart};
}
test('healthy full Gate restart after 31 seconds preserves the original five minute grant, binding, consumption and delivery fence',async()=>{
  let now=1000;const h=harness(),gate=restartableGate(h,()=>now);
  const grant=await h.bridge.preapproveNextTask(preapproval(h),h.sender);
  const before=await rowsOf(h);assert.equal(grant.expiresAt,301000);
  now=32000;gate.restart();
  assert.deepEqual(await rowsOf(h),before); // startup is read-only; no blanket revocation
  nextAnswer(h);const bound=await h.bridge.bindPreapprovedTask(binding(h,grant),h.sender);
  assert.equal(bound.requestId,grant.requestId);assert.equal(bound.expiresAt,301000);
  assert.equal(bound.expiresAt-now,269000);
  const context={...bound,mode:'auto',turnKey:bound.candidate.turnKey,answerKey:bound.candidate.answerKey};
  assert.equal((await gate.send({...context,kind:'reserve'})).ok,true);
  const consumed=await rowsOf(h);now+=31000;gate.restart();
  assert.deepEqual(await rowsOf(h),consumed);
  assert.deepEqual(await gate.send({...context,kind:'check-consumed'}),{ok:true,data:{allowed:true}});
  assert.equal((await gate.send({...context,kind:'reserve'})).error.code,'E_BRIDGE_REPLAY');
  assert.equal((await gate.send({...context,kind:'bind-preapproved'})).error.code,'E_BRIDGE_REPLAY');
  assert.equal((await rowsOf(h))[grant.requestId].expiresAt,301000);
});
test('healthy full Gate restart retains a prepared candidate for its original authorization and normal Host delivery',async()=>{
  let now=1000;const h=harness({holdRun:true}),gate=restartableGate(h,()=>now),message=await adopt(h);
  const before=await rowsOf(h);now+=31000;gate.restart();assert.deepEqual(await rowsOf(h),before);
  await approve(h,message);
  now+=31000;gate.restart();
  const execution=h.bridge.handle(message,h.sender);
  await h.runningReady;
  assert.equal((await rowsOf(h))[message.requestId].status,'consumed');
  now+=31000;gate.restart();h.finish();
  assert.equal((await execution).sent,true);
  assert.equal(h.events.starts.length,1);assert.equal(h.events.deliveries.length,1);
});
test('session cancellation marker survives local write failure and healthy worker reconstruction, retaining candidate tombstones',async()=>{
  const h=harness(),gate=restartableGate(h),message=await adopt(h);await approve(h,message);
  const set=h.storage.set;h.storage.set=async()=>{throw Error('local cancellation failed');};
  const reply=await gate.send({kind:'revoke-request',source,requestId:message.requestId});assert.equal(reply.ok,false);
  const fence=(await h.api.storage.session.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY];
  assert.equal(fence.requests[0].requestId,message.requestId);
  gate.restart();h.storage.set=set;
  await assert.rejects(h.bridge.handle(message,h.sender),{code:'E_BRIDGE_REPLAY'});
  const rows=await rowsOf(h);assert.equal(rows[message.requestId].status,'revoked');assert.ok(rows[message.requestId].candidate);
  assert.equal((await h.api.storage.session.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY],null);
  assert.equal(h.events.starts.length,0);assert.equal(h.events.deliveries.length,0);
});
test('session fence write failure still attempts durable local revocation; simultaneous failure is only an in-worker fence',async()=>{
  for(const bothFail of [false,true]){
    const h=harness(),message=await adopt(h);await approve(h,message);
    const session=sessionStorage();session.set=async()=>{throw Error('session unavailable');};
    const ledger=createChatGPTBridgeTriggerLedger({storage:h.storage,revocationStorage:session});
    const set=h.storage.set;
    if(bothFail)h.storage.set=async()=>{throw Error('local unavailable too');};
    await assert.rejects(ledger.revokeApprovals());
    assert.equal((await rowsOf(h))[message.requestId].status,bothFail?'approved':'revoked');
    // No claim of restart safety if neither independent area accepted a write.
    // The live worker still rejects and retains the pending revocation.
    const context={...h.events.gates.at(-1),turnKey:message.turnKey,answerKey:message.answerKey};
    await assert.rejects(ledger.reserve(context));
    h.storage.set=set;
    if(!bothFail){
      const restarted=createChatGPTBridgeTriggerLedger({storage:h.storage});
      await assert.rejects(restarted.reserve(context),{code:'E_BRIDGE_REPLAY'});
    }
  }
});

test('unreadable session storage blocks healthy admission but does not skip local persistence of a pending revocation',async()=>{
  const h=harness(),message=await adopt(h);await approve(h,message);
  const session={get:async()=>{throw Error('session read failed');},set:async()=>{throw Error('session write failed');}};
  const ledger=createChatGPTBridgeTriggerLedger({storage:h.storage,revocationStorage:session});
  const context={...h.events.gates.at(-1),turnKey:message.turnKey,answerKey:message.answerKey};
  await assert.rejects(ledger.reserve(context),/session read failed/);
  await assert.rejects(ledger.revokeSource(source.tabId),/session write failed/);
  assert.equal((await rowsOf(h))[message.requestId].status,'revoked');
  const restarted=createChatGPTBridgeTriggerLedger({storage:h.storage});
  await assert.rejects(restarted.reserve(context),{code:'E_BRIDGE_REPLAY'});
});
