import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {createWorkflowProviderFacade,workflowProviderCapabilities} from '../../src/ui/workflow/provider.js';

const workflow=()=>emptyWorkflow('https://example.test','a0000000-0000-4000-8000-000000000000');
const fakeNative={
  async plan(){return workflow();},
  snapshot(){return {sessionId:'native-session',threadId:'native-thread'};},
  cancel(){return Promise.resolve({state:'CANCELLING'});},
  resume(){return Promise.resolve({state:'READY_FOR_TURN'});}
};

test('capabilities do not misrepresent stateless Cloud as an active server conversation',()=>{
  const cloud=workflowProviderCapabilities('cloud_responses');
  assert.equal(cloud.activeConversation,false);
  assert.equal(cloud.coldResume,false);
  assert.equal(cloud.contextMode,'bounded-client-history');
  assert.equal(cloud.toolCalls,false);
  assert.equal(cloud.structuredOutput,true);
});

test('local Native plans only; provides session identity without running a browser',async()=>{
  let plans=0;
  const manager={...fakeNative,async plan(options){plans++;options.onEvent?.({type:'turn.completed',status:'completed',turnId:'native-turn'});return workflow();}};
  const facade=createWorkflowProviderFacade({localPlanner:manager});
  const result=await facade.generateWorkflow({
    source:'local_codex',request:'查看网页',workflow:workflow(),
    target:{},consent:{model:true,workflow:true,observation:false}
  });
  assert.equal(plans,1);
  assert.equal(result.metadata.sessionId,'native-session');
  assert.equal(result.metadata.threadId,'native-thread');
  assert.equal(result.metadata.turnId,'native-turn');
  assert.equal(result.proposal.format,'opendesk.workflow.v1');
});

test('Cloud Responses never sends without this turn trusted observation',async()=>{
  const facade=createWorkflowProviderFacade({localPlanner:fakeNative});
  let called=false;
  await assert.rejects(facade.generateWorkflow({
    source:'cloud_responses',request:'在输入框里填入 hello',
    workflow:workflow(),target:null,observationReceipt:null,
    settings:{endpoint:'https://api.openai.com/v1/responses',apiKey:'session-key',model:'gpt-4o-mini'},
    fetchImpl:async()=>{called=true;throw new Error('must not fetch');}
  }),error=>error.code==='E_AI_OBSERVATION_REQUIRED'||error.code==='E_DOCUMENT_STALE');
  assert.equal(called,false);
});

const exactTarget={windowId:1,tabId:2,frameId:0,documentId:'doc-1',
  url:'https://example.test/form',origin:'https://example.test'};
const receipt={format:'opendesk.workflow-observation.v1',runId:'trusted-run',
  resultId:'trusted-result',sourceHash:'a'.repeat(64),
  summary:{kind:'semantic-dom-summary',origin:exactTarget.origin,documentId:exactTarget.documentId,
    nodes:[{state:{visible:true},locator:{kind:'css',value:'#query'}}]}};

test('Native Facade forwards exact page identity and retains real turn ID',async()=>{
  let received=null;
  const native={...fakeNative,async plan(options){
    received=options;
    options.onEvent({type:'turn.completed',status:'completed',turnId:'turn-observed'});
    return workflow();
  }};
  const facade=createWorkflowProviderFacade({localPlanner:native});
  const result=await facade.generateWorkflow({source:'local_codex',request:'查看网页',
    workflow:workflow(),target:exactTarget,consent:{model:true,workflow:true,observation:true}});
  assert.deepEqual(received.target,exactTarget);
  assert.equal(received.consent.observation,true);
  assert.equal(result.metadata.turnId,'turn-observed');
});

test('legacy HTTPS Facade cannot dispatch an unobserved proposal',async()=>{
  const facade=createWorkflowProviderFacade({localPlanner:fakeNative});
  let dispatched=0;
  await assert.rejects(facade.generateWorkflow({source:'custom_https',request:'填写 query',
    workflow:workflow(),target:exactTarget,
    settings:{endpoint:'https://example.test/v1/chat/completions',apiKey:'secret',model:'test'},
    fetchImpl:async()=>{dispatched++;throw new Error('should not dispatch');}}),
    {code:'E_AI_OBSERVATION_REQUIRED'});
  assert.equal(dispatched,0);
  assert.equal(workflowProviderCapabilities('custom_https').observation,true);
});

test('legacy HTTPS locators must belong to approved current observation',async()=>{
  const facade=createWorkflowProviderFacade({localPlanner:fakeNative});
  const proposed={title:'填写',description:'',paramsSchema:workflow().paramsSchema,
    steps:[{stepId:'fillQuery',op:'fill',locatorKind:'css',selector:'#query',text:'abc'}]};
  let submitted=null;
  const fetchImpl=async (_url,options)=>{
    submitted=JSON.parse(options.body);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(proposed)}}]}),
      {status:200,headers:{'content-type':'application/json'}});
  };
  const opts={source:'custom_https',request:'在搜索框填写 abc',workflow:workflow(),
    target:exactTarget,observationReceipt:receipt,
    settings:{endpoint:'https://example.test/v1/chat/completions',apiKey:'secret',model:'test'},
    fetchImpl};
  const response=await facade.generateWorkflow(opts);
  assert.equal(response.proposal.steps[0].selector,'#query');
  const sent=JSON.parse(submitted.messages[1].content);
  assert.equal(sent.authorizedObservation.documentId,exactTarget.documentId);
  assert.equal(JSON.stringify(sent).includes(exactTarget.url),false);
  proposed.steps[0].selector='#invented';
  await assert.rejects(facade.generateWorkflow(opts),{code:'E_AI_LOCATOR_UNOBSERVED'});
});
