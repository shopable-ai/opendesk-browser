import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {LOCAL_PROJECT_SOURCE as LIMITS,validLocalProjectRequest} from '../../native-agent/local-project-source-contract.mjs';
import {createFrozenProjectSources} from '../../native-agent/local-dev/frozen-source.mjs';
import {createLocalProjectProvider} from '../../native-agent/local-dev/provider.mjs';
import {createLocalProjectClient} from '../../src/native-agent/local-project-client.js';
import {createLocalProjectService} from '../../src/native-agent/local-project-service.js';
import {MAX_BYTES} from '../../native-agent/wire.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const bindingId='local-'+'a'.repeat(20),epoch='epoch-a';
function fixture(source='/*中文😀\n'+('x\\"\n'.repeat(35000))+'*/'){
  const binding={},value=Object.freeze({bindingId,projectId:'chart',runtimeKind:'page-userscript',entryFormat:'async-main',managedUI:true,
    sourceUtf8:source,sourceBytes:Buffer.byteLength(source),sourceHash:sha(source),inputHash:'b'.repeat(64),artifactId:'c'.repeat(64),sourceRevision:'b'.repeat(64),siteOrigins:['https://example.test']});
  let verified=0,resolveCalls=0,revisionOK=true;
  const resolver={closed:false,cache:new Map([[bindingId,value]]),get:id=>{assert.equal(id,bindingId);return binding;},list:()=>[{bindingId,name:'Chart'}],
    validateFrozen:async(id,identity)=>{assert.equal(id,bindingId);assert.equal(identity.sourceHash,value.sourceHash);verified++;if(!revisionOK)throw Object.assign(new Error('Source changed'),{code:'E_PROJECT_CHANGED'});return value;}};
  const session={resolver,resolve:async id=>{assert.equal(id,bindingId);resolveCalls++;return value;}};
  return {value,resolver,session,change:()=>{revisionOK=false;},counts:()=>({verified,resolveCalls})};
}
class Socket extends EventEmitter{
  destroyed=false;writableLength=0;sent=[];onSent=null;
  write(bytes){const row=JSON.parse(Buffer.from(bytes).toString());assert.ok(Buffer.byteLength(JSON.stringify(row))<=MAX_BYTES);this.sent.push(row);this.onSent?.(row);}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('close');}
  feed(row){this.emit('data',Buffer.from(JSON.stringify(row)+'\n'));}
}
function providerFixture(f,{negotiated=true}={}){
  const socket=new Socket(),provider=createLocalProjectProvider({session:f.session,installation:()=>({socketPath:'/private/test.sock',clientCredential:'secret'}),connect:()=>socket,retryMs:100000});
  socket.emit('connect');socket.feed({v:1,kind:'authenticated',browserReady:true,localDevVersion:1,...(negotiated?{localDevSourceVersion:1}:{})});
  const registration=socket.sent.at(-1);assert.equal(registration.localDevSourceVersion,negotiated?1:undefined);
  socket.feed({v:1,kind:'provider.registered',providerId:registration.providerId,providerEpoch:epoch});return {socket,provider};
}
function roundTrip(t,f,{mutate=x=>x,beforeValidate=()=>{},negotiated=true}={}){
  const {socket,provider}=providerFixture(f,{negotiated}),client=createLocalProjectClient(),methods=[];
  t.after(()=>{client.dispose();provider.close();});
  socket.onSent=message=>{if(message.kind==='dev.response')queueMicrotask(()=>client.receive({type:'native-agent.dev.response',requestId:message.requestId,providerEpoch:message.providerEpoch,...mutate(message)}));};
  client.connect({postMessage:message=>{methods.push(message.method);if(message.method==='project.source.validate')beforeValidate();socket.feed({v:1,kind:'dev.request',providerEpoch:epoch,requestId:message.requestId,method:message.method,params:message.params});}},'host-a');
  client.receive({type:'host-bound'});return {client,socket,methods,provider};
}
test('frozen source descriptor uses bounded base64 chunks and round-trips UTF-8 without another resolve',async t=>{
  const f=fixture(),r=roundTrip(t,f),result=await r.client.request('project.resolve',{bindingId});
  assert.equal(result.sourceUtf8,f.value.sourceUtf8);assert.equal(result.sourceHash,f.value.sourceHash);assert.equal(result.sourceRef,undefined);
  assert.equal(r.methods.filter(x=>x==='project.resolve').length,1);assert.equal(r.methods.at(-1),'project.source.validate');
  assert.equal(r.methods.filter(x=>x==='project.source.read').length,Math.ceil(f.value.sourceBytes/LIMITS.chunkBytes));
  assert.deepEqual(f.counts(),{verified:1,resolveCalls:1});assert.ok(r.socket.sent.every(row=>Buffer.byteLength(JSON.stringify(row))<=MAX_BYTES));
  const parts=r.socket.sent.filter(row=>row.result?.dataBase64);assert.ok(parts.every(row=>row.result.dataBase64.length<=LIMITS.maxBase64Bytes));
  assert.equal(r.methods.some(x=>/run|install|preview/.test(x)),false);assert.deepEqual(r.client.snapshot(),{pending:0,timers:0,subscriptions:0});
});
test('old Host keeps small inline source and clearly rejects a large frozen source without new methods',async t=>{
  for(const source of ['async function main(){return 1}','/*'+'x'.repeat(70000)+'*/']){
    const f=fixture(source),r=roundTrip(t,f,{negotiated:false});
    if(f.value.sourceBytes>MAX_BYTES)await assert.rejects(r.client.request('project.resolve',{bindingId}),{code:'E_NATIVE_UPDATE_REQUIRED'});
    else assert.equal((await r.client.request('project.resolve',{bindingId})).sourceUtf8,source);
    assert.deepEqual(r.methods,['project.resolve']);
  }
});
test('part source, binding, artifact, offset, size, epoch and base64 corruption fail before final validation',async t=>{
  const changes=[row=>row.result.sourceHash='0'.repeat(64),row=>row.result.bindingId='local-other',row=>row.result.artifactId='d'.repeat(64),row=>row.result.offset++,row=>row.result.byteLength--,row=>row.providerEpoch='epoch-b',row=>row.result.dataBase64='!invalid',row=>row.result.dataBase64='YQ=='];
  for(const change of changes){const f=fixture(),r=roundTrip(t,f,{mutate:row=>{if(row.result?.dataBase64)change(row);return row;}});await assert.rejects(r.client.request('project.resolve',{bindingId}),{code:'E_DEV_HASH'});assert.equal(f.counts().verified,0);r.client.dispose();r.provider.close();}
});
test('correctly-sized tampered bytes fail the complete source hash and changed source fails final validation',async t=>{
  for(const mode of ['bytes','revision']){
    const f=fixture(),r=roundTrip(t,f,{mutate:row=>{if(mode==='bytes'&&row.result?.dataBase64){const b=Buffer.from(row.result.dataBase64,'base64');b[0]^=1;row.result.dataBase64=b.toString('base64');}return row;},beforeValidate:()=>{if(mode==='revision')f.change();}});
    await assert.rejects(r.client.request('project.resolve',{bindingId}),{code:mode==='bytes'?'E_DEV_HASH':'E_PROJECT_CHANGED'});
    assert.equal(f.counts().resolveCalls,1);assert.equal(f.counts().verified,mode==='bytes'?0:1);
  }
});
test('expiry, changed binding, changed cached version and detach block frozen reads without resolving',async()=>{
  for(const mode of ['expiry','binding','cache','closed']){
    const f=fixture();let now=100;const sources=createFrozenProjectSources({resolver:f.resolver,now:()=>now,newId:()=> 'transfer-a'}),ref=sources.capture(f.value,epoch),params={bindingId,transferId:ref.transferId,artifactId:ref.artifactId,inputHash:ref.inputHash,sourceHash:ref.sourceHash,sourceBytes:ref.sourceBytes,offset:0};
    if(mode==='expiry')now+=LIMITS.ttlMs+1;if(mode==='binding')f.resolver.get=()=>({});if(mode==='cache')f.resolver.cache.set(bindingId,{...f.value,inputHash:'e'.repeat(64)});if(mode==='closed')f.resolver.closed=true;
    assert.throws(()=>sources.read(params,epoch),{code:mode==='expiry'?'E_DEV_SOURCE_EXPIRED':mode==='cache'?'E_PROJECT_CHANGED':'E_DEV_DETACHED'});assert.equal(f.counts().resolveCalls,0);
  }
});
test('chunk requests reject paths, unknown fields, arbitrary lengths and non-aligned offsets',()=>{
  const f=fixture(),sources=createFrozenProjectSources({resolver:f.resolver}),ref=sources.capture(f.value,epoch),base={bindingId,transferId:ref.transferId,artifactId:ref.artifactId,inputHash:ref.inputHash,sourceHash:ref.sourceHash,sourceBytes:ref.sourceBytes,offset:0};
  assert.equal(validLocalProjectRequest('project.source.read',base),true);
  for(const extra of [{path:'/etc/passwd'},{length:1000000},{offset:1},{offset:-1},{offset:base.sourceBytes},{sourceBytes:LIMITS.maxBytes+1},{transferId:'../file'}])assert.equal(validLocalProjectRequest('project.source.read',{...base,...extra}),false);
});
test('source bridge forwards read-only identity only after capability negotiation and rejects a changed Native generation',async t=>{
  const sent=[],received=[],host={registrationId:'host-a',postMessage:x=>received.push(x)},hostPorts=new Map([['doc-a',host]]),connection={enabled:true,ready:true,generation:1,port:{postMessage:x=>sent.push(x)}};
  const service=createLocalProjectService({api:{permissions:{contains:async()=>true}},hostPorts,connection:()=>connection});t.after(()=>service.disconnected());service.receive({v:1,kind:'dev.state',connected:true,providerEpoch:epoch});
  const f=fixture(),sources=createFrozenProjectSources({resolver:f.resolver}),ref=sources.capture(f.value,epoch),params={bindingId,transferId:ref.transferId,artifactId:ref.artifactId,inputHash:ref.inputHash,sourceHash:ref.sourceHash,sourceBytes:ref.sourceBytes,offset:0};
  const request={type:'native-agent.dev.request',registrationId:'host-a',requestId:'one',method:'project.source.read',params};
  service.acceptHostRequest(host,request);await tick();assert.equal(received.at(-1).error.code,'E_NATIVE_UPDATE_REQUIRED');assert.equal(sent.length,0);
  service.negotiateSource(1);service.acceptHostRequest(host,request);await tick();assert.deepEqual(sent[0].params,params);connection.generation++;
  service.receive({v:1,kind:'dev.response',providerEpoch:epoch,requestId:sent[0].requestId,result:sources.read(params,epoch)});assert.equal(received.at(-1).error.code,'E_DEV_DISCONNECTED');
});
test('disconnect during source transfer rejects without replay after a new connection',async t=>{
  const f=fixture(),r=roundTrip(t,f,{mutate:row=>{if(row.result?.dataBase64)r.client.disconnect();return row;}});
  await assert.rejects(r.client.request('project.resolve',{bindingId}),{code:'E_DEV_DISCONNECTED'});const count=r.methods.length;
  r.client.connect({postMessage:()=>assert.fail('must not replay old reads')},'host-b');r.client.receive({type:'host-bound'});assert.equal(r.methods.length,count);
});

test('actual Resolver final frozen validation reuses guarded source snapshots and never rebuilds',async t=>{
  const [{LocalDevResolver},fs,os,path]=await Promise.all([import('../../native-agent/local-dev/resolver.mjs'),import('node:fs'),import('node:os'),import('node:path')]);
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-frozen-source-'))),file=path.join(root,'main.js');
  const source='/*'+'x\n'.repeat(22000)+'*/\nasync function main(){return 1;}';fs.writeFileSync(file,source);
  const resolver=new LocalDevResolver({allowedPaths:[file]});t.after(()=>{resolver.close();fs.rmSync(root,{recursive:true,force:true});});
  const {bindingId:id}=resolver.attach({path:file,runtimeKind:'page-userscript',siteOrigin:'https://example.test'});let hooks=0;
  const value=await resolver.resolve(id,{beforeVerify:()=>{hooks++;}}),sources=createFrozenProjectSources({resolver}),ref=sources.capture(value,epoch);
  const params={bindingId:id,transferId:ref.transferId,artifactId:ref.artifactId,inputHash:ref.inputHash,sourceHash:ref.sourceHash,sourceBytes:ref.sourceBytes};
  resolver.resolve=()=>assert.fail('frozen reads must not invoke resolve or compile');
  assert.equal((await sources.validate(params,epoch)).validated,true);assert.equal(hooks,1,'read validation must not replay an admission hook');
  assert.equal(Buffer.from(sources.read({...params,offset:0},epoch).dataBase64,'base64').equals(Buffer.from(source).subarray(0,LIMITS.chunkBytes)),true);
  fs.writeFileSync(file,source.replace('return 1','return 2'));
  await assert.rejects(sources.validate(params,epoch),{code:'E_PROJECT_CHANGED'});assert.equal(hooks,1);assert.equal(resolver.buildCounts.get(id)||0,0);
});
