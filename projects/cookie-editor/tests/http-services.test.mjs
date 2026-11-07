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

test('serviceCheck reports separate reachability/session/resource outcomes using only existing read envelopes',async()=>{
  for(const outcome of ['ok','network','session','bridge-session','denied','cache-failure','identity','malformed']){
    let mode='ok';const reads=[];
    const s=await connected({intercept:(operation,input)=>{
      if(operation!=='browser.network.request'||!input.data.path)return;
      reads.push(structuredClone(input));
      if(mode==='network')return Promise.reject(Object.assign(Error(),{code:'E_NETWORK'}));
      if(input.data.path==='/opendesk/v1/self'){
        if(mode==='session')return Promise.resolve({status:403,data:{error:'TRUSTED_SESSION_REQUIRED'}});
        if(mode==='bridge-session')return Promise.reject(Object.assign(Error('HTTP 403'),{code:'E_HTTP'}));
        return Promise.resolve({status:200,data:{serviceInstanceId:mode==='identity'?'other':'instance_01',deviceId:'device_01',connectionId:input.connectionId??s.connectionId}});
      }
      if(mode==='denied')return Promise.resolve({status:403,data:{error:'RESOURCE_REJECTED'}});
      if(mode==='cache-failure')return Promise.resolve({status:503,data:{error:'REQUEST_FAILED'}});
      if(mode==='malformed')return Promise.resolve({status:200,data:{accounts:[{remoteAccountId:'unsafe'}],nextCursor:null}});
    }});
    await s.service.dispatch('serviceResources',{connectionId:s.connectionId});
    const before=await s.service.dispatch('serviceStatus'),callStart=s.f.calls.length;
    mode=outcome;reads.length=0;
    const state=await s.service.dispatch('serviceCheck',{connectionId:s.connectionId});
    const c=state.connections[0],result=c.check;
    assert.equal(state.revision,before.revision);
    assert.equal(c.status,'CONNECTED');assert.equal(c.deviceId,before.connections[0].deviceId);
    assert.deepEqual(c.history,before.connections[0].history);
    assert.deepEqual(c.resources,before.connections[0].resources);
    assert.ok(Number.isSafeInteger(result.checkedAt));
    assert.equal(result.reachable,outcome==='network'?false:true);
    assert.equal(result.session,['session','bridge-session','identity'].includes(outcome)?'REVOKED':outcome==='network'?'NOT_CHECKED':'OK');
    assert.equal(result.resources,outcome==='ok'?'OK':outcome==='denied'?'DENIED':['cache-failure','malformed'].includes(outcome)?'FAILED':'NOT_CHECKED');
    assert.equal(result.message==='',outcome==='ok');
    if(outcome==='network')assert.match(result.message,/确认服务正在运行/);
    if(['session','bridge-session','identity'].includes(outcome))assert.match(result.message,/服务后台核对.*重新建立连接配置/);
    if(outcome==='denied')assert.match(result.message,/联系服务管理员/);
    assert.equal(reads.length,['ok','denied','cache-failure','malformed'].includes(outcome)?2:1);
    assert.ok(reads.every(r=>r.method==='POST'&&r.url.endsWith('/opendesk/client/request')&&r.data.method==='GET'&&!Object.hasOwn(r.data,'body')));
    assert.equal(reads[0].data.path,'/opendesk/v1/self');
    assert.ok(!s.f.calls.slice(callStart).some(r=>r.operation==='browser.storage.local.set'));
    const next=await s.service.dispatch('serviceStatus');assert.deepEqual(next.connections[0].check,result);
    // Even after a later durable edit, neither checks nor cache diagnostics persist.
    if(outcome==='ok')await s.service.dispatch('serviceDisconnect',{revision:state.revision,connectionId:s.connectionId});
    const saved=s.f.calls.filter(r=>r.operation==='browser.storage.local.set').at(-1).input.items['cookie-http-services.v1'];
    assert.equal(Object.hasOwn(saved.connections[0],'check'),false);
    assert.equal(Object.hasOwn(saved.connections[0],'resourceRead'),false);
    assert.equal(Object.hasOwn(saved.connections[0],'usageErrors'),false);
    const {createCookieHttpServices}=await load();
    const reopened=createCookieHttpServices({...s.f,version:'2.0.58'});
    assert.equal((await reopened.dispatch('serviceStatus')).connections[0].check,null);
  }
});

test('unpaired and expired checks do not guess endpoints or renew sessions; status remains local',async()=>{
  const {createCookieHttpServices}=await load(),f=fixture();let now=Date.now();
  const service=createCookieHttpServices({...f,version:'2.0.58',clock:()=>now});
  let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://127.0.0.1:43119'});
  const connectionId=state.connections[0].id;
  const before=f.calls.length;
  state=await service.dispatch('serviceCheck',{connectionId});
  assert.deepEqual(state.connections[0].check,{checkedAt:now,reachable:null,session:'UNPAIRED',resources:'NOT_CHECKED',message:'尚未配对，请从服务后台获取连接码后连接。'});
  await service.dispatch('serviceStatus');
  assert.ok(f.calls.slice(before).every(c=>c.operation==='browser.storage.local.get'));
  state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:'b'.repeat(64)});
  now+=1000000;const start=f.calls.length;
  state=await service.dispatch('serviceCheck',{connectionId});
  assert.equal(state.connections[0].status,'SESSION_EXPIRED');
  assert.equal(state.connections[0].check.session,'EXPIRED');
  assert.ok(f.calls.slice(start).every(c=>c.operation==='browser.storage.local.get'));
});

test('failed resource and usage cache reads retain pairing, old data and transient failure diagnostics',async()=>{
  let broken=false;
  const s=await connected({intercept:(operation,input)=>{
    if(operation!=='browser.network.request'||!input.data.path)return;
    if(broken)return Promise.reject(Object.assign(Error('HTTP 503'),{code:'E_HTTP'}));
    if(input.data.path.endsWith('/usage'))return Promise.resolve({status:200,data:{remoteAccountId:'remote_01',providerKey:'codex',status:'UNKNOWN',account:{windows:[]}}});
  }});
  await s.service.dispatch('serviceResources',{connectionId:s.connectionId});
  const before=await s.service.dispatch('serviceUsage',{connectionId:s.connectionId,remoteAccountId:'remote_01'});
  broken=true;const start=s.f.calls.length;
  await assert.rejects(s.service.dispatch('serviceResources',{connectionId:s.connectionId}),{code:'E_HTTP'});
  await assert.rejects(s.service.dispatch('serviceUsage',{connectionId:s.connectionId,remoteAccountId:'remote_01'}),{code:'E_HTTP'});
  const state=await s.service.dispatch('serviceStatus'),c=state.connections[0];
  assert.equal(c.status,'CONNECTED');assert.equal(state.revision,before.revision);
  assert.deepEqual(c.resources,before.connections[0].resources);
  assert.deepEqual(c.usageCache,before.connections[0].usageCache);
  assert.equal(c.resourceRead.status,'FAILED');assert.equal(c.usageErrors.remote_01.status,'FAILED');
  assert.equal(c.resourceRead.errorCode,'E_HTTP');
  assert.ok(!s.f.calls.slice(start).some(c=>c.operation==='browser.storage.local.set'));
  broken=false;
  const recovered=await s.service.dispatch('serviceResources',{connectionId:s.connectionId});
  assert.equal(recovered.connections[0].resourceRead.status,'OK');
});

test('check cannot bypass an unknown operation or a receipt-only connection',async()=>{
  for(const action of ['serviceOpen','serviceDisconnect']){
    const s=await connected();
    const state=await s.service.dispatch(action,{revision:s.state.revision,connectionId:s.connectionId});
    const start=s.f.calls.length;
    await assert.rejects(s.service.dispatch('serviceCheck',{connectionId:s.connectionId}),{code:'E_OUTCOME_UNKNOWN'});
    const after=await s.service.dispatch('serviceStatus');
    assert.deepEqual(after.connections[0].pending,state.connections[0].pending);
    assert.ok(s.f.calls.slice(start).every(c=>c.operation==='browser.storage.local.get'));
  }
});

test('a rejected pairing reads its exact receipt once; only a proven rejection permits entering a new code',async()=>{
  for(const outcome of ['rejected','unknown','mismatched']){
    const f=fixture(),network=[];let sent;
    const {createCookieHttpServices}=await load();
    const request=async(operation,input)=>{
      if(operation!=='browser.network.request')return f.request(operation,input);
      network.push(structuredClone(input));
      if(input.url.endsWith('/pair')){
        sent=structuredClone(input.data);
        // Model the bridge's code/message-only projection of the real SDK.
        throw Object.assign(Error('HTTP 401'),{code:'E_HTTP'});
      }
      assert.ok(input.url.endsWith('/pair-result'));
      assert.deepEqual(input.data,{receiptKey:sent.receiptKey,connectionId:sent.connectionId,operationId:sent.operationId});
      if(outcome==='unknown')throw Object.assign(Error('HTTP 404'),{code:'E_HTTP'});
      return {status:200,data:{operationId:outcome==='mismatched'?'other':sent.operationId,status:'REJECTED',error:'PAIRING_INVALID'}};
    };
    const service=createCookieHttpServices({request,context:f.context,version:'2.0.58'});
    let state=await service.dispatch('serviceSave',{revision:0,label:'Local',serviceOrigin:'http://127.0.0.1:43119'});
    const connectionId=state.connections[0].id;
    state=await service.dispatch('serviceConnect',{revision:state.revision,connectionId,code:'b'.repeat(64)});
    assert.equal(network.filter(r=>r.url.endsWith('/pair')).length,1);
    assert.equal(network.filter(r=>r.url.endsWith('/pair-result')).length,1);
    if(['unknown','mismatched'].includes(outcome)){
      assert.equal(state.connections[0].status,'OUTCOME_UNKNOWN');
      assert.equal(state.connections[0].pending.operationId,sent.operationId);
    }else{
      assert.equal(state.connections[0].status,'UNCONNECTED');
      assert.equal(state.connections[0].pending,null);
      assert.equal(state.connections[0].history.at(-1).outcome,'REJECTED');
    }
  }
});

test('untrusted errors and provider messages never enter checks, cache errors or thrown domain errors',async()=>{
  const secret='PRIVATE_REMOTE_SECRET';let mode='resources';
  const s=await connected({intercept:(operation,input)=>{
    if(operation!=='browser.network.request'||!input.data.path)return;
    if(mode==='self'||input.data.path.endsWith('/usage'))return Promise.reject(Object.assign(Error(secret),{code:secret}));
  }});
  await s.service.dispatch('serviceResources',{connectionId:s.connectionId});
  await assert.rejects(s.service.dispatch('serviceUsage',{connectionId:s.connectionId,remoteAccountId:'remote_01'}),error=>{
    assert.equal(error.code,'E_SERVICE_RESPONSE');assert.equal(error.message,'E_SERVICE_RESPONSE');return true;
  });
  let state=await s.service.dispatch('serviceStatus');
  assert.equal(state.connections[0].usageErrors.remote_01.errorCode,'E_SERVICE_RESPONSE');
  mode='self';state=await s.service.dispatch('serviceCheck',{connectionId:s.connectionId});
  assert.equal(state.connections[0].check.reachable,null);
  assert.ok(!JSON.stringify(state).includes(secret));
});
