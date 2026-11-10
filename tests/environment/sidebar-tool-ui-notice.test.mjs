import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeToolUiNotice,createToolUiNoticeRateGate,
  TOOL_UI_NOTICE_MAX_LENGTH,TOOL_UI_NOTICE_POSITIONS} from '../../src/sidebar-tools/ui-notice.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

test('Tool UI notice accepts only bounded plain-text messages',()=>{
  assert.deepEqual(normalizeToolUiNotice({message:'  已保存  '}),{message:'已保存'});
  assert.deepEqual(normalizeToolUiNotice({message:'✓ saved'}),{message:'✓ saved'});
  assert.deepEqual(normalizeToolUiNotice('✓ saved'),{message:'✓ saved'});
  for(const invalid of [undefined,null,[],{},Object.create(null),
    {text:'saved'},{message:42},{message:''},{message:'  '},
    {message:'valid',html:'<script>alert(1)</script>'},
    {message:'x'.repeat(TOOL_UI_NOTICE_MAX_LENGTH+1)},
    {message:'contains\nnewline'},{message:'bi\u202Edi'}]){
    assert.equal(normalizeToolUiNotice(invalid),null,'reject untrusted notice shape/content');
  }
  const valid=normalizeToolUiNotice({message:'done'});
  assert.equal(Object.isFrozen(valid),true);
});

test('Tool UI notice budget is per live instance and resets only after one minute',()=>{
  let time=1000;const gate=createToolUiNoticeRateGate({now:()=>time});
  assert.equal(gate.allow('instance-A'),true);
  assert.equal(gate.allow('instance-A'),true);
  assert.equal(gate.allow('instance-A'),true);
  assert.equal(gate.allow('instance-A'),false);
  time=59999;assert.equal(gate.allow('instance-A'),false);
  time=61000;assert.equal(gate.allow('instance-A'),true);
  assert.equal(gate.allow('instance-B'),true);
  assert.equal(gate.allow(''),false);
  time=NaN;assert.equal(gate.allow('instance-B'),false);
});

test('typed toast contract rejects injected actions, unsafe text and abusive timings',()=>{
  const valid={message:'  完成  ',caption:'  已保存到本机  ',type:'success',
    position:'bottom-right',timeout:10000,group:false};
  assert.deepEqual(normalizeToolUiNotice(valid),{
    message:'完成',caption:'已保存到本机',type:'success',
    position:'bottom-right',timeout:10000,group:false});
  assert.deepEqual(normalizeToolUiNotice({message:'用户须手动关闭',timeout:0}),
    {message:'用户须手动关闭',timeout:0});
  assert.deepEqual(normalizeToolUiNotice({message:'好',type:'positive'}),
    {message:'好',type:'success'});
  assert.deepEqual(normalizeToolUiNotice({message:'失败',type:'negative'}),
    {message:'失败',type:'error'});
  assert.equal(TOOL_UI_NOTICE_POSITIONS.length,6);
  for(const invalid of [
    {message:'ok',type:'danger'}, {message:'ok',type:1},
    {message:'ok',position:'outside'}, {message:'ok',position:'top'},
    {message:'ok',timeout:-1}, {message:'ok',timeout:999},
    {message:'ok',timeout:15001},{message:'ok',timeout:'5000'},
    {message:'ok',group:'click'}, {message:'ok',group:null},
    {message:'ok',caption:''},{message:'ok',caption:'\u202e'},
    {message:'ok',caption:'a'.repeat(121)},
    {message:'ok',action:'install'}, {message:'ok',html:'<b>unsafe</b>'},
    {message:'ok',onClick:()=>{}}
  ])assert.equal(normalizeToolUiNotice(invalid),null,
    'reject unsupported or privilege-confusable notify shape');
});

test('existing Host view caps to three toasts, coalesces duplicates and preserves legacy snapshot',()=>{
  const view=createSidebarToolsView();
  const first=view.showToast('已保存');
  assert.equal(first,undefined); // unchanged presentation-only caller contract
  assert.equal(view.getSnapshot().toast.message,'已保存');
  assert.equal(view.getSnapshot().toast.type,'info');
  assert.equal(view.getSnapshot().toast.timeout,5000);
  view.showToast('已保存');
  assert.equal(view.getSnapshot().toasts.length,1);
  assert.equal(view.getSnapshot().toasts[0].count,2);
  view.showToast('导出失败',{type:'error',caption:'请检查目标文件',position:'bottom-right',timeout:0});
  const next=view.getSnapshot().toast;
  assert.equal(next.type,'error');
  assert.equal(next.position,'bottom-right');
  assert.equal(next.caption,'请检查目标文件');
  view.showToast('导出失败',{type:'error',caption:'请检查目标文件',position:'bottom-right',timeout:0,group:false});
  assert.equal(view.getSnapshot().toasts.length,3);
  const oldId=view.getSnapshot().toasts[0].id;
  view.showToast('任务开始',{type:'info'});
  assert.equal(view.getSnapshot().toasts.length,3);
  assert.equal(view.getSnapshot().toasts.some(row=>row.id===oldId),false);
  const endId=view.getSnapshot().toast.id;
  view.dismissToast(endId);
  assert.equal(view.getSnapshot().toasts.length,2);
  view.dismissToast(endId);
  assert.equal(view.getSnapshot().toasts.length,2);
  view.dispose();
  assert.equal(view.getSnapshot().toast,null);
  assert.deepEqual(view.getSnapshot().toasts,[]);
});

test('priority overflow protects sticky errors and cannot grow an invisible queue',()=>{
  const view=createSidebarToolsView();
  view.showToast('重要错误',{type:'error',timeout:0});
  view.showToast('需要处理',{type:'warning',timeout:0});
  view.showToast('普通一条',{type:'info',timeout:0});
  const original=view.getSnapshot().toasts.map(row=>row.id);
  view.showToast('普通二条',{type:'info'});
  assert.deepEqual(view.getSnapshot().toasts.map(row=>row.id),original,
    'a normal info cannot evict three persistent entries');
  view.showToast('新严重错误',{type:'error',timeout:0});
  assert.equal(view.getSnapshot().toasts.length,3);
  assert.equal(view.getSnapshot().toasts.some(row=>row.message==='重要错误'),true);
  assert.equal(view.getSnapshot().toasts.some(row=>row.message==='需要处理'),true);
  assert.equal(view.getSnapshot().toasts.some(row=>row.message==='新严重错误'),true);
  view.showToast('低优先级',{type:'info'});
  assert.equal(view.getSnapshot().toasts.length,3);
  assert.equal(view.getSnapshot().toasts.some(row=>row.message==='低优先级'),false);
  view.dispose();
});

test('owner-scoped toast handles update only their own row and retire on switch',()=>{
  const view=createSidebarToolsView();
  view.showToast('「A」：旧通知',{type:'info',owner:'instance-A'});
  const own=view.addToolToast('「A」：处理中',{type:'info',timeout:0},'instance-A');
  const other=view.addToolToast('「B」：处理中',{type:'info',timeout:0},'instance-B');
  assert.equal(typeof own,'number');
  assert.equal(view.updateToolToast(own,'「A」：成功',{type:'success',timeout:3000},'instance-B'),false);
  assert.equal(view.updateToolToast(own,'「A」：成功',{type:'success',timeout:3000},'instance-A'),true);
  assert.equal(view.getSnapshot().toasts.some(row=>row.id===own&&row.type==='success'),true);
  assert.equal(view.hasToast(own,'instance-A'),true);
  view.clearToastsByOwner('instance-A');
  assert.equal(view.hasToast(own,'instance-A'),false);
  assert.equal(view.updateToolToast(own,'「A」：重试',{type:'info'},'instance-A'),false);
  assert.equal(view.hasToast(other,'instance-B'),true);
  assert.equal(view.getSnapshot().toasts.some(row=>row.message==='「A」：旧通知'),false,
    'legacy tool notices must also retire with the owner');
  view.showToast('可信宿主反馈',{type:'info'});
  view.clearToastsByOwner('instance-B');
  assert.equal(view.getSnapshot().toasts.some(row=>row.message==='可信宿主反馈'),true,
    'trusted host notice must not be removed by owner cleanup');
  view.dispose();
});

test('rate gate supplies a bounded Host retry-after without relaxing legacy budget',()=>{
  let now=1000;
  const gate=createToolUiNoticeRateGate({now:()=>now});
  for(let i=0;i<3;i++)assert.deepEqual(gate.admit('one'),{accepted:true,retryAfterMs:0});
  assert.deepEqual(gate.admit('one'),{accepted:false,retryAfterMs:60000});
  now+=54001;
  assert.deepEqual(gate.admit('one'),{accepted:false,retryAfterMs:5999});
  now=61000;
  assert.equal(gate.allow('one'),true);
});
