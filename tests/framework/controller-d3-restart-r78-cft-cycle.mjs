// Leader hook: after R78-A PASS/terminal Stop, before fixture shutdown/root cleanup.
// Requires OPENDESK_DEV_CHROME_RESTART=1 at the original launch; owns only new CDPs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {verifiedControllerESMAuthorSource} from '../../src/ui/controller-esm-source.js';
import {moveReadingTocWithNativeInput} from './controller-d3-chromepage-r78-cft-cycle.mjs';

export async function runR78D3RestartCycle({chrome, browser, cdp, until, clickReal, report, output}) {
  const proof={caseId:'R78-D3-SAME-PROFILE-OFFLINE-RESTART',status:'IN_PROGRESS',requests:[],cleanupErrors:[]};
  report.tests.push(proof);
  const sessions=[];let restartedBrowser,packageRoot,failed=false;
  const raw=error=>({name:error.name,code:error.code,message:String(error.message||error),stack:error.stack});
  const connect=async uri=>{const session=await cdp(uri);sessions.push(session);return session;};
  const watch=async(session,label)=>{
    session.on('Network.requestWillBeSent',event=>proof.requests.push({label,url:event.request.url,requestId:event.requestId}));
    await session.call('Network.enable');
  };
  const offline=async(session,label)=>{
    await watch(session,label);
    await session.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  };
  try {
    assert.equal(typeof chrome.restart,'function','leader must pass the existing restart-enabled launcher handle');
    assert(output&&fs.statSync(output).isDirectory(),'leader evidence output must already exist');
    const original=report.tests.find(row=>row.caseId==='R78-A-CHROMEPAGE-D3');
    assert.match(original?.status||'',/^CHROME_PASS_R78_/,'R78-A must already have passed');
    const saved=original.savedRevision,stop=(original.lastStop||original.stop)?.records;
    assert(saved?.sourceUtf8&&saved.scriptId&&Number.isSafeInteger(saved.revision)&&saved.revision>0);
    assert.equal(createHash('sha256').update(saved.sourceUtf8).digest('hex'),saved.contentHash);
    assert.equal(original.fixedRun?.sourceHash,saved.contentHash,'original full saved executable already passed');
    assert.equal(stop?.run?.state,'stopped','original last Stop must be terminal');
    assert.equal(stop.run.retirementState,'released');assert.equal(stop.run.workerRetired,true);assert.equal(stop.result.runId,stop.run.runId);
    assert.equal(stop.result.state,'stopped');assert.equal(stop.result.outcome.ok,false);
    assert.equal(stop.result.resultId,stop.run.resultId);assert.deepEqual(stop.result.revision,stop.run.revision);
    const author=await verifiedControllerESMAuthorSource(saved.sourceUtf8);
    assert.equal(author?.programId,saved.scriptId);
    const extensionId=report.extensionId,previousPid=chrome.pid,profile=report.launch?.profile;
    assert.match(extensionId,/^[a-p]{32}$/);assert(profile&&Number.isSafeInteger(previousPid)&&previousPid>0);
    const loaded=report.launch.argv.filter(arg=>arg.startsWith('--load-extension='));
    assert.equal(loaded.length,1);packageRoot=loaded[0].slice('--load-extension='.length);
    assert(!packageRoot.includes(','),'one original extension package');
    proof.packageBefore=await packageFingerprint(packageRoot);
    assert.equal(proof.packageBefore.packageHash,original.packageBefore.packageHash);
    assert.equal(proof.packageBefore.packageHash,original.packageAfter.packageHash);
    proof.savedRevision=saved;proof.previousStop=stop;proof.previousPid=previousPid;proof.profile=profile;
    try { await browser.call('Browser.close'); } catch(error) {
      proof.closeObservation=raw(error);if(!/CDP closed/i.test(error.message))throw error;
    }
    const restart=await chrome.restart();proof.restart=restart;
    assert.equal(restart.previousPid,previousPid);assert.notEqual(restart.pid,previousPid);
    assert.equal(chrome.pid,restart.pid);assert(Number.isSafeInteger(restart.pid)&&restart.pid>0);assert.equal(restart.profile,profile);
    proof.newPid=restart.pid;proof.sameProfile=true;
    assert.match(String(restart.lines?.[0]),/^\d+$/);assert.match(restart.lines?.[1]||'',/^\/devtools\/browser\//);
    const base='http://127.0.0.1:'+restart.lines[0],rootURI='ws://127.0.0.1:'+restart.lines[0]+restart.lines[1];
    restartedBrowser=await cdp(rootURI);proof.rootURI=rootURI;
    const targets=async()=>{const response=await fetch(base+'/json/list');assert(response.ok);return response.json();};
    const workerTarget=await until(async()=>(await targets()).find(t=>t.type==='service_worker'&&
      t.url==='chrome-extension://'+extensionId+'/sw.js'&&t.webSocketDebuggerUrl),'same extension real SW after restart');
    const worker=await connect(workerTarget.webSocketDebuggerUrl);proof.workerTarget=workerTarget;
    await offline(worker,'service_worker');assert.equal(await worker.read('chrome.runtime.id'),extensionId);
    const createTab=async url=>{
      const response=await fetch(base+'/json/new?about%3Ablank',{method:'PUT'});assert.equal(response.status,200);
      const info=await response.json(),session=await connect(info.webSocketDebuggerUrl);await watch(session,info.id);
      await session.call('Page.navigate',{url});return {info,session};
    };
    const demo='http://127.0.0.1:43111/demo-form.html',website=await createTab(demo);
    await until(()=>website.session.read('document.readyState==="complete"&&!!document.querySelector("#search-form")'),'leader-owned 43111 demo');
    const catalog=await createTab('chrome-extension://'+extensionId+'/ui/tool.html');
    await until(()=>catalog.session.read('document.readyState==="complete"&&document.documentElement.dataset.opendeskSurface==="catalog"&&'+
      '(()=>{const e=document.querySelector("#catalog-open-dev-sidebar");const r=e?.getBoundingClientRect();return !!r?.width&&!!r?.height&&!e.disabled})()'),
      'real catalog Sidebar control ready',20000);
    await restartedBrowser.call('Target.activateTarget',{targetId:catalog.info.id});
    await clickReal(catalog.session,'document.querySelector("#catalog-open-dev-sidebar")');
    await until(()=>catalog.session.read('document.querySelector("#catalog-dev-sidebar-status").textContent.includes("已打开侧栏")'),'real Sidebar open acknowledgement');
    const panelTarget=await until(async()=>(await targets()).find(t=>t.id!==catalog.info.id&&t.webSocketDebuggerUrl&&
      t.url?.startsWith('chrome-extension://'+extensionId+'/ui/tool.html')&&t.url.includes('hostInstanceId=')),'real Chrome Side Panel');
    const sidebar=await connect(panelTarget.webSocketDebuggerUrl);proof.sidebarTarget=panelTarget;
    await offline(sidebar,'sidebar');
    const read=expression=>sidebar.read(expression);
    await until(()=>read('document.readyState==="complete"&&!!document.querySelector("#tab-develop")'),'extension self-load while offline');
    assert.equal(await read('chrome.runtime.id'),extensionId);
    proof.contexts=await read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');
    const panelUrl=await read('location.href');
    assert(proof.contexts.some(row=>row.documentUrl===panelUrl&&row.contextType==='SIDE_PANEL'));
    await restartedBrowser.call('Target.activateTarget',{targetId:website.info.id});
    await clickReal(sidebar,'document.querySelector("#tab-develop")');
    await until(()=>read('document.querySelector("#tab-develop").getAttribute("aria-selected")==="true"'),'Developer selected');
    assert.equal(await read('chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})'),true);
    proof.readingToc=await moveReadingTocWithNativeInput({website,browser:restartedBrowser});
    for(const [id,value] of [['script-id',saved.scriptId],['script-revision',String(saved.revision)],['script-params','{}']]) {
      await clickReal(sidebar,'document.querySelector('+JSON.stringify('#'+id)+')');
      const key={key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:process.platform==='darwin'?4:2};
      await sidebar.call('Input.dispatchKeyEvent',{type:'keyDown',...key,commands:['selectAll']});
      await sidebar.call('Input.dispatchKeyEvent',{type:'keyUp',...key});await sidebar.call('Input.insertText',{text:value});
      assert.equal(await read('document.getElementById('+JSON.stringify(id)+').value'),value);
    }
    await until(()=>read('!document.querySelector("#script-load").disabled'),'saved revision Load enabled');
    await clickReal(sidebar,'document.querySelector("#script-load")');
    await until(()=>read('document.querySelector("#script-status").dataset.state==="loaded"'),'saved R78 revision loaded offline');
    assert.equal(await read('document.querySelector("#script-source").value'),author.authorSourceUtf8);
    assert.equal(await read('Number(document.querySelector("#script-revision").value)'),saved.revision);
    let visible=false;
    for(let n=0;n<16;n++) {
      const box=await website.session.read('(()=>{const r=document.querySelector("#search-form").getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()');
      if(box.top>=20&&box.bottom<=box.height-20){visible=true;break;}
      await website.session.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.width/2,y:box.height/2,deltaX:0,deltaY:box.top<20?-400:400});
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert(visible,'search form must be visible through real mouse wheel input');
    const observe=()=>website.session.read('({count:Number(document.querySelector("#search-count").textContent.replace(/\\D/g,"")),keyword:document.querySelector("#keyword").value,result:document.querySelector("#results").textContent})');
    proof.before=await observe();
    await until(()=>read('!document.querySelector("#script-run").disabled'),'offline Controller Run enabled',45000);
    await clickReal(sidebar,'document.querySelector("#script-run")');
    proof.ui=await until(()=>read('(()=>{const s=document.querySelector("#script-status");return ["results","error"].includes(s?.dataset.state)?{state:s.dataset.state,message:s.textContent,runId:document.querySelector("#script-run-id").value,value:document.querySelector("#script-result").textContent,version:document.querySelector("#script-task-version").textContent}:null})()'),'offline saved Controller result',90000);
    assert.equal(proof.ui.state,'results',proof.ui.message);assert(proof.ui.runId&&proof.ui.runId!==stop.run.runId);
    proof.value=JSON.parse(proof.ui.value);proof.after=await observe();
    assert.equal(proof.value.success,true);assert.equal(proof.value.maxValue,5);assert.equal(proof.value.library,'d3-array@3.2.4');
    assert.equal(proof.value.searchCountBefore,proof.before.count);assert.equal(proof.value.searchCountAfter,proof.before.count+1);
    assert.equal(proof.after.count,proof.before.count+1);assert.equal(proof.after.keyword,'OpenDesk');
    assert.equal(proof.value.result,proof.after.result);assert.match(proof.after.result,/OpenDesk/);
    assert.equal(proof.ui.version.match(/[a-f0-9]{64}/)?.[0],saved.contentHash);
    const records=()=>read('(async()=>{if(!(await indexedDB.databases()).some(x=>x.name==="opendesk-browser"))throw Error("Missing existing durable DB");'+
      'const db=await new Promise((ok,bad)=>{const q=indexedDB.open("opendesk-browser");q.onupgradeneeded=()=>{q.transaction.abort();bad(Error("No schema writes allowed"))};q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});'+
      'try{const rows=[];for(const name of ["frameworkKV","runs","results","scriptRevisions"])if(db.objectStoreNames.contains(name)){'+
      'const values=await new Promise((ok,bad)=>{const q=db.transaction(name,"readonly").objectStore(name).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});'+
      'rows.push(...values.filter(r=>r.namespace==="tool:"+location.hostname));}return rows}finally{db.close()}})()');
    proof.durable=await until(async()=>{const rows=await records(),run=rows.find(r=>r.tag==='controller-run'&&r.runId===proof.ui.runId);
      const result=rows.find(r=>r.tag==='controller-result'&&r.resultId===run?.resultId);
      return run?.retirementState==='released'&&result?{run,result,saved:rows.find(r=>r.tag==='script-revision'&&r.scriptId===saved.scriptId&&r.revision===saved.revision)}:null;
    },'exact Durable Result and released Worker',30000);
    const {run,result,saved:persisted}=proof.durable;
    assert.equal(run.state,'completed');assert.equal(run.workerRetired,true);assert.equal(result.state,'completed');
    assert.equal(result.outcome.ok,true);assert.equal(result.runId,proof.ui.runId);assert.notEqual(result.resultId,original.fixedRun.resultId);
    assert.deepEqual(run.revision,result.revision);assert.equal(result.revision.sourceHash,saved.contentHash);
    assert.equal(persisted?.sourceUtf8,saved.sourceUtf8);assert.equal(persisted.contentHash,saved.contentHash);
    assert.deepEqual(decodeValue(result.outcome.valueWire),proof.value);
    const frame=await read('chrome.webNavigation.getAllFrames({tabId:'+run.target.tabId+'}).then(rows=>rows.find(row=>row.frameId===0))');
    assert.equal(run.target.frameId,0);assert.equal(run.target.url,demo);assert.equal(frame.url,demo);assert.equal(run.target.documentId,frame.documentId);
    proof.network={offlineSW:true,offlineSidebar:true,dependencyRequests:proof.requests.filter(row=>/^https?:\/\/(?:raw\.githubusercontent\.com|(?:[^/]+\.)?jsdelivr\.net)(?:[/:]|$)/i.test(row.url))};
    assert.deepEqual(proof.network.dependencyRequests,[],'offline restart must make zero raw GitHub/jsDelivr requests');
    proof.status='CHROME_PASS_R78_D3_SAME_PROFILE_OFFLINE_RESTART';
    if(process.env.OPENDESK_R78_NATIVE_SECURITY==='1'){
      const {runR78D3SecurityCycle}=await import('./controller-d3-security-r78-cft-cycle.mjs');
      await runR78D3SecurityCycle({browser:restartedBrowser,base,extensionId,website,sidebar,
        panelTarget,connect,until,clickReal,report,output,read});
    }
    return proof;
  } catch(error) {
    failed=true;proof.status='CHROME_FAIL';proof.error=raw(error);proof.failureViews=[];
    for(const session of sessions)try{proof.failureViews.push(await session.read('({url:location.href,body:typeof document==="undefined"?null:document.body?.innerText,'+
      'runDisabled:typeof document==="undefined"?null:document.querySelector("#script-run")?.disabled})'));}catch{}
    throw error;
  }
  finally {
    try { await restartedBrowser?.call('Browser.close'); } catch(error) { if(!/CDP closed/i.test(error.message))proof.cleanupErrors.push(raw(error)); }
    for(const session of [...sessions,restartedBrowser].filter(Boolean))try { session.close(); } catch(error) { proof.cleanupErrors.push(raw(error)); }
    if(proof.packageBefore)try { proof.packageAfter=await packageFingerprint(packageRoot);assert.equal(proof.packageAfter.packageHash,proof.packageBefore.packageHash); } catch(error) { proof.cleanupErrors.push(raw(error)); }
    if(proof.cleanupErrors.length)proof.status='CHROME_FAIL';proof.finishedAt=new Date().toISOString();
    if(!failed&&proof.cleanupErrors.length)proof.error=proof.cleanupErrors[0];
    try { if(output)fs.writeFileSync(path.join(output,'r78-restart-cycle.json'),JSON.stringify(proof,null,2)+'\n'); } catch(error) { if(!failed){proof.status='CHROME_FAIL';proof.error=raw(error);throw error;}proof.evidenceWriteError=raw(error); }
    if(proof.cleanupErrors.length&&!failed)throw Object.assign(Error('R78 restart final verification/cleanup failed'),{cause:proof.error});
    // The root driver retains chrome.cleanup(), fixture lifetime and passed old CDPs.
  }
}
