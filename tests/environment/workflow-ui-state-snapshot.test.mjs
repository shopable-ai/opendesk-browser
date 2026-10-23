import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowUIState} from '../../src/ui/workflow/workflow-ui-state.js';

test('workflow projection initializes without aborting the shared Side Panel',async t=>{
  const ui=createWorkflowUIState();t.after(()=>ui.dispose());
  const initial=ui.getSnapshot();
  assert.equal(initial.controls['workflow-ai-provider'].value,'local_codex');
  assert.equal(initial.controls['workflow-run'].disabled,true);
  assert.deepEqual(structuredClone(initial),initial);
  let updates=0;ui.subscribe(()=>updates++);
  const title=ui.control('workflow-title');
  title.value='未保存的工作流';title.dataset.mode='draft';
  await Promise.resolve();
  const next=ui.getSnapshot();
  assert.equal(updates,1);
  assert.equal(next.controls['workflow-title'].value,'未保存的工作流');
  assert.equal(next.controls['workflow-title'].dataset.mode,'draft');
  assert.deepEqual(structuredClone(next),next);
  title.value='第二次编辑';title.dataset.mode='edited';
  await Promise.resolve();
  assert.equal(next.controls['workflow-title'].value,'未保存的工作流');
  assert.equal(next.controls['workflow-title'].dataset.mode,'draft');
  assert.equal(ui.getSnapshot().controls['workflow-title'].value,'第二次编辑');
});

test('workflow projection excludes provider credentials while preserving ordinary input',async t=>{
  const ui=createWorkflowUIState();t.after(()=>ui.dispose());
  ui.control('workflow-ai-key').value='fixture-secret-never-publish';
  ui.control('workflow-ai-request').value='打开任务列表';
  await Promise.resolve();
  assert.equal(ui.getSnapshot().controls['workflow-ai-key'].value,'');
  assert.equal(ui.getSnapshot().controls['workflow-ai-request'].value,'打开任务列表');
  assert.doesNotMatch(JSON.stringify(ui.getSnapshot()),/fixture-secret-never-publish/);
  assert.equal(ui.control('workflow-ai-key').value,'fixture-secret-never-publish');
});
