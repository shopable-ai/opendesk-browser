// D02/D03 — real Chrome: Run once per program, auto SHA lock, no manual approval or simulated RPC.
import assert from 'node:assert/strict';
import {CSV_BASE,runR72ControllerCsvCycle} from './controller-dependency-r72-cft-cycle.mjs';
import {CLASSIC_URL,runR73ControllerClassicCycle} from './controller-classic-r73-cft-cycle.mjs';
import {MITT_ESM_URL,runR74ControllerPinnedNpmCycle} from './controller-pinned-npm-r74-cft-cycle.mjs';
const URL='https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js';
export const D3_ESM_URL='https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const D3_ESM_SOURCE=[
  "import max from '"+D3_ESM_URL+"';",
  'export default async function main() {',
  '  const result = max([2, 5, 3]);',
  '  document.body.dataset.opendeskImportResult = String(result);',
  '  return result;',
  '}'
].join('\n');
const CODE=['// ==UserScript==','// @name R7.2 fixed marked test','// @require '+URL,
'// ==/UserScript==','async function main(){const html=globalThis.marked?.parse("**OpenDesk**");',
'if(!html?.includes("<strong>OpenDesk</strong>"))throw Error("E_REAL_MARKED");',
'return {library:"marked@15.0.12",html};}'].join('\n');
export async function runR72PageClassicCycle({sidebar,website,browser,base,extensionId,cdp,until,clickReal,report}){
  const proof={caseId:'D02/D03-R72-ONE-CLICK-AB',url:URL,world:'USER_SCRIPT',steps:[],status:'IN_PROGRESS'},
    observed=[],observedCsv=[],observedClassic=[],observedNpm=[],observD3=[];
  report.tests.push(proof);
  const read=x=>sidebar.read(x);
  const status=id=>read('(function(){const el=document.getElementById('+JSON.stringify(id)+');return {state:el?.dataset?.state,text:el?.textContent}})()');
  const step=(name,value)=>proof.steps.push({name,value});
  async function type(selector,value){
    assert.equal(await read('(function(){const el='+selector+';if(!el||el.disabled)return false;el.focus();el.select();return true})()'),true);
    await sidebar.call('Input.insertText',{text:value});
    await until(()=>read(selector+'.value==='+JSON.stringify(value)),'real editor input',15000);
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
      if(url?.startsWith(URL))observed.push(url);
      if(url?.startsWith(CSV_BASE))observedCsv.push({url,method:e.request.method});
      if(url?.startsWith(CLASSIC_URL))observedClassic.push({url,method:e.request.method});
      if(url?.startsWith(MITT_ESM_URL))observedNpm.push({url,method:e.request.method});
      if(url?.startsWith(D3_ESM_URL))observD3.push({url,method:e.request.method});
    });
    await observer.call('Network.enable');
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
      await runR76PageESMCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observD3});
      await runR72ControllerCsvCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observedCsv});
      await runR74ControllerPinnedNpmCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests:observedNpm});
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
  const proof={caseId:'R76-PAGE-URL-ESM-D3-DOM',world:'USER_SCRIPT',
    url:D3_ESM_URL,programId:'r76-page-esm-d3',status:'IN_PROGRESS'};
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
    assert.equal(Number(result.value),5,'must return the real upstream d3-array max result');
    const dom=await until(()=>website.session.read('document.body.dataset.opendeskImportResult'),
      'real Page document body dataset updated',20000);
    assert.equal(dom,'5');
    const receipt=JSON.parse(await read('document.querySelector("#page-preview-technical").textContent'));
    assert.equal(receipt.state,'preview-evaluated');
    assert.equal(receipt.world,'USER_SCRIPT');
    assert.match(receipt.sourceHash,/^[a-f0-9]{64}$/);
    return {sourceHash:receipt.sourceHash,tabId:receipt.tabId,documentId:receipt.documentId,
      returnValue:result.value,dom};
  }
  try{
    await type('document.querySelector("#script-id")',proof.programId);
    await type('document.querySelector("#script-source")',D3_ESM_SOURCE);
    assert.equal(observedRequests.length,0,'typing import cannot download D3');
    const first=await run('first'),requestCount=observedRequests.length;
    assert(requestCount>0,'first genuine Page Run must fetch the pinned D3 source');
    assert(observedRequests.every(row=>row.method==='GET'&&row.url.startsWith(D3_ESM_URL)));
    const repeat=await run('repeat');
    assert.equal(repeat.sourceHash,first.sourceHash,'second Run must use the exact same compiled bytes');
    assert.equal(observedRequests.length,requestCount,'second Page Run must download zero new bytes');
    await until(()=>read('!document.querySelector("#page-candidate-save").disabled'),
      'fixed Page ESM Candidate Save enabled',15000);
    await clickReal(sidebar,'document.querySelector("#page-candidate-save")');
    const saved=await until(async()=>{
      const state=await read('(()=>{const el=document.querySelector("#page-candidate-status");'+
        'return {state:el?.dataset.state,text:el?.textContent}})()');
      if(state.state==='error')throw Error(state.text);
      return /已保存 Page Candidate/.test(state.text||'')?state.text:null;
    },'saved Page ESM author and compiled source candidate',40000);
    proof.first=first;proof.repeat=repeat;
    proof.network={firstRequests:requestCount,repeatRequests:0};
    proof.saved=saved;proof.status='CHROME_PASS_R76_PAGE_ESM_D3';
  }catch(error){
    proof.status='CHROME_FAIL';proof.error={code:error.code||'E_R76_PAGE_ESM',message:String(error.message||error)};
    throw error;
  }
}
