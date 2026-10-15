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
  const manager={...fakeNative,async plan(){plans++;return workflow();}};
  const facade=createWorkflowProviderFacade({localPlanner:manager});
  const result=await facade.generateWorkflow({
    source:'local_codex',request:'查看网页',workflow:workflow(),
    target:{},consent:{model:true,workflow:true,observation:false}
  });
  assert.equal(plans,1);
  assert.equal(result.metadata.sessionId,'native-session');
  assert.equal(result.metadata.threadId,'native-thread');
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
