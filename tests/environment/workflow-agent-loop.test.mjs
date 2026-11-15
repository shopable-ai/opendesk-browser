import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowAgentLoopGuard,classifyWorkflowAgentStop} from '../../src/ui/workflow/agent-loop.js';
const target={origin:'https://example.com',documentId:'doc-1',url:'https://example.com/'};
const proposal=steps=>({steps});
const fill={stepId:'fill1',op:'fill',locatorKind:'css',selector:'#q',text:'camera'};
const search={stepId:'click1',op:'click',locatorKind:'role',selector:'button',roleName:'搜索'};
const link={stepId:'link1',op:'click',locatorKind:'role',selector:'link',roleName:'Camera X'};
const successful={ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readbackVerified:true,
  effect:{kind:'search-results'}};
const read=()=>({summary:{origin:target.origin,documentId:target.documentId,
 nodes:[{role:'button',name:'搜索',state:{visible:true}}]}});
test('arriving at search results is one search, not a second query or link click',()=>{
 for(const goal of ['搜索 camera，打开搜索结果页面','搜索 camera，进入搜索结果页',
  'Search camera, open the search results page']){
  const guard=createWorkflowAgentLoopGuard({goal});
  const claim=guard.claim({workflow:proposal([fill,search]),target});
  assert.equal(guard.verified({claim,reply:successful}).state,'COMPLETED',goal);
 }
});
test('opening a named link within search results still requires a navigation effect',()=>{
 for(const goal of ['搜索 camera，打开搜索结果页面中的 Camera X 链接',
  'Search camera, open the search results page link Camera X']){
  const guard=createWorkflowAgentLoopGuard({goal});
  const claim=guard.claim({workflow:proposal([fill,search]),target});
  assert.equal(guard.verified({claim,reply:successful}).state,'CONTINUE',goal);
  const navigate=guard.claim({workflow:proposal([link]),target});
  assert.equal(guard.verified({claim:navigate,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',effect:{kind:'link-page',name:'Camera X'}}}).state,'COMPLETED');
 }
});
test('top-three wording in a query or prohibited read does not require result extraction',()=>{
 for(const goal of ['搜索「前三条自然搜索结果标题和网址」',
  '搜索“读取前三条自然搜索结果标题和网址”',
  '搜索 camera，不要读取前三条自然搜索结果标题和网址']){
  const guard=createWorkflowAgentLoopGuard({goal});
  const claim=guard.claim({workflow:proposal([fill,search]),target});
  assert.equal(guard.verified({claim,reply:successful}).state,'COMPLETED',goal);
 }
});
test('T02 organic top three require ordered title and URL evidence absent from generic receipts',()=>{
 const goal='请使用当前 Google 网站搜索 OpenDesk Browser GitHub，打开搜索结果页面，读取前三条自然搜索结果的标题和网址，并告诉我实际执行结果。';
 const guard=createWorkflowAgentLoopGuard({goal});
 const claim=guard.claim({workflow:proposal([{...fill,text:'OpenDesk Browser GitHub'},search]),target});
 const first=guard.verified({claim,reply:{...successful,effect:{kind:'search-results',visibleResultLinks:3}}});
 assert.equal(first.state,'CONTINUE');
 assert.equal(first.completed,false);
 assert.match(first.reason,/下一段只读前三条自然结果/);
 assert.ok(first.facts.includes('search-results'));
 const followup=guard.claim({workflow:proposal([{stepId:'readResults',op:'observe'}]),target});
 const afterRead=guard.verified({claim:followup,reply:{ok:true,
  evidenceLevel:'EXECUTION_RECEIPT_VERIFIED',readOnlyVerified:true,
  readbackValues:{readResults:'three arbitrary titles and URLs'}}});
 assert.equal(afterRead.state,'PARTIAL');
 assert.equal(afterRead.completed,false);
 assert.throws(()=>guard.claim({workflow:proposal([{...search,stepId:'retry'}]),target}),
  {code:'E_AGENT_NO_PROGRESS'});
});
test('quoted reading objects retain the ordered result evidence requirement',()=>{
 for(const goal of ['搜索 camera，读取前三条“自然搜索结果”的标题和网址',
  '搜索 camera，读取「前三条自然搜索结果标题和网址」']){
  const guard=createWorkflowAgentLoopGuard({goal});
  const claim=guard.claim({workflow:proposal([fill,search]),target});
  assert.equal(guard.verified({claim,reply:successful}).state,'CONTINUE',goal);
 }
});
test('search to detail requires independently verified link and price',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'搜索 camera，打开 Camera X 商品详情并核对价格'});
 const one=guard.claim({workflow:proposal([fill,search]),target});
 assert.equal(guard.verified({claim:one,reply:successful}).state,'CONTINUE');
 const two=guard.claim({workflow:proposal([link]),target});
 assert.equal(guard.verified({claim:two,reply:{...successful,effect:{kind:'product-page',name:'Camera X',price:'$99'}}}).state,'COMPLETED');
});
test('combined fill, search and detail cannot declare completion early',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'填写 camera，搜索 camera，打开 Camera X 的商品详情并核对价格'});
 const one=guard.claim({workflow:proposal([fill,search]),target});
 assert.equal(guard.verified({claim:one,reply:successful}).state,'CONTINUE');
 const two=guard.claim({workflow:proposal([link]),target});
 assert.equal(guard.verified({claim:two,reply:{ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
  effect:{kind:'product-page',name:'Camera X',price:'$99'}}}).state,'COMPLETED');
});
test('read-only observation completes without falsely requiring a search effect',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'Observe the page and inspect the content'});
 const claim=guard.claim({workflow:proposal([{stepId:'observe1',op:'observe'}]),target});
 assert.equal(guard.verified({claim,reply:{ok:true,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED',
  readOnlyVerified:true}}).state,'COMPLETED');
});
test('T01 Google control inspection is partial when verified receipt has no readback values',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'请读取当前 Google 网页，识别搜索输入框和搜索按钮，告诉我它们的作用，不要修改网页。'});
 const claim=guard.claim({workflow:proposal([{stepId:'read',op:'observe'}]),target});
 const result=guard.verified({claim,reply:{ok:true,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED',
  readOnlyVerified:true}});
 assert.equal(result.state,'PARTIAL');
 assert.equal(result.completed,false);
 assert.match(result.reason,/搜索输入框和搜索按钮/);
 assert.match(result.reason,/不重复/);
 assert.ok(!guard.snapshot().facts.includes('read-only'));
 assert.throws(()=>guard.claim({workflow:proposal([{stepId:'renamed',op:'observe'}]),target}),
  {code:'E_AGENT_NO_PROGRESS'});
});
const inspectionGoal='请读取当前网页，识别搜索输入框和搜索按钮，告诉我它们的作用，不要修改网页。';
const searchInput={role:'combobox',name:'Search',state:{visible:true},
 locator:{kind:'role',value:'combobox',name:'Search',exact:true}};
const searchButton={role:'button',name:'Search',state:{visible:true},
 locator:{kind:'role',value:'button',name:'Search',exact:true}};
const controlSummary=nodes=>({kind:'semantic-dom-summary',
 document:{documentId:target.documentId,url:target.url},nodes});
function inspectControls(values,{goal=inspectionGoal,verified=true}={}){
 const guard=createWorkflowAgentLoopGuard({goal});
 const claim=guard.claim({workflow:proposal([{stepId:'read',op:'observe'}]),target});
 return guard.verified({claim,reply:{ok:true,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED',
  readOnlyVerified:verified,readbackValues:values}});
}
test('control inspection requires both actual search controls, independently of site brand',()=>{
 for(const role of ['searchbox','textbox','combobox']){
  const input={...searchInput,role,name:role==='searchbox'?'Query':'搜索'};
  const result=inspectControls({read:controlSummary([input,searchButton])});
  assert.equal(result.state,'COMPLETED',role);
  assert.equal(result.completed,true);
 }
 assert.equal(inspectControls({read:controlSummary([searchInput,searchButton])},
  {goal:inspectionGoal.replace('当前网页','当前 Google 网页')}).state,'COMPLETED');
});
test('links and unrelated controls do not prove the requested search controls were read',()=>{
 const languageLink={role:'link',name:'日本語',state:{visible:true},
  locator:{kind:'role',value:'link',name:'日本語'}};
 for(const nodes of [[],[languageLink],[{...searchInput,name:'Email'},
  {...searchButton,name:'Save'}]]){
  const result=inspectControls({read:controlSummary(nodes)});
  assert.equal(result.state,'PARTIAL');
  assert.match(result.reason,/搜索输入框和搜索按钮/);
 }
 for(const [nodes,missing,present] of [
  [[searchInput],'搜索按钮','搜索输入框'],[[searchButton],'搜索输入框','搜索按钮']]){
  const result=inspectControls({read:controlSummary(nodes)});
  assert.equal(result.state,'PARTIAL');
  assert.ok(result.reason.includes(missing));
  assert.ok(!result.reason.includes(present));
 }
});
test('hidden or unlocatable controls cannot satisfy control inspection',()=>{
 for(const control of [searchInput,searchButton]){
  for(const change of [{state:{visible:false}},{state:{}},{locator:null},
   {locator:{kind:'css',value:''}},{locator:{value:'#q'}}]){
   const nodes=[searchInput,searchButton].map(node=>node===control?{...node,...change}:node);
   assert.equal(inspectControls({read:controlSummary(nodes)}).state,'PARTIAL');
  }
 }
});
test('only verified current-document semantic observe values prove control inspection',()=>{
 const summary=controlSummary([searchInput,searchButton]);
 for(const values of [null,{read:'搜索输入框和搜索按钮'},
  {read:{...summary,kind:'model-summary'}},
  {read:{...summary,document:{...summary.document,url:'https://other.example/'}}},
  {read:{...summary,document:{...summary.document,documentId:'stale'}}},
  {read:{...summary,document:{...summary.document,url:'invalid'}}},
  {read:{...summary,document:undefined}},
  {unrelated:summary}]){
  assert.equal(inspectControls(values).state,'PARTIAL');
 }
 assert.equal(inspectControls({read:summary},{verified:false}).state,'PARTIAL');
 const guard=createWorkflowAgentLoopGuard({goal:inspectionGoal});
 const claim=guard.claim({workflow:proposal([{stepId:'read',op:'extract'}]),target});
 assert.equal(guard.verified({claim,reply:{ok:true,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED',
  readOnlyVerified:true,readbackValues:{read:summary}}}).state,'PARTIAL');
});
test('ordinary page reads still complete with partial semantic content',()=>{
 assert.equal(inspectControls({read:controlSummary([searchButton])},
  {goal:'请读取当前网页，不要修改网页。'}).state,'COMPLETED');
});
test('a search field fill alone requires input verification, not a search submission',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'在搜索框填入 camera，不要点击搜索'});
 const claim=guard.claim({workflow:proposal([fill]),target});
 assert.equal(guard.verified({claim,reply:{ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
  readbackVerified:true}}).state,'COMPLETED');
});
test('prevent repeated side effects across generated step IDs and Documents',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'搜索 camera'});
 guard.claim({workflow:proposal([fill,search]),target});
 assert.throws(()=>guard.claim({workflow:proposal([{...fill,stepId:'different'},{...search,stepId:'again'}]),
   target:{...target,documentId:'doc-2'}}),{code:'E_AGENT_NO_PROGRESS'});
});
test('limit four actions per round and 24 in total',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'查看页面'});
 assert.throws(()=>guard.claim({workflow:proposal(Array.from({length:5},(_,i)=>({...fill,stepId:'s'+i}))),target}),{code:'E_AGENT_SCHEMA'});
 for(let i=0;i<6;i++)guard.claim({workflow:proposal(Array.from({length:4},(_,j)=>({...fill,text:'different-'+i+'-'+j}))),target});
 assert.throws(()=>guard.claim({workflow:proposal([{...fill,text:'another'}]),target}),{code:'E_AGENT_LIMIT'});
});
test('unknown click outcome always stops without replay',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'搜索 camera'});
 const claim=guard.claim({workflow:proposal([fill,search]),target});
 assert.equal(guard.verified({claim,reply:{ok:false,error:{code:'E_AI_OUTCOME_UNKNOWN'}}}).state,'OUTCOME_UNKNOWN');
});
test('identical and alternating observations stop early',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'查看页面'});
 for(let i=0;i<2;i++)guard.observed({target,receipt:read()});
 assert.throws(()=>guard.observed({target,receipt:read()}),{code:'E_AGENT_NO_PROGRESS'});
 const alternate=createWorkflowAgentLoopGuard({goal:'查看页面'});
 const a=read(),b=read();b.summary.nodes[0].name='查找';
 alternate.observed({target,receipt:a});alternate.observed({target,receipt:b});
 alternate.observed({target,receipt:a});
 assert.throws(()=>alternate.observed({target,receipt:b}),{code:'E_AGENT_NO_PROGRESS'});
});
test('stop and deadline halt without new claims',()=>{
 const abort=new AbortController();let time=1;
 const guard=createWorkflowAgentLoopGuard({goal:'搜索 camera',signal:abort.signal,clock:()=>time,limits:{durationMs:12}});
 time=13;assert.throws(()=>guard.claim({workflow:proposal([fill]),target}),{code:'E_AGENT_LIMIT'});
 const another=createWorkflowAgentLoopGuard({goal:'搜索 camera',signal:abort.signal});
 abort.abort(Object.assign(new Error('stop'),{code:'E_CANCELLED'}));
 assert.throws(()=>another.claim({workflow:proposal([fill]),target}),{code:'E_CANCELLED'});
});

test('verified writes are not replayed in another fragment or Document',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'填写 camera，搜索 camera，打开 Camera X 详情并核对价格'});
 const first=guard.claim({workflow:proposal([fill,search]),target,observation:read()});
 assert.equal(guard.verified({claim:first,reply:successful}).state,'CONTINUE');
 assert.throws(()=>guard.claim({workflow:proposal([{...fill,stepId:'different'}]),
   target:{...target,documentId:'doc-2'}}),{code:'E_AGENT_NO_PROGRESS'});
 assert.throws(()=>guard.claim({workflow:proposal([{...search,stepId:'again'}]),
   target:{...target,documentId:'doc-2'}}),{code:'E_AGENT_NO_PROGRESS'});
 const css={stepId:'css-search',op:'click',locatorKind:'css',selector:'#search'};
 const observation={summary:{origin:target.origin,documentId:'doc-2',nodes:[{
   role:'button',name:'搜索',state:{visible:true},locator:{kind:'css',value:'#search'}}]}};
 assert.throws(()=>guard.claim({workflow:proposal([css]),
   target:{...target,documentId:'doc-2'},observation}),{code:'E_AGENT_NO_PROGRESS'});
});
test('a different product or missing verified price cannot satisfy original goal',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'打开 Camera X 商品详情并核对价格'});
 const ticket=guard.claim({workflow:proposal([link]),target});
 assert.equal(guard.verified({claim:ticket,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
   effect:{kind:'product-page',name:'Camera Y',price:'$99'}}}).state,'PARTIAL');
 const second=createWorkflowAgentLoopGuard({goal:'打开 Camera X 商品详情并核对价格'});
 const other=second.claim({workflow:proposal([link]),target});
 assert.equal(second.verified({claim:other,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
   effect:{kind:'product-page',name:'Camera X',price:'unverified'}}}).state,'PARTIAL');
});

test('two named products must be independently verified before completion',()=>{
 const goal='打开 Camera X 和 Camera Y 商品详情并核对价格';
 const guard=createWorkflowAgentLoopGuard({goal});
 const one=guard.claim({workflow:proposal([link]),target,
   linkGuard:{name:'Camera X'}});
 assert.equal(guard.verified({claim:one,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
   effect:{kind:'product-page',name:'Camera X',price:'$99'}}}).state,'CONTINUE');
 const secondLink={...link,stepId:'link-two',roleName:'Camera Y'};
 const two=guard.claim({workflow:proposal([secondLink]),target,
   linkGuard:{name:'Camera Y'}});
 assert.equal(guard.verified({claim:two,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
   effect:{kind:'product-page',name:'Camera Y',price:'$129'}}}).state,'COMPLETED');
});
test('two independently requested fills are not satisfied by the first readback',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'填写 name 和 email'});
 const first=guard.claim({workflow:proposal([{...fill,text:'name'}]),target});
 assert.equal(guard.verified({claim:first,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readbackVerified:true}}).state,'CONTINUE');
 const other=guard.claim({workflow:proposal([{...fill,text:'email',selector:'#email'}]),target});
 assert.equal(guard.verified({claim:other,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readbackVerified:true}}).state,'COMPLETED');
});

test('separate named search queries require separate results and avoid false completion',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'搜索 camera，搜索 lens'});
 const first=guard.claim({workflow:proposal([fill,search]),target});
 assert.equal(guard.verified({claim:first,reply:{...successful}}).state,'CONTINUE');
 const lens={...fill,stepId:'lens',text:'lens'};
 const second=guard.claim({workflow:proposal([lens,{...search,stepId:'search-lens'}]),target});
 assert.equal(guard.verified({claim:second,reply:{...successful}}).state,'COMPLETED');
});
test('same input field with changed text does not prove two distinct field targets',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'填写 name 和 email'});
 const first=guard.claim({workflow:proposal([{...fill,text:'name'}]),target});
 assert.equal(guard.verified({claim:first,reply:{ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
   readbackVerified:true}}).state,'CONTINUE');
 const second=guard.claim({workflow:proposal([{...fill,text:'email'}]),target});
 assert.equal(guard.verified({claim:second,reply:{ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
   readbackVerified:true}}).state,'CONTINUE');
});

test('stop before RunHost.start returns runId cannot be classified as stopped',()=>{
 assert.equal(classifyWorkflowAgentStop({startPending:true,startedCount:0}),'OUTCOME_UNKNOWN');
 assert.equal(classifyWorkflowAgentStop({executionPending:true,startedCount:0}),'OUTCOME_UNKNOWN');
 assert.equal(classifyWorkflowAgentStop({runActive:true,startedCount:1}),'OUTCOME_UNKNOWN');
 assert.equal(classifyWorkflowAgentStop({stopRejected:true,startedCount:1}),'OUTCOME_UNKNOWN');
 assert.equal(classifyWorkflowAgentStop({startPending:false,startedCount:0}),'STOPPED');
 assert.equal(classifyWorkflowAgentStop({startPending:false,startedCount:1}),'PARTIAL');
});

test('two saved replay search parameters resolve to distinct verified queries',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'搜索 camera，搜索 lens'});
 const parameterFill={stepId:'query',op:'fill',locatorKind:'css',selector:'#q',param:'term'};
 const first=guard.claim({workflow:proposal([parameterFill,search]),target,params:{term:'camera'}});
 assert.equal(guard.verified({claim:first,reply:successful}).state,'CONTINUE');
 assert.ok(guard.snapshot().facts.includes('search-target:camera'));
 const second=guard.claim({workflow:proposal([parameterFill,{...search,stepId:'two'}]),
   target,params:{term:'lens'}});
 assert.equal(guard.verified({claim:second,reply:successful}).state,'COMPLETED');
 assert.ok(guard.snapshot().facts.includes('search-target:lens'));
 assert.throws(()=>guard.claim({workflow:proposal([parameterFill,search]),
   target,params:{term:'lens'}}),{code:'E_AGENT_NO_PROGRESS'});
});

test('page inspection requested after fill requires separate read-only receipt',()=>{
 const guard=createWorkflowAgentLoopGuard({goal:'填写 camera，然后查看页面'});
 const one=guard.claim({workflow:proposal([fill]),target});
 assert.equal(guard.verified({claim:one,reply:{ok:true,
   evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readbackVerified:true}}).state,'CONTINUE');
 const two=guard.claim({workflow:proposal([{stepId:'inspect',op:'observe'}]),target});
 assert.equal(guard.verified({claim:two,reply:{ok:true,
   evidenceLevel:'EXECUTION_RECEIPT_VERIFIED',readOnlyVerified:true}}).state,'COMPLETED');
});
