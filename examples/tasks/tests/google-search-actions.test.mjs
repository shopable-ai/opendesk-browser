import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {verifyTaskPackage} from '../../../src/platform/tasks/contract.js';
import {digestUtf8} from '../../../src/platform/protocol.js';
const source=await readFile(new URL('../google-search-top3.js',import.meta.url),'utf8');
async function run({url='https://www.google.com/',challenge=false,clickError=null}={}){
  let value='',doc='before';const calls=[];
  const links=[{title:'Public result one',href:'https://example.org/one'},
    {title:'Public result two',href:'/goto?url=public-result&gsessionid=transient'},
    {title:'Duplicate',href:'https://example.org/one'}];
  function locator(selector,index=0){
    const rows=selector==='#rso a:has(h3)';
    return {nth:n=>locator(selector,n),count:async()=>rows?links.length:selector.includes('[data-text-ad]')?0:1,
      isVisible:async()=>true,inputValue:async()=>value,
      fill:async text=>{calls.push({action:'fill',text});value=text;},
      click:async options=>{calls.push({action:'click',options});if(clickError)throw clickError;url='https://www.google.com/search?q=OpenDesk+Browser';doc='after';},
      innerText:async()=>selector==='body'?(challenge?'unusual traffic CAPTCHA':'Public results'):selector==='h3'?links[index].title:'',
      getAttribute:async()=>links[index].href,waitFor:async()=>{},locator:child=>locator(child,index)};
  }
  const result=await vm.runInNewContext(source+'\nmain()',{page:{url:async()=>url,locator,
    observe:async()=>({document:{documentId:doc}})},params:{query:'OpenDesk Browser',limit:3},URL,Date,
    setTimeout:fn=>{fn();return 0;}});
  return {calls,result:JSON.parse(JSON.stringify(result))};
}
test('Google fixed package pins exact source and approved Origin',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../google.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  await verifyTaskPackage(pkg);assert.equal(pkg.sourceUtf8,source);
  assert.equal(pkg.manifest.program.sourceHash,await digestUtf8(source));
  assert.deepEqual(pkg.manifest.siteOrigins,['https://www.google.com']);
  assert.deepEqual(pkg.manifest.permissions,['page.automation']);
});
test('Google enters input, submits once with explicit navigation, reads real bounded unique links',async()=>{
  const {calls,result}=await run();
  assert.deepEqual(calls.map(x=>x.action),['fill','click']);
  assert.equal(calls[1].options.waitUntil,'load');assert.equal(result.status,'success');
  assert.equal(result.count,2);assert.equal(result.results[1].url,'https://www.google.com/goto?url=public-result');
  assert.equal(result.trace.find(x=>x.action==='input'&&x.state==='before').documentId,'before');
  assert.equal(result.trace.find(x=>x.action==='navigation').documentId,'after');
});
test('Google CAPTCHA stops before input and click',async()=>{
  const {calls,result}=await run({challenge:true});assert.equal(result.status,'blocked');assert.deepEqual(calls,[]);
});
test('Google lost click ACK never retries or claims results',async()=>{
  const {calls,result}=await run({clickError:Object.assign(new Error('lost ACK'),{code:'E_EFFECT_UNKNOWN'})});
  assert.equal(calls.filter(x=>x.action==='click').length,1);assert.equal(result.status,'stopped');
  assert.equal(result.count,0);assert.equal(result.trace.at(-1).code,'E_EFFECT_UNKNOWN');
});
test('Google exact result URL remains read-only; another query is rejected',async()=>{
  assert.deepEqual((await run({url:'https://www.google.com/search?q=OpenDesk+Browser'})).calls,[]);
  await assert.rejects(run({url:'https://www.google.com/search?q=other'}),{code:'E_TARGET'});
});
