import test from 'node:test';
import assert from 'node:assert/strict';
import {ORDERED_SEARCH_SELECTION} from '../../src/framework/workflow/ordered-search-source.js';
import {verifyOrderedSearchResults} from '../../src/ui/workflow/ordered-search-results.js';
import {createWorkflowAgentLoopGuard} from '../../src/ui/workflow/agent-loop.js';
import {workflowSegmentEntryUrl,workflowSegmentEntryMatches,verifyReplayBusinessEffect,
  sealWorkflowBundle,verifyWorkflowBundle,replayParameterSchema,WORKFLOW_BUNDLE_FORMAT} from '../../src/ui/workflow/segment-replay.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {verifiedWorkflowHistory} from '../../src/ui/workflow/data-sharing.js';
import {verifySearchBusinessEffect} from '../../src/ui/workflow/direct-execution.js';
import {workflowObservationForModel} from '../../src/ui/workflow/observation.js';

const request='请使用当前 Google 网站搜索 OpenDesk Browser GitHub，打开搜索结果页面，读取前三条自然搜索结果的标题和网址，并告诉我实际执行结果。';
const origin='https://www.google.com',query='OpenDesk Browser GitHub';
const target={windowId:1,tabId:2,frameId:0,documentId:'result-doc',origin,
  url:origin+'/search?q=OpenDesk+Browser+GitHub&source=hp&ei=volatile'};
const read={stepId:'read',op:'observe',text:request};
const workflow={...emptyWorkflow(origin,'11111111-2222-3333-4444-555555555555'),steps:[read]};
function fixture(){
  return {workflow,request,target,values:{read:{kind:'semantic-dom-summary',document:{url:target.url,documentId:target.documentId},
    orderedResults:{kind:'ordered-search-results',version:1,document:{url:target.url,documentId:target.documentId},query,
      selection:{...ORDERED_SEARCH_SELECTION,scanned:5,excluded:2},
      items:[1,2,3].map(position=>({position,title:'Result '+position,href:'https://example.com/'+position}))}}}};
}
test('ordered pairs require exact Document, query, fixed selection and three unique positions',()=>{
  const f=fixture();assert.equal(verifyOrderedSearchResults(f).items.length,3);
  for(const mutate of [
    x=>x.values.read.document.documentId='old',
    x=>x.values.read.orderedResults.document.url=origin+'/',
    x=>x.values.read.orderedResults.query='other',
    x=>x.values.read.orderedResults.selection.exclude='',
    x=>x.values.read.orderedResults.selection.scanned=31,
    x=>x.values.read.orderedResults.items.pop(),
    x=>x.values.read.orderedResults.items.reverse(),
    x=>x.values.read.orderedResults.items[2].href=x.values.read.orderedResults.items[0].href,
    x=>x.values.read.orderedResults.items[0].href='javascript:alert(1)',
    x=>x.values.read.orderedResults.items[0].href='https://user:password@example.com/',
    x=>x.request='搜索 other，读取前三条自然搜索结果标题和网址',
    x=>x.target={...x.target,url:x.target.url+'&q=other'}
  ]){const changed=structuredClone(f);mutate(changed);assert.equal(verifyOrderedSearchResults(changed),null);}
});
test('independent ordered proof verifies deep Google results without sharing raw URLs with a model',()=>{
  const f=fixture(),base={format:'opendesk.workflow-observation.v1',sourceHash:'a'.repeat(64)};
  const before={...base,runId:'before',resultId:'before-result',
    summary:{origin,documentId:'home-doc',nodes:[]}};
  const after={...base,runId:'after',resultId:'after-result',
    summary:{origin,documentId:target.documentId,nodes:[]},orderedResults:f.values.read.orderedResults};
  const input={expectation:{kind:'search-results-v1',query},before,after,request,
    actionTarget:{...target,url:origin+'/',documentId:'home-doc'},resultTarget:target};
  assert.deepEqual(verifySearchBusinessEffect(input),{kind:'search-results',visibleResultLinks:3});
  assert.equal(verifySearchBusinessEffect({...input,request:'搜索 '+query}),null);
  const wrong=structuredClone(input);wrong.after.orderedResults.document.documentId='foreign';
  assert.equal(verifySearchBusinessEffect(wrong),null);
  const model=workflowObservationForModel(after);
  assert.ok(!Object.hasOwn(model,'orderedResults'));
  assert.ok(!JSON.stringify(model).includes('example.com'));
  assert.equal(after.orderedResults.items.length,3);
});
test('verified search continues to read once; generic text cannot complete; ordered durable data can',()=>{
  const guard=createWorkflowAgentLoopGuard({goal:request});
  const first=guard.claim({workflow:{steps:[{stepId:'fill',op:'fill',locatorKind:'css',selector:'#q',text:query},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'}]},target:{...target,url:origin+'/',documentId:'home-doc'}});
  assert.equal(guard.verified({claim:first,reply:{ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
    readbackVerified:true,effect:{kind:'search-results'}}}).state,'CONTINUE');
  const second=guard.claim({workflow,target});
  const f=fixture(),effect=verifyOrderedSearchResults(f);
  const reply={ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readOnlyVerified:true,readbackValues:f.values,effect};
  assert.equal(guard.verified({claim:second,reply:{...reply,readbackValues:{read:'model prose'}}}).state,'PARTIAL');
  assert.equal(guard.verified({claim:second,reply}).state,'COMPLETED');
  assert.equal(verifyReplayBusinessEffect({kind:'ordered-search-results'},reply),true);
  assert.equal(verifyReplayBusinessEffect({kind:'ordered-search-results'},
    {...reply,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED'}),false);
});
test('only an ordered observe segment canonicalizes volatile result URL fields',()=>{
  const segment={workflow,evidence:{kind:'ordered-search-results'},entryUrl:target.url};
  segment.entryUrl=workflowSegmentEntryUrl(segment);
  assert.equal(segment.entryUrl,origin+'/search?q=OpenDesk+Browser+GitHub');
  assert.equal(workflowSegmentEntryMatches(segment,target.url),true);
  assert.equal(workflowSegmentEntryMatches(segment,origin+'/search?q=other'),false);
  assert.equal(workflowSegmentEntryMatches({...segment,evidence:{kind:'read-only'}},target.url),false);
  assert.throws(()=>workflowSegmentEntryUrl({...segment,workflow:{...workflow,
    steps:[{stepId:'click',op:'click',locatorKind:'css',selector:'#submit'}]}}),{code:'E_WORKFLOW_BUNDLE'});
});
test('saving and reopening ordered segments retains frozen bytes and requires a fresh read on replay',async()=>{
  const id=workflow.workflowId;
  const search={...workflow,workflowId:id+'-s1',steps:[
    {stepId:'fill',op:'fill',locatorKind:'css',selector:'#q',text:query},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索',waitUntil:'domcontentloaded'}]};
  const ordered={...workflow,workflowId:id+'-s2'};
  const segments=[];
  for(const [i,w] of [search,ordered].entries()){
    const frozen=await compileWorkflow(w,{verifyFill:i===0});
    segments.push({workflow:frozen.workflow,revision:1,sourceHash:frozen.sourceHash,
      entryUrl:i===0?origin+'/':workflowSegmentEntryUrl({workflow:ordered,evidence:{kind:'ordered-search-results'},entryUrl:target.url}),
      verificationMode:i===0?'fill-readback':'none',evidence:{kind:i===0?'search-results':'ordered-search-results'},
      proof:{runId:'run-'+i,resultId:'result-'+i,sourceHash:frozen.sourceHash,origin,documentId:'doc-'+i}});
  }
  const saved=await sealWorkflowBundle({format:WORKFLOW_BUNDLE_FORMAT,bundleId:id,revision:1,goal:request,title:'Search',
    workflow:{workflowId:id,title:'Search',siteOrigin:origin},segments,paramsSchema:replayParameterSchema(segments)});
  const reopened=await verifyWorkflowBundle(JSON.parse(JSON.stringify(saved)));
  for(const segment of reopened.segments){
    const source=await compileWorkflow(segment.workflow,{verifyFill:segment.verificationMode==='fill-readback'});
    assert.equal(source.sourceHash,segment.sourceHash);
  }
  assert.equal(verifyReplayBusinessEffect(reopened.segments[1].evidence,
    {ok:true,readOnlyVerified:true,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED'}),false);
});
test('later model context accepts the verified category without raw result URLs',()=>{
  const history=verifiedWorkflowHistory([{request,outcome:'verified',readbackVerified:false,
    stepCount:1,effectKind:'ordered-search-results'}]);
  assert.equal(history[0].effectKind,'ordered-search-results');
  assert.ok(!JSON.stringify(history).includes('example.com'));
});
