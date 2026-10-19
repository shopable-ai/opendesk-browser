import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';
const fill={stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',text:'OpenDesk'};
const get=(f,id)=>f.state().controls[id]||{};
test('workflow whole page declares DOM in TSX and adapter has no legacy renderer/listeners',async()=>{
  const [component,view]=await Promise.all(['src/ui/react/tabs/workflow.tsx','src/ui/workflow/workflow-view.js'].map(path=>readFile(path,'utf8')));
  assert.doesNotMatch(component,/dangerouslySetInnerHTML|innerHTML|MutationObserver|append\(settings\)/);
  assert.doesNotMatch(view,/createElement|replaceChildren|\.append\(|addEventListener\('(click|input|change)'|new Option|dispatchEvent/);
  assert.match(component,/export function WorkflowPage/);
  assert.match(component,/useSyncExternalStore/);
  const result=await transformWithEsbuild(component,'workflow.tsx',{loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(result.code.length>15000);
});
test('workflow normal execution preserves durable run, result, document and source identities',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  const result=await f.click('workflow-run');await tick();
  assert.equal(result.ok,true);assert.equal(result.runId,'workflow-run-1');
  assert.equal(result.resultId,'workflow-result-1');assert.equal(f.starts.length,1);
  assert.match(get(f,'workflow-output').text,/执行结果/);
  assert.match(get(f,'workflow-technical').text,/document-one/);
  assert.equal(f.state().lastRun,'success');
  assert.deepEqual(f.requests,[{origins:['https://workflow.example/*']}]);
});
test('workflow compiler failure clears old artifact and cannot execute it',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  assert.equal(get(f,'workflow-run').disabled,false);
  f.view.actions.editStep('one','op','confirm');await tick();await tick();
  assert.equal(get(f,'workflow-run').disabled,true);
  assert.match(get(f,'workflow-code').text,/E_WORKFLOW_CONFIRM_UNSUPPORTED/);
  await f.click('workflow-run');assert.equal(f.starts.length,0);
  f.view.actions.editStep('one','op','observe');await tick();await tick();
  assert.equal((await f.click('workflow-run')).ok,true);
});
test('workflow runtime error and Stop release controls and allow edit/run again',async t=>{
  const f=await workflowFixture({fail:true});t.after(()=>f.view.dispose());
  assert.equal((await f.click('workflow-run')).ok,false);await tick();
  assert.equal(f.state().lastRun,'failed');assert.match(get(f,'workflow-output').text,/E_FIXTURE/);
  f.service.hold=true;f.service.fail=false;
  const running=f.click('workflow-run');await tick();await tick();
  assert.equal(get(f,'workflow-stop').disabled,false);
  f.click('workflow-stop');assert.equal((await running).ok,false);await tick();
  assert.equal(f.stops.length,1);assert.equal(f.stops[0].runId,'workflow-run-2');
  assert.equal(f.stops[0].reason,'E_CANCELLED');assert.equal(get(f,'workflow-run').disabled,false);
  f.input('workflow-title','停止后编辑');f.service.hold=false;await tick();await tick();
  assert.equal((await f.click('workflow-run')).ok,true);
});
test('workflow save/reopen restores same source revision and rejects changed journal bytes',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  f.input('workflow-title','保存并重新打开');await tick();await tick();
  f.click('workflow-save');await tick();await tick();await tick();
  assert.equal(f.local.size,1);const [key,record]=[...f.local][0];
  assert.equal(record.workflow.title,'保存并重新打开');
  f.click('workflow-new');await tick();await tick();
  f.input('workflow-saved-list',key,'change');f.click('workflow-load');await tick();await tick();
  assert.equal(get(f,'workflow-title').value,'保存并重新打开');
  assert.equal(f.state().steps[0].op,'observe');
  const result=await f.click('workflow-run');assert.equal(result.ok,true);
  assert.equal(f.starts[0].source.kind,'saved');assert.equal(f.starts[0].source.revision,record.revision);
  f.service.corrupt=true;
  const rejected=await f.click('workflow-run');assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'E_WORKFLOW_HASH');
  assert.equal(f.starts.length,1);
});
test('workflow untrusted gestures, action consent and precise origin protect execution',async t=>{
  const f=await workflowFixture({steps:[fill]});t.after(()=>f.view.dispose());
  await f.click('workflow-run',false);assert.equal(f.starts.length,0);assert.equal(f.requests.length,0);
  await f.click('workflow-run');await tick();assert.match(get(f,'workflow-status').text,/E_WORKFLOW_CONSENT/);
  assert.equal(f.requests.length,0);
  f.input('workflow-confirm-run',true);await f.setPage({origin:'https://other.example'});
  assert.equal(get(f,'workflow-run').disabled,true);await f.click('workflow-run');assert.equal(f.starts.length,0);
});
test('workflow cannot admit revoked permission or stale document after asynchronous journal read',async t=>{
  for(const variant of ['permission','document']) {
    const f=await workflowFixture();t.after(()=>f.view.dispose());
    f.click('workflow-save');await tick();await tick();await tick();
    f.service.beforeJournalRead=async()=>{
      f.service.beforeJournalRead=null;
      if(variant==='permission')f.permissions.clear();else f.target.documentId='document-replaced';
    };
    const result=await f.click('workflow-run');
    assert.equal(result.ok,false);assert.equal(f.starts.length,0);
    assert.equal(result.error.code,variant==='permission'?'E_PERMISSION':'E_DOCUMENT_STALE');
  }
});
test('workflow inconsistent result identity fails closed without replay',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());f.service.corruptResult=true;
  const result=await f.click('workflow-run');assert.equal(result.ok,false);
  assert.equal(f.starts.length,1);assert.equal(f.state().lastRun,'failed');
});
test('workflow dirty new/reopen protection retains draft until reviewed and resets review after edits',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  f.input('workflow-title','未保存');await tick();f.click('workflow-new');await tick();
  assert.equal(get(f,'workflow-new-review').hidden,false);
  f.click('workflow-new-discard',false);await tick();assert.equal(get(f,'workflow-title').value,'未保存');
  f.click('workflow-new-cancel');await tick();assert.equal(get(f,'workflow-title').value,'未保存');
  f.click('workflow-new');f.input('workflow-description','确认后又编辑');await tick();
  f.click('workflow-new-discard');await tick();assert.equal(get(f,'workflow-title').value,'未保存');
  f.click('workflow-new');f.click('workflow-new-discard');await tick();await tick();
  assert.equal(f.state().steps.length,0);assert.equal(get(f,'workflow-title').value,'新工作流');
});
test('workflow provider settings retain protocol and credentials remain memory-only; disposal unsubscribes',async()=>{
  const f=await workflowFixture();
  f.click('workflow-provider-toggle');await tick();
  f.click('workflow-source-https');f.input('workflow-https-protocol','cloud_responses','change');await tick();
  f.input('workflow-ai-key','not-persisted-test-secret');f.input('workflow-ai-model','test-model');await tick();
  f.click('workflow-source-local');f.click('workflow-source-https');await tick();
  assert.equal(get(f,'workflow-ai-provider').value,'cloud_responses');
  assert.equal(get(f,'workflow-ai-endpoint').value,'https://api.openai.com/v1/responses');
  assert.ok(!JSON.stringify([...f.session]).includes('not-persisted-test-secret'));
  assert.ok(!JSON.stringify([...f.local]).includes('not-persisted-test-secret'));
  let updates=0;const unsubscribe=f.view.subscribe(()=>updates++);f.input('workflow-title','订阅');await tick();assert.ok(updates>0);
  unsubscribe();const before=updates;f.input('workflow-title','已取消订阅');await tick();assert.equal(updates,before);
  f.view.dispose();assert.ok(Object.values(f.subscriptions).every(set=>set.size===0));
});
