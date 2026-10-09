import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackagedPageSession} from '../../src/scripting/packaged/registry.js';
import {createBoundPage} from '../../src/framework/ChromePage.js';
import {encodeValue, decodeValue} from '../../src/framework/control/value.js';
import {formatRunValue, formatControllerRunResult} from '../../src/ui/run-result-presentation.js';
import {formatTaskError} from '../../src/ui/task-run-diagnostics.js';

function fixture(html, {docType = true} = {}) {
  const body = {innerHTML:html}, methods = [];
  const doc = {body,title:'Test',doctype:docType ? {name:'html',publicId:'',systemId:''} : null,
    documentElement:{get outerHTML(){return '<html><head><title>Test</title></head><body>'+body.innerHTML+'</body></html>';}}};
  const controller=new AbortController();
  const registry=createPackagedPageSession({document:doc,window:{location:{href:'https://example.test/'}},signal:controller.signal});
  let onRequest=()=>{};
  const page=createBoundPage({environment:'CHROME',capture:()=>({documentId:'doc-1'}),guard:()=>{},
    request:async(method,args)=>{
      methods.push(method);
      onRequest(method);
      return decodeValue(encodeValue(await registry.execute(method,decodeValue(encodeValue(args)))));
    }});
  return {doc,body,registry,controller,page,methods,set onRequest(fn){onRequest=fn;},
    dispose(){controller.abort();registry.dispose();}};
}
const htmlFor=body=>'<!DOCTYPE html><html><head><title>Test</title></head><body>'+body+'</body></html>';

test('Playwright page.content() returns full HTML and page.url() remains independent',async t=>{
  const f=fixture('<span>您好😀</span>');t.after(()=>f.dispose());
  assert.equal(await f.page.content(),htmlFor('<span>您好😀</span>'));
  assert.equal(await f.page.url(),'https://example.test/');
  assert.equal(await f.page.title(),'Test');
  assert.deepEqual(f.methods.slice(0,4),['contentOpen','contentClose','url','title']);
});

test('legacy nonstandard public HTML options are rejected rather than silently truncated',async t=>{
  const f=fixture('<p>hello</p>');t.after(()=>f.dispose());
  await assert.rejects(f.page.content({maxChars:4000}),{code:'E_OPTION_UNSUPPORTED'});
  assert.equal(typeof f.page.contentChunks,'undefined');
  assert.deepEqual(f.methods,[]);
});

test('large HTML automatically uses sequential small frames without caller code changes',async t=>{
  const body='中😀"'.repeat(16000)+'<script>hi()</script>';
  const f=fixture(body);t.after(()=>f.dispose());
  assert.equal(await f.page.content(),htmlFor(body));
  assert(f.methods.includes('contentRead'));
  assert.equal(f.methods.filter(m=>m==='contentOpen').length,1);
  assert.equal(f.methods.filter(m=>m==='contentClose').length,1);
});

test('snapshot is immutable during dynamic DOM changes and cleans up afterwards',async t=>{
  const before='A'.repeat(22000)+'😀',f=fixture(before);t.after(()=>f.dispose());
  f.onRequest=(method)=>{if(method==='contentRead') f.body.innerHTML='SPA changed';};
  assert.equal(await f.page.content(),htmlFor(before));
  assert.equal(await f.page.content(),htmlFor('SPA changed'));
});

test('surrogate pairs remain valid across 8192-code-unit chunk boundaries',async t=>{
  const body='a'.repeat(8150)+'😀'+'z'.repeat(22000),f=fixture(body);t.after(()=>f.dispose());
  assert.equal(await f.page.content(),htmlFor(body));
});

test('8MiB cap rejects enormous snapshots without leaving a live snapshot',async t=>{
  const f=fixture('x'.repeat(9*1024*1024));t.after(()=>f.dispose());
  await assert.rejects(f.page.content(),{code:'E_PAGE_CONTENT_TOO_LARGE'});
  f.body.innerHTML='ok';
  assert.equal(await f.page.content(),htmlFor('ok'));
});

test('internal content reads enforce order and existing cancellation contract',async t=>{
  const f=fixture('a'.repeat(35000));t.after(()=>f.dispose());
  const p=await f.registry.execute('contentOpen',[8192]);
  await assert.rejects(f.registry.execute('contentRead',[p.snapshotId,0,8192]),{code:'E_PAGE_CONTENT_SEQUENCE'});
  await assert.rejects(f.registry.execute('contentRead',['unknown',p.nextOffset,8192]),{code:'E_PAGE_CONTENT_EXPIRED'});
  await f.registry.execute('contentClose',[p.snapshotId]);
  f.controller.abort();
  await assert.rejects(f.registry.execute('contentOpen',[8192]),{code:'E_CANCELLED'});
});

test('generic Sidebar result presentation keeps actual dynamic value and safe error advice',()=>{
  assert.equal(formatRunValue('plain text'),'plain text');
  assert.equal(formatRunValue(false),'false');
  assert.equal(formatRunValue(undefined),'undefined');
  assert.equal(formatRunValue({n:-0,v:undefined}),'{\n  "n": -0,\n  "v": undefined\n}');
  assert.equal(formatControllerRunResult([{runId:'a',value:{x:2}},{runId:'b',value:{x:3}}],'a'),'{\n  "x": 2\n}');
  assert.equal(formatControllerRunResult([{runId:'a',value:'private'}],'a',['a']).includes('无权查看'),true);
  assert.match(formatTaskError({code:'E_PAGE_CONTENT_TOO_LARGE',message:'HTML too large'}),/8 MiB/);
  assert.doesNotMatch(formatTaskError({code:'E_VALUE_SERIALIZATION',message:'Wire byte budget exceeded'}),/contentChunks/);
});
