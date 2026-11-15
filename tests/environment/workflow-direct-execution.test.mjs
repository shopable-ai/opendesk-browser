import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkflow,normalizeAiProposal} from '../../src/framework/workflow/contract.js';
import {workflowForModel} from '../../src/ui/workflow/data-sharing.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {createWorkflowAgentLoopGuard} from '../../src/ui/workflow/agent-loop.js';
import {classifyWorkflowRunRisk,prepareDirectExecution,verifyDirectExecutionReceipt,directExecutionEvidenceLevel,verifyDirectFillReadbacks,verifySearchBusinessEffect,verifySavedWorkflowRevision,verifyOpenedLinkPage} from '../../src/ui/workflow/direct-execution.js';
const origin='https://example.test';
const target={windowId:1,tabId:2,frameId:0,documentId:'doc-1',url:origin+'/form',origin};
const searchObservation={summary:{origin,documentId:target.documentId,nodes:[
  {role:'button',name:'搜索',state:{visible:true},locator:{kind:'role',value:'button',name:'搜索'}}
]}};
const hash='a'.repeat(64);
function workflow(steps) {
  const w=emptyWorkflow(origin,'12345678-1234-1234-1234-123456789abc');
  w.steps=steps;return w;
}
const fill={stepId:'fill-1',op:'fill',locatorKind:'css',selector:'#keyword',text:'ai自动化第一选择'};
function proof(){
  const receipt={runId:'run-1',resultId:'result-1',state:'completed',
    revision:{sourceHash:hash},outcome:{ok:true}};
  const boundTarget={...target,allowedOrigin:origin};
  return {claim:{runId:'run-1',resultId:'result-1',target:boundTarget,revision:{sourceHash:hash}},
    completed:{runId:'run-1',state:'completed',retirement:{state:'released'},result:receipt},
    view:{run:{runId:'run-1',resultId:'result-1',state:'completed',workerRetired:true,retirementState:'released',
      target:boundTarget,revision:{sourceHash:hash}},results:[receipt]},
    sourceHash:hash,target};
}
test('shared risk classifier avoids redundant read and ordinary fill consent but reviews unknown effects',()=>{
  assert.equal(classifyWorkflowRunRisk(workflow([{stepId:'read',op:'observe'}])).needsReview,false);
  assert.equal(classifyWorkflowRunRisk(workflow([fill])).needsReview,false);
  assert.equal(classifyWorkflowRunRisk(workflow([{...fill,selector:'#password'}])).sensitiveFields,1);
  assert.equal(classifyWorkflowRunRisk(workflow([{stepId:'click',op:'click',locatorKind:'css',selector:'#not-observed'}])).needsReview,true);
  assert.throws(()=>prepareDirectExecution({request:'点击按钮',workflow:workflow([
    {stepId:'click',op:'click',locatorKind:'css',selector:'#not-observed'}]),target}),{code:'E_AI_REVIEW_REQUIRED'});
  assert.throws(()=>prepareDirectExecution({request:'在输入框填写 OpenDesk',
    workflow:workflow([{...fill,text:'OpenDesk',selector:'#password'}]),target}),{code:'E_AI_REVIEW_REQUIRED'});
});
test('explicit fill compiles with opt-in readback and retains old source hash',async()=>{
  const w=workflow([fill]);
  assert.deepEqual(prepareDirectExecution({request:'在输入框里填入 ai自动化第一选择',workflow:w,target}).params,{});
  const old=await compileWorkflow(w),now=await compileWorkflow(w,{verifyFill:true});
  assert.doesNotMatch(old.sourceUtf8,/inputValue\(/);
  assert.match(now.sourceUtf8,/inputValue\(/);
  assert.match(now.sourceUtf8,/input-readback/);
  assert.match(now.sourceUtf8,/value:__actual/);
  assert.notEqual(now.sourceHash,old.sourceHash);
});
test('explicit search navigation freezes readiness and binds only the matching durable query destination',async()=>{
  const click={stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索',waitUntil:'domcontentloaded',timeout:12000};
  const w=workflow([{...fill,text:'OpenDesk'},click]);
  const admitted=prepareDirectExecution({request:'搜索 OpenDesk',workflow:w,target,observation:searchObservation});
  assert.deepEqual(admitted.searchNavigation,{kind:'search-results-v1',query:'OpenDesk',origin});
  const frozen=await compileWorkflow(w),plain=await compileWorkflow(workflow([{...click,waitUntil:undefined}]));
  assert.notEqual(frozen.sourceHash,plain.sourceHash);
  const calls=[];
  await new Function('page','params',frozen.sourceUtf8+';return main();')({
    locator:()=>({fill:async()=>{}}),getByRole:()=>({click:async options=>calls.push(options)})},{});
  assert.deepEqual(calls,[{waitUntil:'domcontentloaded',timeout:12000}]);
  const p=proof();p.claim.target={...p.claim.target,targetVersion:1};
  p.view.run.target={...p.claim.target,documentId:'new-doc',url:origin+'/search?q=OpenDesk&source=hp',targetVersion:2};
  assert.equal(verifyDirectExecutionReceipt({...p,navigationTarget:admitted.searchNavigation}).runId,'run-1');
  for(const url of [origin+'/search?q=other','https://evil.test/search?q=OpenDesk']){
    assert.throws(()=>verifyDirectExecutionReceipt({...p,navigationTarget:admitted.searchNavigation,
      view:{...p.view,run:{...p.view.run,target:{...p.view.run.target,url}}}}),{code:'E_AI_OUTCOME_UNKNOWN'});
  }
  await assert.rejects(compileWorkflow(workflow([{...fill,waitUntil:'load'}])),{code:'E_WORKFLOW_SCHEMA'});
});
test('admitted Google search freezes one durable query navigation despite autocomplete duplicate buttons',async()=>{
  for(const path of ['/', '/webhp?hl=en']){
    const googleOrigin='https://www.google.com';
    const googleTarget={...target,origin:googleOrigin,url:googleOrigin+path};
    const observation={summary:{...searchObservation.summary,origin:googleOrigin}};
    const w={...workflow([{...fill,text:'OpenDesk'},
      {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]),siteOrigin:googleOrigin};
    const original=await compileWorkflow(w,{verifyFill:true});
    const admitted=prepareDirectExecution({request:'搜索 OpenDesk',workflow:w,target:googleTarget,observation});
    assert.deepEqual(admitted.searchNavigation,{kind:'search-results-v1',query:'OpenDesk',origin:googleOrigin});
    // Match the production caller: clone the admitted proposal, compile, then
    // claim the exact compiled workflow rather than separate navigation hints.
    const frozen=await compileWorkflow(structuredClone(w),{verifyFill:true});
    const guard=createWorkflowAgentLoopGuard({goal:'搜索 OpenDesk'});
    const ticket=guard.claim({workflow:frozen.workflow,target:googleTarget,observation});
    const click=frozen.workflow.steps.at(-1);
    assert.equal(click.searchNavigation,'google-query-v1');
    assert.equal(ticket.steps.at(-1).searchNavigation,click.searchNavigation);
    assert.equal(click.waitUntil,'domcontentloaded');
    assert.equal(click.timeout,15000);
    assert.equal(ticket.steps.at(-1).waitUntil,click.waitUntil);
    assert.equal(ticket.steps.at(-1).timeout,click.timeout);
    assert.deepEqual(JSON.parse(ticket.signature)[1].at(-1),
      (({stepId,...action})=>action)(ticket.steps.at(-1)));
    assert.notEqual(frozen.sourceHash,original.sourceHash);
    const calls=[];
    await new Function('page','params',frozen.sourceUtf8+';return main();')({
      locator:()=>({fill:async value=>calls.push(['fill',value]),inputValue:async()=> 'OpenDesk'}),
      url:async()=>googleTarget.url,
      getByRole:()=>{throw Error('ambiguous Google buttons must not be clicked');},
      goto:async(url,options)=>calls.push(['goto',url,options])},{});
    assert.deepEqual(calls,[['fill','OpenDesk'],['goto','https://www.google.com/search?q=OpenDesk',{waitUntil:'domcontentloaded',timeout:15000}]]);
    assert.throws(()=>guard.claim({workflow:frozen.workflow,target:googleTarget,observation}),
      {code:'E_AGENT_NO_PROGRESS'});
  }
});
test('Google query navigation marker is trusted, origin bounded and safely parameterized',async()=>{
  const googleOrigin='https://www.google.com',googleTarget={...target,origin:googleOrigin,url:googleOrigin+'/'};
  const observation={summary:{...searchObservation.summary,origin:googleOrigin}};
  const query='OpenDesk & GitHub # browser';
  const w={...workflow([{...fill,text:query},{stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]),siteOrigin:googleOrigin};
  const admitted=prepareDirectExecution({request:'搜索 '+query,workflow:w,target:googleTarget,observation});
  assert.equal(admitted.effectExpectation.query,query);
  const {title,description,paramsSchema,steps}=w;
  assert.throws(()=>normalizeAiProposal({title,description,paramsSchema,steps},w),{code:'E_WORKFLOW_AI'});
  assert.equal(workflowForModel(w).steps.at(-1).searchNavigation,undefined);

  assert.throws(()=>prepareDirectExecution({request:'搜索 '+query,workflow:w,target:googleTarget,observation}),{code:'E_AI_REVIEW_REQUIRED'});
  const freeze=await compileWorkflow(w,{verifyFill:true}),calls=[];
  const page={locator:()=>({fill:async()=>{},inputValue:async()=>query}),url:async()=>googleTarget.url,
    goto:async url=>calls.push(url)};
  await new Function('page','params',freeze.sourceUtf8+';return main();')(page,{});
  const destination=new URL(calls[0]);
  assert.equal(destination.origin,googleOrigin);assert.equal(destination.pathname,'/search');
  assert.deepEqual([...destination.searchParams],[['q',query]]);
  page.url=async()=>googleOrigin+'/account';
  await assert.rejects(new Function('page','params',freeze.sourceUtf8+';return main();')(page,{}),/search entry changed/);
  assert.equal(calls.length,1,'changed entry never navigates');
  const forged={...w,siteOrigin:'https://www.google.com.evil.test'};
  await assert.rejects(compileWorkflow(forged),{code:'E_WORKFLOW_SCHEMA'});
});

test('Google readiness defaults preserve explicit readiness/timeout and only follow successful admission',()=>{
  const googleOrigin='https://www.google.com';
  const googleTarget={...target,origin:googleOrigin,url:googleOrigin+'/'};
  const observation={summary:{...searchObservation.summary,origin:googleOrigin}};
  for(const fields of [{timeout:12000},{waitUntil:'load'},{waitUntil:'domcontentloaded',timeout:20000}]){
    const w={...workflow([{...fill,text:'OpenDesk'},
      {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索',...fields}]),siteOrigin:googleOrigin};
    prepareDirectExecution({request:'搜索 OpenDesk',workflow:w,target:googleTarget,observation});
    assert.equal(w.steps.at(-1).waitUntil,fields.waitUntil??'domcontentloaded');
    assert.equal(w.steps.at(-1).timeout,fields.timeout??15000);
  }
  const refused={...workflow([{...fill,text:'OpenDesk'},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]),siteOrigin:googleOrigin};
  const before=structuredClone(refused);
  assert.throws(()=>prepareDirectExecution({request:'搜索 OpenDesk',workflow:refused,target:googleTarget}),
    {code:'E_AI_REVIEW_REQUIRED'});
  assert.deepEqual(refused,before);
});
test('readiness defaults do not change inline, non-homepage or lookalike searches',async()=>{
  for(const url of ['https://example.test/', 'https://www.google.com/search?q=prior',
    'https://www.google.com/other', 'https://www.google.com.evil.test/', 'http://www.google.com/']){
    const localOrigin=new URL(url).origin;
    const localTarget={...target,origin:localOrigin,url};
    const observation={summary:{...searchObservation.summary,origin:localOrigin}};
    const w={...workflow([{...fill,text:'OpenDesk'},
      {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]),siteOrigin:localOrigin};
    const before=await compileWorkflow(w);
    const admitted=prepareDirectExecution({request:'搜索 OpenDesk',workflow:w,target:localTarget,observation});
    assert.equal(admitted.searchNavigation,null);
    assert.equal(w.steps.at(-1).waitUntil,undefined);
    assert.equal((await compileWorkflow(w)).sourceHash,before.sourceHash);
  }
});
test('reading Google input and search controls does not request fills or clicks',()=>{
  const request='请读取当前 Google 网页，识别搜索输入框和搜索按钮，告诉我它们的作用，不要修改网页。';
  const read=workflow([{stepId:'read',op:'observe'}]);
  assert.doesNotThrow(()=>prepareDirectExecution({request,workflow:read,target}));
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([
    {stepId:'field',op:'extract',locatorKind:'role',selector:'textbox',roleName:'搜索'},
    {stepId:'button',op:'extract',locatorKind:'role',selector:'button',roleName:'搜索'}]),target}),
    {code:'E_AI_MISSING_ACTION'});
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([
    {...fill,text:'Google'}]),target}),{code:'E_AI_UNREQUESTED_ACTION'});
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]),
    target,observation:searchObservation}),{code:'E_AI_UNREQUESTED_ACTION'});
});
test('only the current observed editable search combobox admits a grounded fill',()=>{
  const step={...fill,locatorKind:'role',selector:'combobox',roleName:'搜索',text:'OpenDesk'};
  const observation={summary:{origin,documentId:target.documentId,nodes:[{
    role:'combobox',name:'搜索',state:{visible:true,disabled:false,readOnly:false},
    locator:{kind:'role',value:'combobox',name:'搜索',exact:true}}]}};
  const run=observed=>prepareDirectExecution({request:'填入 OpenDesk，不要点击',
    workflow:workflow([step]),target,observation:observed});
  assert.doesNotThrow(()=>run(observation));
  for(const alter of [x=>x.summary.documentId='old',x=>x.summary.origin='https://other.test',
    x=>x.summary.nodes[0].state.readOnly=true,x=>x.summary.nodes[0].state.disabled=true,
    x=>x.summary.nodes[0].state.visible=false,x=>x.summary.nodes[0].locator.exact=false]){
    const stale=structuredClone(observation);alter(stale);
    assert.throws(()=>run(stale),{code:'E_AI_REVIEW_REQUIRED'});
  }
  assert.throws(()=>run(null),{code:'E_AI_REVIEW_REQUIRED'});
});
test('control-identification words inside a fill literal do not require an extra observation',()=>{
  const text='识别搜索输入框和搜索按钮';
  assert.doesNotThrow(()=>prepareDirectExecution({
    request:'请在搜索框填入「'+text+'」，不要点击搜索。',
    workflow:workflow([{...fill,text}]),target}));
});
test('observed prefixed search labels admit one search but never unobserved or sensitive buttons',()=>{
  const search={stepId:'search',op:'click',locatorKind:'css',selector:'body > form:nth-of-type(1) > input:nth-of-type(2)'};
  const w=workflow([{...fill,text:'OpenDesk'},search]);
  const make=name=>({summary:{origin,documentId:target.documentId,nodes:[{
    role:'button',name,state:{visible:true},locator:{kind:'css',value:search.selector}}]}});
  for(const name of ['Google 搜索','Site Search'])assert.equal(prepareDirectExecution({
    request:'搜索 OpenDesk',workflow:w,target,observation:make(name)}).effectExpectation.query,'OpenDesk');
  for(const observation of [null,make('Delete Search'),make('付款 搜索'),
    {...make('Google 搜索'),summary:{...make('Google 搜索').summary,documentId:'old'}}])
    assert.throws(()=>prepareDirectExecution({request:'搜索 OpenDesk',workflow:w,target,observation}),
      {code:'E_AI_REVIEW_REQUIRED'});
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
test('a single send may fill and click search, but literals cannot authorize extra actions',()=>{
  const search=workflow([{...fill,text:'OpenDesk'},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]);
  const requested=prepareDirectExecution({
    request:'在搜索框填入 OpenDesk，然后点击搜索按钮',workflow:search,target,
    observation:searchObservation
  });
  // Natural language search does not need to say "fill" explicitly.
  const natural=prepareDirectExecution({
    request:'搜索 OpenDesk',workflow:search,target,observation:searchObservation
  });
  assert.equal(natural.hasReadback,true);
  assert.deepEqual(natural.effectExpectation,{kind:'search-results-v1',query:'OpenDesk'});
  assert.throws(()=>prepareDirectExecution({
    request:'搜索 OpenDesk',workflow:search,target,observation:undefined
  }),{code:'E_AI_REVIEW_REQUIRED'});
  assert.throws(()=>prepareDirectExecution({
    request:'搜索 OpenDesk',workflow:workflow([{...fill,text:'OpenDesk'}]),target
  }),{code:'E_AI_MISSING_ACTION'});
  assert.equal(requested.hasReadback,true);
  assert.equal(requested.hasUnprovenClick,true);
  const extra=workflow([fill,{stepId:'click1',op:'click',locatorKind:'css',selector:'#safe-button'}]);
  assert.throws(()=>prepareDirectExecution({request:'填入 ai自动化第一选择',workflow:extra,target}),
    {code:'E_AI_UNREQUESTED_ACTION'});
  assert.throws(()=>prepareDirectExecution({request:'在搜索框填入 OpenDesk',workflow:search,target}),
    {code:'E_AI_UNREQUESTED_ACTION'});
  const hiddenRead=workflow([fill,{stepId:'observe',op:'observe'}]);
  assert.throws(()=>prepareDirectExecution({request:'填写 ai自动化第一选择',workflow:hiddenRead,target}),
    {code:'E_AI_UNREQUESTED_ACTION'});
  const afterAssert=workflow([...search.steps,{stepId:'assert',op:'assert',locatorKind:'css',
    selector:'#result',text:'OpenDesk'}]);
  assert.throws(()=>prepareDirectExecution({
    request:'填入 OpenDesk 并点击搜索按钮',workflow:afterAssert,target
  }),{code:'E_AI_REVIEW_REQUIRED'}); // A stale Document cannot license a post-click assert.
});
test('a harmless fill can contain a sensitive-sounding literal without granting effects',()=>{
  const plain=workflow([{...fill,text:'删除'}]);
  assert.equal(prepareDirectExecution({request:'在搜索框填写 删除',workflow:plain,target}).hasReadback,true);
});
test('sensitive click targets and unintended fills are rejected',()=>{
  const dangerous=workflow([{stepId:'danger',op:'click',locatorKind:'css',selector:'#confirm-order'}]);
  assert.throws(()=>prepareDirectExecution({request:'点击确认按钮',workflow:dangerous,target}),
    {code:'E_AI_REVIEW_REQUIRED'});
  assert.throws(()=>prepareDirectExecution({request:'点击预览按钮 ai自动化第一选择',workflow:workflow([fill]),target}),
    {code:'E_AI_UNREQUESTED_ACTION'});
});
test('submit in a CSS id needs fresh observed search semantics, not blanket submission authority',()=>{
  const click={stepId:'search',op:'click',locatorKind:'css',selector:'#search-submit'};
  const w=workflow([click]),request='点击搜索按钮';
  const node={role:'button',name:'搜索',state:{visible:true},locator:{kind:'css',value:click.selector}};
  const observation={summary:{origin,documentId:target.documentId,nodes:[node]}};
  assert.equal(prepareDirectExecution({request,workflow:w,target,observation}).hasUnprovenClick,true);
  for(const invalid of [undefined,
    {summary:{...observation.summary,documentId:'old-doc'}},
    {summary:{...observation.summary,origin:'https://other.test'}},
    ...[{name:'提交订单'},{role:'link'},{state:{visible:false}},
      {locator:{...node.locator,index:0}},{locator:{...node.locator,parent:'#form'}}]
      .map(change=>({summary:{...observation.summary,nodes:[{...node,...change}]}}))
  ])assert.throws(()=>prepareDirectExecution({request,workflow:w,target,observation:invalid}),
    {code:'E_AI_REVIEW_REQUIRED'});
  const danger={...click,selector:'#delete-submit'};
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([danger]),target,
    observation:{summary:{...observation.summary,nodes:[{...node,locator:{kind:'css',value:danger.selector}}]}}}),
    {code:'E_AI_REVIEW_REQUIRED'});
});
test('durable proof binds matching run/document/source/worker retirement',()=>{
  const r=proof();assert.deepEqual(verifyDirectExecutionReceipt(r),{runId:'run-1',resultId:'result-1',sourceHash:hash});
  for(const invalid of [
    {...r,completed:{...r.completed,retirement:{state:'pending'}}},
    {...r,claim:{...r.claim,revision:{sourceHash:'b'.repeat(64)}}},
    {...r,view:{...r.view,results:[]}},
    {...r,view:{...r.view,run:{...r.view.run,target:{...r.view.run.target,documentId:'other'}}}},
    {...r,claim:{...r.claim,resultId:'foreign-result'}},
    {...r,view:{...r.view,run:{...r.view.run,resultId:'foreign-result'}}},
    {...r,view:{...r.view,results:[{...r.view.results[0],resultId:'foreign-result'}]}},
    {...r,completed:{...r.completed,result:{...r.completed.result,resultId:'foreign-result'}}},
    {...r,view:{...r.view,run:{...r.view.run,target:{...r.view.run.target,tabId:99}}}},
    {...r,view:{...r.view,run:{...r.view.run,target:{...r.view.run.target,url:origin+'/other'}}}},
    {...r,view:{...r.view,results:[{...r.view.results[0],state:'failed'}]}}
  ])assert.throws(()=>verifyDirectExecutionReceipt(invalid),{code:'E_AI_OUTCOME_UNKNOWN'});
});

test('instruction sentence punctuation is not a terminal fill literal unless explicitly quoted',()=>{
  const request='在当前网页的搜索关键词输入框里填入 ai自动化第一选择。';
  assert.equal(prepareDirectExecution({request,workflow:workflow([fill]),target}).hasReadback,true);
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([{...fill,text:fill.text+'。'}]),target}),
    {code:'E_AI_VALUE_NOT_GROUNDED'});
  assert.equal(prepareDirectExecution({request:'在搜索关键词输入框填入“'+fill.text+'。”。',
    workflow:workflow([{...fill,text:fill.text+'。'}]),target}).hasReadback,true);
});
test('input textContent assertions are refused before the fill dispatch; host readback verifies values',()=>{
  const assertion={...fill,stepId:'assert-input',op:'assert'};
  assert.throws(()=>prepareDirectExecution({request:'填入 ai自动化第一选择',
    workflow:workflow([fill,assertion]),target}),{code:'E_AI_ASSERT_TARGET'});
  assert.throws(()=>prepareDirectExecution({request:'填入 ai自动化第一选择',
    workflow:workflow([fill,{...assertion,roleName:'模型附加的无效名称'}]),target}),{code:'E_AI_ASSERT_TARGET'});
});

test('core actions must be complete and search field labels do not authorize clicks',()=>{
  const click={stepId:'click-1',op:'click',locatorKind:'css',selector:'#click-button'};
  assert.throws(()=>prepareDirectExecution({request:'在当前网页的搜索关键词输入框里填入 ai自动化第一选择。',
    workflow:workflow([fill,click]),target}),{code:'E_AI_UNREQUESTED_ACTION'});
  assert.throws(()=>prepareDirectExecution({request:'点击网页中的“点击一次”按钮。',
    workflow:workflow([{stepId:'assert-1',op:'assert',locatorKind:'css',selector:'#click-count',text:'0'}]),target}),
    {code:'E_AI_MISSING_ACTION'});
  const openDesk={...fill,text:'OpenDesk'};
  assert.throws(()=>prepareDirectExecution({request:'在搜索关键词输入框填入 OpenDesk，然后点击搜索按钮。',
    workflow:workflow([openDesk]),target}),{code:'E_AI_MISSING_ACTION'});
  assert.equal(prepareDirectExecution({request:'在搜索关键词输入框填入 OpenDesk，然后点击搜索按钮。',
    workflow:workflow([openDesk,{...click,locatorKind:'role',selector:'button',roleName:'搜索'}]),target,
    observation:searchObservation}).hasReadback,true);
});

for(const [request,value] of [
  ['请把当前测试网页中的姓名输入框填写为“测试甲”，然后读取输入框的实际值确认。不要提交表单，不要跳转页面。','测试甲'],
  ['把刚才的姓名改成“测试乙”，再读取确认，不要提交，不要跳转。','测试乙'],
  ['Fill the name with "Test A", then read it. Do not submit the form, do not navigate.','Test A']
])test('negated clicks do not block the requested fill and read: '+value,()=>{
  const steps=[{...fill,selector:'#name',text:value},{stepId:'read',op:'extract',locatorKind:'css',selector:'#name'}];
  assert.equal(prepareDirectExecution({request,workflow:workflow(steps),target}).hasReadback,true);
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([...steps,
    {stepId:'extra',op:'click',locatorKind:'css',selector:'#safe-button'}]),target}),
  {code:'E_AI_UNREQUESTED_ACTION'});
});

test('a negated submit does not hide an affirmative click in another clause',()=>{
  assert.throws(()=>prepareDirectExecution({request:'填写 OpenDesk，不要提交，然后点击预览按钮。',
    workflow:workflow([{...fill,text:'OpenDesk'}]),target}),{code:'E_AI_MISSING_ACTION'});
});

for(const request of [
  '填写 OpenDesk，不要提交但点击预览按钮。',
  '填写 OpenDesk，不要提交然后点击预览按钮。',
  'Fill OpenDesk. Do not submit but click Preview.'
])test('an affirmative click after an unpunctuated transition remains required: '+request,()=>{
  assert.throws(()=>prepareDirectExecution({request,workflow:workflow([{...fill,text:'OpenDesk'}]),target}),
    {code:'E_AI_MISSING_ACTION'});
});

test('proposal, durable receipt, and observed input effect remain different evidence levels',()=>{
  assert.equal(directExecutionEvidenceLevel(), 'PROPOSAL_VALID');
  assert.equal(directExecutionEvidenceLevel({receiptVerified:true}), 'EXECUTION_RECEIPT_VERIFIED');
  assert.equal(directExecutionEvidenceLevel({receiptVerified:true,hasReadback:true}),
    'BUSINESS_EFFECT_VERIFIED');
  assert.equal(directExecutionEvidenceLevel({receiptVerified:true,hasReadback:true,
    hasUnprovenClick:true}), 'EXECUTION_RECEIPT_VERIFIED');
});


test('a final observed search button exposes only a bounded effect expectation',()=>{
  const searchClick={stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'};
  const w=workflow([{...fill,text:'OpenDesk'},searchClick]);
  const observation={summary:{origin,documentId:target.documentId,nodes:[
    {role:'button',name:'搜索',state:{visible:true},
      locator:{kind:'role',value:'button',name:'搜索'}}
  ]}};
  const accepted=prepareDirectExecution({request:'在搜索框填入 OpenDesk 并点击搜索',
    workflow:w,target,observation});
  assert.deepEqual(accepted.effectExpectation,{kind:'search-results-v1',query:'OpenDesk'});
  assert.throws(()=>prepareDirectExecution({request:'在搜索框填入 OpenDesk 并点击搜索',
    workflow:w,target}),{code:'E_AI_REVIEW_REQUIRED'});
  assert.equal(prepareDirectExecution({request:'在搜索框填入 OpenDesk',
    workflow:workflow([{...fill,text:'OpenDesk'}]),target}).effectExpectation,null);
  assert.throws(()=>prepareDirectExecution({request:'在搜索框填入 OpenDesk 并点击搜索',
    workflow:workflow([searchClick,{...fill,text:'OpenDesk'}]),target,observation}),
  {code:'E_AI_REVIEW_REQUIRED'});
});

test('direct fill proof checks decoded readback values for every step',()=>{
  const w=workflow([{...fill,text:'OpenDesk'},{...fill,stepId:'fill-2',selector:'#second',text:'Desk'}]);
  const values={'fill-1':{kind:'input-readback',matched:true,value:'OpenDesk'},
    'fill-2':{kind:'input-readback',matched:true,value:'Desk'}};
  assert.equal(verifyDirectFillReadbacks({workflow:w,values}),true);
  for(const bad of [
    {'fill-1':values['fill-1']},
    {...values,'fill-2':{...values['fill-2'],value:'unexpected'}},
    {...values,'fill-2':{...values['fill-2'],matched:false}},
    {...values,'fill-1':{kind:'assert',matched:true,value:'OpenDesk'}},
  ])assert.equal(verifyDirectFillReadbacks({workflow:w,values:bad}),false);
  assert.equal(verifyDirectFillReadbacks({workflow:workflow([]),values}),false);
});

test('search oracle requires a new visible result state and a verified post-click observation',()=>{
  const before={format:'opendesk.workflow-observation.v1',runId:'observe-before',
    resultId:'result-before',sourceHash:hash,summary:{origin,documentId:target.documentId,
    nodes:[{role:'link',name:'Home',state:{visible:true},locator:{kind:'role',value:'link',name:'Home'}}]}};
  const resultTarget={...target,documentId:'doc-results',url:origin+'/search?q=OpenDesk'};
  const resultLink={role:'link',name:'OpenDesk documentation',state:{visible:true},
    locator:{kind:'role',value:'link',name:'OpenDesk documentation'}};
  const resultHeading={role:'heading',name:'Search results',state:{visible:true}};
  const after={format:'opendesk.workflow-observation.v1',runId:'observe-after',resultId:'result-after',
    sourceHash:hash,summary:{origin,documentId:resultTarget.documentId,
      nodes:[resultHeading,resultLink]}};
  const args={expectation:{kind:'search-results-v1',query:'OpenDesk'},
    before,after,actionTarget:target,resultTarget};
  assert.deepEqual(verifySearchBusinessEffect(args),
    {kind:'search-results',visibleResultLinks:1});
  for(const bad of [
    {...args,resultTarget:{...resultTarget,tabId:99}},
    {...args,resultTarget:{...resultTarget,origin:'https://evil.test'}},
    {...args,after:{...after,runId:null}},
    {...args,before:{...before,resultId:null}},
    {...args,after:{...after,runId:before.runId}},
    {...args,after:{...after,resultId:before.resultId}},
    {...args,after:{...after,sourceHash:'b'.repeat(64)}},
    {...args,before:{...before,sourceHash:'b'.repeat(64)}},
    {...args,before:{...before,sourceHash:'bad-hash'}},
    {...args,after:{...after,summary:{...after.summary,documentId:'other'}}},
    {...args,after:{...after,summary:{...after.summary,nodes:[resultLink]}}},
    {...args,after:{...after,summary:{...after.summary,nodes:[resultHeading]}}},
    {...args,resultTarget:{...resultTarget,url:origin+'/search?q=Different'}},
    {...args,before:{summary:{...before.summary,documentId:'old-doc'}}}
  ])assert.equal(verifySearchBusinessEffect(bad),null);
  const empty={...after,summary:{...after.summary,nodes:[
    {role:'status',name:'没有找到搜索结果',state:{visible:true}}]}};
  assert.deepEqual(verifySearchBusinessEffect({...args,after:empty}),
    {kind:'search-empty',visibleResultLinks:0});
  const unchanged={...args,resultTarget:target,after:{...after,summary:{
    ...after.summary,documentId:target.documentId}}};
  assert.equal(verifySearchBusinessEffect(unchanged),null);
});

test('search evidence does not promote an unverified run or unrelated click',()=>{
  assert.equal(directExecutionEvidenceLevel({
    receiptVerified:true,hasUnprovenClick:true,searchEffectVerified:true
  }),'BUSINESS_EFFECT_VERIFIED');
  assert.equal(directExecutionEvidenceLevel({
    receiptVerified:false,hasUnprovenClick:true,searchEffectVerified:true
  }),'PROPOSAL_VALID');
  assert.equal(directExecutionEvidenceLevel({
    receiptVerified:true,hasUnprovenClick:true,hasReadback:true
  }),'EXECUTION_RECEIPT_VERIFIED');
});


test('AI-off runs prove the same frozen revision across claim, completion and durable records',()=>{
  const r=proof(),revision={scriptId:'wf-frozen',revision:3,sourceHash:hash};
  const source={kind:'saved',scriptId:'wf-frozen',revision:3,contentHash:hash};
  r.claim.revision=revision;r.completed.result.revision=revision;
  r.view.run.revision=revision;r.view.results[0].revision=revision;
  assert.equal(verifySavedWorkflowRevision({...r,source,result:r.view.results[0]}),true);
  for(const wrong of [
    {...r,source:{...source,revision:2},result:r.view.results[0]},
    {...r,source:{...source,contentHash:'b'.repeat(64)},result:r.view.results[0]},
    {...r,source:{...source,kind:'draft'},result:r.view.results[0]},
    {...r,claim:{...r.claim,revision:{...revision,scriptId:'foreign'}},result:r.view.results[0]},
    {...r,completed:{...r.completed,result:{...r.completed.result,revision:{...revision,revision:4}}},
      result:r.view.results[0]},
    {...r,view:{...r.view,run:{...r.view.run,revision:{...revision,sourceHash:'b'.repeat(64)}}},
      result:r.view.results[0]},
    {...r,result:{...r.view.results[0],revision:{...revision,revision:2}}}
  ])assert.equal(verifySavedWorkflowRevision(wrong),false);
});


test('continuation: view search results reads the page without replaying search',()=>{
  const read=workflow([{stepId:'read-results',op:'observe'}]);
  const request='查看搜索结果';
  const p=prepareDirectExecution({request,workflow:read,target});
  assert.deepEqual(p.params,{});
  assert.equal(p.hasUnprovenClick,false);
  assert.equal(p.hasReadback,false);
  const repeat=workflow([{stepId:'search-again',op:'click',locatorKind:'role',
    selector:'button',roleName:'搜索'}]);
  assert.throws(()=>prepareDirectExecution({request,workflow:repeat,target}),
    {code:'E_AI_UNREQUESTED_ACTION'});
});

test('trusted same-document search proves demo-form inline result without fabricating links',()=>{
  const locator={kind:'css',value:'[id="results"]'};
  const beforeNodes=[{role:null,text:'',state:{visible:true},locator}];
  const status={role:'status',name:'搜索完成',text:'搜索完成',
    state:{visible:true},locator:{kind:'css',value:'[id="search-status"]'}};
  const result={role:null,name:'',text:'结果：OpenDesk',state:{visible:true},locator};
  const afterNodes=[status,result];
  const before={format:'opendesk.workflow-observation.v1',runId:'before-run',
    resultId:'before-result',sourceHash:hash,
    summary:{origin,documentId:target.documentId,nodes:beforeNodes}};
  const after={format:'opendesk.workflow-observation.v1',runId:'after-run',
    resultId:'after-result',sourceHash:hash,
    summary:{origin,documentId:target.documentId,nodes:afterNodes}};
  const args={expectation:{kind:'search-results-v1',query:'OpenDesk'},before,after,
    actionTarget:target,resultTarget:target};
  assert.deepEqual(verifySearchBusinessEffect(args),{kind:'search-inline'});
  for(const invalid of [
    {...args,after:{...after,summary:{...after.summary,nodes:[result]}}},
    {...args,after:{...after,summary:{...after.summary,nodes:[
      status,{...result,text:'结果：Other'}]}}},
    {...args,before:{...before,summary:{...before.summary,nodes:afterNodes}}},
    {...args,before:{...before,summary:{...before.summary,nodes:[]}}},
    {...args,after:{...after,sourceHash:''}},
    {...args,after:{...after,summary:{...after.summary,nodes:[
      status,{...result,state:{visible:false}}]}}},
    {...args,resultTarget:{...target,documentId:'different'}},
    {...args,resultTarget:{...target,url:origin+'/other'}},
    {...args,after:{...after,summary:{...after.summary,nodes:[
      status,{...result,locator:{...locator,parent:{kind:'css',value:'#else'}}}]}}}
  ])assert.equal(verifySearchBusinessEffect(invalid),null);
});

test('current observed named link admits one frozen href-guarded RunHost navigation only',async()=>{
  const name='OpenDesk Browser',href='?detail=browser';
  const finalUrl=new URL(href,target.url).href;
  const click={stepId:'open-result',op:'click',locatorKind:'role',
    selector:'link',roleName:name};
  const node={role:'link',name,state:{visible:true,disabled:false},
    locator:{kind:'role',value:'link',name,exact:true},
    navigation:{href,url:finalUrl,origin}};
  const summary={summary:{origin,documentId:target.documentId,nodes:[node]}};
  const steps=workflow([click]);
  const admitted=prepareDirectExecution({
    request:'打开 OpenDesk Browser 并读取网页标题',
    workflow:steps,target,observation:summary});
  assert.equal(admitted.linkGuard.name,name);
  assert.equal(admitted.linkGuard.url,finalUrl);
  const frozen=workflow([{...click,linkGuard:admitted.linkGuard}]);
  const compiled=await compileWorkflow(frozen);
  assert.match(compiled.sourceUtf8,/Workflow link changed/);
  assert.match(compiled.sourceUtf8,/a\[href=/);
  assert.match(compiled.sourceUtf8,/page\.goto/);
  assert.doesNotMatch(compiled.sourceUtf8,/\.click\(/);
  assert.throws(()=>prepareDirectExecution({
    request:'打开 OpenDesk Browser',workflow:frozen,target,observation:summary
  }),{code:'E_AI_REVIEW_REQUIRED'}); // A model cannot borrow a prior proof.
  for(const invalid of [
    {...summary,summary:{...summary.summary,documentId:'old-doc'}},
    {...summary,summary:{...summary.summary,nodes:[{...node,state:{visible:false}}]}},
    {...summary,summary:{...summary.summary,nodes:[{...node,locator:{...node.locator,index:0}}]}},
    {...summary,summary:{...summary.summary,nodes:[{...node,navigation:{...node.navigation,
      href:'https://evil.test/?token=abc',url:'https://evil.test/?token=abc',origin:'https://evil.test'}}]}},
    {...summary,summary:{...summary.summary,nodes:[node,node]}}
  ])assert.throws(()=>prepareDirectExecution({request:'打开 OpenDesk Browser',
    workflow:steps,target,observation:invalid}),{code:'E_AI_REVIEW_REQUIRED'});
  assert.throws(()=>prepareDirectExecution({request:'打开第一个结果',
    workflow:steps,target,observation:summary}),{code:'E_AI_REVIEW_REQUIRED'});
});
test('verified links use one navigation handoff and reject changed DOM before dispatch',async()=>{
  const guard={name:'Camera X',href:'?product=camera-x',
    url:origin+'/form?product=camera-x',origin,sourceUrl:target.url,
    locatorKind:'role',selector:'link',roleName:'Camera X'};
  for(const dynamic of [false,true]) {
    const w=workflow([{stepId:'product',op:'click',locatorKind:'role',selector:'link',
      roleName:'Camera X',linkGuard:guard,...(dynamic?{param:'productName'}:{})}]);
    if(dynamic)w.paramsSchema={type:'object',properties:{productName:{
      type:'string',title:'目标商品',default:'Camera X'}},required:['productName'],additionalProperties:false};
    const frozen=await compileWorkflow(w);
    const execute=new Function('page','params',frozen.sourceUtf8+'; return main();');
    const calls=[];
    let href=guard.href,count=1;
    const locator={count:async()=>count,getAttribute:async()=>href,
      click:async()=>assert.fail('A locator click would lose the old Document receipt')};
    const page={url:async()=>guard.sourceUrl,getByRole:()=>locator,locator:()=>locator,
      goto:async url=>{calls.push(url);}};
    const params={productName:guard.name,__odLinks:{product:{...guard}}};
    await execute(page,params);
    assert.deepEqual(calls,[guard.url]);
    calls.length=0;href='?product=other';
    await assert.rejects(execute(page,params),/link changed/);
    assert.deepEqual(calls,[]);
    href=guard.href;count=2;
    await assert.rejects(execute(page,params),/link changed/);
    assert.deepEqual(calls,[]);
    if(dynamic){
      count=1;href='https://evil.test/product';
      params.__odLinks.product.href=href;
      await assert.rejects(execute(page,params),/origin changed/);
      assert.deepEqual(calls,[]);
    }
  }
});

test('navigation receipts bind the original claim and exact durable destination without weakening replacement fences',()=>{
  const navigationTarget={url:origin+'/product/camera-x',origin};
  const p=proof();p.claim.target={...p.claim.target,targetVersion:1};
  p.view.run.target={...p.claim.target,documentId:'new-doc',url:navigationTarget.url,targetVersion:2};
  assert.equal(verifyDirectExecutionReceipt({...p,navigationTarget}).runId,'run-1');
  assert.throws(()=>verifyDirectExecutionReceipt(p),{code:'E_AI_OUTCOME_UNKNOWN'});
  for(const changed of [
    {documentId:target.documentId},{url:origin+'/product/other'},
    {allowedOrigin:'https://evil.test'},{tabId:99},{windowId:99},
    {frameId:1},{targetVersion:1},{targetVersion:3}
  ])assert.throws(()=>verifyDirectExecutionReceipt({...p,navigationTarget,
    view:{...p.view,run:{...p.view.run,target:{...p.view.run.target,...changed}}}}),
    {code:'E_AI_OUTCOME_UNKNOWN'});
  assert.throws(()=>verifyDirectExecutionReceipt({...p,navigationTarget,
    claim:{...p.claim,target:{...p.claim.target,documentId:'unrelated'}}}),
    {code:'E_AI_OUTCOME_UNKNOWN'});
  assert.throws(()=>verifyDirectExecutionReceipt({...p,navigationTarget,
    view:{...p.view,run:{...p.view.run,state:'stopped'}}}),{code:'E_AI_OUTCOME_UNKNOWN'});
});

test('only independently observed new Document title and product price prove navigation',()=>{
  const linkGuard={name:'OpenDesk Browser',href:'?detail=browser',
    url:origin+'/form?detail=browser',origin,sourceUrl:target.url,
    locatorKind:'role',selector:'link',roleName:'OpenDesk Browser'};
  const after={format:'opendesk.workflow-observation.v1',runId:'observation-2',
    resultId:'receipt-2',sourceHash:hash,
    summary:{origin,documentId:'doc-after',title:'OpenDesk Browser 详情',
      nodes:[
        {role:'heading',name:'OpenDesk Browser',state:{visible:true}},
        {role:null,name:'',text:'¥129.00',state:{visible:true}}]}};
  const resultTarget={...target,documentId:'doc-after',url:linkGuard.url};
  assert.deepEqual(verifyOpenedLinkPage({linkGuard,after,actionTarget:target,resultTarget}),
    {kind:'product-page',title:'OpenDesk Browser 详情',name:'OpenDesk Browser',price:'¥129.00'});
  assert.deepEqual(verifyOpenedLinkPage({linkGuard,after:{...after,
    summary:{...after.summary,nodes:[]}},actionTarget:target,resultTarget}),
    {kind:'link-page',title:'OpenDesk Browser 详情'});
  for(const changed of [
    {resultTarget:target},
    {resultTarget:{...resultTarget,tabId:4}},
    {resultTarget:{...resultTarget,url:origin+'/wrong'}},
    {resultTarget:{...resultTarget,origin:'https://elsewhere.test'}},
    {after:{...after,runId:''}},
    {after:{...after,summary:{...after.summary,documentId:target.documentId}}},
    {after:{...after,summary:{...after.summary,title:'CAPTCHA'}}}
  ])assert.equal(verifyOpenedLinkPage({linkGuard,after,actionTarget:target,
    resultTarget,...changed}),null);
});

test('Agent continuation admits only remaining actions, not first-round fill/search replay',()=>{
  const goal='填写 camera，搜索 camera，打开 Camera X 商品详情并核对价格';
  const first=workflow([{...fill,text:'camera'},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]);
  assert.equal(prepareDirectExecution({request:goal,workflow:first,target,
    observation:searchObservation}).effectExpectation.query,'camera');
  const link={stepId:'open-camera',op:'click',locatorKind:'role',selector:'link',roleName:'Camera X'};
  const href='/product/camera-x',destination=new URL(href,target.url).href;
  const observation={summary:{origin,documentId:target.documentId,nodes:[{
    role:'link',name:'Camera X',state:{visible:true,disabled:false},
    locator:{kind:'role',value:'link',name:'Camera X',exact:true},
    navigation:{href,url:destination,origin}}]}};
  assert.throws(()=>prepareDirectExecution({request:goal,workflow:workflow([link]),
    target,observation}),{code:'E_AI_MISSING_ACTION'});
  const admitted=prepareDirectExecution({request:goal,workflow:workflow([link]),
    target,observation,verifiedFacts:['input-readback','search-results']});
  assert.equal(admitted.linkGuard.name,'Camera X');
  assert.equal(admitted.linkGuard.url,destination);
  assert.throws(()=>prepareDirectExecution({request:'搜索 Camera X',
    workflow:workflow([link]),target,observation,
    verifiedFacts:['search-results']}),{code:'E_AI_UNREQUESTED_ACTION'});
  assert.throws(()=>prepareDirectExecution({request:'搜索 Camera X，不要打开 Camera X',
    workflow:workflow([link]),target,observation,
    verifiedFacts:['search-results']}),{code:'E_AI_UNREQUESTED_ACTION'});
  assert.throws(()=>prepareDirectExecution({request:goal,workflow:first,
    target,observation:searchObservation,
    verifiedFacts:['input-readback','search-results']}),{code:'E_AGENT_NO_PROGRESS'});
  assert.equal(prepareDirectExecution({request:'核对当前页面价格',
    workflow:workflow([{stepId:'extract-price',op:'extract',locatorKind:'css',selector:'.price'}]),
    target}).hasUnprovenClick,false);
});

test('a second explicitly named detail is not rejected merely because the first was read',()=>{
 const goal='打开 Camera X 和 Camera Y 商品详情并核对价格';
 const link={stepId:'second',op:'click',locatorKind:'role',selector:'link',roleName:'Camera Y'};
 const href='/product/camera-y',url=new URL(href,target.url).href;
 const observation={summary:{origin,documentId:target.documentId,nodes:[{
   role:'link',name:'Camera Y',state:{visible:true,disabled:false},
   locator:{kind:'role',value:'link',name:'Camera Y',exact:true},
   navigation:{href,url,origin}}]}};
 assert.equal(prepareDirectExecution({request:goal,workflow:workflow([link]),
   target,observation,verifiedFacts:['link-page','link-target:camera x',
     'product-page','product-target:camera x']}).linkGuard.name,'Camera Y');
});

test('second user-requested query is allowed but an identical search is not replayed',()=>{
 const w=workflow([{...fill,text:'lens'},
   {stepId:'search-lens',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]);
 const permitted=prepareDirectExecution({request:'搜索 camera，搜索 lens',
   workflow:w,target,observation:searchObservation,
   verifiedFacts:['input-readback','search-results','search-target:camera']});
 assert.equal(permitted.effectExpectation.query,'lens');
 assert.throws(()=>prepareDirectExecution({request:'搜索 camera，搜索 lens',
   workflow:workflow([{...fill,text:'camera'},w.steps[1]]),
   target,observation:searchObservation,
   verifiedFacts:['input-readback','search-results','search-target:camera']}),{code:'E_AGENT_NO_PROGRESS'});
});

test('completed search requires the verified prior query identity, regardless of regenerated Step IDs',()=>{
  const w=workflow([{...fill,stepId:'next-fill',text:'lens'},
    {stepId:'next-click',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]);
  const goal='搜索 camera，搜索 lens';
  assert.throws(()=>prepareDirectExecution({request:goal,workflow:w,target,
    observation:searchObservation,verifiedFacts:['input-readback','search-results']}),
    {code:'E_AGENT_NO_PROGRESS'});
  const duplicate=workflow([{...fill,stepId:'new-fill',text:'camera'},
    {stepId:'new-search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]);
  assert.throws(()=>prepareDirectExecution({request:goal,workflow:duplicate,target,
    observation:searchObservation,
    verifiedFacts:['input-readback','search-results','search-target:camera']}),
    {code:'E_AGENT_NO_PROGRESS'});
});
