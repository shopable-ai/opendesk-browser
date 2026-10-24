#!/usr/bin/env node
// SOURCE_BOUND_WORKFLOW_PREVIEW_CHROMIUM: test the generated production React UI
// through real CDP pointer/keyboard input, never Native, Provider or RunHost.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const html=resolve('prototypes/sidebar/workflow/react-preview/index.html');
assert(existsSync(html),'Run the source-bound HTML builder first');
const browser=process.env.CHROME_BIN||[
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'
].find(existsSync);
assert(browser,'Chrome/Chromium required (CHROME_BIN)');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const profile=await mkdtemp(join(tmpdir(),'opendesk-workflow-preview-'));
let chrome,socket,port=0,serial=0,bootError;
const errors=[],pending=new Map();
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},
      reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const response=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error('CDP evaluation error: '+JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function eventually(expression){
  for(let n=0;n<100;n++){
    try{if(await evaluate(expression))return;}catch{}
    await delay(70);
  }
  throw Error('Browser condition timed out: '+expression);
}
async function click(selector){
  const rect=await evaluate('(()=>{const node=document.querySelector('+
    JSON.stringify(selector)+');if(!node)throw Error("Missing click target");'+
    'node.scrollIntoView({block:"nearest"});const r=node.getBoundingClientRect();'+
    'return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,'+
    'disabled:node.disabled,hidden:node.hidden}})()');
  assert(rect.width>0&&rect.height>0&&!rect.disabled&&!rect.hidden,
    'Click target hidden: '+selector+' '+JSON.stringify(rect));
  for(const type of ['mousePressed','mouseReleased'])
    await cdp('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1});
}
async function key(key,code=key,windowsVirtualKeyCode=key==='Enter'?13:27,modifiers=0){
  for(const type of ['keyDown','keyUp'])
    await cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
}
const select=(id,value)=>evaluate('(()=>{const el=document.getElementById('+
  JSON.stringify(id)+');el.value='+JSON.stringify(value)+
  ';el.dispatchEvent(new Event("change",{bubbles:true}));return el.value;})()');
try {
  chrome=spawn(browser,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--window-size=1000,950',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';
  chrome.once('error',e=>{bootError=e;});
  chrome.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-8000);});
  for(let n=0;n<300;n++){
    if(bootError)throw Error('Chrome start failed: '+bootError.message);
    if(chrome.exitCode!==null||chrome.signalCode)throw Error('Chrome exited: '+stderr);
    try{
      port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      if(port)break;
    }catch{}
    await delay(100);
  }
  assert(port,'CDP port unavailable: '+stderr);
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(x=>x.type==='page');
  assert(page?.webSocketDebuggerUrl,'Chrome page target missing');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Runtime.exceptionThrown'){
      const e=msg.params.exceptionDetails||{};
      errors.push(String(e.exception?.description||e.text));
    }
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')
      errors.push('console.error: '+(msg.params.args||[]).map(x=>x.value||x.description).join(' '));
    const waiter=pending.get(msg.id);
    if(!waiter)return;
    pending.delete(msg.id);
    if(msg.error)waiter.reject(Error(msg.error.message));else waiter.resolve(msg.result);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');
  const navigation=await cdp('Page.navigate',{url:pathToFileURL(html).href});
  assert(!navigation.errorText,'Offline file:// navigation failed: '+navigation.errorText);
  try{await eventually('document.documentElement.dataset.workflowPreviewReady==="true"');}
  catch(error){
    const snapshot=await evaluate('({root:document.querySelector("#opendesk-react-app")?.innerHTML.slice(0,800),'+
      'scripts:[...document.scripts].map(x=>x.src.slice(0,90))})');
    throw Error(error.message+'; exceptions='+JSON.stringify(errors)+'; '+JSON.stringify(snapshot));
  }
  assert.equal(await evaluate('document.querySelectorAll("#opendesk-react-app").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("#workbench-workflow").length'),1);
  assert.equal(await evaluate('document.getElementById("workbench-workflow").dataset.opendeskReactOwner'),'workflow-page');
  assert.equal(await evaluate('document.querySelectorAll(".workflow-sheet-overlay").length'),0,
    'the single shared Provider sheet is mounted only when explicitly opened');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-settings-react-host").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#workflow-provider-settings").length'),0,
    'retired standalone Workflow Provider settings must not be duplicated');
  assert.equal(await evaluate('document.getElementById("od-workflow-preview-stage").contains(document.getElementById("workbench-workflow"))'),true);
  assert.deepEqual(await evaluate('window.__workflowPreviewInfo'),{
    sourceBound:true,native:false,provider:false,runHost:false,permission:false,realResult:false
  });
  const scenes=['empty','conversation','planning','running','success','failure',
    'unknown','approval','run-review','denied','disconnected','history','settings'];
  for(const scene of scenes){
    assert.equal(await select('od-workflow-preview-scenario',scene),scene);
    if(scene==='conversation')await eventually(
      'document.querySelectorAll("#workflow-ai-transcript .workflow-chat-entry").length===2');
    if(scene==='approval')await eventually(
      '!document.getElementById("workflow-ai-approval").hidden');
    if(scene==='run-review'){
      await eventually('!document.getElementById("workflow-run-review").hidden');
      assert.equal(await evaluate('document.querySelectorAll("#workflow-run-review button").length'),2);
      assert.equal(await evaluate('document.querySelectorAll("#workflow-run-review input[type=checkbox]").length'),0);
    }
    if(scene==='unknown')await eventually(
      'document.getElementById("workflow-output").textContent.includes("结果未知")');
    if(scene==='settings'){
      await eventually('document.querySelectorAll(".workflow-sheet-overlay [role=dialog]").length===1');
      assert.equal(await evaluate('document.getElementById("opendesk-react-app").inert'),true,
        'opening the real shared sheet makes the background inaccessible');
      await key('Escape','Escape',27);
      await eventually('document.querySelectorAll(".workflow-sheet-overlay").length===0');
    }
  }
  await select('od-workflow-preview-scenario','run-review');
  await eventually('!document.getElementById("workflow-run-review").hidden');
  await click('#workflow-run-review-cancel');
  await eventually('document.getElementById("workflow-run-review").hidden');
  assert.match(await evaluate('document.getElementById("workflow-ai-transcript").textContent'),/已取消预览操作/);
  await select('od-workflow-preview-scenario','run-review');
  await eventually('!document.getElementById("workflow-run-review").hidden');
  await click('#workflow-run-review-confirm');
  await eventually('document.getElementById("workflow-run-review").hidden');
  await eventually('document.getElementById("workflow-ai-transcript").textContent.includes("离线预览无法请求 Chrome 权限或执行网页操作")');
  await select('od-workflow-preview-scenario','empty');
  for(const width of ['320','360','400','420','440','520']){
    await select('od-workflow-preview-width',width);
    await eventually('Math.round(document.getElementById("od-workflow-preview-stage").getBoundingClientRect().width)==='+width);
  }
  await select('od-workflow-preview-theme','dark');
  await eventually('document.getElementById("od-workflow-preview-stage").dataset.previewTheme==="dark"');
  const dark=await evaluate('getComputedStyle(document.getElementById("od-workflow-preview-stage")).backgroundColor');
  await select('od-workflow-preview-theme','light');
  const light=await evaluate('getComputedStyle(document.getElementById("od-workflow-preview-stage")).backgroundColor');
  assert.notEqual(dark,light,'Changing theme must change computed CSS');
  await select('od-workflow-preview-width','360');
  await click('#workflow-ai-request');
  await cdp('Input.insertText',{text:'测试中文输入，不提交'});
  await eventually('document.getElementById("workflow-ai-request").value==="测试中文输入，不提交"');
  await key('Enter','Enter',13);
  await eventually('document.querySelector("#workflow-ai-transcript").textContent.includes("测试中文输入，不提交")');
  assert.match(await evaluate('document.querySelector("#workflow-ai-transcript").textContent'),/离线预览未连接 Provider/);
  const count=await evaluate('document.querySelectorAll("#workflow-ai-transcript .workflow-chat-entry").length');
  await click('#workflow-ai-request');
  await key('Enter','Enter',13,8);
  assert.equal(await evaluate('document.querySelectorAll("#workflow-ai-transcript .workflow-chat-entry").length'),count,
    'Shift+Enter must not send');
  await click('#workflow-provider-toggle');
  await eventually('document.querySelectorAll("#workflow-source-menu [role=menuitem]").length===1');
  assert.equal(await evaluate('document.querySelectorAll(".workflow-sheet-overlay").length'),0,
    'opening the source menu cannot open a second Provider dialog');
  await click('#workflow-source-menu [role=menuitem]');
  await eventually('document.querySelectorAll(".workflow-sheet-overlay [role=dialog]").length===1');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").inert'),true);
  await key('Escape','Escape',27);
  await eventually('document.querySelectorAll(".workflow-sheet-overlay").length===0');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").inert'),false);
  assert.deepEqual(errors,[],'React/browser runtime must be exception-free');
  console.log(JSON.stringify({kind:'SOURCE_BOUND_WORKFLOW_PREVIEW_CHROMIUM',
    status:'PASS',browser:(await cdp('Browser.getVersion')).product,
    scenarios:scenes,viewportWidths:[320,360,400,420,440,520],themes:['dark','light'],
    checks:['single production React root','no retired Portal','input and Enter',
      'Shift+Enter','offline result guard','run review Cancel/Confirm offline','source menu to advanced settings, Escape and inert'],native:false}));
}catch(error){
  let snapshot;
  try{snapshot=await evaluate('({ready:document.documentElement.dataset.workflowPreviewReady,'+
    'stage:document.querySelector("#od-workflow-preview-stage")?.outerHTML.slice(0,700)})');}
  catch(e){snapshot={error:String(e)};}
  console.error(JSON.stringify({kind:'SOURCE_BOUND_WORKFLOW_PREVIEW_CHROMIUM',
    status:'FAIL',error:String(error),exceptions:errors,snapshot}));
  throw error;
}finally{
  try{socket?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  await delay(120);
  await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:80});
}
