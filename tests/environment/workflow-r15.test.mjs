import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkflow,validateWorkflow,normalizeAiProposal,validateWorkflowParams} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';

function sample() {
  const w=emptyWorkflow('http://127.0.0.1:43111','12345678-1234-1234-1234-123456789abc');
  w.paramsSchema={type:'object',additionalProperties:false,properties:{
    keyword:{type:'string',title:'搜索词',default:'OpenDesk'}},required:['keyword']};
  w.steps=[
    {stepId:'step1',op:'fill',locatorKind:'css',selector:'#keyword',param:'keyword'},
    {stepId:'step2',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'},
    {stepId:'step3',op:'wait',locatorKind:'css',selector:'#results',timeout:9000},
    {stepId:'step4',op:'extract',locatorKind:'css',selector:'#results'}
  ];
  return w;
}
test('schema, typed parameters, and deterministic source/hash',async()=>{
  const w=sample();
  assert.equal(validateWorkflowParams(w,{keyword:'X'}).keyword,'X');
  const a=await compileWorkflow(w), b=await compileWorkflow(w);
  assert.equal(a.sourceUtf8,b.sourceUtf8); assert.equal(a.sourceHash,b.sourceHash);
  assert.match(a.sourceHash,/^[a-f0-9]{64}$/);
  assert.match(a.sourceUtf8,/page\.getByRole\("button", \{name:"搜索",exact:true\}\)\.click/);
  assert.match(a.sourceUtf8,/workflow-step: step4/);
  assert.match(a.sourceUtf8,/return __results/);
});
test('emitter quotes arbitrary literal rather than interpreting script',async()=>{
  const w=sample();w.steps[0]={stepId:'step1',op:'fill',locatorKind:'css',
    selector:'#keyword"); alert(1); //',text:'"); process.exit(1); //'};
  const c=await compileWorkflow(w);
  assert.ok(c.sourceUtf8.includes(JSON.stringify(w.steps[0].selector)));
  assert.ok(c.sourceUtf8.includes(JSON.stringify(w.steps[0].text)));
  assert.doesNotMatch(c.sourceUtf8,/^\s*alert\(1\)/m);
});
test('cross-origin, unknown args, duplicate ids and untrusted model payload rejected',async()=>{
  const w=sample();w.steps.push({stepId:'step5',op:'navigate',url:'https://other.example/'});
  assert.throws(()=>validateWorkflow(w),{code:'E_WORKFLOW_ORIGIN'});
  w.steps.pop();w.steps.push({...w.steps[0]});
  assert.throws(()=>validateWorkflow(w),{code:'E_WORKFLOW_SCHEMA'});
  w.steps.pop();w.steps[0].source='eval("x")';
  assert.throws(()=>validateWorkflow(w),{code:'E_WORKFLOW_SCHEMA'});
  delete w.steps[0].source;
  assert.throws(()=>normalizeAiProposal({title:'X',description:'',paramsSchema:w.paramsSchema,
    steps:w.steps,permissions:['tabs']},w),{code:'E_WORKFLOW_AI'});
});
test('same origin navigation allowed; confirmations fail closed',async()=>{
  const w=sample();
  w.steps.unshift({stepId:'nav',op:'navigate',url:'http://127.0.0.1:43111/demo-form.html'});
  assert.match((await compileWorkflow(w)).sourceUtf8,/page\.goto/);
  w.steps.push({stepId:'consent',op:'confirm',text:'高风险操作需要独立执行确认'});
  await assert.rejects(compileWorkflow(w),{code:'E_WORKFLOW_CONFIRM_UNSUPPORTED'});
});
