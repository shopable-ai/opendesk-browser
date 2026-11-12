import test from 'node:test';
import assert from 'node:assert/strict';
import {createIssueWorkflowAuthorizationHost} from '../trusted/issue-workflow-auth-host.js';
import {ISSUE_WORKFLOW_RECIPE,issueWorkflowScope} from '../trusted/issue-workflow-authorization.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {WEB_TASK_PROTOCOL} from '../../../src/page-events/web-task-contract.js';

const release=REVIEWED_BUILTIN_TASK_RELEASES.find(item=>
  item.taskId==='chatgpt.conversation.create'&&item.version==='0.2.0');
const installation=()=>({version:'0.2.0',manifestHash:release.manifestHash,
  contentHash:release.sourceHash,scriptId:'task:chatgpt.conversation.create:0.2.0',
  revision:1,installationId:'installed-00001',generation:1});
const installed=()=>({...installation(),taskId:'chatgpt.conversation.create',
  manifest:{targetDisposition:'retain-on-success',siteOrigins:['https://chatgpt.com']}});
const fail=code=>Object.assign(new Error(code),{code});
function harness(){
  const rows=new Map();let writeQueue=Promise.resolve(),resolveCount=0;
  const panel=Object.freeze({id:'extension-id',kind:'sidepanel'});
  const state={installed:installed(),permission:true,originalRuns:0,
    senderChecks:0,resolveCount:0,onResolve:null};
  const storage={transaction(stores,mode,fn){
    assert.deepEqual(stores,['frameworkKV']);
    const tx={get:async(_store,key)=>structuredClone(rows.get(key)),
      put:async(_store,key,value)=>{rows.set(key,structuredClone(value));}};
    if(mode==='readonly')return fn(tx);
    const queued=writeQueue.then(()=>fn(tx));writeQueue=queued.catch(()=>{});return queued;
  }};
  const broker={storage,authority:{async resolveInstalledTask({taskId},sender){
    assert.equal(taskId,'chatgpt.conversation.create');
    assert.equal(sender,panel);
    state.resolveCount=++resolveCount;
    state.onResolve?.(resolveCount);
    return structuredClone(state.installed);
  }}};
  const api={runtime:{id:'extension-id'},permissions:{async contains(query){
    assert.deepEqual(query,{origins:['https://chatgpt.com/*','https://api.github.com/*']});
    return state.permission;
  }}};
  const make=()=>createIssueWorkflowAuthorizationHost({api,loadFoundation:async()=>broker,
    requireSettingsSender:async sender=>{
      state.senderChecks++;
      if(sender!==panel)throw fail('E_WEB_TASK_SENDER');
      return panel;
    }});
  const send=(kind,body={},sender=panel,handler=make())=>
    handler.handle({protocol:WEB_TASK_PROTOCOL,kind,...body},sender);
  return {state,rows,panel,make,send};
}
test('only three exact grant messages route to the compiled business adapter',async()=>{
  const h=harness(),host=h.make();
  for(const kind of ['workflow-auth-read','workflow-auth-approve','workflow-auth-revoke'])
    assert.equal(host.accepts({protocol:WEB_TASK_PROTOCOL,kind}),true);
  for(const message of [{protocol:WEB_TASK_PROTOCOL,kind:'candidate'},
    {protocol:'untrusted',kind:'workflow-auth-approve'},null,
    {protocol:WEB_TASK_PROTOCOL,kind:'workflow-auth-grant-any'}]){
    assert.equal(host.accepts(message),false);
    await assert.rejects(host.handle(message,h.panel),{code:'E_ISSUE_WORKFLOW_SCOPE'});
  }
  assert.equal(h.state.resolveCount,0);
});
test('the audited SW handler retains the original exact frameworkKV grant and epoch',async()=>{
  const h=harness(),host=h.make();
  assert.equal(await h.send('workflow-auth-read',{},h.panel,host),null);
  const grant=await h.send('workflow-auth-approve',{installation:installation()},h.panel,host);
  assert.equal(grant.scope.githubRepo,ISSUE_WORKFLOW_RECIPE.githubRepo);
  assert.deepEqual(grant.scope,issueWorkflowScope(installation()));
  assert.equal(grant.epoch,1);
  assert.equal(grant.state,'active');
  assert.equal((await h.send('workflow-auth-read',{},h.panel,h.make())).grantId,grant.grantId);
  const revoked=await h.send('workflow-auth-revoke',{},h.panel,h.make());
  assert.equal(revoked.epoch,2);
  assert.equal(revoked.state,'revoked');
  assert.equal((await h.send('workflow-auth-read',{},h.panel,host)).state,'revoked');
  assert.equal(h.rows.size,1);
  assert.equal(h.state.resolveCount,2);
  assert.ok(h.state.senderChecks>=5);
  assert.equal(h.state.originalRuns,0);
});
test('an unverified Side Panel, missing grant permission or wrong installed revision fails closed',async()=>{
  const h=harness(),scope={installation:installation()};
  await assert.rejects(h.send('workflow-auth-approve',scope,{id:'forged'}),{code:'E_WEB_TASK_SENDER'});
  assert.equal(h.rows.size,0);
  h.state.permission=false;
  await assert.rejects(h.send('workflow-auth-approve',scope),{code:'E_ISSUE_WORKFLOW_PERMISSION'});
  h.state.permission=true;
  h.state.installed=null;
  await assert.rejects(h.send('workflow-auth-approve',scope),{code:'E_ISSUE_WORKFLOW_INSTALLATION'});
  h.state.installed={...installed(),version:'0.3.0'};
  await assert.rejects(h.send('workflow-auth-approve',scope),{code:'E_ISSUE_WORKFLOW_INSTALLATION'});
  h.state.installed={...installed(),manifest:{targetDisposition:'retain-on-success',
    siteOrigins:['https://other.example']}};
  await assert.rejects(h.send('workflow-auth-approve',scope),{code:'E_ISSUE_WORKFLOW_INSTALLATION'});
  assert.equal(h.rows.size,0);
});
test('installation generation changed during review never receives authorization',async()=>{
  const h=harness(),scope={installation:installation()};
  h.state.onResolve=count=>{if(count===2)h.state.installed.generation=2;};
  await assert.rejects(h.send('workflow-auth-approve',scope),{code:'E_ISSUE_WORKFLOW_INSTALLATION'});
  assert.equal(h.rows.size,0);
});
test('one business recipe cannot accept a wider repository, Task or Provider scope',async()=>{
  const h=harness(),pin=installation();
  for(const bad of [
    {...pin(),version:'0.3.0'},
    {...pin(),scriptId:'task:google.search.top3:1.0.3'},
    {...pin(),generation:0}
  ])await assert.rejects(h.send('workflow-auth-approve',{installation:bad}),
    {code:'E_ISSUE_WORKFLOW_INSTALLATION'});
  assert.equal(ISSUE_WORKFLOW_RECIPE.taskId,'chatgpt.conversation.create');
  assert.equal(ISSUE_WORKFLOW_RECIPE.taskVersion,'0.2.0');
  assert.equal(Object.isFrozen(ISSUE_WORKFLOW_RECIPE),true);
  assert.equal(h.rows.size,0);
});
