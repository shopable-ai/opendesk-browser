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
function harness({holdRun=false}={}){
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
  const ledger=createChatGPTBridgeTriggerLedger({storage,generateId:()=>`44444444-4444-4444-8444-${String(++counter).padStart(12,'0')}`});
  const runningReady=Promise.withResolvers(),heldCompletion=Promise.withResolvers();
  const target={mode:'owned',tabId:42,frameId:0,documentId:'article-target-document',
    allowedOrigin:'https://example.com',targetSessionId:'article-session',targetVersion:1};
  const targetFrame={tabId:target.tabId,frameId:0,documentId:target.documentId,
    documentLifecycle:'active',url:request.targetUrl};
  const chromeEvent=()=>{const listeners=new Set();return {
    addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};};
  const permissionListeners=new Set();
  const events={starts:[],gates:[],progress:[],deliveries:[],snapshots:[],updates:[],stops:[]};
  let permission=true,onSend=()=>{};
  const api={runtime:{id:'extid',async sendMessage(msg){events.gates.push(msg);
    try{
      const data=await (msg.kind==='prepare'?ledger.prepare(msg.source,msg):
        msg.kind==='authorize'?ledger.authorize(msg):msg.kind==='reserve'?ledger.reserve(msg):ledger.assertConsumed(msg));
      if(msg.kind==='prepare'&&losePrepare)throw Error('ACK lost after durable write');
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
    isVerifiedSidePanel:()=>true,checkTarget:async()=>{},
    readReply:async()=>structuredClone(observed)});
  return {bridge,client,request,message,sender,installation,installed,resolved,candidate,events,snapshot,observed,intent,ledger,storage,host,target,finish,runningReady:runningReady.promise,
    revokePermission:()=>{permission=false;for(const listener of permissionListeners)listener();},losePrepare:()=>{losePrepare=true;},
    deny:()=>{permission=false;},onSend:fn=>{onSend=fn;}};
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
  const read=()=>vm.runInContext('('+inspectChatGPTEditsOnPage.toString()+')('+JSON.stringify({
    expectedUrl:source.url,taskIntent:true,requireComplete:true,protocols:['opendesk.task.intent.v1']})+')',sandbox);
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
