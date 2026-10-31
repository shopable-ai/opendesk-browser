import test from 'node:test';
import assert from 'node:assert/strict';

const load=()=>import('../app/domain/http-services.js');
const account={alias:'saved_01',origin:'https://example.com',version:2};
function fixture(){
  let saved;const calls=[];
  const request=async(operation,input)=>{
    calls.push({operation,input:structuredClone(input)});
    if(operation==='browser.storage.local.get')return {items:saved?{'cookie-http-services.v1':structuredClone(saved)}:{}};
    if(operation==='browser.storage.local.set'){
      assert.ok(Buffer.byteLength(JSON.stringify(input.items['cookie-http-services.v1']))<=8192);
      saved=structuredClone(input.items['cookie-http-services.v1']);return {written:1};}
    if(operation==='browser.network.request'){
      if(input.url.endsWith('/pair'))return {status:200,data:{session:'a'.repeat(64),expiresAt:Date.now()+900000,serviceInstanceId:'instance_01',device:{deviceId:'device_01',authEpoch:1,serviceInstanceId:'instance_01'}}};
      if(input.data.path.endsWith('/accounts'))return {status:200,data:{accounts:[{remoteAccountId:'remote_01',providerKey:'codex',verificationState:'UNVERIFIED'}],nextCursor:null}};
      throw Object.assign(Error('lost response'),{code:'E_NETWORK'});
    }
    throw Error(operation);
  };
  return {request,calls,context:async()=>({origin:account.origin,accounts:[account],storeId:'0',partitionKey:null})};
}
test('HTTP connection uses only public scoped storage/network and requires an explicit address and app code',async()=>{
  const {createCookieHttpServices}=await load();const f=fixture();
  const service=createCookieHttpServices({...f,version:'2.0.58'});
  await assert.rejects(service.dispatch('serviceSave',{revision:0,label:'bad',serviceOrigin:'http://company.example'}),{code:'E_SERVICE_INPUT'});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://usage-test.localhost:43119'});
  state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId:state.connections[0].id,code:'b'.repeat(64)});
  assert.equal(state.connections[0].status,'CONNECTED');
  assert.ok(!JSON.stringify(state).includes('a'.repeat(64)));
  assert.ok(!f.calls.some(c=>c.operation.startsWith('cookieAccount.service')));
  const requests=f.calls.filter(c=>c.operation==='browser.network.request');
  assert.equal(requests.length,1);assert.equal(requests[0].input.method,'POST');
  assert.equal(requests[0].input.url,'http://usage-test.localhost:43119/opendesk/client/pair');
});
test('lost binding response is persisted as unknown and cannot be replayed; changed account version is refused',async()=>{
  const {createCookieHttpServices}=await load();const f=fixture();const service=createCookieHttpServices({...f,version:'2.0.58'});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://127.0.0.1:43119'});
  const connectionId=state.connections[0].id;
  state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:'b'.repeat(64)});
  state=await service.dispatch('serviceResources',{connectionId});
  await assert.rejects(service.dispatch('serviceBind',{revision:state.revision,connectionId,alias:account.alias,accountVersion:1,remoteAccountId:'remote_01'}),{code:'E_VAULT_CONFLICT'});
  state=await service.dispatch('serviceBind',{revision:state.revision,connectionId,alias:account.alias,accountVersion:2,remoteAccountId:'remote_01'});
  assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
  const sent=f.calls.filter(c=>c.operation==='browser.network.request').length;
  await assert.rejects(service.dispatch('serviceBind',{revision:state.revision,connectionId,alias:account.alias,accountVersion:2,remoteAccountId:'remote_01'}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(c=>c.operation==='browser.network.request').length,sent);
  const newPackage=createCookieHttpServices({...f,version:'2.0.59'});
  assert.equal((await newPackage.dispatch('serviceStatus')).connections[0].status,'INVALIDATED');
});

async function connected(options={}){
  const {createCookieHttpServices}=await load(),f=fixture();
  const request=async(operation,input)=>options.intercept?.(operation,input,f)??f.request(operation,input);
  const service=createCookieHttpServices({...f,...options,request,version:'2.0.58'});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://127.0.0.1:43119'});
  const connectionId=state.connections[0].id;
  state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:'b'.repeat(64)});
  return {f,service,state,connectionId};
}
test('explicit unbind submits one public HTTP request without an approval flow and never replays an unknown write',async()=>{
  for(const outcome of ['confirmed','E_NETWORK_NOT_SUBMITTED','E_CANCELLED','E_SITE_PERMISSION_REVOKED']){
    const network=[];
    const s=await connected({intercept:(operation,input)=>{
      if(operation!=='browser.network.request')return;
      network.push(structuredClone(input));
      assert.equal(Object.hasOwn(input,'approvalRef'),false);
      if(input.data.path==='/opendesk/v1/bindings')return Promise.resolve({status:200,data:{
        bindingId:'binding_01',remoteAccountId:'remote_01',providerKey:'codex',purpose:'usage',
        verificationState:'UNVERIFIED',localAccount:input.data.body.localAccount,
        deviceId:'device_01',revoked:false,revision:1,authEpoch:1
      }});
      if(input.data.method==='DELETE'){
        if(outcome!=='confirmed')return Promise.reject(Object.assign(Error(),{code:outcome}));
        return Promise.resolve({status:200,data:{status:'REVOKED',authEpoch:2}});
      }
    }});
    let state=await s.service.dispatch('serviceResources',{connectionId:s.connectionId});
    state=await s.service.dispatch('serviceBind',{revision:state.revision,connectionId:s.connectionId,
      alias:account.alias,accountVersion:account.version,remoteAccountId:'remote_01'});
    const before=network.length;
    const unbind=()=>s.service.dispatch('serviceUnbind',{revision:state.revision,connectionId:s.connectionId,bindingId:'binding_01'});
    if(outcome==='E_NETWORK_NOT_SUBMITTED'){
      await assert.rejects(unbind(),{code:outcome});
      state=await s.service.dispatch('serviceStatus');
      assert.equal(state.connections[0].pending,null);
      assert.equal(state.connections[0].history.at(-1).outcome,'NOT_DISPATCHED');
      assert.equal(state.connections[0].bindings[0].revoked,false);
    }else{
      state=await unbind();
      if(outcome==='confirmed'){
        assert.equal(state.connections[0].pending,null);
        assert.equal(state.connections[0].bindings[0].revoked,true);
      }else{
        assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
        assert.equal(state.connections[0].receiptOnly,true);
        await assert.rejects(unbind(),{code:'E_OUTCOME_UNKNOWN'});
      }
    }
    assert.equal(network.length,before+1);
    assert.equal(network.at(-1).url,'http://127.0.0.1:43119/opendesk/client/request');
    assert.equal(network.at(-1).method,'POST');
    assert.equal(network.at(-1).data.method,'DELETE');
    assert.equal(network.at(-1).data.path,'/opendesk/v1/bindings/binding_01');
    assert.ok(s.f.calls.every(c=>['browser.storage.local.get','browser.storage.local.set','browser.network.request'].includes(c.operation)));
  }
});
test('only explicit pre-submission proof clears pending; post-dispatch revocation and cancellation remain unknown',async()=>{
  for(const code of ['E_SITE_PERMISSION_REVOKED','E_CANCELLED','E_NETWORK_NOT_SUBMITTED']){
    const s=await connected({intercept:(operation,input)=>{
      if(operation==='browser.network.request'&&input.data.path==='/opendesk/v1/management-open')return Promise.reject(Object.assign(Error(),{code}));
    }});
    if(code==='E_NETWORK_NOT_SUBMITTED'){
      await assert.rejects(s.service.dispatch('serviceOpen',{revision:s.state.revision,connectionId:s.connectionId}),{code});
      assert.equal((await s.service.dispatch('serviceStatus')).connections[0].pending,null);
    }else{
      const state=await s.service.dispatch('serviceOpen',{revision:s.state.revision,connectionId:s.connectionId});
      assert.equal(state.connections[0].pending.action,'open');
      const before=s.f.calls.length;
      const archived=await s.service.dispatch('serviceArchiveOpen',{revision:state.revision,connectionId:s.connectionId});
      assert.equal(archived.connections[0].pending,null);
      assert.ok(!s.f.calls.slice(before).some(c=>c.operation==='browser.network.request'||c.operation==='browser.tabs.create'));
      assert.equal(archived.connections[0].history.at(-1).outcome,'ARCHIVED_UNKNOWN');
    }
  }
});
test('unknown pairing can read its exact receipt without a session or replaying the application code',async()=>{
  let sent;const f=fixture(),{createCookieHttpServices}=await load();
  const request=async(operation,input)=>{
    if(operation==='browser.network.request'&&input.url.endsWith('/pair')){sent=structuredClone(input.data);throw Object.assign(Error(),{code:'E_NETWORK'});}
    if(operation==='browser.network.request'&&input.url.endsWith('/pair-result')){
      assert.deepEqual(input.data,{receiptKey:sent.receiptKey,connectionId:sent.connectionId,operationId:sent.operationId});
      return {status:200,data:{operationId:sent.operationId,status:'REJECTED',error:'PAIRING_INVALID'}};
    }
    return f.request(operation,input);
  };
  const service=createCookieHttpServices({...f,request,version:'2.0.58'});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://127.0.0.1:43119'});
  const connectionId=state.connections[0].id;
  state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:'b'.repeat(64)});
  assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
  assert.match(sent.receiptKey,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(state).includes(sent.receiptKey));
  state=await service.dispatch('serviceReconcile',{connectionId});
  assert.equal(state.connections[0].status,'UNCONNECTED');
  assert.equal(state.connections[0].history.at(-1).outcome,'REJECTED');
});
test('explicit retirement preserves an expired connection and permits a fresh address configuration without inheriting its grant',async()=>{
  let now=Date.now();const s=await connected({clock:()=>now});
  now+=1000000;
  const expired=await s.service.dispatch('serviceStatus');
  assert.equal(expired.connections[0].status,'SESSION_EXPIRED');
  const before=s.f.calls.length;
  let state=await s.service.dispatch('serviceRetire',{revision:expired.revision,connectionId:s.connectionId});
  assert.equal(state.connections[0].status,'RETIRED');
  state=await s.service.dispatch('serviceSave',{revision:state.revision,label:'New',serviceOrigin:'http://127.0.0.1:43119'});
  assert.equal(state.connections[1].status,'UNCONNECTED');
  assert.equal(state.connections[1].deviceId,'');
  assert.deepEqual(state.connections[1].bindings,[]);
  assert.ok(!s.f.calls.slice(before).some(c=>c.operation==='browser.network.request'));
});
test('failed DELETE remains receipt-only and retirement retains the exact unknown operation in scoped storage',async()=>{
  const s=await connected();
  let state=await s.service.dispatch('serviceDisconnect',{revision:s.state.revision,connectionId:s.connectionId});
  assert.equal(state.connections[0].receiptOnly,true);
  const op=state.connections[0].pending.operationId;
  await assert.rejects(s.service.dispatch('serviceResources',{connectionId:s.connectionId}),{code:'E_SERVICE_RECEIPTS_ONLY'});
  state=await s.service.dispatch('serviceRetire',{revision:state.revision,connectionId:s.connectionId});
  assert.equal(state.connections[0].history.at(-1).operationId,op);
  const saved=s.f.calls.filter(c=>c.operation==='browser.storage.local.set').at(-1).input.items['cookie-http-services.v1'];
  assert.equal(saved.connections[0].archivedOperations[0].operationId,op);
  assert.equal(saved.connections[0].archivedOperations[0].method,'DELETE');
});

test('an unresolved pairing can be explicitly retired after receipt expiry without recreating or declaring failure',async()=>{
  let now=Date.now(),pairings=0;const f=fixture(),{createCookieHttpServices}=await load();
  const request=async(operation,input)=>{
    if(operation==='browser.network.request'){
      if(input.url.endsWith('/pair'))pairings++;
      throw Object.assign(Error(),{code:'E_NETWORK'});
    }
    return f.request(operation,input);
  };
  const service=createCookieHttpServices({...f,request,version:'2.0.58',clock:()=>now});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://127.0.0.1:43119'});
  const connectionId=state.connections[0].id;
  state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:'b'.repeat(64)});
  const operationId=state.connections[0].pending.operationId;
  now+=16*60_000;
  await assert.rejects(service.dispatch('serviceReconcile',{connectionId}),{code:'E_NETWORK'});
  state=await service.dispatch('serviceStatus');assert.equal(state.connections[0].canRetire,true);
  state=await service.dispatch('serviceRetire',{revision:state.revision,connectionId});
  state=await service.dispatch('serviceSave',{revision:state.revision,label:'New',serviceOrigin:'http://127.0.0.1:43119'});
  assert.equal(pairings,1);assert.equal(state.connections[1].status,'UNCONNECTED');
  assert.equal(state.connections[0].history.at(-1).operationId,operationId);
  assert.equal(state.connections[0].history.at(-1).outcome,'ARCHIVED_UNKNOWN');
});
