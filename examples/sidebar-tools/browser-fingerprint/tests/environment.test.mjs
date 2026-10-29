import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnvironmentReading,snapshotFromReading} from '../src/model.js';
import {createAdapter} from '../src/adapter.js';
const ctx={status:'available',url:'https://example.test/path',title:'Target',tabRef:'tab-aaaaaaaaaaaaaaaa',documentRef:'doc-aaaaaaaaaaaaaaaa'};
const receipt=()=>({...Object.fromEntries(['tabRef','documentRef'].map(k=>[k,ctx[k]])),capturedAt:'2026-10-29T06:00:00.000Z',
  source:{kind:'target-page-js',world:'MAIN',frameId:0},fields:Object.fromEntries(Object.entries({userAgent:'target UA',languages:['zh-CN','en'],timeZone:'Asia/Shanghai',viewport:{width:1200,height:800},screen:{width:1920,height:1080},devicePixelRatio:1.5}).map(([key,value])=>[key,{status:'available',value,reasonCode:null}]))});
const options={id:'reading-1',at:'2026-10-29T06:00:00.000Z'};
test('six target page fields share one strict live receipt, independently of old history',()=>{
 const r=makeEnvironmentReading(ctx,receipt(),options);
 assert.equal(r.completeness,'core-complete');
 assert.equal(r.fields.find(x=>x.key==='userAgent').value,'target UA');
 assert.equal(r.fields.find(x=>x.key==='screen').source,'target-page-js:MAIN');
 assert.throws(()=>snapshotFromReading(r),e=>e.code==='E_HISTORY_SCHEMA');
});
test('foreign document/tab, false source, bad values or hidden fields are rejected',()=>{
 for(const mutate of [r=>r.documentRef='doc-bbbbbbbbbbbbbbbb',r=>r.tabRef='tab-bbbbbbbbbbbbbbbb',r=>r.source.world='ISOLATED',r=>r.source.frameId=1,r=>r.source.kind='sidebar',r=>r.fields.ip={},r=>r.fields.devicePixelRatio.value=-1,r=>r.fields.languages.value=['x'.repeat(65)],r=>r.fields.userAgent.value='中'.repeat(400),r=>r.url=ctx.url]){
  const r=receipt();mutate(r);assert.throws(()=>makeEnvironmentReading(ctx,r,options),e=>e.code==='E_ENVIRONMENT_RECEIPT');
 }
});
test('unknown/unavailable stay null and preview stays visibly non-live',()=>{
 const r=receipt();r.fields.timeZone={status:'unavailable',value:null,reasonCode:'E_FIELD_UNAVAILABLE'};
 r.fields.viewport={status:'unknown',value:null,reasonCode:'E_VALUE_INVALID'};
 const reading=makeEnvironmentReading(ctx,r,{...options,preview:true});
 assert.equal(reading.mode,'PREVIEW');assert.equal(reading.completeness,'partial');
 for(const key of ['timeZone','viewport']){const f=reading.fields.find(x=>x.key===key);assert.equal(f.value,null);assert.equal(f.source,'preview-fixture');}
});
test('adapter requests SDK document refs without reading the iframe environment',async()=>{
 const calls=[],adapter=createAdapter({request:async(...args)=>{calls.push(args);return args[0]==='browser.page.getContext'?ctx:receipt();}});
 await adapter.environment(await adapter.context());
 assert.deepEqual(calls,[['browser.page.getContext',{}],['browser.page.readEnvironment',{tabRef:ctx.tabRef,documentRef:ctx.documentRef}]]);
});
