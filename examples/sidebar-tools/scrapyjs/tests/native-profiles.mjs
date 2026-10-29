// Independent owned Profile lane. --candidate=<file> runs the upgrade lane.
// --supplement-report=<completed report> clones that released Profile for legacy/crawl checks only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOwned,openNativePanel,until,click,fill,fileInput,sha,selectProfile} from './native-session.mjs';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const opt=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const seedReport=resolve(opt('seed-report')||join(root,'artifacts/scrapyjs/native-examples/app-d-driver5-20261029/report.json'));
const out=resolve(opt('out')||join(root,'artifacts/scrapyjs/native-profiles',new Date().toISOString().replaceAll(':','-')));
const demo='http://127.0.0.1:43111/demo-form.html';
const report={status:'RUNNING',scope:'OWNED_DEVELOPMENT_PROFILE_UI',startedAt:new Date().toISOString(),events:[],runs:[],productionAcceptance:'NOT_TESTED',stop:'OUT_OF_SCOPE',csv:'OUT_OF_SCOPE'};
let browser,view,frame;
await mkdir(out,{recursive:true});
const persist=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
async function record(label,value){report.events.push({label,value,at:new Date().toISOString()});await persist();}
async function ui(){return frame.read(`(()=>{const g=id=>document.getElementById(id);return {
 config:g('config-json')?.value,error:g('app-error')?.textContent,configError:g('config-error')?.textContent,
 notice:g('app-notice')?.textContent,current:g('profile-current')?.textContent,runProfile:g('run-profile')?.textContent,
 result:g('result')?.textContent,nameError:g('profile-name-error')?.textContent,profiles:Array.from(document.querySelectorAll('#profile-list option[value]:not([value=""]),#profile-list button[data-profile-id]'),e=>({id:e.value||e.dataset.profileId,name:e.textContent,pressed:e.selected===undefined?e.getAttribute('aria-pressed'):String(e.selected)})),
 naming:!!g('profile-naming')&&!g('profile-naming').hidden,confirm:!!g('profile-confirm')&&!g('profile-confirm').hidden,
 field:g('field-key')?.value,selector:g('field-selector')?.value,
 controls:Array.from(document.querySelectorAll('#field-editor input,#field-editor select,#crawl-editor input,#crawl-editor textarea'),e=>({id:e.id,value:e.value,checked:e.checked})),
 disabled:Array.from(document.querySelectorAll('button,input,textarea,select'),e=>({id:e.id,disabled:e.disabled})),body:document.body.innerText};})()`);}
async function open(){
 await click(view.panel,'button[data-extension-key="app:scrapyjs"][data-extension-action="main"]');
 const t=await until(async()=>{const xs=(await browser.call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html')&&t.url.startsWith('chrome-extension://'+view.extensionId+'/'));return xs.length===1?xs[0]:null;},'unique original App iframe');
 frame=await browser.attach(t.targetId);await frame.call('Log.enable');frame.inputHost=view.panel;frame.inputOwnerSelector='iframe.sidebar-tool-iframe';
 await until(()=>frame.read('!!document.querySelector("#config-json")'),'original App config');
 await until(()=>frame.read('document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")||document.querySelector("#app-error")?.textContent'),'initial storage settled');
 assert.equal(await frame.read('globalThis.origin'),'null');
 await frame.read(`(()=>{globalThis.__profileEvents=[];for(const type of ['click','submit','invalid'])document.addEventListener(type,e=>{globalThis.__profileEvents.push({type,id:e.target.id,trusted:e.isTrusted,defaultPrevented:e.defaultPrevented});},{capture:true,passive:true});})()`);
 return ui();
}
async function reopen(){const old=frame.targetId;await click(view.panel,'#sidebar-tool-back');await until(async()=>!(await browser.call('Target.getTargets')).targetInfos.some(t=>t.targetId===old),'iframe actually destroyed');const state=await open();assert.notEqual(frame.targetId,old);return state;}
try{
 report.driver={path:fileURLToPath(import.meta.url),sha256:sha(await readFile(fileURLToPath(import.meta.url)))};
 const seedBytes=await readFile(seedReport),seed=JSON.parse(seedBytes);
 const previousBytes=opt('supplement-report')?await readFile(resolve(opt('supplement-report'))):null;
 const previous=previousBytes?JSON.parse(previousBytes):null;
 if(previous){assert.equal(previous.status,'PASS');assert(previous.ownedBrowserReleased);assert(opt('candidate'));report.scope='OWNED_DEVELOPMENT_PROFILE_LEGACY_CRAWL_SUPPLEMENT';report.reusedReport={path:resolve(opt('supplement-report')),sha256:sha(previousBytes),baseline:previous.baseline,upgrade:previous.candidate,runs:'REUSED_PREVIOUS_PASS_NOT_RERUN'};}
 const owned=(previous||seed).events.find(e=>e.label==='owned-browser')?.value;
 assert(seed.ownedBrowserReleased&&owned,'Seed must be a released task-owned browser report');
 report.seed={report:seedReport,sha256:sha(seedBytes),owned,package:seed.appExamples.package};
 const response=await fetch(demo,{signal:AbortSignal.timeout(3000)});assert(response.ok);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(await readFile(join(root,'examples/tasks/demo-form.html'))));
 browser=await launchOwned({root,out,binary:owned.binary,extension:owned.loadedExtension||owned.snapshot,seedProfile:owned.profile});
 assert.equal(browser.metadata.inputSha256,owned.inputSha256,'Use the exact previous extension snapshot');
 await record('owned-browser',browser.metadata);await record('chrome-version',await browser.call('Browser.getVersion'));
 view=await openNativePanel(browser,demo);await record('real-sidepanel',{extensionId:view.extensionId,context:view.context});
 await click(view.panel,'#tab-tools');
 const state=await open();
 if(previous){await record('supplement-initial',state);assert(!state.error,state.error);}
 else{
  await record('baseline-1.1.1',state);
  assert(!state.error,state.error);assert.deepEqual(JSON.parse(state.config),seed.appExamples.scenarios.at(-1).config,'Copied Profile retains complete old config');
  assert.equal(state.profiles.length,0,'1.1.1 baseline has no named profile manager');
  report.baseline='PASS_SINGLE_CONFIG_NAMED_MANAGEMENT_GAP';await persist();
 }
 if(opt('candidate'))await upgradeAndTest(seed,previous);
 report.status=opt('candidate')?'PASS':'BASELINE_PASS_AWAITING_CANDIDATE';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};process.exitCode=1;if(frame)try{report.lastUI=await ui();report.lastEvents=await frame.read('globalThis.__profileEvents');report.lastLogs=browser.events.filter(e=>e.sessionId===frame.sessionId&&e.method==='Log.entryAdded');}catch{}}
finally{
 if(browser){try{if(view){const shot=await view.panel.call('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'panel.png'),Buffer.from(shot.data,'base64'));}}catch{}
 try{await browser.close();report.ownedBrowserReleased=true;}catch(error){report.cleanupError=error.message;process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();await persist();console.log(JSON.stringify({status:report.status,out,error:report.error?.message}));
}
async function upgradeAndTest(seed,previous){
 const candidate=resolve(opt('candidate')),bytes=await readFile(candidate),pkg=JSON.parse(bytes);
 assert.equal(pkg.id,'scrapyjs');assert.notEqual(pkg.version,'1.1.1','Upgrade candidate must have a new version');
 const pin=pkg.delegatedTasks.find(t=>t.taskId==='scrapyjs.capture');
 assert.deepEqual(pin,seed.appExamples.package.taskPin,'This lane must retain the installed Task pin');
 report.candidate={path:candidate,sha256:sha(bytes),bytes:bytes.length,version:pkg.version,taskPin:pin};await persist();
 // Passive observation only: all storage operations below come from the original App UI.
 await view.panel.read(`(()=>{globalThis.__profileStorage=[];addEventListener('message',e=>{const m=e.data;
  if(m?.toolId==='scrapyjs'&&m.kind==='request'&&['storage.get','storage.set'].includes(m.operation))
   globalThis.__profileStorage.push(JSON.parse(JSON.stringify(m)));},{passive:true});})()`);
 const writes=()=>view.panel.read('globalThis.__profileStorage.filter(m=>m.operation==="storage.set"&&m.payload?.key==="capture-config")');
 const countWrites=async()=>(await writes()).length;
 const selected=s=>s.profiles.find(p=>p.pressed==='true');
 async function settled(text){return until(async()=>{const s=await ui();return !s.disabled.find(e=>e.id==='config-json')?.disabled&&s.notice?.includes(text)?s:null;},text);}
 async function checkEnvelope(){
  const all=await writes(),request=all.at(-1);assert(request,'UI must issue an original storage write');
  const value=request.payload.value;
  assert.equal(value.schemaVersion,1);assert(value.records.length<=10);assert(Buffer.byteLength(JSON.stringify(value))<=8192);
  const ids=new Set(),names=new Set();for(const row of value.records){
   assert.equal(typeof row.id,'string');assert(row.id&&!ids.has(row.id));ids.add(row.id);
   assert.equal(row.name,row.name.normalize('NFC').trim());assert([...row.name].length>=1&&[...row.name].length<=60);
   assert(Buffer.byteLength(row.name)<=180);assert(!names.has(row.name.toLowerCase()));names.add(row.name.toLowerCase());assert(row.config.itemConfig);
  }
  assert(value.selectedId===null||ids.has(value.selectedId));
  await record('original-storage-envelope',{request,value,bytes:Buffer.byteLength(JSON.stringify(value))});return value;
 }
 async function named(action,name){await click(frame,action);await until(async()=>(await ui()).naming,'name form opens');await fill(frame,'#profile-name',name);await click(frame,'#profile-name-submit');await record('name-submit-click',{action,name,state:await ui(),events:await frame.read('globalThis.__profileEvents'),form:await frame.read('({value:document.querySelector("#profile-name").value,form:document.querySelector("#profile-name-submit").form?.outerHTML})'),logs:browser.events.filter(e=>e.sessionId===frame.sessionId&&e.method==='Log.entryAdded')});assert(!browser.events.some(e=>e.sessionId===frame.sessionId&&e.method==='Log.entryAdded'&&e.params.entry.text.includes('Blocked form submission')),'Native sandbox blocked name form submission; trusted button click did not submit');return settled(action==='#rename-profile'?'配置已重命名':'配置已保存');}
 async function choose(id,discard=false){await selectProfile(frame,id);if(discard){assert((await ui()).confirm);await click(frame,'#profile-confirm-accept');}const s=await settled('已切换配置');assert.equal(selected(s)?.id,id);assert(!s.configError);assert.equal(s.selector,'','Successful switch clears pending field selector');return s;}
 async function newDraft(){const before=await countWrites();await click(frame,'#new-profile');const s=await ui();assert(!s.confirm);assert(!selected(s));assert.equal(await countWrites(),before,'New draft must not write storage');return s;}
 async function assertConfig(config){
  const s=await ui();assert.deepEqual(JSON.parse(s.config),config);
  const controls=Object.fromEntries(s.controls.map(c=>[c.id,c]));
  for(const [id,expected] of Object.entries({'list-container':config.itemConfig._listContainer||'','list-item':config.itemConfig._listItem||'',
   'next-selector':config.nextPageSelector||'','max-pages':String(config.maxPages??5),'dedupe-key':config.dedupeKey||'',
   'detail-url-field':config.detail?.urlField||'','detail-id-field':config.detail?.identityField||'',
   'detail-numbers':(config.detail?.numberFields||[]).join(',')}))assert.equal(controls[id]?.value,expected,'Synchronized '+id);
  assert.equal(controls['detail-enabled']?.checked,Boolean(config.detail),'Synchronized detail checkbox');
  assert.deepEqual(JSON.parse(controls['detail-fields'].value),config.detail?.itemConfig||{},'Synchronized complete detail itemConfig');
  return s;
 }
 async function cancelConfirmation(action){
  const before=await ui(),writesBefore=await countWrites();await (typeof action==='function'?action():click(frame,action));const pending=await ui();assert(pending.confirm,'Action must use the shared confirmation');
  await record('confirm-visible',{action:typeof action==='function'?'profile-selection':action,text:await frame.read('document.querySelector("#profile-confirm").innerText')});
  await click(frame,'#profile-confirm-cancel');const after=await ui();
  for(const k of ['config','current','field','selector','profiles','controls'])assert.deepEqual(after[k],before[k],k+' must survive cancel');
  assert.equal(await countWrites(),writesBefore,'Cancellation must not write');assert(!after.confirm);
 }
 async function legacyRoundTrip(legacy,b,B){
  await choose(legacy.id);const state=await assertConfig(legacy.config);
  assert.deepEqual(legacy.config,seed.appExamples.scenarios.at(-1).config,'Legacy matches the entire original seed list-detail config');
  await record('legacy-complete-config-and-crawl-controls',state);
  await choose(b.id);await assertConfig(B);await record('legacy-return-to-B',await ui());
 }
 async function dirtyChecks(a,b,A,B,modes){
  for(const mode of modes){
   if(mode==='invalid-json')await fill(frame,'#config-json','{"broken":');
   else if(mode==='unapplied-fields'){await fill(frame,'#field-key','pendingField');await fill(frame,'#field-selector','.not-applied');}
   else await fill(frame,'#next-selector','.pending-next-not-applied');
   let state=await ui();assert(state.disabled.find(e=>e.id==='start').disabled);assert(state.disabled.find(e=>e.id==='save-config').disabled);
   assert(state.disabled.find(e=>e.id==='copy-profile').disabled);assert(state.disabled.find(e=>e.id==='rename-profile').disabled);
   for(const action of [()=>selectProfile(frame,a.id),'#new-profile','#delete-profile'])await cancelConfirmation(action);
   await record('dirty-cancel-'+mode,await ui());
   await selectProfile(frame,a.id);assert((await ui()).confirm);await click(frame,'#profile-confirm-accept');await settled('已切换配置');
   state=await assertConfig(A);assert(!state.configError);assert.equal(state.field,'');assert.equal(state.selector,'');
   await record('dirty-switch-resynchronized-'+mode,state);await choose(b.id);await assertConfig(B);
  }
 }
 if(previous){
  assert.equal(sha(bytes),previous.candidate.sha256,'Supplement must use the exact tested candidate');
  report.legacy=previous.legacy;
  const [aRun,bRun]=previous.runs;assert.equal(aRun.status,'PASS');assert.equal(bRun.status,'PASS');
  const A=JSON.parse(aRun.ui.config),B=JSON.parse(bRun.ui.config),a=aRun.profile,b=bRun.profile;
  await assertConfig(B);await legacyRoundTrip(report.legacy,b,B);
  await dirtyChecks(a,b,A,B,['unapplied-crawl']);
  const reopened=await reopen();assert.equal(selected(reopened)?.id,b.id);await assertConfig(B);await record('supplement-final-reopened-B',reopened);
  await checkEnvelope();assert.equal(sha(await readFile(candidate)),sha(bytes),'Frozen candidate unchanged');
  report.profileSupplement='PASS';return;
 }
 await click(view.panel,'#sidebar-tool-back');await click(view.panel,'#extension-center-more');await click(view.panel,'#extension-center-import');
 await fileInput(view.panel,'#sidebar-tool-file',candidate);
 const review=await until(()=>view.panel.read(`(()=>{const e=document.querySelector('#sidebar-tool-preview');return e&&!e.hidden&&!document.querySelector('#sidebar-tool-install').disabled?{title:document.querySelector('#sidebar-tool-preview-title').textContent,body:e.innerText}:null})()`),'original upgrade review');
 await record('original-upgrade-review',review);assert.equal(review.title.trim(),pkg.title);
 assert.equal(sha(await readFile(candidate)),sha(bytes),'Candidate bytes changed before installation');await click(view.panel,'#sidebar-tool-install');
 let s=await open();await record('upgraded-legacy-config',s);
 assert(!s.error,s.error);assert.deepEqual(JSON.parse(s.config),seed.appExamples.scenarios.at(-1).config,'Upgrade retains legacy config without uninstall');
 assert.equal(await countWrites(),0,'Legacy initialization must not automatically rewrite storage');
 const oldSelected=selected(s);assert(oldSelected,'Legacy config must be selectable as a named record');report.legacy={id:oldSelected.id,name:oldSelected.name,config:JSON.parse(s.config)};
 const texts=['产品设计','浏览器技术','交互体验'];
 const A={url:demo,waitForSelector:'#sample-list > li',timeoutMs:10000,itemConfig:{_listContainer:'#sample-list',_listItem:'li',label:'.::text'}};
 const B={url:demo,waitForSelector:'#sample-list > li',timeoutMs:10000,itemConfig:{_listContainer:'#sample-list',_listItem:'li',topic:'.::text'}};
 await newDraft();await fill(frame,'#config-json',JSON.stringify(A,null,2));
 // Draft Save opens a cancellable name form and does not silently persist defaults.
 const beforeNaming=await countWrites();await click(frame,'#save-config');assert((await ui()).naming);await fill(frame,'#profile-name','Discarded name');await click(frame,'#profile-name-cancel');assert.equal(await countWrites(),beforeNaming);await assertConfig(A);
 s=await named('#save-config','  Cafe\u0301 A  '); // NFC normalization is part of the public naming contract.
 const a=selected(s);assert(a);assert.equal(a.name,'Café A');await assertConfig(A);await checkEnvelope();
 await newDraft();await fill(frame,'#config-json',JSON.stringify(B,null,2));s=await named('#save-config','Demo B');const b=selected(s);assert(b&&b.id!==a.id);await checkEnvelope();
 await choose(a.id);await assertConfig(A);s=await choose(b.id);await assertConfig(B);
 await legacyRoundTrip(report.legacy,b,B);
 s=await reopen();assert.equal(selected(s)?.id,b.id);await assertConfig(B);assert(s.notice.includes('已读取保存配置'));await record('A-B-save-switch-destroy-reopen',s);
 await choose(a.id);s=await named('#rename-profile','Demo A renamed');assert.equal(selected(s)?.id,a.id);assert.equal(selected(s)?.name,'Demo A renamed');await assertConfig(A);await checkEnvelope();
 const preCopy=await ui();s=await named('#copy-profile','Demo A copy');const copy=selected(s);assert(copy&&copy.id!==a.id);assert.equal(s.profiles.length,preCopy.profiles.length+1);await assertConfig(A);await checkEnvelope();
 // Case-insensitive uniqueness must reject without changing the current record or storage.
 const duplicateBefore=await ui(),writeBefore=await countWrites();await click(frame,'#rename-profile');await fill(frame,'#profile-name','demo b');await click(frame,'#profile-name-submit');
 s=await ui();assert(s.naming,'Duplicate name keeps naming form open');assert(/重复|已存在|同名/.test(s.nameError||s.error),'Duplicate must show a specific name error');assert.equal(await countWrites(),writeBefore);assert.deepEqual(s.profiles,duplicateBefore.profiles);await record('duplicate-name-rejected',s);await click(frame,'#profile-name-cancel');
 await cancelConfirmation('#delete-profile');await click(frame,'#delete-profile');assert((await ui()).confirm);await click(frame,'#profile-confirm-accept');
 await until(async()=>!(await ui()).profiles.some(p=>p.id===copy.id),'copy deleted after explicit confirmation');await checkEnvelope();
 await choose(b.id);
 // Invalid JSON and both unapplied editor groups protect cancellation and resynchronize only on acceptance.
 await dirtyChecks(a,b,A,B,['invalid-json','unapplied-fields','unapplied-crawl']);
 // A valid, applied dirty config can be copied, but cannot rename a saved profile.
 await fill(frame,'#config-json',JSON.stringify({...B,timeoutMs:11000}));s=await ui();assert(s.disabled.find(e=>e.id==='rename-profile').disabled);assert(!s.disabled.find(e=>e.id==='copy-profile').disabled);
 await cancelConfirmation('#new-profile');await click(frame,'#new-profile');await click(frame,'#profile-confirm-accept');s=await ui();assert(!selected(s));assert.notDeepEqual(JSON.parse(s.config),B,'New draft uses defaults');await choose(a.id,true);
 // Run exactly A and B. Do not rerun the earlier three script examples, Stop, or CSV.
 const identities={runId:new Set(),resultId:new Set(),clientRequestId:new Set()};
 for(const [id,config,expected] of [[a.id,A,texts.map(label=>({label}))],[b.id,B,texts.map(topic=>({topic}))]]){
  if(selected(await ui())?.id!==id)await choose(id);await assertConfig(config);
  const startProfile=selected(await ui());await browser.call('Target.activateTarget',{targetId:view.target.targetId});await click(frame,'#refresh-target');
  await until(()=>frame.read('document.querySelector("#start").disabled===false'),'real Run ready');
  await click(frame,'#start');
  const locked=await until(async()=>{const state=await ui();return state.disabled.find(e=>e.id==='new-profile')?.disabled?state:null;},'running management lock',5000);
  const editing=['new-profile','copy-profile','rename-profile','delete-profile','save-config','config-json','target-url','list-container','list-item','field-key','field-selector','field-read','field-attr','apply-field','next-selector','max-pages','dedupe-key','detail-enabled','detail-url-field','detail-id-field','detail-fields','detail-numbers','apply-crawl'];
  for(const control of editing)assert.equal(locked.disabled.find(e=>e.id===control)?.disabled,true,'Run locks '+control);
  assert(await frame.read(`document.querySelector("#profile-list").options?document.querySelector("#profile-list").disabled:Array.from(document.querySelectorAll("#profile-list button")).every(e=>e.disabled)`),'Run locks profile selection');
  assert(locked.runProfile?.includes(startProfile.name),'Running UI binds starting profile name');await record('running-disabled-guard',{id,profile:startProfile,state:locked});
  const terminal=await until(async()=>{const state=await ui();if(state.error)throw Error(state.error);let snapshot;try{snapshot=JSON.parse(state.result);}catch{return null;}return snapshot.runId&&snapshot.retirementState==='released'?{state,snapshot}:null;},'App original durable completed and released',120000);
  const {snapshot}=terminal,row=snapshot.durableResult;
  const evidence={profile:startProfile,expected,ui:terminal.state,snapshot};report.runs.push(evidence);await persist();
  assert.equal(snapshot.state,'completed');assert.equal(row?.tag,'controller-result');assert.equal(row.runId,snapshot.runId);assert.equal(row.resultId,snapshot.resultId);assert.equal(row.state,'completed');assert.equal(row.outcome?.ok,true);assert.equal(row.revision?.sourceHash,pin.contentHash);
  assert(Number.isSafeInteger(row.revision.revision)&&row.revision.revision>0);
  for(const key of Object.keys(identities)){assert(snapshot[key]&&!identities[key].has(snapshot[key]),'Unique '+key);identities[key].add(snapshot[key]);}
  const value=decodeValue(row.outcome.valueWire);assert.deepEqual(value.data,expected);assert.deepEqual(snapshot.result,value);assert.equal(value.engine?.status,'completed');assert(!value.error);assert(!value.engine?.error);assert(terminal.state.runProfile.includes(startProfile.name));
  evidence.status='PASS';await persist();
  // Switching must clear prior visible results and bind no new run to the old profile.
  if(id===a.id){await choose(b.id);s=await ui();assert.equal(s.result,'尚无结果');await record('switch-clears-results',s);}
 }
 s=await reopen();assert.equal(selected(s)?.id,b.id);await assertConfig(B);await record('final-reopened-B',s);
 await checkEnvelope();assert.equal(sha(await readFile(candidate)),sha(bytes),'Candidate unchanged during native run');
 report.profileManagement='PASS';
}
