// Targeted integration: original installer/Task and unchanged static development snapshot.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {launchOwned,openNativePanel,click,fill,fileInput,until,sha} from './native-session.mjs';
const root=resolve(new URL('../../../../',import.meta.url).pathname);
const option=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const seedPath=resolve(option('seed','artifacts/scrapyjs/legacy-ui-20261029/final-run-2/report.json'));
const candidate=resolve(option('candidate','artifacts/scrapyjs/react-20261029/candidate.opendesk-tool.json'));
const out=resolve(option('out','artifacts/scrapyjs/react-20261029/native'));
const report={status:'RUNNING',mode:'STATIC_DEVELOPMENT_NO_SERVE',production:'NOT_TESTED',events:[],selectionDriver:'DOM_SELECT_CHANGE_NOT_PHYSICAL_MAC_MENU'};
await mkdir(out,{recursive:true});let browser,view,frame;
const persist=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const record=async(label,value)=>{report.events.push({label,value});await persist();};
const ui=()=>frame.read(`(()=>{const g=id=>document.querySelector('#'+id);return {error:g('app-error')?.textContent,configError:g('config-error')?.textContent,notice:g('app-notice')?.textContent,config:g('config-json')?.value,summary:g('run-summary')?.textContent,result:g('result')?.textContent,profiles:[...g('profile-list').options].filter(x=>x.value).map(x=>({id:x.value,name:x.textContent,selected:x.selected}))};})()`);
async function open(){
 await click(view.panel,'button[data-extension-key="app:scrapyjs"][data-extension-action="main"]');
 const target=await until(async()=>{const ts=(await browser.call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html'));return ts.length===1?ts[0]:null;},'App iframe');
 frame=await browser.attach(target.targetId);frame.inputHost=view.panel;frame.inputOwnerSelector='iframe.sidebar-tool-iframe';
 await until(()=>frame.read('document.querySelector("#app-notice")?.textContent.includes("已读取保存配置")'),'App loaded');
 return ui();
}
async function reopen(){const old=frame.targetId;await click(view.panel,'#sidebar-tool-back');await until(async()=>!(await browser.call('Target.getTargets')).targetInfos.some(t=>t.targetId===old),'App destroyed');return open();}
async function settled(){return until(async()=>{const s=await ui();if(s.error||s.configError)throw Error(s.error||s.configError);return s.notice.includes('配置已保存')?s:null;},'conditional config save');}
try{
 const seed=JSON.parse(await readFile(seedPath));assert(seed.ownedBrowserReleased&&seed.browser);
 report.seed={path:seedPath,sha256:sha(await readFile(seedPath))};
 const old=seed.browser,bytes=await readFile(candidate),pkg=JSON.parse(bytes);
 report.candidate={path:candidate,sha256:sha(bytes),bytes:bytes.length,version:pkg.version,pin:pkg.delegatedTasks};
 const demo='http://127.0.0.1:43111/demo-form.html';
 const response=await fetch(demo,{signal:AbortSignal.timeout(3000)});assert(response.ok);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(await readFile(join(root,'examples/tasks/demo-form.html'))));
 browser=await launchOwned({root,out,binary:old.binary,extension:old.loadedExtension,seedProfile:old.profile,headless:!process.argv.includes('--headed')});
 report.browser=browser.metadata;assert.equal(browser.metadata.inputSha256,old.inputSha256);
 view=await openNativePanel(browser,demo);report.extensionId=view.extensionId;
 await click(view.panel,'#tab-tools');const baseline=await open();await record('preserved-before-upgrade',baseline.profiles);
 await click(view.panel,'#sidebar-tool-back');await click(view.panel,'#extension-center-more');await click(view.panel,'#extension-center-import');await fileInput(view.panel,'#sidebar-tool-file',candidate);
 const review=await until(()=>view.panel.read('(()=>{const e=document.querySelector("#sidebar-tool-preview");return e&&!e.hidden&&!document.querySelector("#sidebar-tool-install").disabled?e.innerText:null;})()'),'original installer review');await record('install-review',review);
 await click(view.panel,'#sidebar-tool-install');const upgraded=await open();
 assert.deepEqual(upgraded.profiles,baseline.profiles);assert.equal(await frame.read('OpenDeskPageReact.version'),'19.2.0');assert.equal(await frame.read('origin'),'null');
 await record('react-upgrade-preserves-configs',upgraded.profiles);
 await click(frame,'#new-profile');
 await fill(frame,'#field-key','title');await fill(frame,'#field-selector','.::text');
 // The form appends ::text itself; author the selector only.
 await fill(frame,'#field-selector','.');
 assert.equal(await frame.read('document.querySelector("#start").disabled'),true);
 await click(frame,'#tab-results');await click(frame,'#tab-rules');assert.equal(await frame.read('document.querySelector("#field-selector").value'),'.');
 await click(frame,'#apply-field');assert.equal(JSON.parse((await ui()).config).itemConfig.title,'.::text');
 await click(frame,'#save-config');await fill(frame,'#profile-name','React 核心采集');await click(frame,'#profile-name-submit');await settled();
 const saved=await ui();const selected=saved.profiles.find(x=>x.selected);assert(selected);
 assert.deepEqual(JSON.parse((await reopen()).config),JSON.parse(saved.config));
 await record('save-reopen',await ui());
 await browser.call('Target.activateTarget',{targetId:view.target.targetId});await click(frame,'#refresh-target');
 await until(()=>frame.read('!document.querySelector("#start").disabled'),'current target ready');
 await click(frame,'#start');
 const terminal=await until(async()=>{const s=await ui();if(s.error)throw Error(s.error);try{const r=JSON.parse(s.result);return r.retirementState==='released'?r:null;}catch{return null;}},'real Controller result',45000);
 assert.equal(terminal.status,'completed');assert.equal(terminal.result.engine.status,'completed');assert.deepEqual(terminal.result.data,[{title:'产品设计'},{title:'浏览器技术'},{title:'交互体验'}]);
 const table=await frame.read('[...document.querySelectorAll("#record-table tbody tr")].map(r=>[...r.cells].map(c=>c.textContent))');assert.deepEqual(table,[['产品设计'],['浏览器技术'],['交互体验']]);
 await record('real-task-and-table',terminal);
 const downloadDir=join(out,'downloads');await mkdir(downloadDir,{recursive:true});await browser.call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true});
 report.downloads={};
 for(const format of ['json','csv']){
  const cursor=browser.events.length;await click(frame,'#download-'+format);
  const begun=await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadWillBegin'),'download begins');
  await until(()=>browser.events.slice(cursor).find(e=>e.method==='Browser.downloadProgress'&&e.params.guid===begun.params.guid&&e.params.state==='completed'),'download complete');
  const body=await readFile(join(downloadDir,begun.params.guid));
  if(format==='json')assert.deepEqual(JSON.parse(body),terminal);else assert.equal(body.toString(),'"title"\r\n"产品设计"\r\n"浏览器技术"\r\n"交互体验"');
  report.downloads[format]={bytes:body.length,sha256:sha(body),filename:begun.params.suggestedFilename};
 }
 const stopping={...JSON.parse(saved.config),waitForSelector:'#scrapyjs-never-present',timeoutMs:30000};
 await fill(frame,'#config-json',JSON.stringify(stopping));await click(frame,'#start');
 await until(()=>frame.read('!document.querySelector("#stop").disabled'),'stop available');await click(frame,'#stop');
 const stopped=await until(async()=>{const s=await ui();try{const r=JSON.parse(s.result);return r.retirementState==='released'?r:null;}catch{return null;}},'same original instance stops',45000);
 assert.notEqual(stopped.clientRequestId,terminal.clientRequestId);assert(['cancelled','stopped'].includes(stopped.status)||stopped.result?.engine?.status==='cancelled');
 await record('stop-original-instance',stopped);
 await fill(frame,'#config-json','{"unfinished');await click(frame,'#new-profile');await click(frame,'#profile-confirm-cancel');
 assert.equal((await ui()).config,'{"unfinished');assert.equal(await frame.read('document.querySelector("#start").disabled'),true);
 await record('invalid-draft-cancel',await ui());
 const shot=await view.panel.call('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'panel.png'),Buffer.from(shot.data,'base64'));
 assert.equal(sha(await readFile(candidate)),sha(bytes));report.status='PASS_CORE_REACT_INTEGRATION';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};if(frame)report.lastUI=await ui().catch(()=>null);process.exitCode=1;}
finally{if(browser)try{await browser.close();report.ownedBrowserReleased=true;}catch(error){report.cleanupError=error.message;process.exitCode=1;}await persist();console.log(JSON.stringify({status:report.status,out,error:report.error?.message}));}
