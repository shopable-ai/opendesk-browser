import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {EventEmitter} from 'node:events';
import {createBuildInfo,readCliIdentity,CLI_PACKAGE} from '../../native-agent/local-dev/cli-identity.mjs';
import {diagnoseInstallation,probeNative,selectGoNode,formatDiagnostic} from '../../native-agent/local-dev/installation-diagnostics.mjs';
import {loadGoInstall,assertSupportedNodeVersion,runDevCli,parseArgs} from '../../native-agent/local-dev/dev-cli.mjs';
import {manifestLocation} from '../../native-agent/locations.mjs';
import {HOST_NAME} from '../../native-agent/wire.mjs';

const extensionId='abcdefghijklmnopabcdefghijklmnop',credential='a'.repeat(64);
function write(file,value,mode=0o600){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,value,{mode});}
function pkg(root,content='export const value=1;',version='0.1.0-r17.1'){
  write(path.join(root,'package.json'),JSON.stringify({name:CLI_PACKAGE,version}));
  write(path.join(root,'bin/opendesk-dev.mjs'),'#!/usr/bin/env node\n',{mode:0o755}.mode);
  write(path.join(root,'runtime/entry.mjs'),content);
  write(path.join(root,'build-info.json'),JSON.stringify(createBuildInfo(root,{gitHead:'b'.repeat(40)})));
  return root;
}
function fixture(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'odi-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  fs.chmodSync(home,0o700);
  const cliRoot=pkg(path.join(home,'nvm/lib/node_modules/@shopable/opendesk-dev'));
  const identity=readCliIdentity(cliRoot);
  const registration=path.join(home,'.opendesk-browser/dev-tool-r17/entry.json');
  write(registration,JSON.stringify({format:'opendesk.dev-cli.r17',localDevAccessVersion:1,
    entry:identity.entryPath,sha256:identity.entrySha256,packageVersion:identity.version,contentFingerprint:identity.contentFingerprint}));
  const installRoot=path.join(home,'.opendesk-browser/native-agent-r1');
  const installFile=path.join(installRoot,'install.json');
  const config={name:HOST_NAME,provider:'opendesk',installRoot,socketPath:path.join(installRoot,'agent.sock'),
    extensionId,clientCredential:credential,browser:'chrome',executable:process.execPath};
  write(installFile,JSON.stringify(config));
  const manifest=manifestLocation('chrome',null,{home});
  write(manifest,JSON.stringify({name:HOST_NAME,type:'stdio',path:path.join(installRoot,'native-host'),allowed_origins:['chrome-extension://'+extensionId+'/']}));
  write(path.join(installRoot,'native-host'),`#!/bin/sh\nunset OPENDESK_NATIVE_INSTANCE\nexec '${process.execPath}' browser native-host "$@"\n`,0o700);
  const connected={state:'connected',authenticated:true,browserReady:true,compatible:true,
    capabilities:{localDevMultiVersion:1,localFilesVersion:1,localDevAccessVersion:1}};
  const options={home,cliRoot,env:{PATH:'',},loadInstall:loadGoInstall,assertNode:assertSupportedNodeVersion,
    goNode:{path:process.execPath,resolvedPath:fs.realpathSync(process.execPath)},probe:async()=>connected};
  return {home,cliRoot,identity,registration,installFile,config,manifest,installRoot,options,connected};
}
const codes=report=>report.issues.map(row=>row.code);
test('publishable dependency lock is part of the installed content identity',t=>{
  const f=fixture(t),file=path.join(f.cliRoot,'npm-shrinkwrap.json');
  write(file,JSON.stringify({lockfileVersion:3,packages:{}}));
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  const old=readCliIdentity(f.cliRoot);assert.equal(old.status,'verified');
  fs.appendFileSync(file,'\n');
  const changed=readCliIdentity(f.cliRoot);assert.equal(changed.status,'content-mismatch');
  assert.equal(changed.entrySha256,old.entrySha256);assert.notEqual(changed.contentFingerprint,old.contentFingerprint);
});
test('bundled dependency bytes are fingerprinted while npm-generated links are excluded',t=>{
  const f=fixture(t),metadata=path.join(f.cliRoot,'package.json');
  write(metadata,JSON.stringify({name:CLI_PACKAGE,version:f.identity.version,bundleDependencies:['tool']}));
  const module=path.join(f.cliRoot,'node_modules/tool/index.js');write(module,'export const value=1;');
  write(path.join(f.cliRoot,'node_modules/.package-lock.json'),'generated');
  fs.mkdirSync(path.join(f.cliRoot,'node_modules/.bin'));fs.symlinkSync('../tool/index.js',path.join(f.cliRoot,'node_modules/.bin/tool'));
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  const old=readCliIdentity(f.cliRoot);assert.equal(old.status,'verified');
  write(path.join(f.cliRoot,'node_modules/.package-lock.json'),'updated generated');assert.equal(readCliIdentity(f.cliRoot).contentFingerprint,old.contentFingerprint);
  fs.appendFileSync(module,'\n');assert.equal(readCliIdentity(f.cliRoot).status,'content-mismatch');
});
test('readonly dependency-lock diagnosis detects changed versions and missing required packages',async t=>{
  const f=fixture(t),file=path.join(f.cliRoot,'npm-shrinkwrap.json');
  write(file,JSON.stringify({lockfileVersion:3,packages:{'':{},'node_modules/tool':{version:'1.0.0'},'node_modules/platform':{version:'1.0.0',optional:true}}}));
  write(path.join(f.cliRoot,'node_modules/tool/package.json'),JSON.stringify({version:'1.0.0'}));
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  const valid=await diagnoseInstallation(f.options);assert.equal(valid.cli.dependencyLock.status,'verified');
  write(path.join(f.cliRoot,'node_modules/tool/package.json'),JSON.stringify({version:'2.0.0'}));
  const changed=await diagnoseInstallation(f.options);assert.ok(codes(changed).includes('E_DEV_DEPENDENCY_LOCK'));assert.equal(changed.cli.status,'verified');
  fs.unlinkSync(path.join(f.cliRoot,'node_modules/tool/package.json'));
  assert.ok(codes(await diagnoseInstallation(f.options)).includes('E_DEV_DEPENDENCY_LOCK'));
});
test('version uses actual package metadata, identity is deterministic and detects same-version changed bytes',async t=>{
  const f=fixture(t),old=readCliIdentity(f.cliRoot);
  assert.equal(old.status,'verified');assert.equal(readCliIdentity(f.cliRoot).contentFingerprint,old.contentFingerprint);
  let output='';
  assert.equal(await runDevCli(['--version','--json'],{identityRoot:f.cliRoot,stdout:{write:text=>output+=text}}),0);
  assert.equal(JSON.parse(output).version,old.version);assert.equal(JSON.parse(output).contentFingerprint,old.contentFingerprint);
  fs.writeFileSync(path.join(f.cliRoot,'runtime/entry.mjs'),'export const value=2;');
  const changed=readCliIdentity(f.cliRoot);
  assert.equal(changed.version,old.version);assert.equal(changed.entrySha256,old.entrySha256);
  assert.notEqual(changed.contentFingerprint,old.contentFingerprint);assert.equal(changed.status,'content-mismatch');
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  const report=await diagnoseInstallation(f.options);
  assert.ok(codes(report).includes('E_DEV_REGISTRATION_CONTENT_CHANGED'));
  assert.equal(report.registration.entryMatches,true);assert.equal(report.registration.contentMatches,false);
});
test('a verified package is self-consistent, not evidence of latest; explicit reference catches same-version old content',async t=>{
  const f=fixture(t),expected=pkg(path.join(f.home,'candidate'),'export const value=3;');
  assert.equal((await diagnoseInstallation(f.options)).ok,true);
  const report=await diagnoseInstallation({...f.options,expectedRoot:expected});
  assert.ok(codes(report).includes('E_DEV_SAME_VERSION_CONTENT'));assert.equal(report.cli.status,'verified');
  assert.equal(report.ok,false);
});
test('missing metadata, renamed version and unexpected runtime file cannot pass identity verification',t=>{
  const f=fixture(t);
  fs.unlinkSync(path.join(f.cliRoot,'build-info.json'));assert.equal(readCliIdentity(f.cliRoot).status,'legacy-unrecorded');
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  write(path.join(f.cliRoot,'package.json'),JSON.stringify({name:CLI_PACKAGE,version:'9.9.9'}));
  assert.equal(readCliIdentity(f.cliRoot).status,'content-mismatch');
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  write(path.join(f.cliRoot,'runtime/extra.mjs'),'unexpected');assert.equal(readCliIdentity(f.cliRoot).status,'content-mismatch');
});
test('missing declared runtime dependencies are diagnosed without loading or executing them',async t=>{
  const f=fixture(t),file=path.join(f.cliRoot,'package.json'),data=JSON.parse(fs.readFileSync(file));
  write(file,JSON.stringify({...data,dependencies:{'opendesk-doctor-missing-fixture':'1.0.0'}}));
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  const report=await diagnoseInstallation(f.options);
  assert.ok(codes(report).includes('E_DEV_RUNTIME_DEPENDENCY'));assert.equal(report.cli.runtimeDependencies[0].resolvedPath,null);
});
test('an intact require branch does not hide a missing ESM import target',async t=>{
  const f=fixture(t),file=path.join(f.cliRoot,'package.json'),data=JSON.parse(fs.readFileSync(file));
  write(file,JSON.stringify({...data,dependencies:{acorn:'8.15.0'}}));
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(createBuildInfo(f.cliRoot)));
  write(path.join(f.cliRoot,'node_modules/acorn/package.json'),JSON.stringify({name:'acorn',version:'8.15.0',exports:{'.':{import:'./dist/acorn.mjs',require:'./dist/acorn.js'}}}));
  write(path.join(f.cliRoot,'node_modules/acorn/dist/acorn.js'),'throw new Error("must not execute");');
  const report=await diagnoseInstallation(f.options);
  assert.ok(codes(report).includes('E_DEV_RUNTIME_DEPENDENCY'));
  assert.ok(report.cli.runtimeDependencies[0].resolvedPath.endsWith('acorn.js'));
  assert.equal(report.cli.runtimeDependencies[0].importPath,null);
});
test('nvm CLI and Homebrew registered package are diagnosed independently of matching version and entry bytes',async t=>{
  const f=fixture(t),brew=pkg(path.join(f.home,'homebrew/lib/node_modules/@shopable/opendesk-dev'),'export const value=4;');
  const other=readCliIdentity(brew);
  write(f.registration,JSON.stringify({format:'opendesk.dev-cli.r17',localDevAccessVersion:1,
    entry:other.entryPath,sha256:other.entrySha256,packageVersion:other.version,contentFingerprint:other.contentFingerprint}));
  const report=await diagnoseInstallation(f.options);
  assert.ok(codes(report).includes('E_DEV_ENTRY_DIFFERENT'));assert.equal(report.registration.identity.status,'verified');
  assert.equal(report.registration.contentMatches,true);
});
test('Go selection prefers trusted Homebrew node over PATH nvm, skipping project/node_modules executables',t=>{
  const f=fixture(t),brew=path.join(f.home,'brew/bin'),nvm=path.join(f.home,'nvm/bin'),project=path.join(f.home,'project');
  for(const dir of [brew,nvm,path.join(project,'node_modules/.bin')]){
    fs.mkdirSync(dir,{recursive:true});fs.symlinkSync(process.execPath,path.join(dir,'node'));
  }
  const env={PATH:[path.join(project,'node_modules/.bin'),nvm].join(path.delimiter)};
  assert.equal(selectGoNode({env,cwd:project,preferredDirs:[brew]}).path,path.join(brew,'node'));
  assert.equal(selectGoNode({env,cwd:project,preferredDirs:[]}).path,path.join(nvm,'node'));
  assert.equal(selectGoNode({env:{PATH:project},cwd:project,preferredDirs:[]}),null);
});
test('different Go Node is never executed to infer its version or mutate the filesystem',async t=>{
  const f=fixture(t),fake=path.join(f.home,'not-node'),marker=path.join(f.home,'must-not-exist');
  write(fake,`#!/bin/sh\ntouch '${marker}'\necho v22.12.0\n`,0o700);
  const report=await diagnoseInstallation({...f.options,goNode:{path:fake,resolvedPath:fake}});
  assert.ok(codes(report).includes('W_NODE_PATH_DIFFERENT'));assert.equal(report.node.goSelection.version,null);
  assert.equal(fs.existsSync(marker),false);
});
test('old Node owner is migration-required and is never probed or changed',async t=>{
  const f=fixture(t);write(f.installFile,JSON.stringify({...f.config,provider:'node'}));
  const before=fs.readFileSync(f.installFile);let probes=0;
  const report=await diagnoseInstallation({...f.options,probe:()=>{probes++;throw new Error();}});
  assert.equal(report.native.provider,'node');assert.ok(codes(report).includes('E_MIGRATION_REQUIRED'));
  assert.equal(probes,0);assert.deepEqual(fs.readFileSync(f.installFile),before);
});
test('missing socket, disconnected extension, incompatible capability and invalid manifest have distinct repairs',async t=>{
  const f=fixture(t);
  for(const [reply,code] of [
    [{state:'socket-unavailable',code:'E_NATIVE_NOT_READY'},'E_NATIVE_NOT_READY'],
    [{...f.connected,state:'extension-disconnected',browserReady:false,compatible:false},'E_EXTENSION_DISCONNECTED'],
    [{...f.connected,compatible:false,capabilities:{localDevMultiVersion:0}},'E_NATIVE_UPDATE_REQUIRED']]){
    const report=await diagnoseInstallation({...f.options,probe:async()=>reply});
    assert.ok(codes(report).includes(code));assert.ok(report.issues.find(row=>row.code===code).repair);
    if(code!=='E_NATIVE_UPDATE_REQUIRED')assert.ok(!codes(report).includes('E_NATIVE_UPDATE_REQUIRED'));
  }
  write(f.manifest,JSON.stringify({name:HOST_NAME,type:'stdio',path:'/old/node-host',allowed_origins:[]}));
  const report=await diagnoseInstallation({...f.options,probe:()=>{throw new Error('must not probe');}});
  assert.ok(codes(report).includes('E_NATIVE_MANIFEST'));assert.equal(report.native.connection.state,'not-probed');
});
test('private file permissions, invalid provenance and protocol payload never expose credentials',async t=>{
  const f=fixture(t);
  const metadata=JSON.parse(fs.readFileSync(path.join(f.cliRoot,'build-info.json')));
  metadata.source.clientCredential=credential;metadata.source.gitHead=credential;metadata.source.lockSha256=credential;
  write(path.join(f.cliRoot,'build-info.json'),JSON.stringify(metadata));
  const report=await diagnoseInstallation(f.options);
  assert.ok(!JSON.stringify(report).includes(credential));assert.ok(!formatDiagnostic(report).includes(credential));
  fs.chmodSync(f.installFile,0o644);
  const denied=await diagnoseInstallation(f.options);
  assert.ok(codes(denied).includes('E_INSTALL_PERMISSIONS'));assert.equal(denied.native.connection.state,'not-probed');
});
test('receipt and entry sizes match Go admission limits',async t=>{
  const f=fixture(t),receipt=JSON.parse(fs.readFileSync(f.registration));
  write(f.registration,JSON.stringify({...receipt,unknown:'x'.repeat(5000)}));
  assert.ok(codes(await diagnoseInstallation(f.options)).includes('E_DEV_COMPONENT_INVALID'));
  write(f.registration,JSON.stringify(receipt));
  write(f.identity.entryPath,'x'.repeat(131073));
  assert.ok(codes(await diagnoseInstallation(f.options)).includes('E_DEV_COMPONENT_INVALID'));
});
test('an executable directory cannot be accepted as a Go binary even with a live socket',async t=>{
  const f=fixture(t),directory=path.join(f.home,'binary-directory');fs.mkdirSync(directory);
  write(f.installFile,JSON.stringify({...f.config,executable:directory}));
  write(path.join(f.installRoot,'native-host'),`#!/bin/sh\nunset OPENDESK_NATIVE_INSTANCE\nexec '${directory}' browser native-host "$@"\n`,0o700);
  const report=await diagnoseInstallation(f.options);
  assert.ok(codes(report).includes('E_NATIVE_EXECUTABLE'));assert.equal(report.ok,false);
});
test('doctor flags never reinterpret directory names and reject malformed combinations',()=>{
  assert.equal(parseArgs(['doctor']).action,'attach');
  assert.equal(parseArgs(['dev','--doctor','--json']).action,'doctor');
  for(const args of [['--doctor','/project'],['--doctor','--json','--json'],['--doctor','--expect-package'],['--version','--json','/project']])
    assert.throws(()=>parseArgs(args),e=>e.code==='E_SCHEMA');
});
test('doctor exit code and JSON reflect faults without invoking an attach or browser opener',async t=>{
  const f=fixture(t);let text='',error='';
  const options={identityRoot:f.cliRoot,diagnosticOptions:{...f.options,probe:async()=>({state:'socket-unavailable',code:'E_NATIVE_NOT_READY'})},
    stdout:{write:value=>text+=value},stderr:{write:value=>error+=value}};
  assert.equal(await runDevCli(['--doctor','--json'],options),1);assert.equal(error,'');
  const report=JSON.parse(text);assert.ok(codes(report).includes('E_NATIVE_NOT_READY'));assert.ok(!text.includes(credential));
});
test('real socket probe sends only auth, strips unknown response fields and closes its connection',async t=>{
  const f=fixture(t),messages=[];let closed;
  const connectionClosed=new Promise(resolve=>closed=resolve);
  const server=net.createServer(socket=>{
    socket.once('close',closed);
    socket.on('data',bytes=>{
      messages.push(JSON.parse(bytes.toString()));
      socket.write(JSON.stringify({v:1,kind:'authenticated',browserReady:true,clientCredential:credential,
        localDevMultiVersion:1,localFilesVersion:1,localDevAccessVersion:1})+'\n');
    });
  });
  t.after(()=>server.close());
  await new Promise(resolve=>server.listen(f.config.socketPath,resolve));
  const report=await probeNative({socketPath:f.config.socketPath,clientCredential:credential});
  await connectionClosed;
  assert.equal(report.compatible,true);assert.equal(messages.length,1);assert.equal(messages[0].kind,'auth');
  assert.ok(!JSON.stringify(report).includes(credential));
});
test('oversized, malformed, unauthenticated or silent responses are bounded and never leaked',async()=>{
  class Socket extends EventEmitter{destroy(){this.emit('close');}write(){} }
  for(const [bytes,code] of [[Buffer.alloc(61441),'E_NATIVE_PROTOCOL'],[Buffer.from('bad\n'),'E_NATIVE_PROTOCOL'],
    [Buffer.from(JSON.stringify({v:1,kind:'error',message:credential})+'\n'),'E_NATIVE_AUTH']]){
    const socket=new Socket(),promise=probeNative({socketPath:'/unused',clientCredential:credential},{connect:()=>socket});
    socket.emit('data',bytes);const reply=await promise;assert.equal(reply.code,code);assert.ok(!JSON.stringify(reply).includes(credential));
  }
  const reply=await probeNative({socketPath:'/unused',clientCredential:credential},{connect:()=>new Socket(),timeoutMs:5});
  assert.equal(reply.code,'E_NATIVE_NOT_READY');
});
