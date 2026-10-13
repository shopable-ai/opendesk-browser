// Extend the existing R7.4 CFT cycle; the original launcher, real Side Panel
// inputs, RunHost, Authority and Worker remain the only execution path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {verifiedControllerESMAuthorSource} from '../../src/ui/controller-esm-source.js';

const PROGRAM = 'r78-controller-d3-chromepage';
const D3_URL = 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const SHA = '691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const SOURCE = fs.readFileSync(new URL('../../examples/programs/single-file/controller-d3-chromepage-esm.js', import.meta.url), 'utf8');

export async function moveReadingTocWithNativeInput({website,browser}) {
  const observe=()=>website.session.read('(()=>{const h=document.querySelector("[data-opendesk-toc-root]");'+
    'if(!h)return null;const r=h.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,viewport:innerWidth}})()');
  const before=await observe();
  if(!before||before.left<before.viewport/3)return {before,moved:false};
  await browser.call('Target.activateTarget',{targetId:website.info.id});
  // Read closed-shadow descriptors; input still goes through the real draggable UI.
  const {root}=await website.session.call('DOM.getDocument',{depth:-1,pierce:true});
  const find=node=>{
    const attrs=node.attributes||[];
    for(let i=0;i<attrs.length;i+=2)if(attrs[i]==='aria-label'&&attrs[i+1]==='拖动阅读目录；方向键移动，Home 归位')return node;
    for(const child of [...(node.children||[]),...(node.shadowRoots||[]),...(node.contentDocument?[node.contentDocument]:[])]){
      const found=find(child);if(found)return found;
    }
    return null;
  };
  const grab=find(root);assert(grab,'reading TOC must retain its real drag control');
  const {model}=await website.session.call('DOM.getBoxModel',{backendNodeId:grab.backendNodeId});
  const q=model.content,x=(q[0]+q[2])/2,y=(q[1]+q[5])/2;
  await website.session.call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  await website.session.call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
  await website.session.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x-before.left+8,y,button:'left',buttons:1});
  await website.session.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x-before.left+8,y,button:'left',clickCount:1});
  await new Promise(resolve=>setTimeout(resolve,250));
  const after=await observe();assert(after?.left<before.viewport/3,'native drag must move TOC away from search button');
  return {before,after,moved:true,control:'real closed-shadow drag handle'};
}

export async function runR78ControllerD3ChromePageCycle({sidebar, website, browser, until, clickReal, type, read, report}) {
  const proof = {caseId:'R78-A-CHROMEPAGE-D3', programId:PROGRAM, world:'CONTROLLER',
    authorSourceHash:createHash('sha256').update(SOURCE).digest('hex'), status:'IN_PROGRESS'};
  report.tests.push(proof);
  const packageRoot=process.env.OPENDESK_DEV_PACKAGE_DIR||'dist/production';
  proof.packageBefore=await packageFingerprint(packageRoot);
  const namespace='tool:'+await read('location.hostname');
  const observePage = () => website.session.read('({keyword:document.querySelector("#keyword")?.value,'+
    'result:document.querySelector("#results")?.textContent,count:Number((document.querySelector("#search-count")?.textContent||"").replace(/\\D/g,"")),'+
    'globals:{max:typeof window.max,page:typeof window.page}})');
  async function durable(runId) {
    return read('(async()=>{const rows=[];for(const info of await indexedDB.databases()){' +
      'if(info.name!=="opendesk-browser")continue;const db=await new Promise((ok,bad)=>{const q=indexedDB.open(info.name);q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});' +
      'try{for(const name of ["frameworkKV","runs","results","commandJournal","scriptRevisions"])if(db.objectStoreNames.contains(name)){' +
      'const values=await new Promise((ok,bad)=>{const q=db.transaction(name,"readonly").objectStore(name).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});' +
      'rows.push(...values.filter(r=>r.namespace==='+JSON.stringify(namespace)+'&&(r.runId==='+JSON.stringify(runId)+'||r.scriptId==='+JSON.stringify(PROGRAM)+'||r.manifest?.programId==='+JSON.stringify(PROGRAM)+')));}}finally{db.close();}}return rows})()');
  }
  async function scrollForm() {
    await browser.call('Target.activateTarget', {targetId:website.info.id});
    for (let n = 0; n < 16; n++) {
      const box = await website.session.read('(()=>{const r=document.querySelector("#search-form").getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,width:innerWidth}})()');
      if (box.top >= 20 && box.bottom <= box.height - 20) return;
      await website.session.call('Input.dispatchMouseEvent', {type:'mouseWheel', x:box.width/2, y:box.height/2, deltaX:0,
        deltaY:box.top < 20 ? -400 : 400});
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Search form must be in the viewport before Locator actions');
  }
  async function execute(previousRunId) {
    await scrollForm();
    const before = await observePage();
    assert.equal(before.globals.max,'undefined');
    assert.equal(before.globals.page,'undefined');
    await until(()=>read('!document.querySelector("#script-run").disabled'), 'ChromePage + D3 Run enabled', 45000);
    await clickReal(sidebar,'document.querySelector("#script-run")');
    const ui = await until(async()=>{
      const row = await read('(()=>{const s=document.querySelector("#script-status");return {state:s?.dataset.state,message:s?.textContent,'+
        'runId:document.querySelector("#script-run-id")?.value,resultText:document.querySelector("#script-result")?.textContent,'+
        'version:document.querySelector("#script-task-version")?.textContent}})()');
      if (row.state === 'error') return {error:row.message};
      return row.state === 'results' && row.runId && row.runId !== previousRunId ? row : null;
    }, 'same Controller performs the search and D3 calculation', 90000);
    assert(!ui.error,ui.error);
    proof.lastExecutionObservation={ui,page:await observePage(),records:await durable(ui.runId)};
    assert(ui.resultText?.trim().startsWith('{'),
      'Controller did not return success JSON: '+ui.resultText);
    const value = JSON.parse(ui.resultText), after = await observePage();
    assert.equal(value.success,true);
    assert.equal(value.maxValue,5);
    assert.equal(value.library,'d3-array@3.2.4');
    assert.equal(value.searchCountBefore,before.count);
    assert.equal(value.searchCountAfter,before.count+1);
    assert.equal(after.count,before.count+1);
    assert.equal(after.keyword,'OpenDesk');
    assert.equal(value.result,after.result);
    assert.match(after.result,/OpenDesk/);
    assert.equal(after.globals.max,'undefined');
    assert.equal(after.globals.page,'undefined');
    const sourceHash = ui.version.match(/[a-f0-9]{64}/)?.[0];
    assert(sourceHash);
    const rows = await until(async()=>{
      const records = await durable(ui.runId);
      const run = records.find(r=>r.tag==='controller-run' && r.runId===ui.runId);
      const result = records.find(r=>r.tag==='controller-result' && r.resultId===run?.resultId);
      return run?.retirementState==='released' && result ? {run,result,records} : null;
    }, 'matching Durable Result and released Worker', 30000);
    assert.equal(rows.run.state,'completed');
    assert.equal(rows.result.state,'completed');
    assert.equal(rows.result.outcome.ok,true);
    assert.equal(rows.run.namespace,namespace);
    assert.equal(rows.result.namespace,namespace);
    assert.equal(rows.result.runId,ui.runId);
    assert.equal(rows.result.revision.sourceHash,sourceHash);
    assert.deepEqual(rows.run.revision,rows.result.revision);
    assert.equal(rows.run.workerRetired,true);
    const frame=await read('chrome.webNavigation.getAllFrames({tabId:'+rows.run.target.tabId+'}).then(rows=>rows.find(row=>row.frameId===0))');
    assert.equal(rows.run.target.frameId,0);
    assert.equal(rows.run.target.url,'http://127.0.0.1:43111/demo-form.html');
    assert.equal(rows.run.target.documentId,frame.documentId);
    assert.equal(frame.url,rows.run.target.url);
    const locks=rows.records.filter(r=>r.tag==='component-esm-lock-v1'&&
      r.manifest?.programId===PROGRAM&&r.manifest.sourceHash===proof.authorSourceHash);
    assert.equal(locks.length,1,'one exact author/namespace lock in the isolated profile');
    const lock = locks[0];
    assert(lock,'real Controller dependency lock');
    assert.equal(lock.manifest.world,'CONTROLLER');
    const module = lock.entries.find(e=>e.url===D3_URL);
    assert(module,'fixed upstream D3 module');
    assert.equal(module.sha256,SHA);
    assert.equal(module.bytes,502);
    return {runId:ui.runId,resultId:rows.result.resultId,sourceHash,value,before,after,
      durable:rows,lockId:lock.lockId};
  }
  try {
    proof.readingToc=await moveReadingTocWithNativeInput({website,browser});
    await type('document.querySelector("#script-id")',PROGRAM);
    await type('document.querySelector("#script-source")',SOURCE);
    proof.first = await execute();
    proof.repeat = await execute(proof.first.runId);
    assert.equal(proof.repeat.sourceHash,proof.first.sourceHash);
    assert.equal(proof.repeat.lockId,proof.first.lockId);
    assert.notEqual(proof.repeat.resultId,proof.first.resultId);
    await until(()=>read('!document.querySelector("#script-save").disabled'), 'fixed Controller Save enabled');
    await clickReal(sidebar,'document.querySelector("#script-save")');
    proof.save = await until(async()=>{
      const s = await read('(()=>{const e=document.querySelector("#script-status");return {state:e?.dataset.state,text:e?.textContent}})()');
      if(s.state==='error')return {error:s.text};
      return s.state==='saved'?s:null;
    }, 'save fixed ChromePage + D3 revision',40000);
    assert(!proof.save.error,proof.save.error);
    const revision=await read('Number(document.querySelector("#script-revision").value)');
    const saved=(await durable(proof.repeat.runId)).find(row=>row.tag==='script-revision'&&row.scriptId===PROGRAM&&row.revision===revision);
    assert(saved,'real persisted Controller Program Revision');
    const author=await verifiedControllerESMAuthorSource(saved.sourceUtf8);
    assert.equal(author.programId,PROGRAM);
    assert.equal(author.authorSourceUtf8,SOURCE);
    assert.equal(author.authoringSourceHash,proof.authorSourceHash);
    assert.equal(author.compiledSourceHash,proof.first.sourceHash);
    assert.equal(author.dependencyLockId,proof.first.lockId);
    assert.equal(saved.contentHash,createHash('sha256').update(saved.sourceUtf8).digest('hex'));
    proof.savedRevision={...saved,authoringSourceHash:author.authoringSourceHash,
      compiledSourceHash:author.compiledSourceHash,dependencyLockId:author.dependencyLockId};
    proof.savedRun = await execute(proof.repeat.runId);
    assert.equal(proof.savedRun.sourceHash,saved.contentHash,
      'restored author source must execute the exact saved revision bytes');
    assert.equal(proof.savedRun.lockId,proof.first.lockId);
    proof.savedRun.exactSavedBytes=proof.savedRun.sourceHash===saved.contentHash;
    // A real input of the saved executable independently checks the fixed bytes.
    await type('document.querySelector("#script-source")',saved.sourceUtf8);
    await type('document.querySelector("#script-params")','{}');
    proof.fixedRun=await execute(proof.savedRun.runId);
    assert.equal(proof.fixedRun.sourceHash,saved.contentHash);
    assert.equal(proof.fixedRun.durable.run.revision.sourceHash,saved.contentHash);
    if(process.env.OPENDESK_R78_SCHEDULE==='1'){
      const {runR78D3ScheduledCycle}=await import('./controller-d3-scheduled-r78-cft-cycle.mjs');
      await runR78D3ScheduledCycle({sidebar,website,browser,until,clickReal,type,read,report},proof);
    }
    const output=process.env.OPENDESK_DEV_EVIDENCE;
    if(output)for(const [label,session] of [['sidebar',sidebar],['website',website.session]]){
      const shot=await session.call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'r78-'+label+'.png'),Buffer.from(shot.data,'base64'));
    }
    const stopSource=SOURCE.replace('  const url = await page.url();',
      "  await page.locator('#r78-never-created').waitFor({state:'visible', timeout:120000});\n  const url = await page.url();");
    await type('document.querySelector("#script-source")',stopSource);
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    const beforeStop=await observePage();
    await until(()=>read('!document.querySelector("#script-run").disabled'), 'changed source Run ready');
    await clickReal(sidebar,'document.querySelector("#script-run")');
    const stopRunId=await until(async()=>{
      const id=await read('document.querySelector("#script-run-id")?.value');
      if(!id||id===proof.fixedRun.runId)return null;
      const rows=await durable(id);
      return rows.some(r=>r.tag==='controller-run'&&r.runId===id&&r.state==='running')?id:null;
    }, 'changed source admitted to original Controller Worker');
    proof.stopObservation={runId:stopRunId,requestedAt:Date.now()};
    await until(()=>read('!document.querySelector("#script-stop").disabled'), 'Stop enabled');
    await clickReal(sidebar,'document.querySelector("#script-stop")');
    const stopRecords=await until(async()=>{
      const rows=await durable(stopRunId),run=rows.find(r=>r.tag==='controller-run'&&r.runId===stopRunId);
      const result=rows.find(r=>r.tag==='controller-result'&&r.resultId===run?.resultId);
      proof.stopObservation.records={run,result};
      proof.stopObservation.observedAt=Date.now();
      return run?.retirementState==='released'&&result?{run,result}:null;
    }, 'Stop terminal Durable Result and release',45000);
    assert.equal(stopRecords.run.state,'stopped');
    assert.equal(stopRecords.result.outcome.ok,false);
    assert.equal(stopRecords.result.revision.sourceHash,stopRecords.run.revision.sourceHash);
    assert.notEqual(stopRecords.run.revision.sourceHash,proof.savedRun.sourceHash);
    assert.equal((await observePage()).count,beforeStop.count,'Stop wait source never submits a search');
    proof.stop={runId:stopRunId,resultId:stopRecords.result.resultId,records:stopRecords,
      authorSourceHash:createHash('sha256').update(stopSource).digest('hex'),unchangedSearchCount:beforeStop.count};
    proof.packageAfter=await packageFingerprint(packageRoot);
    assert.equal(proof.packageAfter.packageHash,proof.packageBefore.packageHash,
      'ChromePage/D3 evidence requires stable actual loaded package bytes');
    proof.status = 'CHROME_PASS_R78_CHROMEPAGE_D3';
  } catch(error) {
    proof.status='CHROME_FAIL';
    proof.error={code:error.code||'E_R78_CHROMEPAGE_D3',message:String(error.message||error)};
    throw error;
  }
}
