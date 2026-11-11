import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWebTaskIngress} from '../../../src/page-events/web-task-ingress.js';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY}
  from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {CHATGPT_TASK_PROFILE,WEB_TASK_PROTOCOL} from '../../../src/page-events/web-task-contract.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';

const origin='https://chatgpt.com/',A='https://chatgpt.com/c/0be71d2c-7f21-4d98-963a-5edbcabca394';
const pkg=JSON.parse(await readFile(new URL('../tasks/chatgpt.conversation.create.0.3.0.opendesk-task.json',import.meta.url),'utf8'));
const install={version:'0.3.0',manifestHash:pkg.manifestHash,
  contentHash:pkg.manifest.program.sourceHash,
  scriptId:'task:chatgpt.conversation.create:0.3.0',revision:1,
  installationId:'installation-v3-001',generation:3};
const args={prompt:'A small unsent B task',phase:'prepare'};
const scope={taskId:'chatgpt.conversation.create',targetUrl:origin,sourceOrigin:'https://chatgpt.com',
  args,installation:install};
const source={tabId:19,documentId:'chat-a-document-001',url:A};
const candidateId='wf-v2-b-prepare-integration-00000001';
const candidate={candidateId,turnKey:'turn-b-prepare',answerKey:'answer-b-prepare',
  text:JSON.stringify({protocol:'webflow.task.intent.v2',candidateId,taskId:scope.taskId,args})};
const on=()=>({addListener(){}});
function harness(){
  const store={},runRows=[],resultRows=[],delivery=[];
  let seq=0,ledger,ingress;
  const local={get:async key=>({[key]:structuredClone(store[key])}),
    set:async value=>Object.assign(store,structuredClone(value))};
  const id='test-extension';
  const owner={id,frameId:0,documentId:'original-offscreen',url:'chrome-extension://test-extension/cloud-control/runner.html'};
  const page={id,frameId:0,documentId:source.documentId,url:source.url,
    tab:{id:source.tabId,url:source.url}};
  const api={runtime:{id,getURL:p=>'chrome-extension://'+id+'/'+p,
    getContexts:async filter=>[{contextType:'OFFSCREEN_DOCUMENT',documentId:owner.documentId,
      documentUrl:owner.url,frameId:0}]
      .filter(x=>filter.contextTypes.includes(x.contextType)&&
        (!filter.documentIds||filter.documentIds.includes(x.documentId))&&
        (!filter.documentUrls||filter.documentUrls.includes(x.documentUrl)))},
    permissions:{onRemoved:on(),contains:async()=>true},
    storage:{local,onChanged:on()},
    tabs:{onRemoved:on(),get:async tabId=>tabId===58?
      {id:58,url:origin,incognito:false,pendingUrl:null}:
      {id:source.tabId,url:source.url,incognito:false,pendingUrl:null},
      sendMessage:async (...call)=>{delivery.push(call);return {ok:true,data:{sent:true}}}},
    webNavigation:{onCommitted:on(),onHistoryStateUpdated:on(),
      onReferenceFragmentUpdated:on(),
      getFrame:async({tabId})=>tabId===58?
        {documentId:'retained-b-document',url:origin,documentLifecycle:'active'}:
        {documentId:source.documentId,url:source.url,documentLifecycle:'active'}}};
  const broker={storage:{transaction:async(_names,_mode,fn)=>fn({get:async()=>null,
      all:async name=>structuredClone(name==='runs'?runRows:resultRows)})},
    authority:{captureInstalledTaskFence:()=>()=>{},resolveInstalledTask:async()=>({
      taskId:scope.taskId,...install,manifest:pkg.manifest}),
    snapshotControllerRun:async()=>({run:structuredClone(runRows[0]),results:structuredClone(resultRows),
      resultDeliveryDenied:[]})}};
  const create=()=>createChatGPTBridgeTriggerLedger({storage:local,
    generateId:()=> 'b0000000-0000-4000-8000-'+String(++seq).padStart(12,'0')});
  const reopen=()=>{
    ledger=create();
    ingress=createWebTaskIngress({api,ledger,loadFoundation:async()=>broker,
      ensureRunner:async()=>{},verifyChatGPTCandidate:async()=>{},
      verifyTaskScope:async()=>({...pkg.manifest,installation:install})});
  };
  reopen();
  return {store,source,page,owner,delivery,scope,runRows,resultRows,reopen,
    get ledger(){return ledger;},get ingress(){return ingress;}};
}
test('real PREPARE consumer retains B proof and does not deliver as if B replied',async()=>{
  const h=harness();
  const admitted=await h.ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,candidate,
    allowPending:true,...scope});
  await h.ledger.approveV2Pending({source,requestId:admitted.requestId,candidate,scope});
  await h.ledger.armWebTask(admitted.requestId,source);
  const started=await h.ingress.handle({protocol:WEB_TASK_PROTOCOL,kind:'claim'},h.owner);
  assert.equal(started.target.mode,'owned');assert.equal(started.target.url,origin);
  const rId='run-prepare-b-001',resultId='result-prepare-b-001';
  const revision={scriptId:install.scriptId,revision:1,sourceHash:install.contentHash};
  await h.ledger.withControllerAdmission({...started,paramsWire:encodeValue(started.params)},
    async()=>{h.runRows.push({tag:'controller-run',namespace:'tool:'+h.owner.id,
      runId:rId,requestId:admitted.requestId,resultId,
      hostDocumentId:h.owner.documentId,state:'completed',retirementState:'released',
      scriptId:install.scriptId,contentHash:install.contentHash,sourceKind:'saved',
      revision,targetDisposition:'retain-on-success',selection:{mode:'owned',url:origin},
      target:{mode:'owned',tabId:58,frameId:0,documentId:'retained-b-document',
        allowedOrigin:'https://chatgpt.com',url:origin},
      retainedTarget:{tabId:58,documentId:'retained-b-document',
        origin:'https://chatgpt.com',url:origin}});},
    row=>h.ingress.verifySubmission(row,h.owner));
  h.resultRows.push({tag:'controller-result',runId:rId,resultId,state:'completed',
    sourceKind:'saved',revision,outcome:{ok:true,valueWire:encodeValue({
      kind:'chatgpt.conversation.create.result',version:3,phase:'prepare',
      status:'draft-prepared',send:false,messageConfirmed:false,
      conversationId:null,conversationUrl:null,sourceUrl:origin,
      promptChars:args.prompt.length,readbackConfirmed:true,
      observedAt:'2026-11-11T12:20:00.000Z'})}});
  const settled=await h.ingress.handle({protocol:WEB_TASK_PROTOCOL,kind:'settle',
    requestId:admitted.requestId},h.owner);
  assert.equal(settled.state,'prepared-account-unverified');
  assert.equal(h.delivery.length,0,'never deliver PREPARE as the completed B answer');
  const persisted=h.store[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId];
  assert.equal(persisted.webBPrepared.prepareRunId,rId);
  assert.equal(persisted.webBPrepared.tabId,58);
  assert.equal(persisted.webBPrepared.profileVerified,false);
  assert.equal(persisted.webDelivery,undefined);
  h.reopen();
  const again=await h.ingress.handle({protocol:WEB_TASK_PROTOCOL,kind:'settle',
    requestId:admitted.requestId},h.owner);
  assert.equal(again.state,'prepared-account-unverified');
  assert.equal(h.delivery.length,0);
});
