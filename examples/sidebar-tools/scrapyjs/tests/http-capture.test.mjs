import test from 'node:test';
import assert from 'node:assert/strict';
import {runHttpCapture} from '../controller/http-capture.js';
const config=()=>({executionMode:'http-local',url:'http://127.0.0.1:43121/http-echo',maxPages:3,
  http:{userAgent:'ScrapyJS-UA-A/1.0',headers:{Accept:'application/json','X-Client-Tag':'A'}},itemConfig:{ua:'userAgent',requestId:'requestId'}});
test('one immutable header profile drives at most three same-origin pages; deletion leaves no override',async()=>{
  const input=config(),calls=[];
  const client={get:async(url,options)=>{calls.push({url,options:structuredClone(options)});
    input.http.userAgent='edited';const page=calls.length;
    return {status:200,data:JSON.stringify({data:[{userAgent:options.userAgent??'default',requestId:String(page)}],next:page<3?'/http-echo?page='+(page+1):null})};}};
  const result=await runHttpCapture(input,client);
  assert.equal(result.data.length,3);assert(calls.every(c=>c.options.userAgent==='ScrapyJS-UA-A/1.0'));
  assert.equal(result.engine.status,'completed');assert.equal(result.stats.requests,3);
  const empty=config();delete empty.http.userAgent;empty.http.headers={};empty.maxPages=1;calls.length=0;
  const removed=await runHttpCapture(empty,client);assert.equal(removed.data[0].ua,'default');
  assert(!Object.hasOwn(calls[0].options,'userAgent'));assert.deepEqual(calls[0].options.headers,{});
});
test('invalid config and next-page cross-origin fail closed without another request',async()=>{
  let count=0;const client={get:async()=>{count++;return{data:JSON.stringify({data:[{userAgent:'ua',requestId:'1'}],next:'http://127.0.0.1:43112/steal'})};}};
  await assert.rejects(runHttpCapture(config(),client),{code:'E_HTTP_LOCAL_TARGET'});assert.equal(count,1);
  for(const change of [{url:'https://example.com/'},{http:{headers:{Cookie:'secret'}}},{maxPages:4},
    {itemConfig:{ua:'__proto__.ua'}},{nextPageSelector:'a'},{http:{userAgent:'bad\r\n'}}]){
    count=0;await assert.rejects(runHttpCapture({...config(),...change},client));assert.equal(count,0);
  }
});
test('request failures stop pagination without retries or fabricated completed result',async()=>{
  let count=0;
  await assert.rejects(runHttpCapture(config(),{get:async()=>{count++;throw Object.assign(Error('stopped'),{code:'E_CANCELLED'});}}),{code:'E_CANCELLED'});
  assert.equal(count,1);
});
