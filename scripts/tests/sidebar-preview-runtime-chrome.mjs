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
    // The original host shell also needs a real Chrome interaction check.
    if(width===360&&theme==='light'&&scenario==='success'){
      const probe=await cdp('Runtime.evaluate',{
        expression:'('+async function(){
          const q=id=>document.getElementById(id);
          const tabs=[...document.querySelectorAll('.workbench-nav [role="tab"]')]
            .filter(tab=>!tab.hidden);
          if(tabs.length!==5||tabs.some(tab=>!q(tab.getAttribute('aria-controls'))))
            throw Error('preview tabs must target existing panels');
          if(q('tab-tools').getAttribute('aria-selected')!=='true')
            throw Error('extensions tab must start active');
          q('sidebar-tool-back').click();
          if(q('od-preview-return').hidden||!q('od-preview-extension-detail').hidden)
            throw Error('return must show simplified list');
          q('od-preview-reopen').click();
          if(q('od-preview-extension-detail').hidden)throw Error('reopen failed');
          q('sidebar-tool-remove').click();
          if(!q('od-preview-confirm-uninstall').open)throw Error('confirmation missing');
          q('od-preview-cancel-uninstall').click();
          // The native dialog close event and focus restoration are asynchronous.
          // Wait for the actual state; never weaken the focus requirement.
          for(let i=0;i<30&&(q('od-preview-confirm-uninstall').open||
               document.activeElement!==q('sidebar-tool-remove'));i++)
            await new Promise(done=>setTimeout(done,20));
          if(q('od-preview-confirm-uninstall').open||
             document.activeElement!==q('sidebar-tool-remove'))
            throw Error('cancel must restore focus');
          q('sidebar-tool-remove').click();
          return {tabs:tabs.length,modalOpen:q('od-preview-confirm-uninstall').open,
            simulatedLabel:q('sidebar-tool-remove').getAttribute('aria-label')};
        }.toString()+')()',awaitPromise:true,returnByValue:true
      });
      if(probe.exceptionDetails)throw Error('shell interactions: '+probe.exceptionDetails.text);
      assert.equal(probe.result.value?.tabs,5);
      assert.equal(probe.result.value?.modalOpen,true);
      assert.match(probe.result.value?.simulatedLabel||'',/模拟卸载/);
      await cdp('Input.dispatchKeyEvent',
        {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await cdp('Input.dispatchKeyEvent',
        {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await delay(80);
      const dismissed=await cdp('Runtime.evaluate',{expression:
        '({open:document.getElementById("od-preview-confirm-uninstall").open,'+
        'focus:document.activeElement?.id})',returnByValue:true});
      assert.equal(dismissed.result.value?.open,false,'Escape closes native confirmation');
      assert.equal(dismissed.result.value?.focus,'sidebar-tool-remove','Escape restores focus');
      const accepted=await cdp('Runtime.evaluate',{
        expression:'('+function(){
          const q=id=>document.getElementById(id);
          q('sidebar-tool-remove').click();
          q('od-preview-accept-uninstall').click();
          if(q('od-preview-uninstalled').hidden||q('opendesk-preview-frame').srcdoc!=='')
            throw Error('uninstall must only clear the simulated frame');
          q('od-preview-reset').click();
          if(q('od-preview-extension-detail').hidden||!q('opendesk-preview-frame').srcdoc)
            throw Error('reset must recreate simulated frame');
          return {simulatedUninstall:true,reset:true};
        }.toString()+')()',returnByValue:true
      });
      if(accepted.exceptionDetails)throw Error('shell lifecycle: '+accepted.exceptionDetails.text);
      assert.equal(accepted.result.value?.reset,true);
    }
    const shot=await cdp('Page.captureScreenshot',{format:'png'});
    const basename=[scenario,theme,String(width)].join('-');
    await writeFile(join(output,basename+'.png'),Buffer.from(shot.data,'base64'));
    reports.push({basename,sourceCommit:result.sourceCommit,designSha256:result.designSha256,
      uiSha256:result.uiSha256,scenario,theme,width,rendered,networkRequests:network.length,exceptions:errors.length});
  }

  // Source-bound React R2.6 regression: use the actual compiled App.jsx inside
  // the opaque iframe, never the deprecated trusted AdBlock DOM controller.
  // This smoke suite stays distinct from the dedicated full React Chrome test.
  const adblockParentExpression='('+function(){
    const frame=document.getElementById('opendesk-preview-frame');
    const dialog=document.getElementById('od-preview-adblock-restore-dialog');
    return {loaded:!!frame&&!!dialog,
      sandbox:frame?.getAttribute('sandbox'),
      frameHeight:frame?.getBoundingClientRect().height||0,
      dialogOpen:dialog?.open===true,
      legacyController:!!document.querySelector('#od-preview-adblock-host button[role="switch"]'),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
  }.toString()+')()';
  const adblockReactExpression='('+function(){
    const app=document.querySelector('.adblock-app');
    if(!app)return {loaded:false};
    const switches=[...app.querySelectorAll('[data-slot="switch"]')];
    const global=switches.find(el=>el.getAttribute('aria-label')==='全局广告拦截');
    const site=switches.find(el=>el.getAttribute('aria-label')==='当前网站广告过滤');
    return {loaded:true,
      globalFound:!!global,siteFound:!!site,
      globalOn:global?.hasAttribute('data-selected')||false,
      globalDisabled:global?.hasAttribute('data-disabled')||false,
      siteOn:site?.hasAttribute('data-selected')||false,
      siteDisabled:site?.hasAttribute('data-disabled')||false,
      status:app.querySelector('.adblock-state')?.textContent.trim()||'',
      exceptionsLabel:app.querySelector('.adblock-link span:nth-child(2)')?.textContent||'',
      domains:[...app.querySelectorAll('.adblock-exception strong')].map(el=>el.textContent),
      restoreButtons:app.querySelectorAll('.adblock-exception button').length,
      empty:!!app.querySelector('.adblock-empty'),
      host:app.querySelector('.adblock-host')?.textContent||'',
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      maliciousImages:app.querySelectorAll('img[onerror]').length};
  }.toString()+')()';
  async function evaluateAdblock(expression,context=null){
    const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,
      ...(context?{contextId:context.contextId}:{})},context?.session||null);
    if(result.exceptionDetails)throw Error('React Chrome evaluation: '+
      (result.exceptionDetails.exception?.description||result.exceptionDetails.text));
    return result.result?.value;
  }
  async function adblockParent(check=()=>true){
    let last=null;
    for(let i=0;i<110;i++){
      last=await evaluateAdblock(adblockParentExpression);
      if(last?.loaded&&check(last))return last;
      await delay(65);
    }
    throw Error('React preview shell not ready: '+JSON.stringify(last));
  }
  async function adblockFrame(check=()=>true){
    let last=null;
    for(let i=0;i<110;i++){
      for(const context of contexts.values()){
        try{
          const row=await evaluateAdblock(adblockReactExpression,context);
          if(row?.loaded){last=row;if(check(row))return {context,...row};}
        }catch{/* retired frame context, retry only */}
      }
      await delay(65);
    }
    throw Error('React AdBlock iframe not ready: '+JSON.stringify(last));
  }
  async function pointerClick(selector,context=null){
    const expression='('+function(css){
      const el=document.querySelector(css);
      if(!el)throw Error('Missing real React preview target: '+css);
      el.scrollIntoView({block:'nearest',inline:'nearest'});
      const r=el.getBoundingClientRect();
      if(r.width<4||r.height<4)throw Error('Invisible preview target: '+css);
      return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
    }.toString()+')('+JSON.stringify(selector)+')';
    const point=await evaluateAdblock(expression,context);
    let x=point.x,y=point.y;
    if(context){
      const frame=await evaluateAdblock('('+function(){
        const el=document.getElementById('opendesk-preview-frame');
        el.scrollIntoView({block:'nearest'});
        const r=el.getBoundingClientRect();
        return {x:r.left,y:r.top,width:r.width,height:r.height};
      }.toString()+')()');
      assert.ok(point.x>=0&&point.x<frame.width&&point.y>=0&&point.y<frame.height,
        'React target must be visible inside actual iframe: '+selector);
      x+=frame.x;y+=frame.y;
    }
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    for(const type of ['mousePressed','mouseReleased'])
      await cdp('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
  }
  const adblockChecks=[];
  for(const scenario of ['success','empty']){
    const candidate=await buildPreview({tool:'adblock',surface:'side-panel',
      scenario,theme:'light',width:360,height:760});
    contexts.clear();network.length=0;errors.length=0;
    await cdp('Emulation.setDeviceMetricsOverride',
      {width:560,height:980,deviceScaleFactor:1,mobile:false});
    await cdp('Emulation.setEmulatedMedia',
      {features:[{name:'prefers-color-scheme',value:'light'}]});
    await cdp('Page.navigate',{url:pathToFileURL(candidate.output).href});
    const outer=await adblockParent(row=>row.frameHeight>0);
    assert.equal(outer.sandbox,'allow-scripts','React preview must have opaque sandbox');
    assert.equal(outer.legacyController,false,'obsolete AdBlock host DOM must not be mounted');
    assert.equal(outer.overflow,false);
    const initial=await adblockFrame(row=>row.globalFound&&row.siteFound);
    assert.ok(initial.scrollWidth<=initial.width+1,'React AdBlock horizontal overflow');
    assert.equal(initial.maliciousImages,0);
    if(scenario==='success'){
      assert.equal(initial.globalOn,true,'compiled React reads verified enabled state');
      assert.equal(initial.siteOn,false,'site exception is disabled');
      assert.equal(initial.exceptionsLabel,'1');
      const overview=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-overview-360.png'),Buffer.from(overview.data,'base64'));
      await pointerClick('.adblock-link',initial.context);
      let listing=await adblockFrame(row=>row.domains.length===1);
      assert.deepEqual(listing.domains,['news.example.com']);
      assert.equal(listing.restoreButtons,1);
      const listed=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-success-360.png'),Buffer.from(listed.data,'base64'));
      await pointerClick('.adblock-exception button',listing.context);
      await adblockParent(row=>row.dialogOpen);
      await pointerClick('#od-preview-adblock-restore-cancel');
      await adblockParent(row=>!row.dialogOpen);
      listing=await adblockFrame(row=>row.domains.length===1&&row.restoreButtons===1);
      assert.deepEqual(listing.domains,['news.example.com'],
        'real cancel preserves the exception');
      await pointerClick('.adblock-exception button',listing.context);
      await adblockParent(row=>row.dialogOpen);
      await pointerClick('#od-preview-adblock-restore-accept');
      await adblockParent(row=>!row.dialogOpen);
      const restored=await adblockFrame(row=>row.empty&&row.restoreButtons===0);
      assert.equal(restored.domains.length,0,'real confirmed readback clears list');
      const changed=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-restored-360.png'),Buffer.from(changed.data,'base64'));
      await pointerClick('.adblock-back',restored.context);
      const overviewState=await adblockFrame(row=>row.siteOn&&row.globalFound);
      assert.equal(overviewState.globalOn,true);
    }else{
      assert.equal(initial.globalDisabled,true,'no DNR permission cannot enable protection');
      assert.equal(initial.siteDisabled,true,'no DNR permission cannot alter site');
      assert.match(initial.status,/过滤权限不可用/);
      const blocked=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-permission-unavailable-360.png'),
        Buffer.from(blocked.data,'base64'));
    }
    assert.equal(network.length,0,'offline React preview reached the network');
    assert.deepEqual(errors,[],'offline React preview uncaught script exception');
    adblockChecks.push({scenario,sourceCommit:candidate.sourceCommit,
      uiSha256:candidate.uiSha256,
      operations:scenario==='success'
        ?['react-real-pointer','restore-cancel','restore-confirm','readback']
        :['permission-gated','no-false-DNR-claim'],
      networkRequests:network.length,exceptions:errors.length});
  }
  await writeFile(join(output,'adblock-static-offline-preview.json'),
    JSON.stringify({status:'ADBLOCK_STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED',
      cases:adblockChecks},null,2)+'\n');
  console.log('ADBLOCK_STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED 2 React scenarios; '+output);
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
