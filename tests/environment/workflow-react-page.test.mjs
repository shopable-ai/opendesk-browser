import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {sealWorkflowBundle,replayParameterSchema,WORKFLOW_BUNDLE_FORMAT,
  WORKFLOW_DYNAMIC_BUNDLE_FORMAT,inferDynamicReplayPlan,simpleCommerceReplayGoal} from '../../src/ui/workflow/segment-replay.js';
const fill={stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',text:'OpenDesk'};
const get=(f,id)=>f.state().controls[id]||{};
test('workflow whole page declares DOM in TSX and adapter has no legacy renderer/listeners',async()=>{
  const [component,view]=await Promise.all(['src/ui/react/tabs/workflow.tsx','src/ui/workflow/workflow-view.js'].map(path=>readFile(path,'utf8')));
  assert.doesNotMatch(component,/dangerouslySetInnerHTML|innerHTML|MutationObserver|append\(settings\)/);
  assert.doesNotMatch(view,/createElement|replaceChildren|\.append\(|addEventListener\('(click|input|change)'|new Option|dispatchEvent/);
  assert.match(component,/export function WorkflowPage/);
  assert.match(component,/useSyncExternalStore/);
  const result=await transform(component,{loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(result.code.length>15000);
});
test('workflow normal execution preserves durable run, result, document and source identities',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  const result=await f.click('workflow-run');await tick();
  assert.equal(result.ok,true);assert.equal(result.runId,'workflow-run-1');
  assert.equal(result.resultId,'workflow-result-1');assert.equal(f.starts.length,1);
  assert.match(get(f,'workflow-output').text,/执行结果/);
  assert.match(get(f,'workflow-technical').text,/document-one/);
  assert.equal(f.state().lastRun,'success');
  assert.deepEqual(f.requests,[{origins:['https://workflow.example/*']}]);
});
test('workflow compiler failure clears old artifact and cannot execute it',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  // The compiler resolves asynchronously; this test must first prove the
  // original source is runnable before asserting that an invalid edit blocks it.
  for(let attempt=0;attempt<12&&get(f,'workflow-run').disabled;attempt++)await tick();
  assert.equal(get(f,'workflow-run').disabled,false);
  f.view.actions.editStep('one','op','confirm');await tick();await tick();
  assert.equal(get(f,'workflow-run').disabled,true);
  assert.match(get(f,'workflow-code').text,/E_WORKFLOW_CONFIRM_UNSUPPORTED/);
  await f.click('workflow-run');assert.equal(f.starts.length,0);
  f.view.actions.editStep('one','op','observe');await tick();await tick();
  assert.equal((await f.click('workflow-run')).ok,true);
});
test('workflow runtime error and Stop release controls and allow edit/run again',async t=>{
  const f=await workflowFixture({fail:true});t.after(()=>f.view.dispose());
  assert.equal((await f.click('workflow-run')).ok,false);await tick();
  assert.equal(f.state().lastRun,'failed');assert.match(get(f,'workflow-output').text,/E_FIXTURE/);
  f.service.hold=true;f.service.fail=false;
  const running=f.click('workflow-run');await tick();await tick();
  assert.equal(get(f,'workflow-stop').disabled,false);
  f.click('workflow-stop');assert.equal((await running).ok,false);await tick();
  assert.equal(f.stops.length,1);assert.equal(f.stops[0].runId,'workflow-run-2');
  assert.equal(f.stops[0].reason,'E_CANCELLED');assert.equal(get(f,'workflow-run').disabled,false);
  f.input('workflow-title','停止后编辑');f.service.hold=false;await tick();await tick();
  assert.equal((await f.click('workflow-run')).ok,true);
});
test('workflow save/reopen restores same source revision and rejects changed journal bytes',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  f.input('workflow-title','保存并重新打开');await tick();await tick();
  f.click('workflow-save');await tick();await tick();await tick();
  assert.equal(f.local.size,1);const [key,record]=[...f.local][0];
  assert.equal(record.workflow.title,'保存并重新打开');
  f.click('workflow-new');await tick();await tick();
  f.input('workflow-saved-list',key,'change');f.click('workflow-load');await tick();await tick();
  assert.equal(get(f,'workflow-title').value,'保存并重新打开');
  assert.equal(f.state().steps[0].op,'observe');
  const result=await f.click('workflow-run');assert.equal(result.ok,true);
  assert.equal(f.starts[0].source.kind,'saved');assert.equal(f.starts[0].source.revision,record.revision);
  f.service.corrupt=true;
  const rejected=await f.click('workflow-run');assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'E_WORKFLOW_HASH');
  assert.equal(f.starts.length,1);
});
test('ordinary manual fill is admitted by one trusted Run without a second confirmation',async t=>{
  const f=await workflowFixture({steps:[fill]});t.after(()=>f.view.dispose());
  await f.click('workflow-run',false);assert.equal(f.starts.length,0);assert.equal(f.requests.length,0);
  assert.equal(get(f,'workflow-run-review').hidden,true);
  const result=await f.click('workflow-run');assert.equal(result.ok,true);
  assert.equal(f.starts.length,1);assert.equal(f.requests.length,1);
  assert.equal(get(f,'workflow-run-review').hidden,true);
  await f.setPage({origin:'https://other.example'});
  assert.equal(get(f,'workflow-run').disabled,true);
  await f.click('workflow-run');assert.equal(f.starts.length,1);
});
test('unknown click requires scoped one-shot review, cancellation and untrusted gestures do not dispatch',async t=>{
  const click={stepId:'danger',op:'click',locatorKind:'css',selector:'#submit'};
  const f=await workflowFixture({steps:[fill,click]});t.after(()=>f.view.dispose());
  const first=await f.click('workflow-run');assert.equal(first.reviewRequired,true);
  assert.equal(get(f,'workflow-run-review').hidden,false);
  assert.match(get(f,'workflow-run-review-scope').text,/workflow.example.*#submit/);
  assert.equal(f.starts.length,0);assert.equal(f.requests.length,0);
  await f.click('workflow-run-review-confirm',false);assert.equal(f.starts.length,0);
  await f.click('workflow-run-review-cancel');assert.equal(get(f,'workflow-run-review').hidden,true);
  assert.equal(f.starts.length,0);assert.equal(f.requests.length,0);
  await f.click('workflow-run');
  const permitted=await f.click('workflow-run-review-confirm');
  assert.equal(permitted.ok,true);assert.equal(f.starts.length,1);
  assert.equal(f.requests.length,1);assert.equal(get(f,'workflow-run-review').hidden,true);
  await f.click('workflow-run-review-confirm');assert.equal(f.starts.length,1);
});
test('review closes on Document, edited step or revoked Chrome permission',async t=>{
  const click={stepId:'click',op:'click',locatorKind:'css',selector:'#unknown-button'};
  const f=await workflowFixture({steps:[click]});t.after(()=>f.view.dispose());
  await f.click('workflow-run');
  await f.setPage({documentId:'new-document'});
  assert.equal(get(f,'workflow-run-review').hidden,true);
  assert.equal(f.starts.length,0);assert.equal(f.requests.length,0);
  await f.click('workflow-run');
  f.view.actions.editStep('click','selector','#another-button');await tick();await tick();
  assert.equal(get(f,'workflow-run-review').hidden,true);
  await f.click('workflow-run');await f.revoke(['https://workflow.example/*']);
  assert.equal(get(f,'workflow-run-review').hidden,true);
  await f.click('workflow-run-review-confirm');assert.equal(f.starts.length,0);
  assert.equal(f.requests.length,0);
});
test('sensitive form fill requires explicit review even without a click',async t=>{
  const field={...fill,selector:'#payment-password',text:'删除'};
  const f=await workflowFixture({steps:[field]});t.after(()=>f.view.dispose());
  const result=await f.click('workflow-run');
  assert.equal(result.reviewRequired,true);
  assert.match(get(f,'workflow-run-review-scope').text,/payment-password/);
  assert.equal(f.starts.length,0);assert.equal(f.requests.length,0);
});
test('workflow cannot admit revoked permission or stale document after asynchronous journal read',async t=>{
  for(const variant of ['permission','document']) {
    const f=await workflowFixture();t.after(()=>f.view.dispose());
    f.click('workflow-save');await tick();await tick();await tick();
    f.service.beforeJournalRead=async()=>{
      f.service.beforeJournalRead=null;
      if(variant==='permission')f.permissions.clear();else f.target.documentId='document-replaced';
    };
    const result=await f.click('workflow-run');
    assert.equal(result.ok,false);assert.equal(f.starts.length,0);
    assert.equal(result.error.code,variant==='permission'?'E_PERMISSION':'E_DOCUMENT_STALE');
  }
});
test('workflow inconsistent result identity fails closed without replay',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());f.service.corruptResult=true;
  const result=await f.click('workflow-run');assert.equal(result.ok,false);
  assert.equal(f.starts.length,1);assert.equal(f.state().lastRun,'failed');
});
test('workflow dirty new/reopen protection retains draft until reviewed and resets review after edits',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  f.input('workflow-title','未保存');await tick();f.click('workflow-new');await tick();
  assert.equal(get(f,'workflow-new-review').hidden,false);
  f.click('workflow-new-discard',false);await tick();assert.equal(get(f,'workflow-title').value,'未保存');
  f.click('workflow-new-cancel');await tick();assert.equal(get(f,'workflow-title').value,'未保存');
  f.click('workflow-new');f.input('workflow-description','确认后又编辑');await tick();
  f.click('workflow-new-discard');await tick();assert.equal(get(f,'workflow-title').value,'未保存');
  f.click('workflow-new');f.click('workflow-new-discard');await tick();await tick();
  assert.equal(f.state().steps.length,0);assert.equal(get(f,'workflow-title').value,'新工作流');
});
test('workflow provider settings retain protocol and credentials remain memory-only; disposal unsubscribes',async()=>{
  const f=await workflowFixture();
  f.click('workflow-provider-toggle');await tick();
  f.click('workflow-source-https');f.input('workflow-https-protocol','cloud_responses','change');await tick();
  f.input('workflow-ai-key','not-persisted-test-secret');f.input('workflow-ai-model','test-model');await tick();
  f.click('workflow-source-local');f.click('workflow-source-https');await tick();
  assert.equal(get(f,'workflow-ai-provider').value,'cloud_responses');
  assert.equal(get(f,'workflow-ai-endpoint').value,'https://api.openai.com/v1/responses');
  assert.ok(!JSON.stringify([...f.session]).includes('not-persisted-test-secret'));
  assert.ok(!JSON.stringify([...f.local]).includes('not-persisted-test-secret'));
  let updates=0;const unsubscribe=f.view.subscribe(()=>updates++);f.input('workflow-title','订阅');await tick();assert.ok(updates>0);
  unsubscribe();const before=updates;f.input('workflow-title','已取消订阅');await tick();assert.equal(updates,before);
  f.view.dispose();assert.ok(Object.values(f.subscriptions).every(set=>set.size===0));
});

test('fixed fill becomes a Chinese parameter and repeated saved runs do not rewrite source',async t=>{
  const f=await workflowFixture({steps:[fill]});t.after(()=>f.view.dispose());
  f.view.actions.parameterizeStep('fill');await tick();await tick();
  const {name,rule,value}=f.state().params[0];
  assert.equal(name,'keyword');
  assert.equal(rule.title,'搜索关键词');
  assert.equal(value,'OpenDesk');
  assert.equal(f.state().steps[0].param,name);
  assert.equal(f.state().steps[0].text,undefined);
  f.click('workflow-save');await tick();await tick();await tick();
  assert.equal(f.local.size,1);
  const record=[...f.local.values()][0];
  const first=await f.click('workflow-run');assert.equal(first.ok,true);
  const frozenHash=f.starts[0].source.contentHash;
  assert.equal(f.starts[0].params[name],'OpenDesk');
  f.view.actions.setParam(name,'新关键词');await tick();
  const second=await f.click('workflow-run');assert.equal(second.ok,true);
  assert.equal(f.starts[1].params[name],'新关键词');
  assert.equal(f.starts[1].source.kind,'saved');
  assert.equal(f.starts[1].source.contentHash,frozenHash);
  assert.equal(record.sourceHash,frozenHash);
  assert.notEqual(first.runId,second.runId);
  assert.notEqual(first.resultId,second.resultId);
});
test('parameterizing sensitive fields never saves a secret as a default',async t=>{
  const secret={stepId:'secret',op:'fill',locatorKind:'css',selector:'#password',text:'EXAMPLE_SECRET_VALUE'};
  const f=await workflowFixture({steps:[secret]});t.after(()=>f.view.dispose());
  f.view.actions.parameterizeStep('secret');await tick();await tick();
  assert.equal(f.state().params[0].rule.default,undefined);
  assert.equal(f.state().params[0].value,'');
  assert.equal(f.state().steps[0].text,undefined);
});

test('full saved bundle loads from real Controller revisions and blocks stale entry without dispatch',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  await f.click('workflow-save');
  assert.equal(f.state().header.saved,true,'save must settle before history may replace a clean draft');
  const id='wf-44444444-3333-2222-1111-111111111111';
  const segments=[];
  for(let index=1;index<=2;index++){
    const workflow={format:'opendesk.workflow.v1',workflowId:id+'-s'+index,
      title:'完整只读示例',description:'',siteOrigin:f.target.origin,
      paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
      steps:[{stepId:'observe-'+index,op:'observe'}]};
    const freeze=await compileWorkflow(workflow);
    const rev=await f.host.controller.commitControllerScript({
      scriptId:workflow.workflowId,expectedRevision:0,sourceUtf8:freeze.sourceUtf8});
    assert.equal(rev.contentHash,freeze.sourceHash);
    segments.push({workflow,entryUrl:f.target.url,revision:rev.revision,
      sourceHash:freeze.sourceHash,verificationMode:'none',evidence:{kind:'read-only'},
      proof:{runId:'original-'+index,resultId:'receipt-'+index,
        sourceHash:freeze.sourceHash,origin:f.target.origin,documentId:'document-'+index}});
  }
  const record=await sealWorkflowBundle({format:WORKFLOW_BUNDLE_FORMAT,bundleId:id,
    revision:1,goal:'查看页面',title:'完整只读示例',
    workflow:{workflowId:id,title:'完整只读示例',siteOrigin:f.target.origin},
    segments,paramsSchema:replayParameterSchema(segments)});
  const key='opendesk.sidebar.workflow.v1:'+id+':1';
  f.local.set(key,record);await f.click('workflow-refresh');
  f.input('workflow-saved-list',key,'change');
  await f.click('workflow-load');
  assert.match(get(f,'workflow-status').text,/完整 2 段工作流/);
  assert.equal(f.state().header.saved,true);
  assert.match(f.state().header.savedTitle,/完整工作流/);
  await f.setPage({url:f.target.origin+'/unrelated'});
  const result=await f.click('workflow-run');
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'E_DOCUMENT_STALE');
  assert.equal(f.starts.length,0);
});


test('changed parameter on a legacy cross-navigation bundle fails before permission or RunHost dispatch',async t=>{
  const f=await workflowFixture();t.after(()=>f.view.dispose());
  // A dirty user draft correctly blocks history replacement: save it first.
  await f.click('workflow-save');
  assert.equal(f.state().header.saved,true,'save must settle before history may replace a clean draft');
  const id='wf-55555555-3333-2222-1111-111111111111';
  const shared={type:'object',properties:{query:{type:'string',title:'搜索关键词',
    maxLength:120,default:'camera'}},required:['query'],additionalProperties:false};
  const first={format:'opendesk.workflow.v1',workflowId:id+'-s1',
    title:'搜索并核对',description:'',siteOrigin:f.target.origin,paramsSchema:shared,
    steps:[{stepId:'fill',op:'fill',locatorKind:'css',selector:'#search',param:'query'}]};
  const second={format:'opendesk.workflow.v1',workflowId:id+'-s2',
    title:'搜索并核对',description:'',siteOrigin:f.target.origin,
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    steps:[{stepId:'read',op:'observe'}]};
  const segments=[];
  for(const [index,workflow] of [first,second].entries()){
    const mode=index===0?'fill-readback':'none';
    const freeze=await compileWorkflow(workflow,{verifyFill:index===0});
    const saved=await f.host.controller.commitControllerScript({
      scriptId:workflow.workflowId,expectedRevision:0,sourceUtf8:freeze.sourceUtf8});
    segments.push({workflow,entryUrl:index===0?f.target.url:
      f.target.origin+'/search?q=camera',revision:saved.revision,
      sourceHash:freeze.sourceHash,verificationMode:mode,
      evidence:{kind:index===0?'input-readback':'read-only'},
      proof:{runId:'original-'+index,resultId:'receipt-'+index,sourceHash:freeze.sourceHash,
        origin:f.target.origin,documentId:'document-'+index}});
  }
  const bundle=await sealWorkflowBundle({format:WORKFLOW_BUNDLE_FORMAT,bundleId:id,revision:1,
    goal:'搜索 camera，然后核对搜索结果',title:'搜索并核对',
    workflow:{workflowId:id,title:'搜索并核对',siteOrigin:f.target.origin},
    segments,paramsSchema:replayParameterSchema(segments)});
  const key='opendesk.sidebar.workflow.v1:'+id+':1';
  f.local.set(key,bundle);
  await f.click('workflow-refresh');
  f.input('workflow-saved-list',key,'change');
  await f.click('workflow-load');
  assert.equal(f.state().header.saved,true,
    'bundle load: '+JSON.stringify({status:f.state().controls['workflow-status'],
      selection:f.state().controls['workflow-saved-list'],history:f.state().history}));
  f.view.actions.setParam('query','lens');await tick();
  const beforeRequests=f.requests.length;
  const result=await f.click('workflow-run');
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'E_WORKFLOW_PARAM_BINDING');
  assert.equal(f.requests.length,beforeRequests,'no new Chrome permission requested');
  assert.equal(f.starts.length,0,'no first segment or browser side effect dispatched');
});

test('running saved script freezes visible parameters and edit operations until settlement',async t=>{
  const f=await workflowFixture({steps:[fill],hold:true});t.after(()=>f.view.dispose());
  f.view.actions.parameterizeStep('fill');await tick();await tick();
  f.click('workflow-save');await tick();await tick();await tick();
  const running=f.click('workflow-run');await tick();await tick();
  assert.equal(f.host.currentRun,'workflow-run-1','the RunHost still owns an active run');
  assert.equal(f.state().busy,true,'React receives a disabled-parameter state');
  const original=f.state().params[0].value,originalStep=structuredClone(f.state().steps[0]);
  f.view.actions.setParam('keyword','unapproved change');
  f.view.actions.removeParam('keyword');
  f.view.actions.editStep('fill','selector','#wrong');
  assert.equal(f.state().params[0].value,original);
  assert.deepEqual(f.state().steps[0],originalStep);
  assert.equal(f.starts[0].params.keyword,original,'running source retains its frozen params');
  f.finish();await running;await tick();
  assert.equal(f.state().busy,false,'params can be edited only after settlement');
});


test('two-segment saved AI-off bundle reopens and runs all frozen revisions',async t=>{
  const f=await workflowFixture({actionResult:({params})=>({
    fill:{kind:'input-readback',matched:true,value:params.query}})});
  t.after(()=>f.view.dispose());
  await f.click('workflow-save');
  assert.equal(f.state().header.saved,true,'save must settle before history may replace a clean draft');
  const id='wf-77777777-3333-2222-1111-111111111111';
  const shared={type:'object',properties:{query:{type:'string',title:'搜索关键词',
    maxLength:120,default:'camera'}},required:['query'],additionalProperties:false};
  const first={format:'opendesk.workflow.v1',workflowId:id+'-s1',
    title:'填写并查看页面',description:'',siteOrigin:f.target.origin,paramsSchema:shared,
    steps:[{stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',param:'query'}]};
  const second={format:'opendesk.workflow.v1',workflowId:id+'-s2',
    title:'填写并查看页面',description:'',siteOrigin:f.target.origin,
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    steps:[{stepId:'read',op:'observe'}]};
  const segments=[];
  for(const [index,workflow] of [first,second].entries()){
    const freeze=await compileWorkflow(workflow,{verifyFill:index===0});
    const saved=await f.host.controller.commitControllerScript({
      scriptId:workflow.workflowId,expectedRevision:0,sourceUtf8:freeze.sourceUtf8});
    segments.push({workflow,entryUrl:f.target.url,revision:saved.revision,
      sourceHash:freeze.sourceHash,verificationMode:index===0?'fill-readback':'none',
      evidence:{kind:index===0?'input-readback':'read-only'},
      proof:{runId:'original-'+index,resultId:'receipt-'+index,sourceHash:freeze.sourceHash,
        origin:f.target.origin,documentId:'document-'+index}});
  }
  const bundle=await sealWorkflowBundle({format:WORKFLOW_BUNDLE_FORMAT,bundleId:id,
    revision:1,goal:'填写 camera，然后查看页面',title:'填写并查看页面',
    workflow:{workflowId:id,title:'填写并查看页面',siteOrigin:f.target.origin},
    segments,paramsSchema:replayParameterSchema(segments)});
  const key='opendesk.sidebar.workflow.v1:'+id+':1';
  f.local.set(key,bundle);
  await f.click('workflow-refresh');
  f.input('workflow-saved-list',key,'change');
  await f.click('workflow-load');
  assert.equal(f.state().header.saved,true,
    'bundle load: '+JSON.stringify({status:f.state().controls['workflow-status'],
      selection:f.state().controls['workflow-saved-list'],history:f.state().history}));
  const outcome=await f.click('workflow-run');
  assert.equal(outcome?.ok,true,'each fragment must verify independently before next starts');
  assert.equal(outcome.segments,2);
  const dispatches=f.starts.filter(row=>row.source.kind==='saved');
  assert.equal(dispatches.length,2);
  assert.deepEqual(dispatches.map(row=>row.source.contentHash),segments.map(s=>s.sourceHash));
  assert.equal(dispatches[0].params.query,'camera');
  assert.deepEqual(dispatches[1].params,{});
});


test('v2 AI-off changes search and explicit product, then runs each saved RunHost source across fresh documents',async t=>{
  const base='https://workflow.example',productHref='/product/lens-y';
  const providerCalls=[];
  const client={ready:Promise.resolve(),subscribeWorkflowAI:()=>()=>{},
    requestWorkflowAI:async method=>{providerCalls.push(method);return {state:'DISCONNECTED',readyForTurn:false};}};
  const observations=[];
  const f=await workflowFixture({client,
    observationResult:({claim,target})=>{
      const url=claim.target.url,doc=claim.target.documentId;
      const node=(role,name,locator,extra={})=>({
        role,name,text:'',state:{visible:true},locator,...extra});
      const nodes=url.endsWith('/demo')?[
        node('textbox','Search',{kind:'css',value:'#keyword'}),
        node('button','Search',{kind:'role',value:'button',name:'Search',exact:true})
      ]:url.includes('/search?q=')?[
        node('heading','Search results for lens',{kind:'role',value:'heading',name:'Search results for lens'}),
        node('link','Lens Y',{kind:'role',value:'link',name:'Lens Y',exact:true},
          {navigation:{href:productHref,url:base+productHref,origin:base}})
      ]:[
        node('heading','Lens Y',{kind:'role',value:'heading',name:'Lens Y'}),
        node('text','¥129.00',{kind:'css',value:'#price'})
      ];
      observations.push({url,documentId:doc});
      return {kind:'semantic-dom-summary',document:{documentId:doc,url},
        title:url.includes('/product/')?'Lens Y product':'Search',nodes,truncated:false};
    },
    actionResult:({source,params})=>source.scriptId?.endsWith('-s1')
      ?{fill:{kind:'input-readback',matched:true,value:params.query}}:{},
    afterAction:({source,params,target})=>{
      if(source.scriptId?.endsWith('-s1')){
        target.url=base+'/search?q='+params.query;
        target.documentId='search-result-'+params.query;
      }else if(source.scriptId?.endsWith('-s2')){
        target.url=base+productHref;
        target.documentId='product-result-'+params.productName;
      }
    }});
  t.after(()=>f.view.dispose());
  await f.click('workflow-save');
  assert.equal(f.state().header.saved,true);
  const id='wf-88888888-3333-2222-1111-111111111111';
  const schema=(name,defaultValue,title)=>({type:'object',properties:{
    [name]:{type:'string',title,maxLength:120,default:defaultValue}},
    required:[name],additionalProperties:false});
  const first={format:'opendesk.workflow.v1',workflowId:id+'-s1',
    title:'搜索并核对商品',description:'',siteOrigin:base,
    paramsSchema:schema('query','camera','搜索关键词'),steps:[
      {stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',param:'query'},
      {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'Search'}]};
  const oldGuard={href:'/product/camera-x',url:base+'/product/camera-x',origin:base,
    name:'Camera X',sourceUrl:base+'/search?q=camera',locatorKind:'role',
    selector:'link',roleName:'Camera X'};
  const second={format:'opendesk.workflow.v1',workflowId:id+'-s2',
    title:'搜索并核对商品',description:'',siteOrigin:base,
    paramsSchema:schema('productName','Camera X','目标商品名称'),
    steps:[{stepId:'product',op:'click',locatorKind:'role',selector:'link',
      roleName:'Camera X',param:'productName',linkGuard:oldGuard}]};
  const segments=[];
  for(const [index,workflow] of [first,second].entries()){
    const frozen=await compileWorkflow(workflow,{verifyFill:index===0});
    const saved=await f.host.controller.commitControllerScript({
      scriptId:workflow.workflowId,expectedRevision:0,sourceUtf8:frozen.sourceUtf8});
    segments.push({workflow,entryUrl:index===0?base+'/demo':base+'/search?q=camera',
      revision:saved.revision,sourceHash:frozen.sourceHash,
      verificationMode:index===0?'fill-readback':'none',
      evidence:index===0?{kind:'search-results'}:{kind:'product-page',name:'Camera X'},
      proof:{runId:'original-'+index,resultId:'receipt-'+index,
        sourceHash:frozen.sourceHash,origin:base,documentId:'original-'+index}});
  }
  const goal='搜索 camera，打开 Camera X 商品详情，核对名称和价格';
  const bindingPlan=inferDynamicReplayPlan({goal,segments});
  assert.ok(bindingPlan);
  const record=await sealWorkflowBundle({
    format:WORKFLOW_DYNAMIC_BUNDLE_FORMAT,bundleId:id,revision:1,goal,title:'搜索并核对商品',
    workflow:{workflowId:id,title:'搜索并核对商品',siteOrigin:base},
    segments,paramsSchema:replayParameterSchema(segments),bindingPlan});
  const key='opendesk.sidebar.workflow.v1:'+id+':1';
  f.local.set(key,record);
  await f.click('workflow-refresh');
  f.input('workflow-saved-list',key,'change');
  await f.click('workflow-load');
  assert.equal(f.state().header.saved,true);
  f.view.actions.setParam('query','lens');
  f.view.actions.setParam('productName','Lens Y');
  const replay=f.click('workflow-run');
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(
    'Dynamic replay fixture did not settle: '+JSON.stringify({
      target:f.target,starts:f.starts.map(item=>({
        source:item.source?.kind,scriptId:item.source?.scriptId,
        expectedUrl:item.target?.expectedUrl,params:item.params})),
      owner:f.owners.slice(-8),running:f.host.currentRun,
      status:f.state().controls['workflow-status']?.text,
      observations
    }))),5000);});
  let outcome;
  try{outcome=await Promise.race([replay,timeout]);}
  finally{clearTimeout(timer);}
  assert.equal(outcome?.ok,true,JSON.stringify({outcome,
    status:f.state().controls['workflow-status']?.text}));
  assert.equal(outcome.segments,2);
  const dispatched=f.starts.filter(item=>item.source.kind==='saved');
  assert.equal(dispatched.length,2);
  assert.deepEqual(dispatched.map(item=>item.source.contentHash),segments.map(item=>item.sourceHash));
  assert.equal(dispatched[0].params.query,'lens');
  assert.equal(dispatched[1].params.productName,'Lens Y');
  assert.deepEqual(dispatched[1].params.__odLinks.product,{
    href:productHref,name:'Lens Y',origin:base,sourceUrl:base+'/search?q=lens'});
  assert.ok(observations.some(row=>row.url===base+'/search?q=lens'));
  assert.ok(observations.some(row=>row.url===base+productHref));
  assert.equal(providerCalls.filter(method=>method!=='ai.connection.read').length,0);
  assert.equal(f.state().lastRun,'success');

  // A different explicit target must be found in the CURRENT search results.
  // No matching role-link means no second saved click and no Provider fallback.
  await f.setPage({url:base+'/demo',documentId:'fresh-entry'});
  f.view.actions.setParam('query','other');
  f.view.actions.setParam('productName','Other Y');
  const beforeNegative=f.starts.filter(item=>item.source.kind==='saved').length;
  let negativeTimeout;
  const negative=await Promise.race([
    f.click('workflow-run'),
    new Promise((_,reject)=>{negativeTimeout=setTimeout(()=>
      reject(Error('Unmatched product replay did not fail closed')),5000);})
  ]).finally(()=>clearTimeout(negativeTimeout));
  assert.equal(negative?.ok,false,'unknown product name must not complete');
  assert.equal(f.starts.filter(item=>item.source.kind==='saved').length,beforeNegative+1,
    'search is allowed once, but no unverified product click may dispatch');
  assert.equal(providerCalls.filter(method=>method!=='ai.connection.read').length,0);

  // Sending natural language must reuse both saved segments, not the model.
  await f.setPage({url:base+'/demo',documentId:'chat-reuse-entry'});
  f.input('workflow-ai-request','搜索 lens，打开 Lens Y 商品详情，核对名称和价格。');
  const beforeNatural=f.starts.filter(row=>row.source.kind==='saved').length;
  let reuseTimer;
  const reused=await Promise.race([f.click('workflow-ai-plan'),new Promise((_,reject)=>{
    reuseTimer=setTimeout(()=>reject(Error('Natural-language replay did not settle')),5000);
  })]).finally(()=>clearTimeout(reuseTimer));
  assert.equal(reused?.ok,true,JSON.stringify({reused,status:f.state().controls['workflow-status']?.text}));
  const resumed=f.starts.filter(row=>row.source.kind==='saved').slice(beforeNatural);
  assert.equal(resumed.length,2);
  assert.deepEqual(resumed.map(row=>row.source.contentHash),segments.map(row=>row.sourceHash));
  assert.deepEqual([resumed[0].params.query,resumed[1].params.productName],['lens','Lens Y']);
  assert.match(f.state().controls['workflow-technical'].text,RegExp(id+'-s2'));
  assert.match(f.state().controls['workflow-technical'].text,RegExp(id));
  assert.ok(f.state().messages.some(row=>row.speaker==='执行结果'&&
    row.message.includes('Lens Y')&&row.message.includes('¥129.00')));
  assert.equal(providerCalls.filter(method=>method!=='ai.connection.read').length,0);

  // Extra limits cannot reuse a superficially similar fixed script.
  await f.setPage({url:base+'/demo',documentId:'chat-extra-constraint'});
  f.input('workflow-ai-request','搜索 lens，打开 Lens Y 商品详情，核对名称和价格，要求价格低于 $100。');
  const beforeChanged=f.starts.filter(row=>row.source.kind==='saved').length;
  await f.click('workflow-ai-plan');
  assert.equal(f.starts.filter(row=>row.source.kind==='saved').length,beforeChanged);

  await f.setPage({url:base+'/demo',documentId:'chat-mismatched-source'});
  f.service.corrupt=true;
  f.input('workflow-ai-request','搜索 lens，打开 Lens Y 商品详情，核对名称和价格。');
  const beforeCorrupt=f.starts.filter(row=>row.source.kind==='saved').length;
  await f.click('workflow-ai-plan');
  assert.equal(f.starts.filter(row=>row.source.kind==='saved').length,beforeCorrupt);
  assert.match(f.state().controls['workflow-status'].text,/E_WORKFLOW_HASH/);
});

test('Send cannot assume no saved match before asynchronous history hydration',async t=>{
  let release;
  const historyRead=new Promise(resolve=>{release=resolve;});
  const f=await workflowFixture({savedStorageGate:()=>historyRead});
  t.after(()=>f.view.dispose());
  assert.equal(get(f,'workflow-ai-plan').disabled,true);
  await f.click('workflow-ai-plan');
  assert.equal(f.starts.length,0);
  release();await tick();await tick();
  assert.equal(get(f,'workflow-ai-plan').disabled,false);
});

test('Workflow Chinese replay grammar accepts natural word spacing but rejects extra demands',()=>{
 const intent={query:'camera',productName:'Camera X'};
 assert.deepEqual(simpleCommerceReplayGoal('搜索 camera，打开 Camera X 商品详情，核对名称和价格'),intent);
 assert.deepEqual(simpleCommerceReplayGoal('搜索 camera，打开 Camera X 商品详情，核对 名称和价格'),intent);
 assert.equal(simpleCommerceReplayGoal('搜索 camera，打开 Camera X 商品详情，核对名称和价格，要求价格低于100'),null);
 assert.equal(simpleCommerceReplayGoal('搜索 camera，打开 Camera X 商品详情，并且提交订单'),null);
});

test('R23.37 cold-chat second Send finds the first natural-language saved Bundle v2 without generating another script',async t=>{
  // Component integration: production View/Provider/Compiler/Controller APIs,
  // with test RunHost and deterministic page observations. Native Chrome DOM
  // evidence must still be obtained separately, never inferred from this test.
  const base='https://workflow.example',receiver='https://api.example.test/*';
  const firstProposal={title:'搜索并核对商品',description:'',
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    steps:[
      {stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',text:'camera'},
      {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'Search'}
    ]};
  const secondProposal={title:'搜索并核对商品',description:'',
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    steps:[{stepId:'product',op:'click',locatorKind:'role',selector:'link',roleName:'Camera X'}]};
  const oldFetch=globalThis.fetch;
  let modelGenerations=0;
  globalThis.fetch=async()=>{
    modelGenerations++;
    if(modelGenerations>2)throw Error('E_GENERATION_NOT_ALLOWED: original agent had only two required rounds');
    const proposal=modelGenerations===1?firstProposal:secondProposal;
    return {ok:true,text:async()=>JSON.stringify({choices:[{
      message:{content:JSON.stringify(proposal)}
    }]})};
  };
  let original=null,reopened=null;
  t.after(()=>{
    original?.view.dispose();reopened?.view.dispose();
    globalThis.fetch=oldFetch;
  });
  const observations=[];
  const observationResult=({claim})=>{
    const url=claim.target.url,documentId=claim.target.documentId;
    const node=(role,name,locator,extra={})=>({
      role,name,text:'',state:{visible:true},locator,...extra
    });
    let nodes,title='Search';
    if(url.endsWith('/demo')){
      nodes=[node('textbox','Search',{kind:'css',value:'#keyword'}),
        node('button','Search',{kind:'role',value:'button',name:'Search',exact:true})];
    }else if(url.includes('/search?q=')){
      const keyword=new URL(url).searchParams.get('q');
      const name=keyword==='lens'?'Lens Y':'Camera X';
      const href=keyword==='lens'?'/product/lens-y':'/product/camera-x';
      nodes=[node('heading','Search results for '+keyword,
          {kind:'role',value:'heading',name:'Search results for '+keyword}),
        node('link',name,{kind:'role',value:'link',name,exact:true},
          {navigation:{href,url:base+href,origin:base}})];
    }else{
      const name=url.endsWith('/lens-y')?'Lens Y':'Camera X';
      const price=name==='Lens Y'?'¥129.00':'¥499.00';
      title=name+' product';
      nodes=[node('heading',name,{kind:'role',value:'heading',name}),
        node('text',price,{kind:'css',value:'#price'})];
    }
    observations.push({url,documentId,nodes:nodes.map(item=>item.name)});
    return {kind:'semantic-dom-summary',document:{documentId,url},title,nodes,truncated:false};
  };
  const actionResult=({params})=>params?.query?{
    fill:{kind:'input-readback',matched:true,value:params.query}
  }:{};
  const afterAction=({params,target})=>{
    if(target.url.endsWith('/demo')){
      const query=params?.query||'camera';
      target.url=base+'/search?q='+encodeURIComponent(query);
      target.documentId='search-'+query;
    }else if(target.url.includes('/search?q=')){
      const name=params?.productName||'Camera X';
      target.url=base+(name==='Lens Y'?'/product/lens-y':'/product/camera-x');
      target.documentId='product-'+name;
    }
  };
  const fixtureOptions={observationResult,actionResult,afterAction};
  const until=async (condition,diagnostic)=>{
    for(let attempt=0;attempt<1200;attempt++){
      if(condition())return;
      await tick();
    }
    throw Error('Workflow full-cycle did not settle: '+diagnostic());
  };
  original=await workflowFixture(fixtureOptions);
  original.click('workflow-source-https');
  original.input('workflow-ai-endpoint','https://api.example.test/v1/chat/completions');
  original.input('workflow-ai-key','IN_MEMORY_FIXTURE_CREDENTIAL');
  original.input('workflow-ai-model','test-model');
  original.input('workflow-ai-request','搜索 camera，打开 Camera X 商品详情，核对名称和价格。');
  await tick();await tick();
  let send=original.click('workflow-ai-plan');
  await until(()=>original.state().controls['workflow-run-review'].hidden===false||
    original.state().controls['workflow-ai-approval'].hidden===false,
    ()=>JSON.stringify(original.state().controls['workflow-status']));
  if(original.state().controls['workflow-run-review'].hidden===false){
    await send;
    send=original.click('workflow-run-review-confirm');
  }
  await until(()=>original.state().controls['workflow-ai-approval'].hidden===false,
    ()=>JSON.stringify(original.state().controls['workflow-status']));
  assert.equal(modelGenerations,0,'HTTPS page summary is never sent before recipient disclosure');
  await original.click('workflow-ai-approve');
  await send;
  await until(()=>original.state().controls['workflow-editor'].dataset.agentState==='COMPLETED',
    ()=>JSON.stringify({agent:original.state().controls['workflow-editor'].dataset.agentState,
      status:original.state().controls['workflow-status'].text,
      starts:original.starts.map(x=>x.source.kind),modelGenerations}));
  assert.equal(modelGenerations,2,'first two-Document task uses the existing provider twice');
  assert.ok(observations.some(row=>row.nodes.includes('Camera X')&&row.nodes.includes('¥499.00')),
    'original price comes from a separate final Document observation');
  assert.ok(original.starts.some(x=>x.source.kind==='draft'),'first run generated authorized JavaScript');

  await original.click('workflow-save');
  await until(()=>[...original.local.values()].some(value=>
    value?.format===WORKFLOW_DYNAMIC_BUNDLE_FORMAT),
    ()=>JSON.stringify(original.state().controls['workflow-status']));
  const record=[...original.local.values()].find(value=>
    value?.format===WORKFLOW_DYNAMIC_BUNDLE_FORMAT);
  assert.equal(record.segments.length,2,'initial Send must actually create the entire v2 Bundle');
  assert.deepEqual(record.segments.map(part=>part.evidence.kind),['search-results','product-page']);
  assert.ok(record.segments.every(part=>original.scripts.get(
    part.workflow.workflowId+':'+part.revision)?.contentHash===part.sourceHash));
  assert.equal(original.state().header.saved,true);
  const storedLocal=original.local,storedScripts=original.scripts;
  original.view.dispose();
  original=null;

  // Entirely new React Workflow/controller conversation. Only committed
  // local bundle and original Controller journal are shared, not any live
  // assistant, host, page locator, or generated JavaScript object.
  reopened=await workflowFixture({...fixtureOptions,local:storedLocal,scripts:storedScripts});
  await tick();await tick();
  await reopened.setPage({url:base+'/demo',documentId:'cold-conversation-entry'});
  const beforeGeneration=modelGenerations;
  const beforeStarts=reopened.starts.length;
  reopened.input('workflow-ai-request','搜索 lens，打开 Lens Y 商品详情，核对名称和价格。');
  const reused=await reopened.click('workflow-ai-plan');
  assert.equal(reused?.ok,true,JSON.stringify({
    result:reused,status:reopened.state().controls['workflow-status'].text
  }));
  assert.equal(modelGenerations-beforeGeneration,0,'second Send must generate ZERO JavaScript');
  const operations=reopened.starts.slice(beforeStarts);
  assert.equal(operations.filter(row=>row.source.kind==='saved').length,2);
  assert.deepEqual(operations.filter(row=>row.source.kind==='saved').map(row=>
    row.source.contentHash),record.segments.map(part=>part.sourceHash));
  const saved=operations.filter(row=>row.source.kind==='saved');
  assert.deepEqual([saved[0].params.query,saved[1].params.productName],['lens','Lens Y']);
  assert.ok(observations.some(row=>row.nodes.includes('Lens Y')&&row.nodes.includes('¥129.00')),
    'the new page price must be independently read back');
  assert.ok(reopened.state().messages.some(row=>row.speaker==='执行结果'&&
    row.message.includes('Lens Y')&&row.message.includes('¥129.00')));
  assert.equal(reopened.state().lastRun,'success');
});
