import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiCapture} from '../src/ai-capture.js';
import {createAiPending} from '../src/ai-pending.js';

const config={url:'https://example.org/list',itemConfig:{title:'h2::text'},maxPages:3};
const input={requestId:'first',requirement:'采集三页，提取书名',targetUrl:config.url,context:{page:{url:config.url},sample:'<h2>书名</h2>',sampleUrl:config.url,currentConfig:config}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({initial=null,generate,info,cancel,clearGate}={}){
 let stored=initial,etag=0;const calls=[];
 const request=async(op,args)=>{
  calls.push({op,args:structuredClone(args)});
  if(op==='storage.get')return {value:structuredClone(stored),etag:String(etag)};
  if(op==='storage.set'){assert.equal(args.ifMatch,String(etag));stored=structuredClone(args.value);etag++;if(args.value===null&&clearGate)return clearGate.promise;return {saved:true};}
  if(op==='ai.info')return info?info():{provider:'fixture',generation:1};
  if(op==='ai.generate')return generate?generate(args):{requestId:args.requestId,providerGeneration:1,proposal:config,metadata:{turnId:'turn-1'}};
  if(op==='ai.cancel')return cancel?cancel(args):{requestId:args.requestId,state:'unknown'};
  throw Error('Unexpected '+op);
 };
 const capture=createAiCapture({request,pending:createAiPending(request),validate:value=>{if(!value?.itemConfig)throw Error('invalid config');return value;}});
 return {capture,calls,get stored(){return stored;}};
}

test('fixed request returns validated identity-bound data only and requires actual structure',async()=>{
 const f=fixture();await f.capture.restore();
 for(const context of [{...input.context,sample:''},{...input.context,sampleUrl:'https://example.org/other'}])
  await assert.rejects(f.capture.generate({...input,context}),{code:'E_AI_CONTEXT_REQUIRED'});
 assert.equal(f.calls.some(c=>c.op==='ai.generate'),false);
 const result=await f.capture.generate(input);
 assert.deepEqual(result.config,config);assert.equal(result.requestId,'first');assert.equal(result.metadata.turnId,'turn-1');
 assert.equal(f.stored,null);assert.equal(f.calls.some(c=>c.op.startsWith('localTasks.')||c.op.startsWith('tasks.')),false);
});

test('single operation fences duplicate sends and cancellation during info prevents dispatch',async()=>{
 const info=deferred();const f=fixture({info:()=>info.promise});await f.capture.restore();
 const running=f.capture.generate(input);await settle();
 await assert.rejects(f.capture.generate({...input,requestId:'second'}),{code:'E_AI_BUSY'});
 await f.capture.cancel();info.resolve({generation:1});assert.equal(await running,null);
 assert.equal(f.calls.some(c=>c.op==='ai.generate'),false);assert.equal(f.stored,null);
});

test('unknown survives dispose and reopen; only a correlated terminal cancel clears original CAS row',async()=>{
 const f=fixture({generate:()=>{throw Object.assign(Error('unknown'),{code:'E_AI_UNKNOWN'});}});await f.capture.restore();
 await assert.rejects(f.capture.generate(input),{code:'E_AI_UNKNOWN'});assert.equal(f.capture.snapshot.unknown,true);
 await f.capture.cancel();assert.equal(f.stored.requestId,'first');
 await assert.rejects(f.capture.generate({...input,requestId:'second'}),{code:'E_AI_BUSY'});
 f.capture.dispose();await settle();assert.equal(f.stored.requestId,'first');
 const reopened=fixture({initial:f.stored,cancel:args=>({requestId:'wrong',state:'cancelled'})});await reopened.capture.restore();
 await assert.rejects(reopened.capture.cancel(),/身份/);assert.equal(reopened.stored.requestId,'first');
 const terminal=fixture({initial:f.stored,cancel:args=>({requestId:args.requestId,state:'completed'})});await terminal.capture.restore();
 await terminal.capture.cancel();assert.equal(terminal.stored,null);assert.equal(terminal.capture.snapshot.unknown,false);
 assert.deepEqual(terminal.calls.filter(c=>c.op==='ai.cancel').map(c=>c.args.requestId),['first']);
});

test('late response, provider switch and stale inputs cannot deliver a proposal',async()=>{
 for(const kind of ['cancel','dispose','stale','provider']){
  const result=deferred(),f=fixture({generate:()=>result.promise});await f.capture.restore();let current=true;
  const running=f.capture.generate({...input,assertCurrent:()=>{if(!current)throw Error('stale input');}});await settle();
  if(kind==='cancel')await f.capture.cancel();
  if(kind==='dispose')f.capture.dispose();
  if(kind==='stale')current=false;
  result.resolve({requestId:'first',providerGeneration:kind==='provider'?2:1,proposal:config});
  if(['cancel','dispose'].includes(kind))assert.equal(await running,null);
  else await assert.rejects(running,/变化|stale/);
 }
});

test('failure preserves the sent error context and lost storage receipt can retire undispatched preparation',async()=>{
 const context=structuredClone(input.context);context.previousError='previous failure';
 const f=fixture({generate:()=>{throw Error('provider failed');}});await f.capture.restore();
 const running=f.capture.generate({...input,context});context.previousError='changed after click';
 await assert.rejects(running,/provider failed/);
 assert.equal(f.calls.find(c=>c.op==='ai.generate').args.context.previousError,'previous failure');
 let row=null,revision=0,lost=true;const calls=[];
 const request=async(op,args)=>{
  calls.push(op);if(op==='storage.get')return {value:row,etag:String(revision)};
  if(op==='storage.set'){row=args.value;revision++;if(lost&&row){lost=false;throw Object.assign(Error('lost claim'),{code:'E_TOOL_TIMEOUT'});}return {saved:true};}
  throw Error('must not dispatch');
 };
 const capture=createAiCapture({request,pending:createAiPending(request),validate:x=>x});await capture.restore();
 await assert.rejects(capture.generate(input),/lost claim/);assert.equal(row.requestId,'first');
 await capture.cancel();assert.equal(row,null);assert.equal(calls.some(c=>c.startsWith('ai.')),false);
});

test('failed initial pending read remains closed until explicit readback; no request can clear another identity',async()=>{
 let failed=true,row={schemaVersion:1,requestId:'older'},revision=0;const calls=[];
 const request=async(op,args)=>{
  calls.push({op,args});if(op==='storage.get'){if(failed)throw Error('offline read');return {value:row,etag:String(revision)};}
  if(op==='storage.set'){assert.equal(args.ifMatch,String(revision));row=args.value;revision++;return {saved:true};}
  if(op==='ai.cancel')return {requestId:args.requestId,state:'completed'};
  throw Error('must not generate');
 };
 const capture=createAiCapture({request,pending:createAiPending(request),validate:x=>x});
 await assert.rejects(capture.restore(),/offline/);await assert.rejects(capture.generate(input),{code:'E_AI_BUSY'});
 failed=false;await capture.restore();assert.equal(capture.snapshot.requestId,'older');
 await assert.rejects(capture.generate(input),{code:'E_AI_BUSY'});assert.equal(row.requestId,'older');
 await capture.cancel();assert.equal(row,null);assert.equal(calls.some(c=>c.op==='ai.generate'),false);
});

test('fixed task contract rejects field loss, page budget drift, dropped pagination or dedupe before preview',async()=>{
 const original={url:config.url,itemConfig:{_listContainer:'#books',_listItem:'li',id:'.::data-id',title:'h2::text',price:'.price::text'},maxPages:50,nextPageSelector:'a.next',dedupeKey:'id'};
 const next={...input,context:{...input.context,currentConfig:original}};
 for(const proposal of [
  {...original,itemConfig:{title:'h2::text'}},
  {...original,maxPages:1},
  Object.fromEntries(Object.entries(original).filter(([k])=>k!=='nextPageSelector')),
  Object.fromEntries(Object.entries(original).filter(([k])=>k!=='dedupeKey'))
 ]){
  const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});await f.capture.restore();
  await assert.rejects(f.capture.generate(next),/任务要求|字段|分页|去重/);
 }
 const corrected={...original,itemConfig:{...original.itemConfig,title:'h3::text'},nextPageSelector:'.pager a'};
 const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal:corrected})});await f.capture.restore();
 assert.deepEqual((await f.capture.generate(next)).config,corrected,'selector corrections retain the fixed contract');
});

test('Stop during persisted pending cleanup invalidates proposal delivery before the delayed acknowledgment',async()=>{
 const clearGate=deferred(),f=fixture({clearGate});await f.capture.restore();
 const running=f.capture.generate(input);await settle();
 assert.equal(f.capture.snapshot.requestId,'first');
 const stopping=f.capture.cancel();
 clearGate.resolve({saved:true});
 assert.equal((await stopping).state,'completed','validated completion waits for its pending cleanup receipt');
 assert.equal(await running,null,'Stop must suppress a proposal already awaiting pending cleanup');
});

test('selector corrections cannot change text, attribute or cardinality contracts before local preview',async()=>{
 const original={url:config.url,itemConfig:{_listContainer:'ul',_listItem:'li',
  link:'a[data-note="x::y"]::href',title:'h2::text',
  tags:{selector:'.tag',read:'text',cardinality:'many'},
  metadata:{id:{selector:'.',read:'attr',attr:'data-id',cardinality:'one'},_listItem:'b::text'}}};
 const next={...input,context:{...input.context,currentConfig:original}};
 for(const change of [
  {link:'a::text'},
  {link:{selector:'a',read:'attr',attr:'title'}},
  {title:{selector:'a'}},
  {tags:{selector:'.tag',read:'text',cardinality:'one'}},
  {metadata:{...original.itemConfig.metadata,id:{selector:'.',read:'attr',attr:'data-id'}}},
  {metadata:{...original.itemConfig.metadata,id:{selector:'.',read:'attr',attr:'id',cardinality:'one'}}},
  {metadata:{...original.itemConfig.metadata,_listItem:'b::title'}}
 ]){
  const proposal={...original,itemConfig:{...original.itemConfig,...change}};
  const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});
  await f.capture.restore();
  await assert.rejects(f.capture.generate(next),/读取|单值|多值/);
  assert.equal(f.calls.some(c=>c.op.startsWith('localTasks.')),false);
  assert.equal(f.stored,null,'a completed but invalid proposal does not create unknown work');
 }
});

test('equivalent local read syntax and corrected selectors keep their contract without mutating saved rules',async()=>{
 const original={url:config.url,itemConfig:{
  quoted:'a[data-note="x::text"]',escaped:'a.escaped\\:\\:text',
  link:'a[data-note="x::y"]::href',title:'h2::innerText',
  tags:{selector:'.old',read:'attr',attr:'text',cardinality:'many'},
  metadata:{id:{selector:'.',read:'attr',attr:'data-id',cardinality:'one'}}}};
 const proposal={...original,itemConfig:{
  quoted:{selector:'a[data-note="y::href"]'},escaped:{selector:'a.other'},
  link:{selector:'h3 a',read:'attr',attr:'href',cardinality:'auto'},title:{selector:'h3',read:'text'},
  tags:{selector:'.new',read:'text',cardinality:'many'},
  metadata:{id:{selector:'span',read:'attr',attr:'data-id',cardinality:'one'}}}};
 const saved=structuredClone(original);
 const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});
 await f.capture.restore();
 assert.deepEqual((await f.capture.generate({...input,context:{...input.context,currentConfig:original}})).config,proposal);
 assert.deepEqual(original,saved);
});

test('provable default reads can become explicit, while selector changes cannot silently switch default data kinds',async()=>{
 for(const [beforeRule,afterRule] of [
  ['h2',{selector:'h3',read:'text'}],
  ['h2/* unit::text */',{selector:'h3',read:'text'}],
  ['h2.\\31 img',{selector:'.title',read:'text'}],
  ['h2.x\u00a0img',{selector:'.title',read:'text'}],
  ['img.cover',{selector:'img.new',read:'attr',attr:'src'}],
  ['video, audio',{selector:'.media',read:'attr',attr:'src'}],
  ['article > h2',{selector:'.title',read:'text'}],
  ['a.old',{selector:'a.new'}],
  ['.ambiguous',{selector:'.ambiguous'}]
 ]){
  const original={...config,itemConfig:{value:beforeRule}},proposal={...config,itemConfig:{value:afterRule}};
  const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});await f.capture.restore();
  assert.deepEqual((await f.capture.generate({...input,context:{...input.context,currentConfig:original}})).config,proposal);
 }
 for(const [beforeRule,afterRule] of [
  ['img',{selector:'a'}],['a',{selector:'h2'}],['a',{selector:'a',read:'text'}],
  ['.ambiguous',{selector:'.other'}],['.ambiguous',{selector:'.ambiguous',read:'text'}],
  ['h2, img',{selector:'h2',read:'text'}],
  ['.\\31 img',{selector:'.\\31 img',read:'attr',attr:'src'}],
  ['\\69 mg',{selector:'\\69 mg',read:'text'}],
  ['.x\u00a0img',{selector:'.x\u00a0img',read:'attr',attr:'src'}],
  ['h2\u00a0img',{selector:'h2\u00a0img',read:'attr',attr:'src'}]
 ]){
  const original={...config,itemConfig:{value:beforeRule}},proposal={...config,itemConfig:{value:afterRule}};
  const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});await f.capture.restore();
  await assert.rejects(f.capture.generate({...input,context:{...input.context,currentConfig:original}}),/读取/);
 }
});

test('an omitted item filter and an explicit wildcard both keep all direct children',async()=>{
 const original={...config,itemConfig:{_listContainer:'ul',title:'h2::text'}};
 const proposal={...original,itemConfig:{...original.itemConfig,_listItem:'*'}};
 const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});await f.capture.restore();
 assert.deepEqual((await f.capture.generate({...input,context:{...input.context,currentConfig:original}})).config,proposal);
});

test('an explicitly new Chinese task can replace fields but cannot change the target or approved full budget',async()=>{
 const next={...input,requirement:'采集图书链接，最多20页，只试采2页',context:{
  ...input.context,ruleIntent:'create',currentConfig:undefined,budget:{maxPages:20,previewPages:2}}};
 const proposal={url:config.url,itemConfig:{url:{selector:'a',read:'attr',attr:'href'}},maxPages:20};
 const f=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal})});await f.capture.restore();
 assert.deepEqual((await f.capture.generate(next)).config,proposal);
 for(const changed of [{...proposal,maxPages:2},{...proposal,maxPages:undefined},{...proposal,url:'https://example.org/other'}]){
  const bad=fixture({generate:async args=>({requestId:args.requestId,providerGeneration:1,proposal:changed})});await bad.capture.restore();
  await assert.rejects(bad.capture.generate(next),/预算|目标/);
  assert.equal(bad.calls.some(c=>c.op.startsWith('localTasks.')),false);
  assert.equal(bad.stored,null);
 }
});
