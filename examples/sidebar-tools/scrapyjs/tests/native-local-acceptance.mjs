// Actual installed App on an owned, closed Task-verification Profile clone.
// Local DOM fixture only; this never enables production HTTP or sends AI input.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {launchOwned,openNativePanel,click,fill,fileInput,until,sha} from './native-session.mjs';
const root=resolve(new URL('../../../../',import.meta.url).pathname);
const opt=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const out=resolve(opt('out','artifacts/scrapyjs/r242-local-acceptance/native-app'));
const resume=opt('resume',null);
const seedPath=resolve(resume||opt('seed','artifacts/scrapyjs/r242-local-acceptance/native-task-valid-input/report.json'));
const candidate=resolve(opt('candidate','examples/sidebar-tools/scrapyjs/scrapyjs.opendesk-tool.json'));
const report={status:'RUNNING',mode:'STATIC_DEVELOPMENT_SNAPSHOT_NO_SERVE',productionHttp:'BLOCKED',
  realAi:'NOT_TESTED',physicalMacUi:'NOT_TESTED',events:[]};
await mkdir(out,{recursive:true});let browser,view,frame;
const persist=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const record=async(label,value)=>{report.events.push({label,value});await persist();};
const main='button[data-extension-key="app:scrapyjs"][data-extension-action="main"]';
const ui=()=>frame.read(`(()=>{const g=id=>document.querySelector('#'+id);return {
 error:g('app-error')?.textContent,configError:g('config-error')?.textContent,
 notice:g('app-notice')?.textContent,config:g('config-json')?.value,result:g('result')?.textContent,
 profiles:[...g('profile-list').options].filter(o=>o.value).map(o=>({id:o.value,name:o.textContent,selected:o.selected}))};})()`);
async function open(){
 await click(view.panel,main);
 const t=await until(async()=>{const ts=(await browser.call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url.startsWith('chrome-extension://'+view.extensionId+'/')&&t.url.includes('/sidebar-tools/sandbox.html'));return ts.length===1?ts[0]:null;},'installed App iframe');
 frame=await browser.attach(t.targetId);frame.inputHost=view.panel;frame.inputOwnerSelector='iframe.sidebar-tool-iframe';
 await until(()=>frame.read('document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")'),'App storage readback');
 assert.equal(await frame.read('origin'),'null');return ui();
}
async function back(){
 const id=frame.targetId;
 const retired=async()=>!(await browser.call('Target.getTargets')).targetInfos.some(t=>t.targetId===id);
 await click(view.panel,'#sidebar-tool-back');
 const state=await until(async()=>await retired()?'retired':await view.panel.read('!document.querySelector("#sidebar-tool-action-review").hidden')?'draft-review':null,'App exit or draft review');
 if(state==='draft-review'){
  await record('unsaved-draft-review',await view.panel.read('document.querySelector("#sidebar-tool-action-review").innerText'));
  await click(view.panel,'#sidebar-tool-action-cancel');assert.equal(await retired(),false,'Cancel must preserve the App');
  await click(view.panel,'#sidebar-tool-back');
  await until(()=>view.panel.read('!document.querySelector("#sidebar-tool-action-review").hidden'),'repeat draft review');
  await click(view.panel,'#sidebar-tool-action-continue');
 }
 await until(retired,'App retired');
}
async function editConfig(value){await click(frame,'#tab-json');await fill(frame,'#config-json',JSON.stringify(value));}
async function more(){
 const point=await view.panel.read('(()=>{const e=document.querySelector('+JSON.stringify(main)+').closest(".ec-row");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await view.panel.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 await click(view.panel,'button[data-extension-key="app:scrapyjs"][data-extension-action="more"]');
}
async function run(){
 await browser.call('Target.activateTarget',{targetId:view.target.targetId});await click(frame,'#refresh-target');
 await until(()=>frame.read('!document.querySelector("#start").disabled'),'capture ready');await click(frame,'#start');
 return until(async()=>{const s=await ui();if(s.error)throw Error(s.error);try{const r=JSON.parse(s.result);return r.runId&&r.retirementState==='released'?r:null;}catch{return null;}},'durable capture completed',60000);
}
try{
 const seed=JSON.parse(await readFile(seedPath));assert(seed.ownedBrowserReleased);
 const priorStop=seed.events.find(e=>e.label==='stop-retired-readback')?.value;
 if(resume)assert(seed.lastUI?.notice==='已取消，未发起任务'||priorStop?.retirementState==='released'&&['stopped','cancelled'].includes(priorStop.state),'Resume requires confirmed cancellation or a retired Stop');
 else assert.equal(seed.taskInstall,'PASS_UI_RECEIPT');
 const owned=resume?seed.browser:seed.events.find(e=>e.label==='owned-browser').value;
 report.seed={path:seedPath,sha256:sha(await readFile(seedPath))};
 const bytes=await readFile(candidate),pkg=JSON.parse(bytes);report.package={id:pkg.id,version:pkg.version,sha256:sha(bytes)};
 browser=await launchOwned({root,out,binary:owned.binary,extension:owned.loadedExtension||owned.snapshot,seedProfile:owned.profile,headless:false});
 report.browser=browser.metadata;report.chrome=await browser.call('Browser.getVersion');
 view=await openNativePanel(browser,'http://127.0.0.1:43111/demo-form.html');report.extensionId=view.extensionId;
 const expected=await view.target.read('[...document.querySelectorAll("#sample-list li")].map(e=>({title:e.textContent.trim()}))');
 assert.deepEqual(expected,[{title:'产品设计'},{title:'浏览器技术'},{title:'交互体验'}]);
 await click(view.panel,'#tab-tools');
 const config={url:'http://127.0.0.1:43111/demo-form.html',waitForSelector:'#sample-list li',timeoutMs:10000,itemConfig:{_listContainer:'#sample-list',_listItem:'li',title:'.::text'}};
 let saved,second;
 if(resume){
  assert.equal(seed.package.sha256,sha(bytes));await open();
  let evidence=seed;
  const lineage=[];
  for(let depth=0;!evidence.events.some(e=>e.label==='named-save-reopen');depth++){
   assert(depth<4&&evidence.reusedEvidence,'Missing capture evidence');
   const ref=evidence.reusedEvidence,body=await readFile(ref.path);assert.equal(sha(body),ref.sha256);
   lineage.push({path:ref.path,sha256:ref.sha256});evidence=JSON.parse(body);
  }
  saved=evidence.events.find(e=>e.label==='named-save-reopen').value;
  second=evidence.events.find(e=>e.label==='repeat-without-extra-review').value;
  report.reusedEvidence={path:seedPath,sha256:sha(await readFile(seedPath)),labels:seed.events.map(e=>e.label)};
  report.evidenceLineage=lineage;
  assert.deepEqual((await ui()).profiles,saved.profiles);
 }else{
 await click(view.panel,'#extension-center-more');await click(view.panel,'#extension-center-import');
 await fileInput(view.panel,'#sidebar-tool-file',candidate);
 const review=await until(()=>view.panel.read('(()=>{const e=document.querySelector("#sidebar-tool-preview");return e&&!e.hidden&&!document.querySelector("#sidebar-tool-install").disabled?e.innerText:null})()'),'original install review');
 await record('install-review',review);assert.equal(sha(await readFile(candidate)),sha(bytes));await click(view.panel,'#sidebar-tool-install');await open();
 await click(frame,'#new-profile');await editConfig(config);await click(frame,'#save-config');
 await fill(frame,'#profile-name','R2.4.2 本地 DOM');await click(frame,'#profile-name-submit');
 await until(async()=>{const s=await ui();if(s.error)throw Error(s.error);return s.notice.includes('配置已保存');},'named save');
 saved=await ui();await back();assert.deepEqual((await open()).profiles,saved.profiles);assert.deepEqual(JSON.parse((await ui()).config),config);
 await record('named-save-reopen',await ui());
 // Passive observation of original SDK traffic; never replace SDK or storage.
 await view.panel.read(`(()=>{globalThis.__r242Requests=[];addEventListener('message',e=>{const m=e.data;if(m?.toolId==='scrapyjs'&&m.kind==='request')globalThis.__r242Requests.push(m.operation);},{passive:true});})()`);
 const first=await run();assert.equal(first.state,'completed');assert.deepEqual(first.result.data,expected);assert(first.durableResult?.resultId===first.resultId);
 assert.equal(first.durableResult.revision.sourceHash,pkg.delegatedTasks[0].contentHash);
 const table=await frame.read('[...document.querySelectorAll("#record-table tbody tr")].map(r=>[...r.querySelectorAll("td:not(.scrapy-record-action)")].map(c=>c.textContent))');assert.deepEqual(table,expected.map(x=>[x.title]));
 await record('real-dom-result',first);
 const downloads=join(out,'downloads');await mkdir(downloads,{recursive:true});await browser.call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloads,eventsEnabled:true});
 for(const format of ['json','csv']){
  const cursor=browser.events.length;await click(frame,'#download-'+format);
  const begin=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadWillBegin'),'download begins');
  const end=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadProgress'&&e.params.guid===begin.params.guid&&['completed','canceled'].includes(e.params.state)),'download completes');assert.equal(end.params.state,'completed');
  const body=await readFile(join(downloads,begin.params.guid));
  if(format==='json')assert.deepEqual(JSON.parse(body),first);else assert.equal(body.toString().replace(/^\uFEFF/,''),'"title"\r\n"产品设计"\r\n"浏览器技术"\r\n"交互体验"');
  await record(format+'-download-readback',{bytes:body.length,sha256:sha(body),filename:begin.params.suggestedFilename});
 }
 second=await run();assert.equal(second.state,'completed');assert.notEqual(second.runId,first.runId);assert.deepEqual(second.result.data,expected);
 const requests=await view.panel.read('globalThis.__r242Requests');await record('repeat-without-extra-review',{runId:second.runId,requests});
 assert.equal(await view.panel.read('!document.querySelector("#sidebar-tool-preview")||document.querySelector("#sidebar-tool-preview").hidden'),true);
 }
 if(priorStop){await record('stop-retired-readback',priorStop);}
 else{
 await editConfig({...config,waitForSelector:'#r242-never-present',timeoutMs:30000});
 await browser.call('Target.activateTarget',{targetId:view.target.targetId});await click(frame,'#start');
 const active=await until(async()=>{try{const r=JSON.parse((await ui()).result);return r.runId&&r.runId!==second.runId&&r.state==='running'&&r.retirementState!=='released'?r:null;}catch{return null;}},'original run actually active',30000);
 await record('stop-target-running',active);await click(frame,'#stop');
 const stopped=await until(async()=>{try{const r=JSON.parse((await ui()).result);return r.runId===active.runId&&r.retirementState==='released'?r:null;}catch{return null;}},'original Stop retires',45000);
 assert(['stopped','cancelled'].includes(stopped.state)||stopped.result?.engine?.status==='cancelled');await record('stop-retired-readback',stopped);
 }
 await editConfig(config);await back();
 // Obtain selectors from the rendered original menu; keep evidence on failure.
 await more();
 await record('app-menu',await view.panel.read('[...document.querySelectorAll("[role=menuitem]")].map(e=>({text:e.textContent,html:e.outerHTML}))'));
 const toggle=await view.panel.read('(()=>{const e=[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.trim()==="停用应用");return e?.dataset.ecContextAction||null;})()');
 assert.equal(toggle,'toggle');await click(view.panel,'[data-ec-context-action="toggle"]');
 await until(()=>view.panel.read('document.querySelector('+JSON.stringify(main)+')?.closest(".ec-row")?.innerText.includes("已停用")'),'disabled installation readback');
 await record('disabled-row',await view.panel.read('document.querySelector('+JSON.stringify(main)+')?.closest(".ec-row")?.innerText'));
 await more();
 const enable=await view.panel.read('(()=>{const e=[...document.querySelectorAll("[role=menuitem]")].find(e=>e.textContent.trim()==="启用应用");return e?.dataset.ecContextAction||null;})()');assert.equal(enable,'toggle');await click(view.panel,'[data-ec-context-action="toggle"]');
 await until(()=>view.panel.read('document.querySelector('+JSON.stringify(main)+')&&!document.querySelector('+JSON.stringify(main)+').disabled'),'restored App ready');
 const restored=await open();assert.deepEqual(restored.profiles,saved.profiles);assert.deepEqual(JSON.parse(restored.config),config);await record('restore-preserves-configuration',restored);
 assert.equal(await frame.read('[...document.querySelectorAll("button")].some(b=>!b.disabled&&/HTTP.*(?:试采|运行)|(?:试采|运行).*HTTP/i.test(b.textContent))'),false);
 assert.equal(sha(await readFile(candidate)),sha(bytes));report.status='PASS_REAL_BROWSER_LOCAL_DOM_APP';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};if(frame)report.lastUI=await ui().catch(()=>null);if(view)report.hostText=await view.panel.read('document.body.innerText').catch(()=>null);process.exitCode=1;}
finally{
 if(browser){
  try{
   const shot=await view?.panel.call('Page.captureScreenshot',{format:'png'});
   if(shot)await writeFile(join(out,'panel.png'),Buffer.from(shot.data,'base64'));
  }catch(error){report.functionalStatus=report.status;report.status='FAIL_EVIDENCE';report.screenshotError=error.message;process.exitCode=1;}
  // Screenshot collection must never prevent closing this task's owned CFT.
  try{await browser.close();report.ownedBrowserReleased=true;}
  catch(error){report.functionalStatus??=report.status;report.status='FAIL_CLEANUP';report.cleanupError=error.message;process.exitCode=1;}
 }
 await persist();console.log(JSON.stringify({status:report.status,error:report.error?.message,out}));
}
