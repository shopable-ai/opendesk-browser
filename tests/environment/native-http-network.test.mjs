import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig} from '../../src/framework/sdk/registry.js';
import {createNetworkService} from '../../src/platform/chrome/network.js';
import {validateTaskManifest} from '../../src/platform/tasks/contract.js';

const url='http://127.0.0.1:43121/http-echo';
const config=()=>({transport:'native-http',userAgent:'OpenDesk-NativeHTTP/1.0',
  headers:{Accept:'application/json','X-Client-Tag':'local'},responseType:'json',timeout:15000});

test('native normalization preserves explicit UA and canonicalizes ordinary headers without mutating input',()=>{
  const input=config(),before=structuredClone(input),normalized=normalizeConfig(input);
  assert.equal(normalized.transport,'native-http');
  assert.equal(normalized.userAgent,input.userAgent);
  assert.deepEqual(normalized.headers,{accept:'application/json','x-client-tag':'local'});
  assert.deepEqual(input,before);
  normalized.headers.accept='changed';assert.equal(input.headers.Accept,'application/json');
  assert.equal(normalizeConfig({...config(),headers:{Accept:''}}).headers.accept,'');
});

test('native normalization rejects case-insensitive duplicate headers and control or non-ASCII values',()=>{
  for(const headers of [{Accept:'one',accept:'two'},{'X-Client-Tag':'one','x-client-tag':'two'},
    {'Bad Name':'x'},{Accept:42},
    ...['\r','\n','\t','\0','\x1f','\x7f','é','中文'].map(value=>({Accept:value}))])
    assert.throws(()=>normalizeConfig({...config(),headers}),{code:'E_CONFIG_UNSUPPORTED'});
  for(const userAgent of ['',42,'x'.repeat(513),'ua\r\nInjected: yes','\t','\x7f','中文'])
    assert.throws(()=>normalizeConfig({...config(),userAgent}),{code:'E_CONFIG_UNSUPPORTED'});
  assert.equal(normalizeConfig({...config(),userAgent:'x'.repeat(512)}).userAgent.length,512);
});

test('native normalization rejects identity, transport-control and reserved relay headers',()=>{
  for(const name of ['User-Agent','Host','Origin','Referer','Cookie','Authorization',
    'Connection','Keep-Alive','TE','Trailer','Upgrade','Expect','Accept-Encoding',
    'Content-Length','Transfer-Encoding','Proxy-Authorization','pRoXy-Test',
    'Sec-Fetch-Site','sEc-Custom','X-OpenDesk-Request-Id','x-opendesk-custom'])
    assert.throws(()=>normalizeConfig({...config(),headers:{[name]:'x'}}),{code:'E_CONFIG_UNSUPPORTED'},name);
});

test('NetworkService dispatches native transport with original authorization and projects executor identity',async()=>{
  const calls=[],phases=[],receipts=[];let fetches=0,isolated=0,dispatchChecks=0;
  const executor={pid:123,nodeVersion:'v24.16.0'};
  const service=createNetworkService({
    fetchImpl:async()=>{fetches++;throw Error('unexpected browser fetch');},
    isolatedTransport:{request:async()=>{isolated++;throw Error('unexpected Chrome transport');}},
    authorize:async(details,context)=>{phases.push(details.phase);assert.equal(details.capability,'network');
      assert.equal(details.url,url);assert.equal(context.runId,'native-run');},
    nativeTransport:{request:async(target,options,context,beforeDispatch)=>{
      calls.push({target,options,context});await beforeDispatch();
      return Object.assign(new Response('{"ok":true}',{headers:{'content-type':'application/json'}}),{executor});
    }}
  });
  const result=await service.request({method:'GET',url,config:config()},
    {runId:'native-run',requestId:'native-request',deadlineAt:Date.now()+15000,
      assertDispatch:()=>{dispatchChecks++;},recordNativeReceipt:async value=>{receipts.push(value);}});
  assert.equal(calls.length,1);assert.equal(fetches,0);assert.equal(isolated,0);
  assert.equal(calls[0].target,url);assert.equal(calls[0].options.method,'GET');
  assert.deepEqual(calls[0].options.headers,{accept:'application/json','x-client-tag':'local'});
  assert.equal(calls[0].options.userAgent,'OpenDesk-NativeHTTP/1.0');
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'manual');
  assert.equal(calls[0].context.requestId,'native-request');
  assert.deepEqual(phases,['pre','pre','post']);assert.equal(dispatchChecks,2);
  assert.deepEqual(result.data,{ok:true});
  assert.deepEqual(result.request,{runId:'native-run',requestId:'native-request',executor});
  assert.deepEqual(receipts,[result]);
});

test('missing or failed native transport never falls back to fetch or isolated Chrome transport',async()=>{
  for(const failure of ['missing','coded','uncoded']){
    let fetches=0,isolated=0,nativeCalls=0;
    const service=createNetworkService({authorize:async()=>{},
      fetchImpl:async()=>{fetches++;return new Response('browser');},
      isolatedTransport:{request:async()=>{isolated++;return new Response('chrome');}},
      ...(failure==='missing'?{}:{nativeTransport:{request:async()=>{
        nativeCalls++;throw failure==='coded'?Object.assign(Error('disconnected'),{code:'E_NATIVE_UNAVAILABLE'}):Error('disconnected');
      }}})});
    await assert.rejects(service.request({method:'GET',url,config:config()}),
      {code:failure==='missing'?'E_SERVICE_UNSUPPORTED':failure==='coded'?'E_NATIVE_UNAVAILABLE':'E_NETWORK'});
    assert.equal(nativeCalls,failure==='missing'?0:1);assert.equal(fetches,0);assert.equal(isolated,0);
  }
});

test('Authority rejection before native dispatch cannot send a request through either transport',async()=>{
  let dispatched=0,fetches=0;
  const service=createNetworkService({
    authorize:async()=>{throw Object.assign(Error('revoked'),{code:'E_PERMISSION'});},
    nativeTransport:{request:async()=>{dispatched++;return new Response('unexpected');}},
    fetchImpl:async()=>{fetches++;return new Response('unexpected');}
  });
  await assert.rejects(service.request({method:'GET',url,config:config()}),{code:'E_PERMISSION'});
  assert.equal(dispatched,0);assert.equal(fetches,0);
});

test('real Task manifest validation requires network alongside network.localRelay and preserves ordinary Tasks',()=>{
  const manifest={format:'opendesk.task.v1',taskId:'native-http.test',version:'1.0.0',
    title:'Native HTTP test',description:'Local relay permission regression',author:'OpenDesk',source:'test',
    siteOrigins:['http://127.0.0.1:43121'],entryFormat:'async-main',
    program:{revision:1,sourceHash:'a'.repeat(64)},
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}};
  for(const permissions of [['page.automation'],['page.automation','network'],
    ['page.automation','network','network.localRelay'],
    ['page.automation','network.localRelay','network','storage.persistent']]){
    const input={...manifest,permissions};assert.equal(validateTaskManifest(input),input);
    assert.deepEqual(input.permissions,permissions);
  }
  for(const permissions of [['page.automation','network.localRelay'],
    ['page.automation','network.localRelay','storage.persistent'],['network','network.localRelay'],
    ['network.localRelay','page.automation','network'],
    ['page.automation','network','network.localRelay','network.localRelay']])
    assert.throws(()=>validateTaskManifest({...manifest,permissions}),{code:'E_PERMISSION'});
});
