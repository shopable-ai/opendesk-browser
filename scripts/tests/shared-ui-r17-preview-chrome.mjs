#!/usr/bin/env node
// Real headless Chrome checks of the exact Vite JSX and fixed WXT assets.
// This is a source-bound file:// preview, NOT an installed-extension verdict.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const path=resolve('examples/sidebar-tools/shared-ui-demo/preview/index.html');
const output=resolve(process.argv[2]||'artifacts/shared-ui-r17/chrome');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'shared-ui-r17-chrome-'));
const flags=['--headless=new','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'];
if(process.getuid?.()===0)flags.unshift('--no-sandbox');
const browser=spawn(process.env.CHROME_BIN||'chromium',flags,{stdio:'ignore'});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let socket,seq=0;
const pending=new Map(),exceptions=[],remote=[];
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},18000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<120;i++){
    if(browser.exitCode!==null)throw Error('CHROME_EXIT '+browser.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
    await sleep(100);
  }
  assert.ok(port,'DevTools port must exist');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(targets.find(item=>item.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id&&pending.has(message.id)){
      const callback=pending.get(message.id);pending.delete(message.id);
      if(message.error)callback.reject(Error(message.error.message));
      else callback.resolve(message.result);
    }
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text);
    if(message.method==='Network.requestWillBeSent'&&/^https?:/i.test(message.params.request?.url||''))
      remote.push(message.params.request.url);
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
}
async function evaluate(source){
  const result=await cdp('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result?.value;
}
async function ready(){
  let last;
  for(let i=0;i<120;i++){
    last=await evaluate('({status:document.querySelector("#tool-app [aria-live]")?.textContent||null,root:!!document.querySelector("[data-slot=card]"),switches:document.querySelectorAll("[data-slot=switch]").length,hasReact:globalThis.OpenDeskPageReact?.version,hasUI:typeof globalThis.OpenDeskSidebarUI?.Switch,scrollWidth:document.documentElement.scrollWidth})');
    if(last.status==='已关闭'&&last.root&&last.switches===1&&last.hasReact==='19.2.0'&&last.hasUI==='function')return last;
    await sleep(75);
  }
  throw Error('COMPILED_PREVIEW_NOT_READY '+JSON.stringify(last));
}
async function click(){
  const point=await evaluate('(()=>{const e=document.querySelector("[data-slot=switch]"),r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0&&r.height>0,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest("[data-slot=switch]")===e};})()');
  assert.ok(point.visible&&point.hit,'Switch must be actually visible and clickable');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  for(const type of ['mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1});
}
async function selected(expected){
  let latest;
  for(let i=0;i<80;i++){
    latest=await evaluate('({selected:document.querySelector("[data-slot=switch]")?.hasAttribute("data-selected"),status:document.querySelector("#tool-app [aria-live]")?.textContent,input:document.querySelector("[data-slot=switch] input")?.checked,focused:document.activeElement===document.querySelector("[data-slot=switch] input")})');
    if(latest.selected===expected&&latest.status===(expected?'已开启':'已关闭')&&latest.input===expected)return latest;
    await sleep(50);
  }
  throw Error('CONTROLLED_REACT_STATE_FAILED '+JSON.stringify({expected,latest}));
}
const reports=[];
try{
  await connect();
  for(const width of [320,360,400,440]){
    for(const theme of ['light','dark']){
      exceptions.length=0;remote.length=0;
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});
      await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      await cdp('Page.navigate',{url:pathToFileURL(path).href});
      const original=await ready();
      assert.ok(original.scrollWidth<=width+1,'No horizontal overflow');
      await selected(false);
      await click();await selected(true);
      await click();await selected(false);
      // React Aria provides a native accessible input and keyboard activation.
      await evaluate('document.querySelector("[data-slot=switch] input").focus()');
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
      await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
      const keyboard=await selected(true);
      assert.equal(keyboard.focused,true,'keyboard focus must stay with Switch');
      const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,theme+'-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
      // The production mount registers pagehide -> root.unmount. Dispatching
      // pagehide here verifies the handler without claiming real iframe closing.
      const released=await evaluate('(()=>{dispatchEvent(new Event("pagehide"));return document.getElementById("tool-app").childElementCount;})()');
      assert.equal(released,0,'React Root must unmount on pagehide');
      assert.deepEqual(remote,[],'No remote/CDN resource requests');
      assert.deepEqual(exceptions,[],'No Chromium runtime exceptions');
      reports.push({width,theme,states:['已关闭','已开启','已关闭','已开启'],
        react:original.hasReact,keyboard:true,unmounted:true,remote:0,exceptions:0});
    }
  }
  await writeFile(join(output,'report.json'),JSON.stringify({scope:'SOURCE_BOUND_CHROME_PREVIEW_NOT_EXTENSION_INSTALL',reports},null,2)+'\n');
  console.log('R17_SOURCE_BOUND_CHROME_PASS '+JSON.stringify(reports));
}finally{
  try{socket?.close();}catch{}
  browser.kill();
  await rm(profile,{recursive:true,force:true});
}
