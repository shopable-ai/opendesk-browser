#!/usr/bin/env node
// Real Chrome interactions with two actual UIs. Host SDK is preview-memory ONLY.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
const repo=resolve(import.meta.dirname,'../..');
const out=resolve(process.argv[2]||'artifacts/quick-notes-react-r21/chrome');
await mkdir(out,{recursive:true});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    const file=resolve(repo,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(repo+sep))throw Error('path escape');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
let browser,profile,socket,seq=0,launchError;
const jobs=new Map(),exceptions=[],remote=[],badAssets=[];
const result={scope:'SOURCE_BOUND_PREVIEW_ONLY',installedHost:'NOT_TESTED',
  storage:'PREVIEW_MEMORY_ONLY',status:'IN_PROGRESS',cases:[]};
function cdp(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++seq;
    const timeout=setTimeout(()=>{jobs.delete(id);fail(Error('CDP_TIMEOUT '+method));},15000);
    jobs.set(id,{ok:v=>{clearTimeout(timeout);ok(v);},fail:e=>{clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port;
  for(let i=0;i<120;i++){
    if(launchError)throw launchError;
    if(browser.exitCode!==null||browser.signalCode!==null)throw Error('CHROME_EXIT');
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}
    catch{}
    await sleep(100);
  }
  assert.ok(port,'Chrome debugging port unavailable');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data),p=m.params;
    if(m.id&&jobs.has(m.id)){
      const job=jobs.get(m.id);jobs.delete(m.id);if(m.error)job.fail(Error(m.error.message));
      else job.ok(m.result);
    }
    if(m.method==='Runtime.exceptionThrown')exceptions.push(p.exceptionDetails?.text);
    if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(p.request?.url||'')&&
      !p.request.url.startsWith('http://127.0.0.1:'))remote.push(p.request.url);
    if(m.method==='Network.responseReceived'&&p.response.status>=400&&
      !p.response.url.endsWith('favicon.ico'))badAssets.push([p.response.url,p.response.status]);
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
}
async function evalJs(expr){
  const value=await cdp('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result?.value;
}
async function until(expr,valid,reason){
  let last;
  for(let i=0;i<100;i++){last=await evalJs(expr);if(valid(last))return last;await sleep(75);}
  throw Error('CHROME_TIMEOUT '+reason+': '+JSON.stringify(last));
}
async function click(selector){
  const point=await evalJs('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!e)throw Error("missing control");const r=e.getBoundingClientRect();'+
    'return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled,width:r.width,height:r.height};})()');
  assert.ok(point.width>0&&point.height>0&&!point.disabled,'cannot click '+selector);
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  for(const type of ['mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1});
}
async function textInput(value){
  await evalJs('document.querySelector("#note-text").focus()');
  await cdp('Input.insertText',{text:value});
}
async function exercise(kind,path,port){
  await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:800,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+path});
  await until('Boolean(document.querySelector("#note-text")&&!document.querySelector("#note-text").disabled)',
    Boolean,'ready');
  const count=()=>evalJs('document.querySelectorAll(".note-list button").length');
  assert.equal(await count(),0);
  await textInput('第一条中文笔记');
  await click('button[aria-label="保存笔记"]');
  await until('document.querySelectorAll(".note-list button").length',x=>x===1,'first save');
  await click('button[aria-label="新建笔记"]');
  await textInput('第二条笔记');
  await click('button[aria-label="保存笔记"]');
  await until('document.querySelectorAll(".note-list button").length',x=>x===2,'second save');
  await click('.note-list button:last-child');
  await until('document.querySelector("#note-text").value',x=>x==='第一条中文笔记','switch note');
  await click('button[aria-label="删除当前笔记"]');
  await until('Boolean(document.querySelector("[role=alertdialog]"))',Boolean,'confirmation');
  await click('.confirm-actions button:last-child');
  await until('document.querySelectorAll(".note-list button").length',x=>x===1,'delete');
  const measurements=[];
  for(const width of [320,360,400,440]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    await sleep(120);
    const row=await evalJs('(()=>{const w=innerWidth;return {width:w,scroll:document.documentElement.scrollWidth,notes:document.querySelectorAll(".note-list button").length,offenders:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>w+2).slice(0,8).map(e=>({tag:e.tagName,id:e.id,className:String(e.className||"").slice(0,70),right:Math.round(e.getBoundingClientRect().right),scroll:e.scrollWidth}))}})()');
    const shot=await cdp('Page.captureScreenshot',{format:'png'});
    await writeFile(join(out,kind+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
    measurements.push(row);
    assert.ok(row.scroll<=row.width+2,'document overflow at '+width+': '+JSON.stringify(row));
    assert.equal(row.notes,1);
  }
  if(kind==='react'){
    assert.equal(await evalJs('globalThis.OpenDeskPageReact?.version'),'19.2.0');
    assert.equal(await evalJs('document.querySelectorAll("[data-slot=card]").length'),1);
    await evalJs('dispatchEvent(new Event("pagehide"))');
    assert.equal(await evalJs('document.querySelector("#tool-app").childElementCount'),0);
  }
  return {kind,status:'PREVIEW_PASS',measurements};
}
try{
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const port=server.address().port;
  profile=await mkdtemp(join(tmpdir(),'quick-notes-r21-'));
  const flags=['--disable-gpu','--disable-dev-shm-usage','--no-first-run',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'];
  if(process.env.OPENDESK_R21_HEADFUL!=='1')flags.unshift('--headless=new');
  if(process.getuid?.()===0||(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'))
    flags.unshift('--no-sandbox');
  browser=spawn(process.env.CHROME_BIN||'chromium',flags,{stdio:'ignore'});
  browser.on('error',error=>{launchError=error;});
  await connect();
  const prefix='/examples/sidebar-tools/quick-notes-react/';
  result.cases.push(await exercise('native',prefix+'.opendesk-preview/native.html',port));
  result.cases.push(await exercise('react',prefix+'preview/index.html',port));
  assert.deepEqual(remote,[],'No remote resources');
  assert.deepEqual(badAssets,[],'All preview resources load');
  assert.deepEqual(exceptions,[],'No Chrome JS exceptions');
  result.status='PREVIEW_PASS';
}catch(error){result.status='FAIL';result.error=String(error.stack||error);process.exitCode=1;}
finally{
  result.remote=remote;result.badAssets=badAssets;result.exceptions=exceptions;
  await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  socket?.close();browser?.kill();
  if(profile)await rm(profile,{recursive:true,force:true});
  await new Promise(ok=>server.close(ok));
  console.log(JSON.stringify({status:result.status,output:out,error:result.error},null,2));
}
