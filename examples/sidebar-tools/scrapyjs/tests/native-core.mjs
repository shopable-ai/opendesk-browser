// Usage: node examples/sidebar-tools/scrapyjs/tests/native-core.mjs [--source=compiled-controller.js] [--params=params.json]
// --probe-only opens the real panel without running a Controller. Default runs a clearly labelled original-Worker control.
// Optional --task-package=... imports a genuine Task package, then verifies/publishes/installs through the product UI.
// No chrome.storage/IndexedDB writes, direct installer calls, SDK replacement or fabricated run receipts.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOwned,openNativePanel,until,click,fill,fileInput,enableUserScripts,sha} from './native-session.mjs';
const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const opt=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)||fallback;
const out=resolve(root,opt('out','artifacts/scrapyjs/native-driver/'+new Date().toISOString().replaceAll(':','-')));
await mkdir(out,{recursive:true});
const report={scope:'DEVELOPMENT_REAL_CFT_ORIGINAL_CONTROLLER',startedAt:new Date().toISOString(),
  status:'RUNNING',productionAcceptance:'NOT_TESTED',originalWorker:'NOT_TESTED',scrapyEngine:'NOT_TESTED',
  listOrder:'NOT_TESTED',missingSelectorStop:'NOT_TESTED',sameApp:'NOT_TESTED',cancelBeforeReply:'NOT_TESTED',
  saveReopen:'NOT_TESTED',jsonDownload:'NOT_TESTED',taskInstall:'NOT_TESTED',events:[]};
let browser,view;
const record=async(label,value)=>{report.events.push({label,at:new Date().toISOString(),value});
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));};
const demoUrl='http://127.0.0.1:43111/demo-form.html';
const controlSource='async function main(){const data=[];for(let i=1;i<=3;i++)data.push(await page.locator("#sample-list li:nth-child("+i+")").textContent());return {driverControl:true,data};}';
async function observe(){return view.panel.read(`(()=>{const g=id=>document.getElementById(id);return {
 state:g('script-status')?.dataset.state,message:g('script-status')?.textContent,runId:g('script-run-id')?.value,
 output:g('script-result')?.textContent,sourceIdentity:g('script-task-version')?.textContent,
 target:g('script-current-page-debug')?.textContent,stopDisabled:g('script-stop')?.disabled,
 resultOptions:Array.from(g('script-download-result')?.options||[],x=>({value:x.value,text:x.textContent}))}})()`);}
async function showDevelop(){
  await until(()=>view.panel.read('!!document.querySelector("#tab-develop")'),'React navigation ready');
  const nav=await view.panel.read(`Array.from(document.querySelectorAll('button,a,[role=tab]')).filter(e=>e.textContent.trim()==='开发').map(e=>({tag:e.tagName,id:e.id,cls:e.className,html:e.outerHTML.slice(0,500)}))`);
  await record('develop-navigation',nav);
  assert.equal(nav.length,1,'Unique real 开发 entry');
  assert(nav[0].id,'Develop entry must have a stable observed ID');await click(view.panel,'#'+nav[0].id);
  await until(()=>view.panel.read('!!document.querySelector("#script-source")'),'React developer editor');
}
async function execute(source,params,label){
  await fill(view.panel,'#script-source',source);
  if(params)await fill(view.panel,'#script-params',JSON.stringify(params));
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await until(()=>view.panel.read('document.querySelector("#script-run")?.disabled===false'),'Run ready');
  await click(view.panel,'#script-run');
  const result=await until(async()=>{const state=await observe();
    if(state.state==='error')throw Error(state.message);
    return state.state==='results'&&state.runId?state:null;
  },label,45000);
  await record(label+'-terminal-ui',result);
  await click(view.panel,'#script-read');
  const durable=await until(async()=>{const text=await view.panel.read('document.querySelector("#script-history")?.textContent');
    try{const history=JSON.parse(text);return history.results?.some(r=>r.runId===result.runId&&r.resultId)?history:null;}catch{return null;}},'original durable Result identity');
  const run=durable.runs.find(r=>r.runId===result.runId),row=durable.results.find(r=>r.runId===result.runId);
  assert.equal(run.resultId,row.resultId);assert.equal(run.retirementState,'released');
  assert.equal(row.sourceHash,sha(source));
  if(row.error)throw Error('REAL_WORKER '+JSON.stringify(row.error));
  assert.match(result.sourceIdentity,/[a-f0-9]{64}/);
  await record(label,{sourceSha256:sha(source),result,durable});return result;
}
async function installTask(file,runId){
  // Existing catalog import creates a candidate only. Never seed an installed record.
  const pkg=JSON.parse(await readFile(file,'utf8'));
  assert.equal(pkg.manifest?.taskId,'scrapyjs.capture');
  await record('task-package-input',{file,sha256:sha(await readFile(file)),manifest:pkg.manifest});
  await fileInput(view.panel,'#task-package-file',file);
  await until(()=>view.panel.read('document.querySelector("#task-verify")?.disabled===false'),'imported candidate can verify');
  await fill(view.panel,'#task-verify-run',runId);
  await click(view.panel,'#task-verify');
  await until(()=>view.panel.read('document.querySelector("#task-publish")?.disabled===false'),'original verification succeeded');
  await click(view.panel,'#task-publish');
  await until(()=>view.panel.read('document.querySelector("#task-install")?.disabled===false'),'candidate Available');
  await record('task-review',await view.panel.read(`({body:document.body.innerText,button:document.querySelector('#task-install')?.textContent})`));
  // User explicitly authorized this lane's necessary installs. One trusted pointer confirmation only.
  await click(view.panel,'#task-install');
  const installed=await until(()=>view.panel.read(`(()=>{const t=document.querySelector('#task-status')?.textContent;return t?.includes('已安装 scrapyjs.capture')?t:null})()`),'original install confirmation',30000);
  report.taskInstall='PASS_UI_RECEIPT';await record('task-installed',{installed,installationIdentity:'NEEDS_READBACK'});
}
try{
  const bytes=await readFile(join(root,'examples/tasks/demo-form.html'));
  const response=await fetch(demoUrl,{signal:AbortSignal.timeout(3000)});
  assert(response.ok);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(bytes),'Existing demo server must serve the canonical fixture');
  await record('shared-services',{devPid:18395,demoPid:68658,owner:'UNKNOWN_PROTECTED',mutated:false});
  const binary=resolve(opt('chrome',process.env.CHROME_FOR_TESTING_BIN||join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')));
  browser=await launchOwned({root,out,binary});await record('owned-browser',browser.metadata);
  await record('chrome-version',await browser.call('Browser.getVersion'));
  view=await openNativePanel(browser,demoUrl);await record('real-sidepanel',{extensionId:view.extensionId,context:view.context});
  const oracle=await view.target.read('Array.from(document.querySelectorAll("#sample-list li"),e=>e.textContent.trim())');
  assert.deepEqual(oracle,['产品设计','浏览器技术','交互体验']);await record('independent-target-oracle',oracle);
  await record('user-scripts-consent',await enableUserScripts(browser,view.extensionId));
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await showDevelop();await record('initial-editor',await observe());
  if(!process.argv.includes('--probe-only')){
    const sourceFile=opt('source',null),source=sourceFile?await readFile(resolve(sourceFile),'utf8'):controlSource;
    const paramsFile=opt('params',null),params=paramsFile?JSON.parse(await readFile(resolve(paramsFile),'utf8')):null;
    const result=await execute(source,params,sourceFile?'scrapy-controller-result':'worker-control-result');
    let value;try{value=JSON.parse(result.output);}catch{throw Error('Original UI did not expose a JSON result: '+result.output);}
    if(!sourceFile){assert.equal(value.driverControl,true);assert.deepEqual(value.data,oracle);report.originalWorker='PASS_CONTROL_ONLY';}
    else{
      assert(value.engine&&value.stats&&Array.isArray(value.data),'Expected actual {data,stats,engine}');
      assert.deepEqual(value.data.map(row=>typeof row==='string'?row:row.title),oracle);
      report.originalWorker='PASS';report.scrapyEngine='PASS';report.listOrder='PASS';
    }
    const task=opt('task-package',null);if(task){assert(sourceFile,'Install requires actual compiled controller');await installTask(resolve(task),result.runId);}
  }
  report.status='PASS_SCOPED';
}catch(error){report.status='BLOCKED';report.error={message:error.message,stack:error.stack};
  if(view){try{report.lastEditor=await observe();report.lastUI=await view.panel.read('document.body.innerText');}catch{}}
  process.exitCode=1;
}finally{
  if(browser){try{if(view){const shot=await view.panel.call('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'panel.png'),Buffer.from(shot.data,'base64'));}}catch{}
    try{await browser.close();report.ownedBrowserReleased=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}
  report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,out,error:report.error?.message,originalWorker:report.originalWorker,scrapyEngine:report.scrapyEngine}));
}
