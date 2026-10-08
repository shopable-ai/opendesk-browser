#!/usr/bin/env node
// Evidence grade: STATIC_PREVIEW_CHROME. No native Chrome extension is installed.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const pages=[
 {name:'R4',file:'examples/ui/sidebar-r4-installed-discovery-preview.html',widths:[360]},
 {name:'R5',file:'examples/ui/sidebar-r5-compact-preview.html',widths:[300,360,420,520]}
];
const out=resolve(process.argv[2]||'artifacts/sidebar-r5-visual');
const profile=await mkdtemp(join(tmpdir(),'sidebar-visual-'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let chrome,server,socket,serverPort,seq=0;
const pending=new Map();
function cdp(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},20000);
   pending.set(id,{resolve(v){clearTimeout(timeout);resolve(v)},reject(e){clearTimeout(timeout);reject(e)}});
   socket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const response=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(response.exceptionDetails)throw Error('CDP evaluate failure: '+JSON.stringify(response.exceptionDetails));
 return response.result.value;
}
async function connect(){
 let port;
 for(let i=0;i<100;i++){
   if(chrome.exitCode!==null)throw Error('Chrome process exited '+chrome.exitCode);
   try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port>0)break}catch{}
   await sleep(100);
 }
 if(!port)throw Error('Chrome debugging port not detected');
 const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=list.find(item=>item.type==='page');
 if(!tab?.webSocketDebuggerUrl)throw Error('No inspectable page');
 socket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 socket.addEventListener('message',ev=>{
   const value=JSON.parse(ev.data),wait=value.id&&pending.get(value.id);
   if(!wait)return;
   pending.delete(value.id);
   if(value.error)wait.reject(Error(value.error.message));else wait.resolve(value.result);
 });
 await cdp('Page.enable');await cdp('Runtime.enable');
}
async function capture(page,width){
 await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:true});
 const target='http://127.0.0.1:'+serverPort+'/'+page.file;
 const nav=await cdp('Page.navigate',{url:target});
 if(nav.errorText)throw Error(page.name+' navigation '+nav.errorText);
 for(let i=0;i<75;i++){
  if(await evaluate('document.readyState==="complete" && !!document.querySelector("[data-tab=discover]")'))break;
  if(i===74)throw Error(page.name+' page load timeout');
  await sleep(100);
 }
 const selected=await evaluate('(()=>{const tab=document.querySelector("[data-tab=discover]");tab.click();return tab.getAttribute("aria-selected")})()');
 if(selected!=='true')throw Error(page.name+' Discover did not activate');
 await sleep(220);
 const metrics=await evaluate('(()=>{const get=q=>document.querySelector(q);const rect=x=>{if(!x)return null;const v=x.getBoundingClientRect();return {top:Math.round(v.top),bottom:Math.round(v.bottom),height:Math.round(v.height)}};const content=get(".content"),box=content?.getBoundingClientRect(),rows=[...document.querySelectorAll("[data-local-pick]")];return {viewport:{width:innerWidth,height:innerHeight},header:rect(get(".top")),navigation:rect(get(".nav")),search:rect(get("#local-search")),filters:rect(get(".r5-filters")||get(".chips")),dock:rect(get(".dock")),listItems:rows.length,visibleItems:rows.filter(x=>box&&x.getBoundingClientRect().bottom<=box.bottom+1).length,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,contentOverflow:!!content&&content.scrollWidth>content.clientWidth+1};})()');
 if(metrics.documentOverflow||metrics.contentOverflow)throw Error(page.name+' '+width+'px horizontal overflow '+JSON.stringify(metrics));
 const snap=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
 await writeFile(join(out,page.name.toLowerCase()+'-discover-'+width+'x700.png'),Buffer.from(snap.data,'base64'));
 console.log('VISUAL_PREVIEW_CHECK',page.name,width,JSON.stringify(metrics));
 return {version:page.name,width,...metrics};
}
try{
 await mkdir(out,{recursive:true});
 const files=new Map(pages.map(page=>['/'+page.file,resolve(page.file)]));
 server=createServer(async(req,res)=>{
  const file=files.get(req.url?.split('?')[0]);
  if(!file){res.writeHead(404).end();return}
  try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(await readFile(file))}
  catch{res.writeHead(500).end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 serverPort=server.address().port;
 chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
   '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--hide-scrollbars',
   '--no-first-run','--no-default-browser-check','--user-data-dir='+profile,
   '--remote-debugging-port=0','about:blank'
 ],{stdio:'ignore'});
 await connect();
 const samples=[];
 for(const page of pages)for(const width of page.widths)samples.push(await capture(page,width));
 await writeFile(join(out,'metrics.json'),JSON.stringify({evidence:'STATIC_PREVIEW_CHROME',nativeSidePanel:false,samples},null,2)+'\n');
 console.log('SIDEBAR_R5_VISUAL_PREVIEW_PASS');
}finally{
 try{socket?.close()}catch{}
 try{server?.close()}catch{}
 try{chrome?.kill('SIGTERM')}catch{}
 await sleep(400);
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
