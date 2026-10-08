import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {NativeDecoder,frame,HOST_NAME} from '../../native-agent/wire.mjs';

// This is actual macOS installation / real process / AF_UNIX IPC, with a
// test-owned simulated Chrome byte stream. It is NEVER Chrome Native E2E.
const ID='abcdefghijklmnopabcdefghijklmnop';
const ORIGIN='chrome-extension://'+ID+'/';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const onceExit=(child,ms=8000)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('native process did not exit'));},ms);
  child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});
});
const deadline=(promise,ms,label)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(label)),ms);
  promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
});
test('macOS isolated Native Host install, private socket, real wrapper and authenticated CLI IPC', {
  skip:process.platform!=='darwin',
  timeout:30000
},async t=>{
  const home=fs.mkdtempSync('/private/tmp/opendesk-r1-test-');
  const env={...process.env,HOME:home};
  const root=path.join(home,'.opendesk-browser','native-agent-r1');
  const sock=path.join(root,'agent.sock');
  const binary=path.join(root,'native-host');
  const manifest=path.join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts',HOST_NAME+'.json');
  const oldDemo=path.join(path.dirname(manifest),'org.opendesk.browser_core_demo.json');
  fs.mkdirSync(path.dirname(oldDemo),{recursive:true});
  fs.writeFileSync(oldDemo,'other native host preserved\n');
  const invoke=args=>spawnSync(process.execPath,['native-agent/cli.mjs',...args],{
    cwd:process.cwd(),env,encoding:'utf8',timeout:8000
  });
  let native;
  t.after(()=>{
    native?.kill('SIGKILL');
    fs.rmSync(home,{recursive:true,force:true});
  });
  let cmd=invoke(['setup','--extension-id',ID]);
  assert.equal(cmd.status,0,cmd.stderr);
  assert.equal(fs.statSync(root).mode&0o777,0o700);
  assert.equal(fs.statSync(path.join(root,'install.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(binary).mode&0o777,0o700);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifest,'utf8')).allowed_origins,[ORIGIN]);
  assert.ok(fs.readFileSync(binary,'utf8').includes('"$@"'));
  assert.equal(fs.readFileSync(oldDemo,'utf8'),'other native host preserved\n');
  cmd=invoke(['doctor']);
  assert.equal(cmd.status,1,'doctor without a live Chrome connection must not claim success');
  assert.equal(JSON.parse(cmd.stdout).local.installed,true);

  const wrong=spawn(binary,['chrome-extension://'+'b'.repeat(32)+'/'],{env,stdio:['pipe','pipe','pipe']});
  const wrongBytes=[];
  wrong.stdout.on('data',chunk=>wrongBytes.push(chunk));
  const denied=await onceExit(wrong);
  assert.notEqual(denied.code,0,'incorrect extension ID must be rejected');
  assert.equal(Buffer.concat(wrongBytes).length,0,'rejected origin writes no protocol frame');

  native=spawn(binary,[ORIGIN],{env,stdio:['pipe','pipe','pipe']});
  const decoder=new NativeDecoder(),queue=[],waiting=[];
  native.stdout.on('data',chunk=>{
    for(const value of decoder.push(chunk)){
      const resolve=waiting.shift();
      if(resolve)resolve(value);else queue.push(value);
    }
  });
  const read=()=>queue.length?Promise.resolve(queue.shift()):new Promise(resolve=>waiting.push(resolve));
  const first=await deadline(read(),6000,'missing framed hello');
  assert.deepEqual(first,{v:1,kind:'hello'});
  assert.equal(fs.statSync(sock).mode&0o777,0o600,'native Socket must be private');
  native.stdin.write(frame({v:1,kind:'welcome',extensionId:ID,extensionVersion:'0.1.0'}));
  await pause(200); // Native welcome has no acknowledgement; only a read-only status request follows.

  const client=spawn(process.execPath,['native-agent/cli.mjs','bridge.status','--request-id','macos-smoke-1'],{
    cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']
  });
  let stdout='',stderr='';
  client.stdout.on('data',chunk=>{stdout+=chunk;});
  client.stderr.on('data',chunk=>{stderr+=chunk;});
  const request=await deadline(read(),6000,'missing CLI forward');
  assert.equal(request.method,'bridge.status');
  assert.equal(request.requestId,'macos-smoke-1');
  assert.equal(request.v,1);
  native.stdin.write(frame({v:1,kind:'response',requestId:request.requestId,
    result:{extensionId:ID,bridgeVersion:1,nativeConnected:true,enabled:true,hostRegistrations:[]}}));
  const exit=await onceExit(client);
  assert.equal(exit.code,0,stderr);
  const reply=JSON.parse(stdout);
  assert.equal(reply.result.extensionId,ID);
  assert.equal(reply.requestId,'macos-smoke-1');

  const hostExit=onceExit(native);
  native.stdin.end();
  assert.equal((await hostExit).code,0);
  for(let index=0;index<50&&fs.existsSync(sock);index++)await pause(20);
  assert.equal(fs.existsSync(sock),false,'Host must unlink only its own socket');
  cmd=invoke(['cleanup']);
  assert.equal(cmd.status,0,cmd.stderr);
  assert.equal(fs.existsSync(manifest),false);
  assert.equal(fs.readFileSync(oldDemo,'utf8'),'other native host preserved\n');
  assert.equal(fs.existsSync(root),false,'cleanup removes own installation only');
});

test('macOS Chrome for Testing uses its own manifest and cannot replace Google Chrome registration',{
  skip:process.platform!=='darwin',
  timeout:15000
},async t=>{
  const home=fs.mkdtempSync('/private/tmp/opendesk-cft-test-');
  const env={...process.env,HOME:home};
  const cftManifest=path.join(home,'Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts',HOST_NAME+'.json');
  const chromeManifest=path.join(home,'Library/Application Support/Google/Chrome/NativeMessagingHosts',HOST_NAME+'.json');
  const root=path.join(home,'.opendesk-browser','native-agent-r1');
  const cli=args=>spawnSync(process.execPath,['native-agent/cli.mjs',...args],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:8000});
  let host;
  t.after(()=>{host?.kill('SIGKILL');fs.rmSync(home,{recursive:true,force:true});});
  fs.mkdirSync(path.dirname(chromeManifest),{recursive:true});
  fs.writeFileSync(chromeManifest,'{"other":"chrome host remains untouched"}\n');
  let output=cli(['setup','--browser','cft','--extension-id',ID]);
  assert.equal(output.status,0,output.stderr);
  assert.equal(JSON.parse(output.stdout).browser,'cft');
  assert.deepEqual(JSON.parse(fs.readFileSync(cftManifest,'utf8')).allowed_origins,[ORIGIN]);
  assert.equal(fs.readFileSync(chromeManifest,'utf8'),'{"other":"chrome host remains untouched"}\n');
  output=cli(['doctor']);
  assert.equal(JSON.parse(output.stdout).local.browser,'cft');
  assert.equal(JSON.parse(output.stdout).local.installed,true);
  const conflict=cli(['setup','--browser','chrome','--extension-id',ID]);
  assert.notEqual(conflict.status,0,'one installation may not silently change its Chrome variant');
  assert.match(conflict.stderr,/E_BROWSER_CONFLICT/);
  host=spawn(path.join(root,'native-host'),[ORIGIN],{env,stdio:['pipe','pipe','pipe']});
  const decoder=new NativeDecoder();
  const received=new Promise((resolve,reject)=>{
    host.stdout.on('data',chunk=>{
      try{const frames=decoder.push(chunk);if(frames.length)resolve(frames[0]);}
      catch(e){reject(e);}
    });
  });
  assert.deepEqual(await deadline(received,6000,'missing CFT Host hello'),{v:1,kind:'hello'});
  const finished=onceExit(host);
  host.stdin.end();
  assert.equal((await finished).code,0);
  for(let i=0;i<50&&fs.existsSync(path.join(root,'agent.sock'));i++)await pause(20);
  output=cli(['cleanup']);
  assert.equal(output.status,0,output.stderr);
  assert.equal(fs.existsSync(cftManifest),false);
  assert.equal(fs.readFileSync(chromeManifest,'utf8'),'{"other":"chrome host remains untouched"}\n');
});
