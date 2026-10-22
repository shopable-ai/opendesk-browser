// Production Controller and Native planner with protocol/RunHost fixtures.
// This test is not a real Mac Native/Chrome execution certificate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';

function makeNative(){
  const sessions=new Map(),calls=[],answers=[];let created=0,turns=0;
  const client={ready:Promise.resolve(),subscribeWorkflowAI:()=>()=>{},
    async requestWorkflowAI(method,params={},id=null){
      calls.push({method,id});
      if(method==='ai.connection.read')return {state:'NATIVE_CONNECTED',nativeConnected:true,protocolAvailable:true};
      if(method==='ai.capabilities.read')return {state:'READY_FOR_TURN',readyForTurn:true};
      if(method==='ai.session.open'){
        const sid='s'+(++created),threadId='thread'+created;
        sessions.set(sid,{sid,threadId,events:[]});
        return {sessionId:sid,threadId,cursor:0,state:'READY_FOR_TURN',inferenceVerified:false};
      }
      if(method==='ai.session.close'){if(id)sessions.delete(id);else sessions.clear();return {state:'CLOSED',resumable:false};}
      const row=sessions.get(id);
      if(!row)throw Object.assign(Error('Unknown session'),{code:'E_OWNER'});
      if(method==='ai.plan.start'){
        const turnId='t'+(++turns);
        const proposal={title:'读取页面',description:'',paramsSchema:{
          type:'object',properties:{},required:[],additionalProperties:false
        },steps:[{stepId:'read',op:'observe'}]};
        const events=[
          {type:'turn.started'},
          {type:'tool.request',approvalId:'observe'+turns,tool:'browser.observe',canApprove:true,target:params.target},
          {type:'message.completed',text:JSON.stringify(proposal)},
          {type:'turn.completed',status:'completed'}
        ];
        events.forEach(event=>row.events.push({sequence:row.events.length+1,
          sessionId:id,threadId:row.threadId,turnId,...event}));
        return {sessionId:id,threadId:row.threadId,turnId,state:'RUNNING'};
      }
      if(method==='ai.events.read'){
        const events=row.events.filter(e=>e.sequence>params.cursor).slice(0,params.limit);
        return {events,cursor:events.at(-1)?.sequence??params.cursor,
          state:'READY_FOR_TURN',inferenceVerified:true,hasMore:false};
      }
      if(method==='ai.approval.answer'){
        answers.push({decision:params.decision,receipt:params.result?.summary?.origin||null});
        return {state:'ANSWERED'};
      }
      if(method==='ai.plan.cancel')return {state:'READY_FOR_TURN'};
      throw Error('Unknown Native method '+method);
    }};
  return {client,calls,answers};
}
const state=(f,id)=>f.state().controls[id]||{};
test('R23.17 Native: first disclosure, valid session reuse, revoke then deny without new RunHost',async t=>{
  const n=makeNative(),f=await workflowFixture({client:n.client});
  t.after(()=>f.view.dispose());
  f.input('workflow-ai-request','读取当前网页内容，不修改。');
  const first=f.click('workflow-ai-plan');await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,false);
  assert.equal(f.starts.length,0);
  await f.click('workflow-ai-approve');await first;await tick();await tick();
  assert.equal(n.answers[0]?.decision,'approve');
  assert.equal(f.starts.length,2,'Native read-only observation is followed by a single safe auto-run');
  assert.equal(state(f,'workflow-run-review').hidden,true,'no second product confirmation for approved low-risk steps');
  await f.click('workflow-run-review-confirm');
  assert.equal(f.starts.length,2,'no hidden confirmation may dispatch a second Run');
  const key='opendesk.sidebar.workflow-draft.v1:7:observation';
  assert.equal(f.session.get(key)?.provider,'local_codex');
  assert.equal(n.calls.filter(c=>c.method==='ai.session.open').length,1);

  f.input('workflow-ai-request','再次读取当前网页，检查值但不要提交。');
  const second=f.click('workflow-ai-plan');await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,true);
  await second;await tick();await tick();
  assert.equal(n.answers[1]?.decision,'approve');
  assert.equal(f.starts.length,4,'each new user Send independently authorizes one bounded low-risk execution');
  assert.equal(state(f,'workflow-run-review').hidden,true);
  assert.equal(n.calls.filter(c=>c.method==='ai.session.open').length,1);

  await f.click('workflow-observation-revoke');await tick();
  assert.equal(f.session.get(key),null);
  f.input('workflow-ai-request','读取第三次检查授权撤销。');
  const third=f.click('workflow-ai-plan');await tick();await tick();
  assert.equal(state(f,'workflow-ai-approval').hidden,false);
  assert.equal(f.starts.length,4);
  await f.click('workflow-ai-deny');await third;
  assert.equal(n.answers[2]?.decision,'deny');
  assert.equal(f.starts.length,4);
});
