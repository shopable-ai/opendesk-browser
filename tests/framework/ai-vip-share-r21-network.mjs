// Raw Chrome/PAC fixture only: no OpenDesk installation, grant, SDK or Native ack.
// Mutations of proxy settings are confined to trusted native fixture button events.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import crypto from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(root, 'docs/framework/workstreams/evidence/ai-vip-share-r21-01a13df4/network');
const launcherPath = '/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/launch.py';
const checkerPath = path.join(path.dirname(launcherPath), 'check_instance.py');
const binary = path.join(root, 'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const runDir = path.join(evidence, new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex'));
fs.mkdirSync(runDir, {recursive:true});
const write = (name, data) => fs.writeFileSync(path.join(runDir, name), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toISOString();
const report = {status:'IN_PROGRESS', startedAt:now(), layer:'RAW_CHROME_PAC_FIXTURE', cases:[],
  layers:{rawChromePac:'IN_PROGRESS', toolInstallation:'NOT_TESTED', publicManagedProxySdk:'NOT_TESTED',
    providerActivation:'NOT_TESTED', productSenderGrant:'NOT_TESTED', nativeAck:'NOT_TESTED',
    dailyDevelopment:'NOT_TESTED', productionCandidate:'NOT_TESTED', F3:'NOT_TESTED', ZIP:'NOT_TESTED'},
  limitations:['R11 has no approved public Managed Proxy API.',
    'Minimal fixture extension is the real sender; no product sender or receipt is simulated.',
    'Explicit test hostname mappings and generated certificate SPKI exception apply to this fresh profile only.',
    'All relay destinations are local; external provider, public DNS, production TLS and authenticated proxy are NOT_TESTED.'],
  ownership:{files:['tests/framework/ai-vip-share-r21-network.mjs', path.relative(root,evidence)],
    excludedPids:[34706,43356,66752], excludedPorts:[43111,43119,43120], sharedHelpers:'READ_ONLY', dist:'UNTOUCHED'}};
const log = (name, row) => fs.appendFileSync(path.join(runDir, name+'.jsonl'), JSON.stringify({at:now(),...row})+'\n');
let launcher, metadata, browser, fixture, target, nativeHelper, origin;
const sessions = [], relays = [], originRows = [], relayRows = [], ownedSockets = new Set();
const markSocket = socket => {ownedSockets.add(socket); socket.on('error',()=>{}); socket.once('close',()=>ownedSockets.delete(socket)); return socket;};
async function until(fn,label,ms=15000) {
  const end=Date.now()+ms; let last;
  while(Date.now()<end) {try {const v=await fn(); if(v)return v;}catch(e){last=e;} await sleep(70);}
  throw Error(label+' timed out'+(last?': '+last.message:''));
}
async function cdp(url,label) {
  const ws=new WebSocket(url), pending=new Map(), events=[]; let serial=0;
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message', event=>{
    const row=JSON.parse(String(event.data));
    if(row.id) {const p=pending.get(row.id);if(p){pending.delete(row.id);clearTimeout(p.timer);row.error?p.reject(Error(JSON.stringify(row.error))):p.resolve(row.result);}}
    else if(row.method?.startsWith('Network.')) {events.push(row);log('cdp-network',{surface:label,...row});}
  });
  ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(label+' disconnected'));}pending.clear();});
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},20000);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
  const read=async expression=>{
    const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result?.value;
  };
  const session={call,read,events,close:()=>ws.close()};sessions.push(session);return session;
}
async function listen(server) {server.on('connection',markSocket);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return server.address().port;}
async function closeRelay(relay) {
  if(!relay.server.listening)return;
  const closed=new Promise(resolve=>relay.server.close(resolve));
  for(const s of relay.sockets)s.destroy();
  await closed; log('relay',{kind:'relay-stopped',scheme:relay.scheme,port:relay.port});
}
async function newPage(url,label) {
  const {targetId}=await browser.call('Target.createTarget',{url:'about:blank'});
  const row=await until(async()=> (await (await fetch(report.cdpBase+'/json/list')).json()).find(r=>r.id===targetId),label+' target');
  const session=await cdp(row.webSocketDebuggerUrl,label);await session.call('Page.enable');
  if(url!=='about:blank')await session.call('Page.navigate',{url});return {session,targetId};
}
function input(command,value) {
  execFileSync('/usr/bin/python3',[checkerPath,path.join(runDir,'launcher.json')],{timeout:10000});
  const output=execFileSync(nativeHelper,[String(metadata.pid),command,...(value?[value]:[])],{encoding:'utf8',timeout:12000});
  log('native-input',{pid:metadata.pid,command,value,output});
}
async function button(id) {
  await browser.call('Target.activateTarget',{targetId:fixture.targetId}); input('activate');
  await until(()=>fixture.session.read('document.readyState === "complete"'),'fixture ready');
  let focused=false;
  for(let i=0;i<9;i++) {
    if(await fixture.session.read('document.activeElement?.id === '+JSON.stringify(id))){focused=true;break;}
    input('key','tab');
  }
  assert(focused,'Native Tab did not focus '+id);
  const before=await fixture.session.read('window.fixtureEvents.length');input('key','return');
  const event=await until(()=>fixture.session.read('window.fixtureEvents['+before+'] || null'),id+' native handler');
  log('fixture-events',event);assert.equal(event.trusted,true);assert.equal(event.userActivation,true);
  assert.equal(event.status,'OK',JSON.stringify(event));return event;
}
async function check(name,fn) {
  const row={name,startedAt:now()};report.cases.push(row);
  try {Object.assign(row,await fn(),{status:'PASS'});}catch(e){Object.assign(row,{status:'FAIL',error:e.stack||String(e)});}
  row.finishedAt=now();write('report.json',report);console.log(row.status+' '+name+(row.error?' '+row.error.split('\n')[0]:''));return row;
}
async function navigate(host,pathname,expectedRoute,scheme) {
  const nonce=crypto.randomUUID(), url='https://'+host+':'+report.originPort+pathname+(pathname.includes('?')?'&':'?')+'case='+nonce;
  const start=target.session.events.length, before=originRows.length;
  const result=await target.session.call('Page.navigate',{url});
  if(expectedRoute==='FAIL_CLOSED') {
    await until(()=>result.errorText || target.session.events.slice(start).find(e=>e.method==='Network.loadingFailed'&&e.params.type==='Document'),'proxy failure',12000);
    await sleep(500);
    const failure=result.errorText||target.session.events.slice(start).find(e=>e.method==='Network.loadingFailed'&&e.params.type==='Document')?.params.errorText;
    assert.match(failure,/ERR_(?:PROXY|SOCKS|TUNNEL|CONNECTION)/);
    assert.equal(originRows.slice(before).filter(r=>r.url.includes(nonce)).length,0,'No direct fallback origin request');
    return {url,nonce,navigation:result,failure,originHits:0,observedForMs:500};
  }
  assert(!result.errorText,JSON.stringify(result));
  const observed=await until(()=>target.session.read('(()=>{try{return JSON.parse(document.body.innerText)}catch{return null}})()').then(r=>r?.nonce===nonce?r:null),'origin response '+host);
  const hit=originRows.find(r=>r.nonce===nonce);assert(hit,'Origin log must include nonce');
  const tunnel=relayRows.find(r=>r.upstreamLocalPort===hit.remotePort&&r.scheme===scheme&&r.connected);
  if(expectedRoute==='PROXY') {assert(tunnel,'Origin connection must match real relay upstream port');assert.equal(tunnel.host.toLowerCase().replace(/\.$/,''),host.toLowerCase().replace(/\.$/,''));}
  else assert(!relayRows.some(r=>r.upstreamLocalPort===hit.remotePort&&r.connected),'Direct request must bypass both relays');
  assert.equal(observed.host,host.toLowerCase()+':'+report.originPort);
  // One small screenshot per scheme route; logs remain the routing authority.
  if(!fs.existsSync(path.join(runDir,scheme+'-'+expectedRoute+'.png'))) {
    const shot=await target.session.call('Page.captureScreenshot',{format:'png'});
    write(scheme+'-'+expectedRoute+'.png',Buffer.from(shot.data,'base64'));
  }
  return {url,nonce,route:expectedRoute,origin:hit,relay:tunnel||null};
}

try {
  assert.equal(process.platform,'darwin','This test requires owned macOS native keyboard input');
  assert.equal(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),'main');
  report.sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  write('system-proxy-readonly.txt',execFileSync('/usr/sbin/scutil',['--proxy'],{encoding:'utf8'}));
  write('driver-source.mjs',fs.readFileSync(fileURLToPath(import.meta.url)));
  report.driverSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));
  const policyPath=path.join(root,'src/ai-smart-access/policy.js'), policyBytes=fs.readFileSync(policyPath);
  report.policy={path:policyPath,sha256:sha(policyBytes)};write('policy-source.js',policyBytes);
  const policy=await import('data:text/javascript;base64,'+policyBytes.toString('base64'));
  const hosts=[...policy.AI_DOMAINS,...policy.AI_DOMAINS.map(h=>'sub.'+h),'ordinary.network.test',
    'chatgpt.com.evil.test','evilchatgpt.com','notopenai.com','claude.ai.evil.test','gemini.google.com.evil.test','perplexity.ai.evil.test'];
  const relayHost='relay.ai-network.example', known=new Set([...hosts,relayHost]);
  const keyPath=path.join(runDir,'ephemeral-key.pem'),certPath=path.join(runDir,'certificate.pem');
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=AI network fixture'],{stdio:'pipe',timeout:15000});
  const tlsOptions={key:fs.readFileSync(keyPath),cert:fs.readFileSync(certPath),ALPNProtocols:['http/1.1']};
  const certificate=new crypto.X509Certificate(tlsOptions.cert);
  const spki=crypto.createHash('sha256').update(certificate.publicKey.export({type:'spki',format:'der'})).digest('base64');
  report.certificate={sha256:sha(tlsOptions.cert),spki,restriction:'Only this generated key is exempted in the fresh fixture profile; certificate trust/hostname validity NOT_TESTED.'};
  origin=https.createServer(tlsOptions,(req,res)=>{
    const nonce=new URL(req.url,'https://fixture.test').searchParams.get('case');
    const row={nonce,host:req.headers.host,url:req.url,remotePort:req.socket.remotePort,localPort:req.socket.localPort,tlsProtocol:req.socket.getProtocol()};
    originRows.push(row);log('origin',row);
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Connection':'close'});res.end(JSON.stringify(row));
  });
  report.originPort=await listen(origin);
  function connectUpstream(row,client,head,ready,sockets) {
    const host=row.host.toLowerCase().replace(/\.$/,'');
    if(!known.has(host)||row.port!==report.originPort){row.denied=true;log('relay',row);client.destroy();return;}
    const upstream=markSocket(net.connect({host:'127.0.0.1',port:report.originPort}));sockets.add(upstream);
    upstream.once('connect',()=>{
      row.connected=true;row.upstreamLocalPort=upstream.localPort;row.connectedAt=now();relayRows.push(row);log('relay',row);
      ready();if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);
    });
    const close=()=>{client.destroy();upstream.destroy();sockets.delete(client);sockets.delete(upstream);};
    upstream.once('error',e=>{log('relay',{...row,error:e.message});close();});client.once('error',close);client.once('close',close);upstream.once('close',close);
  }
  const httpsSockets=new Set();
  const secureRelay=https.createServer(tlsOptions,(req,res)=>{log('relay',{scheme:'https',deniedMethod:req.method,url:req.url});res.writeHead(405);res.end();});
  secureRelay.on('connection',s=>httpsSockets.add(s));secureRelay.on('secureConnection',s=>httpsSockets.add(s));
  secureRelay.on('connect',(req,socket,head)=>{
    httpsSockets.add(socket);const match=req.url.match(/^([^:]+):(\d+)$/);
    if(!match){socket.destroy();return;}
    connectUpstream({scheme:'https',method:'CONNECT',authority:req.url,host:match[1],port:Number(match[2]),tlsProtocol:socket.getProtocol()},socket,head,()=>socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'),httpsSockets);
  });
  const httpsPort=await listen(secureRelay);relays.push({scheme:'https',server:secureRelay,sockets:httpsSockets,port:httpsPort});
  const socksSockets=new Set();
  const socksRelay=net.createServer(socket=>{
    socksSockets.add(socket);let buf=Buffer.alloc(0),stage=0;
    const data=bytes=>{
      buf=Buffer.concat([buf,bytes]);
      if(stage===0){if(buf.length<2||buf.length<2+buf[1])return;if(buf[0]!==5||!buf.subarray(2,2+buf[1]).includes(0)){socket.destroy();return;}buf=buf.subarray(2+buf[1]);socket.write(Buffer.from([5,0]));stage=1;}
      if(stage===1){
        if(buf.length<5)return;let length,host;
        if(buf[3]===3){length=7+buf[4];if(buf.length<length)return;host=buf.subarray(5,5+buf[4]).toString();}
        else if(buf[3]===1){length=10;if(buf.length<length)return;host=[...buf.subarray(4,8)].join('.');}
        else {log('relay',{scheme:'socks5',error:'unsupported-address-type',type:buf[3]});socket.destroy();return;}
        if(buf[0]!==5||buf[1]!==1){socket.destroy();return;}
        const port=buf.readUInt16BE(length-2),head=buf.subarray(length);stage=2;socket.off('data',data);
        connectUpstream({scheme:'socks5',method:'CONNECT',host,port,addressType:buf[3]},socket,head,()=>socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,0])),socksSockets);
      }
    };socket.on('data',data);
  });
  const socksPort=await listen(socksRelay);relays.push({scheme:'socks5',server:socksRelay,sockets:socksSockets,port:socksPort});
  const endpoints={socks5:{scheme:'socks5',host:relayHost,port:socksPort},https:{scheme:'https',host:relayHost,port:httpsPort}};
  report.endpoints=endpoints;report.pacs={};
  for(const [scheme,endpoint] of Object.entries(endpoints)) {
    const pac=policy.compileAiPac(endpoint),desired=policy.desiredAiProxy(endpoint);
    assert.equal(desired.pacScript.data,pac);assert.equal(desired.pacScript.mandatory,true);
    report.pacs[scheme]={sha256:sha(pac),desired};write(scheme+'.pac',pac);
  }
  const extension=path.join(runDir,'fixture');fs.mkdirSync(extension);
  const {publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const key=publicKey.export({type:'spki',format:'der'});
  report.extensionId=sha(key).slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
  const files={
    'manifest.json':JSON.stringify({manifest_version:3,name:'R21 isolated PAC network fixture',version:'1.0.0',key:key.toString('base64'),permissions:['proxy']}),
    'policy.js':policyBytes,
    'fixture.html':'<!doctype html><meta charset="utf-8"><title>R21 raw PAC fixture</title><h1>Isolated network fixture</h1><p>Fixture sender, no OpenDesk install/SDK/grant.</p><button id="socks5" autofocus>Enable SOCKS5</button> <button id="https">Enable HTTPS</button> <button id="stop">STOP clear</button><pre id="status"></pre><script type="module" src="fixture.js"></script>',
    'fixture.js':`import {compileAiPac,desiredAiProxy} from './policy.js';
const endpoints=${JSON.stringify(endpoints)};
window.fixtureEvents=[];
const get=()=>new Promise(resolve=>chrome.proxy.settings.get({incognito:false},resolve));
window.fixtureBaseline=await get();
for(const id of ['socks5','https','stop'])document.getElementById(id).addEventListener('click',async event=>{
  const row={id,eventType:event.type,trusted:event.isTrusted,userActivation:navigator.userActivation.isActive,at:new Date().toISOString(),sender:chrome.runtime.id};
  if(!event.isTrusted||!row.userActivation){row.status='REJECTED';window.fixtureEvents.push(row);return;}
  try{
    row.api=id==='stop'?'chrome.proxy.settings.clear':'chrome.proxy.settings.set';
    row.request=id==='stop'?{scope:'regular'}:{value:desiredAiProxy(endpoints[id]),scope:'regular'};
    if(id!=='stop'&&row.request.value.pacScript.data!==compileAiPac(endpoints[id]))throw Error('PAC mismatch');
    await new Promise((resolve,reject)=>chrome.proxy.settings[id==='stop'?'clear':'set'](row.request,()=>{const e=chrome.runtime.lastError;e?reject(Error(e.message)):resolve();}));
    row.readback=await get();row.status='OK';
  }catch(e){row.status='ERROR';row.error=e.message;}
  window.fixtureEvents.push(row);document.getElementById('status').textContent=JSON.stringify(row,null,2);
});`
  };
  report.fixture={directory:extension,files:{},permission:['proxy'],mutations:'Trusted click listener only; STOP uses clear({scope:regular}); no global DIRECT set.'};
  for(const [name,bytes] of Object.entries(files)){fs.writeFileSync(path.join(extension,name),bytes);report.fixture.files[name]={bytes:Buffer.byteLength(bytes),sha256:sha(bytes)};}
  const helperSource=path.join(root,'tests/framework/time-review-native-input.swift');nativeHelper=path.join(runDir,'native-input');
  report.nativeHelper={source:helperSource,sha256:sha(fs.readFileSync(helperSource))};
  execFileSync('/usr/bin/swiftc',[helperSource,'-o',nativeHelper],{stdio:'pipe',timeout:60000});
  const mappings=[...known].map(h=>'MAP '+h+' 127.0.0.1').join(',');
  const args=[launcherPath,'--executable',binary,'--report',path.join(runDir,'launcher.json'),
    '--remote-debugging-port=0','--load-extension='+extension,'--disable-extensions-except='+extension,
    '--host-resolver-rules='+mappings,'--ignore-certificate-errors-spki-list='+spki,
    '--disable-features=HttpsUpgrades','--disable-quic','--disable-component-update','--disable-sync',
    '--log-net-log='+path.join(runDir,'chrome-netlog.json'),'--window-size=1100,800','about:blank'];
  report.launcher={path:launcherPath,sha256:sha(fs.readFileSync(launcherPath)),args};
  launcher=spawn('/usr/bin/python3',args,{cwd:root,stdio:['ignore','pipe','pipe']});
  launcher.stdout.on('data',b=>fs.appendFileSync(path.join(runDir,'launcher-stdout.log'),b));
  launcher.stderr.on('data',b=>fs.appendFileSync(path.join(runDir,'launcher-stderr.log'),b));
  launcher.on('error',e=>{report.launcher.error=e.message;});
  metadata=await until(()=>{try{return JSON.parse(fs.readFileSync(path.join(runDir,'launcher.json')));}catch{return null;}},'launcher report');
  assert(!report.ownership.excludedPids.includes(metadata.pid));assert(metadata.args.includes('--use-mock-keychain'));
  assert(metadata.args.includes('--password-store=basic'));assert(path.basename(metadata.profile).startsWith('codex-cft-'));
  assert.equal(fs.statSync(metadata.profile).mode&0o777,0o700);
  report.actualProcess=execFileSync('/bin/ps',['-p',String(metadata.pid),'-ww','-o','pid=,ppid=,command='],{encoding:'utf8'}).trim();
  assert(report.actualProcess.includes('--use-mock-keychain')&&report.actualProcess.includes('--user-data-dir='+metadata.profile));
  report.instanceCheck=execFileSync('/usr/bin/python3',[checkerPath,path.join(runDir,'launcher.json')],{encoding:'utf8'});
  const endpoint=await until(()=>{try{const [port,route]=fs.readFileSync(path.join(metadata.profile,'DevToolsActivePort'),'utf8').trim().split('\n');return {port,route};}catch{return null;}},'DevTools');
  report.cdpBase='http://127.0.0.1:'+endpoint.port;
  browser=await cdp('ws://127.0.0.1:'+endpoint.port+endpoint.route,'browser');report.chromeVersion=await browser.call('Browser.getVersion');
  fixture=await newPage('chrome-extension://'+report.extensionId+'/fixture.html','fixture');
  report.actualFixtureSender=await until(()=>fixture.session.read('typeof chrome !== "undefined" && chrome.runtime?.id'),'fixture sender');
  assert.equal(report.actualFixtureSender,report.extensionId);
  report.baseline=await until(()=>fixture.session.read('window.fixtureBaseline'),'proxy baseline');
  target=await newPage('about:blank','network-target');await target.session.call('Network.enable');await target.session.call('Network.setCacheDisabled',{cacheDisabled:true});
  for(const scheme of ['socks5','https']) {
    const enabled=await check(scheme+' trusted enable and exact PAC readback',async()=>{
      const event=await button(scheme);assert.deepEqual(event.readback.value,report.pacs[scheme].desired);assert.equal(event.sender,report.extensionId);return {event};
    });
    if(enabled.status==='PASS') {
      for(const host of hosts) await check(scheme+' route '+host,()=>navigate(host,
        host==='ordinary.network.test'?'/chatgpt.com/claude.ai?next=https%3A%2F%2Fopenai.com':'/path/ordinary?next=ordinary.test',
        policy.AI_DOMAINS.some(d=>host===d||host.endsWith('.'+d))?'PROXY':'DIRECT',scheme));
      await closeRelay(relays.find(r=>r.scheme===scheme));
      await check(scheme+' relay offline has no direct fallback',()=>navigate('chatgpt.com','/offline-probe','FAIL_CLOSED',scheme));
    }
    const cleared=await check(scheme+' STOP clear restores prior setting',async()=>{
      const event=await button('stop');assert.equal(event.api,'chrome.proxy.settings.clear');assert.deepEqual(event.request,{scope:'regular'});
      assert.deepEqual(event.readback.value,report.baseline.value);assert.notEqual(event.readback.levelOfControl,'controlled_by_this_extension');return {event,baseline:report.baseline};
    });
    // clear relinquishes ownership. The inherited system may itself have a proxy;
    // a direct-network assertion would contradict clear semantics and could use
    // a non-owned system proxy. Do not send a request through that external path.
    if(cleared.status==='PASS')report[scheme+'AfterClearNetwork']={status:'NOT_TESTED',
      reason:'Inherited system routing is outside the controlled relay. Exact prior value restored; no global DIRECT is installed.'};
  }
  report.policy.sha256After=sha(fs.readFileSync(policyPath));report.policy.unchanged=report.policy.sha256===report.policy.sha256After;
  assert(report.policy.unchanged,'Policy drift: results bind to copied policy, current-source claim invalid');
  report.status=report.cases.every(r=>r.status==='PASS')?'PASS':'PARTIAL';
} catch(error) {report.status='FAIL';report.fatal=error.stack||String(error);console.error(report.fatal);}
finally {
  report.cleanup={startedAt:now()};
  if(fixture)try {
    const state=await fixture.session.read('new Promise(r=>chrome.proxy.settings.get({incognito:false},r))');
    if(state?.levelOfControl==='controlled_by_this_extension')report.cleanup.clearEvent=await button('stop');
    report.cleanup.finalProxy=await fixture.session.read('new Promise(r=>chrome.proxy.settings.get({incognito:false},r))');
  }catch(e){report.cleanup.clearError=e.message;}
  if(metadata?.log)try{write('chrome.log',fs.readFileSync(metadata.log));}catch{}
  if(browser)try{await browser.call('Browser.close');}catch{}
  for(const s of sessions)s.close();
  if(launcher) {
    await until(()=>launcher.exitCode!==null||launcher.signalCode!==null,'launcher exit',5000).catch(()=>launcher.kill('SIGTERM'));
    await until(()=>launcher.exitCode!==null||launcher.signalCode!==null,'launcher cleanup',12000).catch(e=>{report.cleanup.launcherError=e.message;});
    report.cleanup.launcherExitCode=launcher.exitCode;report.cleanup.launcherSignal=launcher.signalCode;
  }
  for(const relay of relays)try{await closeRelay(relay);}catch(e){report.cleanup.relayError=e.message;}
  for(const socket of ownedSockets)socket.destroy();
  if(origin?.listening)await new Promise(resolve=>origin.close(resolve));
  if(metadata){report.cleanup.profileRemoved=!fs.existsSync(metadata.profile);try{process.kill(metadata.pid,0);report.cleanup.browserGone=false;}catch{report.cleanup.browserGone=true;}}
  const privateKey=path.join(runDir,'ephemeral-key.pem');if(fs.existsSync(privateKey))fs.unlinkSync(privateKey);
  report.cleanup.privateKeyRemoved=!fs.existsSync(privateKey);report.cleanup.remainingOwnedSockets=ownedSockets.size;
  report.cleanup.finishedAt=now();report.finishedAt=now();
  if(report.cleanup.profileRemoved===false||report.cleanup.browserGone===false)report.status='PARTIAL';
  report.layers.rawChromePac=report.status;
  write('report.json',report);
  const artifacts={};
  function manifest(dir,prefix=''){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(item.name==='artifacts.json')continue;const name=prefix+item.name,full=path.join(dir,item.name);if(item.isDirectory())manifest(full,name+'/');else artifacts[name]={bytes:fs.statSync(full).size,sha256:sha(fs.readFileSync(full))};}}
  manifest(runDir);write('artifacts.json',artifacts);
  console.log(JSON.stringify({status:report.status,passed:report.cases.filter(r=>r.status==='PASS').length,total:report.cases.length,report:path.join(runDir,'report.json'),cleanup:report.cleanup}));
  process.exitCode=report.status==='PASS'?0:1;
}
