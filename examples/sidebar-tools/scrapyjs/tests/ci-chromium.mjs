#!/usr/bin/env node
// Chromium loads compiled original React UI with the existing memory SDK.
// Never label this an installed extension, real Task, or live capture.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve('examples/sidebar-tools/scrapyjs');
const out=resolve(process.argv[2]||'artifacts/app-ci/scrapyjs/chrome');
assert(process.env.CHROME_BIN,'Real Chrome required');
await mkdir(out,{recursive:true});
const assetFiles={
 '/react.js':resolve('src/libs/page-frameworks/react-19.2.0.js'),
 '/sdk.js':join(root,'adapters/app-sdk.js'),
 '/model.js':join(root,'src/app-model.js'),
 '/mock.js':join(root,'preview/mock-host.js'),
 '/tool.js':join(root,'dist/tool.js'),
 '/tool.css':join(root,'dist/tool.css')};
const assets=Object.fromEntries(await Promise.all(Object.entries(assetFiles)
  .map(async ([url,path])=>[url,await readFile(path)])));
const config=JSON.parse(await readFile(join(root,'tool.config.json')));
const task=config.delegatedTasks.find(x=>x.taskId==='scrapyjs.capture');
assert(task?.manifestHash&&task?.contentHash);
const buttonStub='window.OpenDeskSidebarUI=Object.freeze({Button:function(props){const p={...props};delete p.variant;return OpenDeskPageReact.createElement("button",p);}});';
const page='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<link rel="stylesheet" href="/tool.css"></head><body><div id="tool-root"><div id="tool-app"></div></div>'+
 '<script>window.__opendeskPreviewScenario="success";window.__opendeskPreviewTask='+JSON.stringify(task)+';</script>'+
 ['/mock.js','/react.js','/sdk.js','/model.js','/tool.js']
 .map(src=>'<script src="'+src+'"></script>'+(src==='/react.js'?'<script>'+buttonStub+'</script>':'')).join('')+'</body></html>';
const server=createServer((req,res)=>{
 const name=req.url?.split('?')[0];
 if(name!=='/'&&!Object.hasOwn(assets,name)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',name==='/'?'text/html;charset=utf-8':name==='/tool.css'?'text/css':'text/javascript');
 res.end(name==='/'?page:assets[name]);
});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
const profile=await mkdtemp(join(tmpdir(),'scrapyjs-chromium-'));
const child=spawn(process.env.CHROME_BIN,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
 '--no-first-run','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let socket,sequence=0;const pending=new Map(),errors=[],checks=[];
function call(method,params={}){
 return new Promise((ok,bad)=>{
   const id=++sequence;
   const timeout=setTimeout(()=>{pending.delete(id);bad(Error('CDP timeout: '+method));},15000);
   pending.set(id,{ok:x=>{clearTimeout(timeout);ok(x);},bad:e=>{clearTimeout(timeout);bad(e);}});
   socket.send(JSON.stringify({id,method,params}));
 });
}
async function read(expression){
 const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.text);
 return r.result?.value;
}
async function until(expression,name){
 for(let i=0;i<120;i++){
   if(await read(expression).catch(()=>false))return;
   await new Promise(ok=>setTimeout(ok,100));
 }
 throw Error('UI timeout: '+name);
}
async function click(selector){
 const ok=await read('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');'+
   'if(!el||el.disabled)return false;el.click();return true;})()');
 assert.equal(ok,true,'Enabled control missing: '+selector);
}
const report={status:'STARTED',kind:'CHROMIUM_ORIGINAL_REACT_SIMULATED_SDK_AND_BUTTON_STUB',sourceCommit:process.env.GITHUB_SHA||null,
 installed:false,realCapture:false,network:false,android:false,checks,errors};
try{
 let port;
 for(let i=0;i<120;i++){
   assert.equal(child.exitCode,null,'Chrome exited');
   try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
   if(port)break;await new Promise(ok=>setTimeout(ok,100));
 }
 assert(port,'Chrome debugging port unavailable');
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=targets.find(x=>x.type==='page');assert(tab?.webSocketDebuggerUrl);
 socket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((ok,bad)=>{
  socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',bad,{once:true});
 });
 socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.method==='Runtime.exceptionThrown')errors.push(message.params?.exceptionDetails?.text||'runtime exception');
   const p=pending.get(message.id);
   if(p){pending.delete(message.id);message.error?p.bad(Error(message.error.message)):p.ok(message.result);}
 });
 await call('Runtime.enable');await call('Page.enable');
 await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
 await until('Boolean(document.querySelector("#config-heading")) && '+
   'document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")','React initial state');
 checks.push('Real Chromium renders original React with minimal Button shim and memory-only mock');
 assert.equal(await read('document.querySelector("#config-heading").textContent'),'采集配置');
 assert.equal(await read('document.querySelector("#target-heading").textContent'),'采集目标');
 checks.push('Original capture/target headings preserved');
 await click('#tab-rules');
 assert.equal(await read('document.querySelector("#rules-editor").hidden'),false);
 await click('#tab-json');
 assert.equal(await read('document.querySelector("#json-panel").hidden'),false);
 await click('#tab-results');
 checks.push('Original rules / JSON / results tabs remain functional');
 await until('!document.querySelector("#start").disabled','Mock ready');
 await click('#start');
 await until('document.querySelector("#run-summary").textContent.includes("采集完成")','SIMULATED result');
 assert.equal(await read('document.querySelectorAll("#record-table tbody tr").length'),2);
 assert.equal(await read('document.querySelector("#record-table").textContent.includes("纯模拟结果")'),true);
 checks.push('Simulated records visible; no live target request');
 assert.deepEqual(errors,[]);
 const shot=await call('Page.captureScreenshot',{format:'png'});
 const bytes=Buffer.from(shot.data,'base64');
 await writeFile(join(out,'preview.png'),bytes);
 report.screenshot={path:'preview.png',sha256:createHash('sha256').update(bytes).digest('hex')};
 report.status='PASS_CHROMIUM_SIMULATED_UI';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 if(socket)socket.close();
 child.kill('SIGTERM');
 await new Promise(ok=>{if(child.exitCode!==null)return ok();child.once('exit',ok);setTimeout(ok,2000).unref();});
 await new Promise(ok=>server.close(ok));
 await rm(profile,{recursive:true,force:true,maxRetries:3}).catch(e=>{errors.push('cleanup: '+e.message);process.exitCode=1;});
 await writeFile(join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,checks:checks.length,realCapture:'NOT_TESTED',error:report.error?.message}));
}
