import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLocalProjectService} from '../../src/native-agent/local-project-service.js';
import {createLocalProjectClient} from '../../src/native-agent/local-project-client.js';
import {createLocalProjectProvider} from '../../native-agent/local-dev/provider.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const request=(id,method='project.resolve',params={bindingId:'local-a'})=>({type:'native-agent.dev.request',requestId:id,method,params,registrationId:'host-a'});
function serviceFixture(){
  const sent=[],received=[],host={registrationId:'host-a',postMessage:x=>received.push(x)},hostPorts=new Map([['doc-a',host]]);
  const connection={enabled:true,ready:true,generation:1,port:{postMessage:x=>sent.push(x)}};
  const service=createLocalProjectService({api:{permissions:{contains:async()=>true}},hostPorts,connection:()=>connection});
  service.receive({v:1,kind:'dev.state',connected:true,providerEpoch:'epoch-a'});
  return {service,sent,received,host,hostPorts,connection};
}
test('reverse project reads require the exact registered Host object and only bindingId',async t=>{
  const f=serviceFixture();t.after(()=>f.service.disconnected());
  f.service.acceptHostRequest({registrationId:'host-a',postMessage:()=>assert.fail('unregistered recipient')},request('fake'));
  f.service.acceptHostRequest(f.host,request('path','project.resolve',{bindingId:'local-a',path:'/etc/passwd'}));
  await tick();assert.equal(f.sent.length,0);assert.equal(f.received.at(-1).error.code,'E_SCHEMA');
  f.service.acceptHostRequest(f.host,request('valid'));await tick();
  assert.equal(f.sent.length,1);assert.notEqual(f.sent[0].requestId,'valid');assert.deepEqual(f.sent[0].params,{bindingId:'local-a'});
  f.service.receive({v:1,kind:'dev.response',providerEpoch:'epoch-a',requestId:f.sent[0].requestId,result:{sourceHash:'hash'}});
  assert.equal(f.received.at(-1).requestId,'valid');assert.equal(f.received.at(-1).result.sourceHash,'hash');
});
test('provider changes, Native generation changes and closed Host replies never deliver old source',async t=>{
  for(const boundary of ['provider','native','host']){
    const f=serviceFixture();t.after(()=>f.service.disconnected());
    f.service.acceptHostRequest(f.host,request(boundary));await tick();const dispatched=f.sent[0];
    if(boundary==='provider')f.service.receive({v:1,kind:'dev.state',connected:true,providerEpoch:'epoch-b'});
    if(boundary==='native')f.connection.generation++;
    if(boundary==='host'){f.hostPorts.clear();f.service.dropHost(f.host);}
    f.service.receive({v:1,kind:'dev.response',providerEpoch:'epoch-a',requestId:dispatched.requestId,result:{sourceUtf8:'OLD'}});
    assert.equal(f.received.some(x=>x.result?.sourceUtf8==='OLD'),false);
  }
});
test('project client waits for real bind ACK; disconnect rejects read without resend',async t=>{
  const client=createLocalProjectClient();t.after(()=>client.dispose());const messages=[];
  client.connect({postMessage:m=>messages.push(m)},'host-a');
  const result=client.request('projects.list',{});assert.equal(messages.length,0);
  client.receive({type:'host-bound'});assert.equal(messages.length,1);
  client.receive({type:'native-agent.dev.response',requestId:messages[0].requestId,result:{projects:[]},providerEpoch:'epoch-a'});
  assert.deepEqual(await result,{projects:[],providerEpoch:'epoch-a'});
  const pending=client.request('project.resolve',{bindingId:'local-a'});const rejected=assert.rejects(pending,{code:'E_DEV_DISCONNECTED'});
  client.disconnect();await rejected;client.connect({postMessage:m=>messages.push(m)},'host-a');client.receive({type:'host-bound'});
  assert.equal(messages.length,2,'the old read must not be replayed');
  assert.deepEqual(client.snapshot(),{pending:0,timers:0,subscriptions:0});
});
class Socket extends EventEmitter{
  destroyed=false;writableLength=0;sent=[];
  write(bytes){this.sent.push(JSON.parse(Buffer.from(bytes).toString('utf8')));}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('close');}
  feed(value){this.emit('data',Buffer.from(JSON.stringify(value)+'\n'));}
}
function providerFixture(session){
  const socket=new Socket(),provider=createLocalProjectProvider({session,installation:()=>({socketPath:'/owned/agent.sock',clientCredential:'secret'}),connect:()=>socket,retryMs:100000});
  socket.emit('connect');socket.feed({v:1,kind:'authenticated',browserReady:true,localDevVersion:1});
  const registration=socket.sent.at(-1);socket.feed({v:1,kind:'provider.registered',providerId:registration.providerId,providerEpoch:'epoch-a'});
  return {socket,provider};
}
test('MCP provider uses the same resolver and transmits only execution inputs',async t=>{
  const calls=[];const source={bindingId:'local-a',projectId:'a',runtimeKind:'controller',entryFormat:'async-main',sourceUtf8:'return 1',sourceHash:'h',sourceBytes:8,inputHash:'i',siteOrigins:['https://example.test'],files:[{path:'private'}],sourceMapUtf8:'private-map',path:'/private/root'};
  const f=providerFixture({resolver:{list:()=>[{bindingId:'local-a',name:'A'}]},resolve:async bindingId=>{calls.push(bindingId);return source;}});t.after(()=>f.provider.close());
  f.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'one',method:'project.resolve',params:{bindingId:'local-a'}});await tick();
  const response=f.socket.sent.at(-1);assert.equal(response.kind,'dev.response');assert.deepEqual(calls,['local-a']);assert.equal(response.result.sourceUtf8,'return 1');
  for(const key of ['files','sourceMapUtf8','path'])assert.equal(Object.hasOwn(response.result,key),false);
  f.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'two',method:'project.resolve',params:{path:'/etc/passwd'}});
  assert.equal(f.socket.destroyed,true);assert.equal(calls.length,1);
});
test('provider EOF during resolution discards late source and oversized replies stay bounded',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=providerFixture({resolve:async()=>{await gate;return {sourceUtf8:'LATE'};}});t.after(()=>f.provider.close());
  f.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'late',method:'project.resolve',params:{bindingId:'local-a'}});
  await tick();f.provider.close();release();await tick();assert.equal(f.socket.sent.some(x=>x.kind==='dev.response'),false);
  const g=providerFixture({resolve:async()=>({sourceUtf8:'x'.repeat(62000)})});t.after(()=>g.provider.close());
  g.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'large',method:'project.resolve',params:{bindingId:'local-a'}});await tick();
  assert.equal(g.socket.sent.at(-1).error.code,'E_LIMIT');assert.equal(g.socket.sent.at(-1).result,undefined);assert.equal(g.socket.destroyed,false);
});

test('Native provider exposes actionable codes and safe relative module locations, never private paths',async t=>{
  const err=Object.assign(new Error('secret /Users/private/token.pem'),{
    code:'E_REMOTE_UNLOCKED',location:{file:'src/main.js',line:4,column:2}});
  const f=providerFixture({resolver:{list:()=>[]},resolve:async()=>{throw err;}});
  t.after(()=>f.provider.close());
  f.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'diagnostic',method:'project.resolve',params:{bindingId:'local-a'}});
  await tick();
  const response=f.socket.sent.at(-1);
  assert.equal(response.error.code,'E_REMOTE_UNLOCKED');
  assert.match(response.error.message,/src\/main\.js:4:3/);
  assert.match(response.error.message,/锁定/);
  assert.doesNotMatch(response.error.message,/Users|private|token\.pem/);
  err.location={file:'/Users/private/token.pem',line:4,column:2};
  f.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'diagnostic-2',method:'project.resolve',params:{bindingId:'local-a'}});
  await tick();
  assert.doesNotMatch(f.socket.sent.at(-1).error.message,/Users|private|token\.pem/);
});

test('real Provider dev.response measures complete JSON bytes, exact 60 KiB, and recovers',async t=>{
  const {createHash}=await import('node:crypto');
  const {MAX_BYTES}=await import('../../native-agent/wire.mjs');
  const output=source=>({bindingId:'local-a',projectId:'sample.source',
    runtimeKind:'controller',entryFormat:'async-main',
    sourceUtf8:source,sourceBytes:Buffer.byteLength(source,'utf8'),
    sourceHash:createHash('sha256').update(source).digest('hex'),
    inputHash:'f'.repeat(64),cacheHit:false,capturedAt:'2026-10-11T00:00:00Z',
    siteOrigins:['https://example.com']});
  // Equal-length identities make below/exact/+1 refer to actual response bytes.
  const byteLength=(source,requestId)=>Buffer.byteLength(JSON.stringify({v:1,kind:'dev.response',
    providerEpoch:'epoch-a',requestId,result:output(source)}),'utf8');
  const start='x'.repeat(50000),id='limit-00';
  const exact='x'.repeat(start.length+MAX_BYTES-byteLength(start,id));
  const cases=[[-1,exact.slice(0,-1)],[0,exact],[1,exact+'x'],
    ...['\n','"','\\','中文😀','\u0000\u001f'].map(value=>[null,'/*'+value.repeat(40000)+'*/']),
    [null,'return 7']];
  let nextSource;
  const f=providerFixture({resolve:async()=>output(nextSource)});
  t.after(()=>f.provider.close());
  for(const [index,[delta,source]] of cases.entries()){
    const requestId='limit-'+String(index).padStart(2,'0'),jsonBytes=byteLength(source,requestId);
    if(delta!==null)assert.equal(jsonBytes,MAX_BYTES+delta);
    nextSource=source;
    f.socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId,
      method:'project.resolve',params:{bindingId:'local-a'}});
    await tick();
    const reply=f.socket.sent.at(-1);
    assert.equal(reply.kind,'dev.response');assert.equal(reply.requestId,requestId);
    if(jsonBytes>MAX_BYTES){
      assert.equal(reply.error?.code,'E_LIMIT');
      assert.ok(reply.error.message.includes('jsonBytes='+jsonBytes+', limitBytes=61440, dispatch=NOT_DISPATCHED'));
      assert.equal(reply.result,undefined);
    }else{
      assert.equal(reply.error,undefined);
      assert.equal(reply.result.sourceUtf8,source,'must never truncate or reuse old source');
      assert.equal(reply.result.sourceHash,createHash('sha256').update(source).digest('hex'));
    }
    assert.ok(Buffer.byteLength(JSON.stringify(reply),'utf8')<=MAX_BYTES);
    assert.equal(f.socket.destroyed,false);
    assert.ok(f.socket.sent.every(x=>!['run.start','page.preview'].includes(x.method)));
  }
});
