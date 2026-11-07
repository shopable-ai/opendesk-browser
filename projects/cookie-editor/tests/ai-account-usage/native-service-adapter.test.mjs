import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../../ai-account-usage/service-binding-store.mjs';
import {startManagementServer} from '../../ai-account-usage/web-server.mjs';
const moduleURL=new URL('../../ai-account-usage/native-service-adapter.mjs',import.meta.url);
const owner={extensionId:'a'.repeat(32),toolId:'cookie-editor',packageHash:'b'.repeat(64),installEpoch:'install_1'};
const localRef={origin:'https://chatgpt.com',alias:'saved_01',version:1,storeId:'0',partitionKey:null};
async function fixture(t,{clock=Date.now}={}){
  const dir=await mkdtemp(join(tmpdir(),'usage-native-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const file of ['index.html','app.js','app.css'])await writeFile(join(dir,file),'asset');
  const store=new HistoryStore({directory:join(dir,'history')});await store.register({alias:'acct_01',displayName:'Allowed'});
  const bindingStore=new ServiceBindingStore({directory:join(dir,'binding')});
  const server=await startManagementServer({store,bindingStore,assetsDirectory:dir,clock,service:{query:async()=>{throw Error('NO_UPSTREAM');}}});t.after(()=>server.close());
  const req=(path,body,cookie)=>new Promise((resolve,reject)=>{
    const origin=new URL(server.url).origin;
    const r=request({hostname:'127.0.0.1',port:new URL(origin).port,path,method:body?'POST':'GET',headers:{host:new URL(origin).host,origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0].split(';')[0]}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);
  });
  return {store,bindingStore,server,req};
}
async function adapter(f){const {createUsageNativeAdapter}=await import(moduleURL);return createUsageNativeAdapter({server:f.server,store:f.store});}
const call=(a,action,payload={},who=owner)=>a({owner:who,action,payload:{connectionId:'conn_a',...payload}});

test('process request reuses scoped cached accounts and rejects retired capabilities',async t=>{
  const f=await fixture(t),s=f.server.serviceBinding;
  assert.equal(typeof s.request,'function');
  const c=await s.createLocalClient({connectionId:'direct',installationId:'install',userId:'local_uid',grantFamilyId:'grant',resourceIds:['acct_01']});
  await s.request(c.secret,{method:'POST',path:'/opendesk/v1/devices',body:{operationId:'register',label:'Mac'}});
  await f.store.register({alias:'acct_02',displayName:'Later'});
  assert.deepEqual((await s.request(c.secret,{method:'GET',path:'/opendesk/v1/accounts'})).accounts.map(a=>a.remoteAccountId),['acct_01']);
  await assert.rejects(s.request(c.secret,{method:'GET',path:'/opendesk/v1/accounts/acct_02/usage'}),{code:'NOT_FOUND'});
  s.revokeLocalClient(c.secret);await assert.rejects(s.request(c.secret,{method:'GET',path:'/opendesk/v1/self'}),{code:'TRUSTED_SESSION_REQUIRED'});
});

test('explicit connect, real resource export, manual binding, read-only policy/receipt, internal open and disconnect',async t=>{
  const f=await fixture(t),a=await adapter(f);
  await assert.rejects(call(a,'accounts'),{code:'CONNECTION_REQUIRED'});
  assert.equal((await f.bindingStore.read()).devices.length,0);
  const connected=await call(a,'connect',{label:'Mac',operationId:'connect_1'});
  assert.equal(connected.status,'CONNECTED');assert.equal(connected.providerKey,'codex');
  assert.ok(!/secret|origin|pairingCode|grantFamilyId/.test(JSON.stringify(connected)));
  await f.store.register({alias:'acct_02',displayName:'Later'});
  assert.deepEqual((await call(a,'accounts')).accounts,[{remoteAccountId:'acct_01',providerKey:'codex',displayName:'Allowed',verificationState:'UNVERIFIED'}]);
  const bound=await call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'bind_1'});
  assert.equal(bound.verificationState,'UNVERIFIED');assert.equal(bound.providerKey,'codex');
  const policy=await call(a,'policy');assert.equal(policy.status,'PENDING');assert.equal(policy.desired,null);
  const receipt=await call(a,'operation',{operationId:'bind_1'});assert.equal(receipt.result.bindingId,bound.bindingId);
  const admin=await f.req('/session',{code:f.server.pairingCode});
  const scope={bindingIds:[bound.bindingId],dataCategories:['ACCOUNT_METADATA','USAGE_SUMMARY'],trigger:'MANUAL',retentionDays:7};
  const desired=await f.req('/opendesk/admin/api/sync-policy',{deviceId:connected.deviceId,operationId:'desired_1',expectedRevision:0,scope},admin.cookie);
  assert.equal(desired.status,200);
  assert.equal((await call(a,'accept',{operationId:'accept_1',authEpoch:1,desiredRevision:desired.data.desiredRevision,desiredHash:desired.data.desiredHash,scope})).status,'ACCEPTED');
  const opened=await call(a,'open',{remoteAccountId:'acct_01',bindingId:bound.bindingId});
  const code=new URLSearchParams(new URL(opened.url).hash.slice(1)).get('open');
  const resource=await f.req('/opendesk/open-session',{code});assert.equal(resource.status,200);
  assert.equal((await f.req('/opendesk/open-session',{code})).status,401);
  await call(a,'unbind',{bindingId:bound.bindingId,operationId:'unbind_1',authEpoch:1,expectedRevision:1});
  await call(a,'disconnect',{operationId:'disconnect_1',authEpoch:2});
  await assert.rejects(call(a,'policy'),{code:'CONNECTION_REQUIRED'});
  assert.equal((await f.req('/api/v1/accounts',undefined,resource.cookie)).status,403);
  assert.equal((await f.req('/.well-known/opendesk-service')).status,200);
});

test('strict owners and payloads cannot export arbitrary resources, secrets, URLs or privileged policy writes',async t=>{
  const f=await fixture(t),a=await adapter(f);
  for(const who of [{...owner,toolId:'other'},{...owner,extensionId:'z'.repeat(32)},{...owner,packageHash:'x'.repeat(64)},{...owner,installEpoch:0},{...owner,extra:true}])
    await assert.rejects(call(a,'connect',{label:'Mac',operationId:'c'},who));
  for(const extra of [{resourceIds:['invented']},{token:'private'},{url:'https://evil.test'},{rawCookie:'private'}])
    await assert.rejects(call(a,'connect',{label:'Mac',operationId:'c',...extra}));
  assert.equal((await f.bindingStore.read()).devices.length,0);
  await call(a,'connect',{label:'Mac',operationId:'c'});
  for(const [action,payload] of [['policy',{scope:{}}],['operation',{operationId:'c',method:'POST'}],['open',{url:'https://evil.test'}],['bind',{remoteAccountId:'invented',localRef,operationId:'b'}],['bind',{remoteAccountId:'acct_01',localRef:{...localRef,rawCookie:'private'},operationId:'b'}],['accept',{operationId:'a',action:'resume'}],['unknown',{}]])
    await assert.rejects(call(a,action,payload));
  await assert.rejects(call(a,'accounts',{}, {...owner,installEpoch:'install_2'}),{code:'OWNER_MISMATCH'});
  await call(a,'connect',{connectionId:'conn_b',label:'B',operationId:'c'});
  const devices=(await f.bindingStore.read()).devices;assert.equal(devices.length,2);
  assert.notEqual(devices[0].grantFamilyId,devices[1].grantFamilyId);assert.equal(devices[0].installationId,devices[1].installationId);
  await a.disconnectAll();await assert.rejects(call(a,'accounts'),{code:'TRANSPORT_RETIRED'});
});

test('unknown registration retains original context for GET receipt without re-registering; retirement cancels pending registration',async t=>{
  const f=await fixture(t),original=f.server.serviceBinding;let registrations=0;let release;
  const wrapper={...original,async request(secret,r){const result=await original.request(secret,r);if(r.method==='POST'&&r.path.endsWith('/devices')){registrations++;throw Error('unknown secret '+secret);}return result;}};
  const {createUsageNativeAdapter}=await import(moduleURL);const a=createUsageNativeAdapter({server:{serviceBinding:wrapper},store:f.store});
  await assert.rejects(call(a,'connect',{label:'Mac',operationId:'unknown_1'}),{code:'RESULT_UNKNOWN',message:'RESULT_UNKNOWN'});
  await assert.rejects(call(a,'connect',{label:'Mac',operationId:'unknown_1'}),{code:'CONNECTION_EXISTS'});
  assert.equal((await call(a,'operation',{operationId:'unknown_1'})).status,'CONFIRMED');assert.equal(registrations,1);
  await a.disconnectAll();
  const pending=createUsageNativeAdapter({server:{serviceBinding:{...original,async createLocalClient(c){const client=await original.createLocalClient(c);await new Promise(resolve=>release=()=>resolve());return client;}}},store:f.store});
  const run=call(pending,'connect',{label:'Slow',operationId:'slow'});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  await pending.disconnectAll();release();await assert.rejects(run,{code:'TRANSPORT_RETIRED'});
  assert.equal((await f.bindingStore.read()).devices.length,1);
});

test('unwired adapter exposes no invented Native authorization',async()=>{
  const {createUsageNativeAdapter}=await import(moduleURL);const a=createUsageNativeAdapter({store:{accounts:async()=>[]}});
  await assert.rejects(call(a,'connect',{label:'Mac',operationId:'c'}),{code:'NATIVE_NOT_WIRED'});
});

test('adapter redacts capability fields and never resends an unknown binding operation',async t=>{
  const f=await fixture(t),api=f.server.serviceBinding;let capability,binds=0;
  const {createUsageNativeAdapter}=await import(moduleURL);
  const a=createUsageNativeAdapter({store:f.store,server:{serviceBinding:{...api,
    async createLocalClient(c){const client=await api.createLocalClient(c);capability=client.secret;return client;},
    async request(secret,r){const result=await api.request(secret,r);
      if(r.method==='POST'&&r.path.endsWith('/bindings')){binds++;throw Error('lost '+secret);}
      return {...result,secret,accessToken:secret};}
  }}});
  const c=await call(a,'connect',{operationId:'c',label:'Mac'});
  assert.ok(!JSON.stringify(c).includes(capability));
  assert.ok(!JSON.stringify(await call(a,'accounts')).includes(capability));
  assert.ok(!JSON.stringify(await call(a,'policy')).includes(capability));
  await assert.rejects(call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'lost'}),{code:'RESULT_UNKNOWN',message:'RESULT_UNKNOWN'});
  await assert.rejects(call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'lost'}),{code:'OPERATION_ALREADY_SENT'});
  const receipt=await call(a,'operation',{operationId:'lost'});
  assert.equal(receipt.result.remoteAccountId,'acct_01');assert.ok(!JSON.stringify(receipt).includes(capability));assert.equal(binds,1);
  const b=receipt.result;
  const opened=await call(a,'open',{remoteAccountId:'acct_01',bindingId:b.bindingId});
  const code=new URLSearchParams(new URL(opened.url).hash.slice(1)).get('open');
  await a.disconnectAll();
  assert.equal((await f.req('/opendesk/open-session',{code})).status,401);
  await assert.rejects(api.request(capability,{method:'GET',path:'/opendesk/v1/self'}),{code:'TRUSTED_SESSION_REQUIRED'});
});

test('explicit disconnect retires an unconfirmed connect without reissuing registration',async t=>{
  const f=await fixture(t),api=f.server.serviceBinding;let secret;
  const {createUsageNativeAdapter}=await import(moduleURL);
  const a=createUsageNativeAdapter({store:f.store,server:{serviceBinding:{...api,
    async createLocalClient(c){const client=await api.createLocalClient(c);secret=client.secret;return client;},
    async request(cap,r){const result=await api.request(cap,r);if(r.method==='POST')throw Error('lost');return result;}
  }}});
  await assert.rejects(call(a,'connect',{operationId:'c',label:'Mac'}),{code:'RESULT_UNKNOWN'});
  assert.equal((await call(a,'disconnect',{operationId:'d',authEpoch:1})).status,'DISCONNECTED');
  await assert.rejects(api.request(secret,{method:'GET',path:'/opendesk/v1/self'}),{code:'TRUSTED_SESSION_REQUIRED'});
  await assert.rejects(call(a,'operation',{operationId:'c'}),{code:'CONNECTION_REQUIRED'});
  assert.equal((await f.bindingStore.read()).devices.length,1);
});


test('lost committed DELETE keeps only original owner receipt access, invalidates opens and never replays',async t=>{
  let now=Date.now();const f=await fixture(t,{clock:()=>now}),api=f.server.serviceBinding;
  let secret,deletes=0,registrations=0;
  const {createUsageNativeAdapter}=await import(moduleURL);
  const a=createUsageNativeAdapter({store:f.store,server:{serviceBinding:{...api,
    async createLocalClient(c){const client=await api.createLocalClient(c);secret=client.secret;return client;},
    async request(cap,r){const result=await api.request(cap,r);
      if(r.method==='POST'&&r.path.endsWith('/devices'))registrations++;
      if(r.method==='DELETE'&&r.path.includes('/devices/')){deletes++;throw Error('lost '+cap);}
      return result;}
  }}});
  await call(a,'connect',{operationId:'c',label:'Mac'});
  const bound=await call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'b'});
  const open=await call(a,'open',{remoteAccountId:'acct_01',bindingId:bound.bindingId});
  const pending=await call(a,'open',{remoteAccountId:'acct_01',bindingId:bound.bindingId});
  const code=v=>new URLSearchParams(new URL(v.url).hash.slice(1)).get('open');
  const session=await f.req('/opendesk/open-session',{code:code(open)});assert.equal(session.status,200);
  await assert.rejects(call(a,'disconnect',{operationId:'lost_delete',authEpoch:1}),{code:'RESULT_UNKNOWN',message:'RESULT_UNKNOWN'});
  await assert.rejects(call(a,'accounts'),{code:'CONNECTION_RECEIPT_ONLY'});
  await assert.rejects(call(a,'policy'),{code:'CONNECTION_RECEIPT_ONLY'});
  await assert.rejects(call(a,'open',{remoteAccountId:'acct_01',bindingId:bound.bindingId}),{code:'CONNECTION_RECEIPT_ONLY'});
  await assert.rejects(call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'later'}),{code:'CONNECTION_RECEIPT_ONLY'});
  await assert.rejects(call(a,'operation',{operationId:'lost_delete'},{...owner,installEpoch:'other'}),{code:'OWNER_MISMATCH'});
  assert.equal((await f.req('/opendesk/open-session',{code:code(pending)})).status,401);
  assert.equal((await f.req('/api/v1/accounts',undefined,session.cookie)).status,401);
  await assert.rejects(api.request(secret,{method:'GET',path:'/opendesk/v1/self'}),{code:'TRUSTED_SESSION_REQUIRED'});
  await assert.rejects(api.request(secret,{method:'POST',path:'/opendesk/v1/devices',body:{operationId:'again',label:'Mac'}}),{code:'TRUSTED_SESSION_REQUIRED'});
  await assert.rejects(api.createManagementOpen(secret,{serviceInstanceId:api.serviceInstanceId,deviceId:bound.deviceId}),{code:'TRUSTED_SESSION_REQUIRED'});
  now+=16*60_000;
  const receipt=await call(a,'operation',{operationId:'lost_delete'});
  assert.equal(receipt.status,'CONFIRMED');assert.equal(receipt.deviceRevoked,true);
  assert.equal((await call(a,'operation',{operationId:'lost_delete'})).status,'CONFIRMED');
  assert.equal(deletes,1);assert.equal(registrations,1);
  // A second explicit disconnect retires the receipt context locally, never DELETEs again.
  await call(a,'disconnect',{operationId:'retire',authEpoch:2});
  await assert.rejects(call(a,'operation',{operationId:'lost_delete'}),{code:'CONNECTION_REQUIRED'});
  assert.throws(()=>api.renewLocalClient(secret),{code:'TRUSTED_SESSION_REQUIRED'});assert.equal(deletes,1);
});

test('open accepts device sync or exact account binding targets and rejects partial or supplied identities',async t=>{
  const f=await fixture(t),a=await adapter(f);
  const connected=await call(a,'connect',{operationId:'c',label:'Mac'});
  const bound=await call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'b'});
  for(const [target,path] of [[{},'/opendesk/admin/sync?device='+connected.deviceId],
    [{remoteAccountId:'acct_01',bindingId:bound.bindingId},'/opendesk/admin/accounts/acct_01']]){
    const opened=await call(a,'open',target);assert.equal(new URL(opened.url).pathname+new URL(opened.url).search,path);
    const code=new URLSearchParams(new URL(opened.url).hash.slice(1)).get('open');
    const exchanged=await f.req('/opendesk/open-session',{code});assert.equal(exchanged.status,200);assert.equal(exchanged.data.path,path);
    if(!target.bindingId){const devices=await f.req('/opendesk/admin/api/devices',undefined,exchanged.cookie);assert.equal(devices.status,200);assert.equal(devices.data.readOnly,true);assert.equal(devices.data.devices.length,1);}
  }
  for(const target of [{remoteAccountId:'acct_01'},{bindingId:bound.bindingId},{deviceId:connected.deviceId},{serviceInstanceId:f.server.serviceBinding.serviceInstanceId}])
    await assert.rejects(call(a,'open',target),{code:'BAD_INPUT'});
});

test('private renewal preserves original scope after expiry without replaying writes or reviving retirement',async t=>{
  let now=Date.now();const f=await fixture(t,{clock:()=>now}),api=f.server.serviceBinding;
  let secret,registrations=0,binds=0;
  const {createUsageNativeAdapter}=await import(moduleURL);
  const a=createUsageNativeAdapter({store:f.store,server:{serviceBinding:{...api,
    async createLocalClient(c){const client=await api.createLocalClient(c);secret=client.secret;return client;},
    async request(cap,r){const result=await api.request(cap,r);
      if(r.method==='POST'&&r.path.endsWith('/devices'))registrations++;
      if(r.method==='POST'&&r.path.endsWith('/bindings')){binds++;throw Error('lost '+cap);}
      return result;}
  }}});
  await call(a,'connect',{operationId:'c',label:'Mac'});
  await assert.rejects(call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'lost'}),{code:'RESULT_UNKNOWN'});
  const before=await f.bindingStore.read();await f.store.register({alias:'acct_02',displayName:'Later'});
  now+=16*60_000;
  await assert.rejects(api.request(secret,{method:'GET',path:'/opendesk/v1/accounts'}),{code:'TRUSTED_SESSION_REQUIRED'});
  assert.deepEqual((await call(a,'accounts')).accounts.map(a=>a.remoteAccountId),['acct_01']);
  assert.equal((await call(a,'operation',{operationId:'lost'})).status,'CONFIRMED');
  await assert.rejects(call(a,'bind',{remoteAccountId:'acct_01',localRef,operationId:'lost'}),{code:'OPERATION_ALREADY_SENT'});
  assert.equal(binds,1);assert.equal(registrations,1);assert.deepEqual(await f.bindingStore.read(),before);
  await a.disconnectAll();now+=16*60_000;
  await assert.rejects(call(a,'accounts'),{code:'TRANSPORT_RETIRED'});
  assert.throws(()=>api.renewLocalClient(secret),{code:'TRUSTED_SESSION_REQUIRED'});
});

test('expired HTTP capability requires explicit process-only renewal and cannot renew over HTTP',async t=>{
  let now=Date.now();const f=await fixture(t,{clock:()=>now}),api=f.server.serviceBinding;
  const client=await api.createLocalClient({connectionId:'direct',installationId:'install',userId:'local_uid',grantFamilyId:'grant',resourceIds:['acct_01']});
  await api.request(client.secret,{method:'POST',path:'/opendesk/v1/devices',body:{operationId:'c',label:'Mac'}});
  const http=(path,method='GET')=>new Promise((resolve,reject)=>{
    const u=new URL(f.server.url);const r=request({hostname:'127.0.0.1',port:u.port,path,method,headers:{host:u.host,authorization:'Bearer '+client.secret}},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});r.on('error',reject);r.end();
  });
  now+=16*60_000;
  assert.equal((await http('/opendesk/v1/accounts')).status,403);
  assert.equal((await http('/opendesk/v1/renew-local-client','POST')).status,403);
  assert.deepEqual(api.renewLocalClient(client.secret),{expiresAt:now+15*60_000});
  assert.equal((await http('/opendesk/v1/accounts')).status,200);
  assert.notEqual((await http('/opendesk/v1/renew-local-client','POST')).status,200);
  api.revokeLocalClient(client.secret);
  assert.throws(()=>api.renewLocalClient(client.secret),{code:'TRUSTED_SESSION_REQUIRED'});
  assert.throws(()=>api.renewLocalClient('unknown'),{code:'TRUSTED_SESSION_REQUIRED'});
});
