// Real headless Chromium test of product-owned self-generated media.
// NOT a Mac Chrome, official RunHost, or paid-video website test.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import WebSocket from 'ws';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const prefixes=['/projects/video-svip/','/projects/video-downloader/tests/fixtures/'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.mp4':'video/mp4'};
function staticServer(){
 return createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(!prefixes.some(prefix=>pathname.startsWith(prefix))){res.writeHead(403);res.end();return;}
   const file=resolve(root,'.'+pathname);
   if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
   const bytes=await readFile(file);
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   res.end(bytes);
  }catch{res.writeHead(404);res.end();}
 });
}
function chromeExecutable(){
 if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
 for(const name of ['google-chrome-stable','google-chrome','chromium','chromium-browser']){
  try{return execFileSync('which',[name],{encoding:'utf8'}).trim();}catch{}
 }
 throw Error('CHROMIUM_NOT_TESTED: Chrome executable missing from runner');
}
class CDP{
 constructor(ws){
  this.ws=ws;this.id=0;this.waiting=new Map();
  ws.on('message',buffer=>{
   let message;try{message=JSON.parse(buffer.toString());}catch{return;}
   if(!message.id)return;
   const item=this.waiting.get(message.id);if(!item)return;this.waiting.delete(message.id);
   if(message.error)item.reject(Error(message.error.message||JSON.stringify(message.error)));
   else item.resolve(message.result||{});
  });
  ws.on('close',()=>{
   for(const task of this.waiting.values())task.reject(Error('CDP disconnected'));
   this.waiting.clear();
  });
 }
 static async connect(url){
  const ws=new WebSocket(url);
  await new Promise((done,fail)=>{ws.once('open',done);ws.once('error',fail);});
  return new CDP(ws);
 }
 send(method,params={}){
  const id=++this.id;
  return new Promise((resolve,reject)=>{
   this.waiting.set(id,{resolve,reject});
   try{this.ws.send(JSON.stringify({id,method,params}));}
   catch(error){this.waiting.delete(id);reject(error);}
  });
 }
 async evaluate(expression){
  const value=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw Error(value.exceptionDetails.text||'Runtime exception');
  return value.result?.value;
 }
 async click(selector){
  await this.evaluate('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"center"})');
  const rect=await this.evaluate('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');'+
   'if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,'+
   'w:r.width,h:r.height,hidden:el.hidden,disabled:el.disabled};})()');
  assert.ok(rect&&rect.w>1&&rect.h>1&&!rect.hidden&&!rect.disabled,'Not clickable: '+selector);
  await this.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',
   x:rect.x,y:rect.y,clickCount:1});
  await this.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',
   x:rect.x,y:rect.y,clickCount:1});
 }
 close(){this.ws.close();}
}
async function eventually(read,predicate,label,limit=12000){
 const deadline=Date.now()+limit;let last=null;
 while(Date.now()<deadline){
  try{last=await read();if(predicate(last))return last;}catch(error){last=String(error);}
  await sleep(100);
 }
 throw Error('TIMEOUT '+label+'; last='+JSON.stringify(last));
}
async function main(){
 const server=staticServer();
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const port=server.address().port;
 const base='http://127.0.0.1:'+port+'/projects/video-svip/preview/index.html';
 const profile=await mkdtemp(join(tmpdir(),'video-svip-r04a-'));
 let chrome=null,cdp=null;
 try{
  chrome=spawn(chromeExecutable(),[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
   '--remote-debugging-port=0','--window-size=1150,950',
   '--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  const raw=await eventually(()=>readFile(join(profile,'DevToolsActivePort'),'utf8')
   .catch(()=>null),value=>typeof value==='string'&&/^\d+\n/.test(value),'Chrome debugging port');
  const debugPort=Number(raw.split('\n')[0]);
  const target=await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(base),
   {method:'PUT'}).then(response=>response.json());
  assert.ok(target.webSocketDebuggerUrl,'No Chrome page target');
  cdp=await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');

  async function scene(name){
   await cdp.send('Page.navigate',{url:base+'?scene='+encodeURIComponent(name)});
   await eventually(()=>cdp.evaluate('Boolean(document.readyState==="complete"&&'+
    'window.OpenDeskTool?.demoScene==='+JSON.stringify(name)+'&&'+
    'document.querySelector("#vp-source-status")&&'+
    'document.querySelector("#vp-title")?.textContent!=="未识别影片")'),
    Boolean,'scene '+name);
   await eventually(()=>cdp.evaluate('document.querySelector("#vp-source-name")?.textContent'),
    value=>typeof value==='string'&&!value.includes('暂无推荐'),'sources '+name);
  }
  const observation=()=>cdp.evaluate('(()=>{const v=document.querySelector("#vp-owned-video");'+
   'return {status:document.querySelector("#vp-source-status")?.textContent,'+
   'proof:document.querySelector("#vp-source-evidence")?.textContent,'+
   'source:document.querySelector("#vp-source-name")?.textContent,'+
   'title:document.querySelector("#vp-title")?.textContent,'+
   'actionHidden:document.querySelector("#vp-source-play")?.hidden,'+
   'width:v?.videoWidth||0,time:v?.currentTime||0,'+
   'paused:v?.paused,ended:v?.ended,src:v?.getAttribute("src")||""};})()');
  let count=0;
  const report=(label,result)=>{count++;console.log('CHROMIUM_R04A '+label+' '+JSON.stringify(result));};

  await scene('tencent');
  const official=await observation();
  assert.match(official.status,/OFFICIAL_LINK_AVAILABLE/);
  assert.equal(official.src,'');
  report('official_link_only',{status:official.status,srcEmpty:true});

  await scene('r04a-success');
  await cdp.click('#vp-source-play');
  const success=await eventually(observation,value=>/视频帧/.test(value?.status||''),'real video frame and time');
  assert.ok(success.width>0&&success.time>=.08,'Real frame/time missing despite claimed status');
  report('self_authored_media',{status:success.status,width:success.width,time:success.time});

  await scene('r04a-fallback');
  await cdp.click('#vp-source-play');
  let recovery=await eventually(observation,
   value=>/视频帧|再次点击播放|均明确失败|结果不可确认/.test(value?.status||''),
   '404 fallback outcome');
  const initial=recovery.status;
  if(/再次点击播放/.test(initial)){
   await cdp.click('#vp-source-play');
   recovery=await eventually(observation,value=>/视频帧/.test(value?.status||''),
    'manual gesture for backup');
  }
  assert.match(recovery.status,/视频帧/);
  assert.ok(recovery.width>0&&recovery.time>=.08);
  report('404_to_backup',{initial,final:recovery.status,width:recovery.width,time:recovery.time});

  await scene('r04a-unavailable');
  await cdp.click('#vp-source-play');
  const failed=await eventually(observation,
   value=>/均明确失败|结果不可确认/.test(value?.status||''),'both broken sources');
  assert.match(failed.status,/均明确失败/);
  report('all_failed',{status:failed.status,proof:failed.proof});

  for(const name of ['r04a-unauthorized','r04a-region','r04a-entitlement']){
   await scene(name);const blocked=await observation();
   assert.equal(blocked.actionHidden,true);assert.equal(blocked.src,'');
   report('blocked_'+name,{playButtonHidden:true});
  }
  await scene('r04a-unknown');
  const unknown=await observation();
  assert.match(unknown.status,/UNKNOWN/);assert.equal(unknown.src,'');
  report('unobservable_iframe',{status:unknown.status});

  await scene('r04a-manual');
  await cdp.click('#vp-watch .vp-source-card details summary');
  await cdp.click('#vp-source-list button');
  const manual=await eventually(observation,
   value=>/视频帧/.test(value?.status||'')&&value?.source?.includes('B'),
   'manual source B video playback');
  report('manual_override',{source:manual.source,status:manual.status});

  await scene('r04a-success');
  await cdp.click('#vp-source-play');await cdp.click('#vp-stop');
  const stopped=await observation();
  assert.match(stopped.status,/已停止测试播放/);assert.equal(stopped.src,'');
  await sleep(700);assert.match((await observation()).status,/已停止测试播放/);
  report('stop_invalidates',{status:stopped.status,srcEmpty:true});

  for(const width of [320,360,400,440,520]){
   await cdp.send('Emulation.setDeviceMetricsOverride',
    {width,height:900,deviceScaleFactor:1,mobile:false});
   await scene('r04a-success');
   const layout=await cdp.evaluate('(()=>{const r=document.querySelector(".fixture")?.getBoundingClientRect();'+
    'return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,'+
    'fixtureWidth:r?.width||0,fixtureRight:r?.right||0};})()');
   assert.ok(layout.fixtureWidth>0&&layout.fixtureWidth<=width+2,
    'Fixture overflow at '+width+': '+JSON.stringify(layout));
   report('responsive_'+width,layout);
  }
  console.log('CHROMIUM_R04A_PASS '+JSON.stringify({checks:count,
   sha:process.env.GITHUB_SHA||'LOCAL_UNCOMMITTED',media:'self-generated-1s-MP4'}));
 }finally{
  cdp?.close();
  if(chrome){chrome.kill('SIGTERM');await sleep(250);if(!chrome.killed)chrome.kill('SIGKILL');}
  server.close();await rm(profile,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error('CHROMIUM_R04A_FAIL',error);process.exitCode=1;});
