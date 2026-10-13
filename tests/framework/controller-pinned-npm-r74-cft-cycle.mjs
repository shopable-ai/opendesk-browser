// R7.4 actual Chrome Developer ESM: ordinary JavaScript pinned npm import.
// No @opendesk directive or globalThis access. It MUST reach the same
// RunHost -> Authority -> opaque Worker and return the authentic mitt result.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const MITT_ESM_URL='https://cdn.jsdelivr.net/npm/mitt@3.0.1/+esm';
const PROGRAM='r74-controller-mitt-standard-import';
const SOURCE=[
  "import mitt from 'mitt@3.0.1';",
  'export default async function main() {',
  '  const bus = mitt();',
  '  const events = [];',
  '  bus.on("message", value => events.push(value));',
  '  bus.emit("message", "OpenDesk:21");',
  '  return {events, count:events.length, title:await page.title()};',
  '}'
].join('\n');
const authorSourceHash=createHash('sha256').update(SOURCE).digest('hex');

export async function runR74ControllerPinnedNpmCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests}){
  const proof={caseId:'D04-EXT-R74-NORMAL-NPM-IMPORT-MITT',world:'CONTROLLER',
    programId:PROGRAM,sourceUrl:MITT_ESM_URL,authorSourceHash,status:'IN_PROGRESS'};
  report.tests.push(proof);
  async function execute(label,priorRunId){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>read('!document.querySelector("#script-run").disabled'),
      'pinned npm import permission check and Run enabled',45000);
    await clickReal(sidebar,'document.querySelector("#script-run")');
    const receipt=await until(async()=>{
      const r=await read('(()=>{const s=document.querySelector("#script-status");'+
        'return {state:s?.dataset.state,message:s?.textContent,runId:document.querySelector("#script-run-id")?.value,'+
        'output:document.querySelector("#script-result")?.textContent,'+
        'version:document.querySelector("#script-task-version")?.textContent}})()');
      if(r.state==='error')throw Error(r.message);
      return r.state==='results'&&r.runId&&r.runId!==priorRunId&&r.output?.includes('OpenDesk:21')?r:null;
    },'actual mitt 3.0.1 event function invoked in opaque Controller Worker',90000);
    assert.match(receipt.output,/OpenDesk:21/);
    assert.match(receipt.output,/"count":\s*1/);
    assert.match(receipt.version,/[a-f0-9]{64}/);
    const resultId=await until(()=>read('(()=>{const id='+JSON.stringify(receipt.runId)+
      ';return [...(document.querySelector("#script-download-result")?.options||[])]'+
      '.find(o=>o.value&&o.textContent.includes(id))?.value||null})()'),
      'durable resultId after actual Worker completion',20000);
    return {runId:receipt.runId,resultId,sourceHash:receipt.version.match(/[a-f0-9]{64}/)[0],
      output:receipt.output};
  }
  try{
    await type('document.querySelector("#script-id")',PROGRAM);
    await type('document.querySelector("#script-source")',SOURCE);
    assert.equal(observedRequests.length,0,'typing code must not fetch a library');
    const first=await execute('first',null);
    const count=observedRequests.length;
    assert(count>0,'first Run must fetch exactly pinned real ESM source');
    assert(observedRequests.every(x=>x.method==='GET'&&x.url.startsWith(MITT_ESM_URL)));
    const second=await execute('repeat',first.runId);
    assert.notEqual(first.runId,second.runId);
    assert.notEqual(first.resultId,second.resultId);
    assert.equal(first.sourceHash,second.sourceHash);
    assert.equal(observedRequests.length,count,'repeat Run must add zero CDN requests');
    await until(()=>read('!document.querySelector("#script-save").disabled'),
      'fixed npm source Save enabled',15000);
    await clickReal(sidebar,'document.querySelector("#script-save")');
    const saved=await until(async()=>{
      const s=await read('(()=>{const el=document.querySelector("#script-status");return {state:el?.dataset.state,text:el?.textContent}})()');
      if(s.state==='error')throw Error(s.text);
      return s.state==='saved'&&/r\d+/.test(s.text||'')?s.text:null;
    },'persist pinned ordinary npm import revision',40000);
    // New R7.6 author input: the same exact module, without a version in JS.
    // Resolve from the fixed browser catalog and reuse the original SHA bytes.
    const bareProgram='r76-controller-mitt-bare';
    const bareSource=SOURCE.replace("from 'mitt@3.0.1'","from 'mitt'");
    await type('document.querySelector("#script-id")',bareProgram);
    await type('document.querySelector("#script-source")',bareSource);
    const bare=await execute('bare-package-name',second.runId);
    assert.equal(observedRequests.length,count,'bare package alias must share exact cached URL/SHA, with zero new downloads');
    assert.notEqual(bare.sourceHash,first.sourceHash,'source revision identity includes the bare author import');
    await until(()=>read('!document.querySelector("#script-save").disabled'),'bare Controller Save enabled',15000);
    await clickReal(sidebar,'document.querySelector("#script-save")');
    const bareSaved=await until(async()=>{
      const s=await read('(()=>{const el=document.querySelector("#script-status");return {state:el?.dataset.state,text:el?.textContent}})()');
      if(s.state==='error')throw Error(s.text);
      return s.state==='saved'&&/r\d+/.test(s.text||'')?s.text:null;
    },'persist bare npm import revision',40000);
    proof.first=first;proof.repeat=second;proof.save=saved;
    proof.bare={programId:bareProgram,authorSourceHash:createHash('sha256').update(bareSource).digest('hex'),
      run:bare,savedRevision:bareSaved,newNetworkRequests:0};
    proof.network={firstRequests:count,repeatRequests:0,bareRequests:0};
    proof.result={events:['OpenDesk:21'],count:1};
    proof.status='CHROME_PASS_R76_PINNED_AND_BARE_NPM';
  }catch(error){
    proof.status='CHROME_FAIL';proof.error={code:error.code||'E_R74_NPM_IMPORT',message:String(error.message||error)};
    throw error;
  }
}
