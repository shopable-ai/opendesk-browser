import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {prepareDirectExecution,verifyDirectExecutionReceipt} from '../../src/ui/workflow/direct-execution.js';
const origin='https://example.test';
const target={windowId:1,tabId:2,frameId:0,documentId:'doc-1',url:origin+'/form',origin};
const hash='a'.repeat(64);
function workflow(steps) {
  const w=emptyWorkflow(origin,'12345678-1234-1234-1234-123456789abc');
  w.steps=steps;return w;
}
const fill={stepId:'fill-1',op:'fill',locatorKind:'css',selector:'#keyword',text:'ai自动化第一选择'};
function proof(){return {claim:{runId:'run-1',revision:{sourceHash:hash}},
  completed:{state:'completed',retirement:{state:'released'}},
  view:{run:{runId:'run-1',state:'completed',workerRetired:true,retirementState:'released',
    target:{documentId:target.documentId,allowedOrigin:origin},revision:{sourceHash:hash}},
  results:[{runId:'run-1',resultId:'result-1',revision:{sourceHash:hash},outcome:{ok:true}}]},
  sourceHash:hash,target};}
test('explicit fill compiles with opt-in readback and retains old source hash',async()=>{
  const w=workflow([fill]);
  assert.deepEqual(prepareDirectExecution({request:'在输入框里填入 ai自动化第一选择',workflow:w,target}).params,{});
  const old=await compileWorkflow(w),now=await compileWorkflow(w,{verifyFill:true});
  assert.doesNotMatch(old.sourceUtf8,/inputValue\(/);
  assert.match(now.sourceUtf8,/inputValue\(/);
  assert.match(now.sourceUtf8,/input-readback/);
  assert.notEqual(now.sourceHash,old.sourceHash);
});
test('unrequested clicks, irreversible actions, and changed sites fail closed',()=>{
  const w=workflow([fill,{stepId:'click1',op:'click',locatorKind:'css',selector:'#submit'}]);
  assert.throws(()=>prepareDirectExecution({request:'在输入框里填入 ai自动化第一选择',workflow:w,target}),{code:'E_AI_UNREQUESTED_ACTION'});
  assert.throws(()=>prepareDirectExecution({request:'点击付款',workflow:w,target}),{code:'E_AI_REVIEW_REQUIRED'});
  assert.throws(()=>prepareDirectExecution({request:'填写并提交',workflow:w,target:{...target,origin:'https://evil.test'}}),{code:'E_DOCUMENT_STALE'});
});
test('unprovided values, missing params, and navigation do not dispatch',()=>{
  const wrong=workflow([{...fill,text:'模型编造'}]);
  assert.throws(()=>prepareDirectExecution({request:'填写 ai自动化第一选择',workflow:wrong,target}),{code:'E_AI_VALUE_NOT_GROUNDED'});
  const required=workflow([{...fill,param:'name'}]);delete required.steps[0].text;
  required.paramsSchema.properties.name={type:'string',title:'名称'};required.paramsSchema.required=['name'];
  assert.throws(()=>prepareDirectExecution({request:'填写名字',workflow:required,target}),{code:'E_PARAMS'});
  const nav=workflow([{stepId:'nav1',op:'navigate',url:origin+'/next'}]);
  assert.throws(()=>prepareDirectExecution({request:'打开下一页',workflow:nav,target}),{code:'E_AI_REVIEW_REQUIRED'});
});
test('durable proof binds matching run/document/source/worker retirement',()=>{
  const r=proof();assert.deepEqual(verifyDirectExecutionReceipt(r),{runId:'run-1',resultId:'result-1',sourceHash:hash});
  for(const invalid of [
    {...r,completed:{...r.completed,retirement:{state:'pending'}}},
    {...r,claim:{...r.claim,revision:{sourceHash:'b'.repeat(64)}}},
    {...r,view:{...r.view,results:[]}},
    {...r,view:{...r.view,run:{...r.view.run,target:{...r.view.run.target,documentId:'other'}}}}
  ])assert.throws(()=>verifyDirectExecutionReceipt(invalid),{code:'E_AI_OUTCOME_UNKNOWN'});
});
