#!/usr/bin/env node
// Formal package in Chromium + mocked SDK. NOT a loaded extension or native proxy.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../build-sidebar-tool.mjs';
const out=resolve(process.argv[2]||'artifacts/ai-vip-share-r591/chromium');
await mkdir(out,{recursive:true});
const pkg=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
assert.equal(pkg.id,'ai-vip-share');assert.equal(pkg.version,'1.3.5');
const preview=await readFile('examples/sidebar-tools/ai-vip-share/preview/index.html','utf8');
const escape=s=>s.replace(/<\/script/gi,'<\\/script').replace(/<\/style/gi,'<\\/style');
function fixture(){
 const idle={state:'disabled',control:'controllable_by_this_extension',permission:true,canStop:false,reason:null};
 const active={...idle,state:'enabled',control:'controlled_by_this_extension',canStop:true};
 const f={status:location.search.includes('owned=1')?active:idle,starts:0,stops:0,external:0};
 window.__aiVipVisual=f;
 window.OpenDeskTool={root:document.getElementById('tool-root'),request:async(op,p)=>{
  if(op==='storage.get'&&p?.key==='aiVipRedeemR52')return {value:null,etag:'a'.repeat(64)};
  throw Error('Unmocked operation '+op);
 }};
 window.OpenDeskSDK={browser:{
  proxy:{managed:{
   getStatus:async()=>f.status,
   requestDisable:async()=>{f.stops++;f.status=idle;return idle;},
   requestEnable:async()=>{f.starts++;throw Error('No approved Provider');}
  }},
  network:{request:async()=>{f.external++;throw Error('No commercial Provider');}},
  tabs:{create:async()=>{f.external++;throw Error('No approved catalog');}}
 }};
}
const formal='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1"><title>FORMAL / MOCK SDK</title>'+
 '<style>'+escape(pkg.css)+'</style></head><body><div id="tool-root">'+pkg.html+
 '</div><script>('+fixture.toString()+')();</script><script>'+escape(pkg.js)+'</script></body></html>';
const server=createServer((req,res)=>{
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end(req.url.startsWith('/preview')?preview:formal);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const host='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(tmpdir(),'ai-vip-r591-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
 '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
 '--hide-scrollbars','--no-first-run','--user-data-dir='+profile,
 '--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,id=0;const pending=new Map(),errors=[];
const report={evidence:'PACKAGED_CHROMIUM_MOCK_SDK_NOT_INSTALLED',installed:false,nativeProxy:false,
 commercialProvider:false,id:pkg.id,version:pkg.version,
 sha256:createHash('sha256').update(encodeSidebarToolPackage(pkg)).digest('hex'),
 commit:process.env.GITHUB_SHA||null,screenshots:[],checks:[],errors};
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={}){
 const n=++id;return new Promise((ok,fail)=>{
  const timeout=setTimeout(()=>{pending.delete(n);fail(Error('CDP timeout '+method));},16000);
  pending.set(n,{ok(x){clearTimeout(timeout);ok(x)},fail(e){clearTimeout(timeout);fail(e)}});
  socket.send(JSON.stringify({id:n,method,params}));
 });
}
async function connect(){
 let port=0;
 for(let i=0;i<120;i++){
  if(chrome.exitCode!==null)throw Error('Chrome failed to launch');
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
  if(port)break;await sleep(100);
 }
 assert(port,'Missing CDP port');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const page=pages.find(p=>p.type==='page');assert(page?.webSocketDebuggerUrl);
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{
  socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});
 });
 socket.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.text||'JS error');
  const task=pending.get(m.id);if(!task)return;
  pending.delete(m.id);if(m.error)task.fail(Error(m.error.message));else task.ok(m.result);
 });
 await cdp('Page.enable');await cdp('Runtime.enable');
}
async function evaluate(code){
 const r=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result?.value;
}
async function until(expression,label){
 for(let i=0;i<90;i++){if(await evaluate(expression))return;await sleep(75);}
 throw Error('Timeout: '+label);
}
async function navigate(path){
 const r=await cdp('Page.navigate',{url:host+path});if(r.errorText)throw Error(r.errorText);
}
async function viewport(width,theme){
 await cdp('Emulation.setDeviceMetricsOverride',{width,height:1500,deviceScaleFactor:1,mobile:false});
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
}
async function screenshot(frame,content,name){
 const geometry=await evaluate('('+function(a,b){
  const root=document.querySelector(a),body=document.querySelector(b);
  if(!root||!body)throw Error('Missing screenshot node');
  const r=root.getBoundingClientRect(),style=getComputedStyle(body);
  return {x:r.x,y:r.y,width:r.width,height:r.height,
   inset:parseFloat(style.paddingLeft),
   overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
 }.toString()+')('+JSON.stringify(frame)+','+JSON.stringify(content)+')');
 assert(geometry.width>=300&&geometry.height>200,'Bad screenshot area '+name);
 assert(!geometry.overflow,'Horizontal overflow '+name);
 const png=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
  clip:{x:geometry.x,y:geometry.y,width:Math.ceil(geometry.width),
   height:Math.ceil(geometry.height),scale:1}});
 const bytes=Buffer.from(png.data,'base64'),filename=name+'.png';
 await writeFile(join(out,filename),bytes);
 report.screenshots.push({file:filename,sha256:createHash('sha256').update(bytes).digest('hex')});
 return geometry;
}
async function click(selector){
 const pos=await evaluate('('+function(name){
  const el=document.querySelector(name);if(!el||el.disabled)throw Error('Disabled '+name);
  el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();
  return {x:r.x+r.width/2,y:r.y+r.height/2};
 }.toString()+')('+JSON.stringify(selector)+')');
 for(const type of ['mouseMoved','mousePressed','mouseReleased'])
  await cdp('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:pos.x,y:pos.y});
}
async function run(){
 await connect();
 for(const width of [320,360,390,440])for(const theme of ['light']){
  await viewport(width+20,theme);await navigate('/preview');
  await until('!!document.getElementById("scenario")','preview loaded');
  await evaluate('('+function(w,t){
   const el=document.getElementById('scenario');el.value='blocked';
   el.dispatchEvent(new Event('change',{bubbles:true}));
   document.documentElement.setAttribute('data-preview-theme',t);
   document.documentElement.style.setProperty('--preview-width',w+'px');
   return true;
  }.toString()+')('+width+','+JSON.stringify(theme)+')');
  const original=await screenshot('.shell','.main','prototype-blocked-'+width+'-'+theme);
  await viewport(width,theme);await navigate('/formal');
  await until('document.getElementById("ai-vip-member-state")?.textContent==="服务未配置"','formal UI');
  const installedSource=await screenshot('.ai-vip','.ai-vip','formal-unconfigured-'+width+'-'+theme);
  const inset=width<=345?12:17;
  assert.equal(original.inset,inset,'Prototype inset '+width);
  assert.equal(installedSource.inset,inset,'Formal package inset '+width);
  const state=await evaluate('('+function(){
   const $=id=>document.getElementById(id),f=window.__aiVipVisual;
   return {redeemDisabled:$('ai-vip-redeem').disabled,shopDisabled:$('ai-vip-shop-open').disabled,
    proxyDisabled:$('ai-vip-proxy-toggle').disabled,action:$('ai-vip-proxy-toggle').dataset.action,
    proxyCount:document.querySelectorAll('#ai-vip-proxy-toggle').length,starts:f.starts,external:f.external,
    emptyHidden:['ai-vip-member-facts','ai-vip-benefits-section','ai-vip-history-details',
      'ai-vip-redeem-form','ai-vip-shop-section','ai-vip-proxy-toggle'].every(id=>$(id).hidden)};
  }.toString()+')()');
  assert.equal(state.redeemDisabled,true);assert.equal(state.shopDisabled,true);
  assert.equal(state.proxyDisabled,true);assert.equal(state.action,'start');
  assert.equal(state.proxyCount,1);assert.equal(state.starts,0);assert.equal(state.external,0);
  assert.equal(state.emptyHidden,true,'All unconfigured empty state controls are hidden');
  report.checks.push({width,theme,prototype:original,formal:installedSource,state});
  console.log('R591_PACKAGED_CHROME_MATRIX_PASS',width,theme);
 }
 await viewport(390,'light');await navigate('/formal?owned=1');
 await until('document.getElementById("ai-vip-proxy-toggle")?.dataset.action==="stop"','owned mock');
 await screenshot('.ai-vip','.ai-vip','formal-owned-before-stop-390-light');
 await click('#ai-vip-proxy-toggle');
 await until('window.__aiVipVisual?.stops===1','actual mouse click in Chromium');
 await until('document.getElementById("ai-vip-proxy-state")?.textContent==="已停止"','mock stop confirmation');
 const stopped=await evaluate('('+function(){return {
  starts:window.__aiVipVisual.starts,stops:window.__aiVipVisual.stops,
  action:document.getElementById('ai-vip-proxy-toggle').dataset.action
 };}.toString()+')()');
 assert.equal(stopped.starts,0);assert.equal(stopped.stops,1);assert.equal(stopped.action,'start');
 await screenshot('.ai-vip','.ai-vip','formal-owned-after-stop-390-light');
 report.stopMock=stopped;
 assert.equal(errors.length,0,'Chromium runtime exceptions: '+errors.join(' | '));
 report.status='PACKAGED_CHROMIUM_PASS_NOT_INSTALLED';
 console.log('AI_VIP_R591_PACKAGED_CHROMIUM_PASS');
}
try{await run();}catch(error){report.status='FAIL';report.error=String(error?.stack||error);console.error(report.error);process.exitCode=1;}
finally{
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 try{socket?.close()}catch{};try{chrome.kill('SIGTERM')}catch{}
 await new Promise(ok=>server.close(ok));
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
