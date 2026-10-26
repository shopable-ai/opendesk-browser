// Component evidence only; real Chrome runs are recorded separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTFixedBridgeHost,verifyChatGPTTaskDurableResult,formatChatGPTInstalledResult}
  from '../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const protocol='opendesk.chatgpt.bridge.r12.v1';
const id='33333333-3333-4333-8333-333333333333';
const source={tabId:9,documentId:'installed-task-document',url:'https://chatgpt.com/c/task-test-12345678'};
function harness(){
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
  const events={starts:[],gates:[],progress:[],deliveries:[]};let permission=true,onSend=()=>{};
  const api={runtime:{id:'extid',async sendMessage(msg){events.gates.push(msg);
    return {ok:true,data:msg.kind==='reserve'?{consumed:true}:{allowed:true}};}},
    tabs:{get:async()=>({...sender.tab}),async sendMessage(tab,msg,options){
      assert.equal(tab,source.tabId);assert.equal(options.documentId,source.documentId);
      if(msg.kind==='progress'){events.progress.push(msg);return {ok:true,data:{observed:true}};}
      onSend();events.deliveries.push(msg);
      await bridge.checkDelivery({...msg,kind:'check-delivery'},sender);
      return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};}},
    webNavigation:{getFrame:async()=>({...source,documentLifecycle:'active'})},
    permissions:{contains:async()=>permission,onRemoved:{addListener(){},removeListener(){}}}};
  const client={request:async method=>method==='listTaskCatalog'?{installed:[installed],catalog:[candidate]}:resolved,
    controller:{snapshotControllerRun:async()=>snapshot}};
  const host={currentRun:null,start:async input=>{events.starts.push(input);return {runId:'run-article'};},
    completion:Promise.resolve({runId:'run-article',state:'completed',retirement:{state:'released'},
      result:{resultId:'result-article'}})};
  const bridge=createChatGPTFixedBridgeHost({api,client,host,currentPageTarget:{snapshot:{windowId:2}},
    isVerifiedSidePanel:()=>true,checkTarget:async()=>{},
    readReply:async()=>({turnKey:message.turnKey,answerKey:message.answerKey,blocks:[message.candidateText]})});
  return {bridge,client,request,message,sender,installation,installed,resolved,candidate,events,snapshot,
    deny:()=>{permission=false;},onSend:fn=>{onSend=fn;}};
}
test('installed directory resolves a third script and schema defaults without starting a run',async()=>{
  const h=harness();
  const listed=await h.bridge.listTasks({protocol,kind:'list-tasks'},h.sender);
  assert.equal(listed.tasks[0].taskId,'article.read');assert.deepEqual(listed.tasks[0].installation,h.installation);
  const normalized=await h.bridge.prepareTask({...h.request,protocol,kind:'prepare-task',args:{}},h.sender);
  assert.deepEqual(normalized.args,{maxChars:200});assert.equal(h.events.starts.length,0);
});
test('generic task uses the original RunHost with selected params, target and single-shot scope',async()=>{
  const h=harness(),receipt=await h.bridge.handle(h.message,h.sender);
  assert.equal(receipt.sent,true);assert.equal(h.events.starts.length,1);assert.equal(h.events.deliveries.length,1);
  assert.deepEqual(h.events.starts[0].params,{maxChars:200});
  assert.deepEqual(h.events.starts[0].target,{mode:'owned',url:h.request.targetUrl});
  assert.equal(h.events.starts[0].expectedTaskInstallationId,h.installation.installationId);
  assert.equal(h.events.starts[0].expectedTaskGeneration,2);
  for(const gate of h.events.gates){assert.equal(gate.targetUrl,h.request.targetUrl);assert.deepEqual(gate.installation,h.installation);}
  assert.deepEqual(h.events.progress.map(row=>row.stage),['validating','starting','running','result-ready']);
  assert.equal(h.events.progress[2].runId,'run-article');
  const result=JSON.parse(h.events.deliveries[0].text.slice(h.events.deliveries[0].text.indexOf('{')));
  assert.deepEqual(result.data,{title:'Article',excerpt:'Real page data'});
});
test('an unrelated obsolete builtin installation is explained without hiding a runnable script',async()=>{
  const h=harness(),request=h.client.request;
  const stale={...h.installed,taskId:'obsolete.task'};
  h.client.request=async(method,input)=>{
    if(method==='listTaskCatalog')return {installed:[stale,h.installed],catalog:[h.candidate,
      {...h.candidate,taskId:stale.taskId,manifest:{...h.candidate.manifest,taskId:stale.taskId}}]};
    if(input.taskId===stale.taskId)throw Object.assign(new Error('runtime identity changed'),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
    return request(method,input);
  };
  const result=await h.bridge.listTasks({protocol,kind:'list-tasks'},h.sender);
  assert.deepEqual(result.tasks.map(row=>row.taskId),['article.read']);
  assert.deepEqual(result.unavailable,[{taskId:'obsolete.task',reason:'runtime identity changed'}]);
});
test('preflight rejects unapproved origin, schema parameters, permissions and stale identity before admission',async()=>{
  for(const change of ['origin','parameter','generation','disabled','permission']){
    const h=harness();
    if(change==='origin')h.request.targetUrl='https://foreign.example/article';
    if(change==='parameter')h.request.args={maxChars:999};
    if(change==='generation')h.installed.generation++;
    if(change==='disabled')h.installed.enabled=false;
    if(change==='permission')h.deny();
    await assert.rejects(h.bridge.prepareTask({...h.request,protocol,kind:'prepare-task'},h.sender));
    assert.equal(h.events.starts.length,0);assert.equal(h.events.gates.length,0);
  }
});
test('generic delivery rechecks installation identity and never retries a failed send boundary',async()=>{
  const h=harness();h.onSend(()=>{h.installed.generation++;});
  await assert.rejects(h.bridge.handle(h.message,h.sender));
  assert.equal(h.events.starts.length,1);assert.equal(h.events.deliveries.length,1);
});
test('generic durable results retain exact source identity and refuse unsupported or oversized JSON',()=>{
  const h=harness();
  assert.equal(verifyChatGPTTaskDurableResult(h.snapshot,'run-article',h.resolved,h.request).value.title,'Article');
  h.snapshot.run.contentHash='f'.repeat(64);
  assert.throws(()=>verifyChatGPTTaskDurableResult(h.snapshot,'run-article',h.resolved,h.request),{code:'E_BRIDGE_DURABLE'});
  h.snapshot.run.contentHash=h.installation.contentHash;
  for(const value of [undefined,{text:'x'.repeat(7001)}]){
    h.snapshot.results[0].outcome.valueWire=encodeValue(value);
    assert.throws(()=>verifyChatGPTTaskDurableResult(h.snapshot,'run-article',h.resolved,h.request),{code:'E_BRIDGE_RESULT'});
  }
  assert.throws(()=>formatChatGPTInstalledResult(h.request,{value:' / '.repeat(3000)}),{code:'E_BRIDGE_LIMIT'});
});
