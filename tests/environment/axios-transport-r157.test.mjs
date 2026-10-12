import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedAxiosTransport} from '../../src/libs/adapters/axios-transport.js';

const errorCode=code=>err=>err?.code===code;
function fixture(response={status:200,data:'{"ok":true}',headers:{'content-type':'application/json'}}){
  const calls=[];
  const http=Object.fromEntries(['get','post','put','delete'].map(method=>[method,async (...args)=>{
    calls.push({method,args});return response;
  }]));
  const uris=[];
  const getUri=config=>{uris.push(config);return config.url;};
  return {calls,uris,http,getUri,adapter:createAuthorizedAxiosTransport({http,getUri})};
}

test('serializes URL once, preserves Axios result fields, leaves text for Axios response transforms',async()=>{
  const f=fixture();
  const config={method:'post',url:'https://example.test/items?tag=a%20b',
    data:'{"title":"OpenDesk"}',headers:{'content-type':'application/json'},timeout:0};
  const result=await f.adapter(config);
  assert.equal(f.uris.length,1);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].method,'post');
  assert.equal(f.calls[0].args[0],config.url);
  assert.equal(f.calls[0].args[1],config.data);
  assert.deepEqual(f.calls[0].args[2],{
    headers:{'content-type':'application/json'},responseType:'text',withCredentials:false});
  assert.equal(result.data,'{"ok":true}');
  assert.equal(result.status,200);
  assert.strictEqual(result.config,config);
});

test('preserves authenticated HTTP error only as HTTP, honors Axios validateStatus',async()=>{
  const response={status:404,statusText:'Not Found',data:'missing',headers:{}};
  const raw=Object.fromEntries(['get','post','put','delete'].map(k=>[k,async()=>{
    throw Object.assign(new Error('HTTP 404'),{code:'E_HTTP',response});
  }]));
  const adapter=createAuthorizedAxiosTransport({http:raw,getUri:c=>c.url});
  assert.equal((await adapter({method:'get',url:'https://example.test/no',validateStatus:s=>s<500})).status,404);
  await assert.rejects(adapter({method:'get',url:'https://example.test/no',validateStatus:s=>s<400}),errorCode('E_HTTP'));
  const deny=Object.fromEntries(['get','post','put','delete'].map(k=>[k,async()=>{
    throw Object.assign(new Error('grant revoked'),{code:'E_PERMISSION',response});
  }]));
  const blocked=createAuthorizedAxiosTransport({http:deny,getUri:c=>c.url});
  await assert.rejects(blocked({url:'https://example.test/no',validateStatus:()=>true}),errorCode('E_PERMISSION'));
});

test('fails closed for unsupported method, headers, URL, credentials, cancellation, binary',async()=>{
  const f=fixture();
  for(const config of [
    {url:'https://example.test',method:'patch'},
    {url:'https://example.test',headers:{Authorization:'secret'}},
    {url:'https://example.test',headers:{'x-test':'line\nbreak'}},
    {url:'https://example.test',withCredentials:true},
    {url:'https://user:secret@example.test/'},
    {url:'file:///etc/passwd'},
    {url:'https://example.test',signal:new AbortController().signal},
    {url:'https://example.test',responseType:'arraybuffer'},
    {url:'https://example.test',method:'post',data:{unexpected:'object'}}
  ]) await assert.rejects(f.adapter(config),err=>/^E_/.test(err.code));
  assert.equal(f.calls.length,0,'invalid requests must not reach any transport');
});

test('rejects incomplete host response and maps positive timeout without touching host budget',async()=>{
  const f=fixture({status:200,data:{not:'text'}});
  await assert.rejects(f.adapter({url:'https://example.test'}),errorCode('E_AXIOS_RESPONSE_UNSUPPORTED'));
  const good=fixture();
  await good.adapter({method:'get',url:'https://example.test/',timeout:321});
  assert.equal(good.calls[0].args[1].timeout,321);
  await assert.rejects(good.adapter({url:'https://example.test',timeout:-1}),errorCode('E_CONFIG_UNSUPPORTED'));
});

test('fails if host proxy/getUri missing, never supplies a privileged fallback',()=>{
  assert.throws(()=>createAuthorizedAxiosTransport(),errorCode('E_AXIOS_TRANSPORT_NOT_READY'));
  assert.equal(/\b(?:chrome|fetch|eval)\s*\(/.test(String(createAuthorizedAxiosTransport)),false);
});

// The public Controller Axios must use the real upstream factory, without
// changing main() ABI or allowing custom adapters/fetch fallback.
test('real Controller Axios uses the same authorized Broker for create, request and interceptors',async()=>{
  const {installControllerAxios}=await import('../../src/libs/packages/axios.js');
  const calls=[];
  const http=Object.fromEntries(['get','post','put','delete'].map(method=>[method,async(...args)=>{
    calls.push({method,args});
    return {status:200,statusText:'OK',data:'{"ok":true,"method":"'+method+'"}',
      headers:{'content-type':'application/json'}};
  }]));
  const scope={};
  const axios=installControllerAxios(scope,http);
  assert.equal(scope.axios,axios);
  assert.equal(typeof axios,'function');
  assert.equal(typeof axios.request,'function');
  assert.equal(typeof axios.create,'function');
  const client=axios.create({baseURL:'https://example.test/api/'});
  let intercepted=0;
  const id=client.interceptors.request.use(config=>{intercepted++;config.headers.set('x-demo','yes');return config;});
  const response=await client.get('items',{params:{word:'hello world'}});
  assert.deepEqual(response.data,{ok:true,method:'get'});
  assert.equal(response.status,200);
  assert.equal(intercepted,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'get');
  assert.equal(calls[0].args[0],'https://example.test/api/items?word=hello+world');
  assert.equal(calls[0].args[1].headers['x-demo'],'yes');
  client.interceptors.request.eject(id);
  await client.post('/save',{label:'OpenDesk'});
  assert.equal(calls[1].method,'post');
  assert.equal(calls[1].args[1],'{"label":"OpenDesk"}');
  assert.throws(()=>installControllerAxios(scope,http),errorCode('E_BUILTIN_COLLISION'));
  assert.throws(()=>installControllerAxios({document:{}},http),errorCode('E_BUILTIN_WORLD'));
});

test('Controller Axios cannot bypass admitted transport with custom adapter or forbidden headers',async()=>{
  const {installControllerAxios}=await import('../../src/libs/packages/axios.js');
  const calls=[];
  const http=Object.fromEntries(['get','post','put','delete'].map(name=>[name,async()=>{
    calls.push(name);return {status:200,data:'ok',headers:{}};
  }]));
  const axios=installControllerAxios({},http);
  assert.throws(()=>axios.create({adapter:()=>({})}),errorCode('E_CONFIG_UNSUPPORTED'));
  assert.throws(()=>axios.interceptors.request.clear(),errorCode('E_CONFIG_UNSUPPORTED'));
  assert.throws(()=>axios.interceptors.request.eject(0),errorCode('E_CONFIG_UNSUPPORTED'));
  for(const config of [
    {url:'https://example.test/x',adapter:async()=>({status:200,data:'bypass'})},
    {url:'https://example.test/x',headers:{Authorization:'secret'}},
    {url:'https://example.test/x',responseType:'arraybuffer'},
    {url:'https://example.test/x',withCredentials:true}
  ])await assert.rejects(axios.request(config),error=>/^E_/.test(error.code));
  assert.equal(calls.length,0,'No forbidden config may reach the Broker');
});

test('Controller Axios interprets authorized HTTP cause, but propagates revocation and stop',async()=>{
  const {installControllerAxios}=await import('../../src/libs/packages/axios.js');
  const response={status:429,statusText:'Too Many Requests',data:'{"message":"rate limit"}',
    headers:{'content-type':'application/json'}};
  let failureCode='E_HTTP';
  const http=Object.fromEntries(['get','post','put','delete'].map(name=>[name,async()=>{
    if(failureCode==='E_HTTP')throw Object.assign(new Error('HTTP 429'),{code:'E_HTTP',cause:{status:429,response}});
    throw Object.assign(new Error(failureCode),{code:failureCode});
  }]));
  const axios=installControllerAxios({},http);
  const accepted=await axios.get('https://example.test/status',{validateStatus:status=>status<500});
  assert.equal(accepted.status,429);
  assert.deepEqual(accepted.data,{message:'rate limit'});
  await assert.rejects(axios.get('https://example.test/status'),
    error=>error.isAxiosError===true&&error.response?.status===429);
  for(const code of ['E_PERMISSION','E_CANCELLED','E_TIMEOUT']){
    failureCode=code;
    await assert.rejects(axios.get('https://example.test/status'),error=>error.code===code);
  }
});
