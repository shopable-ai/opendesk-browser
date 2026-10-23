#!/usr/bin/env node
// Browser Test Lab: real Chromium DOM, native pointer and keyboard, same-origin HTTP.
// This does NOT test the extension's Controller, Provider, permissions or RunHost.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const chromeBin=process.env.CHROME_BIN||
 ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert(chromeBin,'NOT_TESTED: Chrome/Chromium not found; set CHROME_BIN');
const pages=new Set(['workflow-search.html','workflow-commerce.html']);
const server=createServer(async(req,res)=>{
 const name=String(req.url||'').split('?')[0].replace(/^\//,'');
 if(!pages.has(name)){res.writeHead(404);res.end('Not found');return;}
 try{const html=await readFile(resolve('examples/tasks',name));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);}
 catch{res.writeHead(500);res.end('File error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(tmpdir(),'opendesk-workflow-e2e-'));
let proc,socket,port=0,n=0,procClosed=Promise.resolve();
const pending=new Map(),errors=[];
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function cdp(method,params={}){
 return new Promise((resolve,reject)=>{
  const id=++n;
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},12000);
  pending.set(id,{resolve(value){clearTimeout(timer);resolve(value);},
   reject(reason){clearTimeout(timer);reject(reason);}});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evalOnPage(expression){
 const response=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
 return response.result.value;
}
async function waitUntil(expression){
 for(let i=0;i<140;i++){
  try{if(await evalOnPage(expression))return;}catch{}
  await sleep(70);
 }
 throw Error('DOM condition not reached: '+expression);
}
async function page(url){
 const reply=await cdp('Page.navigate',{url:origin+'/'+url});
 assert(!reply.errorText,'Navigation error: '+reply.errorText);
 await waitUntil('document.readyState==="complete"');
}
async function click(selector){
 const query=JSON.stringify(selector);
 const rect=await evalOnPage(`(()=>{const node=document.querySelector(${query});if(!node)throw Error('Missing ${selector}');node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,disabled:node.disabled,hidden:node.hidden};})()`);
 assert(rect.w>0&&rect.h>0&&!rect.disabled&&!rect.hidden,'Unclickable '+selector);
 for(const type of ['mousePressed','mouseReleased'])
  await cdp('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1});
}
async function fill(selector,value){
 await click(selector);
 await cdp('Input.insertText',{text:value});
 assert.equal(await evalOnPage('document.querySelector('+JSON.stringify(selector)+').value'),value);
}
try{
 proc=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--window-size=880,900',
  '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
 procClosed=new Promise(resolve=>proc.once('close',resolve));
 let stderr='',boot;
 proc.once('error',error=>{boot=error;});
 proc.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-6000);});
 for(let i=0;i<220;i++){
  if(boot)throw boot;
  if(proc.exitCode!==null)throw Error('Chrome exited: '+stderr);
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
  await sleep(100);
 }
 assert(port,'Chrome CDP port unavailable '+stderr);
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=targets.find(x=>x.type==='page');
 assert(tab?.webSocketDebuggerUrl,'CDP page not found');
 socket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails?.text||'Page exception');
  const item=pending.get(msg.id);if(!item)return;
  pending.delete(msg.id);
  if(msg.error)item.reject(Error(msg.error.message));else item.resolve(msg.result);
 });
 await cdp('Runtime.enable');await cdp('Page.enable');
 await page('workflow-search.html');
 await fill('#workflow-search-query','OpenDesk');
 await click('#workflow-search-submit');
 await waitUntil('document.getElementById("workflow-search-status").textContent==="搜索完成"');
 assert.equal(await evalOnPage('document.querySelectorAll("#workflow-search-results a").length'),2);
 assert.equal(await evalOnPage('document.querySelector("#workflow-search-count").textContent'),'提交次数：1');
 assert.match(await evalOnPage('document.querySelector("#workflow-search-result-label").textContent'),/OpenDesk/);
 await click('#workflow-search-results a[href*="opendesk"]');
 await waitUntil('location.search.includes("detail=opendesk")&&!!document.getElementById("workflow-search-detail-title")?.textContent');
 assert.match(await evalOnPage('document.title'),/OpenDesk Browser/);
 assert.equal(await evalOnPage('document.getElementById("workflow-search-detail").hidden'),false);
 await page('workflow-search.html');
 await fill('#workflow-search-query','不存在的目标');
 await click('#workflow-search-submit');
 await waitUntil('document.getElementById("workflow-search-status").textContent==="搜索完成"');
 assert.equal(await evalOnPage('document.querySelectorAll("#workflow-search-results a").length'),0);
 assert.match(await evalOnPage('document.getElementById("workflow-search-heading").textContent'),/没有找到/);
 await page('workflow-commerce.html');
 await fill('#workflow-commerce-query','无线鼠标');
 await click('#workflow-commerce-submit');
 await waitUntil('document.getElementById("workflow-commerce-status").textContent==="搜索完成"');
 assert.equal(await evalOnPage('document.querySelectorAll("#workflow-commerce-results a").length'),2);
 assert.equal(await evalOnPage('document.getElementById("workflow-commerce-count").textContent'),'提交次数：1');
 await click('#workflow-commerce-results a[href*="mouse-silent"]');
 await waitUntil('location.search.includes("product=mouse-silent")&&!!document.getElementById("workflow-commerce-product-title")?.textContent');
 assert.match(await evalOnPage('document.title'),/无线鼠标/);
 assert.equal(await evalOnPage('document.getElementById("workflow-commerce-product-price").textContent'),'¥89.00');
 // These two searches exercise the real browser DOM and new Document navigation.
 // This is the fixture prerequisite for the saved v2 RunHost replay, NOT that E2E.
 for(const target of [
   {query:'camera',name:'Camera X',product:'camera-x',price:'¥499.00'},
   {query:'lens',name:'Lens Y',product:'lens-y',price:'¥129.00'}
 ]){
   await page('workflow-commerce.html');
   await fill('#workflow-commerce-query',target.query);
   await click('#workflow-commerce-submit');
   await waitUntil('document.getElementById("workflow-commerce-status").textContent==="搜索完成"');
   assert.equal(await evalOnPage('document.getElementById("workflow-commerce-query").value'),target.query);
   assert.equal(await evalOnPage('new URL(location.href).searchParams.get("keyword")'),target.query);
   assert.equal(await evalOnPage('document.querySelectorAll("#workflow-commerce-results a").length'),1,
     'the requested product link must be unique');
   assert.equal(await evalOnPage('document.querySelector("#workflow-commerce-results a").textContent'),target.name);
   assert.equal(await evalOnPage('document.querySelector("#workflow-commerce-count").textContent'),'提交次数：1');
   await click('#workflow-commerce-results a');
   await waitUntil('new URL(location.href).searchParams.get("product")==='+
     JSON.stringify(target.product)+'&&document.getElementById("workflow-commerce-product-title")?.textContent==='+JSON.stringify(target.name));
   assert.equal(await evalOnPage('document.getElementById("workflow-commerce-product-title").textContent'),target.name);
   assert.equal(await evalOnPage('document.getElementById("workflow-commerce-product-price").textContent'),target.price);
 }
 assert.deepEqual(errors,[]);
 console.log('WORKFLOW_FIXTURES_CHROMIUM_DOM_PASS=search+navigation+empty+commerce+price+camera+lens; RUNHOST=NOT_TESTED');
}finally{
 for(const item of pending.values())item.reject(Error('Browser fixture closed'));
 try{socket?.close();}catch{}
 // A signal being sent does not mean Chrome has stopped writing its profile.
 // Wait for this child only; escalate only this owned PID if shutdown stalls.
 const forceStop=setTimeout(()=>{
  if(proc?.pid&&proc.exitCode===null&&proc.signalCode===null)proc.kill('SIGKILL');
 },5000);
 forceStop.unref();
 try{
  if(proc?.pid&&proc.exitCode===null&&proc.signalCode===null)proc.kill('SIGTERM');
  await procClosed;
 }finally{clearTimeout(forceStop);}
 await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:80});
}
