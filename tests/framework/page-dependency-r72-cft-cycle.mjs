// D02/D03 — real Chrome: Run once per program, auto SHA lock, no manual approval or simulated RPC.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CSV_BASE,runR72ControllerCsvCycle} from './controller-dependency-r72-cft-cycle.mjs';
import {CLASSIC_URL,runR73ControllerClassicCycle} from './controller-classic-r73-cft-cycle.mjs';
import {MITT_ESM_URL,runR74ControllerPinnedNpmCycle} from './controller-pinned-npm-r74-cft-cycle.mjs';
const MARKED_URL='https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js';
export const D3_ESM_URL='https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const D3_ESM_SOURCE=fs.readFileSync(new URL('../../examples/programs/single-file/page-d3-max-esm.js',import.meta.url),'utf8');
const CODE=['// ==UserScript==','// @name R7.2 fixed marked test','// @require '+MARKED_URL,
'// ==/UserScript==','async function main(){const html=globalThis.marked?.parse("**OpenDesk**");',
'if(!html?.includes("<strong>OpenDesk</strong>"))throw Error("E_REAL_MARKED");',
'return {library:"marked@15.0.12",html};}'].join('\n');
export async function runR72PageClassicCycle({sidebar,website,browser,base,extensionId,cdp,until,clickReal,report}){
  const proof={caseId:'D02/D03-R72-ONE-CLICK-AB',url:MARKED_URL,world:'USER_SCRIPT',steps:[],status:'IN_PROGRESS'},
    observed=[],observedCsv=[],observedClassic=[],observedNpm=[],observD3=[];
  if(process.env.OPENDESK_R77_IMPORT_SCENARIOS!=='d3')report.tests.push(proof);
  const read=x=>sidebar.read(x);
  const status=id=>read('(function(){const el=document.getElementById('+JSON.stringify(id)+');return {state:el?.dataset?.state,text:el?.textContent}})()');
  const step=(name,value)=>proof.steps.push({name,value});
  async function type(selector,value){
    await clickReal(sidebar,selector);
    for(const kind of ['keyDown','keyUp'])await sidebar.call('Input.dispatchKeyEvent',{
      type:kind,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:process.platform==='darwin'?4:2,
      commands:kind==='keyDown'?['selectAll']:undefined});
    await sidebar.call('Input.insertText',{text:value});
    await until(()=>read(selector+'.value==='+JSON.stringify(value)),'real editor input '+selector,15000);
  }
  async function verifiedLock(label){
    const fixed=await until(async()=>{
      const s=await status('page-preview-status');
      if(s.state==='error')throw Error(s.text);
      const data=await read('(function(){const sel=document.querySelector("#page-dependency-lock"),list=document.querySelector("#page-dependency-list");return {lockId:[...(sel?.options||[])].map(o=>o.value).find(x=>/^dep-lock-[a-f0-9]{64}$/.test(x))||null,sha:[...(list?.querySelectorAll("option")||[])].map(o=>/^(?:cache|shared):([a-f0-9]{64})$/.exec(o.value)?.[1]).find(Boolean)||null}})()');
      return data?.lockId&&data?.sha?data:null;
    },'auto-pinned SHA + program-scoped lock for '+label,30000);
    step(label+'-auto-lock',fixed);
    return fixed;
  }
  async function runAndSave(label){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    if(!await read('document.querySelector("#page-preview-tools").open'))
      await clickReal(sidebar,'document.querySelector("#page-preview-tools > summary")');
    await until(()=>read('!document.querySelector("#page-preview-run").disabled'),'run enabled',20000);
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const outcome=await until(async()=>{
      const s=await status('page-preview-status');
      return s.state==='error'?{error:s.text}:
        s.state==='completed'?{value:await read('document.querySelector("#page-preview-result").textContent')}:null;
    },'real library invocation',60000);
    assert(!outcome.error,outcome.error||'');
    assert.match(outcome.value,/<strong>OpenDesk<\/strong>/);
    const receipt=JSON.parse(await read('document.querySelector("#page-preview-technical").textContent'));
    assert.equal(receipt.state,'preview-evaluated');assert.equal(receipt.world,'USER_SCRIPT');
    step(label+'-run',{result:outcome.value,sourceHash:receipt.sourceHash,tabId:receipt.tabId,documentId:receipt.documentId});
    await until(()=>read('!document.querySelector("#page-candidate-save").disabled'),'candidate Save button',12000);
    await clickReal(sidebar,'document.querySelector("#page-candidate-save")');
    const saved=await until(async()=>{
      const s=await status('page-candidate-status');
      return s.state==='error'?{error:s.text}:
        /已保存 Page Candidate/.test(s.text||'')?{receipt:s.text}:null;
    },'frozen saved Page Candidate',35000);
    assert(!saved.error,saved.error||'');
    step(label+'-save',saved.receipt);
  }
  let observer;
  try{
    const targets=await(await fetch(base+'/json/list')).json();
    const sw=targets.find(x=>x.type==='service_worker'&&x.url?.startsWith('chrome-extension://'+extensionId+'/')&&x.webSocketDebuggerUrl);
    assert(sw,'actual background network observer required');
    observer=await cdp(sw.webSocketDebuggerUrl);
    observer.on('Network.requestWillBeSent',e=>{
      const url=e?.request?.url;
      if(url?.startsWith(MARKED_URL))observed.push(url);
      if(url?.startsWith(CSV_BASE))observedCsv.push({url,method:e.request.method});
      if(url?.startsWith(CLASSIC_URL))observedClassic.push({url,method:e.request.method});
      if(url?.startsWith(MITT_ESM_URL))observedNpm.push({url,method:e.request.method});
      if(url?.startsWith(D3_ESM_URL))observD3.push({url,method:e.request.method});
    });
    await observer.call('Network.enable');
    if(process.env.OPENDESK_R77_IMPORT_SCENARIOS==='d3'){
      await runR76PageESMCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observD3});
      await runR77ControllerD3Cycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observD3});
      return;
    }
    if(!await read('document.querySelector("#script-library-tools").open'))
      await clickReal(sidebar,'document.querySelector("#script-library-tools > summary")');
    await type('document.querySelector("#script-id")','r72-marked-a');
    await type('document.querySelector("#script-source")',CODE);
    assert.equal(observed.length,0,'mere editor inspection must not fetch');
    await runAndSave('program-a');
    const a=await verifiedLock('program-a');
    const fetched=observed.length;
    assert(fetched>0,'A must fetch the new pinned version on real Chrome');
    await type('document.querySelector("#script-id")','r72-marked-b');
    await runAndSave('program-b');
    const b=await verifiedLock('program-b');
    assert.equal(b.sha,a.sha,'B must reuse exact SHA bytes');
    assert.notEqual(b.lockId,a.lockId,'B must receive an independent technical lock');
    assert.equal(observed.length,fetched,'B must produce zero additional CDN downloads');
    proof.sha256=a.sha;proof.programLocks={a:a.lockId,b:b.lockId};
    proof.network={firstProgramRequests:fetched,secondProgramRequests:0};
    proof.status='CHROME_PASS_R72_ONE_CLICK_AB';
    await runR73ControllerClassicCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observedClassic});
    if(process.env.OPENDESK_R245_STANDARD_SMOKE!=='1'){
      if(process.env.OPENDESK_R77_IMPORT_SCENARIOS!=='classic'){
        await runR76PageESMCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observD3});
        await runR72ControllerCsvCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observedCsv});
      }
      await runR74ControllerPinnedNpmCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observedNpm});
      if(process.env.OPENDESK_R78_ALL_SCENARIOS==='1'&&process.env.OPENDESK_R77_IMPORT_SCENARIOS==='classic')
        await runR76PageESMCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observD3});
    }
  }catch(error){
    if(proof.status!=='CHROME_PASS_R72_ONE_CLICK_AB'){
      proof.status='CHROME_FAIL';
      proof.error={code:error.code||'E_R72_NATIVE',message:String(error.message||error)};
    }
    proof.networkObservedRequests=observed.length;
    throw error;
  }finally{observer?.close();}
}

async function runR76PageESMCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests}){
  const initialRequests=observedRequests.length;
  const proof={caseId:'R76-PAGE-URL-ESM-D3-DOM',world:'USER_SCRIPT',
    url:D3_ESM_URL,programId:'r76-page-esm-d3',authorSourceHash:createHash('sha256').update(D3_ESM_SOURCE).digest('hex'),status:'IN_PROGRESS'};
  report.tests.push(proof);
  async function run(label){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>read('!document.querySelector("#page-preview-run").disabled'),
      'Page ESM ready after native source-permission check',45000);
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const result=await until(async()=>{
      const state=await read('(()=>{const s=document.querySelector("#page-preview-status");'+
        'return {state:s?.dataset.state,text:s?.textContent,value:document.querySelector("#page-preview-result")?.textContent}})()');
      if(state.state==='error')throw Error(state.text);
      return state.state==='completed'?state:null;
    },'real Page USER_SCRIPT ESM function result '+label,90000);
    const actual=JSON.parse(result.value);
    assert.deepEqual(actual,{world:'USER_SCRIPT',value:5,success:true},'must return the real upstream d3-array max result');
    const dom=await until(()=>website.session.read('document.querySelector("#od-import-proof")?.textContent'),
      'real Page document body dataset updated',20000);
    assert.equal(dom,'Page D3 max = 5');
    assert.equal(await website.session.read('document.querySelectorAll("#od-import-proof").length'),1);
    const receipt=JSON.parse(await read('document.querySelector("#page-preview-technical").textContent'));
    assert.equal(receipt.state,'preview-evaluated');
    assert.equal(receipt.world,'USER_SCRIPT');
    assert.match(receipt.sourceHash,/^[a-f0-9]{64}$/);
    assert(receipt.receiptNonce,'ordinary Page receipt nonce is required');
    assert(receipt.documentId,'Page result must bind the actual document');
    return {receiptNonce:receipt.receiptNonce,sourceHash:receipt.sourceHash,tabId:receipt.tabId,documentId:receipt.documentId,
      returnValue:result.value,dom};
  }
  try{
    await type('document.querySelector("#script-id")',proof.programId);
    await type('document.querySelector("#script-source")',D3_ESM_SOURCE);
    assert.equal(observedRequests.length,initialRequests,'typing import cannot download D3');
    const first=await run('first'),requestCount=observedRequests.length;
    assert(requestCount>initialRequests,'first genuine Page Run must prepare D3 in its own execution world');
    assert(observedRequests.every(row=>row.method==='GET'&&row.url.startsWith(D3_ESM_URL)));
    const repeat=await run('repeat');
    assert.equal(repeat.sourceHash,first.sourceHash,'second Run must use the exact same compiled bytes');
    assert.notEqual(repeat.receiptNonce,first.receiptNonce,'each Run needs a fresh receipt');
    assert.equal(repeat.documentId,first.documentId);assert.equal(repeat.tabId,first.tabId);
    assert.equal(observedRequests.length,requestCount,'second Page Run must download zero new bytes');
    await until(()=>read('!document.querySelector("#page-candidate-save").disabled'),
      'fixed Page ESM Candidate Save enabled',15000);
    await clickReal(sidebar,'document.querySelector("#page-candidate-save")');
    const saved=await until(async()=>{
      const state=await read('(()=>{const el=document.querySelector("#page-candidate-status");'+
        'return {state:el?.dataset.state,text:el?.textContent}})()');
      if(state.state==='error')throw Error(state.text);
      return /已保存 Page Candidate/.test(state.text||'')&&state.text.includes(proof.programId)?state.text:null;
    },'saved Page ESM author and compiled source candidate',40000);
    proof.first=first;proof.repeat=repeat;
    proof.network={priorScenarioRequests:initialRequests,firstRequests:requestCount-initialRequests,repeatRequests:0};
    proof.saved=saved;
    await until(()=>read('!document.querySelector("#script-load").disabled'),'Page Candidate save released editor');
    await clickReal(sidebar,'document.querySelector("#page-program-load")');
    await until(()=>read('document.querySelector("#page-program-status").textContent.includes("已载入固定 Page 源码")'), 'saved Page load completed');
    await until(async()=>(await read('document.querySelector("#script-source").value'))===D3_ESM_SOURCE,'saved Page author source restored');
    proof.restored=await run('restored Candidate');
    assert.equal(proof.restored.sourceHash,first.sourceHash);
    assert.notEqual(proof.restored.receiptNonce,repeat.receiptNonce);
    assert.equal(proof.restored.documentId,first.documentId);assert.equal(proof.restored.tabId,first.tabId);
    assert.equal(observedRequests.length,requestCount,'restored Candidate must reuse fixed bytes');
    proof.persisted=await readR77Records(read,proof.programId);
    await clickReal(sidebar,'document.querySelector("#page-program-verify")');
    await until(()=>read('!document.querySelector("#page-program-install").disabled'),'same frozen Page Candidate verified',45000);
    await clickReal(sidebar,'document.querySelector("#page-program-install")');
    await until(()=>read('document.querySelector("#page-program-status").textContent.includes("已安装并授权")'),'fixed Page installation registered',45000);
    proof.installedRecords=await readR77Records(read,proof.programId);
    await website.session.call('Page.reload');
    proof.installedDom=await until(()=>website.session.read('document.querySelector("#od-import-proof")?.textContent'),'installed frozen D3 executes on matching document',30000);
    assert.equal(proof.installedDom,'Page D3 max = 5');
    assert.equal(observedRequests.length,requestCount,'installed source must use frozen local bytes');
    await website.session.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:500,y:500,deltaY:50000,deltaX:0});
    await until(()=>website.session.read('(()=>{const r=document.querySelector("#od-import-proof")?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=innerHeight})()'),'actual Page D3 output visible for screenshot');
    proof.status='CHROME_PASS_R76_PAGE_ESM_D3';
    for(const [session,name] of [[sidebar,'page-sidebar'],[website.session,'page-document']]){
      const shot=await session.call('Page.captureScreenshot',{format:'png'});
      if(process.env.OPENDESK_DEV_EVIDENCE)fs.writeFileSync(process.env.OPENDESK_DEV_EVIDENCE+'/'+name+'.png',Buffer.from(shot.data,'base64'));
    }
    await clickReal(sidebar,'document.querySelector("#page-program-toggle")');
    await until(()=>read('document.querySelector("#page-program-status").textContent.includes("已停用后续自动执行")'),'installed Page disabled');
    await website.session.call('Page.reload');
    await until(()=>website.session.read('document.readyState==="complete"'),'disabled document loaded');
    await new Promise(resolve=>setTimeout(resolve,700));
    assert.equal(await website.session.read('document.querySelector("#od-import-proof")'),null,'disabled Page cannot auto-execute on the next document');
    proof.lifecycle={candidateRestore:'PASS',fixedInstallation:'PASS',matchingDocument:'PASS',disableNextDocument:'PASS',fullBrowserOfflineRestart:'NOT_TESTED'};
  }catch(error){
    proof.status='CHROME_FAIL';proof.error={code:error.code||'E_R76_PAGE_ESM',message:String(error.message||error)};
    throw error;
  }
}

async function runR77ControllerD3Cycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests}){
  const source=fs.readFileSync(new URL('../../examples/programs/single-file/controller-d3-max-esm.js',import.meta.url),'utf8');
  const proof={caseId:'S05-R77-CONTROLLER-D3',programId:'r77-controller-d3',world:'CONTROLLER',
    authorSourceHash:createHash('sha256').update(source).digest('hex'),status:'IN_PROGRESS'};
  report.tests.push(proof);
  async function run(prior){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>read('!document.querySelector("#script-run").disabled'),'D3 Controller Run enabled',45000);
    await clickReal(sidebar,'document.querySelector("#script-run")');
    const outcome=await until(async()=>{
      const row=await read('(()=>{const s=document.querySelector("#script-status");return {state:s?.dataset.state,message:s?.textContent,runId:document.querySelector("#script-run-id")?.value,resultText:document.querySelector("#script-result")?.textContent,version:document.querySelector("#script-task-version")?.textContent}})()');
      if(row.state==='error')return {error:row.message};
      return row.state==='results'&&row.runId&&row.runId!==prior?row:null;
    },'real Controller D3 durable result',90000);
    assert(!outcome.error,outcome.error);
    const value=JSON.parse(outcome.resultText);
    assert.equal(value.value,5);assert.equal(value.success,true);assert.equal(value.world,'CONTROLLER');
    assert.equal(value.title,await website.session.read('document.title'));
    const sourceHash=outcome.version.match(/[a-f0-9]{64}/)?.[0];assert(sourceHash);
    const resultId=await until(()=>read('([...document.querySelector("#script-download-result").options].find(o=>o.value&&o.textContent.includes('+JSON.stringify(outcome.runId)+'))?.value)'), 'D3 result record id');
    const persisted=await until(async()=>{
      const records=await readR77Records(read,proof.programId,outcome.runId);
      const result=records.find(row=>row.value.tag==='controller-result'&&row.value.resultId===resultId)?.value;
      const run=records.find(row=>row.value.tag==='controller-run'&&row.value.runId===outcome.runId)?.value;
      return result&&run?.retirementState==='released'?{records,result,run}:null;
    },'durable Controller result and released Worker');
    assert.equal(persisted.result.revision.sourceHash,sourceHash);
    assert.equal(persisted.result.runId,outcome.runId);
    assert.equal(persisted.result.state,'completed');assert.equal(persisted.result.outcome.ok,true);
    return {runId:outcome.runId,resultId,sourceHash,resultText:outcome.resultText,persisted};
  }
  try{
    await type('document.querySelector("#script-id")',proof.programId);
    await type('document.querySelector("#script-source")',source);
    const before=observedRequests.length;
    proof.first=await run();
    const after=observedRequests.length;
    proof.repeat=await run(proof.first.runId);
    assert.equal(proof.first.sourceHash,proof.repeat.sourceHash);
    assert.equal(observedRequests.length,after,'fixed Controller repeat must not fetch');
    await until(()=>read('!document.querySelector("#script-save").disabled'),'D3 save enabled');
    await clickReal(sidebar,'document.querySelector("#script-save")');
    proof.save=await until(async()=>{
      const s=await read('(()=>{const e=document.querySelector("#script-status");return {state:e?.dataset.state,text:e?.textContent}})()');
      if(s.state==='error')return {error:s.text};return s.state==='saved'?s:null;
    },'D3 immutable Revision saved',40000);
    assert(!proof.save.error,proof.save.error);
    await clickReal(sidebar,'document.querySelector("#script-load")');
    await until(()=>read('document.querySelector("#script-status").dataset.state==="loaded"'),'saved Controller author source loaded');
    proof.savedRecords=await readR77Records(read,proof.programId);
    const revision=await read('Number(document.querySelector("#script-revision").value)');
    const saved=proof.savedRecords.find(row=>row.store==='scriptRevisions'&&row.value.revision===revision)?.value;
    assert(saved?.sourceUtf8,'fixed Controller revision must be durable');
    assert.equal(saved.contentHash,createHash('sha256').update(saved.sourceUtf8).digest('hex'));
    proof.postSaveDraftRun=await run(proof.repeat.runId);
    assert.equal(proof.postSaveDraftRun.sourceHash,saved.contentHash,'verified saved author rerun uses exact persisted executable bytes');
    assert.equal(observedRequests.length,after);
    assert.equal(await website.session.read('typeof window.page'),'undefined');
    proof.network={firstRequests:after-before,repeatRequests:0,postSaveDraftRequests:0,pageRequestsBefore:before};
    proof.lifecycle={savedRevision:'PASS',loadedAuthorDraftRerun:'PASS',installedRevisionRun:'NOT_TESTED',fullBrowserOfflineRestart:'NOT_TESTED'};
    proof.status='CHROME_PASS_R77_CONTROLLER_D3';
    const shot=await sidebar.call('Page.captureScreenshot',{format:'png'});
    if(process.env.OPENDESK_DEV_EVIDENCE)fs.writeFileSync(process.env.OPENDESK_DEV_EVIDENCE+'/controller-sidebar.png',Buffer.from(shot.data,'base64'));
  }catch(error){proof.status='CHROME_FAIL';proof.error={message:error.message};throw error;}
}

// Read-only observation of records produced by the real controls; no test writes.
async function readR77Records(read,programId,runId){
  return read('('+String(async function(programId,runId){
    const rows=[];
    for(const info of await indexedDB.databases()){
      if(!info.name)continue;
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{
        for(const store of ['frameworkKV','scriptHeads','scriptRevisions','runs','results']){
          if(!db.objectStoreNames.contains(store))continue;
          const values=await new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
          for(const value of values){
            if(value.programId===programId||value.scriptId===programId||value.manifest?.programId===programId||value.revision?.scriptId===programId||runId&&value.runId===runId)
              rows.push({database:info.name,store,value});
          }
        }
      }finally{db.close();}
    }
    return rows;
  })+')('+JSON.stringify(programId)+','+JSON.stringify(runId??null)+')');
}
