import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {prepareDirectExecution,verifyDirectExecutionReceipt,directExecutionEvidenceLevel,verifyDirectFillReadbacks,verifySearchBusinessEffect,verifySavedWorkflowRevision} from '../../src/ui/workflow/direct-execution.js';
const origin='https://example.test';
const target={windowId:1,tabId:2,frameId:0,documentId:'doc-1',url:origin+'/form',origin};
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
    request:'在搜索框填入 OpenDesk，然后点击搜索按钮',workflow:search,target
  });
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
  assert.throws(()=>prepareDirectExecution({request:'点击搜索按钮 ai自动化第一选择',workflow:workflow([fill]),target}),
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
    workflow:workflow([openDesk,{...click,locatorKind:'role',selector:'button',roleName:'搜索'}]),target}).hasReadback,true);
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
  const unobserved=prepareDirectExecution({request:'在搜索框填入 OpenDesk 并点击搜索',
    workflow:w,target});
  assert.equal(unobserved.effectExpectation,null);
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
