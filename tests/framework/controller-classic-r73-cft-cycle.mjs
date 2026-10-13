// D05 R7.3 native CFT: freshly downloaded, unbundled Classic UMD in the
// actual opaque Controller Worker via Side Panel Run, RunHost and Authority.
// CDP only observes network/storage; all Run/Save actions use true input.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const CLASSIC_URL='https://cdn.jsdelivr.net/npm/mitt@3.0.1/dist/mitt.umd.js';
const ID_A='r73-controller-mitt-a',ID_B='r73-controller-mitt-b';
const SOURCE=[
  '// @require '+CLASSIC_URL,
  'async function main(){',
  '  const bus=globalThis.mitt();',
  '  const values=[];',
  '  bus.on("message",value=>values.push(value));',
  '  bus.emit("message","OpenDesk:21");',
  '  if(values.length!==1||values[0]!=="OpenDesk:21")throw Error("E_REAL_MITT");',
  '  return {events:values,count:values.length,title:await page.title()};',
  '}'
].join('\n');
const authorSourceHash=createHash('sha256').update(SOURCE).digest('hex');

export async function runR73ControllerClassicCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests}){
  const proof={caseId:'D05-R73-CONTROLLER-CLASSIC-REAL-MITT',world:'CONTROLLER',programIds:[ID_A,ID_B],
    sourceUrl:CLASSIC_URL,authorSourceHash,status:'IN_PROGRESS'};
  report.tests.push(proof);
  async function readLocks(){
    return read('(async()=>{const matches=[];for(const info of await indexedDB.databases()){'+
      'if(!info.name)continue;const db=await new Promise((ok,bad)=>{const q=indexedDB.open(info.name);q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});'+
      'try{if(!db.objectStoreNames.contains("frameworkKV"))continue;const rows=await new Promise((ok,bad)=>{'+
      'const q=db.transaction("frameworkKV","readonly").objectStore("frameworkKV").getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});'+
      'for(const r of rows)if(r.tag==="controller-classic-lock-v1"&&'+
      JSON.stringify([ID_A,ID_B])+'.includes(r.programId))'+
      'matches.push({lockId:r.lockId,programId:r.programId,world:r.world,sourceHash:r.authorSourceHash,'+
      'entries:r.entries?.map(e=>({url:e.url,sha256:e.sha256,byteLength:e.byteLength}))});'+
      '}finally{db.close()}}return matches})()');
  }
  async function execute(label,previousRunId){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>read('!document.querySelector("#script-run").disabled'),
      'Controller Classic origin permission warm and Run enabled',45000);
    await clickReal(sidebar,'document.querySelector("#script-run")');
    const receipt=await until(async()=>{
      const state=await read('(()=>{const s=document.querySelector("#script-status");'+
        'return {state:s?.dataset.state,text:s?.textContent,runId:document.querySelector("#script-run-id")?.value,'+
        'result:document.querySelector("#script-result")?.textContent,source:document.querySelector("#script-task-version")?.textContent}})()');
      if(state.state==='error')throw Error(state.text);
      if(state.state!=='results'||!state.runId||state.runId===previousRunId||
         !state.result?.includes('OpenDesk:21'))return null;
      return state;
    },label+' result from real opaque Worker',90000);
    assert.match(receipt.result,/OpenDesk:21/);
    assert.match(receipt.result,/"count":\s*1/);
    assert.match(receipt.source,/[a-f0-9]{64}/);
    const resultId=await until(()=>read('(()=>{const runId='+JSON.stringify(receipt.runId)+
      ';return [...(document.querySelector("#script-download-result")?.options||[])]'+
      '.find(o=>o.value&&o.textContent.includes(runId))?.value||null})()'),
      label+' durable Result identity',20000);
    return {runId:receipt.runId,resultId,sourceHash:receipt.source.match(/[a-f0-9]{64}/)[0],resultText:receipt.result};
  }
  try{
    await type('document.querySelector("#script-id")',ID_A);
    await type('document.querySelector("#script-source")',SOURCE);
    assert.equal(observedRequests.length,0,'typing must not issue network GET');
    const aFirst=await execute('program-a-first',null);
    const fetched=observedRequests.length;
    assert(fetched>0,'new Classic library must trigger actual first-download traffic');
    const aRepeat=await execute('program-a-repeat',aFirst.runId);
    assert.equal(observedRequests.length,fetched,'same program repeats with zero new downloads');
    assert.equal(aRepeat.sourceHash,aFirst.sourceHash,'same frozen Worker executable bytes');
    assert.notEqual(aFirst.resultId,aRepeat.resultId);
    await until(()=>read('!document.querySelector("#script-save").disabled'),
      'Controller fixed Classic Save enabled',15000);
    await clickReal(sidebar,'document.querySelector("#script-save")');
    const saved=await until(async()=>{
      const row=await read('(()=>{const s=document.querySelector("#script-status");return {state:s?.dataset.state,text:s?.textContent}})()');
      if(row.state==='error')throw Error(row.text);
      return row.state==='saved'&&/r\d+/.test(row.text||'')?row.text:null;
    },'immutable Controller Classic Saved Revision',40000);
    await type('document.querySelector("#script-id")',ID_B);
    const bFirst=await execute('program-b-shared-sha',null);
    assert.equal(observedRequests.length,fetched,
      'new Controller Program must reuse original SHA without second network GET');
    const locks=await until(async()=>{
      const rows=await readLocks();return rows.length===2?rows:null;
    },'two independent Controller Classic program locks',35000);
    assert.equal(new Set(locks.map(r=>r.lockId)).size,2,'one lock per program');
    assert(locks.every(r=>r.world==='CONTROLLER'));
    assert(locks.every(r=>r.sourceHash===authorSourceHash));
    assert(locks.every(r=>r.entries.length===1&&r.entries[0].url===CLASSIC_URL&&
      /^[a-f0-9]{64}$/.test(r.entries[0].sha256)));
    assert.equal(locks[0].entries[0].sha256,locks[1].entries[0].sha256);
    assert.notEqual(bFirst.sourceHash,aFirst.sourceHash,
      'different program lock makes a distinct Worker body identity');
    proof.status='CHROME_PASS_D05_CONTROLLER_CLASSIC';
    proof.verifiedFunction={events:['OpenDesk:21'],count:1};
    proof.programA={first:aFirst,repeat:aRepeat,savedRevision:saved};
    proof.programB=bFirst;proof.locks=locks;
    proof.network={firstProgramRequests:fetched,repeatRequests:0,otherProgramRequests:0};
  }catch(cause){
    proof.status='CHROME_FAIL';proof.error={code:cause.code||'E_R73_CLASSIC',message:String(cause.message||cause)};
    throw cause;
  }
}
