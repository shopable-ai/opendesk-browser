#!/usr/bin/env node
// The installed Sidebar Tool's exact packaged HTML, CSS and JS in real Chrome,
// paired with a deterministic in-page HOST MOCK. This is NOT installed Chrome.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';

const out=resolve(process.argv[2]||'artifacts/prompt-shortcuts-r113-formal-chrome');
await mkdir(out,{recursive:true});
const pkg=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
assert.equal(pkg.id,'prompt-shortcuts');
assert.equal(pkg.version,'1.0.4');
assert.equal(pkg.scripts?.length,1);
assert.equal(pkg.scripts[0].name,'trusted/model.js');
const escaped=source=>source.replace(/<\/script/gi,'<\\/script').replace(/<\/style/gi,'<\\/style');
const bridge=String.raw`
(()=>{
  const KEY='opendesk-r113-formal-chromium-fixture';
  const initial={value:null,etag:'a'.repeat(64),revision:0};
  const read=()=>JSON.parse(localStorage.getItem(KEY)||'null')||initial;
  globalThis.OpenDeskTool={
    root:document.querySelector('main.ps'),
    setState(state){globalThis.__toolState=state;},
    async request(operation,payload){
      if(operation==='storage.get'){
        if(payload?.key!=='library'||payload?.withEtag!==true)throw Error('unexpected read shape');
        const item=read();
        return {value:item.value,etag:item.etag};
      }
      if(operation==='storage.set'){
        const previous=read();
        if(payload?.key!=='library'||payload?.ifMatch!==previous.etag)
          throw Object.assign(Error('Concurrent storage revision'),{code:'E_STORAGE_CONFLICT'});
        const revision=previous.revision+1;
        const etag=String(revision).padStart(64,'0');
        localStorage.setItem(KEY,JSON.stringify({value:payload.value,etag,revision}));
        return {saved:true,etag};
      }
      throw Error('Unsupported fixture operation: '+operation);
    }
  };
  globalThis.OpenDeskSDK={browser:{launch:{consume:async()=>null}}};
  globalThis.__readFormalToolStore=read;
})();
`;
const documentHtml='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>FORMAL SOURCE / MOCK HOST / NOT INSTALLED</title>'+
  '<style>'+escaped(pkg.css)+'</style></head><body>'+
  pkg.html+'<script>'+escaped(bridge)+'</script>'+
  pkg.scripts.map(s=>'<script>'+escaped(s.code)+'</script>').join('')+
  '<script>'+escaped(pkg.js)+'</script></body></html>';
const server=createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(documentHtml);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(join(tmpdir(),'prompt-shortcuts-formal-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,seq=0;
const outstanding=new Map(),jsErrors=[];
const report={kind:'FORMAL_PACKAGED_UI_REAL_CHROMIUM_SIMULATED_HOST',installedExtension:false,
  liveChatGPT:false,version:pkg.version,candidateSource:pkg.id,scenes:[]};
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function rpc(method,params={}){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{outstanding.delete(id);fail(Error('CDP timeout '+method));},16000);
    outstanding.set(id,{ok(value){clearTimeout(timeout);ok(value);},
      fail(error){clearTimeout(timeout);fail(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function connect(){
  let port;
  for(let i=0;i<110;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await sleep(100);
  }
  assert(port,'Chrome debugging port not found');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=tabs.find(x=>x.type==='page');assert(page?.webSocketDebuggerUrl);
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown')
      jsErrors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text);
    if(!m.id||!outstanding.has(m.id))return;
    const callback=outstanding.get(m.id);outstanding.delete(m.id);
    if(m.error)callback.fail(Error(m.error.message));else callback.ok(m.result);
  });
  await rpc('Page.enable');await rpc('Runtime.enable');
}
async function evaluate(expression){
  const value=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result?.value;
}
async function poll(expression,label){
  for(let i=0;i<100;i++){
    if(await evaluate(expression))return;
    await sleep(75);
  }
  throw Error('Not ready: '+label);
}
async function click(selector){
  const rect=await evaluate('('+function(s){
    const el=document.querySelector(s);
    if(!el||el.disabled||el.closest('[hidden]'))throw Error('Missing visible button '+s);
    el.scrollIntoView({block:'nearest'});
    const r=el.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};
  }.toString()+')('+JSON.stringify(selector)+')');
  assert(rect.width>0&&rect.height>0,'visible '+selector);
  for(const [type,extra] of [['mouseMoved',{}],['mousePressed',{button:'left',clickCount:1}],
    ['mouseReleased',{button:'left',clickCount:1}]])
    await rpc('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,...extra});
}
async function fill(selector,value){
  return evaluate('('+function(s,v){
    const el=document.querySelector(s);
    if(!el)throw Error('Missing input '+s);
    el.value=v;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }.toString()+')('+JSON.stringify(selector)+','+JSON.stringify(value)+')');
}
async function screenshot(name){
  const png=await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(out,name+'.png'),Buffer.from(png.data,'base64'));
}
async function view(){
  return evaluate('('+function(){
    const $=s=>document.querySelector(s),body=$('#ps-body'),clip=$('.ps-card-preview');
    return {count:$('.ps-list-caption')?.textContent||'',
      visibleCards:document.querySelectorAll('.ps-card').length,
      indexVisible:!$('#ps-index').hidden,formVisible:!$('#ps-edit').hidden,
      settingsExpanded:$('#ps-toggle-settings').getAttribute('aria-expanded'),
      settingsHidden:$('#ps-setting-fields').hidden,
      bodyRows:body.rows,bodyHeight:Math.round(body.getBoundingClientRect().height),
      bodyScrollHeight:body.scrollHeight,bodyClientHeight:body.clientHeight,
      clamp:clip?getComputedStyle(clip).webkitLineClamp:null,
      width:document.documentElement.clientWidth,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      itemBodies:(globalThis.__readFormalToolStore()?.value?.items||[]).map(x=>x.body),
      countText:$('#ps-count')?.textContent,
      error:$('#ps-error')?.textContent,
      status:$('#ps-status')?.textContent};
  }.toString()+')()');
}
async function width(n){
  await rpc('Emulation.setDeviceMetricsOverride',
    {width:n,height:850,deviceScaleFactor:1,mobile:false});
}
async function run(){
  await connect();await width(400);
  await rpc('Page.navigate',{url});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled','ready');
  let x=await view();
  assert.equal(x.visibleCards,0);
  await click('#ps-new');
  x=await view();assert.equal(x.formVisible,true);assert.equal(x.settingsExpanded,'true');
  assert.equal(x.bodyRows,3);
  await screenshot('formal-create-400px');
  await fill('#ps-body','你好');
  await click('#ps-save');
  await poll('document.querySelector("#ps-index")&&!document.querySelector("#ps-index").hidden&&document.querySelectorAll(".ps-card").length===1',
    'saved 你好 list');
  x=await view();
  assert.deepEqual(x.itemBodies,['你好']);
  assert.equal(x.countText,'1 个 · 1 个启用');
  const buttonStyle=await evaluate('('+function(){
    const use=getComputedStyle(document.querySelector('.ps-card-use'));
    const primary=getComputedStyle(document.querySelector('#ps-new'));
    return {useBackground:use.backgroundColor,useColor:use.color,
      primaryBackground:primary.backgroundColor};
  }.toString()+')()');
  assert.notEqual(buttonStyle.useBackground,buttonStyle.primaryBackground,
    'a full-body shortcut must not inherit visually dominant blue primary fill');
  assert.notEqual(buttonStyle.useColor,buttonStyle.useBackground,'prompt text must be legible');
  report.contentFirstControlStyle=buttonStyle;
  await screenshot('formal-saved-400px');
  await rpc('Page.reload',{ignoreCache:true});
  await poll('document.querySelector("#ps-new")&&!document.querySelector("#ps-new").disabled&&document.querySelectorAll(".ps-card").length===1',
    'persisted after reload');
  x=await view();assert.deepEqual(x.itemBodies,['你好']);
  report.helloSaveAndReload=true;report.uniqueCount=x.visibleCards;
  for(const n of [320,360,400,440]){
    await width(n);
    x=await view();assert.equal(x.horizontalOverflow,false,'formal list overflow '+n);
    assert.equal(x.clamp,'2');
    await screenshot('formal-list-'+n+'px');
    report.scenes.push({width:n,form:'list',overflow:x.horizontalOverflow,screenshot:'formal-list-'+n+'px.png'});
  }
  await click('#ps-new');
  assert.equal((await view()).settingsExpanded,'true');
  await click('#ps-toggle-settings');
  assert.equal((await view()).settingsExpanded,'false');
  await fill('#ps-body',Array.from({length:100},(_,i)=>'正文第'+i+'行').join('\n'));
  x=await view();
  assert.equal(x.settingsHidden,true,'typing must not reopen collapsed optional fields');
  assert.equal(x.bodyRows,3);
  assert(x.bodyScrollHeight>x.bodyClientHeight,'hundred-line body must scroll internally');
  for(const n of [320,360,400,440]){
    await width(n);x=await view();
    assert.equal(x.horizontalOverflow,false,'formal form overflow '+n);
    await screenshot('formal-long-body-'+n+'px');
    report.scenes.push({width:n,form:'100-lines',overflow:x.horizontalOverflow,screenshot:'formal-long-body-'+n+'px.png'});
  }
  await click('#ps-cancel');
  await poll('document.querySelector("#ps-leave")&&!document.querySelector("#ps-leave").hidden','unsaved draft guard');
  await click('#ps-discard');
  await poll('document.querySelector("#ps-index")&&!document.querySelector("#ps-index").hidden','discard returns to list');
  await rpc('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await screenshot('formal-dark-440px');
  report.darkScreenshot='formal-dark-440px.png';
  assert.equal(jsErrors.length,0,'formal JavaScript console exceptions: '+jsErrors.join(' | '));
  report.consoleExceptions=jsErrors;report.result='PASS';
  console.log('PROMPT_SHORTCUTS_FORMAL_CHROMIUM_PASS',JSON.stringify(report));
}
try{await run();}
catch(error){report.result='FAIL';report.error=String(error?.stack||error);console.error(report.error);process.exitCode=1;}
finally{
  report.consoleExceptions=jsErrors;
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  try{socket?.close();}catch{}
  chrome.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
