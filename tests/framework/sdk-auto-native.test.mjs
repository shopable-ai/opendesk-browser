import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

// Actual unpacked extension + Chrome document + MV3 sender + SDK Broker, not
// an injected fake API, DOM result spoof or Node-only message simulation.
const candidates=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium'].filter(Boolean);
const binary=candidates.find(name=>spawnSync(name,['--version'],{stdio:'ignore'}).status===0);
async function connect(url) {
  const ws=new WebSocket(url),waiters=new Map();let id=0;
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const response=JSON.parse(event.data);
    if(!response.id)return;
    const current=waiters.get(response.id);if(!current)return;
    waiters.delete(response.id);clearTimeout(current.timer);
    response.error?current.reject(Error(response.error.message)):current.resolve(response.result);
  };
  return {
    send(method,params={},timeout=15000) {
      return new Promise((resolve,reject)=>{
        const requestId=++id,timer=setTimeout(()=>{
          waiters.delete(requestId);reject(Error('CDP_TIMEOUT: '+method));
        },timeout);
        waiters.set(requestId,{resolve,reject,timer});
        ws.send(JSON.stringify({id:requestId,method,params}));
      });
    },
    close(){for(const entry of waiters.values()){clearTimeout(entry.timer);entry.reject(Error('CDP_CLOSED'));}waiters.clear();ws.close();}
  };
}
async function evaluate(cdp,expression,timeout=15000) {
  const response=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);
  if(response.exceptionDetails)throw Error('PAGE_EXCEPTION: '+JSON.stringify(response.exceptionDetails).slice(0,1200));
  return response.result.value;
}

test('actual Chrome auto-installs page SDK without approval and sends HTTP through extension', {timeout:90000},async t=>{
  assert.ok(binary,'Native Chrome binary required; cannot report PASS without real browser');
  const profile=await mkdtemp(join(tmpdir(),'opendesk-sdk-auto-'));
  const fixture=await readFile('examples/tasks/demo-form.html');
  let observed=0;
  const server=createServer((request,response)=>{
    if(request.url?.startsWith('/demo-form.html')){response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(fixture);return;}
    if(request.url?.startsWith('/sdk-native-check.json')){
      observed++;response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,from:'native-sdk-auto'}));return;
    }
    response.writeHead(404);response.end('missing');
  });
  await new Promise((yes,no)=>server.once('error',no).listen(43111,'127.0.0.1',yes));
  const dist=resolve('dist/development');
  const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+dist,'--load-extension='+dist,'about:blank'];
  const chrome=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let chromeErrors='';
  chrome.stderr.on('data',chunk=>{chromeErrors=(chromeErrors+chunk).slice(-5000);});
  let browser,page;
  t.after(async()=>{
    page?.close();browser?.close();
    chrome.kill('SIGTERM');
    server.close();
    await rm(profile,{recursive:true,force:true});
  });
  let port;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited: '+chromeErrors);
    try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n');port=Number(lines[0]);if(port)break;}catch{}
    await pause(150);
  }
  assert(port,'Chrome DevTools did not start: '+chromeErrors);
  const base='http://127.0.0.1:'+port;
  const version=await(await fetch(base+'/json/version')).json();
  browser=await connect(version.webSocketDebuggerUrl);
  const target=await browser.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});
  let debuggerUrl;
  for(let i=0;i<75;i++){
    const tabs=await(await fetch(base+'/json/list')).json();
    debuggerUrl=tabs.find(x=>x.id===target.targetId)?.webSocketDebuggerUrl;
    if(debuggerUrl)break;
    await pause(100);
  }
  assert(debuggerUrl,'Browser did not create test tab');
  page=await connect(debuggerUrl);await page.send('Runtime.enable');
  let present=false;
  for(let i=0;i<90;i++){
    present=await evaluate(page,'document.readyState==="complete" && typeof OpenDeskSDK==="object" && typeof axiosx==="object"');
    if(present)break;
    await pause(150);
  }
  assert.equal(present,true,'Fixed SDK must appear in MAIN without a user-approved install');
  const value=await evaluate(page,`(async()=>{
    const ready=await OpenDeskSDK.ready();
    const response=await axiosx.get(location.origin+'/sdk-native-check.json',{responseType:'json',timeout:8000});
    try{await axiosx.get('https://unapproved.example.test/not-allowed',{timeout:1000});return {unexpectedPermission:true};}
    catch(error){return {ready:ready.ready,data:response.data,status:response.status,denied:error.code};}
  })()`,25000);
  assert.equal(value.ready,true);assert.equal(value.status,200);assert.deepEqual(value.data,{ok:true,from:'native-sdk-auto'});
  assert.equal(value.denied,'E_PERMISSION');assert.equal(observed,1,'one real network effect must reach the local server');

  // Exercise the actual HTTP lab UI with native CDP pointer/keyboard input.
  // No document.value assignment, synthetic DOM event or fake SDK response.
  async function clickElement(id) {
    const point=await evaluate(page,'(()=>{const e=document.getElementById('+JSON.stringify(id)+');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  }
  assert.equal(await evaluate(page,'document.getElementById("api-channel").value'),'sdk');
  await clickElement('api-url');
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',modifiers:2,windowsVirtualKeyCode:17});
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17});
  await page.send('Input.insertText',{text:'http://127.0.0.1:43111/sdk-native-check.json'});
  assert.equal(await evaluate(page,'document.getElementById("api-url").value'),'http://127.0.0.1:43111/sdk-native-check.json');
  await clickElement('api-send');
  let ui;
  for(let i=0;i<80;i++){
    ui=await evaluate(page,'({state:document.getElementById("api-status").dataset.state,status:document.getElementById("api-http-status").textContent,body:document.getElementById("api-response").textContent,error:document.getElementById("api-error").textContent})');
    if(['success','error'].includes(ui.state))break;
    await pause(100);
  }
  assert.equal(ui.state,'success','Native UI HTTP status: '+JSON.stringify(ui));
  assert.equal(ui.status,'200');
  assert.match(ui.body,/native-sdk-auto/);
  assert.equal(observed,2,'console axiosx and native UI click produce two distinct real requests');
  console.log('NATIVE_SDK_AUTO_PASS',JSON.stringify({browser:version.Browser,autoInstalled:true,sdkHttp:200,denied:'E_PERMISSION',observed,realUiGet:true}));
});
