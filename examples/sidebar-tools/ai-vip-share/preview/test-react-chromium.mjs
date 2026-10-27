#!/usr/bin/env node
// Source-bound standalone React UI in real Chromium; mock SDK only, no installed extension.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';

const root=resolve('examples/sidebar-tools/ai-vip-share/preview/dist');
const out=resolve(process.argv[2]||'artifacts/ai-vip-share-react/chromium');
await mkdir(out,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.includes('..')||/%2f|%5c/i.test(req.url))throw Error('unsafe asset');
    const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+'/'))throw Error('unsafe path');
    const data=await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(data);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(join(tmpdir(),'vip-react-chromium-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--hide-scrollbars','--user-data-dir='+profile,
  '--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,requestId=0;
const pending=new Map(),exceptions=[];
const result={evidence:'SOURCE_BOUND_REACT_CHROMIUM_MOCK_SDK',installed:false,
  nativeCookie:false,nativeProxy:false,provider:false,
  sourceCommit:process.env.GITHUB_SHA||null,checks:[],screenshots:[],exceptions};
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++requestId;
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},12000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v)},
      fail(e){clearTimeout(timeout);fail(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chromium exited before CDP');
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await wait(100);
  }
  assert(port,'CDP port missing');
  const page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json())
    .find(p=>p.type==='page');
  assert(page?.webSocketDebuggerUrl);
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',e=>{
    const msg=JSON.parse(e.data);
    if(msg.method==='Runtime.exceptionThrown')
      exceptions.push(msg.params?.exceptionDetails?.exception?.description||'Uncaught runtime exception');
    const t=pending.get(msg.id);if(!t)return;
    pending.delete(msg.id);
    msg.error?t.fail(Error(msg.error.message)):t.ok(msg.result);
  });
  await cdp('Page.enable');await cdp('Runtime.enable');
}
async function evaluate(code){
  const r=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function until(expression,label){
  for(let i=0;i<85;i++){
    if(await evaluate(expression))return;
    await wait(100);
  }
  throw Error('Timed out: '+label);
}
async function click(selector){
  const p=await evaluate('('+function(name){
    const el=document.querySelector(name);
    if(!el||el.disabled||el.hidden)throw Error('Unavailable '+name);
    el.scrollIntoView({block:'center'});
    const r=el.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  }.toString()+')('+JSON.stringify(selector)+')');
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:p.x,y:p.y});
}
async function select(selector,value){
  await evaluate('('+function(name,v){
    const el=document.querySelector(name);if(!el)throw Error('Missing '+name);
    el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }.toString()+')('+JSON.stringify(selector)+','+JSON.stringify(value)+')');
}
async function capture(width,theme,name){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:1460,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
  await select('#preview-width',String(width));
  await wait(100);
  const size=await evaluate('('+function(){
    const el=document.querySelector('.frame'),r=el.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,
      noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1};
  }.toString()+')()');
  assert(size.w>280&&size.w<=width+2,'bad source-bound frame width '+width);
  assert(size.noOverflow,'horizontal overflow '+width);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
    clip:{x:size.x,y:size.y,width:Math.ceil(size.w),height:Math.ceil(Math.min(size.h,1350)),scale:1}});
  const bytes=Buffer.from(screenshot.data,'base64');
  await writeFile(join(out,name+'.png'),bytes);
  result.screenshots.push({name,width,theme,sha256:createHash('sha256').update(bytes).digest('hex')});
  return size;
}
async function run(){
  await connect();
  await cdp('Page.navigate',{url});
  await until('document.getElementById("ai-vip-member-state")?.textContent==="服务未配置"','React mounted');
  await until('document.getElementById("ai-vip-local-connect")?.disabled===false','dev fixture approved');
  assert.equal(await evaluate('document.querySelectorAll("#ai-vip-proxy-toggle").length'),1);
  assert.equal(await evaluate('document.getElementById("ai-vip-redeem").disabled'),true);
  result.checks.push('unconfigured product fails closed');
  await click('#ai-vip-local-connect');
  await until('document.getElementById("ai-vip-local-connect")?.textContent==="退出本地开发"','dev opt-in');
  await click('#preview-member');
  await until('document.getElementById("ai-vip-refresh")?.disabled===false','member refresh available');
  await click('#ai-vip-refresh');
  await until('document.getElementById("ai-vip-member-state")?.textContent==="权益有效"','actual member view');
  result.checks.push('trusted local mode then fixture member query');
  await click('#preview-switch');
  await until('document.getElementById("ai-vip-refresh")?.disabled===false','assignment refresh available');
  await click('#ai-vip-refresh');
  await until('document.getElementById("ai-vip-shared-account")?.textContent.includes(" B")','server-assigned B');
  result.checks.push('server-assigned account switched A to B');
  await select('#preview-proxy','enabled');
  await click('#ai-vip-proxy-refresh');
  await until('document.getElementById("ai-vip-proxy-toggle")?.dataset.action==="stop"','owned STOP');
  await click('#ai-vip-proxy-toggle');
  await until('document.getElementById("ai-vip-proxy-state")?.textContent==="已停止"','proxy STOP ack');
  result.checks.push('one direct user STOP, no real proxy');
  for(const width of [320,360,390,400,440,520]){
    await capture(width,'light','react-member-'+width+'-light');
  }
  await capture(390,'dark','react-member-390-dark');
  assert.equal(exceptions.length,0,'runtime exceptions: '+exceptions.join(' | '));
  result.status='CHROMIUM_REACT_PREVIEW_PASS_NOT_INSTALLED';
  console.log('AI_VIP_REACT_PREVIEW_CHROMIUM_PASS '+result.checks.join(' / '));
}
try{await run();}catch(error){
  result.status='FAIL';result.error=String(error?.stack||error);
  console.error(result.error);process.exitCode=1;
}finally{
  await writeFile(join(out,'report.json'),JSON.stringify(result,null,2)+'\n');
  try{socket?.close();}catch{}
  try{chrome.kill('SIGTERM');}catch{}
  await new Promise(ok=>server.close(ok));
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:120}).catch(()=>{});
}
