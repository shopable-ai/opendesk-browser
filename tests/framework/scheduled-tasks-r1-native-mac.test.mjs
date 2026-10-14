// Scheduled Tasks R1: real macOS Chrome installed MV3 native acceptance.
// No synthetic DOM events, permission/storage writes, arbitrary extension RPC,
// hidden Host, manually forged FireId, or direct browser-page effects.
// CDP is used for genuine pointer/keyboard/file-chooser input and read-only facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const ENABLED=process.env.OPENDESK_SCHEDULED_NATIVE==='1';
const LIFECYCLE=process.env.SCHEDULE_NATIVE_LIFECYCLE==='1';
const VIEWPORT=process.env.SCHEDULE_NATIVE_VIEWPORT==='1';
const FORM_MATRIX=process.env.SCHEDULE_NATIVE_FORM_MATRIX==='1';
const PRODUCT_MATRIX=process.env.SCHEDULE_NATIVE_PRODUCT_MATRIX==='1';
const EXPECTED_PLATFORM=process.env.SCHEDULE_NATIVE_PLATFORM||'darwin';
const CONTROL_MODIFIER=process.platform==='darwin'?4:2;
let nativeOwnedMacInput=null; // Set after the uniquely owned Chrome PID is observed.
const CI_UNSANDBOXED_LINUX=process.platform==='linux' &&
  EXPECTED_PLATFORM==='linux' && process.env.CI==='true' &&
  process.env.GITHUB_ACTIONS==='true' &&
  process.env.SCHEDULE_NATIVE_CI_NO_SANDBOX==='1';
const BIN=process.env.CHROME_BIN;
const OUT=path.resolve(process.env.SCHEDULE_NATIVE_OUT||'artifacts/scheduled-tasks-r1-mac');
const EXT=path.resolve(process.env.SCHEDULE_NATIVE_EXTENSION_DIR||'dist/production');
const URL='http://127.0.0.1:43111/demo-form.html';
const deadline=async(fn,name,ms=20000)=>{
  const until=Date.now()+ms;let last='';
  while(Date.now()<until){
    try{const actual=await fn();if(actual)return actual;}catch(error){last=String(error.message||error);}
    await sleep(160);
  }
  throw Error(name+' NOT OBSERVED'+(last?' · '+last:''));
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const expr=selector=>'document.querySelector('+JSON.stringify(selector)+')';
async function visible(client,session,selector){
  return evaluate(client,expr(selector)+'&&!('+expr(selector)+').disabled&&('+expr(selector)+').getClientRects().length>0',session);
}
async function click(client,session,selector){
  // A genuine extension page may self-navigate from tool.html to its
  // hostInstanceId URL as the DevTools session attaches. Reacquire DOM
  // geometry only BEFORE the first real pointer event; never replay an
  // uncertain user click after mousePressed.
  let last;
  for(let attempt=0;attempt<4;attempt++){
    await deadline(()=>visible(client,session,selector),'visible clickable '+selector);
    let objectId=null,gestureStarted=false;
    try{
      const node=await client.send('Runtime.evaluate',{
        expression:expr(selector),returnByValue:false},session);
      objectId=node.result?.objectId;
      if(!objectId)throw Error('CDP context changed before native pointer targeting');
      await client.send('DOM.scrollIntoViewIfNeeded',{objectId},session);
      await sleep(65);
      const rect=await evaluate(client,'(()=>{const n='+expr(selector)+';const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()',session);
      assert(rect.w>7&&rect.h>7&&rect.x>0&&rect.y>0,'actual screen geometry '+selector);
      for(const type of ['mousePressed','mouseReleased']){
        gestureStarted=true;
        await client.send('Input.dispatchMouseEvent',{
          type,x:rect.x,y:rect.y,button:'left',clickCount:1},session);
      }
      return;
    }catch(error){
      // No input has been issued yet. A new DOM lookup is safe. If native
      // input was issued, propagate the uncertainty instead of double-clicking.
      if(gestureStarted||!/(?:context|navigated|target.*closed|node is detached|could not find node)/i.test(String(error?.message))){
        throw error;
      }
      last=error;
      await sleep(250);
    }finally{
      if(objectId)await client.send('Runtime.releaseObject',{objectId},session).catch(()=>{});
    }
  }
  throw last??Error('Native pointer context unavailable');
}
async function key(client,session,name,code,keyCode,modifiers=0){
  for(const type of ['rawKeyDown','keyUp'])
    await client.send('Input.dispatchKeyEvent',{type,key:name,code,windowsVirtualKeyCode:keyCode,modifiers},session);
}
async function type(client,session,selector,value){
  assert.equal(typeof value,'string');
  await click(client,session,selector);
  const node=await client.send('Runtime.evaluate',{expression:expr(selector),returnByValue:false},session);
  assert(node.result?.objectId,'Native editable node required: '+selector);
  try{
    // Actual Chrome text-selection editing command, not element.value writes
    // or synthetic input/change events. Plain modifier-A is not reliable in
    // real macOS SIDE_PANEL DevTools sessions without this native command.
    const snapshot=()=>evaluate(client,'(()=>{const n='+expr(selector)+';return {value:n.value,'+
      'focus:document.activeElement===n,start:n.selectionStart,end:n.selectionEnd}})()',session);
    let state=await snapshot();
    if(!state.focus)await client.send('DOM.focus',{objectId:node.result.objectId},session);
    for(let attempt=0;attempt<2;attempt++){
      await client.send('Input.dispatchKeyEvent',{type:attempt?'rawKeyDown':'keyDown',
        key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:CONTROL_MODIFIER,
        commands:['selectAll']},session);
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',
        windowsVirtualKeyCode:65,modifiers:CONTROL_MODIFIER},session);
      state=await snapshot();
      if(state.value===''||state.start===0&&state.end===state.value.length)break;
    }
    if(state.value&&state.start!==null&&!(state.start===0&&state.end===state.value.length))
      throw Error('Native select-all did not focus/select '+selector+' '+JSON.stringify(state));
    if(value)await client.send('Input.insertText',{text:value},session);
    else await key(client,session,'Backspace','Backspace',8);
    const result=await snapshot();
    if(result.value!==value)throw Error('Native typed field mismatch '+selector+
      ' actual='+JSON.stringify(result.value?.slice(0,180))+
      ' expected='+JSON.stringify(value.slice(0,180))+' focus='+result.focus);
  }finally{await client.send('Runtime.releaseObject',{objectId:node.result.objectId},session).catch(()=>{});}
}
// Native macOS popup controls may consume CDP keys after a mouse click.
 // Drive the CLOSED select through keyboard focus and real keyboard input.
 // Runtime.evaluate is read-only; no element.value assignment or synthetic change.
async function select(client,session,selector,index){
  const expression=expr(selector);
  const original=await evaluate(client,'(()=>{const s='+expression+';return s?{options:[...s.options].map(x=>({value:x.value,label:x.label,disabled:x.disabled})),index:s.selectedIndex,disabled:s.disabled}:null})()',session);
  assert(original&&!original.disabled&&index>=0&&index<original.options.length,'real enabled select '+selector);
  const expected=original.options[index]?.value;
  assert.equal(typeof expected,'string','real option '+selector+' '+index);
  assert.equal(original.options[index].disabled,false,'scheduled Task option must be selectable');
  // macOS native <select> popovers consume OS input rather than CDP keys.
  // The preexisting AX-approved helper emits real PID-bound CGEvents.
  // No synthetic change/input, .value assignments or permission edits.
  if(process.platform==='darwin'){
    assert.equal(typeof nativeOwnedMacInput,'function','owned macOS keyboard unavailable');
    const info=await client.send('Target.getTargetInfo',{},session);
    if(info.targetInfo?.type==='page')
      await client.send('Target.activateTarget',{targetId:info.targetInfo.targetId});
    nativeOwnedMacInput('activate');
    await click(client,session,selector);
    if(selector==='#schedule-timezone'){
      // Pick the actual visible AppKit menu item by its observed option label.
      // The existing helper requires one matching CFT AX control and the owned
      // foreground PID; it never writes select.value or dispatches change.
      nativeOwnedMacInput('press',original.options[index].label);
    }else{
      const movingDown=index>original.index;
      const steps=original.options.filter((option,position)=>!option.disabled&&
        (movingDown?position>original.index&&position<=index:position<original.index&&position>=index)).length;
      for(const key of [...Array.from({length:steps},()=>movingDown?'down':'up'),'return'])
        nativeOwnedMacInput('key',key);
    }
    await deadline(()=>evaluate(client,expression+'.value==='+JSON.stringify(expected),session),
      'owned Mac CFT real select '+selector+' '+expected,8000);
    return;
  }
  const focused=()=>evaluate(client,'document.activeElement==='+expression,session);
  // The verified caller has focus in the preceding form input or textarea.
  // Tab navigation reaches the next genuine, Chrome-visible control without
  // opening the macOS native selection popup.
  for(let step=0;step<12&&!await focused();step++)
    await key(client,session,'Tab','Tab',9);
  if(!await focused()){
    // DOM.focus affects only keyboard targeting; selection and its change
    // event still require the real native Chrome keyboard below.
    const node=await client.send('Runtime.evaluate',{expression,returnByValue:false},session);
    assert(node.result?.objectId,'Native select node unavailable: '+selector);
    try{await client.send('DOM.focus',{objectId:node.result.objectId},session);}
    finally{await client.send('Runtime.releaseObject',{objectId:node.result.objectId},session).catch(()=>{});}
  }
  assert.equal(await focused(),true,'Chrome must focus the real select: '+selector);
  const nativeKey=async(name,code,vkey,down='rawKeyDown')=>{
    await client.send('Input.dispatchKeyEvent',{type:down,key:name,code,windowsVirtualKeyCode:vkey},session);
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,windowsVirtualKeyCode:vkey},session);
  };
  if(original.index===index)return;
  // Chrome on macOS can consume rawKeyDown and keyDown differently. Each
  // attempt starts at the first option, so a partially handled attempt cannot
  // overstep the requested native choice.
  for(const mode of ['rawKeyDown','keyDown']){
    await nativeKey('Home','Home',36,mode);
    for(let i=0;i<index;i++)await nativeKey('ArrowDown','ArrowDown',40,mode);
    await nativeKey('Enter','Enter',13,mode);
    if(await evaluate(client,expression+'.value==='+JSON.stringify(expected),session))return;
  }
  const observed=await evaluate(client,'(()=>{const s='+expression+';return {value:s.value,selectedIndex:s.selectedIndex,focused:document.activeElement===s,options:s.options.length}})()',session);
  throw Error('Native keyboard select refused '+selector+
    '; expected='+JSON.stringify(expected)+'; actual='+JSON.stringify(observed));
}
async function details(client,session,selector){
  if(!await evaluate(client,expr(selector)+'.open',session))
    await click(client,session,selector+' > summary');
  assert.equal(await evaluate(client,expr(selector)+'.open',session),true);
}
async function screenshot(client,session,name,viewportMethod='rendered native surface; Chrome zoom not measured'){
  const geometry=await evaluate(client,
    '({url:location.href,widthCSS:innerWidth,heightCSS:innerHeight,dpr:devicePixelRatio,visualViewportScale:visualViewport?.scale??null})',session);
  const response=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(response.data,'base64');
  await writeFile(path.join(OUT,name+'.png'),bytes);
  return {file:name+'.png',bytes:bytes.length,sha256:sha(bytes),...geometry,viewportMethod};
}
// Genuine Chrome renderer viewport emulation; NOT a physical Side Panel
// resize and NOT Chrome's 200% browser zoom. This probe never writes page DOM.
async function viewportEvidence(client,session,surface,report,
  widths=surface==='sidepanel'?[320,360,420]:[320,360,420,760]){
  const snapshots=[];
  try{
    for(const width of widths){
      await client.send('Emulation.setDeviceMetricsOverride',{
        width,height:780,deviceScaleFactor:1,mobile:false},session);
      await sleep(100);
      const actual=await evaluate(client,
        '(()=>{const root=document.documentElement;return {'+
        'viewport:innerWidth,scrollWidth:root.scrollWidth,'+
        'bodyScrollWidth:document.body.scrollWidth,'+
        'contentWidth:document.querySelector("#workspace-content").clientWidth,'+
        'contentScrollWidth:document.querySelector("#workspace-content").scrollWidth,'+
        'hasHorizontalOverflow:root.scrollWidth>innerWidth+1,'+
        'panelVisible:!document.querySelector("#scheduled-panel").hidden}})()',session);
      assert.equal(actual.viewport,width,'Native renderer must honor emulated viewport');
      assert.equal(actual.panelVisible,true,'Schedule remains visible at narrow viewport');
      assert.equal(actual.hasHorizontalOverflow,false,
        'No horizontal page overflow in '+surface+' at '+width+'px');
      assert(actual.contentScrollWidth<=actual.contentWidth+1,
        'No clipped horizontal content overflow in '+surface+' at '+width+'px');
      snapshots.push({surface,width,...actual,
        screenshot:await screenshot(client,session,'r2-'+surface+'-viewport-'+width,'CDP viewport emulation; not physical width or Chrome zoom')});
    }
  }finally{
    await client.send('Emulation.clearDeviceMetricsOverride',{},session).catch(()=>{});
  }
  report.tests['r2Viewport'+surface]=
    'PASS (actual Chrome rendering, DevTools viewport emulation; physical resize/200% zoom NOT_TESTED)';
  report.steps.push({name:'r2-'+surface+'-viewport-geometry',
    at:new Date().toISOString(),result:snapshots});
  return snapshots;
}
async function contexts(client,session){
  return evaluate(client,'chrome.runtime.getContexts({})',session);
}
async function attach(client,targetId){
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Runtime.enable',{},sessionId);
  await client.send('Page.enable',{},sessionId);
  return sessionId;
}
async function fileChooser(client,session,filename,events){
  await client.send('Page.setInterceptFileChooserDialog',{enabled:true},session);
  const observations=[];
  try{
    for(let attempt=1;attempt<=2;attempt++){
      // Some Xvfb/Chrome UI focus transitions drop the first native chooser
      // gesture. Retry only the genuine pointer input, never emulate change,
      // assign input.files or supply package data via a privileged RPC.
      if(attempt>1)await client.send('Page.bringToFront',{},session);
      const offset=events.length;
      await click(client,session,'#task-package-file');
      const row=await deadline(()=>events.slice(offset).find(e=>e.method==='Page.fileChooserOpened'&&
        (!e.sessionId||e.sessionId===session)),'genuine Chrome file chooser',attempt===1?5000:8000)
        .catch(()=>null);
      if(row){
        assert.equal(row.params.mode,'selectSingle');
        assert(Number.isSafeInteger(row.params.backendNodeId),'Chrome must provide input identity');
        await client.send('DOM.setFileInputFiles',{files:[filename],
          backendNodeId:row.params.backendNodeId},session);
        return;
      }
      observations.push({attempt,
        activeElement:await evaluate(client,'document.activeElement?.id||null',session).catch(()=>null),
        browserEvents:events.slice(offset).filter(e=>e.method==='Page.fileChooserOpened')
          .map(e=>({sessionMatches:!e.sessionId||e.sessionId===session,mode:e.params?.mode}))});
    }
    throw Error('genuine Chrome file chooser not delivered after two native gestures: '+
      JSON.stringify(observations));
  }finally{await client.send('Page.setInterceptFileChooserDialog',{enabled:false},session).catch(()=>{});}
}
// Chrome Site Access is changed by real native user input on Chrome WebUI.
// CDP Runtime.evaluate only reads state, never changes select.value/permissions.
async function setNativeChromeSiteAccess(client,session,targetId,mode){
  const select='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.shadowRoot?.querySelector("extensions-runtime-host-permissions")?.shadowRoot?.querySelector("#newHostAccess")';
  const choices=await deadline(()=>evaluate(client,'(()=>{const n='+select+';return n?.options?.length?{value:n.value,options:[...n.options].map(o=>({value:o.value,text:o.textContent.trim()}))}:null})()',session),
    'Chrome Site Access actual WebUI selector',25000);
  const index=choices.options.findIndex(x=>x.value===mode);
  assert(index>=0,'Site Access option is available: '+mode);
  if(choices.value===mode)return choices;
  await client.send('Target.activateTarget',{targetId});
  if(process.platform==='darwin'){
    assert.equal(typeof nativeOwnedMacInput,'function');
    nativeOwnedMacInput('activate');
  }
  const node=await client.send('Runtime.evaluate',{expression:select,returnByValue:false},session);
  assert(node.result?.objectId,'Chrome site-access select must exist');
  try{
    await client.send('DOM.scrollIntoViewIfNeeded',{objectId:node.result.objectId},session);
    const box=await evaluate(client,'(()=>{const r=('+select+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()',session);
    assert(box.w>7&&box.h>7);
    for(const type of ['mousePressed','mouseReleased'])
      await client.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},session);
    if(process.platform==='darwin'){
      nativeOwnedMacInput('key','home');
      for(let i=0;i<index;i++)nativeOwnedMacInput('key','down');
      nativeOwnedMacInput('key','return');
    }else{
      await key(client,session,'Home','Home',36);
      for(let i=0;i<index;i++)await key(client,session,'ArrowDown','ArrowDown',40);
      await key(client,session,'Enter','Enter',13);
    }
  }finally{await client.send('Runtime.releaseObject',{objectId:node.result.objectId},session).catch(()=>{});}
  await deadline(()=>evaluate(client,select+'.value==='+JSON.stringify(mode),session),
    'native Chrome site access updated to '+mode,16000);
  return {oldMode:choices.value,newMode:mode,options:choices.options};
}

async function durable(client,session){
  // Read the SAME extension IndexedDB as Authority/RunHost, only readonly.
  const script='(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open("opendesk-browser");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});'+
    'try{const tx=db.transaction(["frameworkKV","runs","results","commandJournal"],"readonly");'+
    'const read=name=>new Promise((res,rej)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});'+
    'const [kv,runs,results,journal]=await Promise.all(["frameworkKV","runs","results","commandJournal"].map(read));'+
    'const plans=kv.filter(x=>x.tag==="schedule-definition-v1");const fires=kv.filter(x=>x.tag==="schedule-fire-v1");'+
    'const chosen=runs.filter(x=>x.tag==="controller-run").map(r=>({runId:r.runId,resultId:r.resultId,scriptId:r.scriptId,'+
    'scheduledFireId:r.scheduledFireId||null,state:r.state,retirementState:r.retirementState,workerRetired:r.workerRetired,'+
    'sourceHash:r.revision?.sourceHash,tabId:r.target?.tabId,documentId:r.target?.documentId}));'+
    'return {plans:plans.map(x=>({scheduleId:x.scheduleId,generation:x.generation,paused:x.paused,deleted:x.deleted,nextDueAt:x.nextDueAt,'+
    'taskId:x.taskId,triggerKind:x.triggerKind,triggerSpec:x.triggerSpec,timezone:x.timezone,sourceHash:x.sourceHash,params:x.params,openIfMissing:x.openIfMissing,misfirePolicy:x.misfirePolicy,startDeadlineMs:x.startDeadlineMs,installationId:x.installationId,taskGeneration:x.taskGeneration,version:x.version,manifestHash:x.manifestHash})),installs:kv.filter(x=>x.tag==="task-installed-v1").map(x=>({taskId:x.taskId,version:x.version,enabled:x.enabled,generation:x.authorization?.generation,installationId:x.authorization?.installationId})),fires:fires.map(x=>({fireId:x.fireId,runId:x.runId,'+
    'resultId:x.resultId,status:x.status,scheduledAt:x.scheduledAt})),runs:chosen,'+
    'results:results.filter(x=>x.tag==="controller-result").map(x=>({runId:x.runId,resultId:x.resultId,state:x.state,'+
    'ok:x.outcome?.ok===true,sourceHash:x.revision?.sourceHash})),'+
    'native:journal.filter(x=>x.tag==="controller-operation").map(x=>({runId:x.runId,state:x.state,'+
    'receipts:(x.nativeReceipts||[]).filter(y=>y.stage==="result").length})),slot:runs.find(x=>x.tag==="slot")||null};'+
    '}finally{db.close()}})()';
  return evaluate(client,script,session);
}
async function stopChrome(proc){
  if(!proc||proc.exitCode!==null||proc.signalCode!==null)return;
  await new Promise(resolve=>{
    const timer=setTimeout(()=>{proc.kill('SIGKILL');resolve();},4500);
    proc.once('close',()=>{clearTimeout(timer);resolve();});
    proc.kill('SIGTERM');
  });
}
test('real installed Chrome: verified Task via Alarms -> original RunHost -> page effect -> released',
  {skip:!ENABLED,timeout:PRODUCT_MATRIX||process.env.SCHEDULE_NATIVE_PHYSICAL_WIDTH==='1'?900000:450000},async t=>{
  assert(!PRODUCT_MATRIX||FORM_MATRIX,'Product matrix extends the existing native form phase');
  assert.equal(process.platform,EXPECTED_PLATFORM,'Use an explicit native platform for this isolated CFT test');
  assert(BIN&&path.isAbsolute(BIN)&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,
    'Pinned real Chrome for Testing required');
  if(process.env.SCHEDULE_NATIVE_CI_NO_SANDBOX==='1')
    assert(CI_UNSANDBOXED_LINUX,'--no-sandbox may only be used in the named ephemeral GitHub Linux CFT runner');
  await mkdir(OUT,{recursive:true});
  const sourceHash=sha(await readFile('src/platform/tasks/schedule-service.js'));
  const sourceBinding=await Promise.all(['src/ui/scheduled-task-workbench.js','src/ui/tool.html',
    'src/ui/tool-shell.css','src/ui/design-system.css','src/ui/design-tokens.css',
    'tests/framework/scheduled-tasks-r1-native-mac.test.mjs','package-lock.json','wxt.config.mjs']
    .map(async file=>({file,sha256:sha(await readFile(file))})));
  const packageInfo=await packageFingerprint(EXT);
  const task=JSON.parse(await readFile('examples/tasks/form-fill.v1.opendesk-task.json','utf8'));
  assert.equal(task.manifest.siteOrigins[0],'http://127.0.0.1:43111');
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-scheduled-r1-'));
  const sourceFile=path.join(profile,'sample.form-fill.js');
  await writeFile(sourceFile,task.sourceUtf8);
  const report={status:'RUNNING',startedAt:new Date().toISOString(),gitSha:process.env.GITHUB_SHA||null,
    chromeBinary:BIN,platform:process.platform,
    sandboxPolicy:CI_UNSANDBOXED_LINUX?'explicit isolated Linux CI --no-sandbox; NOT a sandbox-security PASS':'Chrome OS sandbox unchanged',
    package:packageInfo,sourceHash,sourceBinding,taskSourceHash:sha(task.sourceUtf8),
    fixture:URL,native:true,steps:[],screenshots:[],tests:{},limitations:[]};
  const note=(name,result)=>{report.steps.push({name,at:new Date().toISOString(),result});console.log('SCHEDULE_NATIVE '+name+' '+JSON.stringify(result));};
  let server,proc,client,chromeStderr='',completed=false,sideId=null,runnerId=null,siteId=null;
  t.after(async()=>{
    report.completedAt=new Date().toISOString();
    report.status=completed?'PASS':'FAIL_OR_BLOCKED';
    report.chromeStderr=chromeStderr.slice(-8000);
    report.chromeExit={exitCode:proc?.exitCode??null,signalCode:proc?.signalCode??null};
    if(client)try{await client.send('Browser.close');}catch{}
    client?.close();
    await stopChrome(proc);
    if(server)await new Promise(resolve=>server.close(()=>resolve()));
    assert.equal(path.basename(profile).startsWith('opendesk-scheduled-r1-'),true,'owned profile only');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
    await writeFile(path.join(OUT,'native-report.json'),JSON.stringify(report,null,2)+'\n');
  });
  const html=await readFile('examples/tasks/demo-form.html');
  if(process.env.SCHEDULE_NATIVE_REUSE_FIXTURE==='1'){
    // A shared manual fixture is read-only and must match the canonical bytes.
    const response=await fetch(URL,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200,'existing canonical fixture HTTP status');
    assert.equal(response.url,URL,'existing canonical fixture URL');
    assert(Buffer.from(await response.arrayBuffer()).equals(html),'existing fixture must match demo-form.html exactly');
    report.fixtureServer={mode:'verified-existing-read-only',sourceSha256:sha(html)};
  }else{
    server=createServer((req,res)=>{
      if(!req.url?.startsWith('/demo-form.html')){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end(html);
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(43111,'127.0.0.1',resolve);
    });
    report.fixtureServer={mode:'owned',sourceSha256:sha(html)};
  }
  const args=['--password-store=basic','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+EXT,'--load-extension='+EXT,
    ...(process.platform==='darwin'?['--use-mock-keychain']:[]),
    ...(CI_UNSANDBOXED_LINUX?['--no-sandbox']:[]),'about:blank'];
  proc=spawn(BIN,args,{stdio:['ignore','ignore','pipe']});
  proc.stderr.on('data',bytes=>{chromeStderr=(chromeStderr+String(bytes)).slice(-7000);});
  report.profileOwned=true;report.chromePid=proc.pid;
  if(process.platform==='darwin'){
    // Compile the already-reviewed Time Review native input helper into this
    // run's disposable profile. It validates the exact owned CFT PID,
    // bundle identity, existing AX approval and frontmost process.
    const keyboard=path.join(profile,'scheduled-native-input');
    const compiled=spawnSync('swiftc',[
      path.resolve('tests/framework/time-review-native-input.swift'),'-o',keyboard
    ],{encoding:'utf8',timeout:80000});
    assert.equal(compiled.status,0,'PID-bound macOS CGEvent helper compile: '+
      String(compiled.stderr||compiled.error||'').slice(-900));
    nativeOwnedMacInput=(command,value)=>{
      const result=spawnSync(keyboard,[String(proc.pid),command,...(value?[value]:[])],
        {encoding:'utf8',timeout:12000});
      const diagnostic=[result.stdout,result.stderr,result.error?.message].filter(Boolean).join('\n').trim();
      if(result.status!==0){
        // Observe the owner that displaced CFT without activating it, sending
        // another input, or weakening the preexisting foreground guard.
        const front=spawnSync('/usr/bin/lsappinfo',['front'],{encoding:'utf8',timeout:5000});
        const frontInfo=front.status===0&&front.stdout.trim()?
          spawnSync('/usr/bin/lsappinfo',['info',front.stdout.trim()],{encoding:'utf8',timeout:5000}):null;
        report.nativeInputFailure={expectedChromePid:proc.pid,command,value,status:result.status,
          diagnostic,frontApplication:frontInfo?.stdout?.slice(0,1800)||front.stderr||null};
        note('mac-native-input-owner-failure',report.nativeInputFailure);
      }
      assert.equal(result.status,0,'real owned macOS input '+command+' '+(value||'')+
        ': '+diagnostic.slice(-900));
      return String(result.stdout).trim();
    };
    report.macosInput='real owned CGEvent, preexisting AX grant required';
  }
  const port=await deadline(async()=>{
    const rows=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>'' )).split('\n');
    const number=Number(rows[0]);return Number.isInteger(number)&&number>0?number:null;
  },'owned native CFT DevTools port',30000);
  const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  report.chrome=version.Browser;
  const events=[];
  client=await connect(version.webSocketDebuggerUrl,{onEvent:value=>events.push(value)});
  const extensionId=await deadline(async()=>{
    const rows=(await client.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'real loaded WXT MV3 Service Worker',30000);
  assert(/^[a-p]{32}$/.test(extensionId));
  report.extensionId=extensionId;
  const site=await client.send('Target.createTarget',{url:URL});
  siteId=site.targetId;
  const siteSid=await attach(client,site.targetId);
  await deadline(()=>evaluate(client,'document.readyState==="complete"&&!!document.querySelector("#submit")',siteSid),
    'real HTTP demo form ready');
  const catalog=await client.send('Target.createTarget',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
  const catalogSid=await attach(client,catalog.targetId);
  await deadline(()=>evaluate(client,'!!document.querySelector("#catalog-open-dev-sidebar")',catalogSid),
    'installed complete Task catalog');
  await client.send('Target.activateTarget',{targetId:catalog.targetId});
  await click(client,catalogSid,'#catalog-open-dev-sidebar');
  const sideContext=await deadline(async()=>{
    const rows=await contexts(client,catalogSid);
    return rows.find(x=>x.contextType==='SIDE_PANEL'&&x.documentUrl?.includes('/ui/tool.html'));
  },'real Chrome SIDE_PANEL document context',18000);
  const sideTarget=await deadline(async()=>{
    const rows=(await client.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.url===sideContext.documentUrl);
  },'real Side Panel DevTools target');
  sideId=sideTarget.targetId;
  const sideSid=await attach(client,sideId);
  assert.equal(await evaluate(client,'chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})',sideSid),
    true,'Actual Chrome website grant must already exist; no permission preference injection');
  note('native-install-context',{extensionId,documentId:sideContext.documentId,sideContextType:sideContext.contextType});
  await client.send('Target.activateTarget',{targetId:catalog.targetId});
  await fileChooser(client,catalogSid,path.resolve('examples/tasks/form-fill.v1.opendesk-task.json'),events);
  await deadline(()=>evaluate(client,expr('#task-catalog-status')+'.textContent.includes("已导入待验证任务")',catalogSid),
    'original signed-hash Task JSON imported as unverified candidate');
  await fileChooser(client,catalogSid,sourceFile,events);
  await deadline(()=>evaluate(client,expr('#script-source')+'.value==='+JSON.stringify(task.sourceUtf8),sideSid),
    'same immutable source bytes imported into original Developer');
  await client.send('Target.activateTarget',{targetId:site.targetId});
  await deadline(()=>evaluate(client,expr('#script-current-page-url')+'.textContent==='+JSON.stringify(URL),sideSid),
    'Side Panel current exact website document',20000);
  await details(client,sideSid,'#manual-project-params-tools');
  await type(client,sideSid,'#script-params',JSON.stringify({name:'Native Draft'}));
  await click(client,sideSid,'#script-run');
  const verifiedRunId=await deadline(()=>evaluate(client,expr('#script-run-id')+'.value',sideSid),
    'original manual Controller RunId',35000);
  await deadline(()=>evaluate(client,'!!document.querySelector("#done")&&document.querySelector("#name").value==="Native Draft"',siteSid),
    'real original Controller native form entry and submit',30000);
  const original=await deadline(async()=>{
    const snapshot=await durable(client,sideSid),r=snapshot.runs.find(x=>x.runId===verifiedRunId);
    const result=snapshot.results.find(x=>x.runId===verifiedRunId);
    return r?.state==='completed'&&r.retirementState==='released'&&result?.ok===true &&
      snapshot.native.some(x=>x.runId===verifiedRunId&&x.receipts>0)?{run:r,result}:null;
  },'same-source native receipt, original durable Result and released retirement',35000);
  report.tests.manualTaskVerification='PASS';note('manual-native-receipt',{verifiedRunId,documentId:original.run.documentId});
  await client.send('Target.activateTarget',{targetId:catalog.targetId});
  await details(client,catalogSid,'#catalog-verification');
  await type(client,catalogSid,'#task-verify-run',verifiedRunId);
  await click(client,catalogSid,'#task-verify');
  await deadline(()=>evaluate(client,expr('#task-catalog-status')+'.textContent.includes("已核对本机持久运行")',catalogSid),
    'real Task Candidate verification');
  await click(client,catalogSid,'#task-publish');
  await deadline(()=>evaluate(client,expr('#task-catalog-status')+'.textContent.includes("已成为本地可安装版本")',catalogSid),
    'Available Task candidate exact version');
  await click(client,catalogSid,'#task-install');
  await deadline(()=>evaluate(client,expr('#task-install-feedback')+'.textContent.includes("已安装")',catalogSid),
    'real fixed Task install and Chrome origin authorization');
  report.tests.verifiedInstallation='PASS';
  note('installed-trusted-task',{taskId:task.manifest.taskId,version:task.manifest.version});
  // Reset the website BEFORE scheduling, so only the scheduled user script
  // can produce the next #done element and exact parameter value.
  await client.send('Page.navigate',{url:URL},siteSid);
  await deadline(()=>evaluate(client,'document.readyState==="complete"&&!document.querySelector("#done")',siteSid),
    'fresh untouched website document after manual run');
  await click(client,sideSid,'#tab-my-tasks');
  await click(client,sideSid,'#schedule-open');
  await deadline(()=>evaluate(client,'!'+expr('#scheduled-panel')+'.hidden',sideSid),
    'real nested My schedules view');
  assert.equal(await evaluate(client,expr('#workspace-dock')+'.hidden',sideSid),true,
    'the nested schedule view must not retain an unrelated manual Run footer');
  report.tests.scheduledDockIsolation='PASS';
  if(PRODUCT_MATRIX){
    assert.equal((await durable(client,sideSid)).plans.length,0,'genuine test Profile begins with zero schedules');
    await deadline(()=>evaluate(client,'/尚无定时计划/.test(document.querySelector("#schedule-plan-list").textContent)',sideSid),
      'empty list finishes its initial actual storage refresh');
    assert.match(await evaluate(client,expr('#schedule-plan-list')+'.textContent',sideSid),/尚无定时计划/);
    report.tests.nativeEmptyPlanList='PASS';
  }
  report.screenshots.push(await screenshot(client,sideSid,'schedule-list-original-sidepanel'));
  await click(client,sideSid,'#schedule-create');
  await type(client,sideSid,'#schedule-title','Mac 原生定时表单');
  await select(client,sideSid,'#schedule-task-select',1);
  await type(client,sideSid,'#schedule-target',URL);
  await type(client,sideSid,'#schedule-params',JSON.stringify({name:'Scheduled Native'}));
  await select(client,sideSid,'#schedule-kind',3); // every interval
  await type(client,sideSid,'#schedule-minutes','1');
  assert.equal(await evaluate(client,expr('#schedule-kind')+'.value',sideSid),'interval');
  await click(client,sideSid,'#schedule-save');
  await deadline(()=>evaluate(client,
    '!document.querySelector("#schedule-save-confirm").hidden',sideSid),
    'visible review of exact installed task and schedule before saving');
  await click(client,sideSid,'#schedule-confirm-yes');
  await deadline(()=>evaluate(client,'!!document.querySelector("#schedule-plan-list .schedule-card")',sideSid),
    'persisted approved schedule visible in My',18000);
  report.tests.nativeScheduleCreation='PASS';
  const registeredAlarm=await deadline(async()=>{
    const state=await durable(client,sideSid),plan=state.plans[0];
    if(!plan?.scheduleId)return null;
    // Real Chrome Alarm state read only. The RunHost also polls, so this
    // proves Chrome alarm registration, not sole onAlarm callback causality.
    const alarms=await evaluate(client,'chrome.alarms.getAll().then(rows=>rows.map(a=>({name:a.name,scheduledTime:a.scheduledTime})))',sideSid);
    const matching=alarms.find(a=>a.name==='opendesk.schedule.v1:'+plan.scheduleId);
    return matching&&Number.isFinite(matching.scheduledTime)&&
      Math.abs(matching.scheduledTime-plan.nextDueAt)<2000?matching:null;
  },'actual Chrome Alarms registration matches persisted nextDueAt');
  report.tests.chromeAlarmRegistered='PASS';
  note('native-chrome-alarm-registered',registeredAlarm);
  report.screenshots.push(await screenshot(client,sideSid,'schedule-created-original-sidepanel'));
  if(VIEWPORT){
    const evidence=await viewportEvidence(client,sideSid,'sidepanel',report);
    report.screenshots.push(...evidence.map(x=>x.screenshot));
  }
  await click(client,sideSid,'#schedule-open-runner');
  const runnerTarget=await deadline(async()=>{
    const rows=(await client.send('Target.getTargets')).targetInfos;
    return rows.find(x=>x.url?.includes('/ui/tool.html?')&&x.url.includes('scheduledRunner=1'));
  },'user-opened visible scheduled RunHost tab',18000);
  runnerId=runnerTarget.targetId;
  const runnerSid=await attach(client,runnerId);
  const runnerContext=await deadline(async()=>{
    const rows=await contexts(client,runnerSid);
    return rows.find(x=>x.documentId&&x.documentUrl?.includes('scheduledRunner=1')&&x.contextType==='TAB');
  },'actual registered visible runner TAB context');
  note('visible-runner',{documentId:runnerContext.documentId,url:runnerContext.documentUrl});
  const runnerPresentation=await deadline(async()=>{
    const observation=await evaluate(client,
      '(()=>{const root=document.documentElement,main=document.querySelector("#workspace-content"),nav=document.querySelector(".workbench-nav"),panel=document.querySelector("#scheduled-panel");'+
      'return {surface:root.dataset.opendeskSurface,navHidden:getComputedStyle(nav).display==="none",contentWidth:main.getBoundingClientRect().width,'+
      'viewportWidth:innerWidth,scheduleVisible:!!panel&&!panel.hidden,title:document.querySelector("#schedule-panel-title")?.textContent,openRunnerLabel:document.querySelector("#schedule-open-runner")?.textContent}})()',
      runnerSid);
    return observation.surface==='scheduled-runner'&&observation.scheduleVisible&&
      observation.title==='运行概览'?observation:null;
  },'real dedicated visible runner finished its normal product navigation');
  assert.equal(runnerPresentation.surface,'scheduled-runner');
  assert.equal(runnerPresentation.navHidden,true,'dedicated runner must not inherit unrelated workbench tabs');
  assert.equal(runnerPresentation.scheduleVisible,true,'visible runner must retain its real plan manager');
  assert(runnerPresentation.contentWidth>250&&runnerPresentation.contentWidth<=761,
    'wide runner must use a bounded readable content column');
  assert.equal(runnerPresentation.title,'运行概览',
    'one human-readable heading identifies the real dedicated runner');
  assert.match(runnerPresentation.openRunnerLabel,/再开运行页/);
  assert.equal(await evaluate(client,
    '!document.querySelector("#schedule-runner-view").hidden && document.querySelector("#schedule-list-view").hidden',runnerSid),
    true,'dedicated tab must open the operational overview instead of an enlarged Side Panel');
  report.tests.dedicatedRunnerLayout='PASS';
  note('dedicated-runner-layout',runnerPresentation);
  if(VIEWPORT){
    const evidence=await viewportEvidence(client,runnerSid,'runner',report);
    report.screenshots.push(...evidence.map(x=>x.screenshot));
  }
  // User opens the original manager from the dedicated operational dashboard.
  await click(client,runnerSid,'#schedule-runner-manage');
  let secondRunnerId=null;
  if(LIFECYCLE){
    // A second visible extension document races the SAME durable FireId.
    // It is opened through the original product UI, never an injected Host.
    await client.send('Target.activateTarget',{targetId:runnerId});
    await click(client,runnerSid,'#schedule-open-runner');
    const second=await deadline(async()=>{
      const rows=(await client.send('Target.getTargets')).targetInfos;
      return rows.find(x=>x.targetId!==runnerId&&x.url?.includes('scheduledRunner=1'));
    },'second visible scheduling host');
    secondRunnerId=second.targetId;
    const secondSession=await attach(client,secondRunnerId);
    const secondContext=await deadline(async()=>{
      const rows=await contexts(client,secondSession);
      return rows.find(x=>x.contextType==='TAB'&&x.documentId&&
        x.documentUrl?.includes('scheduledRunner=1')&&x.documentId!==runnerContext.documentId);
    },'independent second real runner TAB');
    note('second-visible-runner',{documentId:secondContext.documentId,url:secondContext.documentUrl});
    report.tests.twoVisibleRunners='PASS';
  }
  // Verify unique Host with native actual lifecycle, not an injected mock.
  await client.send('Target.closeTarget',{targetId:sideId});
  await deadline(async()=>{
    const rows=await contexts(client,runnerSid);
    return !rows.some(x=>x.contextType==='SIDE_PANEL'&&x.documentUrl?.includes('/ui/tool.html'));
  },'real Side Panel fully closed while runner remains',15000);
  report.tests.sidePanelClosedRunnerLive='PASS';
  const due=await deadline(async()=>{
    const snapshot=await durable(client,runnerSid);
    const fire=snapshot.fires.find(x=>x.runId&&x.fireId.startsWith('sched:')&&
      snapshot.runs.some(r=>r.runId===x.runId&&r.scriptId==='task:sample.form-fill:1.0.0'));
    if(!fire)return null;
    const run=snapshot.runs.find(x=>x.runId===fire.runId);
    const result=snapshot.results.find(x=>x.runId===fire.runId&&x.resultId===fire.resultId);
    if(run?.state!=='completed'||run.retirementState!=='released'||result?.ok!==true)return null;
    if(!snapshot.native.some(x=>x.runId===fire.runId&&x.receipts>0))return null;
    return {fire,run,result,occurrences:snapshot.fires.filter(x=>x.fireId===fire.fireId).length,
      runCount:snapshot.runs.filter(x=>x.scheduledFireId===fire.fireId).length};
  },'actual Chrome Alarm -> visible scheduled RunHost -> native effect -> released Result',145000);
  const webEffect=await evaluate(client,'(()=>({name:document.querySelector("#name")?.value,done:!!document.querySelector("#done")}))()',siteSid);
  assert.deepEqual(webEffect,{name:'Scheduled Native',done:true},'scheduled installed script changed the real HTTP document');
  assert.equal(due.occurrences,1,'one stable FireId per scheduled occurrence');
  assert.equal(due.runCount,1,'two real RunHosts may never admit two runs for one FireId');
  if(LIFECYCLE)report.tests.concurrentVisibleHostsNoDuplicate='PASS';
  assert.equal(due.run.scheduledFireId,due.fire.fireId,'original Controller Run is bound to the scheduled FireId');
  assert.equal(due.run.workerRetired,true,'Worker retired before success');
  report.tests.actualScheduledNativeEffect='PASS';
  note('native-scheduled-result',{fireId:due.fire.fireId,runId:due.run.runId,resultId:due.result.resultId,
    documentId:due.run.documentId,retirement:due.run.retirementState,webEffect});
  report.screenshots.push(await screenshot(client,runnerSid,'visible-runner-after-native-schedule'));
  report.screenshots.push(await screenshot(client,siteSid,'actual-scheduled-form-effect'));
  // End future repeats using the REAL plan's visible pause control.
  // The first action is Pause/Resume; the second action edits the plan.
  // Verify the label before trusting a pointer click in this native test.
  await deadline(()=>evaluate(client,
    'document.querySelector("#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child")?.textContent?.includes("暂停")',
    runnerSid),'real first plan action is Pause, not Edit');
  await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
  await deadline(async()=>{
    const state=await durable(client,runnerSid);
    return state.plans.length===1&&state.plans[0].paused===true&&state.plans[0].nextDueAt===null;
  },'original UI pauses future occurrences');
  report.tests.nativePause='PASS';
  if(LIFECYCLE){
    // Prepare a fresh second occurrence, then close EVERY scheduling Host.
    // The ordinary Task catalog stays open to observe original IndexedDB
    // readonly; it MUST NOT be counted as a scheduling Host.
    await client.send('Page.navigate',{url:URL},siteSid);
    await deadline(()=>evaluate(client,'document.readyState==="complete"&&!document.querySelector("#done")',siteSid),
      'second untouched website document');
    const oldState=await durable(client,runnerSid);
    const oldGeneration=oldState.plans[0]?.generation;
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child")?.textContent?.includes("恢复")',
      runnerSid),'real disabled plan presents Resume, not stale Pause');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    const resumed=await deadline(async()=>{
      const state=await durable(client,runnerSid),plan=state.plans[0];
      return plan?.generation===oldGeneration+1&&plan.paused===false&&Number.isSafeInteger(plan.nextDueAt)?plan:null;
    },'real UI resumed a new fixed schedule generation');
    note('resumed-for-host-outage',{scheduleId:resumed.scheduleId,generation:resumed.generation,nextDueAt:resumed.nextDueAt});
    await client.send('Target.closeTarget',{targetId:runnerId});
    if(secondRunnerId)await client.send('Target.closeTarget',{targetId:secondRunnerId});
    await deadline(async()=>{
      const rows=await contexts(client,catalogSid);
      return !rows.some(x=>x.contextType==='SIDE_PANEL'||
        x.contextType==='TAB'&&x.documentUrl?.includes('scheduledRunner=1'));
    },'all real scheduler documents closed',20000);
    const withoutHost=await deadline(async()=>{
      const state=await durable(client,catalogSid);
      const record=state.fires.find(x=>x.fireId.split(':')[2]===String(resumed.generation));
      return record?.status==='WAITING_HOST'&&record.runId===null?record:null;
    },'missed Alarm persists WAITING_HOST without any scheduling Host',145000);
    assert.equal(withoutHost.runId,null,'no hidden/background scheduler may execute the occurrence');
    report.tests.noHostWait='PASS';
    note('no-host-durable-wait',{fireId:withoutHost.fireId,status:withoutHost.status});
    await client.send('Target.activateTarget',{targetId:catalog.targetId});
    await click(client,catalogSid,'#catalog-open-dev-sidebar');
    const returnedSide=await deadline(async()=>{
      const rows=await contexts(client,catalogSid);
      return rows.find(x=>x.contextType==='SIDE_PANEL'&&x.documentId&&
        x.documentId!==sideContext.documentId&&x.documentUrl?.includes('/ui/tool.html'));
    },'real Side Panel reopens after all scheduling Hosts vanished',25000);
    const reopenedTarget=await deadline(async()=>{
      const rows=(await client.send('Target.getTargets')).targetInfos;
      return rows.find(x=>x.url===returnedSide.documentUrl);
    },'new Side Panel native target');
    const reopenedSid=await attach(client,reopenedTarget.targetId);
    const recovered=await deadline(async()=>{
      const state=await durable(client,reopenedSid);
      const fire=state.fires.find(x=>x.fireId===withoutHost.fireId);
      if(!fire?.runId||fire.resultId===null)return null;
      const run=state.runs.find(x=>x.runId===fire.runId);
      const result=state.results.find(x=>x.runId===fire.runId&&x.resultId===fire.resultId);
      if(run?.state!=='completed'||run.retirementState!=='released'||result?.ok!==true)return null;
      if(state.runs.filter(x=>x.scheduledFireId===fire.fireId).length!==1)return null;
      if(!state.native.some(x=>x.runId===fire.runId&&x.receipts>0))return null;
      return {fire,run,result};
    },'returned Side Panel runs original WAITING_HOST FireId exactly once',140000);
    assert.equal(recovered.fire.fireId,withoutHost.fireId,'recovered Host must not mint a new occurrence');
    const secondEffect=await evaluate(client,'(()=>({name:document.querySelector("#name")?.value,done:!!document.querySelector("#done")}))()',siteSid);
    assert.deepEqual(secondEffect,{name:'Scheduled Native',done:true},'restored scheduled Host changed a fresh real web document');
    report.tests.noHostRestoreExactlyOnce='PASS';
    note('restored-host-native-result',{fireId:recovered.fire.fireId,runId:recovered.run.runId,
      resultId:recovered.result.resultId,retirement:recovered.run.retirementState,webEffect:secondEffect});
    report.screenshots.push(await screenshot(client,reopenedSid,'resumed-sidepanel-after-no-host'));
    await click(client,reopenedSid,'#schedule-open');
    await deadline(()=>evaluate(client,'!!document.querySelector("#schedule-plan-list .schedule-card")',reopenedSid),
      'visible restored schedule card');
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child")?.textContent?.includes("暂停")',
      reopenedSid),'reopened scheduler exposes Pause on active plan');
    await click(client,reopenedSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    await deadline(async()=>{
      const state=await durable(client,reopenedSid);
      return state.plans.length===1&&state.plans[0].paused===true&&state.plans[0].nextDueAt===null;
    },'real restored Side Panel pauses future occurrences');
    report.tests.restoredHostPause='PASS';
  }
  if(process.env.SCHEDULE_NATIVE_TASK_IDENTITY==='1'){
    assert.equal(LIFECYCLE,false,'Task identity native case has its own isolated phase');
    await client.send('Page.navigate',{url:URL},siteSid);
    await deadline(()=>evaluate(client,
      'document.readyState==="complete"&&!document.querySelector("#done")',siteSid),
      'clean genuine page before task authorization change');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    const before=await deadline(async()=>{
      const state=await durable(client,runnerSid),plan=state.plans[0];
      return plan&&!plan.paused&&Number.isSafeInteger(plan.nextDueAt)?{
        plan,installed:state.installs.find(x=>x.taskId===plan.taskId)}:null;
    },'resume original immutable installed Task');
    assert.equal(before.installed.enabled,true);
    assert.equal(before.installed.generation,before.plan.taskGeneration);
    await click(client,runnerSid,'#schedule-create');
    await click(client,runnerSid,'#schedule-manage-tasks');
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-manager-list .schedule-manager-card .schedule-manager-toggle")?.textContent==="停用"',
      runnerSid),'real installed Task manager exposes Disable');
    await click(client,runnerSid,'#schedule-manager-list .schedule-manager-card .schedule-manager-toggle');
    const disabled=await deadline(async()=>{
      const state=await durable(client,runnerSid);
      return state.installs.find(x=>x.taskId===before.plan.taskId)?.enabled===false?state:null;
    },'real UI disables installed immutable Task');
    const disabledInstall=disabled.installs.find(x=>x.taskId===before.plan.taskId);
    assert(disabledInstall.generation>before.plan.taskGeneration,
      'disabling increments original installed authorization generation');
    report.tests.taskDisabledViaRealUI='PASS';
    note('real-task-disabled',{taskId:before.plan.taskId,originalGeneration:before.plan.taskGeneration,
      newGeneration:disabledInstall.generation});
    await click(client,runnerSid,'#schedule-back');
    await click(client,runnerSid,'#schedule-cancel');
    await click(client,runnerSid,'#schedule-runner-manage');
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-state")?.textContent?.includes("需要处理")',
      runnerSid),'old plan shows requires-attention when Task disabled');
    const rejected=await deadline(async()=>{
      const state=await durable(client,runnerSid);
      const fire=state.fires.find(x=>x.fireId.startsWith(
        'sched:'+before.plan.scheduleId+':'+before.plan.generation+':')&&
        x.status==='NEEDS_ATTENTION'&&!x.runId);
      return fire?{fire,runCount:state.runs.filter(x=>x.scheduledFireId===fire.fireId).length}:null;
    },'disabled Task cannot become a real Controller Run',145000);
    assert.equal(rejected.runCount,0);
    assert.equal(await evaluate(client,'!!document.querySelector("#done")',siteSid),false);
    report.tests.disabledTaskScheduledFireDenied='PASS';
    note('disabled-task-fire',{...rejected});
    await click(client,runnerSid,'#schedule-create');
    await click(client,runnerSid,'#schedule-manage-tasks');
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-manager-list .schedule-manager-card .schedule-manager-toggle")?.textContent==="启用"',
      runnerSid),'Task can be reenabled from real management interface');
    await click(client,runnerSid,'#schedule-manager-list .schedule-manager-card .schedule-manager-toggle');
    const restored=await deadline(async()=>{
      const state=await durable(client,runnerSid),inst=state.installs.find(x=>x.taskId===before.plan.taskId);
      return inst?.enabled&&inst.generation>disabledInstall.generation?{state,inst}:null;
    },'reenabling Task rotates installed generation without replacing saved plan');
    assert.equal(restored.state.plans[0].taskGeneration,before.plan.taskGeneration,
      'old schedule must stay bound to its previous immutable generation');
    assert.equal(restored.state.plans[0].manifestHash,before.plan.manifestHash);
    assert.equal(restored.state.plans[0].version,before.plan.version);
    report.tests.installedTaskReenableDoesNotRebindSchedule='PASS';
    note('restored-task-identity-fenced',{originalScheduleTaskGeneration:before.plan.taskGeneration,
      newInstalledGeneration:restored.inst.generation,oldFireId:rejected.fire.fireId});
    const second=await deadline(async()=>{
      const state=await durable(client,runnerSid);
      const fire=state.fires.find(x=>x.fireId!==rejected.fire.fireId&&x.fireId.startsWith(
        'sched:'+before.plan.scheduleId+':'+before.plan.generation+':')&&
        x.status==='NEEDS_ATTENTION'&&!x.runId);
      return fire?{fire,runCount:state.runs.filter(x=>x.scheduledFireId===fire.fireId).length}:null;
    },'rotated Task installation cannot run the old scheduled generation',145000);
    assert.equal(second.runCount,0);
    assert.equal(await evaluate(client,'!!document.querySelector("#done")',siteSid),false);
    report.tests.rotatedGenerationDeniedNativeRun='PASS';
    note('rotated-generation-fire',{...second});
    await click(client,runnerSid,'#schedule-manager-list .schedule-manager-card .schedule-manager-uninstall');
    await deadline(()=>evaluate(client,
      '!document.querySelector("#schedule-uninstall-confirm").hidden',runnerSid),
      'visible inline uninstall confirmation');
    await click(client,runnerSid,'#schedule-uninstall-yes');
    const afterUninstall=await deadline(async()=>{
      const state=await durable(client,runnerSid);
      return !state.installs.some(x=>x.taskId===before.plan.taskId)?state:null;
    },'real UI uninstalls original installed Task');
    assert.equal(afterUninstall.plans[0].taskGeneration,before.plan.taskGeneration);
    assert.equal(afterUninstall.runs.filter(x=>x.scheduledFireId===due.fire.fireId).length,1);
    report.tests.uninstallKeepsOriginalScheduleAndRunAudit='PASS';
    note('native-task-uninstalled-audit-kept',{scheduleId:before.plan.scheduleId,
      oldTaskGeneration:before.plan.taskGeneration,originalRunId:due.run.runId});
    await click(client,runnerSid,'#schedule-back');
    await click(client,runnerSid,'#schedule-cancel');
    await click(client,runnerSid,'#schedule-runner-manage');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    await deadline(async()=>{
      const state=await durable(client,runnerSid);
      return state.plans[0]?.paused===true&&state.plans[0]?.nextDueAt===null;
    },'user pauses old immutable plan after Task uninstall');
    report.screenshots.push(await screenshot(client,runnerSid,'r2-uninstalled-task-plan'));
  }
  if(process.env.SCHEDULE_NATIVE_PERMISSIONS==='1'){
    assert.equal(LIFECYCLE,false,'Native site permission scenario is isolated');
    await client.send('Page.navigate',{url:URL},siteSid);
    await deadline(()=>evaluate(client,
      'document.readyState==="complete"&&!document.querySelector("#done")',siteSid),
      'untouched page before real website permission revocation');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    const resumed=await deadline(async()=>{
      const state=await durable(client,runnerSid),plan=state.plans[0];
      return plan&&!plan.paused&&plan.generation>=2&&Number.isSafeInteger(plan.nextDueAt)?plan:null;
    },'genuine user resume of approved schedule');
    const settings=await client.send('Target.createTarget',{url:'about:blank'});
    const settingsSid=await attach(client,settings.targetId);
    await client.send('Page.navigate',{url:'chrome://extensions/?id='+extensionId},settingsSid);
    assert.equal(await evaluate(client,
      'chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})',runnerSid),true);
    const revoked=await setNativeChromeSiteAccess(client,settingsSid,settings.targetId,'ON_CLICK');
    note('real-chrome-site-access-revoked',{extensionId,revoked});
    await deadline(()=>evaluate(client,
      'chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]}).then(x=>!x)',runnerSid),
      'Chrome revoked actual host website access',20000);
    report.tests.actualChromePermissionRevoked='PASS';
    await client.send('Target.activateTarget',{targetId:runnerId});
    await click(client,runnerSid,'#schedule-back');
    await click(client,runnerSid,'#schedule-runner-refresh');
    await click(client,runnerSid,'#schedule-runner-manage');
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-state")?.textContent?.includes("需要处理")',
      runnerSid),'revoked plan displays requires-attention status');
    report.tests.revokedPlanUI='PASS';
    const denied=await deadline(async()=>{
      const state=await durable(client,runnerSid);
      const fire=state.fires.find(x=>x.fireId.startsWith(
        'sched:'+resumed.scheduleId+':'+resumed.generation+':')&&
        x.status==='NEEDS_ATTENTION'&&!x.runId);
      return fire?{fire,runCount:state.runs.filter(x=>x.scheduledFireId===fire.fireId).length,
        originalRunCount:state.runs.filter(x=>x.scheduledFireId===due.fire.fireId).length}:null;
    },'revoked Chrome origin blocks next scheduled Controller admission',145000);
    assert.equal(denied.runCount,0);
    assert.equal(denied.originalRunCount,1,'historical original result must remain intact');
    assert.equal(await evaluate(client,'!!document.querySelector("#done")',siteSid),false,
      'scheduled execution cannot modify revoked real web page');
    report.tests.revokedNativeRunBlocked='PASS';
    note('real-chrome-revoked-fire',{...denied,webEffect:false});
    report.screenshots.push(await screenshot(client,runnerSid,'r2-revoked-plan-needs-attention'));
    const restored=await setNativeChromeSiteAccess(client,settingsSid,settings.targetId,'ON_ALL_SITES');
    await deadline(()=>evaluate(client,
      'chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})',runnerSid),
      'Chrome restored actual host website access',20000);
    const after=await durable(client,runnerSid);
    assert.equal(after.runs.filter(x=>x.scheduledFireId===denied.fire.fireId).length,0,
      'permission restoration never replays old denied FireId');
    report.tests.actualChromePermissionRestored='PASS';
    note('real-chrome-site-access-restored',{restored,fireId:denied.fire.fireId});
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    await deadline(async()=>{
      const state=await durable(client,runnerSid);
      return state.plans[0]?.paused===true&&state.plans[0]?.nextDueAt===null;
    },'pause restored plan through original visible UI');
  }
  if(process.env.SCHEDULE_NATIVE_RESTART==='1'){
    assert.equal(LIFECYCLE,false,'Full Chrome restart has its own isolated native test phase');
    // Resume through real UI before shutting down Chrome, preserving the
    // original Fire / Run / Result and the authorized immutable installation.
    await deadline(()=>evaluate(client,
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child")?.textContent?.includes("恢复")',
      runnerSid),'visible resume before full Chrome exit');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    const before=await deadline(async()=>{
      const state=await durable(client,runnerSid),plan=state.plans[0];
      return plan?.generation>=2&&!plan.paused&&Number.isSafeInteger(plan.nextDueAt)?{plan,state}:null;
    },'durable schedule active before entire browser process stops');
    const stableScheduleId=before.plan.scheduleId,expectedGeneration=before.plan.generation;
    const stableOldFire=due.fire.fireId,stableOldRun=due.run.runId;
    const oldPid=proc.pid;
    // Browser.close ends the entire owned Chrome process. Neither an MV3
    // Worker wake-up nor a Side Panel closure substitutes for this transition.
    await client.send('Browser.close');
    client.close();client=null;
    await stopChrome(proc);
    assert(proc.exitCode!==null||proc.signalCode!==null,'Original Chrome process must exit');
    report.tests.wholeChromeProcessExited='PASS';
    note('whole-chrome-exited',{oldPid,exitCode:proc.exitCode,signalCode:proc.signalCode,
      scheduleId:stableScheduleId,generation:expectedGeneration});
    // This DevToolsActivePort file belongs exclusively to this fresh profile.
    await rm(path.join(profile,'DevToolsActivePort'),{force:true});
    proc=spawn(BIN,args,{stdio:['ignore','ignore','pipe']});
    proc.stderr.on('data',bytes=>{chromeStderr=(chromeStderr+String(bytes)).slice(-7000);});
    assert.notEqual(proc.pid,oldPid,'New full Chrome process must be distinct');
    report.restartChromePid=proc.pid;
    const restartPort=await deadline(async()=>{
      const lines=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>'')).split('\n');
      const n=Number(lines[0]);return Number.isSafeInteger(n)&&n>0?n:null;
    },'restarted Chrome DevTools port in SAME user-data-dir',30000);
    const restartedVersion=await(await fetch('http://127.0.0.1:'+restartPort+'/json/version')).json();
    assert.equal(restartedVersion.Browser,version.Browser,'Restart must use the same CFT browser version');
    client=await connect(restartedVersion.webSocketDebuggerUrl,{onEvent:value=>events.push(value)});
    report.tests.sameControlledProfileRestarted='PASS';
    note('same-profile-chrome-restarted',{oldPid,newPid:proc.pid,chrome:restartedVersion.Browser});
    // No fake plan reinsertion or DOM write: inspect the same persisted IDB.
    // On macOS a new target may still be navigating as DevTools attaches.
    // Create a stable blank tab, attach first, then navigate using Chrome.
    // This is only a harness race fix, not a synthetic page effect.
    // Chrome can restore the original fixture tab. Reset that real document
    // through navigation instead of adding a second identical URL: the Host
    // deliberately borrows the first exact URL, not the newest DevTools tab.
    const restoredSites=(await client.send('Target.getTargets')).targetInfos
      .filter(target=>target.type==='page'&&target.url===URL);
    assert(restoredSites.length<=1,'Owned restart profile has at most one canonical fixture tab');
    const freshSite=restoredSites[0]??await client.send('Target.createTarget',{url:'about:blank'});
    const freshSiteSid=await attach(client,freshSite.targetId);
    await client.send('Page.navigate',{url:URL},freshSiteSid);
    await deadline(()=>evaluate(client,
      'document.readyState==="complete"&&!document.querySelector("#done")',freshSiteSid),
      'new Chrome process opens an untouched REAL webpage');
    note('restarted-site-observed',{targetId:freshSite.targetId,url:URL});
    const catalogAgain=await client.send('Target.createTarget',{url:'about:blank'});
    const catAgainSid=await attach(client,catalogAgain.targetId);
    await client.send('Page.navigate',{
      url:'chrome-extension://'+extensionId+'/ui/tool.html'},catAgainSid);
    // tool.html without hostInstanceId performs a genuine extension-owned
    // location.replace() into its canonical sender URL. Wait for that real
    // navigation to settle before opening IndexedDB or the old CDP context
    // may return "Inspected target navigated or closed".
    await deadline(()=>evaluate(client,
      'document.readyState==="complete"&&new URL(location.href).searchParams.has("hostInstanceId")&&!!document.querySelector("#catalog-open-dev-sidebar")',
      catAgainSid),'restarted canonical trusted catalog URL',25000);
    note('restarted-catalog-observed',{targetId:catalogAgain.targetId});
    const recovered=await deadline(async()=>{
      const state=await durable(client,catAgainSid);
      return state?.plans?.length===1?state:null;
    },'original IndexedDB plans after stable extension navigation',25000);
    assert.equal(recovered.plans.length,1,'Original plan persisted through entire Chrome process exit');
    assert.equal(recovered.plans[0].scheduleId,stableScheduleId);
    assert.equal(recovered.plans[0].generation,expectedGeneration);
    assert.equal(recovered.plans[0].paused,false);
    assert.equal(recovered.runs.filter(x=>x.scheduledFireId===stableOldFire).length,1,
      'Already admitted original FireId must never replay after browser startup');
    assert.equal(recovered.runs.find(x=>x.runId===stableOldRun)?.retirementState,'released');
    const restoredAlarms=await deadline(async()=>{
      const alarms=await evaluate(client,'chrome.alarms.getAll()',catAgainSid);
      return alarms.find(x=>x.name==='opendesk.schedule.v1:'+stableScheduleId)||null;
    },'original chrome.alarms reconstructed after full process restart',25000);
    const restartedTarget=await deadline(()=>evaluate(client,
      '(async()=>{const tabs=(await chrome.tabs.query({})).filter(tab=>tab.url==='+JSON.stringify(URL)+'&&tab.status==="complete"&&!tab.pendingUrl);if(tabs.length!==1)return null;const frame=(await chrome.webNavigation.getAllFrames({tabId:tabs[0].id})).find(frame=>frame.frameId===0&&frame.url==='+JSON.stringify(URL)+'&&frame.documentId);return frame?{tabId:tabs[0].id,documentId:frame.documentId,url:frame.url}:null})()',catAgainSid),
      'unique restarted real fixture tab and document identity');
    report.tests.scheduleStateAndAlarmRecovered='PASS';
    note('chrome-restart-persisted-plan-and-alarm',{scheduleId:stableScheduleId,
      generation:expectedGeneration,restoredAlarm:restoredAlarms});
    // Re-enter exclusively through the original user-facing actions.
    await client.send('Target.activateTarget',{targetId:catalogAgain.targetId});
    await click(client,catAgainSid,'#catalog-open-dev-sidebar');
    const sideAgain=await deadline(async()=>{
      const list=await contexts(client,catAgainSid);
      return list.find(x=>x.contextType==='SIDE_PANEL'&&x.documentId&&
        x.documentUrl?.includes('/ui/tool.html'));
    },'fresh genuine Side Panel in the restarted Chrome process',23000);
    const sideTargetAgain=await deadline(async()=>{
      const targets=(await client.send('Target.getTargets')).targetInfos;
      return targets.find(x=>x.url===sideAgain.documentUrl);
    },'restarted real Side Panel target');
    const sideAgainSid=await attach(client,sideTargetAgain.targetId);
    let restartSideDocumentId=null;
    try{
      // Context discovery precedes script initialization. Wait for the real
      // canonical document, then navigate through the original trusted UI.
      // A dispatched click is never retried after an uncertain effect.
      await deadline(()=>evaluate(client,
        'document.readyState==="complete"&&new URL(location.href).searchParams.has("hostInstanceId")&&typeof globalThis.__opendeskTrustedHistoryUI?.createScheduledTaskHost==="function"',
        sideAgainSid),'restarted canonical Side Panel initialized',25000);
      const canonicalSideUrl=await evaluate(client,'location.href',sideAgainSid);
      const canonicalSideContext=await deadline(async()=>
        (await contexts(client,catAgainSid)).find(context=>context.contextType==='SIDE_PANEL'&&
          context.documentId&&context.documentUrl===canonicalSideUrl),
        'restarted canonical Side Panel document identity');
      restartSideDocumentId=canonicalSideContext.documentId;
      note('restarted-sidepanel-initialized',{documentId:restartSideDocumentId,url:canonicalSideUrl});
      await click(client,sideAgainSid,'#tab-my-tasks');
      await deadline(()=>evaluate(client,
        'document.querySelector("#tab-my-tasks")?.getAttribute("aria-selected")==="true"&&!document.querySelector("#workbench-tasks").hidden',
        sideAgainSid),'restarted original My tab selected');
      await click(client,sideAgainSid,'#schedule-open');
      await deadline(()=>evaluate(client,
        '!!document.querySelector("#scheduled-panel")&&!document.querySelector("#scheduled-panel").hidden',
        sideAgainSid),'restarted original schedule panel opened');
      await deadline(()=>evaluate(client,
        '[...document.querySelectorAll("#schedule-plan-list .schedule-card")].some(card=>card.dataset.scheduleId==='+JSON.stringify(stableScheduleId)+')',
        sideAgainSid),'recovered original plan visible in My > Schedules');
    }catch(error){
      const state=await evaluate(client,
        '(()=>({url:location.href,readyState:document.readyState,activeTab:document.documentElement.dataset.opendeskTab,panelHidden:document.querySelector("#scheduled-panel")?.hidden,planIds:[...document.querySelectorAll("#schedule-plan-list .schedule-card")].map(card=>card.dataset.scheduleId),message:document.querySelector("#schedule-message")?.textContent,hostStatus:document.querySelector("#schedule-host-status")?.textContent}))()',
        sideAgainSid).catch(failure=>({observationError:String(failure?.message||failure)}));
      report.restartUIFailure={documentId:restartSideDocumentId,initialDocumentId:sideAgain.documentId,...state};
      note('chrome-restart-sidepanel-ui-failure',report.restartUIFailure);
      const capture=await screenshot(client,sideAgainSid,'chrome-restart-ui-failure').catch(()=>null);
      if(capture)report.screenshots.push(capture);
      throw error;
    }
    await click(client,sideAgainSid,'#schedule-open-runner');
    const runnerAgain=await deadline(async()=>{
      const targets=(await client.send('Target.getTargets')).targetInfos;
      return targets.find(x=>x.url?.includes('/ui/tool.html?')&&x.url.includes('scheduledRunner=1'));
    },'new user-opened visible RunHost after full Chrome restart',18000);
    const runnerAgainSid=await attach(client,runnerAgain.targetId);
    await deadline(()=>evaluate(client,
      'document.documentElement.dataset.opendeskSurface==="scheduled-runner" && !document.querySelector("#schedule-runner-view").hidden',
      runnerAgainSid),'new running overview after restart');
    const after=await deadline(async()=>{
      const state=await durable(client,runnerAgainSid);
      const matches=state.fires.filter(x=>x.fireId!==stableOldFire&&
        x.fireId.startsWith('sched:'+stableScheduleId+':'+expectedGeneration+':')&&x.runId);
      for(const fire of matches){
        const run=state.runs.find(x=>x.runId===fire.runId);
        const result=state.results.find(x=>x.resultId===fire.resultId&&x.runId===fire.runId);
        if(run?.state==='completed'&&run.retirementState==='released'&&result?.ok===true&&
          state.native.some(x=>x.runId===fire.runId&&x.receipts>0))
          return {fire,run,result,oldRunCount:state.runs.filter(x=>x.scheduledFireId===stableOldFire).length,
            thisRunCount:state.runs.filter(x=>x.scheduledFireId===fire.fireId).length};
      }
      return null;
    },'new approved occurrence operates REAL webpage after full Chrome restart',180000);
    note('chrome-restart-result-target',{runId:after.run.runId,target:restartedTarget,
      runTabId:after.run.tabId,runDocumentId:after.run.documentId});
    assert.equal(after.run.tabId,restartedTarget.tabId,'New Run uses the observed genuine fixture tab');
    assert.equal(after.run.documentId,restartedTarget.documentId,'New Run uses the observed fresh document');
    const restartedEffect=await evaluate(client,
      '(()=>({name:document.querySelector("#name")?.value,done:!!document.querySelector("#done")}))()',freshSiteSid);
    assert.deepEqual(restartedEffect,{name:'Scheduled Native',done:true});
    assert.equal(after.oldRunCount,1,'Chrome startup never replays a consumed FireId');
    assert.equal(after.thisRunCount,1,'New occurrence is admitted only once');
    assert.notEqual(after.run.runId,stableOldRun,'Restarted execution is a different occurrence');
    report.tests.newActualNativeEffectAfterRestart='PASS';
    note('chrome-restart-real-result',{fireId:after.fire.fireId,runId:after.run.runId,
      resultId:after.result.resultId,documentId:after.run.documentId,
      retirementState:after.run.retirementState,webEffect:restartedEffect});
    report.screenshots.push(await screenshot(client,runnerAgainSid,'r2-restarted-visible-runner'));
    report.screenshots.push(await screenshot(client,freshSiteSid,'r2-restarted-real-web-effect'));
    await click(client,runnerAgainSid,'#schedule-runner-manage');
    await click(client,runnerAgainSid,'#schedule-plan-list .schedule-card .schedule-plan-actions button:first-child');
    await deadline(async()=>{
      const state=await durable(client,runnerAgainSid);
      return state.plans[0]?.paused===true&&state.plans[0]?.nextDueAt===null;
    },'pause recovered plan from original UI after second native result');
  }
  if(FORM_MATRIX){
    let formSid=null;
    try{
    await client.send('Target.activateTarget',{targetId:catalog.targetId});
    await click(client,catalogSid,'#catalog-open-dev-sidebar');
    const formContext=await deadline(async()=>(await contexts(client,catalogSid)).find(context=>
      context.contextType==='SIDE_PANEL'&&context.documentId&&context.documentUrl?.includes('/ui/tool.html')),
      'genuine reopened Side Panel for native form matrix');
    const formTarget=await deadline(async()=>(await client.send('Target.getTargets')).targetInfos.find(target=>
      target.url===formContext.documentUrl),'actual form Side Panel target');
    formSid=await attach(client,formTarget.targetId);
    await deadline(()=>evaluate(client,
      'document.readyState==="complete"&&new URL(location.href).searchParams.has("hostInstanceId")&&typeof globalThis.__opendeskTrustedHistoryUI?.createScheduledTaskHost==="function"',formSid),
      'canonical form Side Panel initialized');
    await click(client,formSid,'#tab-my-tasks');
    await deadline(()=>evaluate(client,'document.querySelector("#workbench-tasks")?.getClientRects().length>0&&document.querySelector("#tab-my-tasks")?.getAttribute("aria-selected")==="true"',formSid),
      'native form My page is visible');
    await click(client,formSid,'#schedule-open');
    await deadline(()=>visible(client,formSid,'#schedule-create'),'native form schedule management is visible');
    assert.equal(LIFECYCLE,false,'Native form matrix owns a separate isolated phase');
    for(const flag of ['SCHEDULE_NATIVE_TASK_IDENTITY','SCHEDULE_NATIVE_PERMISSIONS','SCHEDULE_NATIVE_RESTART'])
      assert.notEqual(process.env[flag],'1','Form matrix cannot share another native lifecycle phase');
    const baseline=await durable(client,formSid),original=baseline.plans[0];
    const webBefore=await evaluate(client,'({name:document.querySelector("#name")?.value,done:!!document.querySelector("#done")})',siteSid);
    const readDraft=()=>evaluate(client,
      '({title:document.querySelector("#schedule-title").value,target:document.querySelector("#schedule-target").value,taskId:document.querySelector("#schedule-task-select").value,days:[...document.querySelectorAll("#schedule-weekdays-field input:checked")].map(input=>input.value),kind:document.querySelector("#schedule-kind").value,zone:document.querySelector("#schedule-timezone").value,params:document.querySelector("#schedule-params").value,paused:document.querySelector("#schedule-paused").checked,clock:document.querySelector("#schedule-clock").value,once:document.querySelector("#schedule-once").value,minutes:document.querySelector("#schedule-minutes").value,misfire:document.querySelector("#schedule-misfire").value,deadline:document.querySelector("#schedule-deadline").value,openIfMissing:document.querySelector("#schedule-open-target").checked})',formSid);
    assert.equal(original.paused,true,'Only the test-owned paused plan is edited');
    const card='#schedule-plan-list .schedule-card[data-schedule-id='+JSON.stringify(original.scheduleId)+']';
    let generation=original.generation,zone=original.timezone;
    await click(client,formSid,'#schedule-create');
    await type(client,formSid,'#schedule-title','R2.9 未保存内容验证');
    await select(client,formSid,'#schedule-task-select',1);
    await type(client,formSid,'#schedule-target',URL);
    if(process.env.SCHEDULE_NATIVE_PHYSICAL_WIDTH==='1'){
      assert.equal(VIEWPORT,false,'Physical width cannot share viewport emulation');
      for(const width of [300,320,360,420,520]){
        const readGeometry=()=>evaluate(client,
          '({url:location.href,widthCSS:innerWidth,heightCSS:innerHeight,dpr:devicePixelRatio,scale:visualViewport?.scale,scrollWidth:document.documentElement.scrollWidth})',formSid);
        const request={requestId:randomUUID(),requestedWidth:width,requestedAt:new Date().toISOString(),
          chromePid:proc.pid,sidePanelDocumentId:formContext.documentId,geometry:await readGeometry()};
        await writeFile(path.join(OUT,'physical-request.json'),JSON.stringify(request,null,2));
        note('physical-width-native-drag-request',{requestedWidth:width,chromePid:proc.pid});
        const action=await deadline(async()=>{
          await writeFile(path.join(OUT,'physical-current.json'),JSON.stringify(await readGeometry(),null,2));
          const recorded=await readFile(path.join(OUT,'physical-'+width+'-attempt.json'),'utf8').catch(()=>null);
          if(!recorded)return null;
          const attempt=JSON.parse(recorded);
          return attempt.requestId===request.requestId&&attempt.chromePid===request.chromePid&&
            attempt.sidePanelDocumentId===request.sidePanelDocumentId&&attempt.requestedWidth===width?attempt:null;
        },'recorded native CUA drag attempt '+width,180000);
        const geometry=await readGeometry();
        const proof={requestedWidth:width,actual:geometry,action,
          status:geometry.widthCSS===width?'OBSERVED_MATCH':'LIMITATION',
          screenshot:await screenshot(client,formSid,'r29-physical-sidepanel-'+width,'physical Side Panel after recorded native attempt/observation; no viewport emulation')};
        report.screenshots.push(proof.screenshot);note('physical-sidepanel-width',proof);
        if(proof.status==='LIMITATION')report.limitations.push('Physical '+width+'px requested; actual '+geometry.widthCSS+'px after native drag');
      }
    }
    const unsaved=await readDraft();
    if(PRODUCT_MATRIX){
      await click(client,formSid,'#schedule-manage-tasks');
      assert.equal(await evaluate(client,'document.activeElement.id',formSid),'schedule-manager-search');
      await click(client,formSid,'#schedule-back');
      assert.deepEqual(await readDraft(),unsaved,'actual task manager roundtrip preserves the unsaved draft');
      assert.equal(await evaluate(client,'document.activeElement.id',formSid),'schedule-manage-tasks',
        'actual manager Back restores a visible editor focus target');
      report.tests.nativeEditorManagerDraftAndFocus='PASS';
    }
    await click(client,formSid,'#schedule-manage-tasks');
    await deadline(()=>evaluate(client,
      '!document.querySelector("#schedule-task-manager").hidden&&document.querySelector("#schedule-form").hidden',formSid),
      'real installed Chrome task manager is a separate subview during editing');
    const managerActions=await evaluate(client,
      '[...document.querySelectorAll("#schedule-manager-list .schedule-actions button")].map(button=>button.textContent.trim())',formSid);
    assert(!managerActions.includes('设置定时'),
      'a task manager reached from an unsaved form cannot replace the draft without review');
    assert(managerActions.includes('停用'),'normal installed Task actions remain reachable');
    await click(client,formSid,'#schedule-back');
    assert.deepEqual(await readDraft(),unsaved,
      'returning from manager does not discard or rewrite any editor draft field');
    assert.equal(await evaluate(client,'document.activeElement?.id',formSid),'schedule-manage-tasks',
      'manager Back restores actual keyboard focus to the original edit-form entry');
    report.tests.nativeManagerRoundTripPreservesDraft='PASS';
    report.tests.nativeManagerBlocksDraftOverwrite='PASS';
    await click(client,formSid,'#schedule-cancel');
    await deadline(()=>evaluate(client,'!document.querySelector("#schedule-discard-confirm").hidden',formSid),
      'real unsaved draft discard confirmation');
    await click(client,formSid,'#schedule-discard-no');
    assert.deepEqual(await readDraft(),unsaved,'Continuing after discard review preserves every draft field');
    await click(client,formSid,'#schedule-cancel');
    await click(client,formSid,'#schedule-discard-yes');
    assert.equal((await durable(client,formSid)).plans.length,1,'Discarded draft never creates a schedule');
    report.tests.nativeUnsavedDraftConfirmation='PASS';
    for(const [kind,index] of [['daily',1],['weekly',2],['interval',3]]){
      await click(client,formSid,card+' .schedule-plan-actions button:nth-child(2)');
      assert.equal(await evaluate(client,expr('#schedule-timezone')+'.value',formSid),zone,
        'Editing preserves the previously pinned timezone');
      assert.equal(await evaluate(client,expr('#schedule-task-select')+'.disabled',formSid),true,
        'Existing plan cannot silently select another fixed Task');
      await select(client,formSid,'#schedule-kind',index);
      if(kind==='daily'){
        await click(client,formSid,'#schedule-timezone-edit');
        await type(client,formSid,'#schedule-timezone-search','America/New_York');
        assert.equal(await evaluate(client,expr('#schedule-timezone')+'.value',formSid),zone,
          'Timezone search never changes the pinned selection');
        const index=await evaluate(client,
          '[...document.querySelector("#schedule-timezone").options].findIndex(option=>option.value==="America/New_York")',formSid);
        await select(client,formSid,'#schedule-timezone',index);
        await click(client,formSid,'#schedule-timezone-done');zone='America/New_York';
      }
      if(kind==='weekly'){
        for(const day of [3,5])await click(client,formSid,'#schedule-weekdays-field input[value="'+day+'"]');
        await details(client,formSid,'.schedule-advanced');
        await select(client,formSid,'#schedule-misfire',1);
        await type(client,formSid,'#schedule-deadline','10');
        await click(client,formSid,'#schedule-open-target');
      }
      if(kind==='interval')await type(client,formSid,'#schedule-minutes','15');
      if(kind==='daily'){
        await type(client,formSid,'#schedule-params','{');
        await click(client,formSid,'#schedule-save');
        assert.equal(await evaluate(client,expr('#schedule-params')+'.getAttribute("aria-invalid")',formSid),'true');
        assert.equal(await evaluate(client,'document.activeElement.id',formSid),'schedule-params',
          'Invalid JSON receives the actual focus');
        assert.equal((await durable(client,formSid)).plans[0].generation,generation,
          'Invalid draft cannot mutate the schedule');
        report.tests.nativeJsonErrorRecovery='PASS';
      }
      await type(client,formSid,'#schedule-params',JSON.stringify({name:'R2.9 '+kind}));
      await click(client,formSid,'#schedule-save');
      await deadline(()=>evaluate(client,'!document.querySelector("#schedule-save-confirm").hidden',formSid),
        'real fixed Task confirmation for '+kind);
      const reviewedDraft=await readDraft();
      await click(client,formSid,'#schedule-confirm-no');
      assert.deepEqual(await readDraft(),reviewedDraft,
        'Returning to edit preserves every configured field');
      await click(client,formSid,'#schedule-save');
      report.screenshots.push(await screenshot(client,formSid,'r29-installed-form-'+kind));
      await click(client,formSid,'#schedule-confirm-yes');
      const saved=await deadline(async()=>{
        const state=await durable(client,formSid),plan=state.plans.find(plan=>plan.scheduleId===original.scheduleId);
        return plan?.generation>generation?plan:null;
      },'real paused '+kind+' plan persisted through saveSchedule');
      assert.equal(saved.triggerKind,kind);assert.equal(saved.timezone,zone);
      assert.equal(saved.paused,true);assert.equal(saved.nextDueAt,null);
      assert.equal(saved.taskId,original.taskId);assert.equal(saved.manifestHash,original.manifestHash);
      assert.equal(saved.sourceHash,original.sourceHash);
      assert.equal(saved.version,original.version);assert.equal(saved.installationId,original.installationId);
      assert.equal(saved.taskGeneration,original.taskGeneration);
      assert.deepEqual(saved.params,{name:'R2.9 '+kind});
      if(kind==='daily')assert.deepEqual(saved.triggerSpec,{hour:9,minute:0});
      if(kind==='weekly'){
        assert.deepEqual(saved.triggerSpec.days,[1,3,5]);assert.equal(saved.openIfMissing,true);
        assert.equal(saved.misfirePolicy,'latest-within-hour');assert.equal(saved.startDeadlineMs,600000);
      }
      if(kind==='interval')assert.equal(saved.triggerSpec.everyMinutes,15);
      generation=saved.generation;report.tests['nativeRule'+kind]='PASS';
      note('native-form-rule-saved',{scheduleId:saved.scheduleId,generation,kind,zone,paused:true});
    }
    await click(client,formSid,card+' .schedule-plan-open');
    assert.equal(await evaluate(client,
      'document.activeElement?.id',formSid),'schedule-back',
      'native detail Back receives keyboard focus after entering via plan title');
    assert.equal(await evaluate(client,
      'document.querySelector("#workspace-content").scrollTop',formSid),0,
      'real plan detail starts at top even when its 20-plan index was scrolled');
    assert.equal(await evaluate(client,
      '!document.querySelector("#schedule-detail-view").hidden&&document.querySelector("#schedule-list-view").hidden',formSid),true,
      'only a single real plan detail may be visible');
    await details(client,formSid,'#schedule-detail-view .schedule-history');
    await deadline(()=>evaluate(client,
      '[...document.querySelectorAll('+JSON.stringify('#schedule-detail-view .schedule-history-row')+')].some(row=>row.textContent.includes("成功")&&row.textContent.includes('+JSON.stringify(due.run.runId)+')&&row.textContent.includes('+JSON.stringify(due.result.resultId)+'))',formSid),
      'original real run history remains visible after edits');
    report.tests.nativeEditedHistoryRetained='PASS';
    await click(client,formSid,'#schedule-back');
    assert.equal(await evaluate(client,
      'document.activeElement?.classList.contains("schedule-plan-open")',formSid),true,
      'native Back restores focus to the originating list item');
    assert.equal(await evaluate(client,
      '!document.querySelector("#schedule-list-view").hidden&&document.querySelector("#schedule-detail-view").hidden',formSid),true,
      'native Back returns to index without showing details simultaneously');
    await click(client,formSid,'#schedule-create');
    assert.equal(await evaluate(client,expr('#schedule-timezone')+'.value',formSid),original.timezone,
      'New plan re-identifies the real device zone rather than inheriting the edited zone');
    await type(client,formSid,'#schedule-title','R2.9 多计划隔离验证');
    await select(client,formSid,'#schedule-task-select',1);
    await type(client,formSid,'#schedule-target',URL);
    assert.equal(await evaluate(client,expr('#schedule-kind')+'.value',formSid),'once',
      'New one-time plan uses the product initialized future date');
    report.screenshots.push(await screenshot(client,formSid,'r29-installed-form-once'));
    await click(client,formSid,'#schedule-paused');
    await click(client,formSid,'#schedule-save');
    await deadline(()=>evaluate(client,'!document.querySelector("#schedule-save-confirm").hidden',formSid),'second isolated plan review');
    await click(client,formSid,'#schedule-confirm-yes');
    const two=await deadline(async()=>{const state=await durable(client,formSid);return state.plans.length===2?state:null;},
      'two real test-owned paused plans');
    assert(two.plans.every(plan=>plan.paused));
    assert(two.plans.every(plan=>plan.nextDueAt===null));
    const second=two.plans.find(plan=>plan.scheduleId!==original.scheduleId);
    assert.equal(second.triggerKind,'once');
    assert(second.triggerSpec.at>Date.now(),'Real one-time UI date is a future occurrence');
    assert.equal(second.timezone,original.timezone);
    report.tests.nativeRuleonce='PASS';
    const secondCard='#schedule-plan-list .schedule-card[data-schedule-id='+JSON.stringify(second.scheduleId)+']';
    report.screenshots.push(await screenshot(client,formSid,'r29-two-paused-plans'));
    await click(client,formSid,secondCard+' .schedule-plan-open');
    await details(client,formSid,'#schedule-detail-view .schedule-more');
    await click(client,formSid,'#schedule-detail-view .schedule-danger-link');
    assert.deepEqual((await durable(client,formSid)).plans,two.plans,
      'Delete review preserves both plans, generations, deletion flags and fixed Task identities');
    await click(client,formSid,'#schedule-detail-view .schedule-delete-confirm button:last-of-type');
    assert.deepEqual((await durable(client,formSid)).plans,two.plans,
      'Cancelled deletion preserves both plans, generations, deletion flags and fixed Task identities');
    await click(client,formSid,'#schedule-detail-view .schedule-danger-link');
    await click(client,formSid,'#schedule-detail-view .schedule-delete-confirm button:first-of-type');
    const remaining=await deadline(async()=>{const state=await durable(client,formSid);return state.plans.find(plan=>
      plan.scheduleId===second.scheduleId)?.deleted===true?state:null;},
      'confirmed deletion tombstone for only the second test plan');
    assert.deepEqual(remaining.plans.filter(plan=>!plan.deleted).map(plan=>plan.scheduleId),[original.scheduleId]);
    const tombstone=remaining.plans.find(plan=>plan.scheduleId===second.scheduleId);
    assert.equal(tombstone.generation,second.generation+1);
    assert.equal(tombstone.paused,true);assert.equal(tombstone.nextDueAt,null);
    assert.deepEqual(remaining.plans.find(plan=>plan.scheduleId===original.scheduleId),
      two.plans.find(plan=>plan.scheduleId===original.scheduleId),'Deleting the second plan preserves the original plan');
    await deadline(()=>evaluate(client,'!document.querySelector('+JSON.stringify(secondCard)+')',formSid),
      'deleted second plan is absent from the real management list');
    assert(remaining.runs.some(run=>run.runId===due.run.runId));
    assert(remaining.results.some(result=>result.resultId===due.result.resultId));
    assert.deepEqual(remaining.runs.map(run=>run.runId).sort(),baseline.runs.map(run=>run.runId).sort(),
      'Paused edits and deletion cannot admit another Controller Run');
    assert.deepEqual(remaining.results.map(result=>result.resultId).sort(),baseline.results.map(result=>result.resultId).sort());
    assert.deepEqual(remaining.fires.filter(fire=>fire.runId).map(fire=>fire.fireId).sort(),
      baseline.fires.filter(fire=>fire.runId).map(fire=>fire.fireId).sort());
    assert.deepEqual(remaining.native,baseline.native,'Native operation states and receipt counts remain unchanged during paused form operations');
    assert.deepEqual(await evaluate(client,'({name:document.querySelector("#name")?.value,done:!!document.querySelector("#done")})',siteSid),webBefore,
      'Paused form operations leave the real test webpage unchanged');
    report.tests.nativeMultiplePlansAndDeleteConfirmation='PASS';
    report.nativeFormAudit={originalScheduleId:original.scheduleId,deletedScheduleId:second.scheduleId,
      finalState:remaining,website:await evaluate(client,'({name:document.querySelector("#name")?.value,done:!!document.querySelector("#done")})',siteSid)};
    report.screenshots.push(await screenshot(client,formSid,'r29-managed-plan-history'));
    if(PRODUCT_MATRIX){
      const beforeMatrix=await durable(client,formSid);
      // All 19 additions use the original verified install and genuine form
      // gestures. No storage seeding, arbitrary save RPC or controller replay.
      const title='长中文计划名用于真实列表扫描和换行验证'.repeat(4);
      for(let index=1;index<20;index++){
        await click(client,formSid,'#schedule-create');
        await type(client,formSid,'#schedule-title',index+' · '+title);
        await select(client,formSid,'#schedule-task-select',1);
        await type(client,formSid,'#schedule-target',URL+'?long='+('long-path-'.repeat(30)));
        await click(client,formSid,'#schedule-paused');
        await click(client,formSid,'#schedule-save');
        await deadline(()=>evaluate(client,'!document.querySelector("#schedule-save-confirm").hidden',formSid),'real plan '+index+' confirmation');
        await click(client,formSid,'#schedule-confirm-yes');
        await deadline(async()=>{
          const state=await durable(client,formSid);
          return state.plans.filter(plan=>!plan.deleted).length===index+1;
        },'real paused plan '+index+' persisted');
      }
      const twenty=await durable(client,formSid),plans=twenty.plans.filter(plan=>!plan.deleted);
      assert.equal(plans.length,20);assert(plans.every(plan=>plan.paused&&plan.nextDueAt===null));
      assert.deepEqual(twenty.runs.map(run=>run.runId).sort(),beforeMatrix.runs.map(run=>run.runId).sort());
      assert.deepEqual(twenty.results.map(result=>result.resultId).sort(),beforeMatrix.results.map(result=>result.resultId).sort());
      assert.deepEqual(twenty.native,beforeMatrix.native,'creating paused plans never performs native effects');
      await viewportEvidence(client,formSid,'r12-twenty-plan-sidepanel',report,[300,320,360,420,520]);
      const lastPlanId=await evaluate(client,'[...document.querySelectorAll("#schedule-plan-list .schedule-card")].at(-1).dataset.scheduleId',formSid);
      const lastCard='#schedule-plan-list .schedule-card[data-schedule-id='+JSON.stringify(lastPlanId)+']';
      await click(client,formSid,lastCard+' .schedule-plan-open');
      assert.equal(await evaluate(client,'document.querySelector("#schedule-detail-view").dataset.scheduleId',formSid),lastPlanId);
      assert.equal(await evaluate(client,'document.querySelector("#workspace-content").scrollTop',formSid),0);
      assert.equal(await evaluate(client,'document.querySelectorAll("#schedule-detail-view .schedule-detail-card").length',formSid),1);
      const indexPosition=await evaluate(client,'document.querySelector("#workspace-content").scrollHeight',formSid);
      report.screenshots.push(await screenshot(client,formSid,'r12-last-long-plan-detail'));
      await click(client,formSid,'#schedule-back');
      assert.equal(await evaluate(client,'document.activeElement.closest(".schedule-card").dataset.scheduleId',formSid),lastPlanId);
      assert((await evaluate(client,'document.querySelector("#workspace-content").scrollTop',formSid))>0,
        'return to the twentieth genuine plan restores its scrolled index');
      await click(client,formSid,card+' .schedule-plan-open');
      await details(client,formSid,'#schedule-detail-view .schedule-history');
      await details(client,formSid,'#schedule-detail-view .schedule-run-details');
      await click(client,formSid,'#schedule-detail-edit');
      await type(client,formSid,'#schedule-title','真实后台刷新后保留技术详情');
      await click(client,formSid,'#schedule-save');await click(client,formSid,'#schedule-confirm-yes');
      await deadline(()=>evaluate(client,'!document.querySelector("#schedule-detail-view").hidden',formSid),'real save returns to its originating detail');
      assert.equal(await evaluate(client,'document.querySelector("#schedule-detail-view .schedule-run-details").open',formSid),true,
        'a genuine changed plan snapshot retains the expanded original Run identity');
      report.tests.nativeTwentyPlansAndDetailReturn='PASS';
      report.tests.nativeTechnicalExpansionAfterRefresh='PASS';
      report.productMatrix={kind:'GENUINE_SIDE_PANEL_INPUT_AND_STORAGE',activePlanIds:plans.map(plan=>plan.scheduleId),
        retainedRunIds:twenty.runs.map(run=>run.runId),detailScrollHeight:indexPosition,
        limitations:['Widths are CDP CSS viewport emulation; physical Side Panel drag is separate',
          '120-history pagination uses component/source-renderer fixtures; no 120 native Fire records are fabricated']};
      report.screenshots.push(await screenshot(client,formSid,'r12-retained-run-detail'));
    }
    }catch(error){
      report.formMatrixFailure=await evaluate(client,
        '({url:location.href,kind:document.querySelector("#schedule-kind")?.value,once:document.querySelector("#schedule-once")?.value,clock:document.querySelector("#schedule-clock")?.value,timezone:document.querySelector("#schedule-timezone")?.value,timezoneOptions:[...document.querySelector("#schedule-timezone").options].map(option=>({value:option.value,disabled:option.disabled})),message:document.querySelector("#schedule-message")?.textContent,errors:[...document.querySelectorAll(".schedule-field-error")].map(node=>({id:node.id,text:node.textContent})),focus:document.activeElement?.id})',formSid).catch(()=>null);
      note('native-form-matrix-failure',report.formMatrixFailure);
      const capture=await screenshot(client,formSid,'r29-form-matrix-failure').catch(()=>null);
      if(capture)report.screenshots.push(capture);
      throw error;
    }
  }
  completed=true;
});
