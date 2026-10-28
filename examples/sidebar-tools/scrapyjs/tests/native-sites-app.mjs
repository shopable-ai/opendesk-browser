// Original current-page examples: ordinary UI input, durable results and actual export bytes.
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {click,fill,fileInput,until,sha} from './native-session.mjs';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';

export function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){row.push(cell);cell='';}
  else if(ch==='\r'&&!quoted&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
  else cell+=ch;
 }
 assert(!quoted,'Unclosed CSV field');row.push(cell);rows.push(row);return rows;
}
// Independent current DOM oracle, deliberately without ItemLoader/Processing calls.
function observedRows(config){
 const fields=Object.entries(config.itemConfig).filter(([k])=>!k.startsWith('_'));
 return [...document.querySelectorAll(config.itemConfig._listContainer)].flatMap(container=>
  [...container.querySelectorAll(config.itemConfig._listItem)].map(element=>Object.fromEntries(fields.map(([key,rule])=>{
   const [css,attr]=rule.split('::'),e=element.querySelector(css);
   return [key,e?(attr&&attr!=='text'?e.getAttribute(attr)??'':e.textContent.trim()):''];
  }))));
}
function splitExpected(raw){
 const parts=raw.split(/\s+\/\s+/u).map(s=>s.trim());
 const i=parts.findIndex(s=>/^\d{4}-\d{1,2}(?:-\d{1,2})?$/.test(s));assert([2,3].includes(i));assert.equal(parts.length,i+2);
 const date=parts[i].split('-').map((s,n)=>n?s.padStart(2,'0'):s).join('-');
 const match=/^(?:(USD|CNY)\s*)?(\d+(?:\.\d+)?)(元)?$/i.exec(parts[i+1]);
 return {publication_raw:raw,author:parts[0],translator:i===3?parts[1]:null,publisher:parts[i-1],publication_date:date,
  price:match?Number(match[2]):null,currency:match?(match[1]?.toUpperCase()??(match[3]?'CNY':null)):null};
}

export async function runExampleApp({browser,view,candidate,configs,out,report,record,taskPackage}){
 assert.equal(report.taskInstall,'PASS_UI_RECEIPT');
 const file=resolve(candidate),bytes=await readFile(file),pkg=JSON.parse(bytes),pin=pkg.delegatedTasks[0];
 const task=JSON.parse(await readFile(taskPackage));assert.equal(pin.manifestHash,task.manifestHash);assert.equal(pin.contentHash,sha(task.sourceUtf8));
 const evidence=report.originalSites={package:{path:file,sha256:sha(bytes),version:pkg.version,pin},scenarios:[],scope:'CURRENT_PAGE_ONLY_NO_PAGINATION_OR_DETAILS'};
 const host=view.panel;let frame;
 const state=()=>frame.read(`({error:document.querySelector('#app-error')?.textContent,configError:document.querySelector('#config-error')?.textContent,
  notice:document.querySelector('#app-notice')?.textContent,result:document.querySelector('#result')?.textContent,
  config:document.querySelector('#config-json')?.value,targetUrl:document.querySelector('#target-url')?.value,
  runProfile:document.querySelector('#run-profile')?.textContent,profiles:[...document.querySelectorAll('#profile-list button')].map(e=>({id:e.dataset.profileId,name:e.textContent,selected:e.getAttribute('aria-pressed')==='true'}))})`);
 async function open(){
  await click(host,'button[data-extension-key="app:scrapyjs"][data-extension-action="main"]');
  const t=await until(async()=>{const ts=(await browser.call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url.startsWith('chrome-extension://'+view.extensionId+'/')&&t.url.includes('/sidebar-tools/sandbox.html'));return ts.length===1?ts[0]:null;},'original App iframe');
  frame=await browser.attach(t.targetId);frame.inputHost=host;frame.inputOwnerSelector='iframe.sidebar-tool-iframe';
  await until(()=>frame.read('document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")'),'App storage');
  assert.equal(await frame.read('origin'),'null');return state();
 }
 async function reopen(){const old=frame.targetId;await click(host,'#sidebar-tool-back');await until(async()=>!(await browser.call('Target.getTargets')).targetInfos.some(t=>t.targetId===old),'App destroyed');await open();assert.notEqual(frame.targetId,old);}
 const ids={runId:new Set(),resultId:new Set(),clientRequestId:new Set()};
 const downloadRoot=await mkdtemp(join(out,'site-downloads-'));await browser.call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadRoot,eventsEnabled:true});
 async function download(format,snapshot){
  const cursor=browser.events.length;await click(frame,'#download-'+format);
  const begun=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadWillBegin'),'download '+format+' begins');
  const done=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadProgress'&&e.params.guid===begun.params.guid&&['completed','canceled'].includes(e.params.state)),'download '+format+' complete');
  assert.equal(done.params.state,'completed');const path=join(downloadRoot,begun.params.guid),body=await readFile(path);
  if(format==='json')assert.deepEqual(JSON.parse(body),snapshot);
  else{const rows=parseCsv(body.toString()),keys=rows.shift();assert.deepEqual(keys,[...new Set(snapshot.result.data.flatMap(r=>Object.keys(r)))]);
   const cell=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);assert.deepEqual(rows,snapshot.result.data.map(r=>keys.map(k=>cell(r[k]))));}
  return {path,bytes:body.length,sha256:sha(body),filename:begun.params.suggestedFilename,completion:done.params.state,check:'PASS_FILE_BYTES'};
 }
 try{
  await click(host,'#tab-tools');await click(host,'#extension-center-more');await click(host,'#extension-center-import');await fileInput(host,'#sidebar-tool-file',file);
  const review=await until(()=>host.read('(()=>{const e=document.querySelector("#sidebar-tool-preview");return e&&!e.hidden&&!document.querySelector("#sidebar-tool-install").disabled?e.innerText:null})()'),'App original install review');
  await record('sites-app-install-review',review);assert.equal(sha(await readFile(file)),sha(bytes));await click(host,'#sidebar-tool-install');await open();
  for(const entry of configs){
   const row={name:entry.name,kind:entry.kind,config:entry.config,startedAt:new Date().toISOString(),status:'RUNNING'};evidence.scenarios.push(row);await record('site-input',row);
   await click(frame,'#new-profile');
   if(await frame.read('!document.querySelector("#profile-confirm").hidden'))await click(frame,'#profile-confirm-accept');
   await fill(frame,'#config-json',JSON.stringify(entry.config,null,2));let s=await state();assert(!s.configError,s.configError);assert.equal(s.targetUrl,entry.config.url,'JSON URL and Start target synchronized');
   await click(frame,'#save-config');await fill(frame,'#profile-name',entry.name);await click(frame,'#profile-name-submit');
   await until(async()=>{const s=await state();if(s.error)throw Error(s.error);return s.notice.includes('配置已保存');},'site config saved');
   row.profile=(await state()).profiles.find(p=>p.selected);assert.equal(row.profile.name,entry.name);
   await reopen();s=await state();assert.deepEqual(JSON.parse(s.config),entry.config);assert.equal(s.profiles.find(p=>p.selected).id,row.profile.id);assert.equal(s.result,'尚无结果');row.saveReopen='PASS';
   row.navigation=await view.target.call('Page.navigate',{url:entry.config.url});
   await until(()=>view.target.read('document.readyState==="complete"'),'site document ready',30000);
   // Some sites serve a transient verification/loading document before normal
   // navigation completes. Wait for their ordinary document, never alter it.
   try{await until(()=>view.target.read('!!document.querySelector('+JSON.stringify(entry.config.waitForSelector)+')'),'original list available',30000);}
   catch(error){row.listUnavailable=error.message;}
   row.document=await view.target.read('({url:location.href,title:document.title,text:document.body.innerText.slice(0,1200)})');
   if(entry.kind==='live'&&/安全验证|Security Verification/.test(row.document.title+' '+row.document.text)){
    row.status='BLOCKED_SITE_VERIFICATION';row.reason='Target website serves a security verification document; no data or successful run claimed';await record('site-blocked',row);continue;
   }
   if(entry.kind==='live'&&row.listUnavailable){row.status='BLOCKED_SITE_NO_LIST';row.reason='No source list in the bounded normal visit; original page response retained';await record('site-blocked',row);continue;}
   assert.equal(new URL(row.document.url).origin,new URL(entry.config.url).origin);
   assert(!row.listUnavailable,row.listUnavailable);
   let expected=entry.expectedData;
   if(entry.kind==='live'){
    row.rawDom=await view.target.read('('+observedRows.toString()+')('+JSON.stringify(entry.config)+')');assert(row.rawDom.length>0);
    expected=row.rawDom.map(r=>entry.config.processing?{...r,...splitExpected(r.publication)}:r);
    row.independentExpected=expected;row.oracle='current webpage DOM + independent publication contract parsing, no Scrapy calls';
   }
   assert(Array.isArray(expected)&&expected.length>0);
   await browser.call('Target.activateTarget',{targetId:view.target.targetId});await click(frame,'#refresh-target');
   await until(()=>frame.read('document.querySelector("#page-title")?.textContent==='+JSON.stringify(row.document.title)),'trustworthy current page refreshed');
   await click(frame,'#start');
   const terminal=await until(async()=>{const s=await state();if(s.error)return {error:s.error,ui:s};let snapshot;try{snapshot=JSON.parse(s.result);}catch{return null;}return snapshot.runId&&snapshot.retirementState==='released'?{snapshot,ui:s}:null;},entry.name+' durable run result/released',120000);
   row.terminal=terminal;await record('site-actual',row);assert(!terminal.error,terminal.error);
   const snapshot=terminal.snapshot,durable=snapshot.durableResult,value=decodeValue(durable?.outcome?.valueWire);row.value=value;
   for(const key of Object.keys(ids)){assert(snapshot[key]&&!ids[key].has(snapshot[key]));ids[key].add(snapshot[key]);}
   assert.equal(snapshot.state,'completed');assert.equal(durable.runId,snapshot.runId);assert.equal(durable.resultId,snapshot.resultId);assert.equal(durable.state,'completed');assert.equal(durable.outcome.ok,true);
   assert.equal(durable.revision.sourceHash,pin.contentHash);assert.equal(snapshot.retirementState,'released');assert.deepEqual(snapshot.result,value);
   assert.equal(value.engine.status,'completed');assert.deepEqual(value.data,expected);assert(terminal.ui.runProfile.includes(entry.name));
   // The public run summary exposes committed rows, not internal processing counters.
   assert.equal(value.stats.counts.committed,expected.length);assert.equal(value.engine.pageCount,1);
   row.table=await frame.read('(()=>{const t=document.querySelector("#record-table");return {headers:[...t.querySelectorAll("thead th")].map(e=>e.textContent),rows:[...t.querySelectorAll("tbody tr")].map(r=>[...r.querySelectorAll("td")].map(e=>e.textContent))}})()');
   const cell=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);assert.deepEqual(row.table.rows,expected.map(r=>row.table.headers.map(k=>cell(r[k]))));
   row.exports={json:await download('json',snapshot),csv:await download('csv',snapshot)};row.status='PASS_CURRENT_PAGE';row.finishedAt=new Date().toISOString();await record('site-pass',row);
  }
  for(const row of [evidence.scenarios[0],evidence.scenarios.at(-1)]){
   await click(frame,'#profile-list button[data-profile-id='+JSON.stringify(row.profile.id)+']');
   await until(async()=>{const s=await state();return s.notice.includes('已切换配置')?s:null;},'switch saved site config');
   let s=await state();assert.deepEqual(JSON.parse(s.config),row.config);assert.equal(s.result,'尚无结果');
   await reopen();s=await state();assert.deepEqual(JSON.parse(s.config),row.config);assert.equal(s.profiles.find(p=>p.selected).id,row.profile.id);
  }
  evidence.switchOwnership='PASS_SWITCH_CLEARS_RESULTS_AND_REOPEN_RETAINS_FULL_SITE_CONFIG';
  evidence.status=evidence.scenarios.some(s=>s.status.startsWith('BLOCKED'))?'PARTIAL_EXTERNAL_BLOCKER':'PASS';report.app=evidence.status;
  assert.equal(sha(await readFile(file)),sha(bytes));await record('sites-summary',evidence);
 }catch(error){evidence.status='FAIL';evidence.error={message:error.message,stack:error.stack};evidence.lastUI=frame?await state().catch(()=>null):null;await record('sites-failure',evidence);throw error;}
}
