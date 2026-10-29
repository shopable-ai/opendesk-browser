#!/usr/bin/env node
// Focused R21-style HTTP/source fixture, not installed-extension or live ChatGPT acceptance.
// Node >=22; CHROME_BIN may select an isolated Chromium executable. No builds/dependencies.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const out=resolve(process.argv[2]||join(root,'artifacts/prompt-scroll-icons-01a16cdf'));
const tool='projects/prompt-shortcuts/';
const pkg=JSON.parse(await readFile(join(root,tool+'prompt-shortcuts.opendesk-tool.json'),'utf8'));
const paths=['M5 4h14M12 20V8m-6 6 6-6 6 6','M5 20h14M12 4v12m-6-6 6 6 6-6',
  'M17 11l-5-5-5 5m10 7-5-5-5 5','M7 6l5 5 5-5M7 13l5 5 5-5'];
const sourcePaths=[tool+'trusted/page.js','examples/programs/chatgpt-jump-top/src/conversation.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>
  [path,createHash('sha256').update(await readFile(join(root,path))).digest('hex')])));
const report={kind:'CHROMIUM_HTTP_TRUSTED_SOURCE_MOCK_HOST',installedExtension:false,
  realThirdPartySite:false,zoom:{},scenes:[],errors:[],sourceHashes:await hashes(),
  limitations:['Host/storage and ChatGPT location facade are simulated, as in R21.',
    'Fixed long-content fixture; no installed Chrome, live site, IME or production acceptance.',
    'HTML preview is outside this focused trusted-source run.']};
await mkdir(out,{recursive:true});
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px/1.5 system-ui;background:#f4f5f7;color:#222}
html.dark,html.dark body{background:#17191d;color:#eee;color-scheme:dark}
main{position:fixed;top:12px;bottom:12px;left:50%;transform:translateX(-50%);width:min(760px,calc(100% - 24px))}
#transcript{height:calc(100% - 150px);overflow:auto;overscroll-behavior:contain}
article{padding:8px}#before,#after{height:700px;background:#8881}
#reply{height:260px;overflow:auto;border:1px solid #888;overscroll-behavior:contain}
#reply p{margin:0;padding:12px;height:1300px;white-space:pre-line}
#actions{display:flex;align-items:center;gap:4px;min-height:38px}
#actions>button{width:34px;height:34px}#composer{height:140px;padding:12px 8px 4px 80px}
textarea{width:100%;height:72px;display:block}#send{float:right;height:32px;margin-top:6px}
#native{position:fixed;right:18px;bottom:180px;width:42px;height:42px}
</style><main id="main"><div id="transcript">
<article id="before" data-testid="conversation-turn-0">此前消息（固定长内容）</article>
<article data-testid="conversation-turn-1"><div id="reply" data-content-search-unit-key="reply" data-chatgpt-search-unit-key="reply">
<p>固定长回复开始\n${'固定段落用于导航验收。\n'.repeat(35)}固定长回复结束</p></div>
<div id="actions"><button aria-label="复制">拷</button><button aria-label="重新生成回复">再</button><button aria-label="评价回复">评</button></div></article>
<article id="after" data-testid="conversation-turn-2">后续消息（固定长内容）</article>
</div><form id="composer"><textarea id="prompt-textarea">原有草稿</textarea><button id="send">发送</button></form></main>
<button id="native" aria-label="网站原生控件">原生</button><script type="module" src="/boot.js"></script>`;
const boot=`import {initPromptShortcuts} from '/${tool}trusted/page.js';
const pkg=${JSON.stringify(pkg)}, changes=new Set();
const items=Array.from({length:5},(_,i)=>({id:'scroll-prompt-'+i,label:'词'+i,name:'提示词 '+i,
 body:'真实保存提示词 '+i,shape:'square',enabled:true,order:i}));
const DATA='opendesk.sidebar-tools.data.v1:prompt-shortcuts';
const values={'opendesk.sidebar-tools.installed.v1':[pkg],'opendesk.sidebar-tools.enabled.v1':{},
 'opendesk.sidebar-tools.revocation-epochs.v1':{'prompt-shortcuts':'scroll-fixture'},
 [DATA]:{library:{schema:1,items,settings:{webButtons:true,scrollNavigation:{regionTop:true,
 regionBottom:true,conversationTop:true,conversationBottom:true,floatingTop:false}}},sites:{schema:1,rules:[]}}};
const original=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(options){const shadow=original.call(this,options);
 if(this.hasAttribute('data-opendesk-prompts'))window.__rail=shadow;
 if(this.hasAttribute('data-opendesk-prompts-floating'))window.__dock=shadow;return shadow;};
const api={runtime:{id:'fixture-extension',getURL:()=> 'chrome-extension://fixture-extension/',
 onMessage:{addListener(){},removeListener(){}}},storage:{local:{async get(keys){return Object.fromEntries(
 keys.filter(key=>Object.hasOwn(values,key)).map(key=>[key,structuredClone(values[key])]))}},
 onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}}};
// Only location is a facade. Browser viewport values stay live during CDP resize/zoom.
const real=window,win={location:{href:'https://chatgpt.com/c/fixed-scroll-fixture'},navigator:real.navigator,
 MutationObserver:real.MutationObserver,ResizeObserver:real.ResizeObserver};
for(const key of ['innerWidth','innerHeight'])Object.defineProperty(win,key,{get:()=>real[key]});
for(const key of ['addEventListener','removeEventListener','setTimeout','clearTimeout','setInterval',
 'clearInterval','getComputedStyle','matchMedia','scrollTo'])win[key]=real[key].bind(real);
win.top=win;
window.__effects={send:0,native:0,input:0};
document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.__effects.send++});
document.querySelector('#native').onclick=()=>window.__effects.native++;
document.querySelector('textarea').addEventListener('input',()=>window.__effects.input++);
window.__configure=(count,dark)=>{document.documentElement.classList.toggle('dark',dark);
 values[DATA].library.items=items.slice(0,count);
 for(const fn of changes)fn({[DATA]:{newValue:values[DATA]}},'local');};
window.__controller=initPromptShortcuts({api,doc:document,win});window.__ready=true;`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/fixture'||path==='/boot.js'){
    res.writeHead(200,{'content-type':path==='/fixture'?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'});res.end(path==='/fixture'?html:boot);return;
  }
  try{
    const full=resolve(root,'.'+decodeURIComponent(path));
    assert(full.startsWith(root+sep)&&full.endsWith('.js'));
    res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile(full));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/fixture';
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
let child,profile,socket,seq=0;
const pending=new Map();
function rpc(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},12000);
    pending.set(id,{ok,fail,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
async function poll(expression){
  for(let i=0;i<80;i++){if(await evaluate(expression))return;await delay(80);}
  throw Error('Timed out: '+expression);
}
async function click(expression){
  const r=await evaluate(`(()=>{const n=${expression},r=n.getBoundingClientRect();
    if(n.disabled||r.width<1||r.height<1||r.top<0||r.bottom>innerHeight)throw Error('Click target unavailable');
    return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for(const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],
    ['mouseReleased',{button:'left',clickCount:1}]])await rpc('Input.dispatchMouseEvent',{type,...r,...extra});
}
const replyRoot='document.querySelector("#actions [data-opendesk-chatgpt-jump-top]").shadowRoot';
const replyButton=i=>`${replyRoot}.querySelectorAll('button')[${i}]`;
const dockButton=i=>`window.__dock.querySelectorAll('button')[${i}]`;
async function stop(){
  socket?.close();socket=null;
  if(child){child.kill('SIGTERM');await Promise.race([new Promise(ok=>child.once('exit',ok)),delay(1800)]);child=null;}
  if(profile){await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});profile=null;}
}
async function start(zoom){
  profile=await mkdtemp(join(tmpdir(),'prompt-scroll-icons-'));
  await mkdir(join(profile,'Default'));
  await writeFile(join(profile,'Default/Preferences'),JSON.stringify({partition:{default_zoom_level:Math.log(zoom)/Math.log(1.2)}}));
  const executable=process.env.CHROME_BIN||(process.platform==='darwin'
    ?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'chromium');
  child=spawn(executable,['--headless=new','--no-sandbox','--no-first-run','--disable-gpu',
    '--disable-dev-shm-usage','--window-size=1200,900','--user-data-dir='+profile,
    '--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  let spawnError;child.once('error',e=>{spawnError=e});
  let port;
  for(let i=0;i<100;i++){
    if(spawnError)throw spawnError;
    if(child.exitCode!==null)throw Error('Chromium exited '+child.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;await delay(80);
  }
  assert(port,'isolated Chromium DevTools port');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const r=JSON.parse(event.data),p=pending.get(r.id);
    if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.fail(Error(r.error.message)):p.ok(r.result);}
    if(r.method==='Runtime.exceptionThrown')report.errors.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);
  });
  await rpc('Page.enable');await rpc('Runtime.enable');
  report.browser=await rpc('Browser.getVersion');
  await rpc('Page.navigate',{url});await poll('window.__ready&&window.__rail?.querySelector(".item")');
  return evaluate('({innerWidth,outerWidth,innerHeight,outerHeight,dpr:devicePixelRatio,screenWidth:screen.width,visualScale:visualViewport.scale})');
}
async function scene(name,count,dark){
  await evaluate(`window.__configure(${count},${dark});document.querySelector('textarea').value='原有草稿';
    document.querySelector('#transcript').scrollTop=700;document.querySelector('#reply').scrollTop=400;`);
  await poll(`window.__rail?.querySelectorAll('.item').length===${count}&&window.__dock?.querySelectorAll('button').length===2&&!!${replyRoot}`);
  await delay(300);
  const metrics=await evaluate(`(()=>{
    const roots=[${replyRoot},window.__dock],buttons=roots.flatMap(root=>[...root.querySelectorAll('button')]);
    const icons=buttons.map(b=>{const svg=b.querySelector('svg'),s=getComputedStyle(svg);return {
      path:svg.querySelector('path').getAttribute('d'),width:s.width,height:s.height,stroke:s.strokeWidth};});
    const rail=window.__rail.querySelector('.rail'),r=rail.getBoundingClientRect(),dock=roots[1],
      rects=[...dock.querySelectorAll('button')].map(b=>b.getBoundingClientRect().toJSON());
    const obstacles=[...document.querySelectorAll('textarea,#send,#native,#actions>button')].map(n=>n.getBoundingClientRect());
    return {icons,replyOpen:roots[0].mode==='open',dockClosed:dock.mode==='closed'&&dock.host.shadowRoot===null,
      separate:!dock.host.closest('[data-opendesk-prompts]'),dockRects:rects,
      overlap:rects.some(a=>obstacles.some(b=>b.width>0&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)),
      rail:{count:rail.querySelectorAll('button').length,labels:[...rail.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')),
        brandFirst:rail.firstElementChild?.className==='brand'&&rail.querySelectorAll('.brand').length===1,
        unwanted:!!window.__rail.querySelector('[data-scroll-conversation],[data-scroll-nav-key]'),
        overflowX:rail.scrollWidth>rail.clientWidth+1,overflowY:rail.scrollHeight>rail.clientHeight+1,rect:r.toJSON()},
      dark:window.__rail.host.classList.contains('dark')&&dock.host.classList.contains('dark')};})()`);
  assert.deepEqual(metrics.icons.map(i=>i.path),paths,'four exact SVG paths');
  for(const icon of metrics.icons){assert.equal(icon.width,'20px');assert.equal(icon.height,'20px');assert.equal(parseFloat(icon.stroke),1.7);}
  assert(metrics.replyOpen&&metrics.dockClosed&&metrics.separate,'independent shadow owners');
  assert.equal(metrics.overlap,false,'dock clears composer/send/native controls');
  const [a,b]=metrics.dockRects;
  assert(Math.abs(a.x-b.x)<1&&b.y>=a.bottom&&b.y-a.bottom<=8&&a.width<=42&&b.bottom-a.top<=92,'compact vertical dock');
  for(const rect of [a,b,metrics.rail.rect])assert(rect.left>=0&&rect.right<=await evaluate('innerWidth')+1&&rect.top>=0&&rect.bottom<=await evaluate('innerHeight')+1,'controls inside viewport');
  assert.equal(metrics.rail.count,count+1);assert.equal(metrics.rail.brandFirst,true);
  assert.equal(metrics.rail.unwanted,false);
  assert.deepEqual(metrics.rail.labels,['打开提示词快捷按钮管理侧栏',
    ...Array.from({length:count},(_,i)=>'插入提示词：提示词 '+i)]);
  assert(!metrics.rail.overflowX&&!metrics.rail.overflowY,'3–5 saved prompts need no scrollbar');
  assert.equal(metrics.dark,dark);
  const outer=await evaluate('document.querySelector("#transcript").scrollTop');
  await click(replyButton(0));await poll('document.querySelector("#reply").scrollTop<=2');
  assert.equal(await evaluate('document.querySelector("#transcript").scrollTop'),outer,'reply top preserves transcript');
  await click(replyButton(1));await poll('(()=>{const n=document.querySelector("#reply");return Math.abs(n.scrollTop-n.scrollHeight+n.clientHeight)<=2})()');
  assert.equal(await evaluate('document.querySelector("#transcript").scrollTop'),outer,'reply bottom preserves transcript');
  const inner=await evaluate('document.querySelector("#reply").scrollTop');
  await click(dockButton(1));await poll('(()=>{const n=document.querySelector("#transcript");return Math.abs(n.scrollTop-n.scrollHeight+n.clientHeight)<=2})()');
  assert.equal(await evaluate('document.querySelector("#reply").scrollTop'),inner,'conversation bottom preserves reply');
  await click(dockButton(0));await poll('document.querySelector("#transcript").scrollTop<=2');
  assert.equal(await evaluate('document.querySelector("#reply").scrollTop'),inner,'conversation top preserves reply');
  await click(`window.__rail.querySelectorAll('.item')[${count-1}]`);
  await poll(`document.querySelector('textarea').value===${JSON.stringify('原有草稿\n真实保存提示词 '+(count-1))}`);
  const effects=await evaluate('window.__effects');assert.equal(effects.send,0);assert.equal(effects.native,0);assert(effects.input>0);
  // Restore the reply toolbar to the viewport for the source-bound screenshot.
  await evaluate('document.querySelector("#transcript").scrollTop=700');await delay(200);
  const shot=await rpc('Page.captureScreenshot',{format:'png'});
  await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));
  report.scenes.push({name,count,metrics,fourTrustedClicks:true,isolatedScrollports:true,draftOnly:true,effects});
  console.log('PASS',name);
}
try{
  report.zoom.baseline=await start(1);
  for(const dark of [false,true])await scene('desktop-'+(dark?'dark':'light'),3,dark);
  await rpc('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:false});
  for(const dark of [false,true])await scene('360px-'+(dark?'dark':'light'),5,dark);
  await stop();report.zoom.preferences200=await start(2);
  const base=report.zoom.baseline,z=report.zoom.preferences200;
  const native=Math.abs(z.innerWidth*2-base.innerWidth)<=4&&Math.abs(z.dpr/base.dpr-2)<.05&&z.outerWidth===base.outerWidth;
  report.zoom.mode=native?'REAL_BROWSER_ZOOM_200_PREFERENCES':'SIMULATED_HALF_VIEWPORT_NOT_BROWSER_ZOOM';
  if(!native)await rpc('Emulation.setDeviceMetricsOverride',{width:Math.round(base.innerWidth/2),height:Math.round(base.innerHeight/2),deviceScaleFactor:1,mobile:false});
  for(const dark of [false,true])await scene('200pct-'+(dark?'dark':'light'),4,dark);
  assert.deepEqual(await hashes(),report.sourceHashes,'source files unchanged during evidence capture');
  assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){
  report.status='FAIL';report.failure=String(error.stack||error);process.exitCode=1;
  try{const shot=await rpc('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'failure.png'),Buffer.from(shot.data,'base64'));}catch{}
  console.error(report.failure);
}finally{
  await stop();await new Promise(ok=>server.close(ok));
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report.status,report.zoom.mode||'zoom not reached',join(out,'report.json'));
}
