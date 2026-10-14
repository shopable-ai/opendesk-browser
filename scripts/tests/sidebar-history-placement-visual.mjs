#!/usr/bin/env node
// STATIC_MARKUP_CHROME: product HTML/CSS and audited History mount only.
// No tool-shell, Chrome APIs, installed tools, native permission or history calls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {spawn} from 'node:child_process';

const root=resolve('.'),out=resolve(process.argv[2]||'artifacts/sidebar-history-placement-20261014/layout');
const profile=await mkdtemp(join(tmpdir(),'sidebar-history-static-'));
const inputs=new Map(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function source(path){
  if(!inputs.has(path))inputs.set(path,await readFile(join(root,path)));
  return inputs.get(path);
}
let browser,server,socket,sequence=0;
const pending=new Map();
function cdp(method,params={}){
  const id=++sequence;
  return new Promise((ok,fail)=>{
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},15000);
    pending.set(id,{ok,fail,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
function scene(name,zoom=1){
  const get=id=>document.getElementById(id),detail=['tool-open','tool-page','preview-page'].includes(name);
  document.documentElement.dataset.opendeskSurface=/^(tool|preview)-page/.test(name)?'tool-page':'';
  document.documentElement.dataset.opendeskTab=name==='other-tab'?'tasks':'tools';
  document.documentElement.style.zoom=String(zoom);
  for(const tab of document.querySelectorAll('[data-workbench-tab]')){
    const selected=tab.dataset.workbenchTab===document.documentElement.dataset.opendeskTab;
    tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
  }
  get('workspace-dock').hidden=name!=='other-tab';
  for(const page of document.querySelectorAll('[data-workbench-page]'))page.hidden=page.dataset.workbenchPage!==document.documentElement.dataset.opendeskTab;
  get('sidebar-tool-list-view').hidden=detail;
  get('sidebar-tool-display').hidden=!detail;
  get('sidebar-tool-discover-panel').hidden=name!=='list-discovery';
  if(get('trusted-history-panel'))get('trusted-history-panel').open=name!=='list-closed';
  get('sidebar-tool-title').textContent='静态工具界面';
  return detail;
}
function measure(){
  const panel=document.getElementById('trusted-history-panel');
  const visible=node=>Boolean(node?.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true}));
  const fields=[...panel?.querySelectorAll('input,button')||[]];
  return {
    count:document.querySelectorAll('#trusted-history-panel').length,
    container:panel?.parentElement.id,listOwner:panel?.closest('#sidebar-tool-list-view')?.id,
    hostRegionVisible:visible(document.getElementById('sidebar-host-browser-tools')),
    visible:visible(panel),fieldsVisible:fields.some(visible),
    toolContentHasHistory:Boolean(document.querySelector('#sidebar-tool-display #trusted-history-panel')),
    browserWidth:document.getElementById('sidebar-host-browser-tools').getBoundingClientRect().width,
    overflow:panel?panel.scrollWidth-panel.clientWidth:0,
    controlOverflow:fields.filter(visible).map(node=>{
      const rect=node.getBoundingClientRect(),parent=node.parentElement.getBoundingClientRect();
      return Math.max(parent.left-rect.left,rect.right-parent.right);
    })
  };
}
try{
  await mkdir(out,{recursive:true});
  // Bind the real producers of the simulated list/detail state as well.
  for(const path of ['src/ui/tool-shell.js','src/ui/sidebar-tools.js','scripts/tests/sidebar-history-placement-visual.mjs'])await source(path);
  const html=(await source('src/ui/tool.html')).toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  assert.doesNotMatch(html,/<script\b/,'static fixture must not execute the extension shell');
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://127.0.0.1').pathname;
      if(pathname==='/ui/tool.html')return res.writeHead(200,{'Content-Type':'text/html'}).end(html);
      const path=pathname==='/ui/time-review.css'?'examples/sidebar-tools/time-review/src/style.css':'src'+pathname;
      assert.ok(resolve(root,path).startsWith(root+sep));
      if(!/\.(?:js|css)$/.test(path))return res.writeHead(404).end();
      const body=await source(path);
      res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':'text/css'}).end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url='http://127.0.0.1:'+server.address().port+'/ui/tool.html';
  browser=spawn(process.env.CHROME_BIN||'google-chrome',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--use-mock-keychain','--password-store=basic','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:'ignore'});
  let port;
  for(let i=0;i<100&&!port;i++){
    if(browser.exitCode!==null)throw Error('Static Chrome exited '+browser.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(!port)await sleep(100);
  }
  assert.ok(port,'static Chrome debugging port');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data),call=pending.get(msg.id);
    if(!call)return;pending.delete(msg.id);clearTimeout(call.timer);
    if(msg.error)call.fail(Error(msg.error.message));else call.ok(msg.result);
  });
  await cdp('Page.enable');await cdp('Runtime.enable');
  let fixtureSidePanel;
  async function loadDocument(sidePanel){
    const targetUrl=url+'?staticContext='+(sidePanel?'side-panel':'tool-page');
    await cdp('Page.navigate',{url:targetUrl});
    for(let i=0;i<100;i++){
      if(await evaluate('location.href==='+JSON.stringify(targetUrl)+' && document.readyState==="complete" && !!document.getElementById("sidebar-host-browser-tools") && [...document.querySelectorAll("link[rel=stylesheet]")].every(node=>node.sheet)'))break;
      if(i===99)throw Error('Static product CSS did not load');await sleep(100);
    }
    // The source contract test verifies the shell's positive native context
    // gate. Here each simulated context has its own actual static document.
    if(sidePanel)await evaluate('(async()=>{const ui=await import("/ui/trusted-history-workbench.js");ui.mountTrustedHistoryWorkbench(document);ui.mountTrustedHistoryWorkbench(document);})()');
    fixtureSidePanel=sidePanel;
  }
  const samples=[];
  for(const width of [300,320,360,420,520]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    for(const name of ['list-closed','list-open','tool-open','list-return','list-discovery','other-tab','tool-page','tool-page-list','preview-page','preview-page-list']){
      const sidePanel=!/^(tool|preview)-page/.test(name);
      if(fixtureSidePanel!==sidePanel)await loadDocument(sidePanel);
      await evaluate('('+scene.toString()+')('+JSON.stringify(name)+')');
      const value=await evaluate('('+measure.toString()+')()');
      assert.equal(value.count,sidePanel?1:0);
      if(sidePanel){assert.equal(value.container,'sidebar-host-browser-tools');assert.equal(value.listOwner,'sidebar-tool-list-view');}
      assert.equal(value.toolContentHasHistory,false);
      const visible=name.startsWith('list-');assert.equal(value.visible,visible,name);
      assert.equal(value.hostRegionVisible,visible,name);
      assert.equal(value.fieldsVisible,visible&&name!=='list-closed',name);
      if(visible){assert.ok(value.overflow<=1,JSON.stringify(value));assert.ok(value.controlOverflow.every(n=>n<=1),JSON.stringify(value));}
      samples.push({width,name,...value});
      if(width===320&&['list-open','tool-open','tool-page'].includes(name)){
        if(visible)await evaluate('document.getElementById("sidebar-host-browser-tools").scrollIntoView({block:"start"})');
        const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(join(out,name+'-320.png'),Buffer.from(image.data,'base64'));
      }
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:800,deviceScaleFactor:1,mobile:false});
  await loadDocument(true);
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  for(const zoom of [1,1.25,2]){
    await evaluate('('+scene.toString()+')("list-open",'+zoom+')');
    const value=await evaluate('('+measure.toString()+')()');
    assert.equal(value.visible,true);assert.ok(value.overflow<=1,JSON.stringify(value));
    assert.ok(value.controlOverflow.every(n=>n<=1),JSON.stringify(value));
    samples.push({width:320,name:'list-open-media',cssZoom:zoom,...value});
  }
  const sourceBinding=[];
  for(const [path,bytes] of inputs){
    const hash=sha(bytes);assert.equal(sha(await readFile(join(root,path))),hash,'Relevant input drift '+path);
    sourceBinding.push({path,sha256:hash});
  }
  await writeFile(join(out,'metrics.json'),JSON.stringify({evidence:'STATIC_MARKUP_CHROME',nativeExtension:false,
    nativePermissions:false,realBrowserZoom:'NOT_TESTED',inputsStable:true,sourceBinding,samples},null,2)+'\n');
  console.log('SIDEBAR_HISTORY_STATIC_PASS '+samples.length+' samples; native permissions/history/zoom NOT_TESTED');
}finally{
  for(const call of pending.values())clearTimeout(call.timer);
  socket?.close();server?.close();browser?.kill('SIGTERM');await sleep(350);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
