#!/usr/bin/env node
// STATIC_OFFLINE_CHROME smoke test, not a native installed extension acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildPreview} from '../preview/build-preview.mjs';

const output=resolve(process.argv[2]||'artifacts/preview-chrome');
const profile=await mkdtemp(join(tmpdir(),'opendesk-preview-chrome-'));
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--no-default-browser-check','--hide-scrollbars',
  '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,sequence=0;
const pending=new Map(),contexts=new Map(),network=[],errors=[];
function cdp(method,params={},sessionId=null){
  const id=++sequence;
  return new Promise((ok,fail)=>{
    const timeout=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout: '+method));},20000);
    pending.set(id,{ok(value){clearTimeout(timeout);ok(value);},fail(error){clearTimeout(timeout);fail(error);}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<100;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}
    catch{}
    await delay(100);
  }
  if(!port)throw Error('Chrome debugging port unavailable');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(row=>row.type==='page');
  if(!target?.webSocketDebuggerUrl)throw Error('Chrome page target not found');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){
      const callback=pending.get(m.id);pending.delete(m.id);
      if(m.error)callback.fail(Error(m.error.message));else callback.ok(m.result);
    }
    const session=m.sessionId||null;
    if(m.method==='Runtime.executionContextCreated'){
      const info=m.params.context;
      contexts.set((session||'root')+':'+info.id,{contextId:info.id,session});
    }else if(m.method==='Runtime.executionContextDestroyed'){
      contexts.delete((session||'root')+':'+m.params.executionContextId);
    }else if(m.method==='Runtime.executionContextsCleared'){
      for(const key of contexts.keys())if(key.startsWith((session||'root')+':'))contexts.delete(key);
    }else if(m.method==='Network.requestWillBeSent'){
      if(/^https?:/i.test(m.params.request?.url||''))network.push(m.params.request.url);
    }else if(m.method==='Runtime.exceptionThrown'){
      errors.push(String(m.params.exceptionDetails?.text||'script exception'));
    }else if(m.method==='Target.attachedToTarget'){
      const nested=m.params.sessionId;
      void Promise.all([
        cdp('Runtime.enable',{},nested),
        cdp('Network.enable',{},nested)
      ]).catch(error=>errors.push('Isolated frame inspection unavailable: '+error.message));
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
const inspect='('+function inspect(){
  const root=document.getElementById('tool-root');
  const note=document.getElementById('note-text');
  if(!root||!note)return null;
  const save=document.getElementById('save-note');
  const computed=getComputedStyle(save);
  const bounds=save.getBoundingClientRect();
  return {
    loaded:true,frameWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    count:document.getElementById('note-count')?.textContent||'',
    noteValue:note.value,status:document.getElementById('note-status')?.textContent||'',
    summary:document.getElementById('page-summary')?.textContent||'',
    disabled:note.disabled,buttonWidth:bounds.width,buttonHeight:bounds.height,
    buttonRight:bounds.right,buttonColor:computed.backgroundColor,
    buttonRadius:computed.borderRadius,
    token:getComputedStyle(document.documentElement).getPropertyValue('--od-brand').trim(),
    colorScheme:getComputedStyle(document.documentElement).colorScheme,
    injected:!!document.querySelector('img[src="x"],script[data-user-supplied]')
  };
}.toString()+')()';
function scenarioReady(scenario,row){
  if(scenario==='success'||scenario==='untrusted')return row.count==='1 条'&&row.noteValue.length>0;
  if(scenario==='empty')return row.count==='0 条'&&!row.disabled;
  if(scenario==='loading')return row.disabled;
  return row.disabled&&/读取失败|保护原数据/.test(row.status);
}
async function toolFrame(scenario){
  for(let i=0;i<100;i++){
    for(const c of [...contexts.values()]){
      try{
        const value=await cdp('Runtime.evaluate',{
          expression:inspect,contextId:c.contextId,returnByValue:true,silent:true
        },c.session);
        if(!value.exceptionDetails&&value.result?.value?.loaded&&scenarioReady(scenario,value.result.value))
          return value.result.value;
      }catch{/* context retired during navigation */}
    }
    await delay(75);
  }
  throw Error('Preview sandbox UI not found; scripts or data: resources might be blocked');
}
function check(scenario,theme,width,result){
  assert.equal(result.frameWidth,width,'sandbox iframe CSS width');
  assert.ok(result.scrollWidth<=width+1,'iframe horizontal scroll: '+JSON.stringify(result));
  assert.ok(Math.abs(result.buttonWidth-34)<1,'canonical 34px icon width');
  assert.ok(Math.abs(result.buttonHeight-34)<1,'canonical 34px icon height');
  assert.ok(result.buttonRight<=width+1,'save button clipped');
  assert.match(result.buttonRadius,/px/);
  assert.ok(result.token.startsWith('#'),'canonical design token missing');
  assert.equal(result.colorScheme,theme,'forced theme missing in sandbox');
  assert.equal(result.injected,false,'hostile text generated active markup');
  if(scenario==='success'||scenario==='untrusted'){
    assert.equal(result.count,'1 条');
    assert.ok(result.noteValue.length>0);
    if(scenario==='untrusted')assert.match(result.noteValue,/<img src=x onerror=alert\(1\)>/);
  }else if(scenario==='empty'){
    assert.equal(result.count,'0 条');
    assert.equal(result.noteValue,'');
  }else if(scenario==='loading'){
    assert.equal(result.disabled,true);
  }else if(scenario==='error'||scenario==='permission-denied'){
    assert.match(result.status,/读取失败|保护原数据/);
    assert.equal(result.disabled,true);
  }
}
try{
  await mkdir(output,{recursive:true});
  await connect();
  const matrix=[];
  for(const width of [320,360,400,480])
    for(const theme of ['light','dark'])matrix.push({width,theme,scenario:'success'});
  for(const scenario of ['empty','error','loading','permission-denied','untrusted'])
    matrix.push({width:360,theme:'light',scenario});
  const reports=[];
  for(const options of matrix){
    const {width,theme,scenario}=options;
    const result=await buildPreview({...options,height:760});
    contexts.clear();network.length=0;errors.length=0;
    await cdp('Emulation.setDeviceMetricsOverride',{
      width:Math.max(width+70,560),height:980,deviceScaleFactor:1,mobile:false
    });
    await cdp('Emulation.setEmulatedMedia',{
      features:[{name:'prefers-color-scheme',value:theme}]
    });
    await cdp('Page.navigate',{url:pathToFileURL(result.output).href});
    const rendered=await toolFrame(scenario);
    check(scenario,theme,width,rendered);
    assert.equal(network.length,0,'remote request: '+network.join(','));
    assert.deepEqual(errors,[],'unhandled script exception');
    const shot=await cdp('Page.captureScreenshot',{format:'png'});
    const basename=[scenario,theme,String(width)].join('-');
    await writeFile(join(output,basename+'.png'),Buffer.from(shot.data,'base64'));
    reports.push({basename,sourceCommit:result.sourceCommit,designSha256:result.designSha256,
      uiSha256:result.uiSha256,scenario,theme,width,rendered,networkRequests:network.length,exceptions:errors.length});
  }
  await writeFile(join(output,'static-offline-preview.json'),
    JSON.stringify({status:'STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED',cases:reports},null,2)+'\n');
  console.log('STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED '+reports.length+' cases; '+output);
}catch(error){
  console.error('STATIC_OFFLINE_CHROME_FAIL: '+error.stack);
  process.exitCode=1;
}finally{
  if(socket)socket.close();
  chrome.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
