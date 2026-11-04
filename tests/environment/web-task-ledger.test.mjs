import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY} from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

const source={tabId:9,documentId:'generic-document',url:'https://crm.example/tasks'};
const site={id:'crm',version:'1.0.0',origin:'https://crm.example',adapter:'generic',adapterVersion:'1.0.0',
  protocols:['webflow.task.intent.v1'],enabled:true};
const scope={taskId:'crm.read',args:{id:'one'},targetUrl:'https://target.example/',sourceOrigin:site.origin,
  installation:{version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),scriptId:'task:crm.read:1.0.0',
    revision:1,installationId:'install-original',generation:1}};
function harness(){
  let data={},counter=0;const storage={get:async key=>({[key]:structuredClone(data[key])}),
    set:async value=>Object.assign(data,structuredClone(value))};
  const create=()=>createChatGPTBridgeTriggerLedger({storage,
    generateId:()=>`77777777-7777-4777-8777-${String(++counter).padStart(12,'0')}`});
  let ledger=create();
  const candidate=id=>({candidateId:id,turnKey:'event:'+id,answerKey:'event:'+id,text:JSON.stringify({
    protocol:'webflow.task.intent.v1',candidateId:id,taskId:scope.taskId,targetUrl:scope.targetUrl,args:scope.args})});
  return {get ledger(){return ledger;},get data(){return data;},restart(){ledger=create();},
    async approve(value=scope){await ledger.approveAuto(value);await ledger.setAutoEnabled(true);},
    admit:(id,patch={})=>ledger.admitWebTask({source,site,candidate:candidate(id),...scope,...patch})};
}
const submission=row=>({requestId:row.requestId,source:{kind:'saved',scriptId:scope.installation.scriptId,
  revision:1,contentHash:scope.installation.contentHash},paramsWire:encodeValue(scope.args),
  target:{mode:'owned',url:scope.targetUrl},expectedTaskGeneration:1,expectedTaskInstallationId:scope.installation.installationId});

test('generic admission uses the original durable ledger, explicit source grant and immutable site identity',async()=>{
  const h=harness();await h.approve();const row=await h.admit('generic-candidate-1');
  assert.deepEqual(h.data[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].site,site);
  await assert.rejects(h.admit('generic-candidate-1'),{code:'E_BRIDGE_REPLAY'});
  h.restart();await assert.rejects(h.admit('generic-candidate-1'),{code:'E_BRIDGE_REPLAY'});
  for(const patch of [{source:{...source,url:'https://foreign.example/'}},{site:{...site,enabled:false}},
    {sourceOrigin:'https://foreign.example'},{installation:{...scope.installation,generation:2}}])
    await assert.rejects(async()=>h.admit('generic-denied-1',patch));
  const legacy=harness();const {sourceOrigin,...oldScope}=scope;await legacy.approve(oldScope);
  await assert.rejects(legacy.admit('generic-legacy-1'),{code:'E_WEBFLOW_AUTO_DENIED'});
});

test('claim persists consumption and exact offscreen document before ACK; a lost ACK never reclaims',async()=>{
  const h=harness();await h.approve();const row=await h.admit('generic-claim-1');
  const claimed=await h.ledger.claimWebTask({documentId:'offscreen-one',verify:async()=>{}});
  assert.equal(claimed.requestId,row.requestId);
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].webHostDocumentId,'offscreen-one');
  assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].status,'consumed');
  h.restart();assert.equal(await h.ledger.claimWebTask({documentId:'offscreen-two',verify:async()=>{}}),null);
  assert.equal((await h.ledger.inspectWebTask(row.requestId)).status,'consumed');
});

test('original Authority submission guard prevents replay, exact scope changes and revocation during verification',async()=>{
  for(const failure of ['revoke','scope','none']){
    const h=harness();await h.approve();const row=await h.admit('generic-submit-'+failure);
    await h.ledger.claimWebTask({documentId:'offscreen-one',verify:async()=>{}});
    let submitted=0;
    const request=submission(row);if(failure==='scope')request.expectedTaskGeneration++;
    const verify=async()=>{
      if(failure==='revoke')void h.ledger.revokeSource(source.tabId);
    };
    if(failure==='none'){
      await h.ledger.withControllerAdmission(request,async()=>{submitted++;},verify);
      await assert.rejects(h.ledger.withControllerAdmission(request,async()=>{submitted++;},verify));
      assert.equal(submitted,1);
    }else{
      await assert.rejects(h.ledger.withControllerAdmission(request,async()=>{submitted++;},verify));
      assert.equal(submitted,0);
    }
  }
});

test('denied verification leaves no runnable claim, and revocation removes pending work',async()=>{
  const h=harness();await h.approve();await h.admit('generic-preclaim-1');
  await assert.rejects(h.ledger.claimWebTask({documentId:'offscreen-one',verify:async()=>{throw Error('stale document');}}));
  assert.equal(await h.ledger.hasPendingWebTasks(),true);
  await h.ledger.revokeSource(source.tabId);
  assert.equal(await h.ledger.hasPendingWebTasks(),false);
});

test('lifecycle retention can read during serialized submission without inverting the run-admission lock',{timeout:1500},async()=>{
  const h=harness();await h.approve();const admitted=await h.admit('generic-lock-order-1');
  await h.ledger.claimWebTask({documentId:'offscreen-one',verify:async()=>{}});
  assert.equal(await h.ledger.withControllerAdmission(submission(admitted),
    ()=>h.ledger.hasPendingWebTasks(),async()=>{}),true);
});

test('replacement grants retire old pending claims; unknown verifier errors preserve approved rows',async()=>{
  const h=harness();await h.approve();const old=await h.admit('generic-old-grant');
  await h.ledger.approveAuto(scope);const current=await h.admit('generic-new-grant');
  const claimed=await h.ledger.claimWebTask({documentId:'offscreen-one',verify:async()=>{}});
  assert.equal(claimed.requestId,current.requestId);
  assert.equal((await h.ledger.inspectWebTask(old.requestId)).webInvalidReason,'E_WEBFLOW_AUTO_DENIED');
  const unknown=await h.admit('generic-unknown-verifier');
  await assert.rejects(h.ledger.claimWebTask({documentId:'offscreen-one',verify:async()=>{throw Error('native API unknown');}}),/native API unknown/);
  assert.equal((await h.ledger.inspectWebTask(unknown.requestId)).status,'approved');
});
