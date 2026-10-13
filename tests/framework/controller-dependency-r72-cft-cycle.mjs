// R7.3 D04 — actual Chrome Side Panel Run -> Authority -> opaque Controller
// Worker; authentic @vanillaes/csv@4.1.3 bytes (3 upstream ESM files).
// Browser CDP performs only read-only observation and real input gestures.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const CSV_BASE='https://raw.githubusercontent.com/vanillaes/csv/v4.1.3/src/';
const FILES=Object.freeze({
  'index.js':{sha256:'2bd2f3a102328c7defa541f475353ee6103aeba24143d70d734f22eeb683d734',bytes:114},
  'parse.js':{sha256:'9bc0f8f634de34595afb4d98bf9eb28a49e8b20572420f4d4a8d549258e0abc5',bytes:4528},
  'stringify.js':{sha256:'87886528603713273df58183ded8b40a22dd8f0f6645e287b759a0631c81c9a9',bytes:1913}
});
const PROGRAM='r72-controller-csv';
const SOURCE=[
  '// @opendesk-import @vanillaes/csv '+CSV_BASE+'index.js',
  "import {parse} from '@vanillaes/csv';",
  'export default async function main() {',
  "  const rows=parse('name,price\\nBook,18\\nPen,3');",
  '  const [, ...items]=rows;',
  '  return {count:items.length,',
  '    total:items.reduce((n,row)=>n+Number(row[1]),0),',
  '    title:await page.title()};',
  '}'
].join('\n');
const sourceHash=createHash('sha256').update(SOURCE).digest('hex');

export async function runR72ControllerCsvCycle({sidebar,website,browser,until,clickReal,type,read,report,observedRequests}){
  const proof={caseId:'D04-R73-CONTROLLER-ESM-REAL-CSV',world:'CONTROLLER',programId:PROGRAM,
    sourceUrl:CSV_BASE+'index.js',authorSourceHash:sourceHash,status:'IN_PROGRESS'};
  report.tests.push(proof);
  async function fixedLock(){
    return read('(async()=>{const matches=[];for(const info of await indexedDB.databases()){'+
      'if(!info.name)continue;const db=await new Promise((ok,bad)=>{const q=indexedDB.open(info.name);q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});'+
      'try{if(!db.objectStoreNames.contains("frameworkKV"))continue;const rows=await new Promise((ok,bad)=>{'+
      'const q=db.transaction("frameworkKV","readonly").objectStore("frameworkKV").getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});'+
      'for(const r of rows)if(r.tag==="component-esm-lock-v1"&&r.manifest?.programId==='+JSON.stringify(PROGRAM)+')'+
      'matches.push({lockId:r.lockId,world:r.manifest.world,entries:r.entries?.map(e=>({url:e.url,sha256:e.sha256,bytes:e.bytes}))});'+
      '}finally{db.close()}}return matches})()');
  }
  async function execute(label,previousRunId){
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>read('!document.querySelector("#script-run").disabled'),
      'actual Controller ESM Run enabled after static source permission inspection',45000);
    await clickReal(sidebar,'document.querySelector("#script-run")');
    const receipt=await until(async()=>{
      const state=await read('(()=>{const s=document.querySelector("#script-status");'+
        'return {state:s?.dataset.state,text:s?.textContent,runId:document.querySelector("#script-run-id")?.value,'+
        'result:document.querySelector("#script-result")?.textContent,source:document.querySelector("#script-task-version")?.textContent}})()');
      if(state.state==='error')throw Error(state.text);
      if(state.state!=='results'||!state.runId||state.runId===previousRunId||
        !state.result?.includes('"count"'))return null;
      return state;
    },label+' durable Controller Result after real Worker',90000);
    assert.match(receipt.result,/"count":\s*2/);
    assert.match(receipt.result,/"total":\s*21/);
    assert.match(receipt.source,/[a-f0-9]{64}/);
    assert(/^[-\w]+$/.test(receipt.runId),label+' needs a native runId');
    const resultId=await until(()=>read('(()=>{const runId='+JSON.stringify(receipt.runId)+
      ';return [...(document.querySelector("#script-download-result")?.options||[])]'+
      '.find(o=>o.value&&o.textContent.includes(runId))?.value||null})()'),
      label+' durable resultId',20000);
    return {runId:receipt.runId,resultId,sourceHash:receipt.source.match(/[a-f0-9]{64}/)[0],
      resultText:receipt.result};
  }
  try{
    await type('document.querySelector("#script-id")',PROGRAM);
    await type('document.querySelector("#script-source")',SOURCE);
    assert.equal(observedRequests.length,0,'typing static ESM must not fetch');
    const first=await execute('first',null);
    const expectedUrls=Object.keys(FILES).map(name=>CSV_BASE+name).sort();
    assert.deepEqual([...new Set(observedRequests.map(x=>x.url))].sort(),expectedUrls,
      'Chrome must fetch exactly the three original upstream ESM source URLs');
    assert(observedRequests.every(x=>x.method==='GET'),'raw upstream module requests must use GET');
    const actual=await until(async()=>{const locks=await fixedLock();return locks.length?locks:null;},
      'real persisted Controller dependency graph',30000);
    assert.equal(actual.length,1,'one fixed Controller owner/version lock');
    assert.match(actual[0].lockId,/^component-lock-[a-f0-9]{64}$/);
    assert.equal(actual[0].world,'CONTROLLER');
    assert.deepEqual(actual[0].entries.map(x=>x.url).sort(),expectedUrls);
    for(const row of actual[0].entries){
      const expected=FILES[row.url.slice(CSV_BASE.length)];
      assert(expected,'unexpected graph URL '+row.url);
      assert.equal(row.sha256,expected.sha256,'original upstream SHA must match '+row.url);
      assert.equal(row.bytes,expected.bytes,'raw byte length must match '+row.url);
    }
    const firstCount=observedRequests.length;
    const second=await execute('repeat',first.runId);
    assert.equal(observedRequests.length,firstCount,'repeat Run reuses the original SHA assets and downloads zero bytes');
    assert.notEqual(first.runId,second.runId);
    assert.notEqual(first.resultId,second.resultId);
    assert.equal(first.sourceHash,second.sourceHash,'same executable bytes for repeated fixed source');
    await until(()=>read('!document.querySelector("#script-save").disabled'),
      'fixed Controller source Save enabled',15000);
    await clickReal(sidebar,'document.querySelector("#script-save")');
    const saved=await until(async()=>{
      const status=await read('(()=>{const s=document.querySelector("#script-status");return {state:s.dataset.state,text:s.textContent}})()');
      return status.state==='error'?{error:status.text}:status.state==='saved'?{saved:status.text}:null;
    },'saved immutable Controller program revision',40000);
    assert(!saved.error,saved.error||'');
    assert.match(saved.saved,/r\d+/);
    proof.status='CHROME_PASS_D04_CONTROLLER_CSV';
    proof.exports={count:2,total:21};
    proof.first=first;proof.second=second;
    proof.lock=actual[0];proof.sourceRequests={first:firstCount,second:0};
    proof.savedRevision=saved.saved;
  }catch(cause){proof.status='CHROME_FAIL';proof.error={code:cause.code||'E_R72_CONTROLLER',message:String(cause.message||cause)};throw cause;}
}
