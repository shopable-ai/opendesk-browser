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
const EXPECTED_PLATFORM=process.env.SCHEDULE_NATIVE_PLATFORM||'darwin';
const CONTROL_MODIFIER=process.platform==='darwin'?4:2;
let nativeOwnedMacInput=null; // Set after the uniquely owned Chrome PID is observed.
const CI_UNSANDBOXED_LINUX=process.platform==='linux' &&
  EXPECTED_PLATFORM==='linux' && process.env.CI==='true' &&
  process.env.GITHUB_ACTIONS==='true' &&
  process.env.SCHEDULE_NATIVE_CI_NO_SANDBOX==='1';
const BIN=process.env.CHROME_BIN;
const OUT=path.resolve(process.env.SCHEDULE_NATIVE_OUT||'artifacts/scheduled-tasks-r1-mac');
const EXT=path.resolve('dist/production');
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
      if(gestureStarted||!/(?:context|navigated|target.*closed)/i.test(String(error?.message))){
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
    nativeOwnedMacInput('activate');
    await click(client,session,selector);
    for(const key of ['home',...Array.from({length:index},()=> 'down'),'return'])
      nativeOwnedMacInput('key',key);
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
async function screenshot(client,session,name){
  const response=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(response.data,'base64');
  await writeFile(path.join(OUT,name+'.png'),bytes);
  return {file:name+'.png',bytes:bytes.length,sha256:sha(bytes)};
}
// Genuine Chrome renderer viewport emulation; NOT a physical Side Panel
// resize and NOT Chrome's 200% browser zoom. This probe never writes page DOM.
async function viewportEvidence(client,session,surface,report){
  const widths=surface==='sidepanel'?[320,360,420]:[320,360,420,760];
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
        'hasHorizontalOverflow:root.scrollWidth>innerWidth+1,'+
        'panelVisible:!document.querySelector("#scheduled-panel").hidden}})()',session);
      assert.equal(actual.viewport,width,'Native renderer must honor emulated viewport');
      assert.equal(actual.panelVisible,true,'Schedule remains visible at narrow viewport');
      assert.equal(actual.hasHorizontalOverflow,false,
        'No horizontal page overflow in '+surface+' at '+width+'px');
      snapshots.push({surface,width,...actual,
        screenshot:await screenshot(client,session,'r2-'+surface+'-viewport-'+width)});
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
    'sourceHash:r.revision?.sourceHash,documentId:r.target?.documentId}));'+
    'return {plans:plans.map(x=>({scheduleId:x.scheduleId,generation:x.generation,paused:x.paused,nextDueAt:x.nextDueAt,'+
    'taskId:x.taskId,triggerKind:x.triggerKind,installationId:x.installationId,taskGeneration:x.taskGeneration,version:x.version,manifestHash:x.manifestHash})),installs:kv.filter(x=>x.tag==="task-installed-v1").map(x=>({taskId:x.taskId,version:x.version,enabled:x.enabled,generation:x.authorization?.generation,installationId:x.authorization?.installationId})),fires:fires.map(x=>({fireId:x.fireId,runId:x.runId,'+
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
  {skip:!ENABLED,timeout:450000},async t=>{
  assert.equal(process.platform,EXPECTED_PLATFORM,'Use an explicit native platform for this isolated CFT test');
  assert(BIN&&path.isAbsolute(BIN)&&spawnSync(BIN,['--version'],{stdio:'ignore'}).status===0,
    'Pinned real Chrome for Testing required');
  if(process.env.SCHEDULE_NATIVE_CI_NO_SANDBOX==='1')
    assert(CI_UNSANDBOXED_LINUX,'--no-sandbox may only be used in the named ephemeral GitHub Linux CFT runner');
  await mkdir(OUT,{recursive:true});
  const sourceHash=sha(await readFile('src/platform/tasks/schedule-service.js'));
  const packageInfo=await packageFingerprint(EXT);
  const task=JSON.parse(await readFile('examples/tasks/form-fill.v1.opendesk-task.json','utf8'));
  assert.equal(task.manifest.siteOrigins[0],'http://127.0.0.1:43111');
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-scheduled-r1-'));
  const sourceFile=path.join(profile,'sample.form-fill.js');
  await writeFile(sourceFile,task.sourceUtf8);
  const report={status:'RUNNING',startedAt:new Date().toISOString(),gitSha:process.env.GITHUB_SHA||null,
    chromeBinary:BIN,platform:process.platform,
    sandboxPolicy:CI_UNSANDBOXED_LINUX?'explicit isolated Linux CI --no-sandbox; NOT a sandbox-security PASS':'Chrome OS sandbox unchanged',
    package:packageInfo,sourceHash,taskSourceHash:sha(task.sourceUtf8),
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
  server=createServer((req,res)=>{
    if(!req.url?.startsWith('/demo-form.html')){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(html);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(43111,'127.0.0.1',resolve);
  });
  const args=['--use-mock-keychain','--password-store=basic','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+EXT,'--load-extension='+EXT,
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
      assert.equal(result.status,0,'real owned macOS input '+command+' '+(value||'')+
        ': '+String(result.stdout||result.stderr||result.error||'').slice(-900));
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
      observation.title?.includes('运行页')?observation:null;
  },'real dedicated visible runner finished its normal product navigation');
  assert.equal(runnerPresentation.surface,'scheduled-runner');
  assert.equal(runnerPresentation.navHidden,true,'dedicated runner must not inherit unrelated workbench tabs');
  assert.equal(runnerPresentation.scheduleVisible,true,'visible runner must retain its real plan manager');
  assert(runnerPresentation.contentWidth>250&&runnerPresentation.contentWidth<=761,
    'wide runner must use a bounded readable content column');
  assert.match(runnerPresentation.title,/运行页.*运行概览/);
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
  await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)")?.textContent?.includes("恢复")',
      runnerSid),'real disabled plan presents Resume, not stale Pause');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)")?.textContent?.includes("暂停")',
      reopenedSid),'reopened scheduler exposes Pause on active plan');
    await click(client,reopenedSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
      'document.querySelector("#schedule-manager-list .schedule-manager-card .schedule-actions button:nth-child(2)")?.textContent==="停用"',
      runnerSid),'real installed Task manager exposes Disable');
    await click(client,runnerSid,'#schedule-manager-list .schedule-manager-card .schedule-actions button:nth-child(2)');
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
    await click(client,runnerSid,'#schedule-manager-back');
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
      'document.querySelector("#schedule-manager-list .schedule-manager-card .schedule-actions button:nth-child(2)")?.textContent==="启用"',
      runnerSid),'Task can be reenabled from real management interface');
    await click(client,runnerSid,'#schedule-manager-list .schedule-manager-card .schedule-actions button:nth-child(2)');
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
    await click(client,runnerSid,'#schedule-manager-list .schedule-manager-card .schedule-actions button:nth-child(4)');
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
    await click(client,runnerSid,'#schedule-manager-back');
    await click(client,runnerSid,'#schedule-cancel');
    await click(client,runnerSid,'#schedule-runner-manage');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
      'document.querySelector("#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)")?.textContent?.includes("恢复")',
      runnerSid),'visible resume before full Chrome exit');
    await click(client,runnerSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
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
    const freshSite=await client.send('Target.createTarget',{url:'about:blank'});
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
    await click(client,sideAgainSid,'#schedule-open');
    await deadline(()=>evaluate(client,'!!document.querySelector("#schedule-plan-list .schedule-card")',sideAgainSid),
      'recovered plan visible in original My > Schedules');
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
    await click(client,runnerAgainSid,'#schedule-plan-list .schedule-card .schedule-actions button:nth-child(2)');
    await deadline(async()=>{
      const state=await durable(client,runnerAgainSid);
      return state.plans[0]?.paused===true&&state.plans[0]?.nextDueAt===null;
    },'pause recovered plan from original UI after second native result');
  }
  completed=true;
});
