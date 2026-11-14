import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {verifyTaskPackage,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {assertPackagedTask} from '../../../src/platform/tasks/builtin-releases.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
const source=await readFile(new URL('../src/google-search-top3.js',import.meta.url),'utf8');
async function run({url='https://www.google.com/',challenge=false,delayedLoad=false,lateSuggestions=false,dismissError=null,clickError=null,foregroundError=null,params={query:'OpenDesk Browser',limit:3},calls=[]}={}){
  let value='',doc='before',suggestions=lateSuggestions;
  const links=[{title:'Public result one',href:'https://example.org/one'},
    {title:'Public result two',href:'/goto?url=public-result&gsessionid=transient'},
    {title:'Duplicate',href:'https://example.org/one'}];
  function locator(selector,index=0){
    const rows=selector==='#rso a:has(h3)';
    return {nth:n=>locator(selector,n),count:async()=>rows?links.length:selector.includes('[data-text-ad]')?0:1,
      isVisible:async()=>true,inputValue:async()=>value,
      fill:async text=>{calls.push({action:'fill',text});value=text;},
      click:async options=>{if(selector.includes('[aria-label="Google"]')){calls.push({action:'dismissSuggestions'});if(dismissError)throw dismissError;suggestions=false;return;}
        calls.push({action:'click',options});if(suggestions)throw Object.assign(new Error('Late suggestions cover the selected search button'),{code:'E_TIMEOUT'});if(clickError)throw clickError;url='https://www.google.com/search?q=OpenDesk+Browser';doc='after';
        if(delayedLoad&&options.waitUntil==='load')throw Object.assign(new Error('Unrelated page resources did not finish loading'),{code:'E_TIMEOUT'});},
      innerText:async()=>selector==='body'?(challenge?'unusual traffic CAPTCHA':'Public results'):selector==='h3'?links[index].title:'',
      getAttribute:async name=>name==='aria-expanded'?String(suggestions):links[index].href,waitFor:async()=>{},locator:child=>locator(child,index)};
  }
  const result=await vm.runInNewContext(source+'\nmain()',{page:{bringToFront:async(...args)=>{assert.deepEqual(args,[]);calls.push({action:'bringToFront'});if(foregroundError)throw foregroundError;},url:async()=>url,locator,
    observe:async()=>({document:{documentId:doc}})},params,URL,Date,
    setTimeout:fn=>{fn();return 0;}});
  return {calls,result:JSON.parse(JSON.stringify(result))};
}
test('Google fixed package pins exact source and approved Origin',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../releases/google.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  await verifyTaskPackage(pkg);await assertPackagedTask(pkg);assert.equal(pkg.sourceUtf8,source);
  assert.equal(pkg.manifest.version,'1.0.3');
  assert.equal(pkg.manifest.paramsSchema.required.includes('showExecutionTab'),false);
  for(const extra of [{},{showExecutionTab:true},{showExecutionTab:false}]){
    assert.equal(validateTaskParams(pkg.manifest.paramsSchema,{query:'OpenDesk Browser',limit:3,...extra}).showExecutionTab,extra.showExecutionTab!==false);
  }
  for(const value of [undefined,null,'true',0,{},[]]){
    assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{query:'OpenDesk Browser',limit:3,showExecutionTab:value}));
  }
  assert.equal(pkg.manifest.program.sourceHash,await digestUtf8(source));
  assert.deepEqual(pkg.manifest.siteOrigins,['https://www.google.com']);
  assert.deepEqual(pkg.manifest.permissions,['page.automation']);
});
test('Google enters input, submits once with explicit navigation, reads real bounded unique links',async()=>{
  const {calls,result}=await run();
  assert.deepEqual(calls.map(x=>x.action),['bringToFront','fill','dismissSuggestions','click']);
  assert.equal(calls[3].options.waitUntil,'domcontentloaded');assert.equal(result.status,'success');
  assert.equal(result.count,2);assert.equal(result.results[1].url,'https://www.google.com/goto?url=public-result');
  assert.equal(result.trace.find(x=>x.action==='input'&&x.state==='before').documentId,'before');
  assert.equal(result.trace.find(x=>x.action==='navigation').documentId,'after');
});
test('Google CAPTCHA stops before input and click',async()=>{
  const {calls,result}=await run({challenge:true});assert.equal(result.status,'blocked');assert.deepEqual(calls.map(x=>x.action),['bringToFront']);
});
test('Google reads ready search results when unrelated resources delay the page load event',async()=>{
  const {calls,result}=await run({delayedLoad:true});
  assert.equal(calls.filter(call=>call.action==='click').length,1);
  assert.equal(result.status,'success');assert.equal(result.count,2);
  assert.equal(result.trace.find(row=>row.action==='navigation').documentId,'after');
});
test('Google dismisses late suggestions before its single search submission',async()=>{
  const {calls,result}=await run({lateSuggestions:true});
  assert.equal(result.status,'success');
  assert.equal(calls.filter(call=>call.action==='click').length,1);
  assert.ok(calls.findIndex(call=>call.action==='dismissSuggestions')<calls.findIndex(call=>call.action==='click'));
});
test('Google does not submit or replay when dismissing suggestions has an unknown outcome',async()=>{
  const {calls,result}=await run({lateSuggestions:true,dismissError:Object.assign(new Error('lost dismissal ACK'),{code:'E_EFFECT_UNKNOWN'})});
  assert.equal(result.status,'stopped');assert.equal(result.error.code,'E_EFFECT_UNKNOWN');
  assert.equal(calls.filter(call=>call.action==='click').length,0);
});
test('Google lost click ACK never retries or claims results',async()=>{
  const {calls,result}=await run({clickError:Object.assign(new Error('lost ACK'),{code:'E_EFFECT_UNKNOWN'})});
  assert.equal(calls.filter(x=>x.action==='click').length,1);assert.equal(result.status,'stopped');
  assert.equal(result.count,0);assert.equal(result.trace.at(-1).code,'E_EFFECT_UNKNOWN');
});
test('Google exact result URL remains read-only; another query is rejected',async()=>{
  assert.deepEqual((await run({url:'https://www.google.com/search?q=OpenDesk+Browser'})).calls.map(x=>x.action),['bringToFront']);
  await assert.rejects(run({url:'https://www.google.com/search?q=other'}),{code:'E_TARGET'});
});


test('google showExecutionTab defaults true, accepts true, and false searches without foregrounding',async()=>{
  for(const extra of [{},{showExecutionTab:true},{showExecutionTab:false}]){
    const options={params:{query:'OpenDesk Browser',limit:3,...extra}};
    const {calls,result}=await run(options);
    const expected=['fill','dismissSuggestions','click'];
    if(extra.showExecutionTab!==false)expected.unshift('bringToFront');
    assert.deepEqual(calls.map(call=>call.action),expected);
    assert.notEqual(result.status,'stopped');
  }
});

test('google invalid parameters reject before foregrounding or searching',async()=>{
  const invalid=[
    ...[undefined,null,'true','false',0,1,{},[],()=>true].map(showExecutionTab=>({query:'OpenDesk Browser',limit:3,showExecutionTab})),
    {query:'OpenDesk Browser',limit:3,unknown:true},
    {query:'OpenDesk Browser',limit:3,showExecutionTab:false,unknown:true},
    ...['', ' ', 'a'.repeat(121), null, 3].map(query=>({query,limit:3})),
    ...[undefined,null,2,'3'].map(limit=>({query:'OpenDesk Browser',limit})),
  ];
  for(const params of invalid){
    const calls=[],options={params,calls};
    await assert.rejects(run(options),{code:'E_TASK_PARAMS'});
    assert.deepEqual(calls,[]);
  }
});

test('google target validation precedes foregrounding, including when explicitly disabled',async()=>{
  for(const url of ['https://example.com/','https://www.google.com/search?q=other']){
    for(const showExecutionTab of [true,false]){
      const calls=[],options={url,calls,params:{query:'OpenDesk Browser',limit:3,showExecutionTab}};
      await assert.rejects(run(options),{code:'E_TARGET'});
      assert.deepEqual(calls,[]);
    }
  }
});

test('google foreground failures stop without any search or replay',async()=>{
  for(const code of ['E_EFFECT_UNKNOWN','E_PERMISSION','E_DOCUMENT_REPLACED','E_TAB_CLOSED']){
    const options={foregroundError:Object.assign(new Error('foreground failed'),{code})};
    const {calls,result}=await run(options);
    assert.deepEqual(calls.map(call=>call.action),['bringToFront']);
    assert.equal(result.status,'stopped');
    assert.equal(result.error.code,code);
    assert.equal(result.count,0);
  }
});
