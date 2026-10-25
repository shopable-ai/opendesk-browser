// R2.0 Baidu business bridge: component/contract evidence only, never a Chrome PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {createChatGPTBridgeTriggerLedger} from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {bridgePrompt,initChatGPTFixedBridgePage} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';
import {validateChatGPTTaskRequest,baiduSearchTarget} from '../../src/native-agent/chatgpt-task-request.js';
import {createChatGPTFixedBridgeHost,verifyChatGPTTaskDurableResult,
  formatChatGPTBaiduResult,BAIDU_TASK_VERSION,BAIDU_TASK_SOURCE_HASH,
  BAIDU_TASK_MANIFEST_HASH} from '../../src/native-agent/chatgpt-fixed-bridge-host.js';

const id='33333333-3333-4333-8333-333333333333';
const source={tabId:9,documentId:'document-search',url:'https://chatgpt.com/c/search-session-12345678'};
const args={query:'OpenDesk Browser',limit:3};
const request=validateChatGPTTaskRequest(JSON.stringify({
  protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',
  version:1,requestId:id,taskId:'baidu.search.top3',args
}));
const candidateText=JSON.stringify(request);
const resultData={kind:'baidu.search.top3.result',version:1,query:args.query,
  sourceUrl:baiduSearchTarget(request),status:'success',count:2,
  results:[
    {position:1,title:'OpenDesk Browser A',summary:'真实网页摘要 A',
      url:'https://example.org/a',directUrl:'https://example.org/a',
      evidence:{slot:'1',tpl:'se_com_default'}},
    {position:2,title:'OpenDesk Browser B',summary:'真实网页摘要 B',
      url:'https://www.baidu.com/link?url=abc',
      evidence:{slot:null,tpl:'se_com_default'}}
  ],observedAt:'2026-10-26T00:00:00.000Z'};

function storage(){
  let saved={};
  return {async get(key){return {[key]:structuredClone(saved[key])};},
    async set(value){saved={...saved,...structuredClone(value)};}};
}
test('one durable nonce is pinned to exactly one selected Task and search query',async()=>{
  const backing=storage();
  const ledger=createChatGPTBridgeTriggerLedger({storage:backing,clock:()=>1000,generateId:()=>id});
  const ready=await ledger.prepare(source,{taskId:request.taskId,args:request.args});
  assert.deepEqual(ready.args,args);
  assert.equal(ready.taskId,request.taskId);
  await ledger.authorize({source,requestId:id,mode:'auto'});
  const context={source,requestId:id,mode:'auto',turnKey:'turn-1',answerKey:'answer-1:0'};
  await assert.rejects(ledger.reserve({...context,taskId:'page.read.fixed',args:{}}),
    {code:'E_BRIDGE_CONTEXT'});
  await assert.rejects(ledger.reserve({...context,taskId:request.taskId,
    args:{query:"not the user's query",limit:3}}),{code:'E_BRIDGE_CONTEXT'});
  assert.equal((await ledger.reserve({...context,taskId:request.taskId,args})).consumed,true);
  const restarted=createChatGPTBridgeTriggerLedger({storage:backing,clock:()=>1001});
  assert.equal((await restarted.assertConsumed({...context,taskId:request.taskId,args})).allowed,true);
  await assert.rejects(restarted.assertConsumed({...context,taskId:'page.read.fixed',args:{}}),
    {code:'E_BRIDGE_REVOKED'});
  await assert.rejects(restarted.reserve({...context,taskId:request.taskId,args}),
    {code:'E_BRIDGE_REPLAY'});
});
test('ChatGPT page waits for the complete streamed candidate before one approved automatic request',async()=>{
  const nodes=[],listeners=new Map();
  const element=tag=>{
    const node={tag,style:{},classList:{toggle(){}},listeners:{},
      setAttribute(){},append(){},remove(){},
      attachShadow(){return element('shadow');},
      addEventListener(type,fn){this.listeners[type]=fn;}};
    nodes.push(node);return node;
  };
  const doc={getElementById:()=>null,createElement:element,body:element('body'),
    addEventListener:(type,fn)=>listeners.set(type,fn),
    removeEventListener:type=>listeners.delete(type)};
  const location={href:source.url,origin:'https://chatgpt.com'};
  let poll=null;
  const win={location,setInterval(fn){poll=fn;return 1;},clearInterval(){},
    addEventListener(){},removeEventListener(){}};win.top=win;
  const editor={ownerDocument:doc,focus(){doc.activeElement=editor;}};
  const snap={ok:true,route:'c/search-session-12345678',editor,form:{},idle:true,
    busy:false,answerComplete:true,draft:'',rich:false,users:[],assistants:[{}]};
  const promptTexts=[];
  const site={inspect:()=>({...snap}),prepare(text){
    promptTexts.push(text);snap.draft=text;return {ok:true,token:{}};}};
  const sends=[],issued=Promise.withResolvers();
  const api={runtime:{id:'extid',getURL:()=>'chrome-extension://extid/',
    onMessage:{addListener(){},removeListener(){}},
    async sendMessage(message){
      sends.push(message);
      if(message.kind==='prepare'){
        assert.equal(message.taskId,request.taskId);assert.deepEqual(message.args,args);
        return {ok:true,data:{requestId:id,taskId:request.taskId,args,source}};
      }
      if(message.kind==='authorize'){
        assert.equal(message.mode,'auto');return {ok:true,data:{}};
      }
      if(message.kind==='execute'){
        assert.equal(message.mode,'auto');
        assert.equal(message.requestId,id);
        assert.deepEqual(JSON.parse(message.candidateText),request);
        issued.resolve();
        return {ok:true,data:{taskId:request.taskId,taskStatus:'success',
          resultCount:2,sent:true,aiReplyObserved:true}};
      }
      throw Error('Unexpected message '+message.kind);
    }}};
  let responseText=candidateText.slice(0,-1);
  const page=initChatGPTFixedBridgePage({api,doc,win,site,readPage:opts=>({
    ok:true,turnKey:'turn-1',answerKey:'answer-1:0',blocks:[responseText]})});
  const select=nodes.find(node=>node.tag==='select');
  const input=nodes.find(node=>node.tag==='input');
  const labels=nodes.filter(node=>node.tag==='label');
  assert.ok(select&&input);
  assert.equal(labels[1].hidden,true); // fixed task does not show a keyword field
  select.value='baidu.search.top3';
  select.listeners.change();
  assert.equal(labels[1].hidden,false);
  input.value=args.query;
  const buttons=nodes.filter(node=>node.tag==='button');
  await buttons[0].listeners.click({isTrusted:true});
  assert.equal(promptTexts.length,1);
  assert.match(promptTexts[0],/"taskId":"baidu.search.top3"/);
  assert.equal(select.disabled,true); // task/params cannot switch within a prepared request
  snap.users=[{textContent:id}];snap.draft=''; // the user sent the request on ChatGPT
  snap.busy=true;snap.idle=false;snap.answerComplete=false;
  await buttons[1].listeners.click({isTrusted:true}); // approve just this user turn
  assert.equal(sends.filter(x=>x.kind==='authorize').length,1);
  assert.equal(typeof poll,'function');
  poll();
  assert.equal(sends.filter(x=>x.kind==='execute').length,0);
  responseText=candidateText; // valid JSON alone is not a completed official response
  poll();
  assert.equal(sends.filter(x=>x.kind==='execute').length,0);
  snap.busy=false;snap.idle=true;
  poll();
  assert.equal(sends.filter(x=>x.kind==='execute').length,0);
  snap.answerComplete=true;
  responseText=candidateText.slice(0,-1); // completion cannot authorize malformed JSON
  poll();
  assert.equal(sends.filter(x=>x.kind==='execute').length,0);
  responseText=candidateText;
  poll();
  await issued.promise;
  // Finish the asynchronous host result path before calling the interval again.
  await Promise.resolve();await Promise.resolve();
  poll();
  assert.equal(sends.filter(x=>x.kind==='execute').length,1);
  assert.equal(buttons[2].disabled,true);
  page.dispose();
});
test('Baidu prompt contains the selected query in one immutable JSON candidate and no MCP authority',()=>{
  const text=bridgePrompt(id,request.taskId,args);
  assert.ok(text.includes('百度搜索'));
  assert.ok(text.includes('不是你已注册的 MCP 工具'));
  assert.doesNotMatch(text,/\n|https?:\/\//);
  assert.deepEqual(JSON.parse(text.slice(text.indexOf('{'))),request);
  assert.throws(()=>bridgePrompt(id,request.taskId,{query:'',limit:3}),{code:'E_BRIDGE_SCHEMA'});
});

function fixture(data=resultData){
  const runId='run-baidu-123',resultId='result-baidu-123';
  const scriptId='task:baidu.search.top3:1.0.0';
  const revision={scriptId,revision:1,sourceHash:BAIDU_TASK_SOURCE_HASH};
  const snapshot={run:{runId,resultId,scriptId,state:'completed',
    retirementState:'released',sourceKind:'saved',contentHash:BAIDU_TASK_SOURCE_HASH,revision},
    results:[{tag:'controller-result',runId,resultId,state:'completed',
      sourceKind:'saved',revision,outcome:{ok:true,valueWire:encodeValue(data)}}],
    resultDeliveryDenied:[]};
  return {runId,resultId,scriptId,snapshot,resolved:{scriptId,revision:1}};
}
test('durable Baidu decoding verifies real revision, status, links, count and source URL',()=>{
  const fx=fixture(),durable=verifyChatGPTTaskDurableResult(fx.snapshot,fx.runId,fx.resolved,request);
  assert.equal(durable.value.count,2);
  assert.equal(durable.value.results[1].url,'https://www.baidu.com/link?url=abc');
  const text=formatChatGPTBaiduResult(id,durable);
  assert.match(text,/未经信任|不可信网页数据/);
  assert.doesNotMatch(text,/https?:\/\//);
  const payload=JSON.parse(text.slice(text.indexOf('{')));
  assert.equal(payload.data.status,'success');
  assert.equal(payload.requestId,id);
  for(const status of ['blocked','dom_unavailable','dom_changed','no_results']){
    const zero={...resultData,status,count:0,results:[]};
    assert.equal(verifyChatGPTTaskDurableResult(fixture(zero).snapshot,fx.runId,
      fx.resolved,request).value.status,status);
  }
  for(const wrong of [
    {...resultData,query:'other'},
    {...resultData,sourceUrl:'https://evil.example/'},
    {...resultData,count:3},
    {...resultData,status:'success',count:0,results:[]},
    {...resultData,status:'blocked'},
    {...resultData,results:[{...resultData.results[0],url:'javascript:alert(1)'},resultData.results[1]]},
    {...resultData,results:[resultData.results[0],{...resultData.results[1],url:'https://example.org/a'}]},
    {...resultData,results:[{...resultData.results[0],position:2},resultData.results[1]]}
  ])assert.throws(()=>verifyChatGPTTaskDurableResult(fixture(wrong).snapshot,fx.runId,
    fx.resolved,request),{code:'E_BRIDGE_RESULT'});
  const denied={...fx.snapshot,resultDeliveryDenied:[fx.runId]};
  assert.throws(()=>verifyChatGPTTaskDurableResult(denied,fx.runId,fx.resolved,request),
    {code:'E_BRIDGE_DURABLE'});
});
function harness({disabled=false,available=true,permission=true,
  changedHash=false,sendThrows=false,badResult=false}={}){
  const fx=fixture(badResult?{...resultData,count:3}:resultData);
  const installation={taskId:request.taskId,version:BAIDU_TASK_VERSION,
    manifestHash:BAIDU_TASK_MANIFEST_HASH,enabled:!disabled,
    generation:7,installationId:'installation-baidu-1',scriptId:fx.scriptId};
  const manifest={taskId:request.taskId,version:BAIDU_TASK_VERSION,
    siteOrigins:['https://www.baidu.com'],program:{revision:1,sourceHash:BAIDU_TASK_SOURCE_HASH}};
  const candidate={taskId:request.taskId,version:BAIDU_TASK_VERSION,
    manifestHash:BAIDU_TASK_MANIFEST_HASH,stage:available?'available':'unverified',manifest};
  const resolved={...fx.resolved,taskId:request.taskId,version:BAIDU_TASK_VERSION,
    manifestHash:BAIDU_TASK_MANIFEST_HASH,generation:7,installationId:'installation-baidu-1',
    contentHash:changedHash?'f'.repeat(64):BAIDU_TASK_SOURCE_HASH,manifest};
  const events={reserve:0,check:0,start:0,send:0};
  const api={runtime:{id:'extid',async sendMessage(message){
      if(message.kind==='reserve'){
        events.reserve++;
        assert.equal(message.taskId,request.taskId);
        assert.deepEqual(message.args,args);
        return {ok:true,data:{consumed:true}};
      }
      assert.equal(message.kind,'check-consumed');events.check++;
      assert.equal(message.taskId,request.taskId);
      return {ok:true,data:{allowed:true}};
    }},
    tabs:{async get(tabId){return {id:tabId,url:source.url,windowId:2,incognito:false};},
      async sendMessage(tabId,message,opt){
        events.send++;
        assert.equal(tabId,source.tabId);assert.equal(opt.documentId,source.documentId);
        events.delivered=message.text;
        if(sendThrows)throw new Error('ambiguous native send');
        return {ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}};
      }},
    webNavigation:{async getFrame(){return {documentId:source.documentId,url:source.url,
      documentLifecycle:'active',errorOccurred:false};}},
    permissions:{async contains(spec){
      assert.deepEqual(spec.origins,['https://chatgpt.com/*','https://www.baidu.com/*']);
      return permission;
    },onRemoved:{addListener(){},removeListener(){}}}
  };
  const client={request:async method=>{
      if(method==='listTaskCatalog')return {installed:[installation],catalog:[candidate]};
      if(method==='resolveInstalledTask')return resolved;
      throw new Error('unknown method: '+method);
    },
    subscribeInstalledTasks:()=>()=>{},
    subscribeConnection:()=>()=>{},
    controller:{async snapshotControllerRun(){return fx.snapshot;}}};
  const host={get currentRun(){return null;},
    async start(input){events.start++;events.startInput=input;return {runId:fx.runId};},
    get completion(){return Promise.resolve({runId:fx.runId,state:'completed',
      retirement:{state:'released'},result:{resultId:fx.resultId}});}};
  const sender={id:'extid',frameId:0,documentId:source.documentId,url:source.url,
    tab:{id:source.tabId,url:source.url,windowId:2,incognito:false}};
  const message={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'execute',
    requestId:id,mode:'manual',source,sourceUrl:source.url,turnKey:'turn-1',
    answerKey:'answer-1:0',candidateText};
  const bridge=createChatGPTFixedBridgeHost({api,client,host,
    currentPageTarget:{snapshot:{windowId:2}},isVerifiedSidePanel:()=>true,
    readReply:async()=>({turnKey:message.turnKey,answerKey:message.answerKey,
      blocks:[candidateText]})});
  return {bridge,message,sender,events,fx};
}
test('Baidu Host reuses exact RunHost/Authority, owned target, immutable params and one send',async()=>{
  const h=harness();
  const receipt=await h.bridge.handle(h.message,h.sender);
  assert.equal(receipt.taskId,'baidu.search.top3');
  assert.equal(receipt.taskStatus,'success');
  assert.equal(receipt.resultCount,2);
  assert.equal(receipt.sent,true);
  assert.deepEqual({...h.events.startInput.params},args);
  assert.deepEqual(h.events.startInput.target,{mode:'owned',url:baiduSearchTarget(request)});
  assert.equal(h.events.startInput.expectedTaskGeneration,7);
  assert.equal(h.events.startInput.expectedTaskInstallationId,'installation-baidu-1');
  assert.equal(h.events.reserve,1);assert.equal(h.events.start,1);
  assert.equal(h.events.send,1);assert.ok(h.events.check>=2);
  assert.equal(JSON.parse(h.events.delivered.slice(h.events.delivered.indexOf('{'))).data.count,2);
});
test('Baidu Host denies unverified, disabled, uninstalled hash, Chrome denial and invalid result',async()=>{
  for(const opts of [{disabled:true},{available:false},{permission:false},
    {changedHash:true},{badResult:true}]){
    const h=harness(opts);
    await assert.rejects(h.bridge.handle(h.message,h.sender));
    assert.equal(h.events.send,0,JSON.stringify(opts));
    if(!opts.badResult)assert.equal(h.events.start,0,JSON.stringify(opts));
  }
});
test('ambiguous ChatGPT send after a real run does not trigger another run or send',async()=>{
  const h=harness({sendThrows:true});
  await assert.rejects(h.bridge.handle(h.message,h.sender),{code:'E_BRIDGE_SEND_UNKNOWN'});
  assert.equal(h.events.start,1);assert.equal(h.events.send,1);
});
