import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runDevCli,loadGoInstall,assertSupportedNodeVersion,providerManifest} from '../../native-agent/local-dev/dev-cli.mjs';
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
  feed(message){this.emit('data',Buffer.from(JSON.stringify(message)+'\\n'));}
  destroy(){if(!this.destroyed){this.destroyed=true;this.emit('close');}}
}
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
