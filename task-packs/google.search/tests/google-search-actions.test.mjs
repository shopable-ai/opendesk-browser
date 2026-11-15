import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {verifyTaskPackage,validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {assertPackagedTask} from '../../../src/platform/tasks/builtin-releases.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
const source=await readFile(new URL('../src/google-search-top3.js',import.meta.url),'utf8');
async function run({url='https://www.google.com/',challenge=false,foregroundError=null,navigationError=null,navigationUrl=null,
  resultsError=null,bodyText='Public results',empty=false,params={query:'OpenDesk Browser',limit:3},calls=[]}={}){
  let doc='before';
  const links=empty?[]:[{title:'Public result one',href:'https://example.org/one'},
    {title:'Public result two',href:'/goto?url=public-result&gsessionid=transient'},
    {title:'Duplicate',href:'https://example.org/one'}];
  function locator(selector,index=0){
    const rows=selector==='#rso a:has(h3)';
    return {nth:n=>locator(selector,n),count:async()=>rows?links.length:selector.includes('[data-text-ad]')?0:1,
      isVisible:async()=>true,
      innerText:async()=>selector==='body'?(challenge?'unusual traffic CAPTCHA':bodyText):selector==='h3'?links[index].title:'',
      getAttribute:async()=>links[index].href,
      waitFor:async()=>{if(resultsError)throw resultsError;},locator:child=>locator(child,index)};
  }
  const result=await vm.runInNewContext(source+'\nmain()',{page:{bringToFront:async(...args)=>{
    assert.deepEqual(args,[]);calls.push({action:'bringToFront'});if(foregroundError)throw foregroundError;},
    goto:async(next,options)=>{calls.push({action:'goto',url:next,options});if(navigationError)throw navigationError;url=navigationUrl||next;doc='after';},
    url:async()=>url,locator,observe:async()=>({document:{documentId:doc}})},params,URL,Date});
  return {calls,result:JSON.parse(JSON.stringify(result))};
}
test('Google fixed package pins exact source and approved Origin',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../releases/google.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  await verifyTaskPackage(pkg);await assertPackagedTask(pkg);assert.equal(pkg.sourceUtf8,source);
  assert.equal(pkg.manifest.version,'1.0.7');
  for(const extra of [{},{showExecutionTab:true},{showExecutionTab:false}]){
    assert.equal(validateTaskParams(pkg.manifest.paramsSchema,{query:'OpenDesk Browser',limit:3,...extra}).showExecutionTab,extra.showExecutionTab!==false);
  }
  for(const value of [undefined,null,'true',0,{},[]])assert.throws(()=>validateTaskParams(pkg.manifest.paramsSchema,{query:'OpenDesk Browser',limit:3,showExecutionTab:value}));
  assert.equal(pkg.manifest.program.sourceHash,await digestUtf8(source));
  assert.deepEqual(pkg.manifest.siteOrigins,['https://www.google.com']);
  assert.deepEqual(pkg.manifest.permissions,['page.automation']);
});
test('Google historical package identities remain immutable',async()=>{
  for(const [version,sourceHash,manifestHash] of [
    ['1.0.4','1ef5f4768d600cea280a1cc1e9cdc5c5ad92b8fad6005c3e6a7b441d212a6873','0c21ede180cb74156d87d15ba46e88d82ac290133c5badc521aa56d8c687215b'],
    ['1.0.5','515e287e32a8e85bc7db887529efa4c76e00ede1f50c14dadd30b7ef6e986f3c','494d831de8ef55517b58df5147ba6b9a7b9d575f059a1a3c492e34bebb6ed79f'],
    ['1.0.6','134cdc2a58a7f3d389a8db1b2a00967bfb6aa1d358dd95f9b104a27b83cd7a0f','b490addb1c57d1f983df85782afb547aef8168cd35498dd8b421531de1220c8b']]){
    const pkg=JSON.parse(await readFile(new URL(`../releases/google.search.top3.${version}.opendesk-task.json`,import.meta.url),'utf8'));
    await verifyTaskPackage(pkg);await assertPackagedTask(pkg);
    assert.equal(pkg.manifest.version,version);assert.equal(pkg.manifest.program.sourceHash,sourceHash);assert.equal(pkg.manifestHash,manifestHash);
  }
});
test('Google normal homepage entries search once without autocomplete or button dependencies',async()=>{
  for(const url of ['https://www.google.com/','https://www.google.com/webhp?hl=zh-CN&sa=X&ved=public-navigation','https://www.google.com/?hl=zh-CN']){
    const {calls,result}=await run({url,params:{query:'时间清单 & + #',limit:3}});
    assert.deepEqual(calls.map(x=>x.action),['bringToFront','goto']);
    assert.equal(new URL(calls[1].url).searchParams.get('q'),'时间清单 & + #');
    assert.equal(calls[1].options.waitUntil,'domcontentloaded');
    assert.equal(result.status,'success');assert.equal(result.count,2);
    assert.equal(result.results[1].url,'https://www.google.com/goto?url=public-result');
    assert.equal(result.trace.find(x=>x.state==='observed').documentId,'after');
  }
});
test('Google repeated exact query is read-only; changing keywords makes one direct search navigation',async()=>{
  assert.deepEqual((await run({url:'https://www.google.com/search?q=OpenDesk+Browser'})).calls.map(x=>x.action),['bringToFront']);
  const {calls,result}=await run({url:'https://www.google.com/search?q=other',params:{query:'番茄钟',limit:3}});
  assert.deepEqual(calls.map(x=>x.action),['bringToFront','goto']);
  assert.equal(calls[1].url,'https://www.google.com/search?q=%E7%95%AA%E8%8C%84%E9%92%9F');assert.equal(result.status,'success');
});
test('Google navigation failure or unknown ACK rejects without replay or a success object',async()=>{
  for(const code of ['E_EFFECT_UNKNOWN','E_PERMISSION','E_DOCUMENT_REPLACED','E_TIMEOUT']){
    const calls=[];
    await assert.rejects(run({calls,navigationError:Object.assign(Error('navigation failed'),{code})}),{code});
    assert.deepEqual(calls.map(x=>x.action),['bringToFront','goto']);
  }
});
test('Google redirected or mismatched search destinations never claim results or replay',async()=>{
  for(const navigationUrl of ['https://elsewhere.example/','https://www.google.com/maps','https://www.google.com/search?q=other',
    'https://user:pass@www.google.com/search?q=OpenDesk+Browser','https://www.google.com/webhp']){
    const calls=[];await assert.rejects(run({calls,navigationUrl}),{code:'E_TARGET'});
    assert.deepEqual(calls.map(x=>x.action),['bringToFront','goto']);
  }
});
test('Google CAPTCHA stops before any search navigation',async()=>{
  const calls=[];await assert.rejects(run({calls,challenge:true}),{code:'E_SEARCH_BLOCKED'});
  assert.deepEqual(calls.map(x=>x.action),['bringToFront']);
});
test('Google missing results reject, while an explicit no-results page remains a valid empty result',async()=>{
  const timeout=Object.assign(Error('Results not ready'),{code:'E_TIMEOUT'});
  await assert.rejects(run({resultsError:timeout}),{code:'E_TIMEOUT'});
  await assert.rejects(run({empty:true}),{code:'E_SEARCH_RESULTS'});
  const {result}=await run({resultsError:timeout,bodyText:'did not match any documents'});
  assert.equal(result.status,'no_results');assert.equal(result.count,0);
});
test('Google showExecutionTab defaults true and false searches without foregrounding',async()=>{
  for(const extra of [{},{showExecutionTab:true},{showExecutionTab:false}]){
    const {calls,result}=await run({params:{query:'OpenDesk Browser',limit:3,...extra}});
    assert.deepEqual(calls.map(x=>x.action),extra.showExecutionTab!==false?['bringToFront','goto']:['goto']);assert.equal(result.status,'success');
  }
});
test('Google invalid parameters reject before foregrounding or searching',async()=>{
  const invalid=[...[undefined,null,'true','false',0,1,{},[]].map(showExecutionTab=>({query:'OpenDesk Browser',limit:3,showExecutionTab})),
    {query:'OpenDesk Browser',limit:3,unknown:true},...['',' ','a'.repeat(121),null,3].map(query=>({query,limit:3})),
    ...[undefined,null,2,'3'].map(limit=>({query:'OpenDesk Browser',limit}))];
  for(const params of invalid){const calls=[];await assert.rejects(run({params,calls}),{code:'E_TASK_PARAMS'});assert.deepEqual(calls,[]);}
});
test('Google validates exact Origin, credentials and page type before foregrounding',async()=>{
  for(const url of ['https://example.com/','https://www.google.com/maps','https://user:pass@www.google.com/',
    'http://www.google.com/webhp','https://www.google.com.example/webhp','https://www.google.com:444/webhp']){
    for(const showExecutionTab of [true,false]){const calls=[];
      await assert.rejects(run({url,calls,params:{query:'OpenDesk Browser',limit:3,showExecutionTab}}),{code:'E_TARGET'});assert.deepEqual(calls,[]);}
  }
});
test('Google foreground failures reject without searching or replay',async()=>{
  for(const code of ['E_EFFECT_UNKNOWN','E_PERMISSION','E_DOCUMENT_REPLACED','E_TAB_CLOSED']){
    const calls=[];await assert.rejects(run({calls,foregroundError:Object.assign(Error('foreground failed'),{code})}),{code});
    assert.deepEqual(calls.map(x=>x.action),['bringToFront']);
  }
});
