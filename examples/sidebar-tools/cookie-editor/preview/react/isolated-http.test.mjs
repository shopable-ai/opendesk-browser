import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startIsolatedHttpPreview} from './isolated-http.mjs';
import {readIsolatedEvidence} from './isolated-http-evidence.mjs';
import {dirname} from 'node:path';
import {createMockSdk,demoSite} from './src/mock-sdk.js';
import {createCookieHttpServices} from '../../app/domain/http-services.js';
import {createCookieSdkAdapter} from '../../app/adapters/browser-sdk.js';
import {createCookieController} from '../../app/controller/cookie-controller.js';
import cookiePackage from '../../package.json' with {type:'json'};

const memoryStorage=()=>{
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
};
test('Preview + isolated HTTP: original domain completes core and reopens, no real SDK or upstream',async t=>{
 const harness=await startIsolatedHttpPreview({port:0,vite:false});t.after(()=>harness.close());
 const config=await (await fetch(harness.previewOrigin+'/__isolated-http/config')).json();
 const storage=memoryStorage();
 const makeMock=()=>createMockSdk({scenario:'isolatedHttp',isolatedHttp:config,storage,
  fetchImpl:(path,options)=>fetch(harness.previewOrigin+path,options)});
 const originalSdk=globalThis.OpenDeskSDK,sentinel={browser:{cookies:{getAll:()=>{throw Error('REAL_SDK_USED');}}}};
 globalThis.OpenDeskSDK=sentinel;t.after(()=>{if(originalSdk===undefined)delete globalThis.OpenDeskSDK;else globalThis.OpenDeskSDK=originalSdk;});
 let mock=makeMock();
 const localBefore={rows:mock.inspect().rows,accounts:(await mock.request('cookieAccount.status',{})).accounts};
 const context=async()=>({origin:'https://'+demoSite,accounts:(await mock.request('cookieAccount.status',{})).accounts,
  storeId:(await mock.browser.cookies.getCurrentStore()).storeId,partitionKey:(await mock.browser.cookies.getPartitionKey()).partitionKey});
 const domain=()=>createCookieHttpServices({request:mock.request,version:cookiePackage.version,context});
 let service=domain(),state=await service.dispatch('serviceSave',{revision:0,label:'合成隔离 HTTP',serviceOrigin:config.origin});
 const connectionId=state.connections[0].id;
 state=await service.dispatch('serviceSave',{revision:state.revision,label:'未操作的公司配置',serviceOrigin:'https://uncontacted.example.com'});
 const untouched=structuredClone(state.connections[1]);
 const act=async(action,payload={})=>{state=await service.dispatch(action,{revision:state.revision,connectionId,...payload});return state.connections[0];};
 assert.equal((await act('serviceConnect',{code:harness.applicationPairing.code})).status,'CONNECTED');
 assert.equal((await act('serviceResources')).resources[0].remoteAccountId,'synthetic_01');
 assert.equal((await act('serviceUsage',{remoteAccountId:'synthetic_01'})).usageCache.synthetic_01.status,'UNKNOWN');
 const account=(await context()).accounts[0];
 const c=await act('serviceBind',{alias:account.alias,accountVersion:account.version,remoteAccountId:'synthetic_01'});
 const binding=c.bindings[0];assert.equal(binding.verificationState,'UNVERIFIED');
 assert.equal(binding.localAccount.storeId,'0');assert.deepEqual(binding.localAccount.partitionKey,(await context()).partitionKey);
 assert.equal((await act('serviceCheck')).check.session,'OK');
 mock.dispose();mock=makeMock();service=domain();
 state=await service.dispatch('serviceStatus');
 assert.equal(state.connections[0].status,'CONNECTED');assert.equal(state.connections[0].bindings[0].bindingId,binding.bindingId);
 assert.equal((await act('serviceCheck')).check.resources,'OK');
 assert.equal((await act('serviceUnbind',{bindingId:binding.bindingId})).bindings[0].revoked,true);
 assert.equal((await act('serviceDisconnect')).status,'DISCONNECTED');
 assert.equal((await harness.bindingStore.read()).devices[0].revoked,true);
 assert.deepEqual(state.connections[1],untouched);
 assert.deepEqual({rows:mock.inspect().rows,accounts:(await mock.request('cookieAccount.status',{})).accounts},localBefore);
 const stored=(await mock.request('browser.storage.local.get',{keys:['cookie-http-services.v1']})).items['cookie-http-services.v1'];
 await assert.rejects(mock.request('browser.network.request',{method:'POST',url:config.origin+'/opendesk/client/request',
  data:{session:stored.connections[0].session,method:'GET',path:'/opendesk/v1/accounts'}}),
  {code:'E_HTTP',status:403},'revoked credentials cannot read resources');
 assert.equal(globalThis.OpenDeskSDK,sentinel);mock.dispose();
 const evidence=harness.inspect();assert.equal(evidence.upstream,0);
 assert.ok(evidence.audit.slice(0,-1).every(r=>r.status===200));assert.equal(evidence.audit.at(-1).status,403);
 assert.ok(!JSON.stringify(state).includes(harness.applicationPairing.code));
 const summary=await readIsolatedEvidence(dirname(harness.pairingFile));
 assert.equal(summary.devices[0].revoked,true);assert.equal(summary.bindings[0].revoked,true);
 assert.ok(summary.operations.length>=4);assert.ok(!JSON.stringify(summary).includes(harness.applicationPairing.code));
 assert.ok(!JSON.stringify(mock.inspect().calls).includes('session\":'));
 const privatePairing=JSON.parse(await readFile(harness.pairingFile,'utf8'));assert.equal(privatePairing.origin,config.origin);
 t.diagnostic(JSON.stringify({...evidence,steps:['add','pair','read','bind','check','reopen','unbind','disconnect']}));
});

test('relay and mock reject arbitrary network, Origin, queries and administrative routes',async t=>{
 const h=await startIsolatedHttpPreview({port:0,vite:false});t.after(()=>h.close());
 const post=(data,headers={})=>fetch(h.previewOrigin+h.rpc,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
 const input={url:h.origin+'/opendesk/client/request',method:'POST',data:{}};
 assert.equal((await post(input,{origin:'https://evil.example'})).status,403);
 for(const url of ['http://127.0.0.1:10100/opendesk/client/request',h.origin+'/session',h.origin+'/opendesk/client/request?x=1',h.origin+'/opendesk/client/request#x']){
  assert.equal((await post({...input,url})).status,403);
 }
 assert.equal((await post({...input,method:'GET'})).status,403);
 assert.equal((await fetch(h.previewOrigin+'/__isolated-http/config',{headers:{origin:'https://evil.example'}})).status,403);
 const mock=createMockSdk({scenario:'isolatedHttp',isolatedHttp:{origin:h.origin,rpc:h.rpc},storage:memoryStorage(),fetchImpl:()=>{throw Error('MUST_NOT_FETCH');}});
 await assert.rejects(mock.request('browser.network.request',{...input,url:h.origin+'/session'}),{code:'E_PREVIEW_NETWORK_SCOPE'});
 await assert.rejects(mock.request('browser.tabs.create',{url:h.origin+'/'}),{code:'E_PERMISSION'});
 assert.equal(h.inspect().audit.length,0);assert.equal(h.inspect().upstream,0);
});

test('a lost committed pair response is reconciled once, never replayed, and storage stays backend-scoped',async t=>{
 const h=await startIsolatedHttpPreview({port:0,vite:false});t.after(()=>h.close());
 const storage=memoryStorage(),config={origin:h.origin,rpc:h.rpc};let loseReply=true;
 const mock=createMockSdk({scenario:'isolatedHttp',isolatedHttp:config,storage,fetchImpl:async(path,options)=>{
  const response=await fetch(h.previewOrigin+path,options);
  if(loseReply&&JSON.parse(options.body).url.endsWith('/pair')){loseReply=false;await response.text();throw Error('SYNTHETIC_REPLY_LOST');}
  return response;
 }});
 assert.ok(mock.inspect().rows.every(row=>row.storeId==='0'&&!row.partitionKey));
 const service=createCookieHttpServices({request:mock.request,version:cookiePackage.version,context:async()=>({})});
 let state=await service.dispatch('serviceSave',{revision:0,label:'Lost reply',serviceOrigin:h.origin});
 const connectionId=state.connections[0].id;
 state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:h.applicationPairing.code});
 assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
 state=await service.dispatch('serviceReconcile',{connectionId});assert.equal(state.connections[0].status,'CONNECTED');
 assert.equal(h.inspect().audit.filter(row=>row.path.endsWith('/pair')).length,1);
 assert.equal(h.inspect().audit.filter(row=>row.path.endsWith('/pair-result')).length,1);
 const other=createMockSdk({scenario:'isolatedHttp',isolatedHttp:{...config,origin:'http://other.localhost:12345'},storage});
 assert.deepEqual((await other.request('browser.storage.local.get',{keys:['cookie-http-services.v1']})).items,{});
 assert.equal(h.inspect().upstream,0);mock.dispose();other.dispose();
});


test('isolated fixture loads through the real adapter/controller before account binding, without touching pairing storage',async()=>{
 const storage=memoryStorage();
 const config={origin:'http://synthetic.localhost:12345',rpc:'/not-called'};
 const storageKey='cookie-editor.preview.isolated-http.v1:'+config.origin;
 const saved=JSON.stringify({'preview-preserved-session':'synthetic-marker'});
 storage.setItem(storageKey,saved);
 const mock=createMockSdk({scenario:'isolatedHttp',isolatedHttp:config,storage,
  fetchImpl:()=>{throw Error('LOAD_MUST_NOT_SEND_HTTP_OR_PAIR');}});
 const adapter=createCookieSdkAdapter({getBrowser:()=>mock.browser,request:mock.request});
 const controller=createCookieController({adapter});
 try{
  await controller.load();
  const state=controller.snapshot();
  assert.equal(state.phase,'ready');assert.equal(state.problem,null);assert.ok(state.rows.length>0);
  assert.ok(state.rows.every(row=>row.storeId==='0'&&row.value===undefined));
  const partition=await adapter.getPartition(state.target);
  assert.equal(partition.partitionKey.topLevelSite,'https://partner.example.net');
  assert.equal(partition.partitionKey.hasCrossSiteAncestor,false);
  assert.deepEqual(await adapter.getStore(state.target),{storeId:'0'});
  const reads=mock.inspect().calls.filter(call=>call.op==='getAll');
  assert.equal(reads.length,2);
  assert.equal(reads[0].args.partitionKey,undefined);
  assert.deepEqual(reads[1].args.partitionKey,partition.partitionKey);
  const accounts=await adapter.accountRequest('status');
  assert.equal(accounts.unlocked,true);assert.equal(accounts.accounts.length,3);
  assert.ok(accounts.accounts.every(account=>account.origin===state.target.origin&&account.version===1&&account.cookieCount===state.rows.length));
  assert.equal(storage.getItem(storageKey),saved);
  assert.ok(!mock.inspect().calls.some(call=>call.op==='browser.storage.local.set'));
 }finally{controller.dispose();mock.dispose();}
});
