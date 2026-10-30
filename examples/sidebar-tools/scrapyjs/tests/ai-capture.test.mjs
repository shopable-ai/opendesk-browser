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
 assert.equal((await f.capture.cancel()).state,'unknown');
 clearGate.resolve({saved:true});assert.equal(await running,null,'Stop must suppress a proposal already awaiting pending cleanup');
});
