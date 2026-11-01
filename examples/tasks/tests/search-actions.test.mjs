import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function run(file, options = {}) {
  const calls = [], pauses = [], observations = [], clickOptions = [];
  let url = options.url ?? 'https://www.baidu.com/';
  let value = options.initialValue ?? '';
  let now = Date.parse('2026-11-01T00:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const page = {
    observe:async opts=>{
      observations.push(JSON.parse(JSON.stringify(opts)));
      const id=options.documents === null ? undefined : calls.includes('click') ? 'observed-after' : 'observed-before';
      return {document:{documentId:id}};
    },
    url:async()=>{
      if(calls.includes('click') && options.urlErrorAfterClick)throw options.urlErrorAfterClick;
      return url;
    },
    locator(selector) {
      const field = selector === '#chat-textarea' || selector === '#kw';
      return {
        count:async()=>field ? 1 : selector.includes('.result.c-container') ? 0 : 1,
        isVisible:async()=>selector === '#chat-textarea' ? options.modern !== false : true,
        inputValue:async()=>value,
        fill:async text=>{
          calls.push('fill');
          if(options.fillError)throw options.fillError;
          value=options.entered ?? text;
        },
        click:async opts=>{
          calls.push('click');
          clickOptions.push(JSON.parse(JSON.stringify(opts)));
          if(options.clickError)throw options.clickError;
          if(!options.noNavigation)url=options.nextUrl ?? 'https://www.baidu.com/s?wd=OpenDesk%20Browser';
        },
        waitFor:async()=>{calls.push('results.wait');if(options.waitError)throw options.waitError;},
        innerText:async()=>options.blocked ? '安全验证 请输入验证码' : '搜索结果',
        getAttribute:async()=>null,
      };
    },
  };
  const source = await readFile(new URL('../'+file,import.meta.url),'utf8');
  const result = await vm.runInNewContext(source+'\nmain()',{
    page,params:options.params ?? {query:'OpenDesk Browser',limit:3},URL,Date:Clock,TextEncoder,
    setTimeout:(fn,ms)=>{pauses.push(ms);now+=ms;fn();return 0;},
  });
  return {result:JSON.parse(JSON.stringify(result)),calls,pauses,observations,clickOptions};
}

test('Baidu homepage fills and commits one search, with actual readback and navigation trace',async()=>{
  const {result,calls,pauses,clickOptions}=await run('baidu-search-top3.js');
  assert.deepEqual(calls,['fill','click','results.wait']);
  assert.deepEqual(pauses,[3000,3000]);
  assert.deepEqual(clickOptions,[{timeout:10000}]);
  assert.equal(result.trace.find(x=>x.action==='input'&&x.state==='returned').value,'OpenDesk Browser');
  assert.match(result.sourceUrl,/\/s\?wd=OpenDesk%20Browser/);
  assert.equal(result.trace.filter(x=>x.action==='click'&&x.state==='started').length,1);
  assert.equal(result.trace.filter(x=>x.action==='click'&&x.state==='returned').length,1);
  assert.equal(result.trace.find(x=>x.action==='navigation'&&x.state==='observed').url,result.sourceUrl);
});

test('Baidu challenge stops before input or search submission',async()=>{
  const {result,calls}=await run('baidu-search-top3.js',{blocked:true});
  assert.deepEqual(calls,[]);
  assert.equal(result.status,'blocked');
});

test('Baidu unknown click is recorded and never retried or followed by result reads',async()=>{
  const {result,calls}=await run('baidu-search-top3.js',{
    clickError:Object.assign(new Error('ack lost'),{code:'E_EFFECT_UNKNOWN'}),
  });
  assert.deepEqual(calls,['fill','click']);
  assert.equal(result.status,'stopped');
  assert.equal(result.trace.at(-1).code,'E_EFFECT_UNKNOWN');
  assert.equal(result.trace.some(x=>x.action==='click'&&x.state==='returned'),false);
});

test('existing Baidu result-page entry stays read-only',async()=>{
  const {calls}=await run('baidu-search-top3.js',{url:'https://www.baidu.com/s?wd=OpenDesk%20Browser'});
  assert.deepEqual(calls,['results.wait']);
});

test('Baidu rejects a different target origin before any search action',async()=>{
  await assert.rejects(run('baidu-search-top3.js',{url:'https://example.com/'}),{code:'E_TARGET'});
});

test('legacy Baidu homepage uses the visible legacy field and one submit',async()=>{
  const {result,calls}=await run('baidu-search-top3.js',{modern:false});
  assert.deepEqual(calls,['fill','click','results.wait']);
  assert.equal(result.trace.find(x=>x.action==='input'&&x.state==='returned').locator,'#kw');
  assert.equal(result.trace.find(x=>x.action==='click'&&x.state==='started').locator,'#su');
});

test('unknown fill and mismatched readback stop before any search submission',async()=>{
  for(const options of [
    {fillError:Object.assign(new Error('fill ack lost'),{code:'E_EFFECT_UNKNOWN'})},
    {entered:'different value'},
  ]){
    const {result,calls}=await run('baidu-search-top3.js',options);
    assert.deepEqual(calls,['fill']);
    assert.equal(result.status,'stopped');
    assert.equal(result.trace.some(x=>x.action==='click'),false);
  }
});

test('navigation trace never claims an unobserved or different query',async()=>{
  for(const options of [{noNavigation:true},{nextUrl:'https://www.baidu.com/s?wd=other'}]){
    const {result,calls}=await run('baidu-search-top3.js',options);
    assert.deepEqual(calls,['fill','click']);
    assert.equal(result.status,'stopped');
    assert.equal(result.error.code,'E_SEARCH_NAVIGATION');
    assert.equal(result.trace.some(x=>x.action==='navigation'&&x.state==='observed'),false);
  }
});

test('document replacement and permission loss after a click never cause a second action',async()=>{
  for(const code of ['E_DOCUMENT_REPLACED','E_PERMISSION']){
    const {result,calls}=await run('baidu-search-top3.js',{
      urlErrorAfterClick:Object.assign(new Error('page binding lost'),{code}),
    });
    assert.deepEqual(calls,['fill','click']);
    assert.equal(result.status,'stopped');
    assert.equal(result.error.code,code);
    assert.equal(result.trace.some(x=>x.action==='navigation'&&x.state==='observed'),false);
  }
});

test('only search-area timeout is classified as DOM unavailable',async()=>{
  for(const code of ['E_DOCUMENT_REPLACED','E_EFFECT_UNKNOWN','E_PERMISSION']){
    const {result}=await run('baidu-search-top3.js',{
      url:'https://www.baidu.com/s?wd=OpenDesk%20Browser',
      waitError:Object.assign(new Error('read fenced'),{code}),
    });
    assert.equal(result.status,'stopped');
    assert.equal(result.error.code,code);
  }
});

test('records only document IDs returned by public bounded observation before and after search',async()=>{
  const {result,observations}=await run('baidu-search-top3.js');
  assert.deepEqual(observations,[
    {root:'body',maxDepth:1,maxNodes:1,maxChars:256},
    {root:'body',maxDepth:1,maxNodes:1,maxChars:256},
  ]);
  assert.equal(result.trace.find(x=>x.action==='input'&&x.state==='before').documentId,'observed-before');
  assert.equal(result.trace.find(x=>x.action==='navigation'&&x.state==='observed').documentId,'observed-after');
  const missing=await run('baidu-search-top3.js',{documents:null});
  assert.equal(missing.result.trace.some(x=>Object.hasOwn(x,'documentId')),false);
});

test('does not invent an after-document observation for an unknown click',async()=>{
  const {result,observations}=await run('baidu-search-top3.js',{
    clickError:Object.assign(new Error('ack lost'),{code:'E_EFFECT_UNKNOWN'}),
  });
  assert.equal(observations.length,1);
  assert.deepEqual(result.trace.filter(x=>x.documentId).map(x=>x.documentId),['observed-before']);
});

test('bounds old input samples and omits oversized source URLs without inventing shortened URLs',async()=>{
  const {result}=await run('baidu-search-top3.js',{initialValue:'旧值'.repeat(10000)});
  const before=result.trace.find(x=>x.action==='input'&&x.state==='before');
  assert.ok([...before.value].length<=120);
  assert.equal(before.valueTruncated,true);
  assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=6144);
  const longUrl=await run('baidu-search-top3.js',{
    url:'https://www.baidu.com/s?wd=OpenDesk%20Browser&extra='+'a'.repeat(2000),
  });
  assert.equal(Object.hasOwn(longUrl.result,'sourceUrl'),false);
  assert.equal(longUrl.result.sourceUrlOmitted,true);
  assert.ok(Buffer.byteLength(JSON.stringify(longUrl.result),'utf8')<=6144);
});
