import test from 'node:test';
import assert from 'node:assert/strict';
import {modelDataScope,createModelConsent,workflowForModel,restoreModelRedactions,
  CONSENT_STORAGE_KEY} from '../../src/ui/workflow/data-sharing.js';
import {workflowCodexInput} from '../../src/ui/workflow/local-codex.js';
import {requestWorkflowPlan} from '../../src/ui/workflow/ai-plan.js';

const scope=(model='m')=>modelDataScope({provider:'custom_https',
  endpoint:'https://ai.example/v1/chat?token=HIDDEN_QUERY',model});
test('first-use is not granted by default; recipient changes, revocation and expiry',async()=>{
  let saved,now=1700000000000;
  const storage={async get(){return {[CONSENT_STORAGE_KEY]:saved};},
    async set(record){saved=record[CONSENT_STORAGE_KEY];}};
  const first=createModelConsent({storage,clock:()=>now});
  await first.load();
  assert.equal(first.has(scope()),false);
  assert.ok(!scope().includes('HIDDEN_QUERY'));
  first.approve(scope());assert.equal(first.has(scope()),true);
  await Promise.resolve();await Promise.resolve();
  const restored=createModelConsent({storage,clock:()=>now});
  await restored.load();assert.equal(restored.has(scope()),true);
  assert.equal(restored.has(scope('different')),false);
  assert.equal(restored.has(modelDataScope({provider:'custom_https',endpoint:'https://other.example/v1/chat',model:'m'})),false);
  restored.revoke(scope());assert.equal(restored.has(scope()),false);
  now+=181*24*60*60*1000;assert.equal(first.has(scope()),false);
});
test('future hosted or manual sources cannot inherit user-selected model consent',()=>{
  assert.equal(modelDataScope({provider:'manual'}),null);
  assert.equal(modelDataScope({provider:'opendesk_cloud'}),null);
  assert.equal(modelDataScope({provider:'custom_https',endpoint:'http://insecure.example',model:'m'}),null);
  assert.ok(modelDataScope({provider:'local_codex'}));
});
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
test('trusted workflow UI keeps explicit web approval and real Chrome user gesture',async()=>{
  const {readFile}=await import('node:fs/promises');
  const [html,view,css]=await Promise.all([
    'src/ui/tool.html','src/ui/workflow/workflow-view.js','src/ui/tool-shell.css'
  ].map(path=>readFile(path,'utf8')));
  assert.match(html,/id="workflow-ai-disclosure" class="workflow-ai-data-review"[^>]*hidden/);
  assert.match(html,/id="workflow-ai-review-title" tabindex="-1"/);
  assert.match(html,/id="workflow-ai-review-approve"/);
  assert.match(html,/id="workflow-ai-review-cancel"/);
  assert.match(html,/id="workflow-ai-plan"[^>]*aria-controls="workflow-ai-disclosure"/);
  assert.match(html,/id="workflow-ai-revoke"/);
  assert.doesNotMatch(html,/class="workflow-ai-data-notice"|id="workflow-ai-plan-label"/);
  assert.doesNotMatch(html,/id="workflow-ai-consent"|id="workflow-ai-observe-consent"/);
  assert.match(view,/modelConsent\.approve\(frozen\.scope\)/);
  assert.match(view,/api\.permissions\.request\(\{origins:\[permissionPattern\(row\.captured\.url\)\]\}\)/);
  assert.match(view,/currentPageTarget\.revalidate\(row\.captured\)/);
  assert.match(view,/if\(!modelConsent\.has\(frozen\.scope\)\)/);
  assert.match(view,/if\(event\.currentTarget!==get\('workflow-ai-review-approve'\)\)/);
  assert.match(view,/showModelReview\(frozen\)/);
  assert.match(view,/pendingModelReview!==modelReviewSignature\(\)/);
  assert.match(view,/listen\(get\('workflow-ai-review-cancel'\),'click'/);
  assert.match(view,/listen\(get\('workflow-ai-request'\),'input'/);
  assert.match(css,/\.workflow-ai-data-review\{/);
  assert.doesNotMatch(css,/\.workflow-ai-data-notice\{/);
});
