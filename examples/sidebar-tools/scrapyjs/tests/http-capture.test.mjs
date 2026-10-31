import test from 'node:test';
import assert from 'node:assert/strict';
import {runHttpCapture,validateHttpCapture} from '../controller/http-capture.js';
const config=()=>({executionMode:'http-local',url:'http://127.0.0.1:43121/http-echo',maxPages:3,
  http:{userAgent:'ScrapyJS-UA-A/1.0',headers:{Accept:'application/json','X-Client-Tag':'A'}},itemConfig:{ua:'userAgent',requestId:'requestId'}});
test('one immutable configuration drives at most three native GET pages; deletion restores explicit native UA',async()=>{
  const input=config(),calls=[];
  const client={get:async(url,options)=>{calls.push({url,options:structuredClone(options)});
    input.url='https://example.com/';input.http.userAgent='edited';input.http.headers.Accept='edited';
    input.itemConfig.ua='missing';input.maxPages=1;input.timeoutMs=1;const page=calls.length;
    return {status:200,data:JSON.stringify({data:[{userAgent:options.userAgent??'default',requestId:String(page)}],next:page<3?'/http-echo?page='+(page+1):null})};}};
  const result=await runHttpCapture(input,client);
  assert.equal(result.data.length,3);assert(calls.every(c=>c.options.userAgent==='ScrapyJS-UA-A/1.0'));
  assert.equal(result.engine.status,'completed');assert.equal(result.engine.transport,'native-http');assert.equal(result.stats.requests,3);
  assert(calls.every(c=>c.url.startsWith('http://127.0.0.1:43121/')));
  assert(calls.every(c=>c.options.transport==='native-http'&&c.options.headers.Accept==='application/json'));
  const empty=config();delete empty.http.userAgent;empty.http.headers={};empty.maxPages=1;calls.length=0;
  const removed=await runHttpCapture(empty,client);assert.equal(removed.data[0].ua,'OpenDesk-NativeHTTP/1.0');
  assert.equal(calls[0].options.userAgent,'OpenDesk-NativeHTTP/1.0');assert.deepEqual(calls[0].options.headers,{});
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

test('all pages share a frozen deadline clamped to 15 seconds and preserve executor/request/run identity',async()=>{
  let clock=100;const calls=[];
  const input={...config(),timeoutMs:60000};
  const result=await runHttpCapture(input,{get:async(url,options)=>{
    calls.push(structuredClone(options));clock+=4000;
    // Mutating client-owned options cannot change the frozen profile for later pages.
    options.headers.Accept='client mutation';
    input.timeoutMs=60000;
    return {data:JSON.stringify({data:[{userAgent:options.userAgent,requestId:String(calls.length)}],next:'/http-echo?page='+calls.length}),
      request:{requestId:'request-'+calls.length,runId:'run-1',executor:{kind:'node',pid:123}}};
  }},{now:()=>clock});
  assert.deepEqual(calls.map(row=>row.timeout),[15000,11000,7000]);
  assert(calls.every(row=>row.headers.Accept==='application/json'));
  assert.equal(result.stats.pages,3);
  assert.deepEqual(result.audit.requests.map(({requestId,runId,executor})=>({requestId,runId,executor})),
    [1,2,3].map(i=>({requestId:'request-'+i,runId:'run-1',executor:{kind:'node',pid:123}})));
  assert.equal(validateHttpCapture(input).timeoutMs,15000);
});
test('shorter timeout is shared; late responses stop the run without another request',async()=>{
  for(const timeoutMs of [5000,15000,60000]){
    let clock=0,count=0;const timeouts=[];
    await assert.rejects(runHttpCapture({...config(),timeoutMs},{get:async(_url,options)=>{
      count++;timeouts.push(options.timeout);clock+=Math.min(timeoutMs,15000)/2;
      return {data:JSON.stringify({data:[],next:'/http-echo?page='+count})};
    }},{now:()=>clock}),{code:'E_HTTP_LOCAL_TIMEOUT'});
    assert.equal(count,2);assert.deepEqual(timeouts,[Math.min(timeoutMs,15000),Math.min(timeoutMs,15000)/2]);
  }
  let clock=0;
  await assert.rejects(runHttpCapture({...config(),maxPages:1},{get:async()=>{
    clock=15001;return {data:'{"data":[]}'};
  }},{now:()=>clock}),{code:'E_HTTP_LOCAL_TIMEOUT'});
});
test('native transport unavailable fails closed, with no browser transport retry',async()=>{
  const transports=[];
  await assert.rejects(runHttpCapture(config(),{get:async(_url,options)=>{
    transports.push(options.transport);throw Object.assign(Error('native unavailable'),{code:'E_NATIVE_UNAVAILABLE'});
  }}),{code:'E_NATIVE_UNAVAILABLE'});
  assert.deepEqual(transports,['native-http']);
});
test('controller rejects control characters, duplicate and reserved headers before dispatch',async()=>{
  let calls=0;const client={get:async()=>{calls++;throw Error('unexpected dispatch');}};
  for(const headers of [{Accept:'a',accept:'b'},{'Bad Name':'x'},
    ...['User-Agent','Host','Cookie','Authorization','Origin','Referer','Connection','Keep-Alive','TE','Trailer','Upgrade','Expect',
      'Accept-Encoding','Content-Length','Transfer-Encoding','Proxy-Authorization','Sec-Fetch-Site','X-OpenDesk-Request-Id'].map(name=>({[name]:'x'})),
    ...['\r','\n','\t','\x7f','中文'].map(value=>({Accept:value}))]){
    await assert.rejects(runHttpCapture({...config(),http:{headers}},client),{code:'E_HTTP_LOCAL_HEADER'});
  }
  for(const change of [{http:null},{maxPages:null},{timeoutMs:null},
    {url:'http://127.1:43121/http-echo'},{url:config().url+'#'}])
    await assert.rejects(runHttpCapture({...config(),...change},client));
  assert.equal(calls,0);
});
