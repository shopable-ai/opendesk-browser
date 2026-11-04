import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {loadGoInstall,resolveNativeConnection,MAX_CONNECTIONS} from '../../native-agent/local-dev/native-connections.mjs';
import {EventEmitter} from 'node:events';
import {attachOnce,parseArgs,runDevCli,openWorkspace} from '../../native-agent/local-dev/dev-cli.mjs';

const A='a'.repeat(32),B='b'.repeat(32),EXT='a'.repeat(32),EXTRA='b'.repeat(32);
const auth=cfg=>({v:1,kind:'authenticated',connectionId:cfg.connectionId,extensionId:cfg.extensionId,
  browserReady:true,localDevMultiVersion:1,localFilesVersion:1,localDevAccessVersion:1});
function fixture(t){
  // Unix sockaddr paths are limited to 104 bytes on macOS. Test-owned private
  // /tmp homes keep the REAL Go connection/socket layout within that bound.
  const home=fs.realpathSync(fs.mkdtempSync('/tmp/nb-'));
  fs.chmodSync(home,0o700);
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const root=path.join(home,'.opendesk-browser','native-agent-r1');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  const parent={provider:'opendesk',installRoot:root,socketPath:path.join(root,'agent.sock'),
    extensionId:EXT,clientCredential:'c'.repeat(64),browser:'chrome',userDataDir:'',
    name:'com.opendesk.browser',executable:'/trusted/opendesk',approvedExtensions:EXTRA};
  const writeParent=()=>fs.writeFileSync(path.join(root,'install.json'),JSON.stringify(parent),{mode:0o600});
  writeParent();
  function scope(id=A,changes={}){
    const installRoot=path.join(home,'.opendesk-browser','c',id);
    fs.mkdirSync(installRoot,{recursive:true,mode:0o700});
    const raw={ConnectionID:id,ExtensionID:EXT,ClientCredential:id[0].repeat(64),InstallRoot:installRoot,
      SocketPath:path.join(installRoot,'agent.sock'),ParentRoot:root,
      ParentCredentialDigest:crypto.createHash('sha256').update(parent.clientCredential).digest('hex'),
      Provider:parent.provider,Name:parent.name,Executable:parent.executable,Browser:parent.browser,UserDataDir:'',...changes};
    const file=path.join(installRoot,'connection.json');
    const write=()=>fs.writeFileSync(file,JSON.stringify(raw),{mode:0o600});write();
    return {raw,file,write,cfg:{connectionId:id,extensionId:raw.ExtensionID,clientCredential:raw.ClientCredential,
      socketPath:raw.SocketPath,browser:raw.Browser,userDataDir:''}};
  }
  return {home,root,parent,writeParent,scope,resolve:options=>resolveNativeConnection(home,{instance:undefined,connection:undefined,...options})};
}
async function serve(t,cfg,{welcome=auth(cfg),onAttach,hang=false}={}){
  const messages=[],sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
    let buffer='';socket.on('data',chunk=>{
      buffer+=chunk.toString();let end;
      while((end=buffer.indexOf('\n'))>=0){
        const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);messages.push(message);
        if(message.kind==='auth'&&!hang)socket.write(JSON.stringify(welcome)+'\n');
        if(message.kind==='dev.attach')onAttach?.(socket,message);
      }
    });
  });
  server.listen(cfg.socketPath);await once(server,'listening');fs.chmodSync(cfg.socketPath,0o600);
  t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
  return {messages,server,sockets};
}
const attached={v:1,kind:'dev.attached',sourceId:'source-'+'1'.repeat(24),
  workspaceId:'workspace-12345678-1234-4234-8234-123456789abc',leaseId:'22345678-1234-4234-8234-123456789abc',
  leaseEpoch:'32345678-1234-4234-8234-123456789abc',name:'test',access:'read-only',accessReason:'temporary-cli',alreadyActive:false};

test('explicit legacy selector works via flag and env without probing competing scopes',async t=>{
  assert.equal(parseArgs(['--connection','legacy','--read-only','/dir']).connection,'legacy');
  assert.equal(parseArgs(['--read-only','--connection','legacy','--','-dir']).connection,'legacy');
  assert.throws(()=>parseArgs(['--connection','legacy','--connection',A]),{code:'E_SCHEMA'});
  const f=fixture(t),a=f.scope(),ah=await serve(t,a.cfg);
  const cfg=loadGoInstall(f.home),legacy=await serve(t,cfg,{welcome:auth({})});
  const selected=await f.resolve({connection:'legacy'});
  assert.deepEqual(selected,cfg);assert.ok(Object.isFrozen(selected));
  const previous=process.env.OPENDESK_NATIVE_CONNECTION;
  process.env.OPENDESK_NATIVE_CONNECTION='legacy';
  try{assert.deepEqual(await resolveNativeConnection(f.home,{instance:undefined}),cfg);}
  finally{if(previous===undefined)delete process.env.OPENDESK_NATIVE_CONNECTION;else process.env.OPENDESK_NATIVE_CONNECTION=previous;}
  assert.deepEqual(legacy.messages.map(m=>m.kind),['auth','auth']);
  assert.equal(ah.messages.length,0);
});
test('explicit legacy missing or unready endpoint never selects a ready scope',async t=>{
  const f=fixture(t),a=f.scope(),ah=await serve(t,a.cfg);
  await assert.rejects(f.resolve({connection:'legacy'}),{code:'E_CONNECTION_GONE'});
  const legacy=await serve(t,loadGoInstall(f.home),{welcome:{...auth({}),browserReady:false}});
  await assert.rejects(f.resolve({connection:'legacy'}),{code:'E_NATIVE_NOT_READY'});
  assert.deepEqual(legacy.messages.map(m=>m.kind),['auth']);assert.equal(ah.messages.length,0);
});
test('explicit legacy CLI flag overrides scoped env and unready attach cannot launch or retry',async t=>{
  const f=fixture(t),a=f.scope(),ah=await serve(t,a.cfg);
  let welcomes=0;
  const welcome=auth({});
  Object.defineProperty(welcome,'browserReady',{enumerable:true,get:()=>++welcomes===1});
  const legacy=await serve(t,loadGoInstall(f.home),{welcome});
  const previousHome=process.env.HOME,previousConnection=process.env.OPENDESK_NATIVE_CONNECTION;
  process.env.HOME=f.home;process.env.OPENDESK_NATIVE_CONNECTION=A;
  let error='';
  try{
    const result=await runDevCli(['--connection','legacy','--read-only',f.home],{
      stdout:{write:()=>{}},stderr:{write:value=>{error+=value;}},
      launchWorkspace:async()=>assert.fail('explicit unready selection must not launch'),
    });
    assert.equal(result,1);assert.match(error,/E_NATIVE_NOT_READY/);
  }finally{
    if(previousHome===undefined)delete process.env.HOME;else process.env.HOME=previousHome;
    if(previousConnection===undefined)delete process.env.OPENDESK_NATIVE_CONNECTION;
    else process.env.OPENDESK_NATIVE_CONNECTION=previousConnection;
  }
  assert.deepEqual(legacy.messages.map(m=>m.kind),['auth','auth']);assert.equal(ah.messages.length,0);
});
test('revoked marker blocks explicit and auto selection before any auth or fallback',async t=>{
  for(const marker of ['file','dangling-symlink','directory'])await t.test(marker,async st=>{
    const f=fixture(st),a=f.scope(),ah=await serve(st,a.cfg),b=f.scope(B),bh=await serve(st,b.cfg);
    const legacy=await serve(st,loadGoInstall(f.home));
    const file=path.join(a.raw.InstallRoot,'revoked');
    if(marker==='file')fs.writeFileSync(file,'revoked\n',{mode:0o600});
    else if(marker==='directory')fs.mkdirSync(file,{mode:0o700});
    else fs.symlinkSync(file+'-missing',file);
    await assert.rejects(f.resolve({connection:A}),{code:'E_CONNECTION_REVOKED'});
    await assert.rejects(f.resolve(),{code:'E_CONNECTION_REVOKED'});
    assert.equal(ah.messages.length,0);assert.equal(bh.messages.length,0);assert.equal(legacy.messages.length,0);
  });
});
test('sole revoked publication cannot restore implicit legacy startup',async t=>{
  const f=fixture(t),a=f.scope(),ah=await serve(t,a.cfg);
  fs.writeFileSync(path.join(a.raw.InstallRoot,'revoked'),'revoked\n',{mode:0o600});
  await assert.rejects(f.resolve(),{code:'E_CONNECTION_REVOKED'});
  assert.equal(ah.messages.length,0);
});

test('scoped workspace launcher refuses OS routing before lookup or spawn',async()=>{
  await assert.rejects(openWorkspace({connectionId:A,extensionId:EXT,browser:'chrome',userDataDir:''},attached.sourceId,{
    bundleIdentifier:()=>assert.fail('must not look up a browser for a scoped Profile'),
    exists:()=>assert.fail('must not look up a browser for a scoped Profile'),
    spawnProcess:()=>assert.fail('must not launch an OS browser for a scoped Profile'),
  }),{code:'E_PROFILE_TARGET'});
});
test('CLI keeps scoped lease attached without invoking launcher; legacy still opens Workspace',async t=>{
  for(const scoped of [true,false])for(const alreadyActive of [false,true]){
    await t.test(JSON.stringify({scoped,alreadyActive}),{timeout:3000},async st=>{
      const f=fixture(st),a=scoped?f.scope():null,cfg=a?.cfg||loadGoInstall(f.home);
      const stat=fs.statSync(f.home,{bigint:true});
      const sourceId='source-'+crypto.createHmac('sha256',cfg.clientCredential)
        .update(f.home+'\0'+stat.dev.toString()+'\0'+stat.ino.toString()).digest('hex').slice(0,24);
      const host=await serve(st,cfg,{onAttach:socket=>socket.write(JSON.stringify({...attached,sourceId,
        alreadyActive,leaseId:alreadyActive?'':attached.leaseId})+'\n')});
      const signals=new EventEmitter();let text='',error='',launches=0,ready;
      const waiting=new Promise(resolve=>{ready=resolve;});
      const previous=process.env.HOME;process.env.HOME=f.home;
      st.after(()=>{process.env.HOME=previous;signals.emit('SIGINT');});
      const running=runDevCli([...(scoped?['--connection',A]:[]),'--read-only',f.home],{
        stdout:{write:value=>{text+=value;if(text.includes('按 Ctrl+C'))ready();}},
        stderr:{write:value=>{error+=value;}},signals,
        launchWorkspace:async()=>{launches++;if(scoped)assert.fail('scoped CLI must not invoke launcher');},
      });
      if(!alreadyActive){
        await Promise.race([waiting,running.then(()=>assert.fail('CLI ended before holding lease'))]);
        assert.equal(host.sockets.size,1,'selected owner socket stays attached until stop');
        signals.emit('SIGINT');
      }
      assert.equal(await running,0,error);assert.equal(error,'');
      assert.equal(launches,scoped?0:1);
      if(scoped){
        assert.match(text,/Chrome Profile/);assert.match(text,/手动打开/);
        assert.ok(text.includes('sourceId='+sourceId));
        assert.doesNotMatch(text,/已请求在已配对 Chrome 中打开/);
        assert.doesNotMatch(text,/未能自动打开浏览器/);
      }
      assert.equal(host.messages.filter(m=>m.kind==='dev.attach').length,1);
    });
  }
});

test('connection flag supports explicit read-only, separator, env default and rejects malformed/duplicate IDs',async t=>{
  assert.equal(parseArgs(['--connection',A,'--read-only','/dir']).connection,A);
  assert.equal(parseArgs(['--read-only','--connection',A,'--','-dir']).dir,'-dir');
  for(const args of [['--connection'],['--connection',''],['--connection','../x'],['--connection',A,'--connection',B]])
    assert.throws(()=>parseArgs(args),{code:'E_SCHEMA'});
  const f=fixture(t),a=f.scope();await serve(t,a.cfg);
  const previous=process.env.OPENDESK_NATIVE_CONNECTION;
  process.env.OPENDESK_NATIVE_CONNECTION=A;
  try{assert.equal((await resolveNativeConnection(f.home,{instance:undefined})).connectionId,A);}
  finally{if(previous===undefined)delete process.env.OPENDESK_NATIVE_CONNECTION;else process.env.OPENDESK_NATIVE_CONNECTION=previous;}
});
test('sole scoped Go record is pinned and probe sends only auth; attach requests only selected read-only scope',async t=>{
  const f=fixture(t),a=f.scope(A,{ExtensionID:EXTRA});
  const host=await serve(t,a.cfg,{onAttach:socket=>socket.write(JSON.stringify(attached)+'\n')});
  const cfg=await f.resolve();assert.equal(cfg.connectionId,A);assert.equal(cfg.extensionId,EXTRA);assert.ok(Object.isFrozen(cfg));
  assert.deepEqual(host.messages,[{v:1,kind:'auth',credential:a.raw.ClientCredential}]);
  const result=await attachOnce(cfg,'/explicit/folder',{access:'read-only'});result.socket.destroy();
  assert.deepEqual(host.messages.map(m=>m.kind),['auth','auth','dev.attach']);
  assert.equal(host.messages.at(-1).access,'read-only');
  assert.equal(loadGoInstall(f.home).clientCredential,f.parent.clientCredential);
});
test('two candidate records require explicit selection BEFORE probes, even when A is hung',async t=>{
  const f=fixture(t),a=f.scope(),b=f.scope(B);
  const ah=await serve(t,a.cfg,{hang:true}),bh=await serve(t,b.cfg);
  await assert.rejects(f.resolve({timeoutMs:30}),{code:'E_CONNECTION_REQUIRED'});
  assert.equal(ah.messages.length,0);assert.equal(bh.messages.length,0);
  await assert.rejects(f.resolve({connection:A,timeoutMs:30}),{code:'E_NATIVE_NOT_READY'});
  assert.equal(bh.messages.length,0);
  assert.equal((await f.resolve({connection:B})).connectionId,B);
  assert.deepEqual(bh.messages.map(m=>m.kind),['auth']);
});
test('a legacy socket competes with a scope regardless of readiness; explicit scope never probes legacy',async t=>{
  const f=fixture(t),a=f.scope(),ah=await serve(t,a.cfg);
  const legacy=await serve(t,{socketPath:f.parent.socketPath,clientCredential:f.parent.clientCredential},{hang:true});
  await assert.rejects(f.resolve(),{code:'E_CONNECTION_REQUIRED'});
  assert.equal(ah.messages.length,0);assert.equal(legacy.messages.length,0);
  assert.equal((await f.resolve({connection:A})).connectionId,A);assert.equal(legacy.messages.length,0);
});
test('explicit missing, invalid, retired or unready scope never falls back to B or legacy',async t=>{
  const f=fixture(t),a=f.scope(),b=f.scope(B),bh=await serve(t,b.cfg);
  for(const connection of ['', '../bad', 'A'.repeat(32)])await assert.rejects(f.resolve({connection}),{code:'E_CONNECTION_INVALID'});
  await assert.rejects(f.resolve({connection:'d'.repeat(32)}),{code:'E_CONNECTION_GONE'});
  await assert.rejects(f.resolve({connection:A}),{code:'E_CONNECTION_GONE'});
  await serve(t,a.cfg,{welcome:{...auth(a.cfg),browserReady:false}});
  await assert.rejects(f.resolve({connection:A}),{code:'E_NATIVE_NOT_READY'});
  fs.unlinkSync(a.file);await assert.rejects(f.resolve({connection:A}),{code:'E_CONNECTION_GONE'});
  assert.equal(bh.messages.length,0);
});
test('auth scope and extension identities must match in BOTH probe and attach before dev.attach',async t=>{
  for(const delta of [{connectionId:B},{extensionId:EXTRA},{connectionId:undefined},{extensionId:undefined}]){
    await t.test(JSON.stringify(delta),async st=>{
      const f=fixture(st),a=f.scope(),host=await serve(st,a.cfg,{welcome:{...auth(a.cfg),...delta}});
      await assert.rejects(f.resolve({connection:A}),{code:'E_CONNECTION_IDENTITY'});
      await assert.rejects(attachOnce(a.cfg,'/never-attached'),{code:'E_CONNECTION_IDENTITY'});
      assert.deepEqual(host.messages.map(m=>m.kind),['auth','auth']);
    });
  }
});
test('scope validation rejects wrong parent/digest/identity and substring approval without probing',async t=>{
  for(const changes of [{ParentRoot:'/other'},{ParentCredentialDigest:'0'.repeat(64)},
    {ExtensionID:'b'.repeat(31)+'c'},{InstallRoot:'/outside'},{SocketPath:'/outside.sock'},
    {ConnectionID:B},{ClientCredential:'short'},{ClientCredential:'c'.repeat(64)},
    {ClientCredential:['a'.repeat(64)]},{ExtensionID:[EXT]},{UserDataDir:null},
    {Provider:'node'},{Browser:'cft'},{Executable:'/other'},{Name:'other'},{UserDataDir:'/other'}]){
    await t.test(Object.keys(changes)[0]+JSON.stringify(changes),async st=>{
      const f=fixture(st);f.scope(A,changes);
      await assert.rejects(f.resolve({connection:A}),{code:'E_CONNECTION_INVALID'});
    });
  }
});
test('approvedExtensions is an exact bounded comma-separated scalar, never an array or substring match',async t=>{
  for(const value of [[EXTRA],EXTRA+',',EXTRA+','+EXTRA,EXT,' '+EXTRA,EXTRA+',nope']){
    const f=fixture(t);f.parent.approvedExtensions=value;f.writeParent();
    assert.throws(()=>loadGoInstall(f.home),{code:'E_INSTALL_INVALID'});
  }
});
test('installation scalar fields reject coercion and owner UID is checked',async t=>{
  const f=fixture(t);f.parent.clientCredential=['c'.repeat(64)];f.writeParent();
  assert.throws(()=>loadGoInstall(f.home),{code:'E_INSTALL_INVALID'});
  f.parent.clientCredential='c'.repeat(64);f.writeParent();
  if(process.getuid){
    const getuid=process.getuid,uid=getuid();
    try{process.getuid=()=>uid+1;assert.throws(()=>loadGoInstall(f.home),{code:'E_INSTALL_PERMISSIONS'});}
    finally{process.getuid=getuid;}
  }
});
test('default Go null userDataDir normalizes only that field for diagnostics and scoped discovery',async t=>{
  const f=fixture(t),a=f.scope();f.parent.userDataDir=null;f.writeParent();
  await serve(t,a.cfg);
  assert.equal(loadGoInstall(f.home).userDataDir,'');
  assert.equal((await f.resolve()).connectionId,A);
  delete f.parent.userDataDir;f.parent.UserDataDir=null;f.writeParent();
  assert.equal(loadGoInstall(f.home).userDataDir,'');
  assert.equal((await f.resolve({connection:A})).connectionId,A);
  f.parent.clientCredential=null;f.writeParent();
  assert.throws(()=>loadGoInstall(f.home),{code:'E_INSTALL_INVALID'});
});
test('default and named installations auto-select their own published scopes beside retired directories',async t=>{
  const f=fixture(t),a=f.scope();
  const namedRoot=path.join(f.home,'.opendesk-browser','native-agent-instances','parallel');
  fs.mkdirSync(namedRoot,{recursive:true,mode:0o700});
  const named={...f.parent,installRoot:namedRoot,socketPath:path.join(namedRoot,'agent.sock'),clientCredential:'d'.repeat(64)};
  fs.writeFileSync(path.join(namedRoot,'install.json'),JSON.stringify(named),{mode:0o600});
  const b=f.scope(B,{ParentRoot:namedRoot,
    ParentCredentialDigest:crypto.createHash('sha256').update(named.clientCredential).digest('hex')});
  const retired=f.scope('d'.repeat(32));fs.unlinkSync(retired.file);
  const ah=await serve(t,a.cfg),bh=await serve(t,b.cfg);
  assert.equal((await f.resolve()).connectionId,A);
  assert.equal((await f.resolve({instance:'parallel'})).connectionId,B);
  assert.deepEqual(ah.messages.map(m=>m.kind),['auth']);
  assert.deepEqual(bh.messages.map(m=>m.kind),['auth']);
  await assert.rejects(f.resolve({connection:B}),{code:'E_CONNECTION_INVALID'});
  await assert.rejects(f.resolve({connection:retired.cfg.connectionId}),{code:'E_CONNECTION_GONE'});
});
test('auto discovery never skips malformed current/unknown identity or insecure foreign records to select B',async t=>{
  for(const changes of [{ParentCredentialDigest:'0'.repeat(64)},{ConnectionID:B},{ParentRoot:null},
    {ParentRoot:undefined},{ParentRoot:''},{ParentRoot:'relative'},{ParentRoot:["/foreign"]},{ExtensionID:'p'.repeat(32)}]){
    await t.test(JSON.stringify(changes),async st=>{
      const f=fixture(st);f.scope(A,changes);const b=f.scope(B),bh=await serve(st,b.cfg);
      await assert.rejects(f.resolve(),{code:'E_CONNECTION_INVALID'});
      assert.equal(bh.messages.length,0);
    });
  }
  await t.test('foreign record still requires trusted private storage',async st=>{
    const f=fixture(st),a=f.scope(A,{ParentRoot:'/foreign'}),b=f.scope(B),bh=await serve(st,b.cfg);
    fs.chmodSync(a.file,0o644);
    await assert.rejects(f.resolve(),{code:'E_INSTALL_PERMISSIONS'});
    assert.equal(bh.messages.length,0);
  });
});
test('identity is rechecked after a valid discovery probe before any attach grant',async t=>{
  const f=fixture(t),a=f.scope();let welcomes=0;
  const welcome=auth(a.cfg);
  Object.defineProperty(welcome,'connectionId',{enumerable:true,get:()=>++welcomes===1?A:B});
  const host=await serve(t,a.cfg,{welcome});
  const cfg=await f.resolve({connection:A});
  await assert.rejects(attachOnce(cfg,'/never-attached'),{code:'E_CONNECTION_IDENTITY'});
  assert.deepEqual(host.messages.map(m=>m.kind),['auth','auth']);
});
test('probe bounds malformed/oversized ACKs, rejects non-boolean readiness and closes on EOF',async t=>{
  for(const [reply,code] of [
    ['not-json\n','E_SCHEMA'],['x'.repeat(60*1024+2),'E_LIMIT'],
    [JSON.stringify({...auth({connectionId:A,extensionId:EXT}),browserReady:'true'})+'\n','E_NATIVE_NOT_READY'],
    ['', 'E_NATIVE_NOT_READY'],
  ]){
    await t.test(code+reply.length,async st=>{
      const f=fixture(st),a=f.scope(),messages=[];
      const server=net.createServer(socket=>{
        socket.on('error',()=>{});
        socket.once('data',data=>{messages.push(JSON.parse(data));socket.end(reply);});
      });
      server.listen(a.cfg.socketPath);await once(server,'listening');fs.chmodSync(a.cfg.socketPath,0o600);
      st.after(()=>new Promise(resolve=>server.close(resolve)));
      await assert.rejects(f.resolve({connection:A}),{code});
      assert.deepEqual(messages.map(m=>m.kind),['auth']);
    });
  }
});
test('private file/directory/socket modes and no symlinks are enforced',async t=>{
  for(const target of ['file','root','base','socket','file-link','root-link','base-link','parent-link']){
    await t.test(target,async st=>{
      const f=fixture(st),a=f.scope();
      if(target==='socket')await serve(st,a.cfg);
      const location=target==='file'||target==='file-link'?a.file:target==='root'||target==='root-link'?a.raw.InstallRoot:
        target==='socket'?a.raw.SocketPath:target==='parent-link'?f.root:path.dirname(a.raw.InstallRoot);
      if(target.endsWith('-link')){fs.renameSync(location,location+'-real');fs.symlinkSync(location+'-real',location);}
      else fs.chmodSync(location,target==='file'||target==='socket'?0o644:0o755);
      await assert.rejects(f.resolve({connection:A}),{code:'E_INSTALL_PERMISSIONS'});
    });
  }
});
test('records, candidate count and discovery directory enumeration are bounded',async t=>{
  await t.test('record bytes',async st=>{
    const f=fixture(st),a=f.scope();fs.writeFileSync(a.file,' '.repeat(16385));
    await assert.rejects(f.resolve({connection:A}),{code:'E_INSTALL_INVALID'});
  });
  await t.test('candidate count',async st=>{
    const f=fixture(st);
    for(let i=1;i<=MAX_CONNECTIONS+1;i++)f.scope(i.toString(16).padStart(32,'0'));
    await assert.rejects(f.resolve(),{code:'E_LIMIT'});
  });
  await t.test('directory entries',async st=>{
    const f=fixture(st);f.scope();const base=path.join(f.home,'.opendesk-browser','c');
    for(let i=0;i<65;i++)fs.writeFileSync(path.join(base,'ignored-'+i),'');
    await assert.rejects(f.resolve(),{code:'E_LIMIT'});
  });
});
test('no scoped records preserve synchronous legacy diagnostics and legacy attach without scoped auth IDs',async t=>{
  const f=fixture(t),cfg=loadGoInstall(f.home);
  assert.equal(cfg.socketPath,f.parent.socketPath);assert.equal(typeof cfg.then,'undefined');
  assert.deepEqual(await f.resolve(),cfg);
  const welcome=auth({});delete welcome.connectionId;delete welcome.extensionId;
  const host=await serve(t,cfg,{welcome,onAttach:socket=>socket.write(JSON.stringify(attached)+'\n')});
  const result=await attachOnce(await f.resolve(),'/legacy',{access:'read-only'});result.socket.destroy();
  assert.deepEqual(host.messages.map(m=>m.kind),['auth','dev.attach']);
});
test('a failed sole A probe cannot switch to B that appears while A is being probed',async t=>{
  const f=fixture(t),a=f.scope();await serve(t,a.cfg,{hang:true});
  const pending=f.resolve({timeoutMs:60});
  const b=f.scope(B),bh=await serve(t,b.cfg);
  await assert.rejects(pending,{code:'E_NATIVE_NOT_READY'});assert.equal(bh.messages.length,0);
});
test('new scope has its own credential; retired scope is never inherited or reselected',async t=>{
  const f=fixture(t),a=f.scope();await serve(t,a.cfg);
  const pinned=await f.resolve({connection:A});
  fs.unlinkSync(a.file);const b=f.scope(B);await serve(t,b.cfg);
  assert.notEqual(pinned.clientCredential,b.cfg.clientCredential);
  await assert.rejects(f.resolve({connection:A}),{code:'E_CONNECTION_GONE'});
  assert.equal((await f.resolve({connection:B})).connectionId,B);
});
