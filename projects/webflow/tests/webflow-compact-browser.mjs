#!/usr/bin/env node
// Real Chromium layout/interaction test for the real Web Flow sandbox sources.
// Only the existing UI fixture's SDK is mocked. This does NOT install the MV3
// extension, authorize a Task, or prove any webpage operation.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const harnessSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const output=process.argv[2]||'artifacts/app-ci/webflow/chrome';
const chromeBin=process.env.CHROME_BIN;
assert.ok(chromeBin,'CHROME_BIN is required for actual Chromium verification');
const profile=await mkdtemp(join(tmpdir(),'webflow-compact-chrome-'));
const fixture=spawn(process.execPath,['projects/webflow/tests/webflow-ui-server.mjs'],
  {cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
let chrome=null,socket=null,stderr='',fixtureErrors='',fixtureUrl='';
let fixtureInputs=null;
let sequence=0;
const pending=new Map(),exceptions=[];
const cleanup=async()=>{
  for(const entry of pending.values())entry.reject(Error('Test shutting down'));
  pending.clear();
  try{socket?.close();}catch{}
  // Chromium may still write profile files after SIGTERM; wait before removal.
  await Promise.all([chrome,fixture].filter(Boolean).map(child=>new Promise(resolve=>{
    if(child.exitCode!==null||child.signalCode!==null){resolve();return;}
    const deadline=setTimeout(()=>{child.kill('SIGKILL');},5000);
    child.once('exit',()=>{clearTimeout(deadline);resolve();});
    child.kill('SIGTERM');
  })));
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
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
        for(const file of ['main.js','model.js','style.css'])
          assert.match(receipt.inputs?.[file]||'',/^[a-f0-9]{64}$/,
            'Fixture source SHA256 missing: '+file);
        fixtureInputs=receipt.inputs;
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
    // Parse the final generated expression too; node --check cannot see inside it.
    try{new Function(expression);}catch(error){
      throw Error("Invalid generated browser expression: "+expression,{cause:error});
    }
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
      type:'mouseMoved',x:coords.x,y:coords.y});
    await cdp('Input.dispatchMouseEvent',{
      type:'mousePressed',button:'left',clickCount:1,x:coords.x,y:coords.y});
    await cdp('Input.dispatchMouseEvent',{
      type:'mouseReleased',button:'left',clickCount:1,x:coords.x,y:coords.y});
  };
  const key=async(value,code,virtual)=>{
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:value,code,windowsVirtualKeyCode:virtual,
      text:value==='Enter'?'\r':value===' '?' ':undefined});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:value,code,windowsVirtualKeyCode:virtual});
  };
  const screenshots=[];
  const screenshot=async name=>{
    screenshots.push(name);
    const data=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(output,name+'.png'),Buffer.from(data.data,'base64'));
  };
  await mkdir(output,{recursive:true});
  const browserVersion=await cdp('Browser.getVersion');
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:400,height:850,deviceScaleFactor:1,mobile:false});
  const navigation=await cdp('Page.navigate',{url:fixtureUrl});
  assert.ok(!navigation.errorText,'Unable to navigate to source UI');
  await eventually('!!document.querySelector(".wf-metrics")','overview ready');
  assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".wf-head").length'),1);
  assert.equal(await evaluate('document.querySelectorAll(".wf-history").length'),0);
  const layouts=[];
  const assertLayout=async(width,label)=>{
    const sizes=await evaluate(`({html:document.documentElement.scrollWidth,
      body:document.body.scrollWidth,viewport:innerWidth,
      content:document.documentElement.clientWidth})`);
    assert.equal(sizes.viewport,width,label+' viewport');
    // Classic scrollbars reserve content width; overlay scrollbars do not.
    // Check overflow against the actual content box on either platform.
    assert.ok(sizes.content>0&&sizes.content<=width,label+' content width');
    assert.ok(sizes.html<=sizes.content+1&&sizes.body<=sizes.content+1,
      label+' horizontal overflow at '+width+': '+JSON.stringify(sizes));
    layouts.push({width,label,...sizes});
  };
  const expectFocus=async selector=>{
    await eventually('document.activeElement===document.querySelector('+JSON.stringify(selector)+')',
      'focus returns to '+selector);
    assert.equal(await evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e);
      return e.matches(':focus-visible')&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2})()`),
      true,'Keyboard focus has a visible outline: '+selector);
  };
  const searchFor=async text=>{
    await click('#wf-search');
    await key('Home','Home',36);
    // Native select-all works across platforms without synthesizing a React change.
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',
      windowsVirtualKeyCode:35,modifiers:8});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',
      windowsVirtualKeyCode:35,modifiers:8});
    await key('Backspace','Backspace',8);
    if(text)await cdp('Input.insertText',{text});
    await eventually('document.querySelector("#wf-search").value==='+JSON.stringify(text),'search input');
  };
  const selectSort=async value=>{
    // Equivalent to selectOption: exercise React's change handler and row order.
    // macOS headless CDP does not reliably drive the OS-owned select popup.
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify('select[aria-label="脚本排序方式"]')});
      e.focus();e.value=${JSON.stringify(value)};
      e.dispatchEvent(new Event('input',{bubbles:true}));
      e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const filterBy=async index=>{
    await click('#wf-filter-toggle');
    await eventually('!!document.querySelector("#wf-filter-options")','filter opens');
    assert.equal(await evaluate('document.querySelector("#wf-filter-toggle").getAttribute("aria-expanded")'),'true');
    assert.equal(await evaluate('document.querySelector("#wf-filter-toggle").getAttribute("aria-controls")'),'wf-filter-options');
    await click('.wf-filter-option:nth-of-type('+index+')');
    await eventually('!document.querySelector("#wf-filter-options")','filter selection closes popover');
    assert.equal(await evaluate('document.activeElement.id'),'wf-filter-toggle');
  };
  const tested=[],tooltipEvidence=[];
  for(const width of [320,360,400]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    await click('[data-page="overview"]');
    await assertLayout(width,'Overview');
    await screenshot('overview-'+width);
    // Exercise real tab key handlers, including wrapping and Home/End.
    for(const [value,code,virtual,page] of [
      ['ArrowRight','ArrowRight',39,'scripts'],['End','End',35,'history'],
      ['ArrowRight','ArrowRight',39,'overview'],['ArrowLeft','ArrowLeft',37,'history'],
      ['Home','Home',36,'overview'],['ArrowRight','ArrowRight',39,'scripts']]){
      await key(value,code,virtual);
      await expectFocus('[data-page="'+page+'"]');
      assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").dataset.page'),page);
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify('[role=tab][tabindex="0"]')}).length`),1);
      assert.equal(await evaluate('document.querySelector("#wf-panel").getAttribute("aria-label")'),
        {overview:'概览',scripts:'脚本',history:'记录'}[page]);
    }
    await eventually('document.querySelectorAll(".wf-task-row .wf-badge[data-state=available]").length===2','two fixed tasks checked');
    await eventually(`!!document.querySelector(${JSON.stringify('button[aria-label^="准备运行 "]:not(:disabled)')})`,'recovery and current page ready');
    assert.equal(await evaluate('document.querySelectorAll(".wf-item-buttons button:disabled").length'),1,
      'Wrong-site run remains disabled: '+JSON.stringify(await evaluate('[...document.querySelectorAll(".wf-item-buttons button:disabled")].map(e=>({name:e.getAttribute("aria-label"),title:e.title}))')));
    assert.ok(await evaluate('[...document.querySelectorAll(".wf-icon")].every(e=>e.getAttribute("aria-label")&&e.title)'),
      'Icon controls expose names and native title hints');
    await assertLayout(width,'Scripts');
    await screenshot('scripts-'+width);
    await searchFor('百度');
    await eventually('document.querySelectorAll(".wf-task-row").length===1','Chinese search');
    await searchFor('www.google.com');
    await eventually('document.querySelectorAll(".wf-task-row").length===1&&document.querySelector(".wf-task-name").textContent.includes("Google")','site search');
    await searchFor('无匹配任务'.repeat(25));
    await eventually('!!document.querySelector(".wf-empty")','long search empty state');
    await assertLayout(width,'Empty search');
    await screenshot('empty-'+width);
    await click('.wf-empty button');
    await eventually('document.querySelectorAll(".wf-task-row").length===2','clear empty search');
    await filterBy(3);
    await eventually('!!document.querySelector(".wf-empty")','no installation needs attention');
    await filterBy(1);
    const nameOrder=await evaluate('[...document.querySelectorAll(".wf-task-name")].map(e=>e.dataset.wfTaskName)');
    const favoriteMenu='[data-wf-menu="'+nameOrder[1]+'"]';
    await click(favoriteMenu);
    await eventually('!!document.querySelector(".wf-menu")','favorite menu opens');
    assert.equal(await evaluate('document.querySelector(".wf-menu button:nth-child(2)").textContent'),'收藏脚本');
    await click('.wf-menu button:nth-child(2)');
    await eventually('document.querySelector(".wf-task-name").dataset.wfTaskName==='+JSON.stringify(nameOrder[1]),'favorite sorts first');
    await filterBy(4);
    await eventually('document.querySelectorAll(".wf-task-row").length===1','favorite filter');
    await filterBy(1);
    await filterBy(2);
    await eventually('document.querySelectorAll(".wf-task-row").length===2','installed available filter');
    // Available means installed, not that the current website matches both tasks.
    await click('#wf-filter-toggle');
    await selectSort('name');
    await eventually(`document.querySelector(${JSON.stringify('select[aria-label="脚本排序方式"]')}).value==="name"`,'name sort selected');
    await eventually('JSON.stringify([...document.querySelectorAll(".wf-task-name")].map(e=>e.dataset.wfTaskName))==='+JSON.stringify(JSON.stringify(nameOrder)),'name sort overrides favorite');
    await key('Escape','Escape',27);
    await eventually('!document.querySelector("#wf-filter-options")','Escape closes filter');
    await expectFocus('#wf-filter-toggle');
    // Native Tab reaches refresh; titles alone are not ARIA tooltips.
    await key('Tab','Tab',9);
    await expectFocus('button[aria-label="刷新脚本安装状态"]');
    tooltipEvidence.push({width,...await evaluate(`(()=>{const e=document.activeElement;
      return {title:e.title,describedBy:e.getAttribute('aria-describedby'),
        tooltipCount:document.querySelectorAll('[role=tooltip]').length}})()`)});
    const menu='[data-wf-menu="'+nameOrder[0]+'"]';
    await click(menu);await key('Tab','Tab',9);
    await expectFocus('.wf-menu button');
    await assertLayout(width,'More menu');
    await key('Escape','Escape',27);
    await eventually('!document.querySelector(".wf-menu")','Escape closes more menu');
    await expectFocus(menu);
    await key('Enter','Enter',13);
    await eventually('!!document.querySelector(".wf-menu")','Enter opens more menu');
    await click('.wf-menu button');
    await eventually('!!document.querySelector(".wf-task-detail")','menu opens task details');
    assert.equal(await evaluate('document.querySelectorAll(".wf-task-detail .wf-param-row").length'),3,
      'Parameter configuration retains all three fields');
    assert.equal(await evaluate('document.querySelector("#wf-query").maxLength'),120);
    assert.equal(await evaluate('document.querySelector("#wf-query").getAttribute("aria-required")'),'true');
    assert.equal(await evaluate('document.querySelector(".wf-param-fixed").textContent'),'最多 3 条');
    assert.equal(await evaluate('document.querySelector("#wf-show-execution-tab").checked'),true);
    assert.equal(await evaluate('document.querySelector(".wf-technical").open'),false,
      'Technical identity starts collapsed');
    await click('.wf-technical summary');
    await eventually('document.querySelector(".wf-technical").open','technical identity expands');
    assert.ok(await evaluate('[...document.querySelectorAll(".wf-task-detail .wf-technical .wf-mono")].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).length>=3'),
      'Expanded technical identity remains visible');
    await assertLayout(width,'Long task identity');
    await screenshot('details-'+width);
    await click('[data-page="history"]');
    assert.ok(await evaluate('document.body.textContent.includes("暂无手动运行记录")'),'Honest empty manual history');
    await assertLayout(width,'Empty history');
    // Restore preferences through existing UI so each width starts identically.
    await click('[data-page="scripts"]');
    await click(favoriteMenu);
    await eventually('!!document.querySelector(".wf-menu")','remove favorite menu opens');
    assert.equal(await evaluate('document.querySelector(".wf-menu button:nth-child(2)").textContent'),'取消收藏');
    await click('.wf-menu button:nth-child(2)');
    await eventually('document.querySelectorAll("button[aria-pressed=true]").length===0','favorite removed');
    await click('#wf-filter-toggle');
    await selectSort('favorite');
    await eventually('document.querySelector("select").value==="favorite"','restore favorite sort');
    await key('Escape','Escape',27);
    await click('[data-page="overview"]');
    await click('.wf-head-actions button[aria-label="应用偏好"]');
    await eventually('!!document.querySelector(".wf-select")','settings available');
    await assertLayout(width,'Settings');
    await screenshot('settings-'+width);
    tested.push(width);
  }
  // Seed only the isolated fixture through its existing SDK storage contract.
  // Released summaries avoid creating a fake pending task or dispatching a Task.
  const sdk=async(name,args)=>{
    const response=await fetch(fixtureUrl+'/sdk',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,args})});
    assert.ok(response.ok,'Fixture SDK setup failed: '+name);
    return response.json();
  };
  const record={clientRequestId:'ui-record-'+('a'.repeat(65)),taskId:'baidu.search.top3',version:'1.1.4',
    runId:'run-'+('b'.repeat(76)),resultId:'result-'+('c'.repeat(73)),state:'completed',
    retirementState:'released',resultPersisted:true,runtimeOk:true,business:'reported-success',
    count:3,at:Date.now()};
  const before=await sdk('storage.get',{key:'webflow.recent.v1'});
  await sdk('storage.set',{key:'webflow.recent.v1',value:[record],ifMatch:before.etag});
  await cdp('Page.reload');
  await eventually('!!document.querySelector(".wf-record-summary")','seeded record loads');
  for(const width of [320,360,400]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    await click('[data-page="overview"]');
    await assertLayout(width,'Recent activity');
    await click('[data-page="history"]');
    assert.equal(await evaluate('document.querySelectorAll(".wf-record-row").length'),1);
    await click('.wf-record-summary');
    await key('Enter','Enter',13); // Collapse with keyboard, then reopen with keyboard.
    await eventually('!document.querySelector(".wf-record-details").open','record collapses with Enter');
    await key('Enter','Enter',13);
    await eventually('document.querySelector(".wf-record-details").open','record expands with Enter');
    assert.ok(await evaluate('document.querySelector(".wf-record-expanded").textContent.includes('+JSON.stringify(record.runId)+')'),'Long original run ID remains readable');
    assert.ok(await evaluate('document.querySelector(".wf-record-expanded").textContent.includes("未观察")'),'Summary does not claim chat delivery');
    await assertLayout(width,'Expanded record');
    await screenshot('records-'+width);
    await key('Enter','Enter',13);
    await eventually('!document.querySelector(".wf-record-details").open','leave record collapsed');
  }
  await fetch(fixtureUrl+'/control/revoked',{method:'POST'});
  for(const width of [320,360,400]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    await click('[data-page="scripts"]');
    await click('button[aria-label="刷新脚本安装状态"]');
    await eventually(`document.querySelectorAll(${JSON.stringify('.wf-row-error[role=status]')}).length===2&&!document.querySelector(${JSON.stringify('button[aria-label="刷新脚本安装状态"]')}).disabled`,'permission errors visible');
    assert.equal(await evaluate('document.querySelectorAll(".wf-task-row .wf-primary:disabled").length'),2);
    await assertLayout(width,'Permission errors');
    await screenshot('errors-'+width);
  }
  assert.equal((await (await fetch(fixtureUrl+'/counts')).json()).starts,0,'UI regression never dispatches a Task');
  assert.deepEqual(exceptions,[],'Source React UI must not throw in Chromium');
  await writeFile(join(output,'receipt.json'),JSON.stringify({
    grade:'SOURCE_COMPONENT_CHROMIUM_MOCK_SDK',
    source:'projects/webflow/src/ui/{main.js,model.js,style.css}',
    inputs:fixtureInputs,browserVersion,harnessSha256,
    widths:tested,screenshots:screenshots.length,layouts,tooltipEvidence,
    notTested:['native select popup keyboard interaction (DOM option selection used)',
      'ARIA tooltip keyboard disclosure (source uses title only)',
      'long arbitrary error messages (fixture exposes E_PERMISSION only)','native extension/Authority/IME/screen reader'],
    checks:['responsive overview and scripts','three tabs, no duplicate header',
      'two real fixed Task projections','wrong-site run disabled','icon aria-labels',
      'keyboard tab wrapping/Home/End and visible focus','Chinese/site/long empty search and clear',
      'attention/available/favorite filters','favorite persistence and name sort',
      'filter/menu Escape focus return','menu keyboard and task identity',
      'empty history and long record keyboard disclosure','permission read errors','settings',
      'zero Task dispatches'],
    browserExtensionInstalled:false,taskExecuted:false,trustedAutoReactVerified:false
  },null,2)+'\n');
  console.log('WEBFLOW_CHROMIUM_COMPONENT_PASS widths='+tested.join(',')+
    ' screenshots='+screenshots.length+' no_sdk_task_execution=true');
}finally{
  clearTimeout(timer);
  await cleanup();
}
