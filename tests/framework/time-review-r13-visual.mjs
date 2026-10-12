// Real Chromium layout/input audit for actual Time Review R1.3 HTML/CSS/JS.
// Uses synthetic fixtures; screenshots MUST NOT be labeled native Side Panel acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root=path.resolve('examples/sidebar-tools/time-review/src');
const output=path.resolve(process.argv[2]||'artifacts/time-review-r13-visual');
const [html,css,js]=await Promise.all(['index.html','style.css','main.js'].map(p=>readFile(path.join(root,p),'utf8')));
const categories=[360000,3600000,1800000,720000,720000,0];
const summary={
  today:'2026-10-12',todayMs:7200000,weekMs:19000000,yesterdayMs:3600000,
  days:[{date:'2026-10-12',ms:7200000},{date:'2026-10-11',ms:3600000}],
  sites:[{host:'example.com',ms:3600000},{host:'docs.example',ms:1800000}],
  todaySites:[{host:'example.com',ms:3600000},{host:'docs.example',ms:1800000}],
  siteCategories:{'example.com':1,'docs.example':2},
  todayCategoryMs:categories,todayImportantMs:5400000,todayProductivityPct:null,todayClassifiedMs:6840000,
  paused:false,authorized:true,minuteConsent:true,trackingHost:'example.com',idlePermission:true,discardedMs:0,
  settings:{idleSeconds:60,retentionDays:90,excludedHosts:[]}
};
const detail={
  date:'2026-10-12',totalMs:7200000,importantMs:5400000,productivityPct:null,classifiedMs:6840000,
  categoryMs:categories,timelineStatus:'partial',minuteConsent:true,minuteCoveredMs:175000,
  minuteSlots:[[540,1,60000,'example.com'],[541,2,60000,'docs.example'],[542,0,25000,'news.example'],[700,3,30000,'social.example']],
  sites:[{host:'example.com',ms:3600000,category:1},{host:'docs.example',ms:1800000,category:2},
    {host:'news.example',ms:720000,category:3},{host:'social.example',ms:720000,category:4},
    {host:'video.example',ms:360000,category:0}]
};
const fixture=[
  'window.__timeReviewFixture=true;window.__fixtureErrors=[];',
  "window.addEventListener('error',e=>window.__fixtureErrors.push(String(e.message)));",
  'const summary='+JSON.stringify(summary)+';',
  'const detail='+JSON.stringify(detail)+';',
  "globalThis.OpenDeskTool={root:document.querySelector('.review'),request:async(operation,payload={})=>{",
  "if(operation==='time.status')return structuredClone(summary);",
  "if(operation==='time.day')return {...structuredClone(detail),date:payload.date};",
  "if(operation==='time.start'||operation==='time.clear'||operation==='time.minuteConsent')",
  "throw Object.assign(Error('请在受信任宿主设置中操作'),{code:'E_TIME_TRUSTED_CLICK'});",
  "return structuredClone(summary);}};"
].join('\n');
const page='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R1.3 fixture — not native Side Panel</title><link rel="stylesheet" href="/style.css"></head><body style="margin:0;padding:0">'+html+'<script src="/mock.js"></script><script src="/main.js"></script></body></html>';
const server=createServer((req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  const val=route==='/style.css'?css:route==='/main.js'?js:route==='/mock.js'?fixture:page;
  const type=route==='/style.css'?'text/css':route.endsWith('.js')?'application/javascript':'text/html';
  res.writeHead(200,{'content-type':type+';charset=utf-8'});res.end(val);
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'od-time-r13-'));
const bin=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run',
  '--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='',client;
chrome.stderr.on('data',data=>stderr=(stderr+String(data)).slice(-2000));
const report={kind:'real-source-UI-with-synthetic-requests-NOT_NATIVE',viewports:[],inputs:{},errors:[]};
function clientFor(endpoint){
  const ws=new WebSocket(endpoint),pending=new Map();let seq=0;
  ws.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(!msg.id){if(msg.method==='Runtime.exceptionThrown')report.errors.push(String(msg.params?.exceptionDetails?.text||'Runtime exception'));return;}
    const p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timeout);
    msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);
  };
  return {
    ready:new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;}),
    send(method,params={},sessionId){return new Promise((resolve,reject)=>{
      const id=++seq,timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);
      pending.set(id,{resolve,reject,timeout});
      ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });},
    close:()=>ws.close()
  };
}
async function until(get,label){
  const end=Date.now()+15000;let last;
  while(Date.now()<end){try{const got=await get();if(got)return got;}catch(e){last=String(e);}await sleep(100);}
  throw Error('timeout '+label+' '+last+' '+stderr);
}
async function evaluate(expression,sid){
  const v=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sid);
  if(v.exceptionDetails)throw Error('Browser JS '+JSON.stringify(v.exceptionDetails));
  return v.result.value;
}
const measure="(()=>{const a=document.querySelector('.review').getBoundingClientRect(),c=document.querySelector('#minute-canvas'),r=c.getBoundingClientRect();return {width:innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),rootLeft:a.left,rootRight:a.right,canvasLeft:r.left,canvasTop:r.top,canvasWidth:r.width,backing:c.width,dpr:devicePixelRatio,quadrants:document.querySelectorAll('.qcard').length,extras:document.querySelectorAll('.extra-card').length,errors:window.__fixtureErrors};})()";
let failed=false;
try{
  const lines=await until(async()=>{const v=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);return v?.trim().split('\n');},'Chrome debugger');
  client=clientFor('ws://127.0.0.1:'+lines[0]+lines[1]);await client.ready;
  const target=await client.send('Target.createTarget',{url:'http://127.0.0.1:'+server.address().port+'/'});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await client.send('Page.enable',{},sessionId);await client.send('Runtime.enable',{},sessionId);
  await until(()=>evaluate("document.querySelector('#timeline-state')?.textContent==='部分分钟明细'",sessionId),'tool render');
  async function testSize(width,dpr=1,label=String(width)){
    await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:dpr,mobile:false},sessionId);
    await sleep(250);
    const m=await evaluate(measure,sessionId);
    assert.equal(m.width,width);
    assert.ok(m.scroll<=width+1,'horizontal overflow '+label+' '+JSON.stringify(m));
    assert.ok(m.rootLeft>=-1&&m.rootRight<=width+1,'root overflow '+label);
    assert.ok(m.canvasWidth>0&&m.canvasWidth<=width,'canvas width '+label);
    assert.ok(Math.abs(m.backing-m.canvasWidth*m.dpr)<=2,'DPR backing mismatch '+label);
    assert.equal(m.quadrants,4);assert.equal(m.extras,2);
    assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.q-name')).map(el=>el.textContent)",sessionId),
      ['重要且紧急','重要不紧急','紧急不重要','不重要不紧急']);
    assert.deepEqual(m.errors,[],'runtime errors '+label);
    const png=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
    const file='r13-fixture-'+label+'.png';
    await writeFile(path.join(output,file),Buffer.from(png.data,'base64'));
    report.viewports.push({...m,file,scale:dpr});
  }
  for(const width of [320,360,400,600])await testSize(width);
  await client.send('Emulation.setDeviceMetricsOverride',{width:360,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await sleep(220);
  await evaluate("document.querySelector('#minute-canvas').focus()",sessionId);
  for(const [key,code,vk] of [['Home','Home',36],['ArrowRight','ArrowRight',39]]){
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk},sessionId);
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk},sessionId);
  }
  const keyboard=await evaluate("Number(document.querySelector('#minute-canvas').getAttribute('aria-valuenow'))",sessionId);
  assert.equal(keyboard,1,'keyboard should advance exactly one minute');report.inputs.keyboard=keyboard;
  const g=await evaluate("(()=>{const r=document.querySelector('#minute-canvas').getBoundingClientRect();return{x:r.left+r.width*540/1440+.1,y:r.top+12,w:r.width}})()",sessionId);
  await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:g.x,y:g.y,button:'none'},sessionId);
  const pointer=await evaluate("Number(document.querySelector('#minute-canvas').getAttribute('aria-valuenow'))",sessionId);
  assert.ok(Math.abs(pointer-540)<=5,'mouse minute '+pointer);report.inputs.pointer=pointer;
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},sessionId);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:g.x+g.w*60/1440,y:g.y}]},sessionId);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId);
  const touch=await evaluate("Number(document.querySelector('#minute-canvas').getAttribute('aria-valuenow'))",sessionId);
  assert.ok(Math.abs(touch-600)<=6,'touch minute '+touch);report.inputs.touch=touch;
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:false},sessionId);
  await testSize(320,2,'dpr2-equivalent-not-real-browser-zoom');
  assert.deepEqual(report.errors,[],'CDP Runtime.exceptionThrown');
}catch(e){failed=true;report.failure={error:String(e),stack:e.stack?.slice(0,1200)};console.error(e);}
finally{
  await writeFile(path.join(output,'visual-report.json'),JSON.stringify(report,null,2)+'\n');
  try{client?.close();}catch{}
  chrome.kill('SIGTERM');await sleep(300);if(chrome.exitCode===null)chrome.kill('SIGKILL');
  server.close();await rm(profile,{recursive:true,force:true});
}
console.log(JSON.stringify({status:failed?'FAIL':'PASS',screens:report.viewports.map(x=>x.file),inputs:report.inputs,errors:report.errors}));
if(failed)process.exitCode=1;
