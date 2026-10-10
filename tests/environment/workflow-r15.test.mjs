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

test('AI adapter sends only agreed structure to explicit HTTPS provider and validates response', async()=>{
  const {requestWorkflowPlan}=await import('../../src/ui/workflow/ai-plan.js');
  const wf=sample(),proposal={title:'搜索',description:'',paramsSchema:wf.paramsSchema,steps:wf.steps};
  let seen;
  const fetchImpl=async (url,opts)=>{
    seen={url,opts};
    return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(proposal)}}]})};
  };
  const result=await requestWorkflowPlan({endpoint:'https://provider.example/v1/chat/completions',
    apiKey:'short-test-key',model:'test-model',request:'搜索',workflow:wf,fetchImpl});
  assert.equal(result.workflowId,wf.workflowId);
  assert.equal(result.siteOrigin,wf.siteOrigin);
  assert.equal(seen.url,'https://provider.example/v1/chat/completions');
  assert.equal(seen.opts.credentials,'omit');
  assert.equal(seen.opts.redirect,'error');
  assert.equal(seen.opts.headers.Authorization,'Bearer short-test-key');
  const sent=JSON.parse(seen.opts.body);
  assert.equal(sent.messages[0].role,'system');
  assert.equal(sent.messages[1].role,'user');
  assert.equal(JSON.parse(sent.messages[1].content).siteOrigin,wf.siteOrigin);
  assert.ok(!seen.opts.body.includes('document.body'));
  await assert.rejects(requestWorkflowPlan({endpoint:'http://provider.example/v1/chat/completions',
    apiKey:'key',model:'test',request:'run',workflow:wf,fetchImpl}),{code:'E_AI_CONFIG'});
});
test('malicious AI output never changes site, adds authority or injects JavaScript',async()=>{
  const {requestWorkflowPlan}=await import('../../src/ui/workflow/ai-plan.js');
  const wf=sample();
  const response={title:'Danger',description:'',paramsSchema:wf.paramsSchema,steps:[
    {stepId:'evil',op:'navigate',url:'https://offsite.example/'}]};
  await assert.rejects(requestWorkflowPlan({endpoint:'https://provider.example/v1/chat/completions',
    apiKey:'key',model:'test',request:'search',workflow:wf,
    fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[
      {message:{content:JSON.stringify(response)}}]})})}),{code:'E_WORKFLOW_ORIGIN'});
});
test('R15 navigation and executor wiring is real source, not simulated preview',async()=>{
  const {readFile}=await import('node:fs/promises');
  const [html,css,shell,task,view]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),readFile('src/ui/tool-shell.css','utf8'),
    readFile('src/ui/tool-shell.js','utf8'),readFile('src/ui/task-workbench.js','utf8'),
    readFile('src/ui/workflow/workflow-view.js','utf8')]);
  for (const id of ['tab-workflow','workbench-workflow','workflow-steps','workflow-params',
    'workflow-run','workflow-save','workflow-stop','workflow-candidate','workflow-output'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(css,/repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(task,/\['workflow','tab-workflow'\]/);
  assert.match(task,/setWorkflowRunOwner\(runId\)/);
  assert.match(shell,/createWorkflowView\(/);
  assert.match(view,/onRunOwner\('pending'\)/);
  assert.match(view,/currentPageTarget\.revalidate\(captured\)/);
  assert.match(view,/host\.start\(\{source,params/);
  assert.match(view,/snapshotControllerRun\(\{runId:claim\.runId\}\)/);
  assert.match(view,/commitControllerScript\(/);
  assert.match(view,/createTaskPackage\(/);
  assert.doesNotMatch(view,/innerHTML\s*=|eval\(|new Function\(/);
});
