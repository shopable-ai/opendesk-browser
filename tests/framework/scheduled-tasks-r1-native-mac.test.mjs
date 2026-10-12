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
  await deadline(()=>visible(client,session,selector),'visible clickable '+selector);
  const node=await client.send('Runtime.evaluate',{expression:expr(selector),returnByValue:false},session);
  assert(node.result?.objectId,'native target object is required: '+selector);
  try{
    await client.send('DOM.scrollIntoViewIfNeeded',{objectId:node.result.objectId},session);
    await sleep(65);
    const rect=await evaluate(client,'(()=>{const n='+expr(selector)+';const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()',session);
    assert(rect.w>7&&rect.h>7&&rect.x>0&&rect.y>0,'actual screen geometry '+selector);
    for(const type of ['mousePressed','mouseReleased'])
      await client.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},session);
  }finally{await client.send('Runtime.releaseObject',{objectId:node.result.objectId},session).catch(()=>{});}
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
    'taskId:x.taskId,triggerKind:x.triggerKind,installationId:x.installationId})),fires:fires.map(x=>({fireId:x.fireId,runId:x.runId,'+
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
  assert.match(runnerPresentation.title,/运行页.*定时计划/);
  assert.match(runnerPresentation.openRunnerLabel,/再开运行页/);
  report.tests.dedicatedRunnerLayout='PASS';
  note('dedicated-runner-layout',runnerPresentation);
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
  completed=true;
});
