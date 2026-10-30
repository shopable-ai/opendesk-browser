import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,settle,base,records} from './capture-fixture.mjs';

test('manual/saved config trial, explicit full, reopen, Stop and exports use one runner without opening Chat or querying AI',async t=>{
  const f=await fixture(t),{get,ui}=f;
  assert.equal(get('open-local-runner')?.disabled,false,'manual collection must have an independent entry');
  assert.equal(f.calls.some(call=>call.operation.startsWith('ai.')),false,'closed Chat must not query a Provider');
  get('open-local-runner').dispatch('click');await settle();
  assert.deepEqual(JSON.parse(get('runner-config').value||get('runner-config').defaultValue),{...base,maxPages:10},'reuse selected saved configuration');
  f.edit('runner-config',JSON.stringify(base));
  assert.equal(get('runner-prepare-full').disabled,true);
  get('runner-start-preview').dispatch('click');await settle();await settle();
  assert.equal(f.posts().length,1);assert.equal(f.posts()[0].payload.body.previewPages,3);assert.deepEqual(f.posts()[0].payload.body.config,base);
  assert.equal(get('runner-prepare-full').disabled,false);assert.match(ui.doc.body.textContent,/83.33%/);
  ui.paint();await settle();
  assert.deepEqual([...ui.doc.querySelectorAll('.runner-records pre')].map(node=>JSON.parse(node.textContent)),records);
  get('runner-prepare-full').dispatch('click');assert.equal(get('runner-start-full').disabled,true);
  get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');get('runner-start-full').dispatch('click');await settle();await settle();
  const full=f.posts()[1].payload.body;
  assert.equal(full.mode,'full');assert.equal(full.previewRunId,'preview-1');assert.equal(full.configHash,'fixture-hash');assert.deepEqual(full.config,base);
  ui.state.show=false;ui.paint();ui.state.show=true;ui.paint();await settle();await settle();
  get('open-local-runner').dispatch('click');await settle();
  assert.match(get('runner-heading').parentNode.parentNode.textContent,/full-1/);assert.equal(f.posts().length,2,'reopen must only GET the existing run');
  get('runner-stop').dispatch('click');await settle();await settle();
  assert.match(ui.doc.body.textContent,/已停止/);assert.match(ui.doc.body.textContent,/worker 已确认退出/);
  for(const format of ['jsonl','csv']){get('runner-export-'+format).dispatch('click');await settle();}
  assert.deepEqual(f.calls.filter(row=>row.operation==='localTasks.export').map(row=>row.payload),[{runId:'full-1',format:'jsonl'},{runId:'full-1',format:'csv'}]);
  assert.equal(f.calls.some(row=>row.operation.startsWith('ai.')||row.operation.startsWith('tasks.')),false);
});

test('editing and reverting manual config invalidates preview certification and never starts full',async t=>{
  const f=await fixture(t),{get}=f;
  assert.ok(get('open-local-runner'),'independent local entry exists');get('open-local-runner').dispatch('click');await settle();
  f.edit('runner-config',JSON.stringify(base));get('runner-start-preview').dispatch('click');await settle();await settle();
  get('runner-prepare-full').dispatch('click');get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');
  f.edit('runner-config',JSON.stringify({...base,dedupeKey:'title'}));f.edit('runner-config',JSON.stringify(base));
  assert.equal(get('runner-prepare-full').disabled,true);assert.equal(get('runner-start-full').disabled,true);
  get('runner-start-full').dispatch('click');await settle();assert.equal(f.posts().length,1);
  f.edit('runner-config','{');get('runner-start-preview').dispatch('click');await settle();assert.equal(f.posts().length,1);
});

test('unknown AI remains fenced while independent manual trial and full stay available',async t=>{
  const f=await fixture(t,{pendingAi:true}),{get}=f;
  await settle();await settle();
  assert.equal(get('open-ai'),null,'no separate AI workbench is mounted');
  assert.equal(get('config-json').disabled,false,'unknown inference must not lock unrelated configuration edits');
  get('open-local-runner').dispatch('click');await settle();
  assert.ok(get('runner-start-preview'),'manual controls stay reachable with unknown AI');
  get('runner-start-preview').dispatch('click');await settle();await settle();
  assert.equal(get('runner-prepare-full').disabled,false);get('runner-prepare-full').dispatch('click');get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');get('runner-start-full').dispatch('click');await settle();await settle();
  assert.equal(f.posts().length,2);assert.equal(f.posts()[1].payload.body.mode,'full');
  assert.equal(f.calls.filter(row=>row.operation==='ai.generate'||row.operation==='ai.cancel').length,0);
  assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai','manual collection must not clear the AI fence');
});

test('Douban trial is one bounded action, reports robots failure and preserves saved/manual configuration',async t=>{
 const f=await fixture(t),{get}=f;get('open-local-runner').dispatch('click');await settle();await settle();
 const before=get('runner-config').value||get('runner-config').defaultValue,saved=structuredClone(f.rows.get('capture-config'));
 assert.ok(get('runner-trial-douban'),'trial is in the original collection workspace');
 get('runner-trial-douban').dispatch('click');get('runner-trial-douban').dispatch('click');await settle();await settle();
 assert.equal(f.posts().length,1);const body=f.posts()[0].payload.body;
 assert.equal(body.config.url,'https://book.douban.com/top250');assert.equal(body.config.maxPages,3);assert.equal(body.previewPages,3);
 assert.equal(get('runner-config').value||get('runner-config').defaultValue,before);assert.deepEqual(f.rows.get('capture-config'),saved);
 assert.equal(f.calls.some(c=>c.operation.startsWith('ai.')),false);
 assert.match(f.ui.doc.body.textContent,/ROBOTS_UNAVAILABLE/);assert.equal(get('runner-prepare-full').disabled,true);
});
