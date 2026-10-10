import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runDevCli,loadGoInstall,assertSupportedNodeVersion,providerManifest,parseArgs,attachOnce,createOwnerLifecycle} from '../../native-agent/local-dev/dev-cli.mjs';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {createLocalProjectProvider} from '../../native-agent/local-dev/provider.mjs';
import {EventEmitter} from 'node:events';
import {sourceLabel,sourceName} from '../../src/native-agent/source-label.js';

function output(){
  let text='',error='';
  return {stdout:{write:x=>{text+=x;}},stderr:{write:x=>{error+=x;}},
    get text(){return text},get error(){return error}};
}
test('help/version never read a Go installation, start the provider or touch directory',async()=>{
  const old=process.env.HOME;
  try{
    process.env.HOME='/missing/home-for-r17';
    const h=output();assert.equal(await runDevCli(['--help'],h),0);
    assert.match(h.text,/opendesk-dev/);
    assert.equal(h.error,'');
    const v=output();assert.equal(await runDevCli(['--version'],v),0);
    assert.match(v.text,/R17/);
    assert.equal(v.error,'');
    const invalid=output();assert.equal(await runDevCli(['--unexpected'],invalid),1);
    assert.match(invalid.error,/E_SCHEMA/);
    const separatorOnly=output();assert.equal(await runDevCli(['--'],separatorOnly),1);
    assert.match(separatorOnly.error,/E_SCHEMA/);
    assert.equal(separatorOnly.text,'');
  }finally{process.env.HOME=old;}
});
test('Go installation discovery accepts only paired private Go owner',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r17-install-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.chmodSync(dir,0o700);
  const root=path.join(dir,'.opendesk-browser','native-agent-r1');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  fs.chmodSync(path.dirname(root),0o700);
  const file=path.join(root,'install.json');
  const cfg={Provider:'opendesk',InstallRoot:root,SocketPath:path.join(root,'agent.sock'),
    ExtensionID:'abcdefghijklmnopabcdefghijklmnop',ClientCredential:'a'.repeat(64),Browser:'chrome'};
  fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
  assert.equal(loadGoInstall(dir).clientCredential,cfg.ClientCredential);
  fs.chmodSync(file,0o644);
  assert.throws(()=>loadGoInstall(dir),e=>e.code==='E_INSTALL_PERMISSIONS');
  fs.chmodSync(file,0o600);
  fs.writeFileSync(file,JSON.stringify({...cfg,Provider:'node'}));
  assert.throws(()=>loadGoInstall(dir),e=>e.code==='E_MIGRATION_REQUIRED');
});
test('online identity stays distinct from the display cache',()=>{
  assert.equal(sourceLabel({name:'同名目录',sourceId:'source-0123456789abcdefabcdefab'},{offline:true}),
    '同名目录 · 离线（待连接核验）');
  assert.equal(sourceLabel({name:'同名目录',sourceId:'source-0123456789abcdefabcdefab'},{duplicate:true}),
    '同名目录 · cdefab');
  assert.equal(sourceName(''), '未命名目录');
  assert.equal(sourceName('破坏\u0000名称'),'未命名目录');
});

test('R17 requires a pinned modern Node runtime but help remains side-effect free',()=>{
  for(const old of ['20.19.0','22.11.9','16.0.0','unknown']){
    assert.throws(()=>assertSupportedNodeVersion(old),e=>e.code==='E_NODE_VERSION');
  }
  for(const supported of ['22.12.0','22.99.0','24.1.0','25.0.0']){
    assert.doesNotThrow(()=>assertSupportedNodeVersion(supported));
  }
});

class R17MockSocket extends EventEmitter {
  destroyed=false;writableLength=0;sent=[];
  write(bytes){this.sent.push(JSON.parse(Buffer.from(bytes).toString('utf8')));}
  feed(message){this.emit('data',Buffer.from(JSON.stringify(message)+'\n'));}
  destroy(){if(!this.destroyed){this.destroyed=true;this.emit('close');}}
  end(){this.destroy();}
}
test('all Node directory forms request temporary read-write by default and share explicit read-only parsing',()=>{
  for(const args of [[],['dev'],['/explicit/root'],['dev','/explicit/root']])
    assert.equal(parseArgs(args).access,'read-write');
  for(const args of [['--read-only'],['dev','--read-only','/explicit/root'],['--read-only','--','-中文目录']])
    assert.equal(parseArgs(args).access,'read-only');
  assert.equal(parseArgs(['--','-目录']).dir,'-目录');
  assert.equal(parseArgs([]).dir,'.');
  for(const args of [['--read-only','--read-only'],['/dir','--read-only'],['--read-only','--']])
    assert.throws(()=>parseArgs(args),e=>e.code==='E_SCHEMA');
});
const R17_AUTH={v:1,kind:'authenticated',browserReady:true,localDevMultiVersion:1,localFilesVersion:1,localDevAccessVersion:1};
const R17_ATTACHED={v:1,kind:'dev.attached',sourceId:'source-'+'a'.repeat(24),
  workspaceId:'workspace-12345678-1234-4234-8234-123456789abc',leaseId:'22345678-1234-4234-8234-123456789abc',
  leaseEpoch:'32345678-1234-4234-8234-123456789abc',name:'同名目录',access:'read-write',accessReason:'temporary-cli',alreadyActive:false};
function mockAttach(options={}){
  const socket=new R17MockSocket(),promise=attachOnce({socketPath:'/not-opened.sock',clientCredential:'a'.repeat(64)},
    '/explicit/目录',{...options,connect:()=>socket});
  socket.emit('connect');return {socket,promise};
}
test('attach sends explicit access and reports the actual permanent or existing-session permission',async()=>{
  for(const [access,reply] of [
    [undefined,R17_ATTACHED],
    ['read-only',{...R17_ATTACHED,access:'read-only'}],
    ['read-write',{...R17_ATTACHED,access:'read-only',accessReason:'persistent-read-only'}],
    ['read-write',{...R17_ATTACHED,access:'read-only',accessReason:'active-session',alreadyActive:true,leaseId:''}]
  ]){
    const {socket,promise}=mockAttach({access});socket.feed(R17_AUTH);
    assert.deepEqual(socket.sent.at(-1),{v:1,kind:'dev.attach',path:'/explicit/目录',access:access||'read-write'});
    socket.feed(reply);const result=await promise;
    assert.equal(result.reply.access,reply.access);assert.equal(result.socket,socket);socket.destroy();
  }
});
test('old components are diagnosed before the new CLI sends an access request',async()=>{
  const {socket,promise}=mockAttach(),rejected=assert.rejects(promise,e=>e.code==='E_NATIVE_UPDATE_REQUIRED');
  socket.feed({...R17_AUTH,localDevAccessVersion:undefined});await rejected;
  assert.equal(socket.sent.some(x=>x.kind==='dev.attach'),false);assert.equal(socket.destroyed,true);
});
test('malformed owner replies and a read-only mode mismatch never reach Provider setup',async()=>{
  for(const [reply,access,code] of [
    [{...R17_ATTACHED,alreadyActive:undefined},'read-write','E_SCHEMA'],
    [{...R17_ATTACHED,alreadyActive:'false'},'read-write','E_SCHEMA'],
    [{...R17_ATTACHED,leaseId:''},'read-write','E_SCHEMA'],
    [{...R17_ATTACHED,alreadyActive:true},'read-write','E_SCHEMA'],
    [{...R17_ATTACHED,workspaceId:'workspace-'+'-'.repeat(36)},'read-write','E_SCHEMA'],
    [{...R17_ATTACHED,name:'a\nb'},'read-write','E_SCHEMA'],
    [{...R17_ATTACHED,name:'x'.repeat(161)},'read-write','E_SCHEMA'],
    [R17_ATTACHED,'read-only','E_DEV_ACCESS_CONFLICT']
  ]){
    const {socket,promise}=mockAttach({access}),rejected=assert.rejects(promise,e=>e.code===code);
    socket.feed(R17_AUTH);socket.feed(reply);await rejected;assert.equal(socket.destroyed,true);
  }
});
test('owner close interrupts pending initialization and leaves another owner intact',async()=>{
  const signals=new EventEmitter(),a=new R17MockSocket(),b=new R17MockSocket();
  let release,closedA=0,closedB=0;
  const gate=new Promise(resolve=>{release=resolve;});
  const ownerA=createOwnerLifecycle(a,{signals,onClose:()=>{closedA++;}});
  const ownerB=createOwnerLifecycle(b,{signals,onClose:()=>{closedB++;}});
  try{
    const pending=ownerA.during(gate),rejected=assert.rejects(pending,e=>e.code==='E_NATIVE_NOT_READY');
    a.destroy();await rejected;
    assert.equal(await ownerA.stopped,'connection');assert.equal(closedA,1);assert.equal(closedB,0);
    assert.equal(b.destroyed,false);ownerB.assertOpen();
    release('late manifest');await Promise.resolve();
    assert.throws(()=>ownerA.assertOpen(),e=>e.code==='E_NATIVE_NOT_READY');
  }finally{ownerA.close();ownerB.close();}
  assert.equal(closedA,1);assert.equal(closedB,1);
  assert.equal(signals.listenerCount('SIGINT'),0);assert.equal(signals.listenerCount('SIGTERM'),0);
});
test('owner notices a close before listener installation and releases only its own signal listeners',async()=>{
  const socket=new R17MockSocket(),signals=new EventEmitter();socket.destroy();
  let closed=0;const foreign=()=>{};signals.on('SIGINT',foreign);
  const owner=createOwnerLifecycle(socket,{signals,onClose:()=>{closed++;}});
  try{
    assert.equal(await owner.stopped,'connection');
    await assert.rejects(owner.during(Promise.resolve('late')),e=>e.code==='E_NATIVE_NOT_READY');
  }finally{owner.close();}
  assert.equal(closed,1);assert.deepEqual(signals.listeners('SIGINT'),[foreign]);
});
test('a signal or failed setup closes the owned provider exactly once',async()=>{
  for(const signal of [true,false]){
    const socket=new R17MockSocket(),signals=new EventEmitter();let closed=0;
    const owner=createOwnerLifecycle(socket,{signals,onClose:()=>{closed++;}});
    try{
      if(signal){
        const pending=owner.during(new Promise(()=>{})),rejected=assert.rejects(pending,e=>e.code==='E_DEV_STOPPED');
        signals.emit('SIGINT');await rejected;assert.equal(await owner.stopped,'signal');
      }else{
        const expected=new Error('setup failure');
        await assert.rejects(owner.during(Promise.reject(expected)),e=>e===expected);
      }
    }finally{owner.close();}
    assert.equal(closed,1);assert.equal(socket.destroyed,true);
    assert.equal(signals.listenerCount('SIGINT'),0);assert.equal(signals.listenerCount('SIGTERM'),0);
  }
});
test('R17 recognized directory exports validated runtimeKind into its modern Native source catalog',async t=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r17-provider-'));
  t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
  const example=path.resolve('examples/programs/local-controller');
  const directory=path.join(scratch,'同名 目录');
  fs.cpSync(example,directory,{recursive:true});
  const metadata=await providerManifest(directory);
  assert.deepEqual(metadata,{runnable:true,runtimeKind:'controller'});
  const session=new LocalDevSession({allowedPaths:[directory]});
  const attached=session.attach({path:directory,runtimeKind:metadata.runtimeKind});
  assert.equal(session.resolver.get(attached.bindingId).runtimeKind,'controller');
  const socket=new R17MockSocket();
  const provider=createLocalProjectProvider({
    session,leaseId:'owned-lease',
    installation:()=>({socketPath:'/private/owned/agent.sock',clientCredential:'a'.repeat(64)}),
    connect:()=>socket,retryMs:100000
  });
  t.after(()=>{provider.close();session.close();});
  socket.emit('connect');
  socket.feed({v:1,kind:'authenticated',browserReady:true,localDevVersion:1,localDevMultiVersion:1});
  const registration=socket.sent.at(-1);
  assert.equal(registration.kind,'provider.register');
  assert.equal(registration.catalogVersion,2);
  assert.equal(registration.leaseId,'owned-lease');
  assert.deepEqual(registration.projects,[{bindingId:attached.bindingId,name:path.basename(directory),runtimeKind:'controller'}]);
  // A file-only workspace has no program binding. No guessed JS entrance.
  const documentDir=path.join(scratch,'纯文本');
  fs.mkdirSync(documentDir);
  fs.writeFileSync(path.join(documentDir,'README.md'),'# 仅文件工作区');
  assert.deepEqual(await providerManifest(documentDir),{runnable:false});
  // An OpenDesk manifest that names an absent source is NOT a runnable project.
  fs.mkdirSync(path.join(scratch,'错误项目'));
  const invalid=path.join(scratch,'错误项目');
  const pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  fs.writeFileSync(path.join(invalid,'package.json'),JSON.stringify(pkg));
  const rejected=await providerManifest(invalid);
  assert.equal(rejected.runnable,false);
  assert.match(rejected.reason,/E_PROJECT_FILE/);
});
