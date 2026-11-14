import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {verifyTaskPackage,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {assertPackagedTask} from '../../../src/platform/tasks/builtin-releases.js';

async function run(file, options = {}) {
  const calls = options.calls ?? [], pauses = [], observations = [], clickOptions = [];
  let url = options.url ?? 'https://www.baidu.com/';
  let value = options.initialValue ?? '';
  let now = Date.parse('2026-11-01T00:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const page = {
    bringToFront:async (...args)=>{
      assert.deepEqual(args,[]);calls.push('bringToFront');
      if(options.foregroundError)throw options.foregroundError;
    },
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
        nth(){return this;},
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
  const source = await readFile(new URL('../src/'+file,import.meta.url),'utf8');
  const result = await vm.runInNewContext(source+'\nmain()',{
    page,params:options.params ?? {query:'OpenDesk Browser',limit:3},URL,Date:Clock,TextEncoder,
    setTimeout:(fn,ms)=>{pauses.push(ms);now+=ms;fn();return 0;},
  });
  return {result:JSON.parse(JSON.stringify(result)),calls,pauses,observations,clickOptions};
}

test('Baidu homepage fills and commits one search, with actual readback and navigation trace',async()=>{
  const {result,calls,pauses,clickOptions}=await run('baidu-search-top3.js');
  assert.deepEqual(calls,['bringToFront','fill','click','results.wait']);
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
  assert.deepEqual(calls,['bringToFront',]);
  assert.equal(result.status,'blocked');
});

test('Baidu unknown click is recorded and never retried or followed by result reads',async()=>{
  const {result,calls}=await run('baidu-search-top3.js',{
    clickError:Object.assign(new Error('ack lost'),{code:'E_EFFECT_UNKNOWN'}),
  });
  assert.deepEqual(calls,['bringToFront','fill','click']);
  assert.equal(result.status,'stopped');
  assert.equal(result.trace.at(-1).code,'E_EFFECT_UNKNOWN');
  assert.equal(result.trace.some(x=>x.action==='click'&&x.state==='returned'),false);
});

test('existing Baidu result-page entry never resubmits search',async()=>{
  const {calls}=await run('baidu-search-top3.js',{url:'https://www.baidu.com/s?wd=OpenDesk%20Browser'});
  assert.deepEqual(calls,['bringToFront','results.wait']);
});

test('Baidu rejects a different target origin before any search action',async()=>{
  await assert.rejects(run('baidu-search-top3.js',{url:'https://example.com/'}),{code:'E_TARGET'});
});

test('legacy Baidu homepage uses the visible legacy field and one submit',async()=>{
  const {result,calls}=await run('baidu-search-top3.js',{modern:false});
  assert.deepEqual(calls,['bringToFront','fill','click','results.wait']);
  assert.equal(result.trace.find(x=>x.action==='input'&&x.state==='returned').locator,'#kw');
  assert.equal(result.trace.find(x=>x.action==='click'&&x.state==='started').locator,'#su');
});

test('unknown fill and mismatched readback stop before any search submission',async()=>{
  for(const options of [
    {fillError:Object.assign(new Error('fill ack lost'),{code:'E_EFFECT_UNKNOWN'})},
    {entered:'different value'},
  ]){
    const {result,calls}=await run('baidu-search-top3.js',options);
    assert.deepEqual(calls,['bringToFront','fill']);
    assert.equal(result.status,'stopped');
    assert.equal(result.trace.some(x=>x.action==='click'),false);
  }
});

test('navigation trace never claims an unobserved or different query',async()=>{
  for(const options of [{noNavigation:true},{nextUrl:'https://www.baidu.com/s?wd=other'}]){
    const {result,calls}=await run('baidu-search-top3.js',options);
    assert.deepEqual(calls,['bringToFront','fill','click']);
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
    assert.deepEqual(calls,['bringToFront','fill','click']);
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


test('baidu showExecutionTab defaults true, accepts true, and false searches without foregrounding',async()=>{
  for(const extra of [{},{showExecutionTab:true},{showExecutionTab:false}]){
    const options={params:{query:'OpenDesk Browser',limit:3,...extra}};
    const {calls,result}=await run('baidu-search-top3.js',options);
    const expected=['fill','click','results.wait'];
    if(extra.showExecutionTab!==false)expected.unshift('bringToFront');
    assert.deepEqual(calls,expected);
    assert.notEqual(result.status,'stopped');
  }
});

test('baidu invalid parameters reject before foregrounding or searching',async()=>{
  const invalid=[
    ...[undefined,null,'true','false',0,1,{},[],()=>true].map(showExecutionTab=>({query:'OpenDesk Browser',limit:3,showExecutionTab})),
    {query:'OpenDesk Browser',limit:3,unknown:true},
    {query:'OpenDesk Browser',limit:3,showExecutionTab:false,unknown:true},
    ...['', ' ', 'a'.repeat(121), null, 3].map(query=>({query,limit:3})),
    ...[undefined,null,2,'3'].map(limit=>({query:'OpenDesk Browser',limit})),
  ];
  for(const params of invalid){
    const calls=[],options={params,calls};
    await assert.rejects(run('baidu-search-top3.js',options),{code:'E_TASK_PARAMS'});
    assert.deepEqual(calls,[]);
  }
});

test('baidu target validation precedes foregrounding, including when explicitly disabled',async()=>{
  for(const url of ['https://example.com/','https://www.baidu.com/s?wd=other']){
    for(const showExecutionTab of [true,false]){
      const calls=[],options={url,calls,params:{query:'OpenDesk Browser',limit:3,showExecutionTab}};
      await assert.rejects(run('baidu-search-top3.js',options),{code:'E_TARGET'});
      assert.deepEqual(calls,[]);
    }
  }
});

test('baidu foreground failures stop without any search or replay',async()=>{
  for(const code of ['E_EFFECT_UNKNOWN','E_PERMISSION','E_DOCUMENT_REPLACED','E_TAB_CLOSED']){
    const options={foregroundError:Object.assign(new Error('foreground failed'),{code})};
    const {calls,result}=await run('baidu-search-top3.js',options);
    assert.deepEqual(calls,['bringToFront']);
    assert.equal(result.status,'stopped');
    assert.equal(result.error.code,code);
    assert.equal(result.count,0);
  }
});


test('Baidu package matches source, version, schema defaults, and builtin release pins',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../releases/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  await verifyTaskPackage(pkg);
  await assertPackagedTask(pkg);
  assert.equal(pkg.sourceUtf8,await readFile(new URL('../src/baidu-search-top3.js',import.meta.url),'utf8'));
  assert.equal(pkg.manifest.version,'1.1.5');
  assert.deepEqual(pkg.manifest.siteOrigins,['https://www.baidu.com']);
  assert.deepEqual(pkg.manifest.permissions,['page.automation']);
  assert.equal(pkg.manifest.paramsSchema.required.includes('showExecutionTab'),false);
  for(const extra of [{},{showExecutionTab:true},{showExecutionTab:false}]){
    assert.equal(validateTaskParams(pkg.manifest.paramsSchema,{query:'OpenDesk Browser',limit:3,...extra}).showExecutionTab,extra.showExecutionTab!==false);
  }
  for(const value of [undefined,null,'true',0,{},[]]){
    assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{query:'OpenDesk Browser',limit:3,showExecutionTab:value}));
  }
});
