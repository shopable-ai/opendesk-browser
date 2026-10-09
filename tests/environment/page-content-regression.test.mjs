import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackagedPageSession} from '../../src/scripting/packaged/registry.js';
import {createBoundPage} from '../../src/framework/ChromePage.js';
import {encodeValue, decodeValue} from '../../src/framework/control/value.js';
import {formatRunValue, formatControllerRunResult} from '../../src/ui/run-result-presentation.js';
import {formatTaskError} from '../../src/ui/task-run-diagnostics.js';

function fixture(html) {
  const doc = {body:{innerHTML:html},title:'Test'};
  const controller = new AbortController();
  const registry = createPackagedPageSession({document:doc,window:{location:{href:'https://example.test/'}},signal:controller.signal});
  const methods = [];
  const page = createBoundPage({environment:'CHROME',request:async(method,args)=>{
    methods.push(method);
    // Exercise both actual Control Value boundaries, not an unbounded stub reply.
    const decoded = decodeValue(encodeValue(args));
    return decodeValue(encodeValue(await registry.execute(method,decoded)));
  }});
  return {doc,controller,registry,page,methods,dispose:()=>{controller.abort();registry.dispose();}};
}

test('small legacy HTML and URL are distinct; oversize legacy HTML emits domain-specific error',async t=>{
  const f=fixture('<span>good</span>');t.after(f.dispose);
  assert.equal(await f.page.content(),'<span>good</span>');
  assert.equal(await f.page.url(),'https://example.test/');
  assert.equal(await f.page.title(),'Test');
  f.doc.body.innerHTML='x'.repeat(90000);
  await assert.rejects(f.page.content(),error=>error.code==='E_PAGE_CONTENT_TOO_LARGE');
  assert.equal((await f.page.content({maxChars:4000})).length,4000);
  assert.deepEqual(f.methods.slice(-2),['content','content']);
});
test('bounded content requires explicit safe limits and never slices after an oversized reply',async t=>{
  const f=fixture('x'.repeat(100000)+'😀');t.after(f.dispose);
  for (const opts of [{},{maxChars:1},{maxChars:8193},{maxChars:NaN},{maxChars:'4000'},{maxChars:2,extra:true}])
    await assert.rejects(Promise.resolve().then(()=>f.page.content(opts)),error=>['E_ARGUMENT_TYPE','E_OPTION_UNSUPPORTED'].includes(error.code));
  assert.equal(await f.page.content({maxChars:8192}),'x'.repeat(8192));
});
test('chunk reader reassembles exactly one body snapshot even when SPA mutates the DOM',async t=>{
  const html='中😀"'.repeat(14000)+'<script>alert(1)</script>';
  const f=fixture(html);t.after(f.dispose);
  const iterator=f.page.contentChunks({chunkChars:8192});
  const first=await iterator.next();
  assert.equal(first.done,false);
  f.doc.body.innerHTML='CHANGED';
  let assembled=first.value,segments=1;
  for await (const chunk of iterator){assembled+=chunk;segments++;assert(segments<50);}
  assert.equal(assembled,html);
  assert(segments>1);
  assert(f.methods.includes('contentOpen')&&f.methods.includes('contentRead')&&f.methods.includes('contentClose'));
});
test('split surrogate pair boundaries are repaired without losing characters',async t=>{
  const html='a'.repeat(8191)+'😀'+'z'.repeat(9000);
  const f=fixture(html);t.after(f.dispose);
  let total='';
  for await (const chunk of f.page.contentChunks({chunkChars:8192})) total+=chunk;
  assert.equal(total,html);
  assert.equal(await f.page.content({maxChars:8192}),'a'.repeat(8191));
});
test('early iterator return and abort release content snapshots',async t=>{
  const f=fixture('a'.repeat(100000));t.after(f.dispose);
  for await(const chunk of f.page.contentChunks()){ assert(chunk.length>0);break; }
  assert.equal((await f.registry.execute('contentOpen',[2048])).done,false,'break cleaned previous snapshot');
  const busy=f.registry.execute('contentOpen',[2048]);await assert.rejects(busy,error=>error.code==='E_PAGE_CONTENT_BUSY');
  f.controller.abort();
  await assert.rejects(f.registry.execute('contentRead',['bogus',0,2048]),error=>error.code==='E_CANCELLED');
});
test('session prevents unbounded snapshot retention, replay, random offsets and invalid order',async t=>{
  const f=fixture('x'.repeat(9*1024*1024));t.after(f.dispose);
  await assert.rejects(f.registry.execute('contentOpen',[8192]),e=>e.code==='E_PAGE_CONTENT_TOO_LARGE');
  f.doc.body.innerHTML='正常'.repeat(8000);
  const first=await f.registry.execute('contentOpen',[100]);
  assert(first.snapshotId&&first.totalChars===16000);
  await assert.rejects(f.registry.execute('contentRead',[first.snapshotId,0,100]),e=>e.code==='E_PAGE_CONTENT_SEQUENCE');
  await assert.rejects(f.registry.execute('contentRead',['different',first.nextOffset,100]),e=>e.code==='E_PAGE_CONTENT_EXPIRED');
  const second=await f.registry.execute('contentRead',[first.snapshotId,first.nextOffset,100]);
  assert(second.nextOffset>first.nextOffset);
  await f.registry.execute('contentClose',[first.snapshotId]);
  await assert.rejects(f.registry.execute('contentRead',[first.snapshotId,second.nextOffset,100]),e=>e.code==='E_PAGE_CONTENT_EXPIRED');
});
test('chunk size is strictly bounded below the codec budget, including CJK and escaped HTML',async t=>{
  const f=fixture('\\\\\"中😀'.repeat(12000));t.after(f.dispose);
  let pieces=0;
  for await(const html of f.page.contentChunks()){pieces++;assert(encodeValue({html}), 'piece encoded');}
  assert(pieces>1);
});
test('dynamic result view shows original values, not controller envelope; errors have actionable advice',()=>{
  assert.equal(formatRunValue('plain text'),'plain text');
  assert.equal(formatRunValue(false),'false');
  assert.equal(formatRunValue(undefined),'undefined');
  assert.equal(formatRunValue({title:'A',value:undefined,n:-0}),'{\n  "title": "A",\n  "value": undefined,\n  "n": -0\n}');
  assert.equal(formatRunValue('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
  assert.equal(formatControllerRunResult([{runId:'a',value:{x:2}},{runId:'b',value:{x:3}}],'a'),'{\n  "x": 2\n}');
  assert.equal(formatControllerRunResult([{runId:'a',value:'private'}],'a',['a']).includes('无权查看'),true);
  const message=formatTaskError({code:'E_PAGE_CONTENT_TOO_LARGE',message:'HTML exceeds budget'});
  assert.match(message,/page.contentChunks\(\)/);
  assert.match(formatTaskError({code:'E_VALUE_SERIALIZATION',message:'Wire byte budget exceeded'}),/64 KiB/);
});
