import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,rm,mkdtemp} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import webpack from 'webpack';
import {createBuiltinResourceManifest,verifyBuiltinResourceManifest} from '../../scripts/verify-package.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const binary=process.env.CHROME_FOR_TESTING_BIN;
const pageProof=process.env.OPENDESK_NATIVE_PAGE_LIBS==='1';
if(!binary)throw new Error('CHROME_FOR_TESTING_BIN is required');
const expectedBody='<div>中😀</div>'.repeat(9000);
// Native Chrome form fixture is above the long HTML body to satisfy the
// existing explicit in-viewport actionability rule without implicit scrolling.
const r13Form = `<form id="r13-form">
  <label for="r13-keyword">关键词</label>
  <input id="r13-keyword" type="search" placeholder="输入关键词" value="旧值">
  <input id="r13-consent" type="checkbox" aria-label="同意">
  <select id="r13-region"><option value="a">甲</option><option value="b">乙</option></select>
  <button type="button" id="r13-submit" title="搜索">搜索</button>
  <button type="button" id="r13-duplicate">搜索</button>
  <output id="r13-out" role="status"></output>
  <img alt="R13图标">
</form>
<script>
  const input=document.getElementById('r13-keyword');
  function install(button) {
    button.addEventListener('click',()=>{
      const output=document.getElementById('r13-out');
      output.textContent='RESULT:'+input.value;
      output.dataset.clicks=String(Number(output.dataset.clicks||0)+1);
    });
  }
  install(document.getElementById('r13-submit'));
  input.addEventListener('input',()=>{
    const old=document.getElementById('r13-submit'),replacement=old.cloneNode(true);
    replacement.disabled=true;old.replaceWith(replacement);install(replacement);
    setTimeout(()=>{replacement.disabled=false;},80);
  });
</script>`;
// A second real HTTP listener represents a different Origin from the page.
// It deliberately sends NO CORS header: successful axiosx proves Chrome's
// admitted extension broker route, not a same-origin website Fetch fallback.
const networkEvents=[];
const networkServer=createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://127.0.0.1');
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const raw=Buffer.concat(chunks).toString('utf8');
  const record={method:req.method,path:url.pathname,source:url.searchParams.get('source'),
    cookie:req.headers.cookie||null,body:raw||null};
  networkEvents.push(record);
  const status=url.pathname==='/api/status/429'?429:url.pathname==='/api/status/500'?500:200;
  res.writeHead(status,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify({ok:status===200,status,method:req.method,path:url.pathname,
    source:record.source,data:raw?JSON.parse(raw):null,cookie:record.cookie}));
});
const server=createServer((req,res)=>{
  res.setHeader('content-type','text/html; charset=utf-8');
  if(req.url!=='/large'){res.statusCode=404;res.end();return;}
  res.end('<!doctype html><title>Native HTML content</title><body><script>window._={siteValue:"original"};window.dayjs={siteValue:"original"};</script>'+r13Form+expectedBody+'</body>');
});
// Match the repository's already-proven macOS CFT profile location; using
// the default macOS TMPDIR can break the Chrome renderer's sandbox rendezvous.
const output=await mkdtemp(process.platform==='darwin'?'/private/tmp/odbr-html-':path.join(os.tmpdir(),'opendesk-content-'));
const extension=path.join(output,'extension'),profile=path.join(output,'profile');
let processChrome,client,exitPromise;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(url){
  const socket=new WebSocket(url),pending=new Map(),events=[];let serial=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',({data})=>{
    const reply=JSON.parse(data),wait=pending.get(reply.id);if(!wait){if(events.length<40 && /^(Runtime\.exceptionThrown|Runtime\.consoleAPICalled|Log\.entryAdded|Page\.frameNavigated|Inspector\.targetCrashed)$/.test(reply.method||''))events.push(reply);return;}
    pending.delete(reply.id);clearTimeout(wait.timer);
    if(reply.error)wait.reject(new Error(JSON.stringify(reply.error)));else wait.resolve(reply.result);
  });
  return {
    send(method,params={},sessionId){return new Promise((resolve,reject)=>{
      const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},15000);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });},
    events,close(){for(const wait of pending.values()){clearTimeout(wait.timer);wait.reject(new Error('CDP closed'));}pending.clear();socket.close();}
  };
}
try{
  await Promise.all([new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)),
    new Promise(resolve=>networkServer.listen(0,'127.0.0.1',resolve))]);
  const base='http://127.0.0.1:'+server.address().port;
  const networkOrigin='http://127.0.0.1:'+networkServer.address().port;
  await mkdir(path.join(extension,'ui'),{recursive:true});
  await mkdir(path.join(extension,'scripting/sandbox'),{recursive:true});
  await mkdir(path.join(extension,'native-agent'),{recursive:true});
  await mkdir(path.join(extension,'sidebar-tools'),{recursive:true});
  await mkdir(path.join(extension,'runtime/builtin-libraries'),{recursive:true});
  await mkdir(path.join(extension,'licenses'),{recursive:true});
  // Chrome validates options_ui.page before loading an unpacked extension.
  // A missing unrelated Options page made the entire CFT fixture un-installable.
  await writeFile(path.join(extension,'native-agent/settings.html'),
    '<!doctype html><meta charset="utf-8"><title>Options (not under test)</title>');
  await copyFile(path.join(root,'src/sidebar-tools/sandbox.html'),
    path.join(extension,'sidebar-tools/sandbox.html'));
  const publicKey=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'der',type:'spki'});
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
  manifest.key=publicKey.toString('base64');manifest.name='OpenDesk page HTML real Chrome smoke';
  manifest.host_permissions=['http://127.0.0.1/*'];
  const extensionId=createHash('sha256').update(publicKey).digest('hex').slice(0,32)
    .split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
  await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  await writeFile(path.join(extension,'ui/fixture-config.js'),
    'globalThis.__pageContentFixtureBase='+JSON.stringify(base)+';globalThis.__pageContentExpectedChars='+expectedBody.length+';globalThis.__pageContentNetworkOrigin='+JSON.stringify(networkOrigin)+';globalThis.__pageContentPageProof='+JSON.stringify(pageProof)+';');
  await writeFile(path.join(extension,'ui/tool.html'),
    '<!doctype html><meta charset="utf-8"><script src="fixture-config.js"></script><script src="tool-shell.js"></script>');
  for(const file of ['ui/target-bootstrap.html','scripting/sandbox/sandbox.html'])
    await copyFile(path.join(root,'src',file),path.join(extension,file));
  const require=createRequire(import.meta.url),config=require('../../webpack.config.cjs')('development');
  config.context=root;config.entry['ui/tool-shell']='./tests/framework/page-content-native-page.js';
  // The production WXT entry calls initServiceWorker(); bare src/sw.js only
  // exports it. A bare webpack sw bundle otherwise has no onMessage listener.
  config.entry.sw='./tests/framework/page-content-native-sw.js';
  config.entry['scripting/sandbox/sandbox']='./tests/framework/page-content-native-sandbox.js';
  config.entry['scripting/sandbox/worker-runtime']='./tests/framework/page-content-native-worker.js';
  config.entry['scripting/packaged/page-session']='./tests/framework/page-content-native-session.js';
  // This source-bound real Chrome fixture must ship actual bundled CORE code.
  // Otherwise RunHost's immutable Worker-loader correctly returns
  // E_BUILTIN_RESOURCE even though the production WXT package is valid.
  config.entry['runtime/builtin-libraries/page-core']='./tests/framework/page-content-native-builtin-page.js';
  config.output={...config.output,path:extension,clean:false};config.devtool=false;config.performance=false;
  await new Promise((resolve,reject)=>webpack(config,(error,stats)=>
    error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
  // Build this fixture's manifest from its ACTUAL Webpack output bytes, not
  // from a previous WXT dist, synthetic hash, or privileged mock. The same
  // strict loader/ABI/hash check used by normal runs remains unchanged.
  for(const [source,destination] of [
    ['node_modules/lodash-es/LICENSE','licenses/lodash-es-MIT.txt'],
    ['node_modules/dayjs/LICENSE','licenses/dayjs-MIT.txt']
  ])await copyFile(path.join(root,source),path.join(extension,destination));
  const builtins=await createBuiltinResourceManifest(extension);
  await writeFile(path.join(extension,'runtime/builtin-libraries/manifest.json'),JSON.stringify(builtins,null,2)+'\n');
  await verifyBuiltinResourceManifest(extension);
  console.log(JSON.stringify({stage:'native-controller-builtin-resources',abi:builtins.abi,
    resources:builtins.resources.map(({path,bytes,sha256})=>({path,bytes,sha256}))}));
  // On macOS Chrome for Testing 155 the headed MV3 startup path is required:
  // headless extension URLs can return net::ERR_BLOCKED_BY_CLIENT even though
  // the build and Chrome startup both succeed. Mirror the proven native-agent
  // macOS launch flags instead of mistaking that for a Controller failure.
  processChrome=spawn(binary,['--use-mock-keychain','--password-store=basic','--no-first-run',
    '--no-default-browser-check','--disable-features=Translate','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--disable-sync','--enable-logging=stderr','--vmodule=*native_messaging*=1',
    '--remote-allow-origins=*','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+extension,'--load-extension='+extension,
    'about:blank'],{env:process.env,stdio:['ignore','ignore','pipe']});
  exitPromise=new Promise(resolve=>processChrome.once('exit',(code,signal)=>resolve({code,signal})));
  let stderr='';processChrome.stderr.on('data',bytes=>{stderr+=bytes.toString();});
  let endpoint;
  // Recent macOS headed Chrome may omit the "DevTools listening" stderr line,
  // but writes the authoritative DevToolsActivePort file in its profile.
  for(let i=0;i<600;i++){
    endpoint=stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
    if(!endpoint){
      try{
        const [port,route]=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
        if(Number(port)>0 && route?.startsWith('/devtools/browser/'))
          endpoint='ws://127.0.0.1:'+Number(port)+route;
      }catch{}
    }
    if(endpoint)break;await sleep(50);
  }
  if(!endpoint)throw new Error('Chrome CDP unavailable; exit='+processChrome.exitCode+' stderr='+stderr.slice(-2000));
  client=await connect(endpoint);
  await client.send('Target.setDiscoverTargets',{discover:true});
  if(pageProof){
    // Real Chrome WebUI native input; DO NOT set preferences, mock userScripts,
    // or invoke a privileged API to change browser permissions.
    const {targetId:settingsTab}=await client.send('Target.createTarget',
      {url:'chrome://extensions/?id='+extensionId});
    const {sessionId:settingsSession}=await client.send('Target.attachToTarget',
      {targetId:settingsTab,flatten:true});
    await client.send('Runtime.enable',{},settingsSession);
    await client.send('Page.enable',{},settingsSession);
    await client.send('Target.activateTarget',{targetId:settingsTab});
    const detail='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
    const toggle='('+detail+')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
    const observe=async expression=>{
      const result=await client.send('Runtime.evaluate',{expression,returnByValue:true},settingsSession);
      if(result.exceptionDetails)throw Error('Chrome extension detail query failed');
      return result.result?.value;
    };
    let found=false;
    for(let i=0;i<180;i++){
      found=await observe('Boolean(('+detail+')?.data?.id==='+JSON.stringify(extensionId)+'&&'+toggle+')');
      if(found)break;
      await sleep(100);
    }
    if(!found)throw Error('Real Chrome userScripts control was not observed');
    if(!await observe(toggle+'.checked')){
      const box=await observe('(()=>{const r='+toggle+'.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()');
      if(!(box?.w>0&&box?.h>0))throw Error('Real userScripts consent toggle is not visible');
      for(const type of ['mousePressed','mouseReleased'])
        await client.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},settingsSession);
    }
    let checked=false;
    for(let i=0;i<130;i++){checked=await observe(toggle+'.checked===true');if(checked)break;await sleep(100);}
    if(!checked)throw Error('Trusted Chrome Allow User Scripts toggle did not take effect');
    console.log('NATIVE_CHROME_USER_SCRIPT_CONSENT_PASS',JSON.stringify({extensionId,
      channel:'actual chrome://extensions control',programmaticPermissionRequest:false}));
    await client.send('Target.closeTarget',{targetId:settingsTab});
  }
  const discovered=await client.send('Target.getTargets');
  console.log(JSON.stringify({stage:'installed-extension-targets',
    targets:discovered.targetInfos.filter(x=>/chrome-extension:|service_worker/.test(x.url||'')).map(({type,url})=>({type,url}))}));
  const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Runtime.enable',{},sessionId);
  await client.send('Page.enable',{},sessionId);
  const extensionURL='chrome-extension://'+extensionId+'/ui/tool.html';
  const navigation=await client.send('Page.navigate',{url:extensionURL},sessionId);
  console.log(JSON.stringify({stage:'navigate',extensionURL,navigation}));
  if(navigation.errorText)throw new Error('Extension navigation failed: '+navigation.errorText);
  await sleep(1200);
  const initial=await client.send('Runtime.evaluate',{expression:"({url:location.href,ready:document.readyState,hasChrome:typeof chrome,report:globalThis.__pageContentNativeReport||null})",returnByValue:true},sessionId);
  console.log(JSON.stringify({stage:'extension-load',initial,errorEvents:client.events.slice(0,8)}));
  let report;
  for(let i=0;i<180;i++){
    const evaluated=await client.send('Runtime.evaluate',{expression:'globalThis.__pageContentNativeReport',returnByValue:true},sessionId);
    report=evaluated.result?.value;
    if(report?.state==='finished')break;
    await sleep(100);
  }
  console.log(JSON.stringify({test:'Chrome MV3 content read',report:report??null,errorEvents:client.events.slice(0,18)}));
  if(report?.state!=='finished'||!report.passed)throw new Error('Real Chrome HTML content smoke failed');
  if(pageProof){
    const userScript=report.cases.find(row=>row.name==='page-user-script-native-builtins-and-main-isolation');
    if(!userScript?.ok)throw Error('Native Page USER_SCRIPT builtins did not return an original document receipt');
    console.log('NATIVE_PAGE_BUILTINS_PASS',JSON.stringify(userScript.value));
  }
  const expected=['/api/get','/api/post','/api/status/429','/api/status/500'];
  if(JSON.stringify(networkEvents.map(row=>row.path))!==JSON.stringify(expected) ||
      networkEvents.some(row=>row.cookie!==null))
    throw Error('Real Controller HTTP effects do not match single-dispatch or credentials omit: '+JSON.stringify(networkEvents));
  console.log('NATIVE_CONTROLLER_NETWORK_PASS',JSON.stringify({origin:networkOrigin,
    requests:networkEvents.length,methods:networkEvents.map(row=>row.method),
    paths:networkEvents.map(row=>row.path),allCookiesOmitted:true}));
}finally{
  try{await client?.send('Browser.close');}catch{}
  client?.close();
  if(processChrome){processChrome.kill('SIGTERM');await Promise.race([exitPromise,sleep(3000)]);
    if(processChrome.exitCode===null)processChrome.kill('SIGKILL');}
  await Promise.all([new Promise(resolve=>server.close(resolve)),
    new Promise(resolve=>networkServer.close(resolve))]);
  await rm(output,{recursive:true,force:true});
}
