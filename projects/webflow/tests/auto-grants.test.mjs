import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {WEBFLOW_AUTO_GRANTS_KEY} from '../src/auto-grants.js';

const source={tabId:9,documentId:'auto-document',url:'https://chatgpt.com/c/webflow-test-12345678'};
const installation={version:'1.1.1',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
  scriptId:'task:baidu.search.top3:1.1.1',revision:1,installationId:'install-original',generation:1};
const scope={taskId:'baidu.search.top3',args:{query:'OpenDesk Browser',limit:3},targetUrl:'https://www.baidu.com/',installation};
function harness(){
  let data={},sessionData={},counter=0,failWrite=false,failSessionGet=false,failSessionSet=false,reorder=false,onWrite=()=>{},onRead=()=>{};
  const reverse=value=>value&&typeof value==='object'&&!Array.isArray(value)?
    Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
  const storage={get:async key=>{const value=reorder?reverse(structuredClone(data[key])):structuredClone(data[key]);onRead(key);return {[key]:value};},set:async value=>{
    if(failWrite)throw Error('local write unavailable');Object.assign(data,structuredClone(value));onWrite(value);}};
  const session={get:async key=>{if(failSessionGet)throw Error('session get failed');return {[key]:structuredClone(sessionData[key])};},
    set:async value=>{if(failSessionSet)throw Error('session set failed');Object.assign(sessionData,structuredClone(value));}};
  const create=()=>createChatGPTBridgeTriggerLedger({storage,revocationStorage:session,
    generateId:()=>`55555555-5555-4555-8555-${String(++counter).padStart(12,'0')}`});
  let ledger=create();
  const candidate=(id,protocol='webflow.task.intent.v1')=>({candidateId:id,turnKey:'turn-'+id,answerKey:'answer-'+id,
    text:JSON.stringify({protocol,candidateId:id,taskId:scope.taskId,targetUrl:scope.targetUrl,args:scope.args})});
  const admit=async(id,changes={})=>ledger.admitAuto({source,...structuredClone(scope),candidate:candidate(id),...changes});
  return {get ledger(){return ledger;},restart:()=>{ledger=create();},candidate,admit,
    denyWrites:()=>{failWrite=true;},allowWrites:()=>{failWrite=false;},
    sessionFault:(kind,value)=>{if(kind==='get')failSessionGet=value;else failSessionSet=value;},reorder:()=>{reorder=true;},
    onWrite:fn=>{onWrite=fn;},
    onRead:fn=>{onRead=fn;},
    get data(){return data;},async approve(){await ledger.approveAuto(scope);await ledger.setAutoEnabled(true);}};
}
test('default off; one grant admits two fresh candidates across worker restart without renewing',async()=>{
  const h=harness();assert.equal((await h.ledger.readAutoSettings()).enabled,false);
  await assert.rejects(h.admit('wf-fresh-0001'));
  await h.approve();
  const a=await h.admit('wf-fresh-0001');
  const first={...a,mode:'auto',turnKey:a.candidate.turnKey,answerKey:a.candidate.answerKey};
  assert.equal((await h.ledger.reserve(first)).consumed,true);
  h.restart();assert.equal((await h.ledger.assertConsumed(first)).allowed,true);
  const b=await h.admit('wf-fresh-0002');assert.notEqual(a.requestId,b.requestId);
  assert.equal((await h.ledger.reserve({...b,mode:'auto',turnKey:b.candidate.turnKey,answerKey:b.candidate.answerKey})).consumed,true);
  assert.equal(Object.keys(h.data[WEBFLOW_AUTO_GRANTS_KEY].grants).length,1);
});
const submission=admitted=>({requestId:admitted.requestId,source:{kind:'saved',scriptId:installation.scriptId,
  revision:installation.revision,contentHash:installation.contentHash},paramsWire:encodeValue(scope.args),
  target:{mode:'owned',url:scope.targetUrl},expectedTaskGeneration:installation.generation,
  expectedTaskInstallationId:installation.installationId});
test('new exact scope waits with zero submission, approval replaces scope and consumes the same candidate once',async()=>{
 const h=harness();await h.approve();
 const next={...scope,args:{query:'OpenDesk Browser SDK',limit:3}};
 const candidate=h.candidate('wf-new-schema-scope');candidate.text=JSON.stringify({...JSON.parse(candidate.text),args:next.args});
 const admitted=await h.ledger.admitAuto({source,...next,candidate,allowPending:true});
 assert.equal(admitted.pendingApproval,true);
 const reservation={...admitted,mode:'auto',turnKey:candidate.turnKey,answerKey:candidate.answerKey};
 let starts=0;
 await assert.rejects(h.ledger.reserve(reservation));
 const request={...submission(admitted),paramsWire:encodeValue(next.args)};
 await assert.rejects(h.ledger.withControllerAdmission(request,async()=>{starts++;}));
 assert.equal(starts,0);assert.equal(h.data[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].status,'prepared');
 await h.ledger.approveAuto(next,{pendingRequest:{source,requestId:admitted.requestId,candidate}});
 assert.deepEqual((await h.ledger.readAutoSettings()).grants[scope.taskId].scope.args,next.args);
 await h.ledger.reserve(reservation);
 await h.ledger.withControllerAdmission(request,async()=>{starts++;});
 await assert.rejects(h.ledger.withControllerAdmission(request,async()=>{starts++;}));
 await assert.rejects(h.ledger.admitAuto({source,...next,candidate,allowPending:true}));
 assert.equal(starts,1);
 const fresh=h.candidate('wf-new-schema-next');fresh.text=JSON.stringify({...JSON.parse(fresh.text),args:next.args});
 const second=await h.ledger.admitAuto({source,...next,candidate:fresh,allowPending:true});
 assert.equal(second.pendingApproval,false);assert.notEqual(second.requestId,admitted.requestId);
 await assert.rejects(h.admit('wf-old-scope-revoked'));
});
test('cancelled, edited and disabled pending scopes cannot be approved by late callbacks',async()=>{
 for(const failure of ['cancel','scope','candidate','disabled']){
  const h=harness();await h.approve();const next={...scope,args:{query:'SDK',limit:3}};
  const candidate=h.candidate('wf-pending-'+failure);candidate.text=JSON.stringify({...JSON.parse(candidate.text),args:next.args});
  const admitted=await h.ledger.admitAuto({source,...next,candidate,allowPending:true});
  if(failure==='cancel')await h.ledger.revokeRequest({source,requestId:admitted.requestId});
  if(failure==='disabled')await h.ledger.setAutoEnabled(false);
  const review=failure==='scope'?scope:next;
  await assert.rejects(h.ledger.approveAuto(review,{pendingRequest:{source,requestId:admitted.requestId,
   candidate:failure==='candidate'?{...candidate,answerKey:'changed'}:candidate}}));
  await assert.rejects(h.ledger.reserve({...admitted,mode:'auto',turnKey:candidate.turnKey,answerKey:candidate.answerKey}));
 }
});
test('cancellation during the pending approval save prevents its ACK and original Controller admission',async()=>{
 const h=harness();await h.approve();const next={...scope,args:{query:'SDK',limit:3}};
 const candidate=h.candidate('wf-cancel-approval-save');candidate.text=JSON.stringify({...JSON.parse(candidate.text),args:next.args});
 const admitted=await h.ledger.admitAuto({source,...next,candidate,allowPending:true});let cancelled=false,starts=0;
 h.onWrite(value=>{
  if(!cancelled&&value[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId]?.status==='approved'){
   cancelled=true;void h.ledger.revokeRequest({source,requestId:admitted.requestId});
  }
 });
 await assert.rejects(h.ledger.approveAuto(next,{pendingRequest:{source,requestId:admitted.requestId,candidate}}));
 await assert.rejects(h.ledger.withControllerAdmission({...submission(admitted),paramsWire:encodeValue(next.args)},async()=>{starts++;}));
 assert.equal(starts,0);assert.equal(cancelled,true);
});
test('source navigation or precise request cancellation during the final save forbids Authority submission',async()=>{
  for(const cancel of ['source','request']){
    const h=harness();await h.approve();const admitted=await h.admit('wf-final-'+cancel);
    await h.ledger.reserve({...admitted,mode:'auto',turnKey:admitted.candidate.turnKey,answerKey:admitted.candidate.answerKey});
    let fired=false,starts=0;
    h.onWrite(value=>{
      if(!fired&&value[CHATGPT_BRIDGE_LEDGER_KEY]?.[admitted.requestId]?.controllerSubmitted){fired=true;
        void (cancel==='source'?h.ledger.revokeSource(source.tabId):h.ledger.revokeRequest({source,requestId:admitted.requestId}));}
    });
    await assert.rejects(h.ledger.withControllerAdmission(submission(admitted),async()=>{starts++;}),{code:'E_BRIDGE_REVOKED'});
    assert.equal(starts,0);await h.ledger.readAutoSettings();
  }
});
test('known unrelated Controller runs do not depend on Bridge session recovery, while unknown ownership fails closed',async()=>{
  const h=harness();await h.approve();const admitted=await h.admit('wf-guard-owned');
  h.sessionFault('get',true);let ordinary=0;
  await h.ledger.withControllerAdmission({requestId:'unrelated-draft'},async()=>{ordinary++;});assert.equal(ordinary,1);
  await assert.rejects(h.ledger.withControllerAdmission(submission(admitted),async()=>{throw Error('must not submit');}));
});
test('source/request cancellation during the initial ledger load also fences final Authority submission',async()=>{
  for(const cancel of ['source','request']){
    const h=harness();await h.approve();const admitted=await h.admit('wf-read-'+cancel);
    await h.ledger.reserve({...admitted,mode:'auto',turnKey:admitted.candidate.turnKey,answerKey:admitted.candidate.answerKey});
    let reads=0,starts=0;
    h.onRead(key=>{if(key===CHATGPT_BRIDGE_LEDGER_KEY&&++reads===2)
      void (cancel==='source'?h.ledger.revokeSource(source.tabId):h.ledger.revokeRequest({source,requestId:admitted.requestId}));});
    await assert.rejects(h.ledger.withControllerAdmission(submission(admitted),async()=>{starts++;}),{code:'E_BRIDGE_REVOKED'});
    assert.equal(starts,0);await h.ledger.readAutoSettings();
  }
});
test('session read/write failures still persist local denial before worker recreation',async()=>{
  for(const kind of ['get','set'])for(const action of ['revoke','off']){
    const h=harness();await h.approve();const admitted=await h.admit('wf-session-old');
    h.sessionFault(kind,true);
    if(action==='revoke')await h.ledger.revokeAuto(scope.taskId);else await h.ledger.setAutoEnabled(false);
    h.sessionFault(kind,false);h.restart();
    await assert.rejects(h.admit('wf-session-new'));
    await assert.rejects(h.ledger.reserve({...admitted,mode:'auto',turnKey:admitted.candidate.turnKey,answerKey:admitted.candidate.answerKey}));
  }
});
test('semantic readback accepts reordered storage keys without weakening installation scope',async()=>{
  const h=harness();h.reorder();await h.approve();assert.equal((await h.admit('wf-key-order-1')).persistentAuto,true);
});
test('off, absent grant, revocation and previously admitted scopes fail closed',async()=>{
  const h=harness();await h.ledger.setAutoEnabled(true);
  await assert.rejects(h.admit('wf-no-grant1'));await h.approve();
  const a=await h.admit('wf-approved1');await h.ledger.setAutoEnabled(false);
  await assert.rejects(h.admit('wf-disabled1'));
  await assert.rejects(h.ledger.reserve({...a,mode:'auto',turnKey:a.candidate.turnKey,answerKey:a.candidate.answerKey}));
  await h.ledger.setAutoEnabled(true);await h.ledger.revokeAuto(scope.taskId);
  await assert.rejects(h.admit('wf-revoked-1'));h.restart();await assert.rejects(h.admit('wf-revoked-2'));
});
test('all installation pins, target, parameters and task must match the reviewed scope',async()=>{
  const h=harness();await h.approve();
  for(const [key,value] of Object.entries({version:'1.1.2',manifestHash:'c'.repeat(64),contentHash:'d'.repeat(64),
    scriptId:'task:baidu.search.top3:1.1.2',revision:2,installationId:'new-install',generation:2})){
    await assert.rejects(h.admit('wf-pin-'+key,{installation:{...installation,[key]:value}}));
  }
  for(const changes of [{targetUrl:'https://evil.example/'},{args:{query:'other',limit:3}},{taskId:'google.search.top3'}])
    await assert.rejects(h.admit('wf-wrong-scope',changes));
  await assert.rejects(h.admit('wf-old-protocol',{candidate:h.candidate('wf-old-protocol','opendesk.task.intent.v1')}));
});
test('concurrent observer, lost ACK and restart retain candidate tombstones including unknown runs',async()=>{
  const h=harness();await h.approve();
  const pair=await Promise.allSettled([h.admit('wf-duplicate1'),h.admit('wf-duplicate1')]);
  assert.equal(pair.filter(r=>r.status==='fulfilled').length,1);
  h.restart();await assert.rejects(h.admit('wf-duplicate1'),{code:'E_BRIDGE_REPLAY'});
  await assert.rejects(h.admit('wf-duplicate1',{source:{...source,url:'https://chatgpt.com/c/another-conversation-12345678'}}),
    {code:'E_BRIDGE_REPLAY'});
  const a=await h.admit('wf-unknown-01');const input={...a,mode:'auto',turnKey:a.candidate.turnKey,answerKey:a.candidate.answerKey};
  await h.ledger.reserve(input);h.restart();await assert.rejects(h.ledger.reserve(input));
  await h.ledger.revokeRequest({source,requestId:a.requestId});await assert.rejects(h.admit('wf-unknown-01'));
});
test('failed revoke persists a deny fence for a replacement worker and cannot resurrect an old grant',async()=>{
  const h=harness();await h.approve();h.denyWrites();
  await assert.rejects(h.ledger.revokeAuto(scope.taskId));h.allowWrites();h.restart();
  await assert.rejects(h.admit('wf-deny-restart'));
  await h.ledger.setAutoEnabled(true);await assert.rejects(h.admit('wf-deny-reenabled'));
});
