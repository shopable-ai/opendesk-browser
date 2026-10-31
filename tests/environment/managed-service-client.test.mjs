import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedServiceClient} from '../../src/native-agent/managed-service-client.js';

const protocol='opendesk.managed-services.v1';
const descriptor={serviceId:'usage',serviceInstanceId:'instance_1',providerEpoch:'epoch_1',
  productName:'Local usage',origin:'http://usage-0123456789abcdef01234567.localhost:43210',
  capabilities:['usage:manual-binding','policy:metadata-state']};
const owner={extensionId:'a'.repeat(32),toolId:'cookie-editor',packageHash:'b'.repeat(64),installEpoch:'install_1'};
function fixture({permission=async()=>true,development}={}){
  const sent=[],port={postMessage:message=>sent.push(message)};
  const connection={enabled:true,ready:true,port,generation:1};
  const client=createManagedServiceClient({api:{permissions:{contains:permission}},connection:()=>connection,timeoutMs:100,development});
  client.negotiate(1);
  client.receive({v:1,kind:'services.state',protocol,services:[descriptor]});
  return {client,connection,sent,call:(action,payload={})=>client.request({serviceId:'usage',providerEpoch:'epoch_1',owner,action,payload})};
}
const reply=(request,result)=>({v:1,kind:'services.response',protocol,requestId:request.requestId,
  serviceId:request.serviceId,providerEpoch:request.providerEpoch,result});

test('managed services negotiate separately and only explicit typed requests reach existing Native port',async()=>{
  const f=fixture();assert.equal(f.client.state().services.length,1);
  const result=f.call('accounts',{connectionId:'conn_1'});await Promise.resolve();
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].kind,'services.request');
  f.client.receive(reply(f.sent[0],{accounts:[]}));assert.deepEqual(await result,{accounts:[]});
  await assert.rejects(f.call('fetch',{url:'https://example.test'}),{code:'E_SERVICE_SCHEMA'});
  assert.equal(f.sent.length,1);f.client.dispose();
});
test('permission await freezes input and rechecks exact port generation before dispatch',async()=>{
  let release;const f=fixture({permission:()=>new Promise(resolve=>{release=resolve;})});
  const payload={connectionId:'conn_1'},result=f.call('connect',payload);payload.connectionId='changed';
  f.connection.generation++;release(true);
  await assert.rejects(result,{code:'E_SERVICE_DISCONNECTED',outcome:'NOT_DISPATCHED'});
  assert.equal(f.sent.length,0);f.client.dispose();
});
test('provider epoch retirement rejects an in-flight mutation as unknown without replay',async()=>{
  const f=fixture(),result=f.call('bind',{connectionId:'conn_1'});await Promise.resolve();
  const original=f.sent[0];
  f.client.receive({v:1,kind:'services.state',protocol,services:[{...descriptor,providerEpoch:'epoch_2'}]});
  await assert.rejects(result,{code:'E_SERVICE_DISCONNECTED',outcome:'OUTCOME_UNKNOWN'});
  assert.equal(f.client.receive(reply(original,{bound:true})),true);
  assert.equal(f.sent.length,1);f.client.dispose();
});
test('late or mismatched response cannot turn a mutation into success',async()=>{
  const f=fixture(),result=f.call('connect',{connectionId:'conn_1'});await Promise.resolve();
  f.client.receive({...reply(f.sent[0],{connected:true}),providerEpoch:'wrong_epoch'});
  await assert.rejects(result,{code:'E_SERVICE_SESSION',outcome:'OUTCOME_UNKNOWN'});
  assert.equal(f.sent.length,1);f.client.dispose();
});
test('unsupported Native stays unavailable; read disconnect and mutation timeout remain distinct',async()=>{
  const f=fixture();f.client.negotiate(0);
  await assert.rejects(f.call('accounts'),{code:'E_SERVICE_UNSUPPORTED'});
  f.client.negotiate(1);f.client.receive({v:1,kind:'services.state',protocol,services:[descriptor]});
  const read=f.call('policy');await Promise.resolve();f.client.disconnected();
  await assert.rejects(read,{outcome:'FAILED_CONFIRMED'});
  f.client.negotiate(1);f.client.receive({v:1,kind:'services.state',protocol,services:[descriptor]});
  await assert.rejects(f.call('bind'),{code:'E_SERVICE_TIMEOUT',outcome:'OUTCOME_UNKNOWN'});
  assert.equal(f.sent.length,2);f.client.dispose();
});
test('development reload guard sees live service calls and held updates cannot dispatch',async()=>{
  let active=0;const development={held:true,nativeStarted(){active++;return ()=>active--;}};
  const f=fixture({development});await assert.rejects(f.call('connect'),{code:'E_DEV_RELOADING',outcome:'NOT_DISPATCHED'});
  assert.equal(f.sent.length,0);development.held=false;
  const pending=f.call('bind');await Promise.resolve();assert.equal(active,1);
  f.client.disconnected();await assert.rejects(pending,{outcome:'OUTCOME_UNKNOWN'});assert.equal(active,0);
  f.client.dispose();
});
