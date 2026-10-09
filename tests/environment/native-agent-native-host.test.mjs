import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {PassThrough} from 'node:stream';
import {createNativeHost} from '../../native-agent/native-host.mjs';
import {HOST_NAME,NativeDecoder,LineDecoder,frame,writeLine} from '../../native-agent/wire.mjs';

const ID='abcdefghijklmnopabcdefghijklmnop';
const CREDENTIAL='a'.repeat(64);
function collect(stream,decoder) {
  const messages=[],waiters=[];
  stream.on('data',chunk=>{
    for (const data of decoder.push(chunk)) {
      if (waiters.length) waiters.shift()(data);else messages.push(data);
    }
  });
  return {next:()=>messages.length?Promise.resolve(messages.shift()):new Promise(resolve=>waiters.push(resolve))};
}
async function fixture(t,opts={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-native-'));
  const socketPath=path.join(dir,'agent.sock');
  const input=new PassThrough(),output=new PassThrough();
  const emitted=collect(output,new NativeDecoder());
  const installation={name:HOST_NAME,extensionId:ID,clientCredential:CREDENTIAL,socketPath};
  const host=createNativeHost({installation,origin:'chrome-extension://'+ID+'/',input,output,
    handshakeTimeoutMs:opts.handshakeTimeoutMs||3000,nativeTimeoutMs:opts.nativeTimeoutMs||3000});
  t.after(()=>{host.close();input.destroy();output.destroy();fs.rmSync(dir,{recursive:true,force:true});});
  await host.start();
  assert.equal((await emitted.next()).kind,'hello');
  assert.equal(fs.statSync(socketPath).mode&0o777,0o600);
  return {installation,input,output,emitted,host,socketPath};
}
async function connect(f) {
  const socket=net.createConnection(f.socketPath);
  const reply=collect(socket,new LineDecoder());
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  writeLine(socket,{v:1,kind:'auth',credential:CREDENTIAL});
  return {socket,reply,authenticated:await reply.next()};
}
test('one authenticated provider shares the original socket with read-only reverse messages',async t=>{
  const f=await fixture(t);
  f.input.write(frame({v:1,kind:'welcome',extensionId:ID,extensionVersion:'0.1.0',localDevVersion:1}));
  const p=await connect(f);t.after(()=>p.socket.destroy());assert.equal(p.authenticated.localDevVersion,1);
  writeLine(p.socket,{v:1,kind:'provider.register',providerId:'provider-a'});
  const registered=await p.reply.next();assert.equal(registered.kind,'provider.registered');
  assert.equal((await f.emitted.next()).providerEpoch,registered.providerEpoch);
  const other=await connect(f);t.after(()=>other.socket.destroy());
  const closed=new Promise(resolve=>other.socket.once('close',resolve));
  writeLine(other.socket,{v:1,kind:'provider.register',providerId:'provider-b'});await closed;
  for(const id of ['first','second']){
    f.input.write(frame({v:1,kind:'dev.request',requestId:id,providerEpoch:registered.providerEpoch,method:'projects.list',params:{}}));
    assert.equal((await p.reply.next()).requestId,id);
    writeLine(p.socket,{v:1,kind:'dev.response',requestId:id,providerEpoch:registered.providerEpoch,result:{projects:[{bindingId:'local-a',name:'A'}]}});
    assert.equal((await f.emitted.next()).result.projects[0].bindingId,'local-a');
  }
  p.socket.destroy();const state=await f.emitted.next();assert.equal(state.kind,'dev.state');assert.equal(state.connected,false);assert.equal(f.host.ready,true);
});
test('identity is pinned; invalid origin cannot launch a server',()=>{
  assert.throws(()=>createNativeHost({installation:{name:HOST_NAME,extensionId:ID,clientCredential:CREDENTIAL,
    socketPath:'/tmp/example.sock'},origin:'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/'}),
    {code:'E_EXTENSION_ID'});
  assert.throws(()=>createNativeHost({installation:{name:HOST_NAME,extensionId:ID,clientCredential:CREDENTIAL,
    socketPath:'/tmp/example.sock'},origin:'https://example.com/'}),{code:'E_EXTENSION_ID'});
});
test('framed Chrome welcome, authenticated local IPC, request and exact response',async t=>{
  const f=await fixture(t);
  const early=await connect(f);t.after(()=>early.socket.destroy());
  assert.equal(early.authenticated.browserReady,false);
  f.input.write(frame({v:1,kind:'welcome',extensionId:ID,extensionVersion:'0.1.0'}));
  assert.equal(f.host.ready,true);
  const caller=await connect(f);t.after(()=>caller.socket.destroy());
  assert.equal(caller.authenticated.browserReady,true);
  const request={v:1,kind:'request',requestId:'one-123',method:'target.current',params:{}};
  writeLine(caller.socket,request);
  assert.deepEqual(await f.emitted.next(),request);
  f.input.write(frame({v:1,kind:'response',requestId:'one-123',result:{registrationId:'r',target:{documentId:'d'}}}));
  const result=await caller.reply.next();
  assert.equal(result.kind,'response');assert.equal(result.requestId,'one-123');
  assert.equal(result.result.target.documentId,'d');
  assert.equal(f.host.pending,0);
});
test('duplicate inflight request ID is rejected, not dispatched again',async t=>{
  const f=await fixture(t);
  f.input.write(frame({v:1,kind:'welcome',extensionId:ID,extensionVersion:'0.1.0'}));
  const a=await connect(f),b=await connect(f);
  t.after(()=>{a.socket.destroy();b.socket.destroy();});
  const payload={v:1,kind:'request',requestId:'dup',method:'run.start',params:{source:{kind:'draft',sourceUtf8:'x'}}};
  writeLine(a.socket,payload);
  assert.equal((await f.emitted.next()).requestId,'dup');
  writeLine(b.socket,payload);
  const denial=await b.reply.next();
  assert.equal(denial.error.code,'E_REQUEST_CONFLICT');
  assert.equal(f.host.pending,1);
});
test('unacknowledged dispatched effects become unknown on native shutdown',async t=>{
  const f=await fixture(t);
  f.input.write(frame({v:1,kind:'welcome',extensionId:ID,extensionVersion:'0.1.0'}));
  const caller=await connect(f);t.after(()=>caller.socket.destroy());
  writeLine(caller.socket,{v:1,kind:'request',requestId:'mut-1',method:'script.save',params:{}});
  await f.emitted.next();
  const ended=new Promise(resolve=>f.input.once('end',resolve));
  f.input.end();await ended;
  assert.equal(f.host.ready,false);
  assert.equal(f.host.pending,0);
  for(let i=0;i<30&&fs.existsSync(f.socketPath);i++)
    await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(fs.existsSync(f.socketPath),false);
});
test('wrong credential is rejected without local API access',async t=>{
  const f=await fixture(t);
  const socket=net.createConnection(f.socketPath);
  t.after(()=>socket.destroy());
  await new Promise(resolve=>socket.once('connect',resolve));
  const ended=new Promise(resolve=>socket.once('close',resolve));
  writeLine(socket,{v:1,kind:'auth',credential:'b'.repeat(64)});
  await ended;
  assert.equal(f.host.pending,0);
});
test('handshake timeout closes the private socket without stale reuse',async t=>{
  const f=await fixture(t,{handshakeTimeoutMs:40});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(f.host.ready,false);
  assert.equal(fs.existsSync(f.socketPath),false);
});
test('native response timeout preserves unknown-effect outcome',async t=>{
  const f=await fixture(t,{nativeTimeoutMs:40});
  f.input.write(frame({v:1,kind:'welcome',extensionId:ID,extensionVersion:'0.1.0'}));
  const c=await connect(f);t.after(()=>c.socket.destroy());
  writeLine(c.socket,{v:1,kind:'request',requestId:'unknown-1',method:'run.start',params:{}});
  assert.equal((await f.emitted.next()).requestId,'unknown-1');
  const result=await c.reply.next();
  assert.equal(result.error.code,'E_EFFECT_UNKNOWN');
  assert.equal(result.error.outcome,'OUTCOME_UNKNOWN');
  assert.equal(f.host.pending,0);
});
test('existing socket is never unlinked or replaced by a second host',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'od-native-stale-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const sock=path.join(dir,'agent.sock');
  fs.writeFileSync(sock,'preserved',{mode:0o600});
  const host=createNativeHost({installation:{name:HOST_NAME,extensionId:ID,clientCredential:CREDENTIAL,
    socketPath:sock},origin:'chrome-extension://'+ID+'/',input:new PassThrough(),output:new PassThrough()});
  await assert.rejects(()=>host.start(),{code:'E_SOCKET_IN_USE'});
  assert.equal(fs.readFileSync(sock,'utf8'),'preserved');
});
