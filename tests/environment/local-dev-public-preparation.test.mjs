import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as providerModule from '../../native-agent/local-dev/provider.mjs';

const privateState=()=>({state:'source-error',sourceUtf8:'private source',files:[{path:'/Users/private'}],
  error:{code:'E_PROJECT_WEBPACK',message:'/Users/private/project leaked',location:{file:'/Users/private/file.js',line:3}},
  timings:{totalMs:2,sourceUtf8:'private',negative:-3}});
test('public preparation strips source bytes, absolute diagnostics and unknown fields',()=>{
  const input=privateState(),out=providerModule.publicLocalProjectPreparation(input),text=JSON.stringify(out);
  assert.equal(out.state,'source-error');assert.equal(out.timings.totalMs,2);
  assert.doesNotMatch(text,/private|sourceUtf8|leaked/);
  assert.equal(input.error.message,'/Users/private/project leaked','private MCP diagnostics remain unchanged');
});
test('public preparation retains bounded identity, timings and relative actionable diagnostics',()=>{
  const hash='a'.repeat(64),out=providerModule.publicLocalProjectPreparation({state:'ready',sourceRevision:hash,
    sourceHash:hash,artifactId:hash,buildCount:3,cacheHits:2,notificationToStartMs:403.5,
    timings:{webpackMs:13.5,moduleCount:17,buildCount:1},
    error:{code:'E_PROJECT_SYNTAX',location:{file:'src/main.js',line:2,column:3}}});
  assert.equal(out.sourceHash,hash);assert.equal(out.buildCount,3);assert.equal(out.timings.moduleCount,17);
  assert.match(out.error.message,/src\/main\.js:2:4/);
});
test('malformed public preparation cannot introduce identity or unbounded metadata',()=>{
  const out=providerModule.publicLocalProjectPreparation({state:'execute',sourceHash:'../private',artifactId:'z'.repeat(64),
    buildCount:-1,cacheHits:Infinity,preparations:1e99,notificationToStartMs:NaN,debounceMs:1e99,
    timings:{totalMs:-1,webpackMs:Infinity,moduleCount:0.5},error:{code:'bad',message:'secret',location:'../private'}});
  assert.deepEqual(out.timings,{});assert.equal(out.state,'unprepared');
  assert.equal(Object.hasOwn(out,'sourceHash'),false);assert.equal(Object.hasOwn(out,'buildCount'),false);
  assert.doesNotMatch(JSON.stringify(out),/secret|private/);
});
class Socket extends EventEmitter{
  destroyed=false;writableLength=0;sent=[];
  write(bytes){this.sent.push(JSON.parse(Buffer.from(bytes).toString('utf8')));}
  feed(value){this.emit('data',Buffer.from(JSON.stringify(value)+'\n'));}
  destroy(){if(!this.destroyed){this.destroyed=true;this.emit('close');}}
}
test('preparation notifications require explicit Host capability and release subscriptions',()=>{
  for(const version of [undefined,0,'1',1]){
    const listeners=new Set(),socket=new Socket(),row={bindingId:'local-a',name:'A',preparation:{state:'updating'}};
    const session={resolver:{list:()=>[row],get:()=>({runtimeKind:'controller'}),preparation:{start(){},stopAll(){},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}}}};
    const provider=providerModule.createLocalProjectProvider({session,leaseId:'owned-lease',installation:()=>({socketPath:'/owned/socket',clientCredential:'test'}),connect:()=>socket,retryMs:100000});
    socket.emit('connect');socket.feed({v:1,kind:'authenticated',browserReady:true,localDevVersion:1,localDevMultiVersion:1,localDevPreparationVersion:version});
    assert.equal(listeners.size,0,'not subscribed before registration');
    socket.feed({v:1,kind:'provider.registered',providerId:socket.sent.at(-1).providerId,providerEpoch:'epoch-a'});
    assert.equal(listeners.size,version===1?1:0);
    row.preparation.state='ready';for(const fn of listeners)fn();
    const updates=socket.sent.filter(value=>value.kind==='provider.changed');
    assert.equal(updates.length,version===1?1:0);
    if(version===1){assert.equal(updates[0].projects[0].preparation.state,'ready');assert.equal(updates[0].providerEpoch,'epoch-a');}
    socket.destroy();assert.equal(listeners.size,0,'disconnect releases subscription');provider.close();
  }
});
test('legacy listing and modern catalog both sanitize preparation at the actual provider boundary',async t=>{
  for(const modern of [false,true]){
    const raw=privateState(),row={bindingId:'local-a',name:'A',preparation:raw};
    const socket=new Socket(),session={resolver:{list:()=>[row],get:()=>({runtimeKind:'controller'})}};
    const provider=providerModule.createLocalProjectProvider({session,leaseId:modern?'owned-lease':null,
      installation:()=>({socketPath:'/owned/agent.sock',clientCredential:'test'}),connect:()=>socket,retryMs:100000});
    t.after(()=>provider.close());socket.emit('connect');
    socket.feed({v:1,kind:'authenticated',browserReady:true,localDevVersion:1,localDevMultiVersion:1});
    const registration=socket.sent.at(-1);
    if(modern){assert.equal(registration.projects[0].preparation.state,'source-error');
      assert.doesNotMatch(JSON.stringify(registration.projects),/private|sourceUtf8|leaked/);}
    socket.feed({v:1,kind:'provider.registered',providerId:registration.providerId,providerEpoch:'epoch-a'});
    socket.feed({v:1,kind:'dev.request',providerEpoch:'epoch-a',requestId:'list-a',method:'projects.list',params:{}});
    await new Promise(resolve=>setImmediate(resolve));const response=socket.sent.at(-1);
    assert.equal(response.kind,'dev.response');assert.equal(response.providerEpoch,'epoch-a');
    assert.equal(response.result.projects[0].preparation.state,'source-error');
    assert.doesNotMatch(JSON.stringify(response.result),/private|sourceUtf8|leaked/);
    assert.equal(row.preparation,raw,'boundary projection does not mutate private preparation');
    provider.close();
  }
});
