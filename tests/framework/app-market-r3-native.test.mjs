// Existing production CFT driver, extended for the R4.5 offline catalog lifecycle.
// Every installation, permission, update and removal uses visible native input.
// Storage reads are observations only. No storage writes arrange these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath,lstat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {validateOfficialReleaseCatalog,OFFICIAL_CATALOG_PATH} from '../../src/sidebar-tools/official-catalog.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {MARKET_BATCH_STORE} from '../../src/marketplace/batch.js';
import {READING_TOC_SITE_STORE} from '../../src/reading-toc/policy.js';
import {CLIP_SITE_STORE} from '../../src/page-clip/policy.js';
import {CAPTURE_SITE_STORE} from '../../src/knowledge/policy.js';

const chromeBinary=[process.env.CHROME_BIN,'google-chrome','chromium','google-chrome-stable']
  .filter(Boolean).find(exe=>spawnSync(exe,['--version'],{stdio:'ignore'}).status===0);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const controls={'reading-toc':'#toc-list','web-markdown-clipper':'#clip-fetch',
  'knowledge-inbox':'#ki-records','quick-notes':'#note-text','markdown-workbench':'#mdw-source','r45-local-tool':'#mdw-source'};
const grantKeys=[READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE];
function cdpSocket(url){
  const ws=new WebSocket(url),pending=new Map(),observers=new Set();let nextId=0;
  const ready=new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const rejectPending=()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('CDP_CLOSED'));}pending.clear();};
  ws.onclose=rejectPending;
  ws.onmessage=event=>{
    const result=JSON.parse(event.data);
    if(!result.id){for(const fn of observers)fn(result);return;}
    const job=pending.get(result.id);if(!job)return;
    clearTimeout(job.timer);pending.delete(result.id);
    result.error?job.reject(Error(result.error.message)):job.resolve(result.result);
  };
  return {ready,onEvent(fn){observers.add(fn);return()=>observers.delete(fn);},send(method,params={},timeout=20000,sessionId){
    return new Promise((resolve,reject)=>{
      const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
      pending.set(id,{resolve,reject,timer});
      ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });
  },close(){ws.close();rejectPending();}};
}
async function evaluate(session,expression){
  const row=await session.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(row.exceptionDetails)throw Error('PAGE_EXCEPTION '+JSON.stringify(row.exceptionDetails).slice(0,600));
  return row.result.value;
}
async function until(fn,why){
  let lastError;
  for(let i=0;i<100;i++){
    try{const result=await fn();if(result)return result;}catch(error){lastError=error;}
    await sleep(120);
  }
  throw Error('Chrome timeout: '+why+(lastError?'; '+lastError.message:''));
}
async function click(session,selector){
  if(session.type!=='iframe')await session.send('Page.bringToFront');
  const point=await until(()=>evaluate(session,
    "(async()=>{const selector="+JSON.stringify(selector)+",el=document.querySelector(selector);"+
    "if(!el||el.disabled||!el.getClientRects().length)return false;"+
    "el.scrollIntoView({block:'center',behavior:'instant'});"+
    "await new Promise(requestAnimationFrame);const a=el.getBoundingClientRect();"+
    "await new Promise(requestAnimationFrame);const b=el.getBoundingClientRect();"+
    "if(document.querySelector(selector)!==el||el.disabled||!el.getClientRects().length||"+
    "a.x!==b.x||a.y!==b.y||a.width!==b.width||a.height!==b.height)return false;"+
    "const x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);"+
    "return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&hit&&el.contains(hit)?{x,y}:false;})()"),
    'stable unobscured native control '+selector);

  for(const type of ['mousePressed','mouseReleased'])
    await session.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
}
async function inputText(session,selector,text){
  await click(session,selector);
  await session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2,commands:['selectAll']});
  await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await session.send('Input.insertText',{text});
}
const website=label=>'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>R45 '+label+'</title>'+
  '<style>body{font:17px/1.8 system-ui;max-width:760px;margin:30px auto;padding:20px}p{min-height:200px}</style>'+
  '<article><h1>R45 '+label+' 阅读文章</h1><p>'+('这是一段仅用于隔离浏览器验收的本地文章，展示标题与正文，并没有远程网站数据。'.repeat(10))+'</p>'+
  '<h2>R45 授权边界</h2><p>'+('只有用户明确批准当前网站后，扩展才应读取本文。'.repeat(15))+'</p>'+
  '<h2>R45 持久选择</h2><p>'+('停用选择在关闭侧栏、重启浏览器和更新工具后都应保留。'.repeat(12))+'</p></article></html>';
async function fixtureServer(label){
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(website(label));});
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  return {server,origin:'http://127.0.0.1:'+server.address().port};
}

test('R4.5 production Chrome: optional releases, both official entries, permissions, update, restart and uninstall',{timeout:420000},async t=>{
  assert.ok(chromeBinary,'A real Chrome for Testing binary is required');
  const extension=await realpath(resolve('dist/production'));
  const artifactDir=resolve(process.env.OPENDESK_NATIVE_ARTIFACT_DIR||'artifacts/app-market-r3');await mkdir(artifactDir,{recursive:true});
  const catalogBytes=await readFile(join(extension,OFFICIAL_CATALOG_PATH));
  const catalog=validateOfficialReleaseCatalog(JSON.parse(catalogBytes));
  const packages=new Map();
  for(const row of catalog.apps){
    const bytes=await readFile(join(extension,row.packagePath));assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.sha256);
    packages.set(row.toolId,JSON.parse(bytes));assert.equal(row.installationPolicy,'optional');
  }
  assert.deepEqual([...packages.keys()].sort(),Object.keys(controls).filter(id=>id!=='r45-local-tool').sort());
  const manifest=JSON.parse(await readFile(join(extension,'manifest.json')));
  assert.equal(manifest.name,'OpenDesk Browser');assert.equal(manifest.externally_connectable,undefined);
  const buildReceipt=JSON.parse(await readFile(resolve(process.env.OPENDESK_BUILD_EVIDENCE_DIR||'docs/framework/evidence/wxt/builds','build-production.json')));
  const fingerprint=await packageFingerprint(extension);assert.equal(fingerprint.packageHash,buildReceipt.report.packageHash);
  const profile=await realpath(await mkdtemp(join(tmpdir(),'opendesk-market-r45-'))),profileStat=await lstat(profile);
  const servers=await Promise.all([fixtureServer('A'),fixtureServer('B')]);
  const evidence={result:'IN_PROGRESS',commit:process.env.GITHUB_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),
    extensionPath:extension,packageHash:fingerprint.packageHash,catalogSha256:hash(catalogBytes),releases:catalog.apps,
    platform:process.platform,nodeVersion:process.version,consoleErrors:[],runtimeExceptions:[],
    phases:[],dialogs:[],dialogErrors:[],chromeLifecycles:[],sites:servers.map(x=>x.origin),
    privateDataVia:'native input and save',storageWritesFromDriver:0,publicWebsite:'NOT_TESTED',
    actualMacChrome:'NOT_TESTED',fullFrameworkF3:'NOT_TESTED',zipInstallation:'NOT_TESTED',publicMarket:'NOT_CONFIGURED',
    sidePanelCloseControl:'CDP closes actual SIDE_PANEL target; native toolbar close button NOT_TESTED'};
  let browser,child,local,extensionId,host,side,pageA,pageB,stage='launch',currentLifecycle;
  const ownedChildren=[],dialogPlans=new Map(),attachedTargets=[];
  const save=()=>writeFile(join(artifactDir,'native-result.json'),JSON.stringify(evidence,null,2)+'\n');
  const phase=async(name,detail={})=>{stage=name;evidence.phases.push({name,...detail});console.log('R45_NATIVE_STAGE '+name);await save();};
  const profileUnchanged=async()=>{const stat=await lstat(profile);assert(stat.isDirectory()&&!stat.isSymbolicLink());assert.equal(stat.dev,profileStat.dev);assert.equal(stat.ino,profileStat.ino);};
  t.after(async()=>{
    if(evidence.result==='IN_PROGRESS'){
      evidence.result='FAILED';evidence.failedStage=stage;
      if(side){
        evidence.failedSidePanel=await evaluate(side,'({url:location.href,title:document.title,ready:document.readyState,status:document.querySelector("#sidebar-tool-status")?.textContent,importError:document.querySelector("#sidebar-tool-file-error")?.textContent,body:document.body.innerText.slice(0,2500)})').catch(error=>({error:error.message}));
      await screenshot(side,'r45-failure-side-panel.png').catch(()=>{});
      evidence.failedDOM=await evaluate(side,'document.documentElement.outerHTML').catch(error=>({error:error.message}));
      evidence.failedRegistry=await installed().catch(error=>({error:error.message}));
      evidence.failedGrants=Object.fromEntries(await Promise.all(grantKeys.map(async key=>
        [key,await readStore(key).catch(error=>({error:error.message}))])));
      }
      evidence.failedTargets=await browser?.send('Target.getTargets').catch(error=>({error:error.message}));
      evidence.failureSurfaces=[];
      const liveTargets=new Set(evidence.failedTargets?.targetInfos?.map(row=>row.targetId)||[]);
      for(const target of attachedTargets){
        if(!liveTargets.has(target.targetId))continue;
        const observed=await target.send('Runtime.evaluate',{expression:'({url:location.href,dom:document.documentElement.outerHTML})',returnByValue:true},2000)
          .then(row=>row.result.value).catch(error=>({error:error.message}));
        evidence.failureSurfaces.push({targetId:target.targetId,...observed});
        if(!observed.error)await screenshot(target,'failure-'+target.targetId+'.png').catch(()=>{});
      }
    }
    await save();browser?.close();
    for(const owned of ownedChildren){
      if(owned.closed)continue;
      await new Promise(done=>{const timer=setTimeout(()=>owned.child.kill('SIGKILL'),3000);
        owned.child.once('close',()=>{clearTimeout(timer);done();});owned.child.kill('SIGTERM');});
    }
    for(const fixture of servers){fixture.server.closeAllConnections();await new Promise(ok=>fixture.server.close(ok));}
    await profileUnchanged();await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  });
  async function launch(){
    assert(ownedChildren.every(row=>row.closed),'previous owned Chrome must fully exit before relaunch');
    await profileUnchanged();await rm(join(profile,'DevToolsActivePort'),{force:true});
    const argv=[...(process.env.OPENDESK_NATIVE_HEADED==='1'?[]:['--headless=new']),
      ...(process.platform==='darwin'?['--use-mock-keychain']:[]),
      '--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
      '--disable-background-networking','--window-size=1280,960','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0','--user-data-dir='+profile,'--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank'];
    child=spawn(chromeBinary,argv,{stdio:['ignore','ignore','pipe']});
    const owned={child,closed:false};ownedChildren.push(owned);
    const record={generation:ownedChildren.length,pid:child.pid,profile,argv,stderr:'',normalExit:false};
    currentLifecycle=record;evidence.chromeLifecycles.push(record);
    owned.exited=new Promise(ok=>child.once('close',(code,signal)=>{owned.closed=true;record.exit={code,signal};ok(record.exit);}));
    child.stderr.on('data',b=>{record.stderr=(record.stderr+b).slice(-5000);});
    const port=await until(async()=>{
      if(owned.closed)throw Error('Chrome exited: '+record.stderr);
      const value=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);return value||null;
    },'owned Chrome DevToolsActivePort');
    local='http://127.0.0.1:'+port;
    const version=await(await fetch(local+'/json/version')).json();record.version=version.Browser;
    browser=cdpSocket(version.webSocketDebuggerUrl);await browser.ready;
    browser.onEvent(event=>{
      if(event.method==='Runtime.exceptionThrown')evidence.runtimeExceptions.push({stage,sessionId:event.sessionId,...event.params});
      if(event.method==='Runtime.consoleAPICalled'&&event.params.type==='error')evidence.consoleErrors.push({stage,sessionId:event.sessionId,...event.params});
      if(event.method!=='Page.javascriptDialogOpening')return;
      const expected=dialogPlans.get(event.sessionId)?.shift(),message=event.params.message;
      const matches=expected&&event.params.type==='confirm'&&expected.parts.every(part=>message.includes(part));
      evidence.dialogs.push({stage,sessionId:event.sessionId,type:event.params.type,message,accept:matches?expected.accept:false,matched:Boolean(matches)});
      if(!matches)evidence.dialogErrors.push('Unexpected dialog at '+stage+': '+message);
      void browser.send('Page.handleJavaScriptDialog',{accept:matches?expected.accept:false},10000,event.sessionId)
        .catch(error=>evidence.dialogErrors.push(error.message));
    });
    const id=await until(async()=>{
      const {targetInfos}=await browser.send('Target.getTargets');
      return targetInfos.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[^/]+\/sw\.js/.test(x.url||''))?.url?.split('/')[2];
    },'production extension identity');
    if(extensionId)assert.equal(id,extensionId,'restart must preserve the same installed extension identity');
    extensionId=id;record.extensionId=id;evidence.extensionId=id;
  }
  async function closeChrome(){
    await profileUnchanged();const owned=ownedChildren.at(-1),record=currentLifecycle;
    await browser.send('Browser.close',{},10000).catch(error=>{record.closeTransport=error.message;});
    let timer;
    try{await Promise.race([owned.exited,new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('Chrome did not fully exit')),15000);})]);}
    finally{clearTimeout(timer);}
    assert.equal(record.exit.code,0,'Browser.close must exit normally');assert.equal(record.exit.signal,null);
    record.normalExit=true;browser.close();dialogPlans.clear();await save();
  }
  async function attach(targetId){
    const connection=browser,{sessionId}=await connection.send('Target.attachToTarget',{targetId,flatten:true});
    const {targetInfo}=await connection.send('Target.getTargetInfo',{targetId});
    const target={targetId,type:targetInfo.type,sessionId,send:(method,params={},timeout=20000)=>connection.send(method,params,timeout,sessionId)};
    await target.send('Runtime.enable');await target.send('Page.enable');attachedTargets.push(target);return target;
  }
  async function openTab(url,newWindow=false){
    return attach((await browser.send('Target.createTarget',{url,newWindow})).targetId);
  }
  async function activate(target){await browser.send('Target.activateTarget',{targetId:target.targetId});await target.send('Page.bringToFront');}
  async function visible(target,selector){return until(()=>evaluate(target,'(()=>{const n=document.querySelector('+JSON.stringify(selector)+');return !!n&&!n.disabled&&!!n.getClientRects().length})()'),'visible '+selector);}
  async function openPanel(launcher=host){
    if(!launcher)launcher=host=await openTab('chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID());
    await until(()=>evaluate(launcher,'!!document.querySelector("#tab-tools")'),'launcher UI');
    await activate(launcher);
    const windowId=await evaluate(launcher,'chrome.windows.getCurrent().then(w=>w.id)');
    assert(Number.isSafeInteger(windowId)&&windowId>=0);
    const attempt={stage,launcherTargetId:launcher.targetId,requestedWindowId:windowId};
    (evidence.panelOpenAttempts??=[]).push(attempt);
    try{
      attempt.before=await evaluate(launcher,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
      const previousIds=new Set(attempt.before.map(row=>row.contextId));
      await evaluate(launcher,"(()=>{window.__r45OpenState=null;let b=document.querySelector('#r45-open-panel');if(b)return true;b=document.createElement('button');b.id='r45-open-panel';"+
        "b.textContent='Open test Side Panel';b.style.cssText='position:fixed;z-index:2147483646;top:70px;left:20px;min-width:220px;min-height:48px';"+
        "b.addEventListener('click',e=>{const state=window.__r45OpenState={trusted:e.isTrusted,status:'pending'};chrome.sidePanel.open({windowId:"+windowId+"}).then(()=>state.status='opened',e=>{state.status='error';state.error=e.message})});document.body.append(b);return true})()");
      await click(launcher,'#r45-open-panel');
      await until(async()=>{
        attempt.openResult=await evaluate(launcher,'window.__r45OpenState');
        if(attempt.openResult?.error)throw Error(attempt.openResult.error);
        return attempt.openResult?.trusted===true&&attempt.openResult.status==='opened';
      },'trusted Side Panel open completed');
      const context=await until(async()=>{
        attempt.after=await evaluate(launcher,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");
        const created=attempt.after.filter(row=>!previousIds.has(row.contextId)&&
          row.documentUrl?.includes('/ui/tool.html')&&new URL(row.documentUrl).searchParams.has('hostInstanceId'));
        assert(created.length<=1,'one gesture must create a unique actual Side Panel context');
        return created[0];
      },'new actual SIDE_PANEL context');
      const info=await until(async()=>{const {targetInfos}=await browser.send('Target.getTargets');return targetInfos.find(row=>row.url===context.documentUrl);},'actual Side Panel target');
      const panel=await attach(info.targetId);panel.documentUrl=context.documentUrl;panel.contextId=context.contextId;
      attempt.panel={contextId:context.contextId,contextWindowId:context.windowId,targetId:info.targetId,documentUrl:context.documentUrl,
        observedWindowId:await evaluate(panel,'chrome.windows.getCurrent().then(w=>w.id)')};
      assert.equal(attempt.panel.observedWindowId,windowId,'actual panel must belong to the requested browser window');
      panel.windowId=attempt.panel.observedWindowId;
      await until(()=>evaluate(panel,'document.readyState==="complete"'),'Side Panel document ready');
      await visible(panel,'#tab-tools');await click(panel,'#tab-tools');
      await until(()=>evaluate(panel,'!document.querySelector("#workbench-tools").hidden'),'actual Tools tab selected');
      await until(()=>evaluate(panel,'document.querySelectorAll("[data-official-tool-id]").length==='+catalog.apps.length),'official catalog rendered');
      return panel;
    }finally{
      attempt.openResult=await evaluate(launcher,'window.__r45OpenState').catch(error=>({error:error.message}));
      await save();
    }
  }
  async function closePanel(){
    const previous=side;assert.equal((await browser.send('Target.closeTarget',{targetId:side.targetId})).success,true);
    await until(async()=>!(await evaluate(host,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})")).some(row=>row.documentUrl===previous.documentUrl),'Side Panel context destroyed');
    side=null;
  }
  const readStore=(key,target=side)=>evaluate(target,'chrome.storage.local.get('+JSON.stringify(key)+').then(x=>x['+JSON.stringify(key)+'])');
  const installed=async(target=side)=>(await readStore(SIDEBAR_TOOL_STORE,target))||[];
  const action=(id,name)=>'[data-sidebar-tool-id="'+id+'"][data-sidebar-tool-action="'+name+'"]';
  async function assertNoGrants(target=side){for(const key of grantKeys)assert.deepEqual((await readStore(key,target))||{},{});}
  async function assertNoFrames(){
    assert.equal(await evaluate(side,'document.querySelectorAll("#sidebar-tool-frame iframe").length'),0);
    assert.equal((await browser.send('Target.getTargets')).targetInfos.filter(x=>x.type==='iframe'&&x.url?.includes('/sidebar-tools/sandbox.html')).length,0);
  }
  async function nativeDialogClick(target,selector,plans){
    assert.equal(dialogPlans.get(target.sessionId)?.length||0,0,'previous expected dialogs must have completed');
    dialogPlans.set(target.sessionId,plans.map(row=>({parts:row.parts,accept:row.accept!==false})));
    await click(target,selector);
    await until(()=>dialogPlans.get(target.sessionId).length===0,'expected native confirmation');
    assert.deepEqual(evidence.dialogErrors,[]);
  }
  async function iframeWith(id){
    const info=await until(async()=>{
      const frames=(await browser.send('Target.getTargets')).targetInfos.filter(row=>row.type==='iframe'&&row.url?.includes('/sidebar-tools/sandbox.html'));
      assert(frames.length<=1,'each phase must own exactly one active tool sandbox');return frames[0];
    },'one actual tool sandbox');
    const frame=await attach(info.targetId);
    await until(()=>evaluate(frame,'document.querySelector("#tool-status")?.dataset.state==="ready"'),'tool JavaScript loaded '+id);
    await visible(frame,controls[id]);
    if(id==='knowledge-inbox'){
      await until(()=>evaluate(frame,'/^\\d+ 条结果/.test(document.querySelector("#ki-count").textContent)&&document.querySelector("#ki-list-loading").hidden'),'knowledge inbox loaded actual local store');
      assert.equal(await evaluate(frame,'document.querySelector("#ki-status").dataset.error === "true"'),false);
    }
    return frame;
  }
  async function openTool(id){await visible(side,action(id,'open'));await click(side,action(id,'open'));return iframeWith(id);}
  async function back(){
    await click(side,'#sidebar-tool-back');await until(()=>evaluate(side,'!document.querySelector("#sidebar-tool-list-view").hidden'),'return to installed tools');
    await until(async()=>(await browser.send('Target.getTargets')).targetInfos.every(row=>row.type!=='iframe'||!row.url?.includes('/sidebar-tools/sandbox.html')),'old sandbox target destroyed');
    await assertNoFrames();
  }
  async function grantSite(id){
    assert(['reading-toc','web-markdown-clipper'].includes(id));
    const toc=id==='reading-toc',key=toc?READING_TOC_SITE_STORE:CLIP_SITE_STORE;
    const origin=servers[0].origin,selector=action(id,'site');
    await visible(side,selector);
    await nativeDialogClick(side,selector,[{parts:[origin,toc?'章节标题':'文章正文']}]);
    await until(async()=>(await readStore(key))?.[id]?.includes(origin),'persisted website approval '+id);
    const message=toc?'已为当前网站启用目录':'已授权当前网站剪藏';
    await until(()=>evaluate(side,'document.querySelector('+JSON.stringify(selector)+')?.dataset.enabled==="true"&&document.querySelector("#sidebar-tool-status").textContent==='+JSON.stringify(message)),
      'completed website approval UI '+id);
  }
  async function uninstall(id){
    await visible(side,action(id,'remove'));
    await nativeDialogClick(side,action(id,'remove'),[{parts:['卸载','删除']}]);
    await until(async()=>!(await installed()).some(row=>row.id===id),'uninstall '+id);
    await until(()=>evaluate(side,'!document.querySelector('+JSON.stringify(action(id,'remove'))+')'),'removed row '+id);
  }
  async function officialReview(id,target=side){
    const release=catalog.apps.find(row=>row.toolId===id),before=await installed(target);
    try{await visible(target,'[data-official-install="'+id+'"]');}
    catch(error){
      evidence.unavailableReview={id,targetId:target.targetId,windowId:target.windowId,
        observation:await evaluate(target,'({url:location.href,surface:document.documentElement.dataset.opendeskSurface,tab:document.documentElement.dataset.opendeskTab,body:document.body.innerText.slice(0,2500)})').catch(cause=>({error:cause.message}))};
      await save();throw error;
    }
    await click(target,'[data-official-install="'+id+'"]');
    await until(()=>evaluate(target,'!document.querySelector("#sidebar-tool-preview").hidden'),'review '+id);
    assert.equal(await evaluate(target,'document.querySelector("#sidebar-tool-preview-version").textContent'),'v'+release.version);
    assert.equal(await evaluate(target,'document.querySelector("#sidebar-tool-preview-title").textContent'),release.packageTitle);
    assert.deepEqual(await installed(target),before,'review cannot change installation');
  }
  async function officialInstall(id){
    await officialReview(id);await click(side,'#sidebar-tool-import-close');
    await officialReview(id);await click(side,'#sidebar-tool-install');
    await until(async()=>(await installed()).filter(row=>row.id===id).length===1,'explicit install '+id);
    await until(()=>evaluate(side,'document.querySelector("#sidebar-tool-import").hidden'),'closed review '+id);
    await assertNoFrames();await assertNoGrants();
  }
  async function importPackage(pkg,name,plans=[]){
    const file=join(profile,name+'.opendesk-tool.json');await writeFile(file,serializeSidebarToolPackage(pkg));
    await click(side,'#sidebar-tool-import-trigger');await side.send('DOM.enable');
    const {root}=await side.send('DOM.getDocument',{depth:1});
    const {nodeId}=await side.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#sidebar-tool-file'});assert(nodeId);
    await side.send('DOM.setFileInputFiles',{nodeId,files:[file]});
    await until(()=>evaluate(side,'!document.querySelector("#sidebar-tool-preview").hidden'),'native local file review');
    assert.equal(await evaluate(side,'document.querySelector("#sidebar-tool-preview-version").textContent'),'v'+pkg.version);
    if(plans.length)await nativeDialogClick(side,'#sidebar-tool-install',plans);else await click(side,'#sidebar-tool-install');
    await until(async()=>(await installed()).some(row=>row.id===pkg.id&&row.version===pkg.version),'local package committed');
    await until(()=>evaluate(side,'document.querySelector("#sidebar-tool-import").hidden'),'local review closed');
  }
  async function screenshot(target,name){
    const shot=await target.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(artifactDir,name),Buffer.from(shot.data,'base64'));
  }
  async function responsiveCheck(target,name){
    evidence.responsive??=[];
    try{
      for(const width of [320,360,400]){
        await target.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await until(()=>evaluate(target,'innerWidth==='+width),'CSS viewport '+name+' '+width);
        const observation=await evaluate(target,'({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})');
        assert(observation.scrollWidth<=width,name+' must not overflow horizontally');
        evidence.responsive.push({surface:name,method:'CDP CSS viewport in actual extension',...observation});
        await screenshot(target,name+'-'+width+'.png');
      }
    }finally{await target.send('Emulation.clearDeviceMetricsOverride');}
  }

  await launch();side=await openPanel();await phase('fresh-optional-state');
  assert.deepEqual(await installed(),[]);await assertNoGrants();await assertNoFrames();
  assert.equal(await evaluate(side,'document.querySelectorAll("#sidebar-tool-list .sidebar-tool-row").length'),0);
  for(const release of catalog.apps){
    const raw=await evaluate(host,'fetch(chrome.runtime.getURL('+JSON.stringify(release.packagePath)+')).then(r=>{if(!r.ok)throw Error(r.status);return r.text()})');
    assert.equal(hash(Buffer.from(raw)),release.sha256);
  }
  pageA=await openTab(servers[0].origin+'/article');pageB=await openTab(servers[1].origin+'/article');
  for(const page of [pageA,pageB])assert.equal(await evaluate(page,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
  await screenshot(side,'r45-fresh-optional.png');

  // Preserve and strengthen the upstream five-app market acceptance loop.
  await phase('market-five-reviewed-installs-and-real-sandboxes');
  await click(side,'#sidebar-tool-market');
  const marketInfo=await until(async()=>(await browser.send('Target.getTargets')).targetInfos.find(row=>row.type==='page'&&row.url?.includes('/ui/marketplace.html')),'market opened by Side Panel');
  const market=await attach(marketInfo.targetId);
  for(const release of catalog.apps){
    await activate(market);await visible(market,'#market-home');await click(market,'#market-home');
    await until(()=>evaluate(market,'document.querySelectorAll(".app-card").length==='+catalog.apps.length),'market cards');
    await click(market,'a[href="#/apps/'+release.id+'/versions/'+release.version+'"]');
    await visible(market,'#market-root .detail-layout aside .actions button');
    await click(market,'#market-root .detail-layout aside .actions button');await visible(market,'.review .actions .primary');
    assert(!(await installed()).some(row=>row.id===release.toolId));
    await click(market,'.review .actions .primary');
    await until(async()=>(await installed()).some(row=>row.id===release.toolId&&row.version===release.version),'market installed '+release.toolId);
    await until(()=>evaluate(market,'!document.querySelector(".review")'),'market review completed');await assertNoFrames();await assertNoGrants();
    await click(market,'#market-my');
    const index=(await installed()).findIndex(row=>row.id===release.toolId)+1;
    const open='#market-root .surface .action-row:nth-child('+index+') button';await visible(market,open);await click(market,open);
    const opened=await until(async()=>(await browser.send('Target.getTargets')).targetInfos.find(row=>row.type==='page'&&row.url?.includes('/ui/tool.html')&&new URL(row.url).searchParams.get('toolId')===release.toolId),'explicit market tool open');
    await iframeWith(release.toolId);assert.equal((await browser.send('Target.closeTarget',{targetId:opened.targetId})).success,true);
    await until(async()=>(await browser.send('Target.getTargets')).targetInfos.every(row=>row.type!=='iframe'||!row.url?.includes('/sidebar-tools/sandbox.html')),'market tool sandbox destroyed');
  }
  // Preserve the upstream R3.1 real batch/reload acceptance. The old official
  // revision stays immutable; a user-created revision pins current releases.
  await phase('market-fixed-unavailable-version-and-current-batch');
  await click(market,'#market-collection');
  await until(()=>evaluate(market,'location.hash==="#/collections/reading-kit/revisions/1"&&!!document.querySelector("#market-root .surface .actions button.primary")'),'fixed collection and preflight ready');
  await click(market,'#market-root .surface .actions button.primary');
  await visible(market,'.review .actions button:not(.primary)');
  assert.equal(await evaluate(market,'document.querySelector(".review .actions .primary").disabled'),true,'old revision cannot silently replace its unavailable pinned notes');
  assert.equal((await installed()).length,catalog.apps.length,'preflight alone never installs');
  assert.match(await evaluate(market,'document.querySelector("#market-root").innerText'),/1\.1\.1/);
  const unavailableReview=await evaluate(market,'document.querySelector(".review").innerText');
  assert.match(unavailableReview,/blocked/);
  assert.match(unavailableReview,/当前扩展不包含这个固定版本/);
  await click(market,'.review .actions button:not(.primary)');
  await click(market,'#market-my');
  for(let index=1;index<=catalog.apps.length;index++){
    const selector='#market-root .action-row:nth-child('+index+') input[type="checkbox"]';
    await visible(market,selector);await click(market,selector);
  }
  await click(market,'#market-root .surface > .actions button:nth-child(2)');
  const collectionRoute=await until(()=>evaluate(market,'location.hash.startsWith("#/collections/my-selection/revisions/")?location.hash:null'),'user-created current fixed revision');
  await uninstall('web-markdown-clipper');await uninstall('knowledge-inbox');
  await activate(market);await visible(market,'#market-root .surface .actions button.primary');
  await click(market,'#market-root .surface .actions button.primary');await visible(market,'.review .actions .primary');
  assert.equal((await installed()).length,catalog.apps.length-2,'current revision review requires confirmation');
  await click(market,'.review .actions .primary');
  const expectedBatch=catalog.apps.map(row=>['web-markdown-clipper','knowledge-inbox'].includes(row.toolId)?'succeeded':'skip');
  const completedBatch=await until(async()=>{
    const value=await readStore(MARKET_BATCH_STORE,market);
    return (await installed()).length===catalog.apps.length&&JSON.stringify(value?.items?.map(row=>row.status))===JSON.stringify(expectedBatch)?value:null;
  },'two real batch installs with existing releases skipped');
  assert.equal(completedBatch.collectionId,'my-selection');
  assert.equal(new Set(completedBatch.items.map(row=>row.operationId)).size,catalog.apps.length);
  await until(()=>evaluate(market,'!document.querySelector(".review")'),'batch commit finished');
  const previousDocument=await evaluate(market,'performance.timeOrigin');
  await market.send('Page.reload');
  await until(()=>evaluate(market,'performance.timeOrigin!=='+previousDocument+'&&document.readyState==="complete"&&location.hash==='+JSON.stringify(collectionRoute)+'&&document.querySelectorAll("#market-root .surface").length>=2'),'persisted batch after actual document reload');
  const persistedBatch=await readStore(MARKET_BATCH_STORE,market);assert.deepEqual(persistedBatch,completedBatch);
  evidence.batch={collectionId:completedBatch.collectionId,revision:completedBatch.revision,statuses:expectedBatch,
    operationIds:completedBatch.items.map(row=>row.operationId),reloadVerified:true,unavailableOldRevisionNotSubstituted:true};
  await assertNoFrames();await assertNoGrants();
  await click(market,'#market-my');await until(()=>evaluate(market,'document.querySelectorAll(".action-row").length==='+catalog.apps.length),'all five after batch');
  await screenshot(market,'market-my-apps.png');
  await browser.send('Target.closeTarget',{targetId:market.targetId});
  for(const release of catalog.apps)await uninstall(release.toolId);
  await assertNoGrants();assert.deepEqual(await installed(),[]);

  await phase('side-panel-official-installs-and-cross-window-confirmation');
  for(const release of catalog.apps.filter(row=>row.toolId!=='markdown-workbench')){
    await officialInstall(release.toolId);await openTool(release.toolId);await back();
  }
  const secondLauncher=await openTab('chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID(),true);
  const second=await openPanel(secondLauncher);
  assert.notEqual(second.windowId,side.windowId,'concurrent approvals use two actual Chrome windows');
  assert.notEqual(second.contextId,side.contextId,'each window owns its real SIDE_PANEL context');
  evidence.concurrentPanels=[side,second].map(panel=>({windowId:panel.windowId,contextId:panel.contextId,targetId:panel.targetId,documentUrl:panel.documentUrl}));
  await officialReview('markdown-workbench');await officialReview('markdown-workbench',second);
  const clicks=await Promise.allSettled([click(side,'#sidebar-tool-install'),click(second,'#sidebar-tool-install')]);
  assert(clicks.some(row=>row.status==='fulfilled'),'at least one native approval must be delivered');
  await until(async()=>(await installed()).filter(row=>row.id==='markdown-workbench').length===1,'single concurrent install');
  for(const target of [side,second])await until(()=>evaluate(target,
    '!document.querySelector("#sidebar-tool-import-close").disabled&&(document.querySelector("#sidebar-tool-import").hidden||document.querySelector("#sidebar-tool-preview").hidden)'),
    'concurrent install completed or stale approval invalidated');
  const workbenchRelease=catalog.apps.find(row=>row.toolId==='markdown-workbench');
  const provenance=await readStore(MARKET_PROVENANCE_STORE);
  assert.deepEqual(provenance['markdown-workbench'],{marketId:workbenchRelease.id,sha256:workbenchRelease.sha256,version:workbenchRelease.version});
  await browser.send('Target.closeTarget',{targetId:second.targetId});
  await browser.send('Target.closeTarget',{targetId:secondLauncher.targetId});
  await until(()=>evaluate(side,'document.querySelector("#sidebar-tool-import").hidden||document.querySelector("#sidebar-tool-preview").hidden'),'first review consumed');
  if(await evaluate(side,'!document.querySelector("#sidebar-tool-import").hidden'))await click(side,'#sidebar-tool-import-close');
  await openTool('markdown-workbench');await back();
  assert.equal((await installed()).length,catalog.apps.length);await assertNoGrants();await screenshot(side,'r45-five-official-installed.png');

  await phase('independent-origin-grants-and-explicit-page-clip');
  await activate(pageA);
  await until(()=>evaluate(side,'document.querySelector("#script-current-page-url")?.textContent.includes('+JSON.stringify(servers[0].origin)+')'),'Side Panel current page A');
  evidence.websitePermissionRefusals=[];
  for(const [id,label,key] of [['reading-toc','章节标题',READING_TOC_SITE_STORE],['web-markdown-clipper','文章正文',CLIP_SITE_STORE]]){
    await nativeDialogClick(side,action(id,'site'),[{parts:[servers[0].origin,label],accept:false}]);
    await assertNoGrants();await assertNoFrames();
    assert.equal(await evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
    evidence.websitePermissionRefusals.push({id,origin:servers[0].origin,after:(await readStore(key))??null});
  }
  await grantSite('reading-toc');
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'TOC only on approved A');
  assert.equal(await evaluate(pageB,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
  await grantSite('web-markdown-clipper');
  let frame=await openTool('web-markdown-clipper');await click(frame,'#clip-fetch');
  await until(()=>evaluate(frame,'document.querySelector("#clip-source").value.includes("R45 授权边界")'),'actual article extraction');await back();
  const grantedBefore={toc:await readStore(READING_TOC_SITE_STORE),clip:await readStore(CLIP_SITE_STORE)};
  assert.deepEqual(grantedBefore.toc,{'reading-toc':[servers[0].origin]});
  assert.deepEqual(grantedBefore.clip,{'web-markdown-clipper':[servers[0].origin]});

  await phase('controlled-local-old-version-and-reviewed-official-upgrade');
  const notes=packages.get('quick-notes'),oldNotes={...notes,version:'0.0.1',capabilities:['storage.local']};
  await importPackage(oldNotes,'controlled-old-notes',[{parts:['版本回退']}]);
  frame=await openTool('quick-notes');const note='R45：明确保存，升级和重启后保留 '+randomUUID();
  await visible(frame,'#note-text');await inputText(frame,'#note-text',note);await click(frame,'#save-note');
  await until(()=>evaluate(frame,'document.querySelector("#note-status").textContent.includes("已保存")&&!document.querySelector("#save-note").disabled'),'native note save acknowledged');
  const noteData=await readStore(sidebarToolStorageKey('quick-notes'));assert(JSON.stringify(noteData).includes(note));await back();
  await officialReview('quick-notes');assert.equal(await evaluate(side,'document.querySelector("[data-official-tool-id=quick-notes]").dataset.installationState'),'update');
  await click(side,'#sidebar-tool-import-close');assert.equal((await installed()).find(row=>row.id==='quick-notes').version,'0.0.1');
  await officialReview('quick-notes');
  await nativeDialogClick(side,'#sidebar-tool-install',[{parts:['来源']},{parts:['新增能力'],accept:false}]);
  await until(()=>evaluate(side,'!document.querySelector("#sidebar-tool-install").disabled'),'cancelled added capability review');
  assert.equal((await installed()).find(row=>row.id==='quick-notes').version,'0.0.1');assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);
  await nativeDialogClick(side,'#sidebar-tool-install',[{parts:['来源']},{parts:['新增能力']}]);
  await until(async()=>(await installed()).find(row=>row.id==='quick-notes')?.version===notes.version,'official notes upgraded after both consents');
  await until(()=>evaluate(side,'document.querySelector("#sidebar-tool-import").hidden'),'notes upgrade review closed');
  assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);
  frame=await openTool('quick-notes');await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(note)),'same private note after upgrade');await back();
  const toc=packages.get('reading-toc');await importPackage({...toc,version:'0.0.1'},'controlled-old-toc',[{parts:['版本回退']}]);
  await officialReview('reading-toc');assert.deepEqual(await readStore(READING_TOC_SITE_STORE),grantedBefore.toc);
  await nativeDialogClick(side,'#sidebar-tool-install',[{parts:['来源']}]);
  await until(async()=>(await installed()).find(row=>row.id==='reading-toc')?.version===toc.version,'TOC reviewed upgrade');
  await until(()=>evaluate(side,'document.querySelector("#sidebar-tool-import").hidden'),'TOC review closed');
  assert.deepEqual(await readStore(READING_TOC_SITE_STORE),grantedBefore.toc);assert.deepEqual(await readStore(CLIP_SITE_STORE),grantedBefore.clip);

  await phase('panel-close-reopen-preserves-grants-and-no-automatic-tool-instance');
  await closePanel();assert.equal(await evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length'),1);
  side=await openPanel();await assertNoFrames();assert.equal((await installed()).length,catalog.apps.length);
  await activate(pageB);
  await until(()=>evaluate(side,'document.querySelector("#script-current-page-url")?.textContent.includes('+JSON.stringify(servers[1].origin)+')'),'Side Panel current page B');
  for(const [id,key,label] of [['reading-toc',READING_TOC_SITE_STORE,'目录'],['web-markdown-clipper',CLIP_SITE_STORE,'剪藏']]){
    await visible(side,action(id,'sites'));
    await click(side,action(id,'sites'));await visible(side,'#sidebar-tool-sites-'+id+' .sidebar-tool-site-revoke');
    const before=await readStore(key);
    await click(side,'#sidebar-tool-sites-'+id+' .sidebar-tool-site-revoke');
    // Native mouseReleased does not await the async storage/lock handler. Wait
    // for this revocation and its final UI before the next gesture can be made.
    await until(async()=>!(await readStore(key))?.[id]?.includes(servers[0].origin),'persisted revocation '+id);
    await until(()=>evaluate(side,'!document.querySelector('+JSON.stringify('#sidebar-tool-sites-'+id+' .sidebar-tool-site-revoke')+')&&document.querySelector("#sidebar-tool-status").textContent==='+
      JSON.stringify('已撤销 '+servers[0].origin+' 的'+label+'授权')),'completed revocation UI '+id);
    (evidence.revocations??=[]).push({id,key,before,after:await readStore(key)});

  }
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),'revocation immediately removes A TOC');
  await assertNoGrants();await screenshot(side,'r45-revoked-from-other-origin.png');

  // Capacity-only fixture: special keys in an owned, disposable Chrome profile.
  // Tool packages, tool data and install operations are still populated solely
  // through native trusted clicks, never by writing the protected registry.
  await phase('host-local-storage-exceeds-10MiB');
  const capacityPrefix='opendesk.storage-capacity-test.v1:'+randomUUID()+':';
  const capacityCount=12,capacityChunkBytes=920000;
  const unlimited=await evaluate(side,"chrome.permissions.contains({permissions:['unlimitedStorage']})");
  assert.equal(unlimited,true,'the loaded production extension must actually hold unlimitedStorage');
  const originalTotal=await evaluate(side,'chrome.storage.local.getBytesInUse(null)');
  const highUsage=await evaluate(side,"(async()=>{for(let i=0;i<"+capacityCount+";i++)"+
    "await chrome.storage.local.set({["+JSON.stringify(capacityPrefix)+"+i]:'x'.repeat("+capacityChunkBytes+")});"+
    "return chrome.storage.local.getBytesInUse(null)})()");
  assert(highUsage>10*1024*1024,'real chrome.storage.local must hold more than 10 MiB');
  evidence.storageWritesFromDriver=capacityCount;evidence.protectedInstallationStorageWritesFromDriver=0;
  evidence.storageCapacity={unlimited,originalBytes:originalTotal,above10MiBBytes:highUsage,
    fixtureKeyCount:capacityCount,fixtureKeyPrefix:capacityPrefix,
    fixtureValueBytes:capacityChunkBytes,installedVia:'native UI',dataOrigin:'capacity-only fixture'};
  await phase('other-local-json-import');
  await importPackage({...packages.get('markdown-workbench'),id:'r45-local-tool',title:'R45 本地导入工具'},'other-local-tool');
  await openTool('r45-local-tool');await back();
  const beforeRestart=await installed();
  await phase('first-complete-chrome-restart');await closeChrome();host=null;side=null;await launch();side=await openPanel();
  assert.deepEqual(await installed(),beforeRestart);await assertNoGrants();await assertNoFrames();
  assert.deepEqual(await readStore(sidebarToolStorageKey('quick-notes')),noteData);
  evidence.storageCapacity.afterRestartBytes=await evaluate(side,'chrome.storage.local.getBytesInUse(null)');
  assert(evidence.storageCapacity.afterRestartBytes>10*1024*1024,
    'Chrome restart must retain the >10 MiB capacity fixture and locally installed tools');
  const capacityCleanup=await evaluate(side,"(async()=>{const keys=Array.from({length:"+capacityCount+
    "},(_,i)=>"+JSON.stringify(capacityPrefix)+"+i);"+
    "await chrome.storage.local.remove(keys);const left=await chrome.storage.local.get(keys);"+
    "return {remaining:Object.values(left).filter(v=>v!==undefined).length,used:await chrome.storage.local.getBytesInUse(null)}})()");
  assert.equal(capacityCleanup.remaining,0,'cleanup must remove only dedicated capacity fixture keys');
  evidence.storageFixtureRemovalsFromDriver=capacityCount;
  evidence.storageCapacity.afterFixtureCleanupBytes=capacityCleanup.used;
  pageA=await openTab(servers[0].origin+'/article');pageB=await openTab(servers[1].origin+'/article');
  for(const page of [pageA,pageB])assert.equal(await evaluate(page,'document.querySelectorAll("[data-opendesk-toc-root]").length'),0);
  frame=await openTool('quick-notes');await until(()=>evaluate(frame,'document.querySelector("#note-text").value==='+JSON.stringify(note)),'native note survives full Chrome restart');await back();
  assert.notEqual(evidence.chromeLifecycles[0].pid,evidence.chromeLifecycles[1].pid);

  await phase('uninstall-removes-data-grants-and-provenance');
  // Re-grant through real UI after proving revocation survived the restart.
  // Uninstall must now remove existing grants, not merely observe empty stores.
  await activate(pageA);
  await until(()=>evaluate(side,'document.querySelector("#script-current-page-url")?.textContent.includes('+JSON.stringify(servers[0].origin)+')'),'current page A before uninstall');
  await grantSite('reading-toc');
  await grantSite('web-markdown-clipper');
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'TOC re-granted before uninstall');
  await until(async()=>JSON.stringify(await readStore(CLIP_SITE_STORE))===JSON.stringify(grantedBefore.clip)&&
    await evaluate(side,'document.querySelector("#sidebar-tool-status").textContent==="已授权当前网站剪藏"'),
    'durable clip grant and completed UI before uninstall');
  assert.deepEqual(await readStore(READING_TOC_SITE_STORE),grantedBefore.toc);
  assert.deepEqual(await readStore(CLIP_SITE_STORE),grantedBefore.clip);
  for(const row of await installed())await uninstall(row.id);
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),'uninstall removes authorized page TOC');
  await assertNoGrants();assert.deepEqual(await installed(),[]);
  for(const row of beforeRestart)assert.equal(await readStore(sidebarToolStorageKey(row.id)),undefined);
  assert.deepEqual((await readStore(MARKET_PROVENANCE_STORE))||{},{});
  await phase('second-complete-chrome-restart-after-uninstall');await closeChrome();host=null;side=null;await launch();side=await openPanel();
  assert.deepEqual(await installed(),[]);await assertNoGrants();await assertNoFrames();
  for(const release of catalog.apps){
    await visible(side,'[data-official-install="'+release.toolId+'"]');
    assert.equal(await evaluate(side,'document.querySelector("[data-official-tool-id='+release.toolId+']").dataset.installationState'),'available');
    const raw=await evaluate(host,'fetch(chrome.runtime.getURL('+JSON.stringify(release.packagePath)+')).then(r=>r.text())');assert.equal(hash(Buffer.from(raw)),release.sha256);
  }
  assert.equal((await packageFingerprint(extension)).packageHash,fingerprint.packageHash,'actual loaded production bytes stayed unchanged');
  assert.equal(evidence.chromeLifecycles.filter(row=>row.normalExit).length,2);assert.deepEqual(evidence.dialogErrors,[]);
  await screenshot(side,'r45-uninstalled-after-restart.png');
  await phase('responsive-keyboard-and-real-browser-zoom');
  await responsiveCheck(side,'side-panel-tools');
  await click(side,'#tab-tools');evidence.keyboardFocus=[];
  const keyboardControls=['sidebar-tool-market','sidebar-tool-import-trigger',
    ...catalog.apps.map(row=>'sidebar-tool-official-'+row.toolId+'-install')];
  for(const expectedId of keyboardControls){
    for(const type of ['keyDown','keyUp'])await side.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const focus=await evaluate(side,'(()=>{const e=document.activeElement;return {tag:e.tagName,id:e.id,label:e.getAttribute("aria-label")||e.textContent.slice(0,80),visible:!!e.getClientRects().length,focusVisible:e.matches(":focus-visible")}})()');
    evidence.keyboardFocus.push(focus);assert.equal(focus.id,expectedId,'native Tab follows official UI order');
    assert(focus.visible&&focus.focusVisible,'keyboard control focus must remain visible');
  }
  for(const type of ['keyDown','keyUp'])await side.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
  assert.equal(await evaluate(side,'document.activeElement.id'),keyboardControls.at(-2),'native Shift+Tab returns to previous official app');
  await screenshot(side,'side-panel-keyboard-focus.png');

  await click(side,'#sidebar-tool-market');
  const finalMarketInfo=await until(async()=>(await browser.send('Target.getTargets')).targetInfos.find(row=>row.type==='page'&&row.url?.includes('/ui/marketplace.html')),'final official market entry');
  const finalMarket=await attach(finalMarketInfo.targetId);
  await visible(finalMarket,'#market-home');await click(finalMarket,'#market-home');
  await until(()=>evaluate(finalMarket,'document.querySelectorAll(".app-card").length==='+catalog.apps.length),'final market catalog');
  await responsiveCheck(finalMarket,'market-catalog');
  const marketTabId=await evaluate(finalMarket,'chrome.tabs.getCurrent().then(tab=>tab.id)');
  try{
    await evaluate(finalMarket,'chrome.tabs.setZoom('+marketTabId+',2)');
    assert.equal(await evaluate(finalMarket,'chrome.tabs.getZoom('+marketTabId+')'),2,'real Chrome tab zoom');
    evidence.marketZoom={factor:2,method:'Chrome tabs.setZoom/getZoom',tabId:marketTabId};
    await screenshot(finalMarket,'market-catalog-200-percent.png');
  }finally{await evaluate(finalMarket,'chrome.tabs.setZoom('+marketTabId+',1)');}
  await browser.send('Target.closeTarget',{targetId:finalMarket.targetId});
  evidence.result='REAL_CHROME_FIXTURE_PASS';evidence.actualMacChrome=process.platform==='darwin'?'PASS':'NOT_TESTED';
  evidence.finalRegistry=await installed();evidence.controlledOldVersions=['quick-notes@0.0.1','reading-toc@0.0.1'];
  evidence.controlledOldVersionsAreHistoricalReleases=false;evidence.confirmedOptionalTools=catalog.apps.map(row=>row.toolId);
  await save();console.log('R45_NATIVE_RESULT '+JSON.stringify({result:evidence.result,commit:evidence.commit,extensionId,packageHash:evidence.packageHash,
    phases:evidence.phases.length,normalChromeRestarts:2,dialogCount:evidence.dialogs.length}));
});
