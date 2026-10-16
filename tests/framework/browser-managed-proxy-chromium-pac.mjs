// GitHub Linux Chrome for Testing: isolated browser + loopback SOCKS5 fixture.
// A = real SOCKS5/TLS fixture; B = real Chrome PAC API/readback and network.
// C is NOT TESTED: this is NOT the installed OpenDesk SDK/Side Panel/Host.
// No production proxy profile, user Chrome Profile, or commercial endpoint is touched.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {openProxyTunnel} from '../../examples/sidebar-tools/ai-vip-share/dev/local-test/proxy-line-probe.mjs';
import {compileManagedProxyPac} from '../../src/platform/chrome/browser-managed-proxy.js';

const chromeBinary=process.env.CHROME_FOR_TESTING_BIN;
assert(chromeBinary,'Pinned CHROME_FOR_TESTING_BIN required for mandatory Chrome A/B evidence');
// Ubuntu hosted Actions runners can deny Chromium's unprivileged namespace sandbox.
// Only the disposable, loopback-only, main-branch test fixture may opt into
// --no-sandbox. This exception is never exposed by shipped Host/SDK/Driver.
const allowIsolatedRunnerFallback=
 process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&
 process.env.GITHUB_REF==='refs/heads/main'&&
 ['push','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)&&
 process.env.OPENDESK_PROXY_AB_RUNNER==='github-hosted'&&
 process.env.OPENDESK_PROXY_AB_ALLOW_NO_SANDBOX==='yes';
if(process.env.OPENDESK_PROXY_AB_ALLOW_NO_SANDBOX==='yes')
 assert(allowIsolatedRunnerFallback,'Refusing unsandboxed Chrome outside trusted disposable GitHub main runner');
const target='ai.example.test',sub='sub.ai.example.test',lookalike='lookalike-ai.example.test';
const proxyHostname='pac-proxy.test',proxyPort=7897;
const root=await mkdtemp(join(tmpdir(),'opendesk-proxy-native-'));
const profile=join(root,'chrome-profile'),extension=join(root,'test-only-mv3');
const certPath=join(root,'cert.pem'),keyPath=join(root,'key.pem');
const output='artifacts/browser-managed-proxy-chromium-pac.json';
const forwarded=[],httpRequests=[],httpsRequests=[],sockets=new Set(),upgradeSockets=new Set();
const report={kind:'isolated-chromium-proxy-fixture',candidateSha:process.env.GITHUB_SHA||null,
 runId:process.env.GITHUB_RUN_ID||null,status:'FAIL',A:'NOT_TESTED',B:'NOT_TESTED',C:'NOT_TESTED',
 commercialProvider:'NOT_CONFIGURED',productionProfileOverride:false};
let httpServer,httpsServer,proxyServer,chrome,cdp,session,pacApplied=false;
let chromeArgs=[],chromeStderr='',chromeSpawnError=null,chromeLaunchedAt=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function listen(server,port=0){
 return new Promise((resolve,reject)=>{
  const bad=e=>{server.off('listening',good);reject(e);};
  const good=()=>{server.off('error',bad);resolve(server.address().port);};
  server.once('error',bad);server.once('listening',good);
  server.listen(port,'127.0.0.1');
 });
}
function socksFixture(httpPort,httpsPort){
 return net.createServer(client=>{
  sockets.add(client);client.on('close',()=>sockets.delete(client));
  client.on('error',()=>{});
  let buffer=Buffer.alloc(0),phase='greeting',upstream;
  client.on('data',chunk=>{
   if(phase==='tunnel'||phase==='connecting')return;
   buffer=Buffer.concat([buffer,chunk]);
   try{
    if(phase==='greeting'){
     if(buffer.length<2)return;
     const n=2+buffer[1];
     if(n>258)throw Error('SOCKS invalid methods');
     if(buffer.length<n)return;
     if(buffer[0]!==5||!buffer.subarray(2,n).includes(0))throw Error('SOCKS no-auth required');
     buffer=buffer.subarray(n);phase='connect';client.write(Buffer.from([5,0]));
    }
    if(phase==='connect'){
     if(buffer.length<5)return;
     const size=buffer[4],length=7+size;
     if(buffer[0]!==5||buffer[1]!==1||buffer[2]!==0||buffer[3]!==3||
        size<1||size>253)throw Error('SOCKS domain CONNECT required');
     if(buffer.length<length)return;
     const host=buffer.subarray(5,5+size).toString('ascii');
     const port=buffer.readUInt16BE(5+size);
     if(![target,sub].includes(host)||![httpPort,httpsPort].includes(port))
      throw Error('SOCKS refused unapproved test destination');
     forwarded.push({host,port});
     buffer=buffer.subarray(length);phase='connecting';
     upstream=net.connect({host:'127.0.0.1',port});
     sockets.add(upstream);upstream.on('close',()=>sockets.delete(upstream));
     upstream.on('error',()=>client.destroy());
     upstream.once('connect',()=>{
      if(client.destroyed)return upstream.destroy();
      client.write(Buffer.from([5,0,0,1,0,0,0,0,0,0]));
      phase='tunnel';client.pipe(upstream);upstream.pipe(client);
      if(buffer.length)upstream.write(buffer);
      buffer=Buffer.alloc(0);
     });
     client.on('close',()=>upstream.destroy());
    }
   }catch{client.destroy();upstream?.destroy();}
  });
 });
}
async function stopProxy(){
 for(const socket of sockets)socket.destroy();
 sockets.clear();
 if(proxyServer?.listening)await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('SOCKS fixture shutdown timeout')),5000);
  proxyServer.close(error=>{clearTimeout(timer);error?reject(error):resolve();});
 });
}
async function stopServer(server){
 if(!server?.listening)return;
 // Node HTTP closeAllConnections does NOT close upgraded WebSocket sockets.
 // Destroy and account for those connections before awaiting close callback.
 if(server===httpsServer){
  for(const socket of upgradeSockets)socket.destroy();
  upgradeSockets.clear();
 }
 server.closeAllConnections?.();
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('HTTP fixture shutdown timeout')),5000);
  server.close(error=>{clearTimeout(timer);error?reject(error):resolve();});
 });
}
async function waitFor(fn,label,timeout=30000){
 const start=Date.now();let last='';
 while(Date.now()-start<timeout){
  if(chromeSpawnError)throw Error('Chrome spawn failed before '+label+': '+chromeSpawnError);
  if(chrome&&(chrome.exitCode!==null||chrome.signalCode!==null))
   throw Error('Chrome exited before '+label+' exit='+chrome.exitCode+' signal='+chrome.signalCode);
  try{const value=await fn();if(value)return value;}catch(e){last=e.message;}
  await sleep(250);
 }
 throw Error('Timed out '+label+' '+last);
}
async function connectCdp(url){
 const socket=new WebSocket(url),waiters=new Map();let seq=0;
 await Promise.race([
  new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  }),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('CDP open timeout')),10000))
 ]);
 socket.addEventListener('message',event=>{
  let data;try{data=JSON.parse(event.data);}catch{return;}
  const w=waiters.get(data.id);if(!w)return;
  waiters.delete(data.id);clearTimeout(w.timer);
  if(data.error)w.reject(Error(data.error.message));else w.resolve(data.result??{});
 });
 socket.addEventListener('close',()=>{
  for(const w of waiters.values()){clearTimeout(w.timer);w.reject(Error('CDP closed'));}
  waiters.clear();
 });
 return {socket,send(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
   const id=++seq,timer=setTimeout(()=>{
    waiters.delete(id);reject(Error('CDP '+method+' timeout'));
   },15000);
   waiters.set(id,{resolve,reject,timer});
   try{socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}
   catch(e){waiters.delete(id);clearTimeout(timer);reject(e);}
  });
 }};
}
async function evaluate(expression){
 const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
 if(r.exceptionDetails||r.result?.subtype==='error')
  throw Error('Native MV3 exception: '+JSON.stringify(r.exceptionDetails||r.result).slice(0,500));
 return r.result?.value;
}
async function networkRequest(url){
 return evaluate('(async()=>{try{const r=await fetch('+JSON.stringify(url)+
  ',{cache:"no-store",redirect:"error"});return {ok:r.ok,status:r.status,body:await r.text()};}'+
  'catch(e){return {ok:false,error:String(e?.message||e)};}})()');
}
async function run(){
 await mkdir(profile);await mkdir(extension);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-subj','/CN='+target,'-addext','subjectAltName=DNS:'+target+',DNS:'+sub,
  '-keyout',keyPath,'-out',certPath,'-days','1'],{stdio:'ignore'});
 const cert=await readFile(certPath),key=await readFile(keyPath);
 httpServer=http.createServer((req,res)=>{
  httpRequests.push({host:req.headers.host,path:req.url});
  res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','connection':'close'});
  res.end('FIXTURE_HTTP_OK');
 });
 httpsServer=https.createServer({cert,key},(req,res)=>{
  httpsRequests.push({host:req.headers.host,path:req.url});
  res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','connection':'close'});
  res.end('FIXTURE_TLS_OK');
 });
 let upgrades=0;
 httpsServer.on('upgrade',(req,socket)=>{
  httpsRequests.push({host:req.headers.host,path:req.url,websocket:true});
  const key=req.headers['sec-websocket-key'];
  if(!key){socket.destroy();return;}
  const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+
    accept+'\r\n\r\n');
  upgrades++;
  upgradeSockets.add(socket);
  socket.on('close',()=>upgradeSockets.delete(socket));
  socket.on('error',()=>{});
 });
 const httpPort=await listen(httpServer),httpsPort=await listen(httpsServer);
 proxyServer=socksFixture(httpPort,httpsPort);
 await listen(proxyServer,proxyPort); // Collision FAILS; NEVER use a foreign 7897.
 const tunnel=await openProxyTunnel({kind:'socks5',proxyHost:'127.0.0.1',
  proxyPort,target,targetPort:httpsPort});
 const secure=tls.connect({socket:tunnel,servername:target,ca:cert,rejectUnauthorized:true});
 try{
  await Promise.race([
   new Promise((resolve,reject)=>{
    secure.once('secureConnect',resolve);secure.once('error',reject);
   }),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('SOCKS5 TLS timeout')),9000))
  ]);
  assert.equal(secure.authorized,true);
 }finally{secure.destroy();tunnel.destroy();}
 assert(forwarded.some(x=>x.host===target&&x.port===httpsPort));
 report.A='PASS';
 report.fixture={proxy:'127.0.0.1:'+proxyPort,transport:'SOCKS5',
  nodeTlsCertificateVerified:true,httpConnect:'NOT_SUPPORTED_BY_FIXTURE'};
 const pac=compileManagedProxyPac({
  endpoint:{scheme:'socks5',host:proxyHostname,port:proxyPort},domains:[target]
 },{toolId:'test-only',packageHash:'a'.repeat(64),installEpoch:'ci-isolated'});
 await writeFile(join(extension,'manifest.json'),JSON.stringify({
  manifest_version:3,name:'Temporary PAC network test only',version:'0.0.1',
  permissions:['proxy'],host_permissions:['<all_urls>'],background:{service_worker:'sw.js'}
 }));
 await writeFile(join(extension,'sw.js'),
  'chrome.runtime.onInstalled.addListener(()=>{});chrome.runtime.onStartup.addListener(()=>{});');
 const rules=[proxyHostname,target,sub,lookalike].map(h=>'MAP '+h+' 127.0.0.1').join(', ');
 chromeArgs=[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-sync',
  '--disable-background-networking','--remote-debugging-port=0',
  '--user-data-dir='+profile,'--disable-extensions-except='+extension,
  '--load-extension='+extension,'--host-resolver-rules='+rules,
  '--ignore-certificate-errors', // Isolated self-signed test certificate only.
  'about:blank'
 ];
 if(allowIsolatedRunnerFallback)chromeArgs.unshift('--no-sandbox');
 chromeLaunchedAt=Date.now();
 chrome=spawn(chromeBinary,chromeArgs,{stdio:['ignore','ignore','pipe']});
 chrome.on('error',error=>{chromeSpawnError=String(error);});
 chrome.stderr.on('data',part=>{chromeStderr=(chromeStderr+part.toString()).slice(-12000);});
 const [port,route]=await waitFor(async()=>{
  const p=await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
  const lines=p?.trim().split('\n');return lines?.length===2?lines:null;
 },'Chrome CDP port');
 cdp=await connectCdp('ws://127.0.0.1:'+port+route);
 const worker=await waitFor(async()=>{
  const all=(await cdp.send('Target.getTargets')).targetInfos||[];
  return all.find(x=>x.type==='service_worker'&&
    /^chrome-extension:\/\/[^/]+\/sw\.js$/.test(x.url));
 },'real test-only MV3 worker').catch(e=>{
  throw Error(e.message+' / Chrome stderr: '+chromeStderr.slice(-1300));
 });
 session=(await cdp.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
 await cdp.send('Runtime.enable',{},session);
 const before=await evaluate('(async()=>await chrome.proxy.settings.get({incognito:false}))()');
 assert.equal(before.levelOfControl,'controllable_by_this_extension');
 await evaluate('(async()=>{await chrome.proxy.settings.set({scope:"regular",value:'+
  '{mode:"pac_script",pacScript:{data:'+JSON.stringify(pac)+
  ',mandatory:true}}});return true;})()');
 pacApplied=true;
 const native=await evaluate('(async()=>await chrome.proxy.settings.get({incognito:false}))()');
 assert.equal(native.levelOfControl,'controlled_by_this_extension');
 assert.equal(native.value?.mode,'pac_script');
 assert.equal(native.value?.pacScript?.data,pac,'Chrome native PAC must equal production compiler bytes');
 const httpResult=await networkRequest('http://'+target+':'+httpPort+'/proxied-http');
 assert.equal(httpResult.body,'FIXTURE_HTTP_OK',JSON.stringify(httpResult));
 assert(forwarded.some(x=>x.host===target&&x.port===httpPort));
 const subResult=await networkRequest('http://'+sub+':'+httpPort+'/subdomain');
 assert.equal(subResult.body,'FIXTURE_HTTP_OK',JSON.stringify(subResult));
 assert(forwarded.some(x=>x.host===sub&&x.port===httpPort));
 const beforeLookalike=forwarded.length;
 const lookalikeResult=await networkRequest('http://'+lookalike+':'+httpPort+'/direct');
 assert.equal(lookalikeResult.body,'FIXTURE_HTTP_OK',JSON.stringify(lookalikeResult));
 assert.equal(forwarded.length,beforeLookalike,'lookalike must not match PAC');
 const tlsResult=await networkRequest('https://'+target+':'+httpsPort+'/proxied-tls');
 assert.equal(tlsResult.body,'FIXTURE_TLS_OK',JSON.stringify(tlsResult));
 assert(forwarded.some(x=>x.host===target&&x.port===httpsPort));
 const beforeWebSocketProxy=forwarded.length;
 const websocket=await evaluate('(async()=>new Promise(resolve=>{'+
  'if(typeof WebSocket!=="function")return resolve({supported:false});'+
  'const ws=new WebSocket("wss://'+target+':'+httpsPort+'/wss");'+
  'const timer=setTimeout(()=>{ws.close();resolve({supported:true,ok:false});},8000);'+
  'ws.onopen=()=>{clearTimeout(timer);ws.close();resolve({supported:true,ok:true});};'+
  'ws.onerror=()=>{clearTimeout(timer);resolve({supported:true,ok:false});};'+
  '}))()');
 if(websocket.supported){
  assert.equal(websocket.ok,true);
  assert(upgrades>0,'WSS handshake never reached the local TLS endpoint');
  assert(forwarded.slice(beforeWebSocketProxy).some(x=>x.host===target&&x.port===httpsPort),
    'WSS succeeded without a corresponding SOCKS5 CONNECT; possible DIRECT bypass');
 }
 await stopProxy();
 const failedHttp=await networkRequest('http://'+target+':'+httpPort+'/outage-http');
 const failedTls=await networkRequest('https://'+target+':'+httpsPort+'/outage-tls');
 assert.equal(failedHttp.ok,false,'HTTP must fail closed with proxy unavailable');
 assert.equal(failedTls.ok,false,'HTTPS must fail closed with proxy unavailable');
 assert(!httpRequests.some(x=>x.path==='/outage-http'),'HTTP DIRECT fallback detected');
 assert(!httpsRequests.some(x=>x.path==='/outage-tls'),'HTTPS DIRECT fallback detected');
 if(websocket.supported){
  const outage=await evaluate('(async()=>new Promise(resolve=>{'+
   'const ws=new WebSocket("wss://'+target+':'+httpsPort+'/outage-wss");'+
   'const timer=setTimeout(()=>{ws.close();resolve("timeout");},6000);'+
   'ws.onopen=()=>{clearTimeout(timer);ws.close();resolve("UNSAFE_DIRECT");};'+
   'ws.onerror=()=>{clearTimeout(timer);resolve("failed");};'+
   '}))()');
  assert.notEqual(outage,'UNSAFE_DIRECT','WSS DIRECT fallback detected');
  assert(!httpsRequests.some(x=>x.path==='/outage-wss'));
 }
 report.B='PASS';
 report.chromium={product:(await cdp.send('Browser.getVersion')).product,
  extensionId:worker.url.split('/')[2],
  pacSha256:createHash('sha256').update(pac).digest('hex'),
  proxyOwnerReadback:native.levelOfControl,
  forwarded,lookalikeDirect:true,httpFailClosed:true,httpsFailClosed:true,
  websocket:websocket.supported?'PASS':'NOT_SUPPORTED',
  selfSignedCertificateException:'DISPOSABLE_TEST_PROFILE_ONLY'};
 report.status='A_B_PASS';
}
let failure;
try{await run();}catch(e){failure=e;report.error=String(e?.stack||e).slice(0,1800);}
finally{
 if(pacApplied&&session&&cdp){
  try{
   const after=await evaluate('(async()=>{await chrome.proxy.settings.clear({scope:"regular"});'+
    'return chrome.proxy.settings.get({incognito:false});})()');
   if(after?.levelOfControl!=='controllable_by_this_extension')
    throw Error('Native Chrome PAC release unverified');
   report.release='PASS';
  }catch(e){report.release='FAIL';report.releaseError=String(e);failure??=e;}
 }else report.release='NOT_APPLIED';
 if(failure)report.status='FAIL';
 report.chromeLaunch={
  binary:chromeBinary,args:chromeArgs,
  sandboxMode:allowIsolatedRunnerFallback?'ISOLATED_HOSTED_RUNNER_FALLBACK':'DEFAULT_CHROMIUM',
  elapsedMs:chromeLaunchedAt===null?null:Date.now()-chromeLaunchedAt,
  pid:chrome?.pid??null,exitCode:chrome?.exitCode??null,
  signalCode:chrome?.signalCode??null,
  spawnError:chromeSpawnError,stderr:chromeStderr,
  devToolsActivePortPresent:Boolean(await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>null))
 };
 cdp?.socket.close();
 if(chrome?.exitCode===null&&chrome?.signalCode===null){
  chrome.kill('SIGTERM');await sleep(350);
  if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');
 }
 const cleanupErrors=[];
 for(const [name,cleanup] of [
  ['socks',()=>stopProxy()],['http',()=>stopServer(httpServer)],
  ['https-websocket',()=>stopServer(httpsServer)],
  ['profile',()=>rm(root,{recursive:true,force:true})]
 ])try{await cleanup();}catch(e){cleanupErrors.push({name,error:String(e)});}
 if(cleanupErrors.length){
  report.cleanup={status:'FAIL',errors:cleanupErrors};
  failure??=Error('Isolated browser fixture cleanup failed');
  report.status='FAIL';
 }else report.cleanup={status:'PASS',upgradedWebSocketsRemaining:upgradeSockets.size};
 await mkdir('artifacts',{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
if(failure){
 console.error('MANAGED_PROXY_CHROME_DIAGNOSTICS '+JSON.stringify(report.chromeLaunch));
 console.error('MANAGED_PROXY_NATIVE_AB_FAIL '+report.error);
 throw failure;
}
console.log('MANAGED_PROXY_NATIVE_AB='+report.status+' '+output);
