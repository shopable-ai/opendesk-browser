// Actual installed opaque App UI scenarios. Called only after the original Task install succeeds.
// Message listeners are passive observers; they do not intercept, delay or replace the SDK.
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {click,fill,fileInput,until,sha} from './native-session.mjs';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';
function returnedValue(snapshot){
  if(snapshot.result?.data)return snapshot.result;
  if(snapshot.value!=null)return snapshot.value;
  const r=snapshot.result;
  return r?.outcome?.valueWire?decodeValue(r.outcome.valueWire):r?.value??r;
}
function assertDurable(snapshot,pin,expectedState){
  assert(snapshot.clientRequestId,'Original client request identity is required');
  assert(snapshot.runId);assert(snapshot.resultId);
  assert.equal(snapshot.retirementState,'released');
  assert.equal(snapshot.state,expectedState);
  // The App projects decoded business data to result; only durableResult is the row.
  const row=snapshot.durableResult??(snapshot.result?.tag==='controller-result'?snapshot.result:null);
  assert.equal(row?.tag,'controller-result');
  assert.equal(row.runId,snapshot.runId);assert.equal(row.resultId,snapshot.resultId);
  assert.equal(row.state,expectedState);
  assert(Number.isSafeInteger(row.revision?.revision)&&row.revision.revision>0,'Result must carry its own revision');
  assert.equal(row.revision.sourceHash,pin.contentHash,'Durable result must bind the installed source');
  return row;
}
export async function runAppCore({browser,view,candidate,out,report,record,oracle}){
  const bytes=await readFile(resolve(candidate)),pkg=JSON.parse(bytes);
  assert.equal(pkg.id,'scrapyjs');assert(pkg.capabilities.includes('tasks.run'),'App must declare the actual tasks.run capability');
  assert(pkg.delegatedTasks?.some(t=>t.taskId==='scrapyjs.capture'),'Original package must pin the Task');
  const taskPin=pkg.delegatedTasks.find(t=>t.taskId==='scrapyjs.capture');
  report.csvDownload='NOT_TESTED';report.cancelBeforeReply='NOT_TESTED';
  await record('app-package-input',{file:resolve(candidate),sha256:sha(bytes),delegatedTasks:pkg.delegatedTasks});
  const host=view.panel;
  // Observe real envelopes only. Never wrap request/postMessage or send an extra storage read.
  await host.read(`(()=>{if(globalThis.__scrapyStorageRequests)return;globalThis.__scrapyStorageRequests=[];
    addEventListener('message',e=>{const m=e.data;if(m?.toolId==='scrapyjs'&&m.kind==='request'&&['storage.get','storage.set'].includes(m.operation))
      globalThis.__scrapyStorageRequests.push({at:Date.now(),origin:e.origin,message:JSON.parse(JSON.stringify(m))});},{passive:true});})()`);
  await click(host,'#tab-tools');await click(host,'#extension-center-more');await click(host,'#extension-center-import');
  await fileInput(host,'#sidebar-tool-file',candidate);
  const review=await until(()=>host.read(`(()=>{const e=document.querySelector('#sidebar-tool-preview');return e&&!e.hidden&&!document.querySelector('#sidebar-tool-install').disabled?{title:document.querySelector('#sidebar-tool-preview-title').textContent,body:e.innerText}:null})()`),'original App install review');
  assert.equal(review.title.trim(),pkg.title);await record('app-review',review);
  assert.equal(sha(await readFile(resolve(candidate))),sha(bytes),'App candidate changed during review; do not install unreviewed bytes');
  await click(host,'#sidebar-tool-install');
  const main='button[data-extension-key="app:scrapyjs"][data-extension-action="main"]';
  async function open(){
    await until(()=>host.read('!!document.querySelector('+JSON.stringify(main)+')'),'installed App entry');await click(host,main);
    const t=await until(async()=> (await browser.call('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url.startsWith('chrome-extension://'+view.extensionId+'/')&&t.url.includes('/sidebar-tools/sandbox.html')),'actual App sandbox');
    const frame=await browser.attach(t.targetId);
    await frame.read(`(()=>{globalThis.__scrapyPointerEvents=[];for(const type of ['pointerdown','click'])addEventListener(type,e=>{
      globalThis.__scrapyPointerEvents.push({type,trusted:e.isTrusted,id:e.target.id,tag:e.target.tagName,x:e.clientX,y:e.clientY});
    },{capture:true,passive:true});})()`);
    await frame.read(`(()=>{if(globalThis.__scrapyStorageResponses)return;globalThis.__scrapyStorageResponses=[];
      addEventListener('message',e=>{const m=e.data;if(e.source===parent&&m?.toolId==='scrapyjs'&&m.kind==='response')
        globalThis.__scrapyStorageResponses.push({at:Date.now(),origin:e.origin,message:JSON.parse(JSON.stringify(m))});},{passive:true});})()`);
    frame.inputHost=host;frame.inputOwnerSelector='iframe.sidebar-tool-iframe';
    await until(()=>frame.read('!!globalThis.OpenDeskTool?.root?.querySelector("#config-json")'),'installed App rendered');
    const isolation=await frame.read('({origin:globalThis.origin,chromeStorage:typeof chrome?.storage,request:typeof OpenDeskTool.request})');
    assert.equal(isolation.origin,'null');assert.equal(isolation.chromeStorage,'undefined');
    await record('app-isolation',{...isolation,targetId:t.targetId});return frame;
  }
  let frame=await open();
  let saved;
  async function storageObservation(){
    const requests=await host.read('globalThis.__scrapyStorageRequests||[]');
    const responses=await frame.read('globalThis.__scrapyStorageResponses||[]');
    const exchanges=requests.map(request=>{
      const message=request.message;
      const response=responses.find(row=>row.message.requestId===message.requestId&&row.message.instance===message.instance);
      return {request,response:response??null,
        ...(message.operation==='storage.set'?{savedConfig:message.payload?.value,ifMatch:message.payload?.ifMatch}:{}),
        ...(response?{value:response.message.result?.value,etag:response.message.result?.etag}:{}),
        observation:response?'RESPONSE_OBSERVED':'RESPONSE_NOT_OBSERVED_IN_THIS_FRAME'};
    });
    return {intendedConfig:saved,exchanges,requests,responses:responses.filter(row=>requests.some(request=>
      request.message.requestId===row.message.requestId&&request.message.instance===row.message.instance))};
  }
  try {
  // The App has one root under #tool-content. Derive its actual selector instead of assuming a framework.
  const config=await until(()=>frame.read('globalThis.OpenDeskTool.root.querySelector("#config-json").value'),'initial saved config');
  const rootSelector=await frame.read('document.querySelector("#config-json")?"document":"shadow"');
  assert.equal(rootSelector,'document','Driver currently supports the observed light-DOM App root only');
  saved={...JSON.parse(config),waitForSelector:'#sample-list li',timeoutMs:30000};
  assert.equal(saved.itemConfig.title,'.::text');
  await fill(frame,'#config-json',JSON.stringify(saved,null,2));
  await record('app-save-before-click',{storage:await storageObservation()});
  await click(frame,'#save-config');
  await until(async()=>{
    const state=await frame.read('({notice:document.querySelector("#app-notice")?.textContent,error:document.querySelector("#app-error")?.textContent,saving:document.querySelector("#config-json")?.disabled})');
    return !state.saving&&(state.error||state.notice?.includes('配置已保存'))?state:null;
  },'real storage save settled');
  const saveState=await frame.read('({notice:document.querySelector("#app-notice")?.textContent,error:document.querySelector("#app-error")?.textContent,draft:document.querySelector("#config-json")?.value})');
  await record('app-save-observation',{state:saveState,storage:await storageObservation()});
  assert(!saveState.error,saveState.error);assert(saveState.notice?.includes('配置已保存'),'Real storage save was not confirmed');
  await click(host,'#sidebar-tool-back');frame=await open();
  await until(async()=>{try{assert.deepEqual(JSON.parse(await frame.read('document.querySelector("#config-json").value')),saved);return true;}catch{return false;}},'saved config survives actual App destruction/reopen');
  report.saveReopen='PASS';await record('app-save-reopen',{config:saved,storage:await storageObservation()});
  const identity=await frame.read('location.href');
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await click(frame,'#refresh-target');await until(()=>frame.read('!document.querySelector("#start").disabled'),'App real target ready');
  await click(frame,'#start');
  await record('app-start-input',{events:await frame.read('globalThis.__scrapyPointerEvents'),button:await frame.read('({rect:document.querySelector("#start").getBoundingClientRect().toJSON(),disabled:document.querySelector("#start").disabled,host:document.querySelector("#host-status").textContent})')});
  const snapshot=await until(async()=>{
    const state=await frame.read('({error:document.querySelector("#app-error").textContent,retired:document.querySelector("#retired-status").textContent,result:document.querySelector("#result").textContent})');
    if(state.error)throw Error(state.error);if(!state.retired.includes('已确认退休'))return null;
    try{const snapshot=JSON.parse(state.result);return returnedValue(snapshot)?.data?snapshot:null;}catch{return null;}
  },'same App genuine result and original retirement',45000);
  const result=returnedValue(snapshot);assert.deepEqual(result.data.map(row=>row.title),oracle);
  const completedRow=assertDurable(snapshot,taskPin,'completed');
  assert.deepEqual(decodeValue(completedRow.outcome.valueWire),result,'Displayed business data must equal the durable result');
  assert.equal(await frame.read('location.href'),identity,'Run must preserve the same App iframe');
  report.sameApp='PASS';await record('same-app-result',{snapshot,identity});
  const downloadRoot=resolve(out,'downloads');await mkdir(downloadRoot,{recursive:true});
  const downloadPath=await mkdtemp(join(downloadRoot,'app-'));
  // CDP's filename suggestion for extension data downloads can be download.json.
  // Track this browser's actual GUID instead of treating that suggestion as an App filename.
  await browser.call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath,eventsEnabled:true});
  async function download(format){
    const cursor=browser.events.length,filename='scrapyjs-result.'+format;
    await click(frame,'#download-'+format);
    const mime=format==='json'?'application/json':'text/csv';
    const begun=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadWillBegin'&&e.params.url.startsWith('data:'+mime+';')),'actual '+format+' download begins');
    const completed=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadProgress'&&e.params.guid===begun.params.guid&&['completed','canceled'].includes(e.params.state)),'actual '+format+' download completes');
    assert.equal(completed.params.state,'completed');
    const file=join(downloadPath,begun.params.guid),bytes=await readFile(file);assert(bytes.length>0);
    await record(format+'-download-file',{file,requestedFilename:filename,suggestedFilename:begun.params.suggestedFilename,guid:begun.params.guid,completion:completed.params,sha256:sha(bytes),size:bytes.length});
    return bytes;
  }
  const jsonBytes=await download('json');
  assert.deepEqual(JSON.parse(jsonBytes),snapshot,'Download must contain the complete actual snapshot');
  report.jsonDownload='PASS_FILE_BYTES';await record('json-download',{snapshot,sha256:sha(jsonBytes)});
  const csvBytes=await download('csv');
  assert.deepEqual(csvBytes.toString('utf8').replace(/^\uFEFF/,'').split(/\r?\n/),['"title"',...oracle.map(value=>'"'+value.replaceAll('"','""')+'"')]);
  report.csvDownload='PASS_FILE_BYTES';await record('csv-download',{sha256:sha(csvBytes)});
  const waiting={...saved,waitForSelector:'#scrapyjs-native-never-exists',timeoutMs:60000};
  await fill(frame,'#config-json',JSON.stringify(waiting,null,2));
  await click(frame,'#start');
  const waitingRun=await until(async()=>{try{const state=JSON.parse(await frame.read('document.querySelector("#result").textContent'));
    return state.runId&&state.runId!==snapshot.runId&&state.clientRequestId!==snapshot.clientRequestId&&state.state==='running'&&state.retirementState!=='released'?state:null;}catch{return null;}},'same App missing-selector run is actually active');
  await record('app-missing-selector-active',waitingRun);
  await click(frame,'#stop');
  const stopped=await until(async()=>{try{const state=JSON.parse(await frame.read('document.querySelector("#result").textContent'));
    return state.runId===waitingRun.runId&&state.retirementState==='released'?state:null;}catch{return null;}},'same App original Stop and released retirement');
  assert.equal(stopped.clientRequestId,waitingRun.clientRequestId);assert.equal(stopped.resultId,waitingRun.resultId);
  const durable=assertDurable(stopped,taskPin,'stopped');assert.equal(durable.outcome.ok,false);
  assert.equal(await frame.read('location.href'),identity,'Stop must preserve the same App iframe');
  report.missingSelectorStop='PASS_SAME_APP';await record('app-missing-selector-stopped',stopped);
  // Observer records only this App's task messages and real incoming responses.
  await host.read(`(()=>{globalThis.__scrapyNativeRequests=[];addEventListener('message',e=>{const m=e.data;if(m?.toolId==='scrapyjs'&&m.kind==='request'&&/^tasks\\./.test(m.operation))globalThis.__scrapyNativeRequests.push({at:Date.now(),message:JSON.parse(JSON.stringify(m))});});})()`);
  await frame.read(`(()=>{globalThis.__scrapyNativeResponses=[];globalThis.__scrapyNativeOrder=[];
    addEventListener('message',e=>{if(e.source===parent&&e.data?.toolId==='scrapyjs'&&e.data.kind==='response'){
      const row={at:Date.now(),order:globalThis.__scrapyNativeOrder.length,message:JSON.parse(JSON.stringify(e.data))};
      globalThis.__scrapyNativeResponses.push(row);globalThis.__scrapyNativeOrder.push({kind:'response',...row});}},{passive:true});
    addEventListener('click',e=>{if(e.isTrusted&&e.target.closest?.('#stop')&&!e.target.closest('#stop').disabled)
      globalThis.__scrapyNativeOrder.push({kind:'stop-click',at:Date.now(),order:globalThis.__scrapyNativeOrder.length});},{capture:true,passive:true});})()`);
  await fill(frame,'#config-json',JSON.stringify(waiting,null,2));
  await click(frame,'#start');
  await until(()=>host.read('globalThis.__scrapyNativeRequests.some(x=>x.message.operation==="tasks.start")'),'actual tasks.start request observed',10000);
  await click(frame,'#stop');
  await until(()=>frame.read('document.querySelector("#retired-status").textContent.includes("已确认退休")||document.querySelector("#app-notice").textContent.includes("未发起任务")'),'same App cancellation settles',25000);
  const requests=await host.read('globalThis.__scrapyNativeRequests');
  const starts=requests.filter(x=>x.message.operation==='tasks.start'),stops=requests.filter(x=>x.message.operation==='tasks.stop');
  assert(starts.length<=1,'No repeated start on cancellation');
  if(starts.length===1){
    const start=starts[0].message;
    // The Stop receipt can arrive first. Observe the original Start reply too
    // before taking one consistent snapshot of response/order evidence.
    await until(()=>frame.read(`globalThis.__scrapyNativeResponses.some(x=>x.message.requestId===${JSON.stringify(start.requestId)}&&x.message.instance===${JSON.stringify(start.instance)})`),'original Start response after cancellation',10000);
  }
  const {responses,order}=await frame.read('({responses:globalThis.__scrapyNativeResponses,order:globalThis.__scrapyNativeOrder})');
  if(starts.length===1){
    const start=starts[0].message,clientRequestId=start.payload.clientRequestId;
    const reply=responses.find(x=>x.message.requestId===start.requestId&&x.message.instance===start.instance);
    const stopClick=order.find(x=>x.kind==='stop-click');
    const originalStops=stops.filter(x=>x.message.instance===start.instance&&x.message.payload?.clientRequestId===clientRequestId);
    assert.equal(originalStops.length,stops.length,'Cancellation must only target the original client request');
    assert(originalStops.length<=1,'No repeated Stop on cancellation');
    const stopReply=responses.find(x=>originalStops.some(stop=>x.message.requestId===stop.message.requestId&&x.message.instance===stop.message.instance));
    const state=await frame.read('({result:document.querySelector("#result").textContent,retired:document.querySelector("#retired-status").textContent})');
    let finalSnapshot;try{finalSnapshot=JSON.parse(state.result);}catch{}
    if(finalSnapshot?.runId){
      assert.equal(finalSnapshot.clientRequestId,clientRequestId);
      assert.notEqual(finalSnapshot.runId,waitingRun.runId,'Cancellation must not reuse the previous run');
      assertDurable(finalSnapshot,taskPin,'stopped');
    }else{
      assert.equal(stopReply?.message.ok,true,'No-run cancellation needs a real Stop receipt');
      assert.equal(stopReply.message.result?.clientRequestId,clientRequestId);
      assert.equal(stopReply.message.result?.state,'cancelled');
      assert.equal(stopReply.message.result?.runId,null,'A claimed run requires durable retirement evidence');
    }
    // Missing reply is an unknown outcome, never proof that the click won the race.
    report.cancelBeforeReply=!reply?'NOT_TESTED_START_REPLY_NOT_OBSERVED':
      stopClick&&stopClick.order<reply.order?'PASS_OBSERVED':'NOT_TESTED_RACE_WINDOW_MISSED';
  }else report.cancelBeforeReply='NOT_TESTED_CANCELLED_BEFORE_SUBMISSION';
  assert.equal(await frame.read('location.href'),identity,'Cancellation must preserve the same App iframe');
  await record('same-app-cancel-observation',{requests,responses,order,state:await frame.read('({result:document.querySelector("#result").textContent,error:document.querySelector("#app-error").textContent,notice:document.querySelector("#app-notice").textContent})')});
  }catch(error){await record('app-failure-state',{...await frame.read('({body:document.body.innerText,error:document.querySelector("#app-error")?.textContent,notice:document.querySelector("#app-notice")?.textContent,result:document.querySelector("#result")?.textContent,draft:document.querySelector("#config-json")?.value,pointerEvents:globalThis.__scrapyPointerEvents,responses:globalThis.__scrapyNativeResponses,order:globalThis.__scrapyNativeOrder})'),requests:await host.read('globalThis.__scrapyNativeRequests'),storage:await storageObservation()});throw error;}
}
