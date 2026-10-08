import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

// Experimental REAL Chrome Native Messaging smoke, not Codex/Side Panel E2E.
// This always reports exactly what was exercised. It never synthesizes DOM
// events, sets extension storage, or bypasses chrome.permissions.request().
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(fn,{timeout=25000,label='condition'}={}) {
  const until=Date.now()+timeout;let last;
  while(Date.now()<until){
    try {const result=await fn();if(result)return result;}
    catch(e){last=e;}
    await pause(200);
  }
  throw new Error(label+' timed out'+(last?': '+last.message:''));
}
function chromeBinary() {
  // Chrome-branded builds 137+ ignore --load-extension; automated unpacked
  // MV3 tests must use Chromium or Chrome for Testing.
  const exact=process.env.CHROME_FOR_TESTING_BIN;
  if(exact)return fs.existsSync(exact)?[exact,'cft']:null;
  if(process.env.CI)throw Error('Real Chrome for Testing binary missing from CI');
  const paths=[
    ['/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','cft'],
    ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','chrome']
  ];
  return paths.find(item=>fs.existsSync(item[0]))||null;
}
function cli(args,env) {
  return spawnSync(process.execPath,['native-agent/cli.mjs',...args],{
    cwd:process.cwd(),env,encoding:'utf8',timeout:9000
  });
}
function connectCDP(url) {
  return new Promise((resolve,reject)=>{
    if(typeof WebSocket!=='function')return reject(Error('Node WebSocket unavailable'));
    const ws=new WebSocket(url),pending=new Map();let seq=0;
    const timer=setTimeout(()=>{ws.close();reject(Error('CDP socket timed out'));},7000);
    ws.addEventListener('error',e=>{clearTimeout(timer);reject(Error('CDP socket error: '+e.message));});
    ws.addEventListener('message',e=>{
      let value;try {value=JSON.parse(e.data);}catch{return;}
      if(!value.id||!pending.has(value.id))return;
      const entry=pending.get(value.id);pending.delete(value.id);
      if(value.error)entry.reject(Error(value.error.message));else entry.resolve(value.result);
    });
    ws.addEventListener('open',()=>{
      clearTimeout(timer);
      resolve({
        close:()=>ws.close(),
        call(method,params={}) {
          const id=++seq;
          return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP '+method+' timeout'));},10000);
            pending.set(id,{
              resolve:value=>{clearTimeout(timer);resolve(value);},
              reject:error=>{clearTimeout(timer);reject(error);}
            });
            ws.send(JSON.stringify({id,method,params}));
          });
        }
      });
    });
  });
}
test('real macOS Chrome: packaged extension, trusted Options click and Native CLI handshake', {
  skip:process.platform!=='darwin',
  timeout:95000
},async t=>{
  const binary=chromeBinary();
  assert.ok(binary,'No installed real Google Chrome or CFT; cannot claim Chrome E2E');
  const [executable,browser]=binary,ext=path.resolve('dist/production');
  assert.ok(fs.existsSync(path.join(ext,'manifest.json')),'Build production package first');
  const home=fs.mkdtempSync('/private/tmp/odbr-');
  const profile=path.join(home,'browser-profile'),env={...process.env,HOME:home};
  let child=null,debug='',cdp=null;
  t.after(()=>{
    cdp?.close();
    if(child&&!child.killed)child.kill('SIGKILL');
    try{cli(['cleanup'],env);}catch{}
    fs.rmSync(home,{recursive:true,force:true});
  });
  const version=spawnSync(executable,['--version'],{encoding:'utf8',timeout:10000});
  console.log('REAL_CHROME_BINARY='+browser+' VERSION='+(version.stdout||version.stderr).trim());
  child=spawn(executable,[
    '--headless=new','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--disable-sync',
    '--remote-allow-origins=*','--remote-debugging-port=0',
    '--disable-extensions-except='+ext,'--load-extension='+ext,
    '--user-data-dir='+profile,'about:blank'
  ],{env,stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',bytes=>{debug=(debug+bytes.toString()).slice(-4000);});
  child.on('error',error=>{debug=String(error);});
  const port=await eventually(()=>{
    const file=path.join(profile,'DevToolsActivePort');
    if(!fs.existsSync(file))return null;
    const n=Number(fs.readFileSync(file,'utf8').split('\n')[0]);
    return Number.isSafeInteger(n)&&n>0?n:null;
  },{timeout:30000,label:'real Chrome DevTools port (stderr '+debug+')'});
  const base='http://127.0.0.1:'+port;
  async function newTab(url){
    const response=await fetch(base+'/json/new?'+encodeURIComponent(url),{method:'PUT'});
    assert.equal(response.status,200,'create real Chrome tab');
    return response.json();
  }
  const evaluated=async expression=>{
    const result=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});
    if(result.exceptionDetails)throw Error('Chrome Runtime.evaluate failed');
    return result.result?.value;
  };
  assert.ok(fs.existsSync(path.join(ext,'native-agent','settings.html')),'Built Native Options HTML missing');
  const extensionId=await eventually(async()=>{
    // Never select the first random chrome-extension:// target: Chrome has
    // built-in extension targets not owned by OpenDesk.
    const preferences=path.join(profile,'Default','Preferences');
    if(fs.existsSync(preferences)){
      const config=JSON.parse(fs.readFileSync(preferences,'utf8'));
      const entries=Object.entries(config.extensions?.settings||{});
      const own=entries.find(([,value])=>value.manifest?.name==='OpenDesk Browser'||
        (typeof value.path==='string'&&path.resolve(value.path)===ext));
      if(own)return own[0];
    }
    const targets=await (await fetch(base+'/json/list')).json();
    const worker=targets.find(item=>item.type==='service_worker'&&
      /^chrome-extension:\/\/[a-p]{32}\/sw\.js(?:$|[?#])/.test(item.url||''));
    return worker?.url?.match(/^chrome-extension:\/\/([a-p]{32})\//)?.[1]||null;
  },{timeout:24000,label:'real unpacked OpenDesk extension ID'});
  assert.match(extensionId,/^[a-p]{32}$/);
  console.log('REAL_CHROME_EXTENSION_LOADED=PASS id='+extensionId);
  const setup=cli(['setup','--extension-id',extensionId,...(browser==='cft'?['--browser','cft']:[])],env);
  assert.equal(setup.status,0,'real native manifest setup: '+setup.stderr);
  console.log('MACOS_NATIVE_MANIFEST_INSTALLED=PASS browser='+browser);

  cdp?.close();
  const optionsTab=await newTab('chrome-extension://'+extensionId+'/native-agent/settings.html');
  cdp=await connectCDP(optionsTab.webSocketDebuggerUrl);
  try {
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
  }catch(error){
    console.log('REAL_CHROME_CDP_OPTIONS_ERROR='+error.message+' stderr='+debug.slice(-1200));
    throw error;
  }
  await cdp.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/native-agent/settings.html'});
  const status=async()=>evaluated("document.getElementById('bridge-status')?.textContent||''");
  try {
    await eventually(async()=>((await status()).includes('Extension ID：'+extensionId)),{
      timeout:15000,label:'Options settings page with real extension sender'
    });
  }catch(e) {
    const diagnostic=await evaluated("(()=>({url:location.href,title:document.title,readyState:document.readyState,body:document.body?.textContent?.slice(0,900)||'',chromeId:globalThis.chrome?.runtime?.id||null,status:document.getElementById('bridge-status')?.textContent||''}))()").catch(error=>({inspectionError:error.message}));
    console.log('REAL_CHROME_OPTIONS_DIAGNOSTIC='+JSON.stringify(diagnostic));
    throw e;
  }
  console.log('REAL_CHROME_OPTIONS_LOADED=PASS');
  const rectangle=await evaluated("(()=>{const r=document.getElementById('bridge-enable').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  assert.ok(rectangle&&rectangle.x>0&&rectangle.y>0,'Native Enable button must be visible');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rectangle.x,y:rectangle.y});
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:rectangle.x,y:rectangle.y,button:'left',clickCount:1});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rectangle.x,y:rectangle.y,button:'left',clickCount:1});
  console.log('REAL_CHROME_CDP_POINTER_DISPATCHED=PASS (extension itself requires event.isTrusted)');
  let snapshot='';
  try {
    await eventually(async()=>{
      snapshot=await status();
      const diagnosis=cli(['doctor'],env);
      return diagnosis.status===0&&snapshot.includes('已启用')&&snapshot.includes('已连接');
    },{timeout:18000,label:'Native handshake after Chrome Options trusted click'});
  }catch(e){
    console.log('REAL_CHROME_NATIVE_HANDSHAKE=NOT_VERIFIED; Options status='+JSON.stringify(snapshot));
    throw e;
  }
  const check=cli(['bridge.status','--request-id','chrome-real-smoke-readonly'],env);
  assert.equal(check.status,0,'real Host/CLI IPC: '+check.stderr);
  const reply=JSON.parse(check.stdout);
  assert.equal(reply.result?.extensionId,extensionId);
  assert.equal(reply.result?.nativeConnected,true);
  assert.equal(reply.result?.enabled,true);
  console.log('REAL_CHROME_NATIVE_HANDSHAKE=PASS');
  console.log('REAL_CHROME_CLI_BRIDGE_STATUS=PASS (no live Side Panel; Codex E2E NOT_TESTED)');
});
