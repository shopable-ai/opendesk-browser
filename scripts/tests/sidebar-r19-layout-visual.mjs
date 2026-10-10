#!/usr/bin/env node
// STATIC_MARKUP_CHROME ONLY. Real product HTML/CSS; no extension JS or trusted user events.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve('.');
const out=resolve(process.argv[2]||'artifacts/sidebar-r19-layout-visual');
const widths=[300,360,420,520];
const scenes=[
  {name:'my',tab:'tasks'},
  {name:'discover',tab:'local-discover'},
  {name:'workflow',tab:'workflow'},
  {name:'develop',tab:'develop'},
  {name:'develop-local',tab:'develop',local:true},
  {name:'develop-details',tab:'develop',details:true},
  {name:'tools',tab:'tools'}
];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(join(tmpdir(),'sidebar-r19-static-'));
let chrome,server,socket,port,seq=0;
const pending=new Map();
function cdp(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},20000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v)},fail(e){clearTimeout(timeout);fail(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('Evaluate: '+JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function connect(){
  let debugPort;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(debugPort>0)break}catch{}
    await sleep(100);
  }
  if(!debugPort)throw Error('Chrome debug port unavailable');
  const tabs=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');
  if(!page?.webSocketDebuggerUrl)throw Error('No inspectable Chrome page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data),call=msg.id&&pending.get(msg.id);
    if(!call)return;
    pending.delete(msg.id);
    if(msg.error)call.fail(Error(msg.error.message));else call.ok(msg.result);
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
}

// Test-only fixture: visibility changes and representative rows, never a native MV3 claim.
function setupScene(scene){
  const active=scene.tab;
  for(const item of document.querySelectorAll('[data-workbench-page]'))
    item.hidden=item.dataset.workbenchPage!==active;
  for(const tab of document.querySelectorAll('[data-workbench-tab]'))
    tab.setAttribute('aria-selected',String(tab.dataset.workbenchTab===(active==='local-discover'?'discover':active==='tasks'?'tasks':active)));
  const dock=document.querySelector('#workspace-dock');
  dock.hidden=active==='local-discover'||active==='workflow'||active==='tools';
  for(const d of document.querySelectorAll('.dock-actions'))
    d.hidden=d.id!==(active==='tasks'?'task-dock':active==='develop'?'develop-dock':'workflow-dock');
  const manual=document.querySelector('#manual-source-editor');
  const local=document.querySelector('#local-project-tools');
  manual.hidden=Boolean(scene.local);
  local.hidden=!scene.local;
  const sw=document.querySelector('#local-project-mode');
  sw.checked=Boolean(scene.local);
  document.querySelector('#developer-source-switch').dataset.mode=scene.local?'local':'manual';
  for(const key of ['developer-results-panel','page-preview-tools','script-library-tools'])
    document.getElementById(key).open=Boolean(scene.details);
  const taskList=document.querySelector('#task-installed-cards');
  if(!taskList.children.length){
    for(const value of ['获取网页标题','读取表格并保存结果','检查网页状态']){
      const group=document.createElement('div');
      group.className='task-card-group';
      const btn=document.createElement('button');
      btn.className='task-card';
      btn.type='button';
      const icon=document.createElement('span');icon.className='task-card-icon';icon.textContent='◈';
      const label=document.createElement('span');label.className='task-card-copy';
      const name=document.createElement('strong');name.textContent=value;
      const desc=document.createElement('small');desc.textContent='仅用于静态布局验证的示例说明';
      label.append(name,desc);btn.append(icon,label);group.append(btn);taskList.append(group);
    }
  }
  const discover=document.querySelector('#local-discover-cards');
  if(!discover.children.length){
    for(const value of ['获取网页标题','网页表单演示','有较长标题的自动化任务名称','网页图片数量统计']){
      const item=document.createElement('button');item.className='local-discovery-card';item.type='button';
      const copy=document.createElement('span');copy.className='local-discovery-copy';
      const title=document.createElement('strong');title.textContent=value;
      const desc=document.createElement('small');desc.textContent='静态示例 · 用于验证紧凑列表的换行与对齐';
      copy.append(title,desc);item.append(copy);discover.append(item);
    }
  }
  document.querySelector('#workspace-content').scrollTop=scene.details?230:0;
  return true;
}
function measureScene(scene){
  const get=q=>document.querySelector(q);
  const radius=q=>{const el=get(q);return el?getComputedStyle(el).borderTopLeftRadius:null};
  const box=q=>{const e=get(q);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const content=get('#workspace-content');
  const panel=get('[data-workbench-page="'+scene.tab+'"]');
  const metrics={
    viewport:{width:innerWidth,height:innerHeight},
    documentOverflow:document.documentElement.scrollWidth>innerWidth+1,
    contentOverflow:content.scrollWidth>content.clientWidth+1,
    panelOverflow:panel.scrollWidth>panel.clientWidth+1,
    activePanel:scene.tab,
    corners:{},
    developGaps:[]
  };
  if(scene.tab==='tasks')metrics.corners.taskCard=radius('.task-card-group');
  if(scene.tab==='local-discover'){
    metrics.corners.import=radius('#local-discover-open-catalog');
    metrics.corners.filter=radius('.local-discovery-filters button');
    metrics.corners.filterGroup=radius('.local-discovery-filters');
    metrics.corners.list=radius('.local-discovery-list');
  }
  if(scene.tab==='workflow'){
    metrics.corners.card=radius('.workflow-card');
    metrics.corners.icon=radius('.workflow-icon-button');
  }
  if(scene.tab==='tools'){
    metrics.corners.card=radius('.sidebar-tool-official');
    metrics.corners.install=radius('#sidebar-tool-official-install');
  }
  if(scene.tab==='develop'){
    metrics.corners.page=radius('.developer-page-summary');
    metrics.corners.editor=radius('#script-source');
    const target=box('.developer-target');
    const switchBox=box('.developer-source-switch');
    const source=box(scene.local?'#local-project-tools':'#manual-source-editor');
    metrics.developGaps=[Math.round(switchBox.top-target.bottom),Math.round(source.top-switchBox.bottom)];
    const children=[...get('.developer-editor').children].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).position!=='absolute');
    const layout=children.map(e=>e.getBoundingClientRect());
    metrics.developGaps.push(...layout.slice(1).map((r,i)=>Math.round(r.top-layout[i].bottom)));
  }
  return metrics;
}
function validate(scene,width,m){
  if(m.viewport.width!==width||m.viewport.height!==700)throw Error('Unexpected viewport '+JSON.stringify(m));
  if(m.documentOverflow||m.contentOverflow||m.panelOverflow)throw Error('Horizontal overflow '+scene.name+' '+width+'px '+JSON.stringify(m));
  const expected={tasks:{taskCard:'12px'},'local-discover':{import:'8px',filter:'8px',filterGroup:'12px',list:'12px'},workflow:{card:'12px',icon:'8px'},develop:{page:'8px',editor:'12px'},tools:{card:'12px',install:'8px'}};
  for(const [key,value] of Object.entries(expected[scene.tab])){
    if(m.corners[key]!==value)throw Error('Radius mismatch '+scene.name+' '+key+': '+m.corners[key]+' expected '+value);
  }
  if(scene.tab==='develop'&&m.developGaps.some(v=>Math.abs(v-8)>1))throw Error('Developer gap mismatch '+scene.name+' '+width+'px '+JSON.stringify(m.developGaps));
}
try{
  await mkdir(out,{recursive:true});
  const [source,style]=await Promise.all([
    readFile(join(root,'src/ui/tool.html'),'utf8'),
    readFile(join(root,'src/ui/tool-shell.css'),'utf8')
  ]);
  const html=source.replace(/<script src="tool-shell\.js"><\/script>/,'');
  if(html===source)throw Error('Expected script marker missing: refusing native JS execution in static fixture');
  server=createServer((req,res)=>{
    const name=req.url?.split('?')[0];
    if(name==='/ui/tool.html')res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
    else if(name==='/ui/tool-shell.css')res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'}).end(style);
    else res.writeHead(404).end();
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  port=server.address().port;
  chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--hide-scrollbars','--no-first-run','--no-default-browser-check',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:'ignore'});
  await connect();
  const nav=await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/ui/tool.html'});
  if(nav.errorText)throw Error('Static navigation failed '+nav.errorText);
  let ready=false;
  for(let i=0;i<100;i++){
    if(await evaluate('document.readyState==="complete" && document.styleSheets.length>0 && !!document.querySelector("#workbench-develop")')){ready=true;break}
    await sleep(100);
  }
  if(!ready)throw Error('Real Sidebar HTML/CSS did not load in static Chrome');
  const samples=[];
  for(const width of widths){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
    for(const scene of scenes){
      await evaluate('('+setupScene.toString()+')('+JSON.stringify(scene)+')');
      const m=await evaluate('('+measureScene.toString()+')('+JSON.stringify(scene)+')');
      validate(scene,width,m);
      samples.push({scene:scene.name,width,...m});
      const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(out,scene.name+'-'+width+'x700.png'),Buffer.from(image.data,'base64'));
      console.log('SIDEBAR_R19_STATIC_LAYOUT_PASS',scene.name,width,JSON.stringify(m));
    }
  }
  await writeFile(join(out,'metrics.json'),JSON.stringify({
    evidence:'STATIC_MARKUP_CHROME',nativeExtension:false,nativeControlEvents:false,
    source:'src/ui/tool.html + src/ui/tool-shell.css',samples
  },null,2)+'\n');
  console.log('SIDEBAR_R19_STATIC_LAYOUT_ALL_PASS '+samples.length);
}finally{
  try{socket?.close()}catch{}
  try{server?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  await sleep(350);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
