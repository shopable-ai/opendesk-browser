import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeToolUiNotice,createToolUiNoticeRateGate,
  TOOL_UI_NOTICE_MAX_LENGTH} from '../../src/sidebar-tools/ui-notice.js';

test('Tool UI notice accepts only bounded plain-text messages',()=>{
  assert.deepEqual(normalizeToolUiNotice({message:'  已保存  '}),{message:'已保存'});
  assert.deepEqual(normalizeToolUiNotice({message:'✓ saved'}),{message:'✓ saved'});
  for(const invalid of [undefined,null,'saved',[],{},Object.create(null),
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
