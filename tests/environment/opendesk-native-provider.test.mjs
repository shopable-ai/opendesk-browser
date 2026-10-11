import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {NativeDecoder, LineDecoder, frame, writeLine, HOST_NAME, MAX_BYTES} from '../../native-agent/wire.mjs';

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

function collectChrome(stream, decoder = new NativeDecoder()) {
  const queue = [], waiting = [], sizes = new WeakMap();
  let error;
  stream.on('data', data => {
    try {
      const framed = decoder instanceof NativeDecoder ? Buffer.concat([decoder.buffer,data]) : null;
      let offset=0;
      for (const message of decoder.push(data)) {
        if(framed){const bytes=framed.readUInt32LE(offset);sizes.set(message,bytes);offset+=4+bytes;}
        const next = waiting.shift();
        if (next) next.resolve(message); else queue.push(message);
      }
    } catch (e) {
      error=e;
      for (const waiter of waiting.splice(0)) waiter.reject(e);
    }
  });
  return {
    bytes: message => sizes.get(message),
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
  // A short, test-owned .runtime prefix avoids the Unix socket path limit.
  const home = fs.mkdtempSync(process.env.OPENDESK_BROWSER_TEST_HOME_PREFIX || '/tmp/od-go-native-');
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
  const rawBinding='local-'+'a'.repeat(20);
  const seeds={plain:'',escaped:'<>&\u2028\u2029',quote:'"',backslash:'\\',
    controls:Array.from({length:32},(_,i)=>String.fromCharCode(i)).join(''),utf8:'中文😀'};
  const providerScript=leaseId=>`
    import net from 'node:net';
    import {createHash} from 'node:crypto';
    import {LineDecoder} from ${JSON.stringify(pathToFileURL(path.join(fixtureRepositoryRoot,'native-agent/wire.mjs')).href)};
    import {createLocalProjectProvider} from ${JSON.stringify(providerUrl)};
    const bindingId=${JSON.stringify(rawBinding)}, seeds=${JSON.stringify(seeds)};
    let epoch,current;
    const sourceValue=source=>({bindingId,projectId:'p',runtimeKind:'controller',managedUI:false,
      entryFormat:'async-main',sourceUtf8:source,sourceHash:createHash('sha256').update(source).digest('hex'),
      sourceBytes:Buffer.byteLength(source),inputHash:'b'.repeat(64),cacheHit:true,capturedAt:0,
      siteOrigins:['https://example.test'],sourceRevision:'r1',artifactId:'a1',timings:{resolveMs:0},
      paramsSchema:{type:'object'}});
    const provider=createLocalProjectProvider({leaseId:${JSON.stringify(leaseId)},session:{
      resolver:{list:()=>[{bindingId,name:'Compatibility',runtimeKind:'controller'}],get:()=>({runtimeKind:'controller'})},
      resolve:async()=>{
        const [,mode,kind,sizeText]=/^wire-(legacy|modern)-([a-z0-9]+)-(\\d+)$/.exec(current.requestId);
        const size=Number(sizeText),prefix='async function main(){return 1;}/*'+seeds[kind];
        let source=prefix+'x'.repeat(58000)+'*/';
        for(let i=0;i<3;i++){
          const bytes=Buffer.byteLength(JSON.stringify({v:1,kind:'dev.response',providerEpoch:epoch,
            requestId:current.requestId,result:sourceValue(source)}));
          source=prefix+'x'.repeat(source.length-prefix.length-2+size-bytes)+'*/';
        }
        return sourceValue(source);
      }
    },connect:options=>{
      const socket=net.createConnection(options),decoder=new LineDecoder();
      socket.on('data',chunk=>{for(const row of decoder.push(chunk)){
        if(row.kind==='provider.registered')epoch=row.providerEpoch;
        if(row.kind==='dev.request')current=row;
      }});
      const write=socket.write.bind(socket);
      socket.write=(chunk,...args)=>{
        const row=JSON.parse(Buffer.from(chunk).toString().trim());
        if(row.kind==='dev.response')process.stdout.write(JSON.stringify({requestId:row.requestId,
          jsonBytes:Buffer.byteLength(JSON.stringify(row)),sourceHash:row.result?.sourceHash})+'\\n');
        return write(chunk,...args);
      };
      return socket;
    }});
    process.on('SIGTERM',()=>{provider.close();process.exit(0);});
    process.on('SIGINT',()=>{provider.close();process.exit(0);});
  `;
  const startProvider=leaseId=>{
    const child=spawn(process.execPath,['--input-type=module','-e',providerScript(leaseId)],{
      env,stdio:['ignore','pipe','pipe']
    });
    t.after(()=>child.kill('SIGTERM'));
    child.stderr.resume();
    return {child,sent:collectChrome(child.stdout,new LineDecoder())};
  };
  const checkProviderBoundaries=async(mode,native,provider,epoch,binding)=>{
    const bindingDelta=binding.length-rawBinding.length;
    for(const [kind,seed] of Object.entries(seeds)){
      const expansion=mode==='modern'?bindingDelta+(kind==='escaped'?21:0):0;
      const cases=[MAX_BYTES-1,MAX_BYTES,MAX_BYTES+1];
      if(expansion)cases.push(MAX_BYTES-1-expansion,MAX_BYTES-expansion,MAX_BYTES+1-expansion);
      if(kind==='escaped')cases.push(61390,61420); // Original observed +28-byte regression inputs.
      // The next small response after each rejection proves the same provider remains usable.
      for(const size of cases.flatMap(size=>[size,1000])){
        const requestId='wire-'+mode+'-'+kind+'-'+size;
        host.stdin.write(frame({v:1,kind:'dev.request',requestId,providerEpoch:epoch,
          method:'project.resolve',params:{bindingId:binding}}));
        const response=await bounded(native.next(),'Node project.resolve '+requestId);
        const sent=await bounded(provider.sent.next(),'Node response byte receipt');
        assert.equal(response.requestId,requestId);assert.equal(sent.requestId,requestId);
        assert.equal(response.providerEpoch,epoch);
        const finalBytes=size+expansion;
        console.log(JSON.stringify({nativeWire:mode,kind,nodeAttemptedJsonBytes:size,
          nodeSentJsonBytes:sent.jsonBytes,goFrameJsonBytes:native.bytes(response),
          expectedFinalJsonBytes:finalBytes,code:response.error?.code||'OK',
          rejectedFinalJsonBytes:response.error?.jsonBytes,limitBytes:response.error?.limitBytes,
          outcome:response.error?.outcome}));
        if(size>MAX_BYTES){
          assert.equal(response.error?.code,'E_LIMIT');
          assert.match(response.error.message,new RegExp('jsonBytes='+size+', limitBytes='+MAX_BYTES));
          assert.match(response.error.message,/dispatch=NOT_DISPATCHED/);
          assert.equal(Object.hasOwn(response,'result'),false);
          assert.ok(native.bytes(response)<=MAX_BYTES);
        }else if(finalBytes>MAX_BYTES){
          assert.equal(sent.jsonBytes,size);
          assert.equal(response.error?.code,'E_LIMIT');
          assert.equal(response.error.jsonBytes,finalBytes);
          assert.equal(response.error.limitBytes,MAX_BYTES);
          assert.equal(response.error.outcome,'NOT_DISPATCHED');
          assert.match(response.error.message,new RegExp('jsonBytes='+finalBytes+', limitBytes='+MAX_BYTES));
          assert.equal(Object.hasOwn(response,'result'),false);
          assert.ok(native.bytes(response)<=MAX_BYTES);
        }else{
          assert.equal(sent.jsonBytes,size);assert.equal(native.bytes(response),finalBytes);
          assert.equal(Object.hasOwn(response,'error'),false);
          const result=response.result;
          assert.equal(result.bindingId,binding);
          assert.ok(result.sourceUtf8.includes(seed));assert.ok(result.sourceUtf8.endsWith('*/'));
          assert.equal(result.sourceBytes,Buffer.byteLength(result.sourceUtf8));
          assert.equal(result.sourceHash,createHash('sha256').update(result.sourceUtf8).digest('hex'));
          assert.equal(result.sourceHash,sent.sourceHash);
        }
      }
    }
  };
  const legacyProvider=startProvider(null),nodeProvider=legacyProvider.child;
  const activeProvider=await bounded(messages.next(),'real Node project provider registered');
  assert.equal(activeProvider.kind,'dev.state');
  assert.equal(activeProvider.connected,true);
  assert.match(activeProvider.providerEpoch,/^[a-zA-Z0-9._:-]{1,100}$/);
  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'node-provider-list-1',
    providerEpoch:activeProvider.providerEpoch,method:'projects.list',params:{}}));
  const projectReply=await bounded(messages.next(),'Node provider project listing');
  assert.equal(projectReply.kind,'dev.response');
  assert.equal(projectReply.requestId,'node-provider-list-1');
  assert.equal(projectReply.result.projects[0].bindingId,rawBinding);
  assert.equal((await legacyProvider.sent.next()).requestId,'node-provider-list-1');
  await checkProviderBoundaries('legacy',messages,legacyProvider,activeProvider.providerEpoch,rawBinding);
  const providerDone=exited(nodeProvider);
  nodeProvider.kill('SIGTERM');
  assert.equal((await bounded(providerDone,'Node provider exit')).code,0);
  const disconnected=await bounded(messages.next(),'provider disconnected');
  assert.equal(disconnected.kind,'dev.state');
  assert.equal(disconnected.connected,false);

  const done=exited(host);
  host.stdin.end();
  assert.equal((await bounded(done,'host EOF')).code,0);
  host=null;
  for(let i=0;i<40 && fs.existsSync(path.join(root,'agent.sock'));i++) await pause(25);
  assert.equal(fs.existsSync(path.join(root,'agent.sock')),false);

  // Reuse the same Go fixture and real Node Provider for the modern scoped response.
  host=spawn(manifest.path,[origin],{env,stdio:['pipe','pipe','pipe']});
  const modern=collectChrome(host.stdout);
  const modernHello=await bounded(modern.next(),'modern Native hello');
  assertGoNativeHello(modernHello);assert.equal(modernHello.localDevMultiVersion,1);
  host.stdin.write(frame({v:1,kind:'welcome',extensionId,extensionVersion:'0.1.0',
    localDevVersion:1,localDevMultiVersion:1,localDevAccessVersion:1,localFilesVersion:1}));
  assert.equal((await bounded(modern.next(),'initial files state')).kind,'files.state');
  const workspace=path.join(home,'wire-workspace');fs.mkdirSync(workspace,{mode:0o700});
  const attachment=net.createConnection(path.join(root,'agent.sock'));
  t.after(()=>attachment.destroy());
  const local=collectChrome(attachment,new LineDecoder());
  await bounded(new Promise((resolve,reject)=>{attachment.once('connect',resolve);attachment.once('error',reject);}), 'attach socket');
  const install=JSON.parse(fs.readFileSync(path.join(root,'install.json'),'utf8'));
  writeLine(attachment,{v:1,kind:'auth',credential:install.clientCredential});
  assert.equal((await local.next()).kind,'authenticated');
  writeLine(attachment,{v:1,kind:'dev.attach',path:workspace,access:'read-only'});
  const attached=await local.next();assert.equal(attached.kind,'dev.attached');
  assert.equal((await bounded(modern.next(),'attached files state')).kind,'files.state');
  const modernProvider=startProvider(attached.leaseId);
  const modernState=await bounded(modern.next(),'modern Provider state');
  assert.equal(modernState.kind,'dev.state');assert.equal(modernState.connected,true);
  host.stdin.write(frame({v:1,kind:'dev.request',requestId:'modern-list-1',
    providerEpoch:modernState.providerEpoch,method:'projects.list',params:{}}));
  const modernList=await bounded(modern.next(),'modern project catalog');
  const scopedBinding=modernList.result.projects[0].bindingId;
  assert.match(scopedBinding,/^local-v2-[a-f0-9]{24}$/);
  assert.equal(scopedBinding.length-rawBinding.length,7);
  await checkProviderBoundaries('modern',modern,modernProvider,modernState.providerEpoch,scopedBinding);

  // Production Node requestAgent preflight, then real Go socket -> stdio dispatch.
  const cliUrl=pathToFileURL(nodeCli).href;
  for(const [index,size] of [MAX_BYTES-1,MAX_BYTES,MAX_BYTES+1,MAX_BYTES,1000].entries()){
    const requestId='wire-run-'+size+'-'+index;
    const params={registrationId:'wire-registration',source:{kind:'draft',sourceUtf8:''},params:{}};
    const envelope={v:1,kind:'request',method:'run.start',requestId,params};
    const overhead=Buffer.byteLength(JSON.stringify(envelope));
    const base='async function main(){return 1;}/*';
    params.source.sourceUtf8=base+'x'.repeat(size-overhead-Buffer.byteLength(base)-2)+'*/';
    assert.equal(Buffer.byteLength(JSON.stringify(envelope)),size);
    const child=spawn(process.execPath,['--input-type=module','-e',`
      import {requestAgent} from ${JSON.stringify(cliUrl)};
      let input='';for await(const chunk of process.stdin)input+=chunk;
      const {params,requestId}=JSON.parse(input);
      try{console.log(JSON.stringify(await requestAgent('run.start',params,requestId,3000)));}
      catch(error){console.log(JSON.stringify({error:{code:error.code,message:error.message}}));}
    `],{env,stdio:['pipe','pipe','pipe']});
    t.after(()=>child.kill('SIGKILL'));
    let output='';child.stdout.on('data',d=>{output+=d;});child.stderr.resume();
    const complete=exited(child);child.stdin.end(JSON.stringify({params,requestId}));
    if(size<=MAX_BYTES){
      const dispatched=await bounded(modern.next(),'run.start '+size);
      assert.equal(dispatched.requestId,requestId);assert.equal(dispatched.method,'run.start');
      assert.equal(modern.bytes(dispatched),size);
      assert.deepEqual(dispatched.params,params);
      host.stdin.write(frame({v:1,kind:'response',requestId,result:{accepted:true}}));
    }
    assert.equal((await bounded(complete,'Node run.start completion')).code,0);
    const reply=JSON.parse(output);
    if(size>MAX_BYTES){assert.equal(reply.error?.code,'E_LIMIT');assert.match(reply.error.message,/jsonBytes=61441, limitBytes=61440/);}
    else assert.equal(reply.result.accepted,true);
    console.log(JSON.stringify({nativeWire:'run.start',requestId,jsonBytes:size,code:reply.error?.code||'OK'}));
  }
  // A mistakenly forwarded overflow would be the next frame, failing this recovery request.
  const modernProviderDone=exited(modernProvider.child);modernProvider.child.kill('SIGTERM');
  assert.equal((await bounded(modernProviderDone,'modern Provider shutdown')).code,0);
  assert.equal((await bounded(modern.next(),'modern Provider disconnected')).kind,'dev.state');
  attachment.destroy();
  const modernDone=exited(host);host.stdin.end();
  assert.equal((await bounded(modernDone,'modern Host shutdown')).code,0);host=null;
  for(let i=0;i<40 && fs.existsSync(path.join(root,'agent.sock'));i++)await pause(25);
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
