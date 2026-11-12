import test from 'node:test';
import assert from 'node:assert/strict';
import {createIssueWorkflowAuthority,issueWorkflowScope,ISSUE_WORKFLOW_RECIPE} from '../trusted/issue-workflow-authorization.js';
const pin=()=>({version:'0.2.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
 scriptId:'task:chatgpt.conversation.create:0.2.0',revision:1,
 installationId:'installed-0001',generation:1});
function harness(){
 const data=new Map();let queue=Promise.resolve(),n=0;
 const storage={transaction(_stores,mode,fn){
  const tx={get:async(_store,key)=>structuredClone(data.get(key)),
    put:async(_store,key,value)=>{data.set(key,structuredClone(value));}};
  if(mode==='readonly')return fn(tx);
  const next=queue.then(()=>fn(tx));queue=next.catch(()=>{});return next;
 }};
 const make=()=>createIssueWorkflowAuthority({storage,namespace:'tool:opendesk-browser',
  newGrantId:()=>`grant-0000000${++n}`,clock:()=>1700000000000});
 return {make,data};
}
test('one exact reviewed workflow scope grants four capabilities and variable public Issue input only',()=>{
 const scope=issueWorkflowScope(pin());
 assert.equal(scope.githubRepo,'shopable-ai/opendesk-browser');
 assert.equal(scope.taskVersion,'0.2.0');
 assert.equal(scope.send,true);
 assert.deepEqual(scope.capabilities,['github.issue.read','chatgpt.conversation.create.send',
  'controller.result.read','chatgpt.source-a.send']);
 assert.equal(scope.parameterPolicy,'same-public-repo-variable-issue-and-objective-v1');
 assert.throws(()=>issueWorkflowScope({...pin(),version:'0.3.0'}),{code:'E_ISSUE_WORKFLOW_INSTALLATION'});
});
test('approval survives authority reconstruction; identical scope new A has no approval side effect',async()=>{
 const h=harness(),a=h.make(),scope=issueWorkflowScope(pin());
 assert.equal(await a.read(),null);
 const row=await a.approve(scope);
 assert.equal((await h.make().assert({authorizationRef:row.grantId,
  epoch:row.epoch,installation:pin()})).state,'active');
 assert.equal((await h.make().read()).grantId,row.grantId);
 assert.equal(row.epoch,1);
});
test('scope is fail-closed against repository, Task, capabilities and send drift',async()=>{
 const h=harness(),auth=h.make(),scope=issueWorkflowScope(pin());
 for(const drift of [
  {...scope,githubRepo:'evil/example'},
  {...scope,send:false},
  {...scope,capabilities:['github.issue.read']},
  {...scope,taskVersion:'0.3.0'},
  {...scope,parameterPolicy:'any-origin'}
 ])await assert.rejects(auth.approve(drift),{code:'E_ISSUE_WORKFLOW_SCOPE'});
 assert.equal(await auth.read(),null);
});
test('reapproval replaces original grant; revocation survives restart and rejects stale epoch',async()=>{
 const h=harness(),auth=h.make(),scope=issueWorkflowScope(pin());
 const old=await auth.approve(scope),fresh=await h.make().approve(scope);
 await assert.rejects(auth.assert({authorizationRef:old.grantId,
  epoch:old.epoch,installation:pin()}),{code:'E_ISSUE_WORKFLOW_REVOKED'});
 assert.equal(fresh.epoch,old.epoch+1);
 const revoked=await auth.revoke();assert.equal(revoked.state,'revoked');
 await assert.rejects(h.make().assert({authorizationRef:fresh.grantId,
  epoch:fresh.epoch,installation:pin()}),{code:'E_ISSUE_WORKFLOW_REVOKED'});
});
test('a changed installed Task pin does not reuse workflow approval',async()=>{
 const h=harness(),auth=h.make(),row=await auth.approve(issueWorkflowScope(pin()));
 await assert.rejects(auth.assert({authorizationRef:row.grantId,epoch:row.epoch,
  installation:{...pin(),generation:2}}),{code:'E_ISSUE_WORKFLOW_REVOKED'});
});
test('corrupt persistent grant is never interpreted as an active grant',async()=>{
 const h=harness(),auth=h.make();await auth.approve(issueWorkflowScope(pin()));
 const [k]=h.data.keys();h.data.set(k,{enabled:true,grantId:'legacy'});
 await assert.rejects(h.make().read(),{code:'E_ISSUE_WORKFLOW_STORAGE'});
});

test('R10 recipe is immutable and projects the original v1 persisted scope without upgrading grants',()=>{
 const scope=issueWorkflowScope(pin());
 assert.equal(ISSUE_WORKFLOW_RECIPE.id,'github-public-issue-to-chatgpt-original-a');
 assert.equal(ISSUE_WORKFLOW_RECIPE.taskVersion,scope.taskVersion);
 assert.equal(ISSUE_WORKFLOW_RECIPE.githubRepo,scope.githubRepo);
 assert.equal(Object.isFrozen(ISSUE_WORKFLOW_RECIPE),true);
 assert.deepEqual(Object.keys(scope).sort(),[
  'sourceOrigin','githubRepo','githubApiOrigin','taskId','taskVersion',
  'taskTargetUrl','send','readFullBResult','deliverOriginalA',
  'installation','capabilities','parameterPolicy'].sort());
});
