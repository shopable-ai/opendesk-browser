#!/usr/bin/env node
// R1.6 Linux Chromium smoke. Installed App + target-page JS collection are NOT tested.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const project=resolve('examples/sidebar-tools/browser-fingerprint');
const out=resolve(process.argv[2]||'artifacts/app-ci/browser-fingerprint/chrome');
await mkdir(out,{recursive:true});
const html=await readFile(join(project,'preview/react/index.html'));
const build=JSON.parse(await readFile(join(project,'dist/build-ready.json'),'utf8'));
assert.equal(build.format,'opendesk.ui-build-ready.v1');
assert(html.toString('utf8').includes('data:text/javascript;base64,'),
  'preview must contain the source-bound compiled React scripts');
const server=createServer((req,res)=>{
  if(req.url!=='/'&&req.url!=='/index.html'){
    res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url='http://127.0.0.1:'+server.address().port+'/';
const profile=await mkdtemp(join(tmpdir(),'fp-r16-chromium-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const pending=new Map(),exceptions=[];
let ws,id=0;
const evidence={kind:'SAME_SOURCE_REACT_CHROMIUM_PREVIEW_FIXTURE_ONLY',
  sourceCommit:process.env.GITHUB_SHA||null,installed:false,native:false,
  targetPageEnvironmentRead:false,
  htmlSha256:createHash('sha256').update(html).digest('hex'),buildId:build.buildId,
  checks:[],screenshots:[],exceptions};
function call(method,params={}){
  return new Promise((ok,fail)=>{
    const rid=++id,timeout=setTimeout(()=>{
      pending.delete(rid);fail(Error('CDP timeout: '+method));
    },12000);
    pending.set(rid,{ok:v=>{clearTimeout(timeout);ok(v);},
      fail:e=>{clearTimeout(timeout);fail(e);}});
    ws.send(JSON.stringify({id:rid,method,params}));
  });
}
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function until(expr,label){
  for(let i=0;i<90;i++){
    if(await evaluate(expr))return;
    await pause(100);
  }
  throw Error('Timed out: '+label);
}
async function click(label){
  const ok=await evaluate('('+function(text){
    const buttons=[...document.querySelectorAll('button')];
    const button=buttons.find(el=>el.textContent.trim()===text&&!el.disabled);
    if(!button)return false;
    button.click();return true;
  }.toString()+')('+JSON.stringify(label)+')');
  assert(ok,'Missing/enabled button: '+label);
}
async function fixture(value){
  const ok=await evaluate('('+function(v){
    const select=document.querySelector('#fp-fixture');
    if(!select)return false;
    select.value=v;select.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }.toString()+')('+JSON.stringify(value)+')');
  assert(ok,'Missing offline fixture');
}
async function connect(){
  let port;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chromium terminated before CDP');
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
    if(port)break;
    await pause(100);
  }
  assert(port,'Chrome CDP port unavailable');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(x=>x.type==='page');
  assert(page?.webSocketDebuggerUrl);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    ws.addEventListener('open',ok,{once:true});
    ws.addEventListener('error',fail,{once:true});
  });
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params?.exceptionDetails?.exception?.description||'Runtime exception');
    const waiter=pending.get(message.id);
    if(!waiter)return;
    pending.delete(message.id);
    message.error?waiter.fail(Error(message.error.message)):waiter.ok(message.result);
  });
  await call('Page.enable');await call('Runtime.enable');
}
try{
  await connect();
  await call('Page.navigate',{url});
  await until('document.querySelectorAll(".fp-app").length===1','React root');
  assert.equal(await evaluate('document.querySelectorAll(".fp-tabs button").length'),3);
  evidence.checks.push('ONE_REACT_ROOT_AND_THREE_TABS');
  await click('检测当前网页');
  await until('document.querySelector(".fp-notice")?.textContent.includes("已读取 Host 页面字段")','first detection');
  assert.equal(await evaluate('document.querySelector(".fp-value")?.textContent'),
    'https://qa.example.test');
  // Changing documents before save must reject the old reading.
  await fixture('1');await click('保存部分证据');
  await until('document.querySelector(".fp-notice")?.textContent.includes("身份已失效")','stale target');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("opendesk.fingerprint.a.preview-only.v1")||"null")'),null);
  evidence.checks.push('STALE_DOCUMENT_CANNOT_SAVE');
  await fixture('0');await click('检测当前网页');
  await until('document.querySelector(".fp-notice")?.textContent.includes("已读取 Host 页面字段")','recapture A');
  // Delay a simulated SDK storage response. A fast second click must not
  // create another write, and switching tabs cannot discard the final receipt.
  assert(await evaluate('('+function(){
    const original=globalThis.OpenDeskTool.request.bind(globalThis.OpenDeskTool);
    globalThis.__fpTestWrites=0;
    globalThis.OpenDeskTool.request=(operation,args)=>{
      if(operation!=='storage.set')return original(operation,args);
      globalThis.__fpTestWrites++;
      if(globalThis.__fpTestWrites!==1)return original(operation,args);
      return new Promise((ok,fail)=>{
        globalThis.__fpTestRelease=()=>Promise.resolve(original(operation,args)).then(ok,fail);
      });
    };
    return true;
  }.toString()+')()'));
  assert(await evaluate('('+function(){
    const button=[...document.querySelectorAll('button')]
      .find(el=>el.textContent.trim()==='保存部分证据'&&!el.disabled);
    if(!button)return false;
    button.click();button.click();return true;
  }.toString()+')()'));
  await until('typeof globalThis.__fpTestRelease==="function"','pending preview write');
  await click('历史');
  await until('document.querySelector(".fp-tabs button.active")?.textContent.trim()==="历史"','history while saving');
  assert.equal(await evaluate('globalThis.__fpTestWrites'),1);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("opendesk.fingerprint.a.preview-only.v1")||"null")?.items?.length||0'),0);
  await evaluate('globalThis.__fpTestRelease()');
  await until('document.querySelectorAll(".fp-history-item").length===1','save A displayed after tab switch');
  assert.equal(await evaluate('globalThis.__fpTestWrites'),1);
  evidence.checks.push('PENDING_SAVE_TAB_SWITCH_AND_DOUBLE_CLICK_GUARD');
  await click('检测');
  await fixture('1');await click('检测当前网页');
  await until('document.querySelector(".fp-value")?.textContent==="https://shop.example.test"','read B');
  await click('保存部分证据');
  await until('JSON.parse(localStorage.getItem("opendesk.fingerprint.a.preview-only.v1")||"null")?.items?.length===2','save B');
  await click('对比');
  await until('document.querySelectorAll(".fp-diff-row").length>=10','A/B comparison');
  assert(await evaluate('[...document.querySelectorAll(".fp-diff-row")].some(e=>e.textContent.includes("变化"))'));
  evidence.checks.push('A_B_SAVE_COMPARE_IN_SIMULATED_HOST');
  await call('Page.reload',{ignoreCache:true});
  await until('document.querySelectorAll(".fp-app").length===1','React reload');
  await click('历史');
  await until('document.querySelectorAll(".fp-history-item").length===2','durable preview history after reload');
  evidence.checks.push('PREVIEW_RESTART_READBACK');
  // Actual CDP keyboard events, not calling React handlers from the fixture.
  await evaluate('document.querySelector(".fp-tabs button").focus()');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.activeElement?.textContent.trim()'),'对比');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until('document.querySelector(".fp-tabs button.active")?.textContent.trim()==="对比"','keyboard Enter switched tab');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.querySelectorAll(".fp-diff-row").length')>=10,true);
  evidence.checks.push('TAB_ENTER_ESCAPE_PRESERVE_COMPARISON');
  await click('历史');
  for(const width of [320,360,400,440,520]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:840,deviceScaleFactor:1,mobile:false});
    const m=await evaluate('('+function(){
      return {app:document.querySelector('.fp-app')?.getBoundingClientRect().width,
        documentWidth:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth};
    }.toString()+')()');
    assert(m.app>0&&m.app<=width+1&&m.scrollWidth<=m.documentWidth+1,
      'responsive width overflow at '+width+': '+JSON.stringify(m));
    const capture=await call('Page.captureScreenshot',{format:'png'});
    const bytes=Buffer.from(capture.data,'base64');
    await writeFile(join(out,'fingerprint-'+width+'.png'),bytes);
    evidence.screenshots.push({width,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  await evaluate('document.documentElement.setAttribute("data-preview-theme","dark")');
  const dark=await call('Page.captureScreenshot',{format:'png'});
  await writeFile(join(out,'fingerprint-dark.png'),Buffer.from(dark.data,'base64'));
  evidence.checks.push('FIVE_WIDTHS_AND_DARK_THEME_CAPTURED');
  assert.deepEqual(exceptions,[],'Unexpected Chromium JS exceptions');
  evidence.status='PASS_SIMULATED_HOST_CHROMIUM';
  console.log(JSON.stringify(evidence,null,2));
}catch(error){
  evidence.status='FAIL';evidence.error=String(error.stack||error);
  console.error(evidence.error);process.exitCode=1;
}finally{
  await writeFile(join(out,'fingerprint-r16-chromium-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  try{ws?.close();}catch{}
  chrome.kill('SIGKILL');
  await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true});
}
