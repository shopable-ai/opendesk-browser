#!/usr/bin/env node
// Real headless Chrome interactions against source-bound OFFLINE AdBlock preview.
// This is not an installed Chrome extension, DNR/network, or native Mac acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildPreview} from '../preview/build-preview.mjs';

const output=resolve(process.argv[2]||'artifacts/preview-chrome');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'adblock-preview-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,seq=0;
const pending=new Map(),contexts=new Map(),errors=[],network=[];
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={},sessionId=null){
  const id=++seq;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout: '+method));},18000);
    pending.set(id,{ok(v){clearTimeout(timeout);ok(v);},fail(e){clearTimeout(timeout);fail(e);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited early '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}
    catch{}
    if(port)break;
    await delay(100);
  }
  assert.ok(port,'Chrome DevTools endpoint is required');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(x=>x.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome page target missing');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data),session=row.sessionId||null;
    if(row.id&&pending.has(row.id)){
      const callback=pending.get(row.id);pending.delete(row.id);
      if(row.error)callback.fail(Error(row.error.message));else callback.ok(row.result);
    }
    if(row.method==='Runtime.executionContextCreated'){
      const c=row.params.context;
      contexts.set((session||'root')+':'+c.id,{contextId:c.id,session});
    }else if(row.method==='Runtime.executionContextDestroyed'){
      contexts.delete((session||'root')+':'+row.params.executionContextId);
    }else if(row.method==='Runtime.executionContextsCleared'){
      for(const k of contexts.keys())if(k.startsWith((session||'root')+':'))contexts.delete(k);
    }else if(row.method==='Target.attachedToTarget'){
      const s=row.params.sessionId;
      void Promise.all([cdp('Runtime.enable',{},s),cdp('Network.enable',{},s)])
        .catch(e=>errors.push('child context: '+e.message));
    }else if(row.method==='Network.requestWillBeSent'){
      if(/^https?:/i.test(row.params.request?.url||''))network.push(row.params.request.url);
    }else if(row.method==='Runtime.exceptionThrown'){
      errors.push(row.params.exceptionDetails?.exception?.description||
        row.params.exceptionDetails?.text||'uncaught Chrome script exception');
    }
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
async function evaluate(expression,ctx=null){
  const row=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,
    ...(ctx?{contextId:ctx.contextId}:{})},ctx?.session||null);
  if(row.exceptionDetails)throw Error(row.exceptionDetails.exception?.description||
    row.exceptionDetails.text||'Runtime.evaluate exception');
  return row.result?.value;
}
async function poll(fn,label){
  let last='';
  for(let i=0;i<110;i++){
    try{const value=await fn();if(value)return value;}catch(e){last=e.message;}
    await delay(65);
  }
  throw Error('UI did not reach '+label+(last?': '+last:''));
}
async function open(scenario){
  const built=await buildPreview({tool:'adblock',surface:'side-panel',
    scenario,theme:'light',width:360,height:760});
  contexts.clear();errors.length=0;network.length=0;
  await cdp('Emulation.setDeviceMetricsOverride',{
    width:670,height:1000,deviceScaleFactor:1,mobile:false
  });
  await cdp('Page.navigate',{url:pathToFileURL(built.output).href});
  const ctx=await poll(async()=>{
    for(const x of contexts.values()){
      try{
        if(await evaluate("Boolean(globalThis.OpenDeskTool&&document.getElementById('exception-count'))",x))
          return x;
      }catch{}
    }
    return null;
  },scenario+' sandbox package');
  await poll(()=>evaluate("document.querySelectorAll('#od-preview-adblock-host button[role=switch]').length===2"),
    'trusted AdBlock host controls');
  return {built,ctx};
}
async function parent(){
  return evaluate('('+function(){
    const host=document.getElementById('od-preview-adblock-host');
    const frame=document.getElementById('opendesk-preview-frame');
    const switches=[...host.querySelectorAll('button[role=switch]')];
    return {switches:switches.map(s=>({checked:s.getAttribute('aria-checked')==='true',
      disabled:s.disabled,text:s.textContent,width:s.getBoundingClientRect().width})),
      hostText:host.textContent,
      dialog:document.getElementById('od-preview-adblock-restore-dialog').open,
      note:document.getElementById('od-preview-adblock-feedback').textContent,
      frameHeight:frame.getBoundingClientRect().height,
      sandbox:frame.getAttribute('sandbox'),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
  }.toString()+')()');
}
async function child(ctx){
  return evaluate('('+function(){
    return {count:document.getElementById('exception-count').textContent,
      domains:[...document.querySelectorAll('.adblock-domain')].map(n=>n.textContent),
      buttons:document.querySelectorAll('.adblock-restore').length,
      message:document.getElementById('adblock-message').textContent,
      image:!!document.querySelector('img[src="x"]'),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
  }.toString()+')()',ctx);
}
async function click(selector,ctx=null){
  const rect=await evaluate('('+function(sel){
    const el=document.querySelector(sel);
    if(!el)throw Error('missing element '+sel);
    el.scrollIntoView({block:'nearest',inline:'nearest'});
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};
  }.toString()+')('+JSON.stringify(selector)+')',ctx);
  assert.ok(rect.w>0&&rect.h>0,'clickable target: '+selector);
  if(ctx){
    const offset=await evaluate('('+function(){
      const b=document.getElementById('opendesk-preview-frame').getBoundingClientRect();
      return {x:b.left,y:b.top};
    }.toString()+')()');
    rect.x+=offset.x;rect.y+=offset.y;
  }
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,
    button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,
    button:'left',clickCount:1});
}
async function screenshot(name){
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(join(output,'adblock-'+name+'.png'),Buffer.from(shot.data,'base64'));
}
function clean(){
  assert.deepEqual(network,[],'offline preview cannot request HTTP(S)');
  assert.deepEqual(errors,[],'headless Chrome must report no uncaught errors');
}
try{
  await connect();
  const report=[];
  {
    const {built,ctx}=await open('success');
    await poll(async()=>(await child(ctx)).count==='1','initial exception');
    const host=await parent(),list=await child(ctx);
    assert.deepEqual(host.switches.map(x=>x.checked),[true,false]);
    assert.deepEqual(host.switches.map(x=>Math.round(x.width)),[46,46]);
    assert.equal(host.sandbox,'allow-scripts');
    assert.equal(host.overflow,false);
    assert.equal(list.overflow,false);
    assert.deepEqual(list.domains,['news.example.com']);
    assert.equal(list.buttons,1);
    await screenshot('success');
    // A forged child receipt cannot bypass the genuine restore dialog.
    await evaluate("window.parent.postMessage({type:'opendesk.preview.adblock.exceptions',requestId:888,exceptions:[]},'*')",ctx);
    await delay(90);
    assert.equal((await parent()).switches[1].checked,false);
    await click('#exceptions .adblock-restore',ctx);
    await poll(async()=>(await parent()).dialog,'restore confirmation');
    await screenshot('confirmation');
    await click('#od-preview-adblock-restore-cancel');
    await poll(async()=>!(await parent()).dialog,'restore cancel');
    assert.equal((await child(ctx)).count,'1');
    await click('#exceptions .adblock-restore',ctx);
    await poll(async()=>(await parent()).dialog,'restore repeat');
    await click('#od-preview-adblock-restore-accept');
    await poll(async()=>(await child(ctx)).count==='0','sandbox restore readback');
    await poll(async()=>(await parent()).switches[1].checked,'host exception readback');
    await screenshot('restored');
    clean();
    report.push({scenario:'success',sourceCommit:built.sourceCommit,
      uiSha256:built.uiSha256,checks:['source-dom','source-css-switch',
      'sandbox-opaque','real-click-confirm','cancel-preserves-state',
      'accepted-matching-receipt','forged-message-rejected','no-network']});
  }
  {
    const {ctx}=await open('empty');
    await poll(async()=>(await child(ctx)).count==='0','empty exception list');
    assert.equal((await parent()).switches[0].checked,false);
    await screenshot('permission-before');
    await click('#od-preview-adblock-host button[role=switch]');
    await poll(async()=>(await parent()).hostText.includes('需重启 Chrome'),
      'restart-required snapshot');
    const host=await parent();
    assert.equal(host.switches[0].checked,false);
    assert.equal(host.switches[0].disabled,true);
    assert.match(host.note,/重启 Chrome/);
    await screenshot('restart-required');
    clean();report.push({scenario:'empty',checks:['empty-list',
      'real-click-grant','restart-required','no-fake-enabled-state']});
  }
  {
    const {ctx}=await open('untrusted');
    await poll(async()=>(await child(ctx)).domains.length===1,'malicious domain text');
    const list=await child(ctx);
    assert.match(list.domains[0],/<img src=x onerror=alert\(1\)>/);
    assert.equal(list.image,false);
    await screenshot('untrusted');clean();
    report.push({scenario:'untrusted',checks:['text-only-untrusted-domain']});
  }
  for(const scenario of ['error','loading','permission-denied']){
    await open(scenario);
    const host=await parent();
    assert.equal(host.switches[0].disabled,true,'fail-closed '+scenario);
    await screenshot(scenario);clean();
    report.push({scenario,checks:['disabled-unsafe-controls']});
  }
  await writeFile(join(output,'adblock-preview-chrome.json'),
    JSON.stringify({status:'PREVIEW_BROWSER_PASS_NOT_INSTALLED',
      installed:false,chromeDnr:false,scenarios:report},null,2)+'\n');
  console.log('ADBLOCK_PREVIEW_CHROME_PASS_NOT_INSTALLED '+report.length+' scenarios');
}catch(e){
  console.error('ADBLOCK_PREVIEW_CHROME_FAIL '+(e?.stack||e));
  process.exitCode=1;
}finally{
  if(socket)socket.close();
  chrome.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
