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
  await cdp('Page.bringToFront');
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
// The iframe always mounts the actual Vite-compiled App.jsx; the outer shell
// supplies only inert confirmation prompts. No deprecated native/restore DOM.
async function open(scenario,width=360,theme='light'){
  const built=await buildPreview({tool:'adblock',surface:'side-panel',
    scenario,theme,width,height:760});
  contexts.clear();errors.length=0;network.length=0;
  await cdp('Emulation.setDeviceMetricsOverride',{
    width:760,height:1050,deviceScaleFactor:1,mobile:false
  });
  await cdp('Page.navigate',{url:pathToFileURL(built.output).href});
  const ctx=await poll(async()=>{
    for(const row of contexts.values()){
      try{
        if(await evaluate('Boolean(globalThis.OpenDeskTool&&document.querySelector(".adblock-app [data-slot=switch]"))',row))
          return row;
      }catch{}
    }
    return null;
  },scenario+' compiled React iframe');
  await poll(async()=>(await child(ctx)).switches.length===2,
    'React global and website switches');
  return {built,ctx};
}
async function parent(){
  return evaluate('('+function(){
    const frame=document.getElementById('opendesk-preview-frame');
    const title=document.getElementById('sidebar-tool-title');
    const dialog=document.getElementById('od-preview-adblock-restore-dialog');
    return {
      frame:!!frame,frameHeight:frame?.getBoundingClientRect().height||0,
      sandbox:frame?.getAttribute('sandbox'),title:title?.textContent.trim(),
      dialog:dialog?.open||false,
      dialogText:dialog?.textContent||'',
      feedback:document.getElementById('od-preview-adblock-feedback')?.textContent||'',
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      duplicateLegacyHost:!!document.querySelector('#od-preview-adblock-host .adblock-native-head')
    };
  }.toString()+')()');
}
async function child(ctx){
  return evaluate('('+function(){
    const app=document.querySelector('.adblock-app');
    const switches=[...document.querySelectorAll('.adblock-app [data-slot=switch]')]
      .map(row=>({
        label:row.getAttribute('aria-label'),
        selected:row.hasAttribute('data-selected'),
        disabled:row.hasAttribute('data-disabled'),
        width:row.getBoundingClientRect().width
      }));
    return {
      mounted:!!app,
      switches,
      status:app?.querySelector('.adblock-state')?.textContent.trim()||'',
      notice:app?.querySelector('.adblock-notice')?.textContent.trim()||'',
      noticeError:app?.querySelector('.adblock-notice')?.getAttribute('data-error')||'',
      exceptions:[...document.querySelectorAll('.adblock-exception strong')]
        .map(row=>row.textContent),
      restoreDisabled:[...document.querySelectorAll('.adblock-exception button')]
        .map(row=>row.disabled),
      empty:!!document.querySelector('.adblock-empty'),
      nav:app?.querySelector('.adblock-link')?.textContent.trim()||'',
      headings:[...document.querySelectorAll('.adblock-page-head strong')]
        .map(row=>row.textContent),
      hasUnsafeImage:!!app?.querySelector('img[src="x"]'),
      text:app?.textContent||'',
      overflow:document.documentElement.scrollWidth>innerWidth+1
    };
  }.toString()+')()',ctx);
}
function selected(state,label){
  const row=state.switches.find(s=>s.label===label);
  assert.ok(row,'React switch has accessible label: '+label+' '+JSON.stringify(state.switches));
  return row;
}
async function pointer(x,y){
  assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0,'CDP click coordinates');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
}
async function clickOuter(selector){
  const position=await evaluate('('+function(sel){
    const item=document.querySelector(sel);
    if(!item)throw Error('Missing outer control '+sel);
    item.scrollIntoView({block:'nearest',inline:'nearest'});
    const r=item.getBoundingClientRect();
    if(r.width<4||r.height<4)throw Error('Hidden outer control '+sel);
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }.toString()+')('+JSON.stringify(selector)+')');
  await pointer(position.x,position.y);
}
async function clickReact(selector,ctx){
  await evaluate('('+function(sel){
    const item=document.querySelector(sel);
    if(!item)throw Error('Missing compiled React control '+sel);
    item.scrollIntoView({block:'nearest',inline:'nearest'});
    if(item.hasAttribute('data-disabled')||item.disabled)
      throw Error('Disabled React target '+sel);
    return true;
  }.toString()+')('+JSON.stringify(selector)+')',ctx);
  await evaluate('document.getElementById("opendesk-preview-frame").scrollIntoView({block:"nearest"})');
  const [frame,inside]=await Promise.all([
    evaluate('('+function(){
      const r=document.getElementById('opendesk-preview-frame').getBoundingClientRect();
      return {x:r.left,y:r.top,width:r.width,height:r.height};
    }.toString()+')()'),
    evaluate('('+function(sel){
      const r=document.querySelector(sel).getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
    }.toString()+')('+JSON.stringify(selector)+')',ctx)
  ]);
  assert.ok(inside.width>=4&&inside.height>=4,'visible compiled React target: '+selector);
  assert.ok(inside.x>=0&&inside.x<frame.width&&inside.y>=0&&inside.y<frame.height,
    'target must be inside the real iframe viewport: '+selector);
  await pointer(frame.x+inside.x,frame.y+inside.y);
}
async function screenshot(name){
  const shot=await cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(join(output,'adblock-react-'+name+'.png'),Buffer.from(shot.data,'base64'));
}
function offlineSafety(){
  assert.deepEqual(network,[],'offline preview must not make HTTP(S) requests');
  assert.deepEqual(errors,[],'Chrome must not report uncaught iframe/script exceptions');
}
const GLOBAL='[data-slot="switch"][aria-label="全局广告拦截"]';
const SITE='[data-slot="switch"][aria-label="当前网站广告过滤"]';
try{
  await connect();
  const report=[];
  {
    const {ctx,built}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'initial verified global state');
    const initial=await child(ctx),shell=await parent();
    assert.equal(shell.title,'广告拦截');
    assert.equal(shell.sandbox,'allow-scripts');
    assert.equal(shell.duplicateLegacyHost,false);
    assert.equal(shell.overflow,false);
    assert.equal(initial.overflow,false);
    assert.equal(selected(initial,'当前网站广告过滤').selected,false);
    assert.match(initial.nav,/已停用的网站\s*1/);
    await screenshot('overview');
    await clickReact('.adblock-link',ctx);
    await poll(async()=>(await child(ctx)).exceptions.length===1,'React exception page');
    assert.deepEqual((await child(ctx)).exceptions,['news.example.com']);
    await screenshot('exceptions');
    // Confirmations run in the trusted-preview OUTER document only.
    await clickReact('.adblock-exception button',ctx);
    await poll(async()=>(await parent()).dialog,'restore confirm');
    assert.deepEqual((await child(ctx)).restoreDisabled,[true],
      'the pending React operation must suppress duplicate submissions');
    // An unmatched forged message must never replace the real approval.
    await evaluate("window.parent.postMessage({type:'opendesk.preview.adblock.review-decision',requestId:999,accepted:true},'*')",ctx);
    assert.equal((await parent()).dialog,true);
    await screenshot('restore-confirmation');
    await clickOuter('#od-preview-adblock-restore-cancel');
    await poll(async()=>!(await parent()).dialog,'restore cancellation');
    await poll(async()=>((await child(ctx)).restoreDisabled[0]===false),
      'cancelled operation unlocked');
    assert.deepEqual((await child(ctx)).exceptions,['news.example.com'],
      'cancelling does not alter saved mock state');
    await clickReact('.adblock-exception button',ctx);
    await poll(async()=>(await parent()).dialog,'restore second confirmation');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>(await child(ctx)).empty,'React restore readback');
    await screenshot('restored');
    await clickReact('.adblock-back',ctx);
    await poll(async()=>selected(await child(ctx),'当前网站广告过滤').selected,
      'website filter restored');
    // Actual CDP pointer events exercise both global and site React Aria switches.
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'site exception confirm');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>!selected(await child(ctx),'当前网站广告过滤').selected,
      'site exception readback');
    assert.match((await child(ctx)).nav,/已停用的网站\s*1/);
    await clickReact(GLOBAL,ctx);
    await poll(async()=>(await parent()).dialog,'global disable confirm');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>!selected(await child(ctx),'全局广告拦截').selected,
      'global disable readback');
    await clickReact(GLOBAL,ctx);
    await poll(async()=>(await parent()).dialog,'global enable confirm');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'global enable readback');
    await clickOuter('#sidebar-tool-settings-open');
    await poll(async()=>(await child(ctx)).headings.includes('设置说明'),
      'React settings navigation from toolbar');
    await screenshot('settings');
    await clickReact('.adblock-back',ctx);
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'React settings back to overview');
    offlineSafety();
    report.push({scenario:'success',sourceCommit:built.sourceCommit,
      uiSha256:built.uiSha256,checks:[
        'compiled-react-mounted','real-CDP-pointer-React-Aria-controls',
        'restore-accept','restore-cancel','pending-duplicate-locked',
        'global-disable-enable','site-exception','settings-back',
        'opaque-sandbox','offline-no-network','forged-review-ignored']});
  }
  // R2.4: real pointer clicks into the compiled JSX and simulated target webpage.
  {
    const {ctx,built}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,'picker ready');
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'filtering approval');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>selected(await child(ctx),'当前网站广告过滤').selected,'site enabled');
    const hidden=()=>evaluate('document.getElementById("promo-sidebar").classList.contains("is-hidden")');
    const pick=async()=>{
      await clickReact('.adblock-manual-actions button:first-child',ctx);
      await poll(async()=>(await child(ctx)).text.includes('正在选择网页区域'),'picker active');
      await clickOuter('#promo-sidebar');
      await poll(hidden,'one-click hide');
      await poll(async()=>(await child(ctx)).text.includes('已隐藏并保存'),'saved receipt');
    };
    await pick();
    await clickReact('.adblock-pick-panel button',ctx);
    await poll(async()=>!(await hidden()),'side panel undo');
    await pick();
    await clickReact('.adblock-manual-actions button:nth-child(2)',ctx);
    const row='.adblock-rule:has(.adblock-selector[title="#promo-sidebar"])';
    const found=()=>evaluate('Boolean(document.querySelector('+JSON.stringify(row)+'))',ctx);
    await poll(found,'persistent history');
    await poll(()=>evaluate('!document.querySelector('+JSON.stringify(row+' .adblock-rule-actions button:first-child')+').disabled',ctx),'history match count');
    await clickReact(row+' .adblock-rule-actions button:first-child',ctx);
    await poll(()=>evaluate('document.getElementById("promo-sidebar").classList.contains("is-located")'),'locate highlight');
    await delay(2600);
    await poll(hidden,'locate auto restores hide');
    await clickReact(row+' .adblock-rule-actions button:nth-child(2)',ctx);
    await poll(async()=>!(await hidden()),'temporarily visible');
    await clickReact(row+' .adblock-rule-actions button:nth-child(2)',ctx);
    await poll(hidden,'re-hidden');
    await clickReact(row+' .adblock-rule-actions button:nth-child(4)',ctx);
    await poll(async()=>!(await hidden()),'permanently restored');
    await poll(async()=>!(await found()),'rule removed from history');
    await screenshot('r24-picker-history');
    offlineSafety();
    report.push({scenario:'r24-picker-history',uiSha256:built.uiSha256,
      checks:['one-click-hide','undo','history','locate','temporary-show',
        're-hide','delete','offline']});
  }
  // Browser-delivered external state change during an unconfirmed write.
  // The 8+ second wait is deliberate: a stale request must not target the
  // newly active site, even when the old preview confirmation remains open.
  {
    const {ctx}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'navigation race ready');
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'delayed site confirmation');
    await delay(8200);
    await evaluate('('+function(){
      document.getElementById('opendesk-preview-frame').contentWindow.postMessage({
        type:'opendesk.preview.adblock.state',enabled:true,granted:true,
        exceptions:['news.example.com'],currentHost:'video.example.com'
      },'*');
    }.toString()+')()');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>{
      const view=await child(ctx);
      return view.text.includes('video.example.com')&&
        selected(view,'当前网站广告过滤').selected===true&&
        /已停用的网站\s*1/.test(view.nav);
    },'old page write must not cross into new site');
    const switched=await child(ctx);
    assert.doesNotMatch(switched.notice,/Chrome 已确认|设置已由 Chrome 确认/,
      'a late confirmation must never appear as old-site success');
    assert.match(switched.text,/video\.example\.com/);
    offlineSafety();
    report.push({scenario:'delayed-page-switch',checks:[
      '8-second-pending-confirmation','old-site-write-rejected',
      'new-site-readback','no-replayed-write','offline-not-DNR']});
  }
  {
    const {ctx}=await open('success');
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'permission race ready');
    await clickReact(SITE,ctx);
    await poll(async()=>(await parent()).dialog,'permission-revocation confirmation');
    await evaluate('('+function(){
      document.getElementById('opendesk-preview-frame').contentWindow.postMessage({
        type:'opendesk.preview.adblock.state',enabled:true,granted:false,
        exceptions:['news.example.com']
      },'*');
    }.toString()+')()');
    await clickOuter('#od-preview-adblock-restore-accept');
    await poll(async()=>{
      const view=await child(ctx);
      return view.status.includes('过滤权限不可用')&&
        selected(view,'当前网站广告过滤').disabled===true;
    },'revoked permission cannot complete pending write');
    assert.match((await child(ctx)).nav,/已停用的网站\s*1/);
    offlineSafety();
    report.push({scenario:'revoked-during-confirmation',checks:[
      'permission-rechecked-on-accept','no-write-after-revocation',
      'readback-disables-controls','offline-not-DNR']});
  }
  for(const width of [320,360,400,440])for(const theme of ['light','dark']){
    const {ctx,built}=await open('success',width,theme);
    await poll(async()=>selected(await child(ctx),'全局广告拦截').selected,
      'responsive React initial state');
    assert.equal((await child(ctx)).overflow,false,'React horizontal overflow '+width+'/'+theme);
    assert.equal((await parent()).overflow,false,'preview shell overflow '+width+'/'+theme);
    await screenshot('responsive-'+width+'-'+theme);
    offlineSafety();
    report.push({scenario:'responsive',width,theme,uiSha256:built.uiSha256,
      checks:['real-chrome-react','no-horizontal-overflow','offline-no-network']});
  }
  {
    const {ctx}=await open('untrusted');
    await clickReact('.adblock-link',ctx);
    await poll(async()=>(await child(ctx)).exceptions.length===1,'malicious text');
    const state=await child(ctx);
    assert.match(state.exceptions[0],/<img src=x onerror=alert\(1\)>/);
    assert.equal(state.hasUnsafeImage,false,'untrusted domain must remain text only');
    await screenshot('untrusted');
    offlineSafety();report.push({scenario:'untrusted',checks:['inert-text','no-xss']});
  }
  for(const scenario of ['empty','error','loading','permission-denied']){
    const {ctx}=await open(scenario);
    await poll(async()=>{
      const x=await child(ctx);
      return scenario==='loading'?x.status.includes('正在核对 Chrome'):
        scenario==='error'?x.notice.includes('离线状态读取错误'):
        x.status.includes('过滤权限不可用');
    },scenario+' state');
    const view=await child(ctx);
    assert.equal(selected(view,'全局广告拦截').disabled,true,
      'unknown/missing permission cannot enable without trusted Host: '+scenario);
    assert.equal(selected(view,'当前网站广告过滤').disabled,true);
    await screenshot(scenario);
    offlineSafety();
    report.push({scenario,checks:['honest-disabled-state','no-fake-DNR-authority']});
  }
  await writeFile(join(output,'adblock-preview-chrome.json'),
    JSON.stringify({status:'OFFLINE_REACT_CHROME_DOM_PASS_NOT_NATIVE_DNR',
      source:'compiled App.jsx via Vite',checks:report},null,2)+'\n');
  console.log('ADBLOCK_PREVIEW_CHROME_PASS_REAL_REACT_DOM_NOT_NATIVE '+report.length);
}catch(e){
  console.error('ADBLOCK_PREVIEW_CHROME_FAIL '+(e?.stack||e));
  process.exitCode=1;
}finally{
  try{socket?.close();}catch{}
  chrome.kill();
  await rm(profile,{recursive:true,force:true});
}
