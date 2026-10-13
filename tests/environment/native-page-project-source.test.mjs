import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {createLocalProjectProvider} from '../../native-agent/local-dev/provider.mjs';
import {MAX_BYTES} from '../../native-agent/wire.mjs';
import {createNativeAgentHostAdapter} from '../../src/native-agent/host-adapter.js';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const bytes=value=>new TextEncoder().encode(value).length;
const bindingId='local-v1-'+'a'.repeat(24);
const target={windowId:1,tabId:2,frameId:0,documentId:'doc-one',url:'https://example.test/toc',origin:'https://example.test'};
class Socket extends EventEmitter{
  destroyed=false;writableLength=0;sent=[];
  write(bytes){this.sent.push(JSON.parse(Buffer.from(bytes).toString('utf8')));}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('close');}
  feed(value){this.emit('data',Buffer.from(JSON.stringify(value)+'\n'));}
}

function source(value='async function main(){}'){
  const sourceHash=hash(value);
  return {bindingId,projectId:'page.large',runtimeKind:'page-userscript',entry:'src/main.js',entryFormat:'async-main',
    sourceUtf8:value,sourceHash,sourceBytes:bytes(value),inputHash:hash('input:'+sourceHash),artifactId:hash('artifact:'+sourceHash),
    managedUI:true,siteOrigins:[target.origin]};
}

test('MCP Page preview sends oversized source as compact frozen projectSource identity',async()=>{
  const resolved=source('/*'+'x'.repeat(482082)+'*/\nasync function main(){}');
  let sent;
  const session=new LocalDevSession({resolver:{close(){},get:()=>({}),resolve:async()=>resolved},request:async(method,params,requestId)=>{
    if(method==='target.current')return {v:1,kind:'response',requestId,result:{registrationId:'host-one',target}};
    sent=params;return {v:1,kind:'response',requestId,result:{kind:'page-userscript',previewId:'preview-one',sourceHash:resolved.sourceHash,target,
      state:'preview-pending',durable:false,managedUI:true,bindingId}};
  }});
  session.provider={state:()=>({connected:true,providerEpoch:'epoch-one'})};
  const started=await session.run({bindingId,requestId:'large-page'});
  assert.equal(started.previewId,'preview-one');
  assert.equal(Object.hasOwn(sent,'sourceUtf8'),false);
  assert.equal(sent.projectSource.bindingId,bindingId);
  assert.equal(sent.projectSource.sourceHash,resolved.sourceHash);
  assert.equal(sent.projectSource.providerEpoch,'epoch-one');
  assert.equal(Buffer.byteLength(JSON.stringify({v:1,kind:'request',method:'page.preview',requestId:'large-page',params:sent}),'utf8')<MAX_BYTES-4096,true);
});

test('local project provider state exposes registered providerEpoch for Page source freezing',()=>{
  const socket=new Socket(),provider=createLocalProjectProvider({session:{resolver:{list:()=>[],preparation:{stopAll(){}}}},installation:()=>({socketPath:'/tmp/native-source.sock',clientCredential:'secret'}),connect:()=>socket,retryMs:100000});
  try{
    assert.equal(Object.hasOwn(provider.state(),'providerEpoch'),false);
    socket.emit('connect');
    socket.feed({v:1,kind:'authenticated',browserReady:true,localDevVersion:1,localDevSourceVersion:1});
    const registration=socket.sent.at(-1);
    socket.feed({v:1,kind:'provider.registered',providerId:registration.providerId,providerEpoch:'epoch-one'});
    assert.equal(provider.state().providerEpoch,'epoch-one');
  }finally{provider.close();}
});

function adapterFixture({resolved=source(),projectError}={}){
  let dispatches=0;
  const client={ready:Promise.resolve(),registration:{registrationId:'host-one'},subscribeNativeAgent:()=>()=>{},
    requestLocalProject:async(method,params)=>{assert.equal(method,'project.resolve');assert.deepEqual(params,{bindingId});if(projectError)throw Object.assign(new Error(projectError),{code:projectError});return resolved;},
    request:async(method)=>{if(method==='previewPageScript')dispatches++;return {sourceHash:resolved.sourceHash,world:'USER_SCRIPT',documentId:target.documentId,tabId:target.tabId,state:'preview-evaluated',managedUI:true};}};
  const adapter=createNativeAgentHostAdapter({client,host:{currentRun:null},currentPageTarget:{ready:Promise.resolve(),refresh:async()=>{},capture:()=>({...target,status:'available'}),revalidate:async()=>{}},
    api:{permissions:{contains:async()=>true},tabs:{query:async()=>[{id:target.tabId}]}}});
  return {adapter,get dispatches(){return dispatches;}};
}

test('HostAdapter accepts hydrated provider format without entry when frozen identity and epoch match',async t=>{
  const original=source(),{entry,...providerResolved}={...original,providerEpoch:'epoch-one'};
  const f=adapterFixture({resolved:providerResolved});t.after(()=>f.adapter.dispose());
  const row=await f.adapter.handle({method:'page.preview',params:{sourceHash:original.sourceHash,sourceBytes:original.sourceBytes,target,entryFormat:'async-main',
    bindingId,managedUI:true,projectSource:{bindingId,runtimeKind:original.runtimeKind,entry:original.entry,entryFormat:original.entryFormat,managedUI:true,providerEpoch:'epoch-one',
      artifactId:original.artifactId,inputHash:original.inputHash,sourceHash:original.sourceHash,sourceBytes:original.sourceBytes}}});
  assert.equal(row.state,'preview-pending');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.dispatches,1);
});

test('HostAdapter rejects changed frozen Page identity before preview dispatch',async t=>{
  const original=source(),changed={...original,sourceHash:hash('changed'),sourceUtf8:'async function main(){return 2}',sourceBytes:bytes('async function main(){return 2}')};
  const f=adapterFixture({resolved:changed});t.after(()=>f.adapter.dispose());
  await assert.rejects(()=>f.adapter.handle({method:'page.preview',params:{sourceHash:original.sourceHash,sourceBytes:original.sourceBytes,target,entryFormat:'async-main',
    bindingId,managedUI:true,projectSource:{bindingId,runtimeKind:original.runtimeKind,entry:original.entry,entryFormat:original.entryFormat,managedUI:true,providerEpoch:'epoch-one',
      artifactId:original.artifactId,inputHash:original.inputHash,sourceHash:original.sourceHash,sourceBytes:original.sourceBytes}}}),{code:'E_DEV_HASH'});
  assert.equal(f.dispatches,0);
});

test('HostAdapter rejects provider epoch changes before preview dispatch',async t=>{
  const original=source(),f=adapterFixture({resolved:{...original,providerEpoch:'epoch-two'}});t.after(()=>f.adapter.dispose());
  await assert.rejects(()=>f.adapter.handle({method:'page.preview',params:{sourceHash:original.sourceHash,sourceBytes:original.sourceBytes,target,entryFormat:'async-main',
    bindingId,managedUI:true,projectSource:{bindingId,runtimeKind:original.runtimeKind,entry:original.entry,entryFormat:original.entryFormat,managedUI:true,providerEpoch:'epoch-one',
      artifactId:original.artifactId,inputHash:original.inputHash,sourceHash:original.sourceHash,sourceBytes:original.sourceBytes}}}),{code:'E_DEV_HASH'});
  assert.equal(f.dispatches,0);
});

test('HostAdapter propagates provider update requirement before preview dispatch',async t=>{
  const original=source(),f=adapterFixture({resolved:original,projectError:'E_NATIVE_UPDATE_REQUIRED'});t.after(()=>f.adapter.dispose());
  await assert.rejects(()=>f.adapter.handle({method:'page.preview',params:{sourceHash:original.sourceHash,sourceBytes:original.sourceBytes,target,entryFormat:'async-main',
    bindingId,managedUI:true,projectSource:{bindingId,runtimeKind:original.runtimeKind,entry:original.entry,entryFormat:original.entryFormat,managedUI:true,providerEpoch:'epoch-one',
      artifactId:original.artifactId,inputHash:original.inputHash,sourceHash:original.sourceHash,sourceBytes:original.sourceBytes}}}),{code:'E_NATIVE_UPDATE_REQUIRED'});
  assert.equal(f.dispatches,0);
});
test('HostAdapter refuses large projectSource without a frozen provider epoch',async t=>{
  const original=source(),f=adapterFixture({resolved:original});t.after(()=>f.adapter.dispose());
  await assert.rejects(()=>f.adapter.handle({method:'page.preview',params:{sourceHash:original.sourceHash,sourceBytes:original.sourceBytes,target,entryFormat:'async-main',bindingId,managedUI:true,
    projectSource:{bindingId,runtimeKind:original.runtimeKind,entryFormat:original.entryFormat,managedUI:true,artifactId:original.artifactId,inputHash:original.inputHash,sourceHash:original.sourceHash,sourceBytes:original.sourceBytes}}}),{code:'E_SCHEMA'});
  assert.equal(f.dispatches,0);
});
