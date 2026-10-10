import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {NativeDecoder, frame, HOST_NAME} from '../../native-agent/wire.mjs';

// Runs only when an actual built OpenDesk binary is supplied by CI or a
// maintainer. The simulated Chrome frames do NOT count as real Chrome E2E.
const binary = process.env.OPENDESK_BROWSER_BINARY;
const applicable = !!binary && ['darwin', 'linux'].includes(process.platform);
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const origin = 'chrome-extension://' + extensionId + '/';
const fixtureRepositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function bounded(promise, name, ms=8000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('Timeout: ' + name)), ms);
  })]).finally(() => clearTimeout(timer));
}
function exited(child) {
  return new Promise(resolve => child.once('exit',(code,signal) => resolve({code,signal})));
}
// The Native hello is an extensible capability negotiation frame. Preserve
// strict checks for the protocol levels exercised here without treating newly
// advertised, unrelated capabilities as an incompatible old Host.
export function assertGoNativeHello(message) {
  assert.equal(message?.v,1,'Native framing version must be v1');
  assert.equal(message?.kind,'hello','Go Host must initiate the welcome handshake');
  assert.equal(message?.workflowAiVersion,1,'Go Host must advertise workflow-ai.v1');
  assert.equal(message?.localFilesVersion,1,'Go Host must advertise local-files.v1');
}

test('Go hello verifies R16 capabilities but tolerates additive fields',()=>{
  assertGoNativeHello({v:1,kind:'hello',workflowAiVersion:1,localFilesVersion:1});
  assertGoNativeHello({v:1,kind:'hello',workflowAiVersion:1,localFilesVersion:1,futureCapability:2});
  assert.throws(()=>assertGoNativeHello({v:1,kind:'hello',workflowAiVersion:0,localFilesVersion:1}));
  assert.throws(()=>assertGoNativeHello({v:1,kind:'hello',workflowAiVersion:1}));
});

function collectChrome(stream) {
  const decoder = new NativeDecoder(), queue = [], waiting = [];
  let error;
  stream.on('data', data => {
    try {
      for (const message of decoder.push(data)) {
        const next = waiting.shift();
        if (next) next.resolve(message); else queue.push(message);
      }
    } catch (e) {
      error=e;
      for (const waiter of waiting.splice(0)) waiter.reject(e);
    }
  });
  return {
    next() {
      if (error) return Promise.reject(error);
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve,reject) => waiting.push({resolve,reject}));
    }
  };
}

test('OpenDesk executable is a Node-free Chrome Native Host with CLI parity (simulated Chrome)', {
  skip: !applicable,
  timeout: 50000
}, async t => {
  const executable = fs.realpathSync(binary);
  const home = fs.mkdtempSync('/tmp/od-go-native-');
  const env = {...process.env, HOME:home};
  let host;
  t.after(() => {
    host?.kill('SIGKILL');
    fs.rmSync(home,{recursive:true,force:true});
  });
  const command = args => spawnSync(executable,['browser',...args], {
    env,encoding:'utf8',timeout:10000
  });
  let result = command(['setup','--extension-id',extensionId,'--browser','chrome']);
  assert.equal(result.status,0,result.stderr);
  const root = path.join(home,'.opendesk-browser','native-agent-r1');
  const manifestPath = path.join(home,'Library/Application Support/Google/Chrome',
    'NativeMessagingHosts',HOST_NAME+'.json');
  const linuxManifest = path.join(home,'.config/google-chrome/NativeMessagingHosts',HOST_NAME+'.json');
  const manifest=JSON.parse(fs.readFileSync(process.platform==='darwin'?manifestPath:linuxManifest,'utf8'));
  assert.deepEqual(manifest.allowed_origins,[origin]);
  assert.equal(manifest.path,path.join(root,'native-host'));
  assert.equal(fs.statSync(root).mode & 0o777,0o700);
  assert.equal(fs.statSync(path.join(root,'install.json')).mode & 0o777,0o600);
  assert.equal(fs.statSync(path.join(root,'native-host')).mode & 0o777,0o700);
  assert.match(fs.readFileSync(manifest.path,'utf8'), / browser native-host "/);
  result = command(['doctor']);
  assert.equal(result.status,1,'not connected does not imply a running Chrome');
  assert.equal(JSON.parse(result.stdout).local.installed,true);

  const denied=spawn(manifest.path,['chrome-extension://'+'b'.repeat(32)+'/'], {
    env,stdio:['pipe','pipe','pipe']
  });
  let deniedStdout=Buffer.alloc(0);
  denied.stdout.on('data',d => {deniedStdout=Buffer.concat([deniedStdout,d]);});
  const deniedExit=await bounded(exited(denied),'wrong origin');
  assert.notEqual(deniedExit.code,0);
  assert.equal(deniedStdout.length,0,'Native stdout cannot carry logs/errors');

  host=spawn(manifest.path,[origin],{env,stdio:['pipe','pipe','pipe']});
  const messages=collectChrome(host.stdout);
  assertGoNativeHello(await bounded(messages.next(),'native hello'));
  assert.equal(fs.statSync(path.join(root,'agent.sock')).mode & 0o777,0o600);
  host.stdin.write(frame({v:1,kind:'welcome',extensionId,extensionVersion:'0.1.0',localDevVersion:1}));
  await pause(100);

  // Real Go Native Host process, simulated Chrome framing. Verify the new AI
  // protocol travels alongside the original ten Browser RPCs without needing
  // a Codex installation, account, or any model inference. A whole-owner close
  // revokes that AI identity but must not tear down the legacy CLI bridge.
  const aiScope={ownerId:'simulated-sidebar-owner',registrationId:'simulated-sidebar-registration',generation:1};
  const aiFrame=(requestId,method)=>({v:1,kind:'ai.request',protocol:'opendesk.workflow-ai.v1',
    requestId,...aiScope,method,params:{}});
  host.stdin.write(frame(aiFrame('ai-close-smoke','ai.session.close')));
  const aiClosed=await bounded(messages.next(),'Go R16 workflow AI owner close');
  assert.equal(aiClosed.v,1);
  assert.equal(aiClosed.kind,'ai.response');
  assert.equal(aiClosed.protocol,'opendesk.workflow-ai.v1');
  assert.equal(aiClosed.requestId,'ai-close-smoke');
  for(const [key,value] of Object.entries(aiScope))assert.equal(aiClosed[key],value);
  assert.equal(aiClosed.result?.state,'CLOSED');
  assert.equal(aiClosed.result?.closedSessions,0);
  assert.equal(Object.hasOwn(aiClosed,'error'),false);
  host.stdin.write(frame(aiFrame('ai-read-revoked','ai.capabilities.read')));
  const aiRevoked=await bounded(messages.next(),'Go R16 owner revocation');
  assert.equal(aiRevoked.requestId,'ai-read-revoked');
  assert.equal(aiRevoked.error?.code,'E_OWNER');
  assert.equal(Object.hasOwn(aiRevoked,'result'),false);

  const caller=spawn(executable,['browser','bridge.status','--request-id','go-provider-1'], {
    env,stdio:['ignore','pipe','pipe']
  });
  let out='',err='';
  caller.stdout.on('data',d => {out+=d;});
  caller.stderr.on('data',d => {err+=d;});
  const req=await bounded(messages.next(),'forwarded CLI request');
  assert.equal(req.method,'bridge.status');
  assert.equal(req.requestId,'go-provider-1');
  host.stdin.write(frame({v:1,kind:'response',requestId:req.requestId,
    result:{extensionId,enabled:true,nativeConnected:true,bridgeVersion:1,hostRegistrations:[]}}));
  const callExit=await bounded(exited(caller),'CLI completion');
  assert.equal(callExit.code,0,err);
  const response=JSON.parse(out);
  assert.equal(response.result.extensionId,extensionId);
  assert.equal(response.requestId,'go-provider-1');

  // Backward compatibility is intentionally asymmetric: the old Node CLI
  // may READ the Go-owned v1 connection, but its installer may not take it
  // over. The real Go Native Host remains the ONLY Chrome-facing process.
  const nodeCli=path.join(fixtureRepositoryRoot,'native-agent/cli.mjs');
  const legacy=spawn(process.execPath,[nodeCli,'bridge.status','--request-id','node-client-go-host'],{
    env,stdio:['ignore','pipe','pipe']
  });
  let legacyOut='',legacyErr='';
  legacy.stdout.on('data',d=>{legacyOut+=d;});
  legacy.stderr.on('data',d=>{legacyErr+=d;});
  const legacyReq=await bounded(messages.next(),'Node CLI to Go Host');
  assert.equal(legacyReq.requestId,'node-client-go-host');
  assert.equal(legacyReq.method,'bridge.status');
  host.stdin.write(frame({v:1,kind:'response',requestId:legacyReq.requestId,
    result:{extensionId,enabled:true,nativeConnected:true,bridgeVersion:1,hostRegistrations:[]}}));
  assert.equal((await bounded(exited(legacy),'Node CLI v1 result')).code,0,legacyErr);
  assert.equal(JSON.parse(legacyOut).result.extensionId,extensionId);

  // Node doctor also needs to understand Go's provider-typed install.json,
  // rather than assuming its legacy .mjs snapshot is installed.
  const nodeDoctor=spawn(process.execPath,[nodeCli,'doctor'],{env,stdio:['ignore','pipe','pipe']});
  let doctorOut='',doctorErr='';
  nodeDoctor.stdout.on('data',d=>{doctorOut+=d;});
  nodeDoctor.stderr.on('data',d=>{doctorErr+=d;});
  const doctorRequest=await bounded(messages.next(),'Node doctor Go status');
  assert.equal(doctorRequest.method,'bridge.status');
  host.stdin.write(frame({v:1,kind:'response',requestId:doctorRequest.requestId,
    result:{extensionId,enabled:true,nativeConnected:true,bridgeVersion:1,hostRegistrations:[]}}));
  assert.equal((await bounded(exited(nodeDoctor),'Node doctor Go status reply')).code,0,doctorErr);
  const doctorData=JSON.parse(doctorOut);
  assert.equal(doctorData.local.provider,'opendesk');
  assert.equal(doctorData.local.installed,true);
  assert.equal(doctorData.connected,true);

  // Exercise the UNMODIFIED legacy Node local-project provider against
  // Go's reverse read-only provider protocol. No JS project is executed.
  const providerUrl=pathToFileURL(path.join(fixtureRepositoryRoot,'native-agent/local-dev/provider.mjs')).href;
  const providerScript=`
    import {createLocalProjectProvider} from ${JSON.stringify(providerUrl)};
    const provider=createLocalProjectProvider({session:{
      resolver:{list:()=>[{bindingId:'local-compat',name:'Compatibility'}]},
      resolve:async(bindingId)=>({bindingId,projectId:'p',runtimeKind:'controller',
        entryFormat:'async-main',sourceUtf8:'async function main(){return 1}',
        sourceHash:'a'.repeat(64),sourceBytes:31,inputHash:'b'.repeat(64),
        cacheHit:true,capturedAt:0,siteOrigins:['https://example.test']})
    }});
    process.on('SIGTERM',()=>{provider.close();process.exit(0);});
    process.on('SIGINT',()=>{provider.close();process.exit(0);});
  `;
  const nodeProvider=spawn(process.execPath,['--input-type=module','-e',providerScript],{
    env,stdio:['ignore','pipe','pipe']
  });
  t.after(()=>nodeProvider.kill('SIGTERM'));
  let providerErr='';
  nodeProvider.stderr.on('data',d=>{providerErr+=d;});
  const activeProvider=await bounded(messages.next(),'real Node project provider registered');
  assert.equal(activeProvider.kind,'dev.state',providerErr);
  assert.equal(activeProvider.connected,true,providerErr);
  assert.match(activeProvider.providerEpoch,/^[a-zA-Z0-9._:-]{1,100}$/);
  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'node-provider-list-1',
    providerEpoch:activeProvider.providerEpoch,method:'projects.list',params:{}}));
  const projectReply=await bounded(messages.next(),'Node provider project listing');
  assert.equal(projectReply.kind,'dev.response');
  assert.equal(projectReply.requestId,'node-provider-list-1');
  assert.equal(projectReply.result.projects[0].bindingId,'local-compat');
  const providerDone=exited(nodeProvider);
  nodeProvider.kill('SIGTERM');
  assert.equal((await bounded(providerDone,'Node provider exit')).code,0,providerErr);
  const disconnected=await bounded(messages.next(),'provider disconnected');
  assert.equal(disconnected.kind,'dev.state');
  assert.equal(disconnected.connected,false);

  const done=exited(host);
  host.stdin.end();
  assert.equal((await bounded(done,'host EOF')).code,0);
  host=null;
  for(let i=0;i<40 && fs.existsSync(path.join(root,'agent.sock'));i++) await pause(25);
  assert.equal(fs.existsSync(path.join(root,'agent.sock')),false);

  // SIGTERM is a separate lifecycle from Chrome Port EOF. A Go process
  // terminated by the OS must not strand the private agent.sock, or every
  // subsequent connectNative would fail with E_SOCKET_IN_USE.
  host=spawn(manifest.path,[origin],{env,stdio:['pipe','pipe','pipe']});
  const second=collectChrome(host.stdout);
  assertGoNativeHello(await bounded(second.next(),'second Native hello'));
  const signalDone=exited(host);
  host.kill('SIGTERM');
  const signalResult=await bounded(signalDone,'Go native SIGTERM cleanup');
  assert.equal(signalResult.signal,null,'Go Host must trap SIGTERM to remove its socket');
  assert.equal(signalResult.code,0,'Go Native Host SIGTERM shutdown must be clean');
  host=null;
  for(let i=0;i<40 && fs.existsSync(path.join(root,'agent.sock'));i++) await pause(25);
  assert.equal(fs.existsSync(path.join(root,'agent.sock')),false,
    'SIGTERM must remove only its owned Unix Socket');

  // In an isolated HOME, the full native Go product can now serve ordinary
  // user-approved JS directly, without creating any Node MCP or resolver.
  // Chrome remains simulated here; only Browser SW can later authorize Run.
  const sourceFile=fs.realpathSync(home)+'/'+ 'approved-single-file.js';
  const sourceText='return {title: await page.title()};\n';
  fs.writeFileSync(sourceFile,sourceText,{mode:0o600});
  const grant=command(['project','add','--path',sourceFile,
    '--runtime-kind','controller','--site-origin','https://example.test']);
  assert.equal(grant.status,0,grant.stderr);
  const grantResult=JSON.parse(grant.stdout);
  assert.match(grantResult.bindingId,/^local-[a-f0-9]{20}$/);
  result=command(['project','list']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).projects[0].bindingId,grantResult.bindingId);

  host=spawn(manifest.path,[origin],{env,stdio:['pipe','pipe','pipe']});
  const goProjects=collectChrome(host.stdout);
  assertGoNativeHello(await bounded(goProjects.next(),'Go provider native hello'));
  host.stdin.write(frame({v:1,kind:'welcome',extensionId,extensionVersion:'0.1.0',localDevVersion:1}));
  const state=await bounded(goProjects.next(),'Go project provider session');
  assert.equal(state.kind,'dev.state');
  assert.equal(state.connected,true,'Go must serve granted single files without Node');
  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'go-project-list',
    providerEpoch:state.providerEpoch,method:'projects.list',params:{}}));
  const projectsReply=await bounded(goProjects.next(),'native Go projects.list');
  assert.equal(projectsReply.kind,'dev.response');
  assert.equal(projectsReply.result.projects[0].bindingId,grantResult.bindingId);

  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'go-project-resolve',
    providerEpoch:state.providerEpoch,method:'project.resolve',
    params:{bindingId:grantResult.bindingId}}));
  const resolved=await bounded(goProjects.next(),'native Go project.resolve');
  assert.equal(resolved.kind,'dev.response');
  assert.equal(resolved.result.sourceUtf8,sourceText);
  assert.equal(resolved.result.sourceHash,
    createHash('sha256').update(Buffer.from(sourceText)).digest('hex'));
  assert.deepEqual(resolved.result.siteOrigins,['https://example.test']);
  assert.equal(Object.hasOwn(resolved.result,'path'),false);
  assert.equal(Object.hasOwn(resolved.result,'files'),false);

  const revoke=command(['project','revoke','--binding-id',grantResult.bindingId]);
  assert.equal(revoke.status,0,revoke.stderr);
  assert.equal(JSON.parse(revoke.stdout).providerNotified,true,
    'running Go Host must acknowledge the credential-authenticated grant update');
  const changed=await bounded(goProjects.next(),'native Go project revocation event');
  assert.equal(changed.kind,'dev.state');
  assert.equal(changed.connected,false,'revoked last file must remove builtin provider');
  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'go-revoked',
    providerEpoch:state.providerEpoch,method:'project.resolve',
    params:{bindingId:grantResult.bindingId}}));
  const revoked=await bounded(goProjects.next(),'revoked Go project request');
  assert.equal(revoked.kind,'dev.response');
  assert.equal(revoked.error.code,'E_DEV_DISCONNECTED',
    'old providerEpoch must not read a revoked file');

  const regrant=command(['project','add','--path',sourceFile,
    '--runtime-kind','controller','--site-origin','https://example.test']);
  assert.equal(regrant.status,0,regrant.stderr);
  assert.equal(JSON.parse(regrant.stdout).providerNotified,true);
  const renewed=await bounded(goProjects.next(),'Go granted file provider refresh');
  assert.equal(renewed.kind,'dev.state');
  assert.equal(renewed.connected,true);
  assert.notEqual(renewed.providerEpoch,state.providerEpoch);
  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'go-regranted',
    providerEpoch:renewed.providerEpoch,method:'project.resolve',
    params:{bindingId:grantResult.bindingId}}));
  const regranted=await bounded(goProjects.next(),'Go re-granted file resolution');
  assert.equal(regranted.result.sourceUtf8,sourceText);
  const finalHost=exited(host);
  host.stdin.end();
  assert.equal((await bounded(finalHost,'Go project provider shutdown')).code,0);
  host=null;
  for(let i=0;i<40 && fs.existsSync(path.join(root,'agent.sock'));i++) await pause(25);
  assert.equal(fs.existsSync(path.join(root,'agent.sock')),false);

  result=command(['cleanup']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(process.platform==='darwin'?manifestPath:linuxManifest),false);
});
