import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,settle,base,records} from './capture-fixture.mjs';

test('URL and page-budget errors are associated with the input before any structure or collection request',async t=>{
 const f=await fixture(t,{pendingAi:true}),{get}=f;
 get('open-local-runner').dispatch('click');for(let i=0;i<12;i++)await settle();
 f.edit('capture-url','https://user:secret@example.org/books');f.edit('capture-budget','1.5');
 for(const [id,expected] of [['capture-url',/凭证/],['capture-budget',/整数/]]){
  const input=get(id);
  assert.equal(input.getAttribute('aria-invalid'),'true');
  assert.match(get(input.getAttribute('aria-describedby')).textContent,expected);
 }
 assert.equal(get('capture-read-structure').disabled,true);
 assert.equal(f.posts().length,0);
 f.edit('capture-url',base.url);f.edit('capture-budget','20');
 assert.notEqual(get('capture-url').getAttribute('aria-invalid'),'true');
 assert.notEqual(get('capture-budget').getAttribute('aria-invalid'),'true');
 assert.equal(get('capture-read-structure').disabled,false);
 assert.equal(f.calls.some(c=>c.operation.startsWith('ai.')),false);
});

test('Chinese new-rule validation guides the next step without blocking existing manual rules',async t=>{
 const f=await fixture(t,{pendingAi:true}),{get}=f;
 get('open-local-runner').dispatch('click');for(let i=0;i<12;i++)await settle();
 f.edit('capture-ai-mode','create');
 const input=get('capture-requirement');
 assert.equal(input.getAttribute('aria-invalid'),'true');
 assert.match(get(input.getAttribute('aria-describedby')).textContent,/描述/);
 assert.equal(get('capture-read-structure').disabled,true);
 assert.equal(get('runner-start-preview').disabled,false,'manual rules need neither Chinese demand nor AI');
 get('runner-start-preview').dispatch('click');await settle();await settle();
 assert.equal(f.posts().length,1);assert.equal(f.posts()[0].payload.body.mode,'preview');
 assert.equal(get('runner-prepare-full').disabled,false);
 f.edit('capture-requirement','采集书名和价格，缺失价格留空');
 assert.notEqual(get('capture-requirement').getAttribute('aria-invalid'),'true');
 assert.equal(get('capture-read-structure').disabled,false);
 assert.equal(get('runner-prepare-full').disabled,true,'editing the demand still retires the old full qualification');
 assert.match(get('capture-next-step').textContent,/读取.*网页结构/);
 f.edit('capture-correction','价'.repeat(2001));
 assert.equal(get('capture-correction').getAttribute('aria-invalid'),'true');
 assert.equal(get('capture-read-structure').disabled,true);
 f.edit('capture-correction','只取当前书目的标价');
 assert.notEqual(get('capture-correction').getAttribute('aria-invalid'),'true');
 assert.equal(get('capture-read-structure').disabled,false);
 assert.equal(f.calls.some(c=>c.operation.startsWith('ai.')),false);
 assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai');
});

test('opening and closing Chat with an unknown request keeps manual collection available and the original fence intact',async t=>{
 const f=await fixture(t,{pendingAi:true}),{get}=f;
 assert.equal(f.calls.some(c=>c.operation.startsWith('ai.')),false,'manual entry must not mount the optional Provider consumer');
 globalThis.OpenDeskTool.root.dispatch('opendesk:conversation-action',{detail:{action:'toggle'}});
 for(let i=0;i<12;i++)await settle();
 assert.match(get('chat-ai-request-status').textContent,/unknown-ai/);
 assert.equal(get('open-local-runner').disabled,false);
 f.ui.doc.querySelector('.od-conversation-close').dispatch('click');
 get('open-local-runner').dispatch('click');for(let i=0;i<12;i++)await settle();
 assert.equal(get('runner-start-preview').disabled,false);
 get('runner-start-preview').dispatch('click');for(let i=0;i<12;i++)await settle();
 assert.equal(f.posts().length,1);assert.equal(f.posts()[0].payload.body.mode,'preview');
 assert.equal(get('ai-trial').disabled,true);
 assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai');
 assert.equal(f.calls.some(c=>['ai.generate','ai.cancel'].includes(c.operation)),false);
});

test('Chinese collection inputs keep saved rules intact and editing/reverting any task input retires full confirmation',async t=>{
 const f=await fixture(t,{pendingAi:true}),{get}=f;
 get('open-local-runner').dispatch('click');await settle();await settle();
 assert.ok(get('capture-url'),'URL is a normal input in the original workspace');
 assert.ok(get('capture-requirement'));assert.ok(get('capture-correction'));
 const saved=structuredClone(f.rows.get('capture-config'));
 assert.match(get('capture-rule-summary').textContent,/title/);
 f.edit('capture-requirement','采集书名、价格和编号，缺失价格保留空白');
 f.edit('capture-correction','价格只取每条书目中的价格，不要混入推荐书目');
 f.edit('capture-budget','25');
 get('close-local-runner').dispatch('click');get('open-local-runner').dispatch('click');await settle();
 assert.equal(get('capture-correction').value,'价格只取每条书目中的价格，不要混入推荐书目');
 for(const [id,changed] of [['capture-url','https://example.org/books'],['capture-requirement','改为采集作者'],['capture-correction','价格保留币种'],['capture-budget','24'],['capture-ai-mode','create'],['runner-preview-pages','2']]){
  get('runner-start-preview').dispatch('click');await settle();await settle();
  assert.equal(get('runner-prepare-full').disabled,false,id+' has a fresh manual preview');
  get('runner-prepare-full').dispatch('click');get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');
  const before=get(id).value;
  f.edit(id,changed);f.edit(id,before);
  assert.equal(get('runner-prepare-full').disabled,true,id+' cannot restore certification by reverting');
  get('runner-start-full').dispatch('click');await settle();
 }
 assert.equal(f.posts().every(row=>row.payload.body.mode==='preview'),true);
 assert.equal(f.posts()[0].payload.body.config.maxPages,25);
 assert.deepEqual(f.rows.get('capture-config'),saved);
 assert.equal(f.calls.some(row=>row.operation.startsWith('ai.')),false,'unknown AI is untouched by independent input work');
 assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai');
});

test('normal URL and budget validation reject unsafe targets and invalid budgets before creating a run',async t=>{
 const f=await fixture(t),{get}=f;get('open-local-runner').dispatch('click');await settle();await settle();
 for(const url of ['javascript:alert(1)','https://user:secret@example.org/list','invalid']){
  f.edit('capture-url',url);get('runner-start-preview').dispatch('click');await settle();
  assert.equal(f.posts().length,0);assert.match(get('runner-error').textContent,/网址|凭证/);
 }
 f.edit('capture-url',base.url);
 for(const budget of ['','0','51','1.5']){
  f.edit('capture-budget',budget);get('runner-start-preview').dispatch('click');await settle();
  assert.equal(f.posts().length,0);assert.match(get('runner-error').textContent,/页数|预算/);
 }
});

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
