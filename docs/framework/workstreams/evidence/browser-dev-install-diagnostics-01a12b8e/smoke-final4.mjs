import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const scratch='/Users/shopme/.codex/tmp/browser-dev-install-diagnostics-01a12b8e';
const evidence='/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-dev-install-diagnostics-01a12b8e';
const prefix=path.join(scratch,'prefix-final4'),root=path.join(prefix,'lib/node_modules/@shopable/opendesk-dev'),stage=path.join(scratch,'cli-final4');
const module=name=>import(pathToFileURL(path.join(root,'runtime/native-agent/local-dev',name)));
const {readCliIdentity}=await module('cli-identity.mjs');
const {safeRegister,loadGoInstall,assertSupportedNodeVersion,runDevCli}=await module('dev-cli.mjs');
const {diagnoseInstallation}=await module('installation-diagnostics.mjs');
const {LocalDevResolver}=await module('resolver.mjs');
const {manifestLocation}=await import(pathToFileURL(path.join(root,'runtime/native-agent/locations.mjs')));
const {HOST_NAME}=await import(pathToFileURL(path.join(root,'runtime/native-agent/wire.mjs')));
const run=(file,args,cwd)=>{const r=spawnSync(file,args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
const actual=readCliIdentity(root),expected=readCliIdentity(stage);
assert.equal(actual.status,'verified');assert.equal(actual.contentFingerprint,expected.contentFingerprint);assert.equal(actual.metadataSha256,expected.metadataSha256);
const version=JSON.parse(run(process.execPath,[actual.entryPath,'--version','--json']));assert.equal(version.version,actual.version);assert.equal(version.contentFingerprint,actual.contentFingerprint);
const home=fs.realpathSync(fs.mkdtempSync('/tmp/odb-smoke-'));fs.chmodSync(home,0o700);
const write=(file,value,mode=0o600)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,value,{mode});};
const nativeRoot=path.join(home,'.opendesk-browser/native-agent-r1'),credential='a'.repeat(64),extensionId='abcdefghijklmnopabcdefghijklmnop';
const config={name:HOST_NAME,provider:'opendesk',installRoot:nativeRoot,socketPath:path.join(nativeRoot,'agent.sock'),extensionId,clientCredential:credential,browser:'chrome',executable:process.execPath};
write(path.join(nativeRoot,'install.json'),JSON.stringify(config));
write(path.join(nativeRoot,'native-host'),`#!/bin/sh\nunset OPENDESK_NATIVE_INSTANCE\nexec '${process.execPath}' browser native-host "$@"\n`,0o700);
write(manifestLocation('chrome',null,{home}),JSON.stringify({name:HOST_NAME,type:'stdio',path:path.join(nativeRoot,'native-host'),allowed_origins:['chrome-extension://'+extensionId+'/']}));
safeRegister(actual.entryPath,{homeDirectory:home});
let connections=0;const frames=[];
const server=net.createServer(socket=>{connections++;let buffer='';socket.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')){const i=buffer.indexOf('\n'),frame=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);assert.equal(frame.kind,'auth');assert.equal(frame.credential,credential);frames.push(frame.kind);socket.write(JSON.stringify({v:1,kind:'authenticated',browserReady:true,localDevMultiVersion:1,localFilesVersion:1,localDevAccessVersion:1})+'\n');}});});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.socketPath,resolve);});
const options={home,cliRoot:root,expectedRoot:stage,env:{PATH:path.join(prefix,'bin')+path.delimiter+path.dirname(process.execPath)},loadInstall:loadGoInstall,assertNode:assertSupportedNodeVersion,goNode:{path:process.execPath,resolvedPath:fs.realpathSync(process.execPath)}};
try{
 const before=await diagnoseInstallation(options);assert.equal(before.ok,true,JSON.stringify(before.issues));assert.equal(before.cli.dependencyLock.status,'verified');
 let output='';assert.equal(await runDevCli(['--doctor','--json','--expect-package',stage],{identityRoot:root,diagnosticOptions:options,stdout:{write:x=>output+=x}}),0);assert.equal(JSON.parse(output).ok,true);assert.ok(!output.includes(credential));
 const compiled=[];
 for(const name of ['local-controller','page-ui-react','page-ui-vue']){
  const project=path.join(scratch,'source-final3/examples/programs',name),resolver=new LocalDevResolver({allowedPaths:[project]});
  try{const binding=resolver.attach({path:project});const first=await resolver.resolve(binding.bindingId),second=await resolver.resolve(binding.bindingId);assert.equal(second.cacheHit,true);assert.equal(second.artifactId,first.artifactId);assert.ok(first.sourceUtf8.length);compiled.push({name,runtimeKind:first.runtimeKind,sourceHash:first.sourceHash,artifactId:first.artifactId,sourceBytes:Buffer.byteLength(first.sourceUtf8),cacheHit:second.cacheHit});}finally{resolver.close();}
 }
 const backup=path.join(scratch,'cli-before-final4.tgz'),registrationBackup=path.join(scratch,'registration-before-final4.tgz');
 run('/usr/bin/tar',['-czf',backup,'-C',prefix,'lib/node_modules/@shopable/opendesk-dev','bin/opendesk-dev']);
 run('/usr/bin/tar',['-czf',registrationBackup,'-C',home,'.opendesk-browser/dev-tool-r17']);
 const runtimeFile=path.join(root,'runtime/native-agent/local-dev/resolver.mjs');fs.appendFileSync(runtimeFile,'\n// isolated old-content verification\n');
 const changed=readCliIdentity(root);assert.equal(changed.version,actual.version);assert.equal(changed.entrySha256,actual.entrySha256);assert.notEqual(changed.contentFingerprint,actual.contentFingerprint);
 const mismatch=await diagnoseInstallation(options);assert.equal(mismatch.ok,false);assert.ok(mismatch.issues.some(x=>x.code==='E_DEV_SAME_VERSION_CONTENT'));assert.ok(mismatch.issues.some(x=>x.code==='E_DEV_REGISTRATION_CONTENT_CHANGED'));
 fs.renameSync(root,path.join(scratch,'cli-replaced-final4'));fs.unlinkSync(path.join(prefix,'bin/opendesk-dev'));fs.renameSync(path.join(home,'.opendesk-browser/dev-tool-r17'),path.join(home,'.opendesk-browser/dev-tool-r17-replaced'));
 run('/usr/bin/tar',['-xzf',backup,'-C',prefix]);run('/usr/bin/tar',['-xzf',registrationBackup,'-C',home]);
 const restored=readCliIdentity(root);assert.equal(restored.status,'verified');assert.equal(restored.contentFingerprint,actual.contentFingerprint);assert.equal(restored.metadataSha256,actual.metadataSha256);
 const after=await diagnoseInstallation(options);assert.equal(after.ok,true,JSON.stringify(after.issues));assert.equal(JSON.parse(run(process.execPath,[restored.entryPath,'--version','--json'])).contentFingerprint,actual.contentFingerprint);
 assert.ok(frames.length>=4);assert.ok(frames.every(x=>x==='auth'));
 const report={status:'passed',kind:'isolated-installation-fixture-not-native-acceptance',node:{execPath:process.execPath,version:process.version},prefix,version:actual.version,contentFingerprint:actual.contentFingerprint,metadataSha256:actual.metadataSha256,installedDependencyLock:before.cli.dependencyLock,compiled,backup,registrationBackup,sameVersionMismatchCodes:mismatch.issues.map(x=>x.code),restoredFingerprint:restored.contentFingerprint,authOnlyConnections:connections,credentialsAbsent:true,projectRunRequests:0};
 fs.writeFileSync(path.join(evidence,'install-rollback-smoke-final4.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,version:report.version,contentFingerprint:report.contentFingerprint,compiled:compiled.map(x=>x.name),rollback:true,authOnlyConnections:connections}));
}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(home,{recursive:true,force:true});}
