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
