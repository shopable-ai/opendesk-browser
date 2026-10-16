#!/usr/bin/env node
// SOURCE_UI_SIMULATION_CHROMIUM, not native installed-extension evidence.
// The Chrome CDP input below creates browser-trusted events, never hand-built
// JS isTrusted flags. No extension host / permissions / Sandbox is simulated.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';

const fixtureJS="\nimport {mountExtensionList} from '/src/ui/react/main.tsx';\nconst ui=mountExtensionList(document),calls=[],state={query:'',kind:'all',scope:'smart',menuOpen:false};\nconst row={key:'app:sample',title:'React 安全演示',description:'不可运行用户代码',kind:'app',type:'应用',installed:true,primaryAction:'打开'};\nfunction draw(){\n  ui.renderToolbar({...state,language:'zh-CN',\n    onSearch(value){state.query=value;calls.push('search:'+value);draw();},\n    onToggleMenu(){state.menuOpen=!state.menuOpen;calls.push('menu:'+state.menuOpen);draw();},\n    onKind(value){state.kind=value;calls.push('kind:'+value);draw();},\n    onScope(value){state.scope=value;calls.push('scope:'+value);draw();},\n    onReset(){state.kind='all';state.scope='smart';calls.push('reset');draw();},\n    onMarket(){calls.push('market');},onImport(){calls.push('import');},\n    onReload(){calls.push('reload');},onLanguage(value){calls.push('language:'+value);}\n  });\n  ui.renderRows({rows:[row],busy:false,pendingKey:null,\n    onOpenRow(key){calls.push('open:'+key);\n      ui.renderDetail({key,title:row.title,description:row.description,\n        type:'应用',kind:'app',installed:true,busy:false,actions:[],\n        installationText:'本机已安装（测试模拟）',version:'1.0.0',source:null});},\n    onMore(key){calls.push('more:'+key);ui.setMenuKey(key);}\n  });\n}\ndraw();\nwindow.__reactTest={ui,calls,state,dispose(){ui.dispose()}};\ndocument.documentElement.dataset.fixtureReady='true';\n";
const fixtureHtml="<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"/src/ui/design-tokens.css\"><link rel=\"stylesheet\" href=\"/src/ui/design-system.css\"><link rel=\"stylesheet\" href=\"/src/ui/extension-center.css\"></head><body><main id=\"extension-center\"><div id=\"extension-center-list-view\"><div class=\"ec-toolbar\"><span>旧静态工具栏</span></div><ul id=\"extension-center-list\" class=\"ec-list\"></ul></div><section id=\"extension-center-detail-body\"></section></main><script type=\"module\" src=\"/__react_fixture.js\"></script></body></html>";

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
    .find(path=>existsSync(path));
assert.ok(browser,'Real Chromium/Chrome required (CHROME_BIN or installed binary)');
const vite=await createServer({root:process.cwd(),configFile:false,appType:'custom',
  logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},
  server:{host:'127.0.0.1',port:0}});
const profile=await mkdtemp(join(tmpdir(),'opendesk-react-r3331-'));
let chrome,socket;
const pending=new Map(),exceptions=[];
let sequence=0,port=0;
function cdp(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},15000);
    pending.set(id,{ok:x=>{clearTimeout(timer);ok(x);},
      fail:e=>{clearTimeout(timer);fail(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error('Browser evaluation failed: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function checkEventually(expression){
  for(let i=0;i<100;i++){
    try{if(await evaluate(expression))return;}catch{}
    await delay(60);
  }
  throw Error('Browser assertion never became true: '+expression);
}
async function click(selector){
  const rect=await evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');'+
    'if(!node)throw Error("Missing click target");const r=node.getBoundingClientRect();'+
    'return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height}})()');
  assert(rect.width>0&&rect.height>0,'Browser click target must be visible: '+selector);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
}
try{
  vite.middlewares.use((req,res,next)=>{
    const path=new URL(req.url||'/','http://localhost').pathname;
    if(path!=='/'&&path!=='/__react_fixture.js')return next();
    res.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':'text/javascript'});
    res.end(path==='/'?fixtureHtml:fixtureJS);
  });
  await vite.listen();
  const httpPort=vite.httpServer.address().port;
  chrome=spawn(browser,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';
  chrome.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-10000);});
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome quit early: '+stderr);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}
    catch{}
    await delay(100);
  }
  assert(port,'Chrome CDP port unavailable: '+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(t=>t.type==='page');
  assert(page?.webSocketDebuggerUrl,'Chrome page target unavailable');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown')exceptions.push(String(m.params.exceptionDetails?.text||'Browser exception'));
    if(!pending.has(m.id))return;
    const waiter=pending.get(m.id);pending.delete(m.id);
    if(m.error)waiter.fail(Error(m.error.message));else waiter.ok(m.result);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+httpPort+'/'});
  await checkEventually('document.documentElement.dataset.fixtureReady==="true"');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-react-root").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-search").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list .ec-row").length'),1);
  await evaluate('document.getElementById("extension-center-search").focus()');
  await cdp('Input.insertText',{text:'React UI'});
  await checkEventually('window.__reactTest.calls.includes("search:React UI")');
  assert.equal(await evaluate('document.getElementById("extension-center-search").value'),'React UI');
  await click('#extension-center-more');
  await checkEventually('document.getElementById("extension-center-more").getAttribute("aria-expanded")==="true"');
  await click('[data-ec-scope="available"]');
  await checkEventually('window.__reactTest.state.scope==="available"');
  await click('[data-ec-kind="page"]');
  await checkEventually('window.__reactTest.state.kind==="page"');
  await click('#extension-center-more');
  await click('.ec-row-more');
  await checkEventually('window.__reactTest.calls.includes("more:app:sample")');
  assert.equal(await evaluate('document.querySelector(".ec-row-more").getAttribute("aria-expanded")'),'true');
  await click('.ec-row-main');
  await checkEventually('window.__reactTest.calls.includes("open:app:sample")');
  assert.equal(await evaluate('document.querySelectorAll(".ec-detail-head").length'),1);
  const recorded=await evaluate('window.__reactTest.calls');
  assert.equal(recorded.filter(s=>s==='open:app:sample').length,1,'one click must not duplicate listeners');
  assert.deepEqual(exceptions,[],'React must not throw inside Chrome');
  await evaluate('window.__reactTest.dispose()');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-react-root").length'),0);
  assert.equal(await evaluate('document.querySelector("#extension-center-list").children.length'),0);
  console.log(JSON.stringify({kind:'SOURCE_UI_SIMULATION_CHROMIUM',status:'PASS',
    browser:(await cdp('Browser.getVersion')).product,checks:['single root','real typing',
    'filter selection','menu click','row click','detail portal','unmount'],operations:recorded}));
}finally{
  try{socket?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  await vite.close();
  await delay(150);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
