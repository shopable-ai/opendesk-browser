import {mountWorkflowClient} from './workflow-mounted-ui.mjs';
import {load} from 'cheerio';
import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowForModel,restoreModelRedactions,verifiedWorkflowHistory} from '../../src/ui/workflow/data-sharing.js';
import {workflowCodexInput} from '../../src/ui/workflow/local-codex.js';
import {requestWorkflowPlan} from '../../src/ui/workflow/ai-plan.js';

test('Codex planning copy omits old fill values, defaults and navigational query',()=>{
  const workflow={workflowId:'wf-test',title:'浏览器表单',description:'',
    siteOrigin:'https://demo.example',
    paramsSchema:{type:'object',additionalProperties:false,properties:{
      x:{type:'string',title:'输入值',default:'HIDDEN_DEFAULT'}},required:[]},
    steps:[{stepId:'a',op:'fill',locatorKind:'css',selector:'#x',text:'HIDDEN_FILL'},
      {stepId:'b',op:'navigate',url:'https://demo.example/page?token=HIDDEN_QUERY#fragment'}]};
  const copy=workflowForModel(workflow);
  const prompt=workflowCodexInput('生成表单自动化',workflow);
  for(const secret of ['HIDDEN_DEFAULT','HIDDEN_FILL','HIDDEN_QUERY']){
    assert.ok(!JSON.stringify(copy).includes(secret));
    assert.ok(!prompt.includes(secret));
  }
  assert.equal(workflow.steps[0].text,'HIDDEN_FILL');
  assert.equal(copy.steps[1].url,'https://demo.example/page');
});
test('unchanged secret fills and navigation URLs survive AI refinement locally',()=>{
  const original={paramsSchema:{properties:{}},steps:[
    {stepId:'fill',op:'fill',locatorKind:'css',selector:'#token',text:'LOCAL_SECRET'},
    {stepId:'nav',op:'navigate',url:'https://demo.example/page?private=LOCAL_QUERY'}
  ]};
  const shared=workflowForModel(original);
  const restored=restoreModelRedactions({steps:shared.steps},original);
  assert.equal(restored.steps[0].text,'LOCAL_SECRET');
  assert.equal(restored.steps[1].url,'https://demo.example/page?private=LOCAL_QUERY');
  assert.equal(shared.steps[0].text,'[原填写值未发送，请使用运行参数]');
  assert.throws(()=>restoreModelRedactions({steps:[{
    ...shared.steps[0],selector:'#other'}]},original),{code:'E_AI_REDACTION'});
  assert.throws(()=>restoreModelRedactions({steps:[{
    ...shared.steps[0],stepId:'forged'}]},original),{code:'E_AI_REDACTION'});
});
test('custom HTTPS planning follows the same minimization',async()=>{
  const {emptyWorkflow}=await import('../../src/framework/workflow/contract.js');
  const workflow=emptyWorkflow('https://demo.example','12345678-1234-1234-1234-123456789abc');
  workflow.paramsSchema.properties.x={type:'string',title:'输入值',default:'HIDDEN_DEFAULT'};
  workflow.steps=[{stepId:'stepone',op:'fill',locatorKind:'css',selector:'#x',text:'HIDDEN_FILL'}];
  const proposal={title:'观察',description:'',paramsSchema:{
    type:'object',additionalProperties:false,properties:{},required:[]},
    steps:[{stepId:'check',op:'observe'}]};
  let body;
  await requestWorkflowPlan({endpoint:'https://ai.example/v1/chat',model:'m',apiKey:'test-api-key',
    request:'整理页面',workflow,fetchImpl:async(_url,request)=>{
      body=request.body;return {ok:true,text:async()=>JSON.stringify({
        choices:[{message:{content:JSON.stringify(proposal)}}]})};}});
  assert.ok(!body.includes('HIDDEN_FILL'));
  assert.ok(!body.includes('HIDDEN_DEFAULT'));
  assert.ok(!body.includes('test-api-key'));
});
test('user-initiated AI sends directly without custom consent UI or ledger',async()=>{
  const {readFile}=await import('node:fs/promises');
  const mounted=await mountWorkflowClient();
  let html;
  try {
    html=mounted.html();
    const live=load(html);
    assert.equal(live('#workflow-ai-plan').attr('aria-label'),'发送',
      'the real shared Chat Frame owns the accessible Send control');
    assert.equal(live('#workflow-ai-plan').closest('.od-conversation-composer').length,1,
      'Send must be inside the real shared form, not a legacy manual button');
    assert.equal(live('#workflow-ai-plan').closest('[data-opendesk-react-owner="workflow-page"]').length,1);
    assert.equal(live('#workflow-ai-request').length,1,'the split-target portal mounts the actual input');
  } finally { await mounted.close(); }
  const [view,css,sharing,frame,component]=await Promise.all(
    ['src/ui/workflow/workflow-view.js','src/ui/tool-shell.css',
     'src/ui/workflow/data-sharing.js','src/ui/react/components/conversation.tsx',
     'src/ui/react/tabs/workflow.tsx'].map(path=>readFile(path,'utf8')));
  const $=load(html);
  assert.match(frame,/onSubmit=\{submit\}/);
  assert.match(frame,/onSend\(event\)/);
  assert.match(component,/onSend=\{event=>click\('workflow-ai-plan',event\)\}/);
  assert.equal($('[id$="-react-host"]').length,0,'no legacy workflow portals');
  assert.doesNotMatch(html,/id="workflow-ai-disclosure"|id="workflow-ai-review-|id="workflow-ai-revoke"/);
  assert.doesNotMatch(html,/workflow-ai-data-details|同意并生成|模型的数据发送许可/);
  assert.doesNotMatch(css,/\.workflow-ai-data-review|\.workflow-ai-data-details|\.workflow-ai-revoke/);
  assert.doesNotMatch(view,/modelConsent|modelScope|pendingModelReview|showModelReview|renderDataDisclosure/);
  assert.doesNotMatch(sharing,/createModelConsent|modelDataScope|CONSENT_STORAGE_KEY|ConsentManager|AuthorizationManager/);
  assert.doesNotMatch(view,/create(?:Consent|Authorization|Permission)Manager|new (?:Consent|Authorization|Permission)Manager/);
  assert.match(view,/bind\('workflow-ai-plan','click',sendNaturalLanguage\)/);
  assert.match(view,/selectSavedWorkflowRoute\(\{request:original,target,records:saveList\}\)/);
  assert.match(view,/const taskSnapshot=await client\.request\('listTaskCatalog',\{\}\)/);
  assert.match(view,/selectInstalledTaskRoute\(\{request,target,/);
  assert.match(view,/return executeMatchedInstalled\(event,prepared\)/);
  assert.doesNotMatch(view,/if\(immediate.state==='AI'&&!pendingReuse/);
  assert.match(view,/verifyWorkflowBundle\(record\)/);
  assert.match(view,/return runSavedBundle\(event,prepared\)/);
  assert.match(view,/async function plan\(event,\{pregranted=false\}=\{\}\)\s*\{\s*if\(!event\.isTrusted\|\|busy\|\|autoExecutionPending\|\|host\.executionPending\|\|host\.currentRun\|\|/);
  assert.match(view,/if\(!event\?\.isTrusted\|\|disposed\|\|busy\|\|autoExecutionPending\|\|workflowAgent/);
  assert.match(view,/async function executeAIAuto\(planned\)/);
  assert.match(view,/autoExecutionPending=true;autoStart=plannedExecution/);
  assert.match(view,/const origins=\[permissionPattern\(captured\.url\)\]/);
  assert.match(view,/if\(selected!=='local_codex'\)origins\.push\(permissionPattern\(frozen\.endpoint\)\)/);
  assert.match(view,/selected==='cloud_responses'/);
  assert.match(view,/permission=selected==='local_codex'\?Promise\.resolve\(true\):\s*pregranted\?api\.permissions\.contains\(\{origins:\[\.\.\.new Set\(origins\)\]\}\):\s*api\.permissions\.request\(\{origins:\[\.\.\.new Set\(origins\)\]\}\)/);
  assert.match(view,/permission=row\.siteGranted\?Promise\.resolve\(true\):api\.permissions\.request\(\{origins:\[permissionPattern\(row\.captured\.url\)\]\}\)/);
  assert.match(view,/currentPageTarget\.revalidate\(row\.captured\)/);
});


test('Native and Cloud may inherit only bounded verified business facts',()=>{
  const fill={request:'填入 OpenDesk',outcome:'verified',readbackVerified:true,
    stepCount:1,effectKind:'input-readback'};
  const search={request:'搜索 OpenDesk',outcome:'verified',readbackVerified:true,
    stepCount:2,effectKind:'search-results',visibleResultLinks:2};
  const inline={request:'搜索 OpenDesk',outcome:'verified',readbackVerified:true,
    stepCount:2,effectKind:'search-inline'};
  const facts=verifiedWorkflowHistory([fill,search,inline]);
  assert.deepEqual(facts,[fill,search,inline]);facts[0].request='changed';
  assert.equal(fill.request,'填入 OpenDesk');
  assert.match(workflowCodexInput('查看结果',{
    siteOrigin:'https://demo.example',title:'',description:'',
    paramsSchema:{type:'object',additionalProperties:false,properties:{},required:[]},steps:[]
  },[fill,search]),/"effectKind":"search-results"/);
  for(const invalid of [
    [{...search,outcome:'attempted'}],
    [{...search,threadId:'native-thread'}],
    [{...search,visibleResultLinks:30}],
    [{...search,effectKind:'click-confirmed'}],
    [{...search,effectKind:'search-empty',visibleResultLinks:1}],
    [{...inline,visibleResultLinks:0}],
    [{...inline,visibleResultLinks:undefined}],
    [{...fill,observedNodes:[{text:'SECRET'}]}],
    [fill,fill,fill,fill,fill]
  ])assert.throws(()=>verifiedWorkflowHistory(invalid),{code:'E_AI_CONFIG'});
});
