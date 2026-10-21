import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowExecutionFeedback} from '../../src/ui/workflow/workflow-view.js';

const step={stepId:'fill-name',op:'fill',locatorKind:'label',selector:'姓名',text:'测试乙'};
const workflow={steps:[step]};
const execution={ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readbackVerified:true,
  runId:'internal-run',resultId:'internal-result'};
const values={'fill-name':{kind:'input-readback',matched:true,value:'测试乙'}};

test('verified feedback names the actual fill and readback without internal identities',()=>{
  const message=workflowExecutionFeedback({workflow,execution,values});
  assert.match(message,/已将“姓名”填写为“测试乙”，并核对输入值一致/);
  assert.match(message,/未确认服务器已提交/);
  assert.doesNotMatch(message,/internal-|local_codex|RunHost|模型来源|fill-name/);
});

test('missing, mismatched or unverified readbacks never claim input success',()=>{
  for(const input of [
    {execution:{...execution,readbackVerified:false},values},
    {execution,values:null},
    {execution,values:{'fill-name':{...values['fill-name'],matched:false}}},
    {execution,values:{'fill-name':{...values['fill-name'],value:'测试甲'}}},
    {execution:{...execution,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED'},values}
  ]){
    const message=workflowExecutionFeedback({workflow,...input});
    assert.match(message,/尚未确认/);
    assert.doesNotMatch(message,/测试乙|核对输入值一致/);
    assert.match(message,/不会自动重复执行/);
  }
});

test('failed or unknown execution remains visible and does not invite replay',()=>{
  for(const result of [null,{...execution,ok:false}]){
    const message=workflowExecutionFeedback({workflow,execution:result,values});
    assert.match(message,/未能确认成功/);
    assert.match(message,/不会自动重试/);
    assert.doesNotMatch(message,/核对输入值一致/);
  }
});

test('parameterized values come from matching receipts and every fill must match',()=>{
  const parameter={...step,param:'name',text:undefined};
  assert.match(workflowExecutionFeedback({workflow:{steps:[parameter]},execution,
    params:{name:'测试乙'},values}),/填写为“测试乙”/);
  const second={...step,stepId:'second',text:'另一个值'};
  const both={...values,second:{kind:'input-readback',matched:true,value:'另一个值'}};
  assert.match(workflowExecutionFeedback({workflow:{steps:[step,second]},execution,values:both}),
    /已填写 2 个输入框，并逐项核对/);
  assert.match(workflowExecutionFeedback({workflow:{steps:[step,second]},execution,values}),/尚未确认/);
});

test('chat does not echo credentials, long values or selectors',()=>{
  for(const [label,value] of [['密码','private-value'],['apiKey','private-value'],
    ['备注','Bearer private-value'],['备注','x'.repeat(81)]]){
    const message=workflowExecutionFeedback({execution,
      workflow:{steps:[{...step,selector:label,text:value}]},
      values:{'fill-name':{kind:'input-readback',matched:true,value}}});
    assert.match(message,/核对输入值一致/);
    assert.ok(!message.includes(value));
  }
  const css=workflowExecutionFeedback({execution,values,
    workflow:{steps:[{...step,locatorKind:'css',selector:'#internal-selector'}]}});
  assert.match(css,/输入框/);assert.doesNotMatch(css,/#internal-selector/);
});

test('search feedback keeps the limits of the independently verified effect',()=>{
  assert.match(workflowExecutionFeedback({execution:{...execution,
    effect:{kind:'search-results',visibleResultLinks:3}}}),/3 个新链接；结果是否相关仍需确认/);
  assert.match(workflowExecutionFeedback({execution:{...execution,
    effect:{kind:'search-empty'}}}),/已核对页面显示“无结果”/);
  assert.match(workflowExecutionFeedback({execution:{...execution,
    effect:{kind:'search-inline'}}}),/未确认服务器数据已提交/);
});
