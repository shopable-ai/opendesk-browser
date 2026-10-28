// Optional real App lane for native-examples.mjs. No browser launch and no old milestone suite.
// configs: [{name,config,expectedData,expectedAudit?,expectedSummary?}].
// Uses the same original catalog/install/open UI as native-app.mjs, without its Stop/cancel scenarios.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {click,fill,fileInput,until,sha} from './native-session.mjs';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';

function durableValue(snapshot,pin){
  assert(snapshot.clientRequestId,'App must expose its original client request identity');
  assert(snapshot.runId&&snapshot.resultId,'App must expose original run/result identities');
  assert.equal(snapshot.state,'completed');assert.equal(snapshot.retirementState,'released');
  const row=snapshot.durableResult;
  assert.equal(row?.tag,'controller-result','App must expose the original durable result');
  assert.equal(row.runId,snapshot.runId);assert.equal(row.resultId,snapshot.resultId);
  assert.equal(row.state,'completed');assert.equal(row.outcome?.ok,true);
  assert(Number.isSafeInteger(row.revision?.revision)&&row.revision.revision>0);
  assert.equal(row.revision.sourceHash,pin.contentHash,'Result must bind the installed Task source');
  assert(!row.error,JSON.stringify(row.error));assert(!row.outcome.error,JSON.stringify(row.outcome.error));
  const value=decodeValue(row.outcome.valueWire);
  assert.deepEqual(snapshot.result,value,'Displayed business data must equal the durable result');
  if(Object.hasOwn(snapshot,'value'))assert.deepEqual(snapshot.value,value);
  assert(!value.error,JSON.stringify(value.error));assert(!value.engine?.error,JSON.stringify(value.engine?.error));
  assert.equal(value.engine?.status,'completed','App engine must actually complete');
  return value;
}

export async function runExampleApp({browser,view,candidate,configs,out,report,record,taskPackage}){
  assert.equal(report.taskInstall,'PASS_UI_RECEIPT','App requires the real Task installation first');
  assert(Array.isArray(configs)&&configs.length,'App configs must be a nonempty array');
  const names=new Set();
  for(const entry of configs){
    assert(entry&&typeof entry.name==='string'&&entry.name&&!names.has(entry.name),'App names must be unique and nonempty');
    names.add(entry.name);
    assert(entry.config&&typeof entry.config==='object'&&!Array.isArray(entry.config),'App scenario requires a config object');
    assert(Array.isArray(entry.expectedData),'App scenario requires the complete expectedData array');
    if(Object.hasOwn(entry,'expectedAudit'))assert(entry.expectedAudit&&typeof entry.expectedAudit==='object'&&!Array.isArray(entry.expectedAudit));
  }
  const file=resolve(candidate),bytes=await readFile(file),pkg=JSON.parse(bytes);
  assert.equal(pkg.id,'scrapyjs');assert(pkg.capabilities?.includes('tasks.run'));
  const pin=pkg.delegatedTasks?.find(row=>row.taskId==='scrapyjs.capture');
  assert(pin,'App must pin the original installed Task');
  const task=JSON.parse(await readFile(resolve(taskPackage),'utf8'));
  assert.equal(pin.contentHash,task.manifest?.program?.sourceHash);
  assert.equal(pin.manifestHash,task.manifestHash);
  const evidence=report.appExamples={status:'RUNNING',package:{path:file,sha256:sha(bytes),bytes:bytes.length,taskPin:pin},
    configsSha256:sha(JSON.stringify(configs)),scenarios:[],saveReopen:'NOT_TESTED',jsonDownload:'NOT_TESTED'};
  report.app='RUNNING';
  const host=view.panel;
  let frame;
  async function ui(){return frame.read(`({error:document.querySelector('#app-error')?.textContent,
    configError:document.querySelector('#config-error')?.textContent,notice:document.querySelector('#app-notice')?.textContent,
    result:document.querySelector('#result')?.textContent,retired:document.querySelector('#retired-status')?.textContent,
    host:document.querySelector('#host-status')?.textContent,engine:document.querySelector('#engine-status')?.textContent,
    config:document.querySelector('#config-json')?.value})`);}
  async function editorState(){return frame.read(`(()=>{const g=id=>document.getElementById(id);return {
    config:g('config-json').value,configError:g('config-error').textContent,
    startDisabled:g('start').disabled,saveDisabled:g('save-config').disabled,jsonDisabled:g('config-json').disabled,
    fieldKey:g('field-key').value,fieldSelector:g('field-selector').value,fieldRead:g('field-read').value,fieldAttr:g('field-attr').value,
    nextSelector:g('next-selector').value,maxPages:g('max-pages').value,dedupeKey:g('dedupe-key').value,
    detailEnabled:g('detail-enabled').checked,detailUrlField:g('detail-url-field').value,detailIdField:g('detail-id-field').value,
    detailFields:g('detail-fields').value,detailNumbers:g('detail-numbers').value};})()`);}
  async function applyExistingControls(entry){
    // Reapply a real existing href field so structured edits cannot change the golden config.
    const field=Object.entries(entry.config.itemConfig).find(([,rule])=>typeof rule==='string'&&rule.endsWith('::href'));
    assert(field,entry.name+' needs an existing href field for the structured editor scenario');
    const [key,rule]=field;
    const initial=await editorState();
    await record('example-app-controls-initial',{name:entry.name,state:initial});
    assert.equal(initial.nextSelector,entry.config.nextPageSelector||'');
    assert.equal(initial.maxPages,String(entry.config.maxPages??5));
    assert.equal(initial.dedupeKey,entry.config.dedupeKey||'');
    assert.equal(initial.detailEnabled,Boolean(entry.config.detail));
    assert.equal(initial.detailUrlField,entry.config.detail?.urlField||'');
    assert.equal(initial.detailIdField,entry.config.detail?.identityField||'');
    assert.deepEqual(JSON.parse(initial.detailFields),entry.config.detail?.itemConfig||{});
    assert.equal(initial.detailNumbers,(entry.config.detail?.numberFields||[]).join(','));
    await fill(frame,'#field-key',key);await fill(frame,'#field-selector',rule.slice(0,-'::href'.length));
    // Close any platform popup, focus the real HTML select, then use its native key handler.
    // A headless native popup does not reliably receive host-target End/Enter.
    await click(frame,'#field-read');
    const selectShot=await host.call('Page.captureScreenshot',{format:'png'});
    await writeFile(join(out,entry.name+'-select-open.png'),Buffer.from(selectShot.data,'base64'));
    for(const surface of [frame.inputHost,frame]){
      if(await frame.read('document.querySelector("#field-read").value')==='attr')break;
      await surface.call('Page.bringToFront').catch(()=>{});
      await frame.read('document.querySelector("#field-read").focus()');
      for(const type of ['rawKeyDown','keyUp'])await surface.call('Input.dispatchKeyEvent',{
        type,key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40,nativeVirtualKeyCode:125});
      for(const type of ['rawKeyDown','keyUp'])await surface.call('Input.dispatchKeyEvent',{
        type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:36});
      await record('example-app-select-attempt',{surface:surface.targetId,state:await frame.read('({value:document.querySelector("#field-read").value,disabled:document.querySelector("#field-read").disabled,focus:document.activeElement?.id,hasFocus:document.hasFocus()})')});
    }
    if(await frame.read('document.querySelector("#field-read").value')!=='attr'){
      await click(frame,'#field-read');
      await host.call('Input.dispatchKeyEvent',{type:'char',text:'属'});
      for(const type of ['rawKeyDown','keyUp'])await host.call('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    await record('example-app-select-key',{name:entry.name,state:await frame.read('({value:document.querySelector("#field-read").value,focus:document.activeElement?.id})')});
    assert.equal(await frame.read('document.querySelector("#field-read").value'),'attr');
    await fill(frame,'#field-attr','href');
    const pendingField=await editorState();
    await record('example-app-field-pending',{name:entry.name,state:pendingField});
    assert(pendingField.startDisabled&&pendingField.saveDisabled&&pendingField.jsonDisabled,'Unapplied field edits must block Run/Save/JSON editing');
    await click(frame,'#apply-field');
    const appliedField=await editorState();
    await record('example-app-field-applied',{name:entry.name,state:appliedField});
    assert(!appliedField.configError,appliedField.configError);
    assert.deepEqual(JSON.parse(appliedField.config),entry.config,'Applying the existing href field must preserve the full config');
    assert(!appliedField.startDisabled&&!appliedField.saveDisabled&&!appliedField.jsonDisabled,'Apply field must clear its pending edit guard');
    const originalNext=entry.config.nextPageSelector||'';
    // An empty insert into an already empty input need not emit input. Make a real
    // temporary edit, then restore via browser keys before applying the unchanged config.
    await fill(frame,'#next-selector',originalNext==='a.next'?'a.native-driver-next':'a.next');
    if(originalNext)await fill(frame,'#next-selector',originalNext);
    else{
      await click(frame,'#next-selector');
      await frame.read('document.querySelector("#next-selector").select()');
      for(const type of ['keyDown','keyUp'])await frame.inputHost.call('Input.dispatchKeyEvent',{
        type,key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
      assert.equal(await frame.read('document.querySelector("#next-selector").value'),'','Real Backspace must restore the empty selector');
    }
    const pendingCrawl=await editorState();
    await record('example-app-crawl-pending',{name:entry.name,state:pendingCrawl});
    assert(pendingCrawl.startDisabled&&pendingCrawl.saveDisabled&&pendingCrawl.jsonDisabled,'Unapplied crawl edits must block Run/Save/JSON editing');
    await click(frame,'#apply-crawl');
    const appliedCrawl=await editorState();
    await record('example-app-crawl-applied',{name:entry.name,state:appliedCrawl});
    assert(!appliedCrawl.configError,appliedCrawl.configError);
    assert.deepEqual(JSON.parse(appliedCrawl.config),entry.config,'Applying existing crawl controls must preserve the full config');
    assert(!appliedCrawl.startDisabled&&!appliedCrawl.saveDisabled&&!appliedCrawl.jsonDisabled,'Apply crawl must clear its pending edit guard');
    return {field:{key,selector:appliedField.fieldSelector,read:appliedField.fieldRead,attr:appliedField.fieldAttr},
      fieldApply:'PASS',crawlApply:'PASS',pendingGuards:'PASS',unchangedConfig:'PASS'};
  }
  async function open(){
    const selector='button[data-extension-key="app:scrapyjs"][data-extension-action="main"]';
    await until(()=>host.read('!!document.querySelector('+JSON.stringify(selector)+')'),'installed scrapyjs App entry');
    await click(host,selector);
    const target=await until(async()=>{
      const targets=(await browser.call('Target.getTargets')).targetInfos.filter(row=>row.type==='iframe'&&
        row.url.startsWith('chrome-extension://'+view.extensionId+'/')&&row.url.includes('/sidebar-tools/sandbox.html'));
      // Never accidentally test another simultaneously open App iframe.
      return targets.length===1?targets[0]:null;
    },'unique actual App sandbox');
    const session=await browser.attach(target.targetId);
    session.inputHost=host;session.inputOwnerSelector='iframe.sidebar-tool-iframe';
    await until(()=>session.read('!!globalThis.OpenDeskTool?.root?.querySelector("#config-json")'),'App config editor rendered');
    const isolation=await session.read('({origin:globalThis.origin,chromeStorage:typeof chrome?.storage,request:typeof OpenDeskTool.request})');
    assert.equal(isolation.origin,'null');assert.equal(isolation.chromeStorage,'undefined');assert.equal(isolation.request,'function');
    assert(await session.read('!!document.querySelector("#config-json")'),'Observed App root must be light DOM');
    await record('example-app-open',{targetId:target.targetId,isolation});return session;
  }
  async function table(value){
    const observed=await frame.read(`(()=>{const t=document.querySelector('#record-table');return {
      summary:document.querySelector('#record-summary')?.textContent??null,
      table:t?{visible:!!t.getClientRects().length,headers:Array.from(t.querySelectorAll('thead th'),e=>e.textContent.trim()),
        rows:Array.from(t.querySelectorAll('tbody tr'),tr=>Array.from(tr.querySelectorAll('td'),td=>td.textContent.trim()))}:null};})()`);
    await record('example-app-table-observed',observed);
    assert(observed.table,'App must render its record table');
    assert.equal(observed.summary,'共 '+value.data.length+' 条记录'+(value.data.length>50?'，表格显示前 50 条；完整记录见 JSON / 下载':''));
    assert(observed.table.visible,'Rendered record table must be visible');
    const keys=[...new Set(value.data.flatMap(row=>Object.keys(row)))];
    assert.deepEqual([...observed.table.headers].sort(),[...keys].sort(),'Table must include every returned field');
    const cell=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
    assert.deepEqual(observed.table.rows,value.data.slice(0,50).map(row=>observed.table.headers.map(key=>cell(row[key]).trim())),'Rendered table must equal the documented durable record preview');
    return {...observed,check:'PASS'};
  }
  try{
    await record('example-app-input',evidence.package);
    await click(host,'#tab-tools');await click(host,'#extension-center-more');await click(host,'#extension-center-import');
    await fileInput(host,'#sidebar-tool-file',file);
    const review=await until(()=>host.read(`(()=>{const e=document.querySelector('#sidebar-tool-preview');return e&&!e.hidden&&!document.querySelector('#sidebar-tool-install').disabled?
      {title:document.querySelector('#sidebar-tool-preview-title').textContent,body:e.innerText}:null})()`),'original App install review');
    await record('example-app-review',review);assert.equal(review.title.trim(),pkg.title);
    assert.equal(sha(await readFile(file)),sha(bytes),'App package changed during review');
    await click(host,'#sidebar-tool-install');frame=await open();
    await until(()=>frame.read('document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")||document.querySelector("#app-error")?.textContent'),'App initial storage read settled');
    let state=await ui();await record('example-app-initial',state);assert(!state.error,state.error);
    const identity={targetId:frame.targetId,url:await frame.read('location.href'),eventCursor:browser.events.length};
    evidence.instance=identity;
    const seenRuns=new Set(),seenRequests=new Set(),seenResults=new Set();
    async function sameInstance(){
      assert.equal(frame.targetId,identity.targetId);
      assert.equal(await frame.read('location.href'),identity.url,'Run must preserve the same App iframe URL');
      const destroyed=browser.events.slice(identity.eventCursor).filter(event=>event.sessionId===frame.sessionId&&
        ['Runtime.executionContextsCleared','Runtime.executionContextDestroyed'].includes(event.method));
      assert.deepEqual(destroyed,[],'App execution context must survive all three scenarios');
    }
    for(const entry of configs){
      const scenario={name:entry.name,status:'RUNNING',config:entry.config,configSha256:sha(JSON.stringify(entry.config)),
        expectedData:entry.expectedData,...(entry.expectedAudit?{expectedAudit:entry.expectedAudit}:{})};
      evidence.scenarios.push(scenario);await record('example-app-scenario-input',scenario);
      await browser.call('Target.activateTarget',{targetId:view.target.targetId});
      await click(frame,'#refresh-target');
      await until(()=>frame.read('document.querySelector("#host-status")?.textContent.includes("当前网页已连接")'),'App trustworthy target refreshed');
      await fill(frame,'#config-json',JSON.stringify(entry.config,null,2));
      state=await ui();assert(!state.configError,state.configError);assert(!state.error,state.error);
      assert.deepEqual(JSON.parse(state.config),entry.config,'App editor must contain the complete supplied config');
      scenario.structuredEditors=await applyExistingControls(entry);
      await until(()=>frame.read('document.querySelector("#start")?.disabled===false'),'App Start ready');
      await click(frame,'#start');
      const terminal=await until(async()=>{
        const current=await ui();scenario.lastUI=current;
        if(current.error)return {error:current.error,ui:current};
        let snapshot;try{snapshot=JSON.parse(current.result);}catch{return null;}
        return snapshot.runId&&!seenRuns.has(snapshot.runId)&&snapshot.retirementState==='released'?{snapshot,ui:current}:null;
      },entry.name+' App durable result and original retirement',120000);
      scenario.ui=terminal.ui;scenario.snapshot=terminal.snapshot;
      await record('example-app-actual-result',scenario);
      assert(!terminal.error,terminal.error);
      const snapshot=terminal.snapshot;
      assert(!seenRuns.has(snapshot.runId));assert(!seenRequests.has(snapshot.clientRequestId));assert(!seenResults.has(snapshot.resultId));
      seenRuns.add(snapshot.runId);seenRequests.add(snapshot.clientRequestId);seenResults.add(snapshot.resultId);
      scenario.value=durableValue(snapshot,pin);
      await record('example-app-durable-value',{name:entry.name,value:scenario.value});
      assert.deepEqual(scenario.value.data,entry.expectedData,entry.name+' complete App data');
      for(const [key,expected] of Object.entries(entry.expectedAudit||{})){
        assert(Object.hasOwn(scenario.value.audit||{},key),'Missing audit field: '+key);
        assert.deepEqual(scenario.value.audit[key],expected,entry.name+' App audit.'+key);
      }
      scenario.presentation=await table(scenario.value);
      if(Object.hasOwn(entry,'expectedSummary'))assert.deepEqual(scenario.presentation.summary,entry.expectedSummary);
      await sameInstance();scenario.status='PASS';await record('example-app-scenario-pass',scenario);
    }
    const last=evidence.scenarios.at(-1);
    // Save the current config through the App, then prove it survives actual teardown/reopen.
    await click(frame,'#save-config');
    await until(()=>frame.read('!document.querySelector("#config-json").disabled&&(document.querySelector("#app-error").textContent||document.querySelector("#app-notice").textContent.includes("配置已保存"))'),'App save and readback settled');
    state=await ui();await record('example-app-save',state);assert(!state.error,state.error);assert(state.notice?.includes('配置已保存'));
    assert.deepEqual(JSON.parse(state.config),last.config);
    // One actual JSON download; verify completion and full file bytes before closing the App.
    const downloadRoot=resolve(out,'downloads');await mkdir(downloadRoot,{recursive:true});
    const downloadPath=await mkdtemp(join(downloadRoot,'example-app-'));
    await browser.call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath,eventsEnabled:true});
    const cursor=browser.events.length;
    await click(frame,'#download-json');
    const begun=await until(()=>browser.events.slice(cursor).find(event=>event.method==='Browser.downloadWillBegin'&&
      event.params.url.startsWith('data:application/json;')),'App JSON download begins');
    const completed=await until(()=>browser.events.slice(cursor).find(event=>event.method==='Browser.downloadProgress'&&
      event.params.guid===begun.params.guid&&['completed','canceled'].includes(event.params.state)),'App JSON download completes');
    assert.equal(completed.params.state,'completed');
    const downloadFile=join(downloadPath,begun.params.guid),downloadBytes=await readFile(downloadFile);
    evidence.download={path:downloadFile,bytes:downloadBytes.length,sha256:sha(downloadBytes),guid:begun.params.guid,
      suggestedFilename:begun.params.suggestedFilename,completion:completed.params};
    await record('example-app-download',evidence.download);
    assert.deepEqual(JSON.parse(downloadBytes),last.snapshot,'JSON download must contain the complete actual snapshot');
    evidence.jsonDownload='PASS_FILE_BYTES';await sameInstance();
    await click(host,'#sidebar-tool-back');
    // Do not mistake a cached, undestroyed frame for a persistence test.
    await until(async()=>!(await browser.call('Target.getTargets')).targetInfos.some(target=>target.targetId===identity.targetId),'original App iframe destroyed');
    frame=await open();assert.notEqual(frame.targetId,identity.targetId,'Reopen must create a new App iframe');
    const reopened=await until(async()=>{
      const current=await ui();if(current.error)return current;
      return current.notice?.includes('已读取保存配置')?current:null;
    },'reopened App original saved config read');
    await record('example-app-reopen',reopened);assert(!reopened.error,reopened.error);
    assert.deepEqual(JSON.parse(reopened.config),last.config,'Reopened config must match the complete saved current config');
    assert.equal(sha(await readFile(file)),sha(bytes),'App package changed during native scenarios');
    evidence.saveReopen='PASS';evidence.status='PASS';report.app='PASS_EXAMPLES';
    await record('example-app-pass',evidence);
  }catch(error){
    evidence.status='FAIL';report.app='FAIL';evidence.error={message:error.message,stack:error.stack};
    const pending=evidence.scenarios.find(row=>row.status==='RUNNING');if(pending){pending.status='FAIL';pending.error=error.message;}
    evidence.notRun=configs.filter(entry=>!evidence.scenarios.some(row=>row.name===entry.name)).map(entry=>entry.name);
    if(frame){try{evidence.lastUI=await ui();evidence.body=await frame.read('document.body.innerText');}catch(e){evidence.observationError=e.message;}}
    await record('example-app-failure',evidence);throw error;
  }
}
