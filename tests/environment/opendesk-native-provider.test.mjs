import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {NativeDecoder, frame, HOST_NAME} from '../../native-agent/wire.mjs';

// Runs only when an actual built OpenDesk binary is supplied by CI or a
// maintainer. The simulated Chrome frames do NOT count as real Chrome E2E.
const binary = process.env.OPENDESK_BROWSER_BINARY;
const applicable = !!binary && ['darwin', 'linux'].includes(process.platform);
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const origin = 'chrome-extension://' + extensionId + '/';

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
  timeout: 30000
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
  assert.deepEqual(await bounded(messages.next(),'native hello'),{v:1,kind:'hello'});
  assert.equal(fs.statSync(path.join(root,'agent.sock')).mode & 0o777,0o600);
  host.stdin.write(frame({v:1,kind:'welcome',extensionId,extensionVersion:'0.1.0',localDevVersion:1}));
  await pause(100);

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

  const done=exited(host);
  host.stdin.end();
  assert.equal((await bounded(done,'host EOF')).code,0);
  host=null;
  for(let i=0;i<40 && fs.existsSync(path.join(root,'agent.sock'));i++) await pause(25);
  assert.equal(fs.existsSync(path.join(root,'agent.sock')),false);
  result=command(['cleanup']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(process.platform==='darwin'?manifestPath:linuxManifest),false);
});
