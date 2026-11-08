#!/usr/bin/env node
// Real Chromium layout/interaction test for the real Web Flow sandbox sources.
// Only the existing UI fixture's SDK is mocked. This does NOT install the MV3
// extension, authorize a Task, or prove any webpage operation.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const output=process.argv[2]||'artifacts/app-ci/webflow/chrome';
const chromeBin=process.env.CHROME_BIN;
assert.ok(chromeBin,'CHROME_BIN is required for actual Chromium verification');
const profile=await mkdtemp(join(tmpdir(),'webflow-compact-chrome-'));
const fixture=spawn(process.execPath,['projects/webflow/tests/webflow-ui-server.mjs'],
  {cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
let chrome=null,socket=null,stderr='',fixtureErrors='',fixtureUrl='';
let sequence=0;
const pending=new Map(),exceptions=[];
const cleanup=async()=>{
  for(const entry of pending.values())entry.reject(Error('Test shutting down'));
  pending.clear();
  try{socket?.close();}catch{}
  for(const child of [chrome,fixture])if(child&&!child.killed)child.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true});
};
const timer=setTimeout(()=>{fixture.kill('SIGTERM');chrome?.kill('SIGTERM');},90000);
try{
  fixture.stderr.on('data',bytes=>{fixtureErrors=(fixtureErrors+bytes.toString()).slice(-4000);});
  fixtureUrl=await new Promise((resolve,reject)=>{
    let stdout='';
    const timeout=setTimeout(()=>reject(Error('Web Flow UI fixture startup timeout: '+fixtureErrors)),25000);
    const rejectOnce=err=>{clearTimeout(timeout);reject(err);};
    fixture.once('error',rejectOnce);
    fixture.once('exit',(code,signal)=>rejectOnce(Error('Fixture exited '+code+' '+signal+': '+fixtureErrors)));
    fixture.stdout.on('data',chunk=>{
      stdout+=chunk.toString();
      const newline=stdout.indexOf('\n');
      if(newline<0)return;
      try{
        const receipt=JSON.parse(stdout.slice(0,newline));
        assert.equal(receipt.level,'UI_COMPONENT_MOCK_SDK');
        assert.match(receipt.url,/^http:\/\/127\.0\.0\.1:\d+$/);
        clearTimeout(timeout);
        resolve(receipt.url);
      }catch(error){rejectOnce(error);}
    });
  });
  chrome=spawn(chromeBin,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--window-size=640,860',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-4500);});
  let debugPort=0;
  for(let attempt=0;attempt<250;attempt++){
    if(chrome.exitCode!==null)throw Error('Chromium exited: '+stderr);
    try{
      debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      if(debugPort)break;
    }catch{}
    await sleep(100);
  }
  assert.ok(debugPort,'Chromium debugging port unavailable: '+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  const target=targets.find(tab=>tab.type==='page');
  assert.ok(target?.webSocketDebuggerUrl,'No Chromium page target');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown'){
      exceptions.push(message.params.exceptionDetails?.exception?.description||
        message.params.exceptionDetails?.text||'unknown runtime exception');
    }
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')
      exceptions.push('console.error: '+message.params.args.map(x=>x.value||x.description).join(' '));
    const call=pending.get(message.id);
    if(!call)return;
    pending.delete(message.id);
    if(message.error)call.reject(Error(message.error.message));
    else call.resolve(message.result);
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const deadline=setTimeout(()=>{
      pending.delete(id);reject(Error('CDP timeout: '+method));
    },18000);
    pending.set(id,{
      resolve:value=>{clearTimeout(deadline);resolve(value);},
      reject:error=>{clearTimeout(deadline);reject(error);}
    });
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)
      throw Error('Browser evaluate failed: '+JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const eventually=async(expression,label)=>{
    for(let n=0;n<110;n++){
      if(await evaluate(expression))return;
      await sleep(75);
    }
    throw Error('Chromium condition missing ('+label+'): '+expression);
  };
  const click=async selector=>{
    const coords=await evaluate('(()=>{const el=document.querySelector('+
      JSON.stringify(selector)+');if(!el)throw Error("Missing native click element");'+
      'el.scrollIntoView({block:"nearest",inline:"nearest"});const b=el.getBoundingClientRect();'+
      'return {x:b.left+b.width/2,y:b.top+b.height/2,width:b.width,height:b.height}})()');
    assert.ok(coords.width>0&&coords.height>0,'Target hidden: '+selector);
    await cdp('Input.dispatchMouseEvent',{
      type:'mousePressed',button:'left',clickCount:1,x:coords.x,y:coords.y});
    await cdp('Input.dispatchMouseEvent',{
      type:'mouseReleased',button:'left',clickCount:1,x:coords.x,y:coords.y});
  };
  const key=async(value,code,virtual)=>{
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:value,code,windowsVirtualKeyCode:virtual});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:value,code,windowsVirtualKeyCode:virtual});
  };
  const screenshot=async name=>{
    const data=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(output,name+'.png'),Buffer.from(data.data,'base64'));
  };
  await mkdir(output,{recursive:true});
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:850,deviceScaleFactor:1,mobile:false});
  const navigation=await cdp('Page.navigate',{url:fixtureUrl});
  assert.ok(!navigation.errorText,'Unable to navigate to source UI');
  await eventually('!!document.querySelector(".wf-metrics")','overview ready');
  assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".wf-head").length'),1);
  assert.equal(await evaluate('document.querySelectorAll(".wf-history").length'),0);
  const tested=[];
  for(const width of [320,360,400]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    await sleep(100);
    const dimension=await evaluate('({viewport:document.documentElement.clientWidth,'+
      'htmlWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth})');
    assert.ok(dimension.htmlWidth<=width+1&&dimension.bodyWidth<=width+1,
      'Overview horizontal overflow at '+width+': '+JSON.stringify(dimension));
    await screenshot('overview-'+width);
    await click('[data-page="scripts"]');
    await eventually('document.querySelectorAll(".wf-task-row").length===2','two live pinned tasks');
    const metrics=await evaluate('({htmlWidth:document.documentElement.scrollWidth,'+
      'bodyWidth:document.body.scrollWidth,'+
      'disabled:[...document.querySelectorAll(".wf-task-row button[aria-label^=\\"无法运行 \\"]")].filter(b=>b.disabled).length,'+
      'aria:[...document.querySelectorAll(".wf-item-buttons button")].every(b=>!!b.getAttribute("aria-label"))})');
    assert.ok(metrics.htmlWidth<=width+1&&metrics.bodyWidth<=width+1,
      'Scripts horizontal overflow at '+width+': '+JSON.stringify(metrics));
    assert.ok(metrics.disabled>=1,'Website mismatch has an explicit disabled run');
    assert.ok(metrics.aria,'Icon actions must be accessible');
    await screenshot('scripts-'+width);
    tested.push(width);
    await click('[data-page="overview"]');
  }
  await click('[data-page="scripts"]');
  await click('#wf-search');
  await cdp('Input.insertText',{text:'百度'});
  await eventually('document.querySelectorAll(".wf-task-row").length===1','search filters fixed pins');
  await click('#wf-filter-toggle');
  await eventually('!!document.getElementById("wf-filter-options")','open filter');
  await key('Escape','Escape',27);
  await eventually('!document.getElementById("wf-filter-options")','escape closes filter');
  assert.equal(await evaluate('document.activeElement?.id'),'wf-filter-toggle');
  await click('.wf-task-name');
  await eventually('!!document.querySelector(".wf-task-detail")','expanded technical task detail');
  assert.equal(await evaluate('document.querySelectorAll(".wf-task-detail .wf-mono").length>=3'),true);
  await click('[data-page="history"]');
  assert.ok(await evaluate('document.body.textContent.includes("暂无手动运行记录")'),
    'History does not invent executed tasks');
  await click('[data-page="overview"]');
  await click('.wf-head-actions button[aria-label="应用设置"]');
  await eventually('!!document.querySelector(".wf-select")','settings available');
  await screenshot('settings-400');
  assert.deepEqual(exceptions,[],'Source React UI must not throw in Chromium');
  await writeFile(join(output,'receipt.json'),JSON.stringify({
    grade:'SOURCE_COMPONENT_CHROMIUM_MOCK_SDK',
    source:'projects/webflow/src/ui/{main.js,model.js,style.css}',
    widths:tested,screenshots:8,
    checks:['responsive overview and scripts','three tabs, no duplicate header',
      'two real fixed Task projections','wrong-site run disabled','icon aria-labels',
      'search','Escape and focus return','expanded Task identity','honest empty history','settings'],
    browserExtensionInstalled:false,taskExecuted:false,trustedAutoReactVerified:false
  },null,2)+'\n');
  console.log('WEBFLOW_CHROMIUM_COMPONENT_PASS widths='+tested.join(',')+
    ' screenshots=8 no_sdk_task_execution=true');
}finally{
  clearTimeout(timer);
  await cleanup();
}
