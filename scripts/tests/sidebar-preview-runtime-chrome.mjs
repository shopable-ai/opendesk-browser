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

  // AdBlock R1.5: inspect the real source-bound iframe and inert trusted host
  // inside Chrome. These checks do NOT install the extension or exercise DNR.
  const adblockRootExpression='('+function(){
    const q=s=>document.querySelector(s);
    const frame=q('#opendesk-preview-frame');
    const global=q('#od-preview-adblock-host button[role="switch"]');
    const site=q('#od-preview-adblock-host button[role="switch"]:nth-of-type(2)');
    const switches=[...document.querySelectorAll('#od-preview-adblock-host button[role="switch"]')];
    if(!global||switches.length!==2||!frame)return {loaded:false};
    const style=getComputedStyle(global),bounds=global.getBoundingClientRect();
    return {loaded:true,globalOn:global.getAttribute('aria-checked'),
      globalDisabled:global.disabled,globalLabel:global.textContent,
      siteOn:switches[1].getAttribute('aria-checked'),
      dialogOpen:!!q('#od-preview-adblock-restore-dialog')?.open,
      buttons:switches.length,frameSandbox:frame.getAttribute('sandbox'),
      switchWidth:bounds.width,switchHeight:bounds.height,
      cssWidth:style.width,frameHeight:frame.getBoundingClientRect().height,
      x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2,
      feedback:q('#od-preview-adblock-feedback')?.textContent||''};
  }.toString()+')()';
  const adblockFrameExpression='('+function(){
    const root=document.querySelector('.adblock-tool');
    const count=document.getElementById('exception-count');
    if(!root||!count)return {loaded:false};
    return {loaded:true,count:count.textContent,
      domains:[...document.querySelectorAll('.adblock-domain')].map(x=>x.textContent),
      restoreButtons:document.querySelectorAll('.adblock-restore').length,
      empty:document.getElementById('exceptions')?.textContent||'',
      message:document.getElementById('adblock-message')?.textContent||'',
      scrollWidth:document.documentElement.scrollWidth,frameWidth:innerWidth,
      maliciousImages:document.querySelectorAll('img[onerror]').length};
  }.toString()+')()';
  async function adblockOuter(check=()=>true){
    let last=null;
    for(let i=0;i<90;i++){
      const r=await cdp('Runtime.evaluate',{expression:adblockRootExpression,returnByValue:true});
      last=r.result?.value;
      if(last?.loaded&&check(last))return last;
      await delay(75);
    }
    throw Error('AdBlock trusted preview host not ready: '+JSON.stringify(last));
  }
  async function adblockFrame(check=()=>true){
    let last=null;
    for(let i=0;i<90;i++){
      for(const context of [...contexts.values()]){
        try{
          const result=await cdp('Runtime.evaluate',{expression:adblockFrameExpression,
            contextId:context.contextId,returnByValue:true,silent:true},context.session);
          const value=result.result?.value;
          if(value?.loaded){last=value;if(check(value))return {context,...value};}
        }catch{/* ephemeral context retired while Chrome navigated */}
      }
      await delay(75);
    }
    throw Error('AdBlock sandbox not ready: '+JSON.stringify(last));
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
    let parent=await adblockOuter();
    let child=await adblockFrame(row=>scenario!=='success'||row.count==='1');
    assert.equal(parent.buttons,2,'source-derived trusted toggles are missing');
    assert.equal(parent.frameSandbox,'allow-scripts','iframe must keep opaque origin');
    assert.ok(Math.abs(parent.switchWidth-46)<1,'canonical 46px switch width');
    assert.ok(Math.abs(parent.switchHeight-27)<1,'canonical 27px switch height');
    assert.ok(child.scrollWidth<=child.frameWidth+1,'AdBlock iframe horizontal overflow');
    assert.equal(child.maliciousImages,0,'sandbox must only render inert domain text');
    assert.equal(network.length,0,'preview made a remote request');
    if(scenario==='success'){
      assert.equal(parent.globalOn,'true');assert.equal(parent.siteOn,'false');
      assert.deepEqual(child.domains,['news.example.com']);
      assert.equal(child.restoreButtons,1);
      const shot=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-success-360.png'),Buffer.from(shot.data,'base64'));
      await cdp('Runtime.evaluate',{expression:'document.querySelector(".adblock-restore").click()',
        contextId:child.context.contextId},child.context.session);
      await adblockOuter(row=>row.dialogOpen);
      await cdp('Runtime.evaluate',{expression:
        'document.getElementById("od-preview-adblock-restore-cancel").click()'});
      await adblockOuter(row=>!row.dialogOpen);
      child=await adblockFrame(row=>row.count==='1');
      assert.equal(child.restoreButtons,1,'cancel must preserve the website exception');
      await cdp('Runtime.evaluate',{expression:'document.querySelector(".adblock-restore").click()',
        contextId:child.context.contextId},child.context.session);
      await adblockOuter(row=>row.dialogOpen);
      await cdp('Runtime.evaluate',{expression:
        'document.getElementById("od-preview-adblock-restore-accept").click()'});
      child=await adblockFrame(row=>row.count==='0');
      parent=await adblockOuter(row=>row.siteOn==='true'&&!row.dialogOpen);
      assert.equal(child.restoreButtons,0,'confirmed restore must empty sandbox list');
      const changed=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-restored-360.png'),Buffer.from(changed.data,'base64'));
    }else{
      assert.equal(parent.globalOn,'false');
      const {x,y}=parent;
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
      parent=await adblockOuter(row=>row.globalDisabled&&/重启/.test(row.globalLabel));
      assert.equal(parent.globalOn,'false','first DNR permission simulation cannot enable filtering');
      assert.match(parent.feedback,/重启 Chrome/);
      const shot=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(output,'adblock-restart-required-360.png'),Buffer.from(shot.data,'base64'));
    }
    assert.equal(network.length,0,'AdBlock preview reached the network');
    assert.deepEqual(errors,[],'AdBlock offline preview script exception');
    adblockChecks.push({scenario,sourceCommit:candidate.sourceCommit,
      uiSha256:candidate.uiSha256,operations:scenario==='success'
        ?['restore-cancel','restore-confirm']:['first-permission-grant-restart-fence'],
      networkRequests:network.length,exceptions:errors.length});
  }
  await writeFile(join(output,'adblock-static-offline-preview.json'),
    JSON.stringify({status:'ADBLOCK_STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED',
      cases:adblockChecks},null,2)+'\n');
  console.log('ADBLOCK_STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED 2 scenarios; '+output);
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
