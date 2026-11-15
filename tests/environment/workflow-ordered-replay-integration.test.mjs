import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowFixture} from './workflow-react-fixture.mjs';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {ORDERED_SEARCH_SELECTION} from '../../src/framework/workflow/ordered-search-source.js';
import {sealWorkflowBundle,replayParameterSchema,WORKFLOW_BUNDLE_FORMAT} from '../../src/ui/workflow/segment-replay.js';

const origin='https://www.google.com',query='OpenDesk Browser GitHub';
const goal='搜索 OpenDesk Browser GitHub，读取前三条自然搜索结果的标题和网址';
const searchUrl=origin+'/search?q=OpenDesk+Browser+GitHub';
async function fixture(t,{wrongRevision=false,reload=false}={}){
  let resultRefreshes=0;
  const summary=(url,documentId)=>({kind:'semantic-dom-summary',document:{url,documentId},
    title:'Google',truncated:false,nodes:url===origin+'/'?[
      {role:'textbox',name:'搜索',text:'',state:{visible:true},locator:{kind:'css',value:'#q'}},
      {role:'button',name:'搜索',text:'',state:{visible:true},locator:{kind:'role',value:'button',name:'搜索',exact:true}}
    ]:[{role:'heading',name:'搜索结果',text:'',state:{visible:true},
      locator:{kind:'css',value:'#heading'}},...[1,2,3].map(i=>({role:'link',name:'Result '+i,text:'',state:{visible:true},
      locator:{kind:'css',value:'#result-'+i}}))]});
  const f=await workflowFixture({target:{origin,url:origin+'/'},
    observationResult:({claim})=>summary(claim.target.url,claim.target.documentId),
    actionResult:({source})=>source.scriptId.endsWith('-s1')?
      {fill:{kind:'input-readback',matched:true,value:query}}:
      {read:{...summary(searchUrl,'result-doc'),orderedResults:{kind:'ordered-search-results',version:1,
        document:{url:searchUrl,documentId:'result-doc'},query,
        selection:{...ORDERED_SEARCH_SELECTION,scanned:3,excluded:0},
        items:[1,2,3].map(position=>({position,title:'Result '+position,href:'https://example.com/'+position}))}}},
    afterAction:({source,target})=>{if(source.scriptId.endsWith('-s1')){
      target.url=searchUrl;target.documentId='result-doc';}},
    beforeTargetRefresh:target=>{if(target.url===searchUrl&&++resultRefreshes===2&&reload)
      target.documentId='same-url-reloaded';}});
  t.after(()=>f.view.dispose());
  await f.click('workflow-save');
  const id='wf-11111111-2222-3333-4444-555555555555';
  const base=emptyWorkflow(origin,'11111111-2222-3333-4444-555555555555');
  const workflows=[{...base,workflowId:id+'-s1',steps:[
    {stepId:'fill',op:'fill',locatorKind:'css',selector:'#q',text:query},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'搜索',waitUntil:'domcontentloaded'}]},
  {...base,workflowId:id+'-s2',steps:[{stepId:'read',op:'observe',text:goal}]}];
  const segments=[];
  for(const [i,workflow] of workflows.entries()){
    const frozen=await compileWorkflow(workflow,{verifyFill:i===0});
    const saved=await f.host.controller.commitControllerScript({scriptId:workflow.workflowId,
      expectedRevision:0,sourceUtf8:frozen.sourceUtf8});
    segments.push({workflow,entryUrl:i===0?origin+'/':searchUrl,revision:saved.revision,
      sourceHash:frozen.sourceHash,verificationMode:i===0?'fill-readback':'none',
      evidence:{kind:i===0?'search-results':'ordered-search-results'},
      proof:{runId:'original-'+i,resultId:'result-'+i,sourceHash:frozen.sourceHash,origin,documentId:'original-'+i}});
  }
  const bundle=await sealWorkflowBundle({format:WORKFLOW_BUNDLE_FORMAT,bundleId:id,revision:1,
    goal,title:'Google ordered results',workflow:{workflowId:id,title:'Google ordered results',siteOrigin:origin},
    segments,paramsSchema:replayParameterSchema(segments)});
  const key='opendesk.sidebar.workflow.v1:'+id+':1';f.local.set(key,bundle);
  await f.click('workflow-refresh');f.input('workflow-saved-list',key,'change');await f.click('workflow-load');
  assert.equal(f.state().header.saved,true,JSON.stringify(f.state().controls['workflow-status']));
  if(wrongRevision){
    const snapshot=f.host.controller.snapshotControllerRun;
    f.host.controller.snapshotControllerRun=async args=>{
      const view=await snapshot(args);
      if(view.run.revision.scriptId?.endsWith('-s1')){
        view.run.revision={...view.run.revision,scriptId:'different-script',revision:99};
        view.results[0].revision={...view.results[0].revision,scriptId:'different-script',revision:99};
      }
      return view;
    };
  }
  return f;
}
test('AI-off ordered replay executes both frozen identities and displays actual pairs',async t=>{
  const f=await fixture(t),outcome=await f.click('workflow-run');
  assert.equal(outcome?.ok,true,JSON.stringify(f.state().controls['workflow-status']));
  assert.equal(f.starts.filter(row=>row.source.kind==='saved').length,2);
  assert.match(JSON.stringify(f.state().messages),/Result 3/);
});
test('AI-off refuses a same-hash receipt belonging to another saved revision',async t=>{
  const f=await fixture(t,{wrongRevision:true}),outcome=await f.click('workflow-run');
  assert.equal(outcome?.ok,false);
  assert.equal(f.starts.filter(row=>row.source.kind==='saved').length,1);
});
test('same-URL reload after verified search blocks the next ordered read',async t=>{
  const f=await fixture(t,{reload:true}),outcome=await f.click('workflow-run');
  assert.equal(outcome?.ok,false);
  assert.equal(outcome.error.code,'E_DOCUMENT_STALE');
  assert.equal(f.starts.filter(row=>row.source.kind==='saved').length,1);
});
