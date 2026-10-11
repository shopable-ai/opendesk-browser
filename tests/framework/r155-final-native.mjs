// Actual WXT Side Panel actions; no execution RPC, synthetic events or Node VM.
// Start/consent/reload/cleanup reuse r15-native-sidebar.mjs. This observer reads
// the original IDB and original API completions, never creates native receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connect,evaluate} from './sidebar-native-session.mjs';

const out=path.resolve(process.env.OPENDESK_R15_NATIVE_EVIDENCE);
const session=JSON.parse(await fs.readFile(path.join(out,'session.json'),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const attempt=Date.now();
const save=(name,value)=>fs.writeFile(path.join(out,attempt+'-'+name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const report={status:'RUNNING',identity:session,cases:[],samples:[],failures:[]};
let client,panel,page,sw;
async function until(work,label,ms=20000){const end=Date.now()+ms;while(Date.now()<end){const v=await work();if(v)return v;await pause(50);}throw Error(label+' timed out');}
async function bind(){
  client=await connect(session.endpoint);
  const targets=(await client.send('Target.getTargets')).targetInfos;
  const attach=async t=>(await client.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;
  sw=await attach(targets.find(t=>t.url===`chrome-extension://${session.extensionId}/sw.js`));
  const contexts=await evaluate(client,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})',sw);
  assert.equal(contexts.length,1);assert.equal(contexts[0].tabId,-1);
  report.sidePanel=contexts[0];
  panel=await attach(targets.find(t=>t.url===contexts[0].documentUrl));
  page=await attach(targets.find(t=>t.targetId===session.page));
}
async function click(selector){
  const expression=selector.startsWith('document.')?selector:`document.querySelector(${JSON.stringify(selector)})`;
  await until(()=>evaluate(client,`(()=>{const n=${expression};return !!n&&!n.disabled&&!!n.getClientRects().length;})()`,panel),'enabled '+selector);
  const object=(await client.send('Runtime.evaluate',{expression},panel)).result;
  await client.send('DOM.scrollIntoViewIfNeeded',{objectId:object.objectId},panel);
  const rect=await evaluate(client,`(()=>{const r=(${expression}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,panel);
  for(const type of ['mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1},panel);
  await client.send('Runtime.releaseObject',{objectId:object.objectId},panel);
}
async function input(source){await click('#script-source');for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},panel);await client.send('Input.insertText',{text:source},panel);assert.equal(await evaluate(client,'document.querySelector("#script-source").value',panel),source);}
const stores=()=>evaluate(client,`(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('opendesk-browser');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});const result={};for(const name of ['runs','results','frameworkKV'])result[name]=await new Promise((r,j)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});db.close();return result;})()`,sw);
const decode=w=>w.type==='object'?Object.fromEntries(w.value.map(([k,v])=>[k,decode(v)])):w.type==='array'?w.value.map(decode):w.value;
const expected={upper:'HELLO',chunks:[[1,2],[3]],date:'2026-10-10'};
const source="async function main() { return {upper:OpenDeskLibs.myUtils.upper('hello'),chunks:_.chunk([1,2,3],2),date:dayjs('2026-10-10').format('YYYY-MM-DD')}; }";
async function observeTiming(){
  for(const id of [sw,panel])await evaluate(client,`(()=>{if(globalThis.__r155Timing)return;const rows=[];Object.defineProperty(globalThis,'__r155Timing',{value:rows});const fetch=globalThis.fetch;globalThis.fetch=async function(...args){const start=performance.now();try{const reply=await Reflect.apply(fetch,this,args);if(String(args[0]).includes('/libs/'))rows.push({kind:'resource-response',url:String(args[0]),start,durationMs:performance.now()-start});return reply;}catch(e){rows.push({kind:'fetch-error',url:String(args[0]),start,durationMs:performance.now()-start});throw e;}};const digest=crypto.subtle.digest;crypto.subtle.digest=async function(...args){const start=performance.now();const result=await Reflect.apply(digest,this,args);rows.push({kind:'integrity-digest',bytes:args[1]?.byteLength,start,durationMs:performance.now()-start});return result;};})()`,id);
}
async function timing(){return {sw:await evaluate(client,'globalThis.__r155Timing||[]',sw),panel:await evaluate(client,'globalThis.__r155Timing||[]',panel)};}
async function controller(label,code=source,stop=false){
  await input(code);const before=new Set((await stores()).results.map(r=>r.resultId));const previousRun=await evaluate(client,'document.querySelector("#script-run-id").value',panel);const start=performance.now();
  await click('#script-run');
  const runId=await until(async()=>{const id=await evaluate(client,'document.querySelector("#script-run-id").value',panel);return id&&id!==previousRun?id:null;},'new runId');
  if(stop){await until(()=>evaluate(client,'!document.querySelector("#script-stop").disabled',panel),'stop enabled');await click('#script-stop');}
  const value=await until(async()=>{const state=await stores();const result=state.results.find(r=>r.tag==='controller-result'&&!before.has(r.resultId)&&r.runId===runId);const run=state.runs.find(r=>r.runId===runId);return result&&run?.retirementState==='released'?{result,run}:null;},'exact result and retirement');
  assert.equal(value.result.revision.sourceHash,sha(code));assert.equal(value.run.workerRetired,true);
  if(!stop){assert.equal(value.result.state,'completed');assert.deepEqual(decode(value.result.outcome.valueWire),expected);}else assert.equal(value.result.state,'stopped');
  const row={label,kind:'controller',durationMs:performance.now()-start,...value};report.samples.push(row);await save(label,row);
  await until(()=>evaluate(client,'!document.querySelector("#script-run").disabled',panel),'released UI');return row;
}
const descriptors=()=>evaluate(client,`Object.fromEntries(['$','jQuery','_','dayjs','OpenDeskLibs'].map(k=>{const d=Object.getOwnPropertyDescriptor(globalThis,k);return [k,d?{value:d.value,enumerable:d.enumerable,writable:d.writable,configurable:d.configurable}:null];}))`,page);
async function pageRun(label,jquery=false,code){
  code??=(jquery?'// @opendesk-lib jquery\n':'')+`async function main() { const value={upper:OpenDeskLibs.myUtils.upper('hello'),chunks:_.chunk([1,2,3],2),date:dayjs('2026-10-10').format('YYYY-MM-DD'),jquery:${jquery?"jQuery.fn.jquery":"typeof jQuery"},matches:${jquery?"$('h1').length":"0"}};document.querySelector('h1').setAttribute('data-r155-final',JSON.stringify(value));return value; }`;
  const before=await descriptors();await input(code);const oldReceipt=await evaluate(client,'document.querySelector("#page-preview-technical").textContent',panel);const start=performance.now();await click('#page-preview-run');
  await until(()=>evaluate(client,`(()=>{const status=document.querySelector('#page-preview-status');const receipt=document.querySelector('#page-preview-technical').textContent;return status.dataset.state==='error'||(receipt&&receipt!==${JSON.stringify(oldReceipt)});})()`,panel),'new Page terminal');
  const ui=await evaluate(client,'({state:document.querySelector("#page-preview-status").dataset.state,status:document.querySelector("#page-preview-status").textContent,receipt:document.querySelector("#page-preview-technical").textContent})',panel);
  const value=await evaluate(client,'document.querySelector("h1").getAttribute("data-r155-final")',page);
  const row={label,kind:'page',durationMs:performance.now()-start,sourceHash:sha(code),ui,value,mainBefore:before,mainAfter:await descriptors()};await save(label,row);
  assert.equal(ui.state,'completed',ui.status);const receipt=JSON.parse(ui.receipt);assert.equal(receipt.sourceHash,sha(code));assert.equal(receipt.world,'USER_SCRIPT');assert.equal(receipt.state,'preview-evaluated');assert(receipt.documentId);assert.equal(receipt.registered,false);
  assert.deepEqual(row.mainAfter,before);const actual=JSON.parse(value);assert.deepEqual({upper:actual.upper,chunks:actual.chunks,date:actual.date},expected);assert.equal(actual.jquery,jquery?'3.7.1':'undefined');if(jquery)assert.equal(actual.matches,1);
  row.receipt=receipt;report.samples.push(row);return row;
}
function helper(command){execFileSync(process.execPath,['tests/framework/r15-native-sidebar.mjs',command],{env:process.env,stdio:'pipe',timeout:45000});}
try{
  await bind();await click('#tab-develop');await observeTiming();
  if(process.argv[2]==='page-only'){
    helper('toggle');
    if(!await evaluate(client,'document.querySelector("#page-preview-tools").open',panel))await click('#page-preview-tools > summary');
    // Explicit webpage fixture setup. Sentinel descriptors must remain exact.
    await evaluate(client,`(()=>{for(const k of ['$','jQuery','_','dayjs','OpenDeskLibs'])Object.defineProperty(globalThis,k,{value:'website-main-'+k,enumerable:true,writable:false,configurable:true});})()`,page);
    for(let i=0;i<10;i++)await pageRun('page-'+i);
    for(let i=0;i<10;i++)await pageRun('jquery-'+i,true);
    const before=await evaluate(client,'document.querySelector("h1").getAttribute("data-r155-final")',page);
    await input('// @opendesk-lib jquery\n// ==UserScript==\n// @name conflict\n// @match http://127.0.0.1/*\n// @require https://code.jquery.com/jquery-3.7.1.min.js\n// ==/UserScript==\nasync function main(){document.querySelector("h1").setAttribute("data-r155-final","UNAUTHORIZED");}');await click('#page-preview-run');
    await until(()=>evaluate(client,'document.querySelector("#page-preview-status").dataset.state!=="running"',panel),'conflict rejection');
    const rejection=await evaluate(client,'document.querySelector("#page-preview-status").textContent',panel);assert.match(rejection,/E_/);assert.equal(await evaluate(client,'document.querySelector("h1").getAttribute("data-r155-final")',page),before);report.cases.push({label:'require-conflict',status:'NATIVE_PASS',rejection});
    helper('user-scripts-off');await input(source);await click('#page-preview-run');await until(()=>evaluate(client,'document.querySelector("#page-preview-status").dataset.state!=="running"',panel),'permission rejection');
    report.cases.push({label:'user-scripts-permission-revoked',status:'NATIVE_PASS',rejection:await evaluate(client,'document.querySelector("#page-preview-status").textContent',panel)});helper('toggle');
  }else{
    for(let i=0;i<10;i++)await controller('controller-'+i);
    await controller('controller-stop','async function main(){await new Promise(r=>setTimeout(r,20000));return "unauthorized-after-stop";}',true);
  }
  report.timings=await timing();report.status='NATIVE_PASS';
}catch(error){report.status='FAIL';report.failures.push({message:error.message,stack:error.stack});if(client)report.ui=await evaluate(client,'({text:document.body.innerText,controls:[...document.querySelectorAll("button,input,textarea")].map(n=>({id:n.id,disabled:n.disabled,value:n.value}))})',panel).catch(()=>null);process.exitCode=1;}
finally{client?.close();await save(process.argv[2]==='page-only'?'page-acceptance':'controller-acceptance',report);console.log(JSON.stringify({status:report.status,cases:report.cases.length,samples:report.samples.length,failures:report.failures}));}
