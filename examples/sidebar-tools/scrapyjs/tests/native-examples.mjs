// node examples/sidebar-tools/scrapyjs/tests/native-examples.mjs --suite=suite.json --out=artifacts/scrapyjs/examples-run
// Suite: [{name,source,draft?,params,expectedData?,expectedAudit?}]. All file paths resolve from cwd.
// params accepts a JSON file path or inline JSON object; expectations are inline JSON values.
// --task-package=file [--task-scenario=name] installs using that successful scenario (default: last).
// --app-package=file --app-configs=configs.json (or a literal JSON array) adds only the example App lane.
// App runs after successful Task installation; this never invokes the old milestone suite.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOwned,openNativePanel,enableUserScripts,until,click,fill,fileInput,sha} from './native-session.mjs';

const root=fileURLToPath(new URL('../../../../',import.meta.url));
const opt=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const out=resolve(opt('out')||join(root,'artifacts/scrapyjs/native-examples',new Date().toISOString().replaceAll(':','-')));
const demoUrl='http://127.0.0.1:43111/demo-form.html';
const report={scope:'DEVELOPMENT_REAL_CFT_ORIGINAL_CONTROLLER_EXAMPLES',status:'RUNNING',
  startedAt:new Date().toISOString(),productionAcceptance:'NOT_TESTED',app:'NOT_TESTED',
  taskInstall:'NOT_TESTED',scenarios:[],events:[]};
let browser,view;
const persist=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
async function record(label,value){report.events.push({label,at:new Date().toISOString(),value});await persist();}
async function input(file){const path=resolve(file),bytes=await readFile(path);return {path,bytes:bytes.length,sha256:sha(bytes)};}
async function unchanged(identity){assert.deepEqual(await input(identity.path),identity,'Input changed during native evidence: '+identity.path);}
async function observe(){return view.panel.read(`(()=>{const g=id=>document.getElementById(id);return {
  state:g('script-status')?.dataset.state,message:g('script-status')?.textContent,
  runId:g('script-run-id')?.value,output:g('script-result')?.textContent,
  sourceIdentity:g('script-task-version')?.textContent,target:g('script-current-page-debug')?.textContent}})()`);}
async function importState(){return view.panel.read(`(async()=>{const g=id=>document.getElementById(id);
  const text=g('program-generated-source')?.textContent||'';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  return {info:g('program-source-info')?.textContent,generatedSha256:hash,generatedBytes:new TextEncoder().encode(text).length,
    status:g('script-status')?.textContent};})()`);}

async function execute(entry){
  const scenario={name:entry.name,status:'RUNNING',inputs:{source:await input(entry.source)},expected:{}};
  report.scenarios.push(scenario);await persist();
  const source=await readFile(scenario.inputs.source.path,'utf8');
  const params=typeof entry.params==='string'?JSON.parse(await readFile(resolve(entry.params),'utf8')):entry.params;
  assert(params&&typeof params==='object'&&!Array.isArray(params),'params must be a JSON object or file');
  scenario.inputs.params=typeof entry.params==='string'?await input(entry.params):{sha256:sha(JSON.stringify(params)),encoding:'JSON.stringify'};
  scenario.params=params;
  // Preserve the compiled build evidence without requiring/rebuilding its source repository.
  for(const file of [entry.source+'.map',join(dirname(resolve(entry.source)),'artifact.json')]){
    try{(scenario.inputs.build??=[]).push(await input(file));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const previous=(await observe()).runId;
  if(entry.draft||Buffer.byteLength(source)>262144){
    assert(entry.draft,'Large compiled sources require their original --suite entry draft');
    scenario.inputs.draft=await input(entry.draft);
    const draft=JSON.parse(await readFile(scenario.inputs.draft.path,'utf8'));
    assert.equal(draft.sourceUtf8,source,'Original draft must contain the exact compiled source');
    await fileInput(view.bootstrap,'#task-package-file',scenario.inputs.draft.path);
    scenario.import=await until(async()=>{const state=await importState();
      return state.info?.includes(scenario.inputs.source.sha256)&&state.generatedSha256===scenario.inputs.source.sha256?state:null;
    },entry.name+' original draft import',30000);
    await unchanged(scenario.inputs.draft);
  }else await fill(view.panel,'#script-source',source);
  // Always overwrite params, including {}, so no preceding scenario can leak inputs.
  await fill(view.panel,'#script-params',JSON.stringify(params));
  await unchanged(scenario.inputs.source);
  if(scenario.inputs.params.path)await unchanged(scenario.inputs.params);
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await until(()=>view.panel.read('document.querySelector("#script-run")?.disabled===false'),entry.name+' Run ready');
  await click(view.panel,'#script-run');
  scenario.ui=await until(async()=>{const state=await observe();
    if(state.state==='error')return state;
    return state.state==='results'&&state.runId&&state.runId!==previous?state:null;
  },entry.name+' original Run terminal UI',120000);
  await persist();
  assert.notEqual(scenario.ui.state,'error',scenario.ui.message);
  assert(scenario.ui.sourceIdentity?.includes(scenario.inputs.source.sha256),'UI must expose the exact executed source SHA');
  // Refresh via the original Read button until the matching run is durably retired.
  scenario.durable=await until(async()=>{
    await click(view.panel,'#script-read');
    const text=await view.panel.read('document.querySelector("#script-history")?.textContent');
    let history;try{history=JSON.parse(text);}catch{return null;}
    const run=history.runs?.find(row=>row.runId===scenario.ui.runId);
    const result=history.results?.find(row=>row.runId===scenario.ui.runId&&row.resultId===run?.resultId);
    if(!run||!result)return null;
    scenario.lastDurable={run,result};
    return run.retirementState==='released'?{run,result}:null;
  },entry.name+' original durable identity and released retirement',30000);
  const {run,result}=scenario.durable;
  scenario.value=result.value;
  await persist(); // Preserve actual rows/value even when an expectation below fails.
  assert.equal(run.runId,scenario.ui.runId);
  assert(run.resultId,'Original durable resultId is required');
  assert.equal(result.tag,'controller-result');
  assert.equal(run.resultId,result.resultId);
  const failure=JSON.stringify(result.error||run.terminalReason||{});
  assert.equal(run.state,'completed',entry.name+' original run did not complete: '+failure);
  assert.equal(result.state,'completed',entry.name+' original result did not complete: '+failure);
  assert.equal(run.retirementState,'released');
  assert.equal(run.revision?.sourceHash,scenario.inputs.source.sha256);
  assert.equal(result.sourceHash,scenario.inputs.source.sha256);
  assert.equal(result.revision?.sourceHash,scenario.inputs.source.sha256);
  assert(!result.error,JSON.stringify(result.error));
  assert(scenario.value&&typeof scenario.value==='object','Durable result must contain a decoded value');
  assert(!scenario.value.error,JSON.stringify(scenario.value.error));
  assert(!scenario.value.engine?.error,JSON.stringify(scenario.value.engine?.error));
  assert.equal(scenario.value.engine?.status,'completed','Engine must actually complete');
  assert.deepEqual(JSON.parse(scenario.ui.output),scenario.value,'Visible value must equal the original durable result');
  if(Object.hasOwn(entry,'expectedData')){
    scenario.expected.data=entry.expectedData;
    await persist();assert.deepEqual(scenario.value.data,entry.expectedData,entry.name+' complete data');
  }
  if(Object.hasOwn(entry,'expectedAudit')){
    assert(entry.expectedAudit&&typeof entry.expectedAudit==='object'&&!Array.isArray(entry.expectedAudit),'expectedAudit must be an object');
    scenario.expected.audit=entry.expectedAudit;
    await persist();
    for(const [field,expected] of Object.entries(entry.expectedAudit)){
      assert(Object.hasOwn(scenario.value.audit||{},field),'Missing audit field: '+field);
      assert.deepEqual(scenario.value.audit[field],expected,entry.name+' audit.'+field);
    }
  }
  await unchanged(scenario.inputs.source);
  if(scenario.inputs.draft)await unchanged(scenario.inputs.draft);
  if(scenario.inputs.params.path)await unchanged(scenario.inputs.params);
  for(const build of scenario.inputs.build||[])await unchanged(build);
  scenario.status='PASS';await persist();return scenario;
}

async function installTask(file,scenario){
  const identity=await input(file),pkg=JSON.parse(await readFile(identity.path,'utf8'));
  assert.equal(pkg.manifest?.taskId,'scrapyjs.capture');
  assert.equal(pkg.manifest.program?.sourceHash,scenario.inputs.source.sha256,'Task must match the successful original run');
  assert.equal(sha(pkg.sourceUtf8),scenario.inputs.source.sha256);
  report.taskPackage=identity;await persist();
  const catalog=view.bootstrap;
  await until(()=>catalog.read('document.documentElement.dataset.opendeskSurface==="catalog"'),'original task catalog');
  await fileInput(catalog,'#task-package-file',identity.path);
  await until(()=>catalog.read('document.querySelector("#task-verify")?.disabled===false'),'Task verify ready');
  await fill(catalog,'#task-verify-run',scenario.durable.run.runId);
  await click(catalog,'#task-verify');
  await until(()=>catalog.read('document.querySelector("#task-publish")?.disabled===false'),'Task verified by successful run');
  await click(catalog,'#task-publish');
  await until(()=>catalog.read('document.querySelector("#task-install")?.disabled===false'),'Task publish ready');
  await record('task-review',await catalog.read('document.body.innerText'));
  await unchanged(identity);
  await click(catalog,'#task-install');
  report.taskReceipt=await until(()=>catalog.read(`(()=>{const text=document.querySelector('#task-status')?.textContent;return text?.includes('已安装 scrapyjs.capture')?text:null})()`),'original Task installation',30000);
  report.taskRunId=scenario.durable.run.runId;report.taskInstall='PASS_UI_RECEIPT';await persist();
}

await mkdir(out,{recursive:true});
try{
  assert(opt('suite'),'Required: --suite=<suite.json>');
  if(opt('app-package')||opt('app-configs'))assert(opt('app-package')&&opt('app-configs')&&opt('task-package'),
    'App lane requires --app-package, --app-configs and --task-package');
  report.inputs={driver:await input(fileURLToPath(import.meta.url)),suite:await input(opt('suite'))};
  let appConfigs;
  if(opt('app-package')){
    const raw=opt('app-configs').trim();
    if(raw.startsWith('[')){
      appConfigs=JSON.parse(raw);report.inputs.appConfigs={encoding:'literal JSON',sha256:sha(raw)};
    }else{
      report.inputs.appConfigs=await input(raw);
      appConfigs=JSON.parse(await readFile(report.inputs.appConfigs.path,'utf8'));
    }
    assert(Array.isArray(appConfigs)&&appConfigs.length,'--app-configs must contain a nonempty JSON array');
    report.inputs.appDriver=await input(fileURLToPath(new URL(opt('app-lane')==='original-sites'?'./native-sites-app.mjs':'./native-example-app.mjs',import.meta.url)));
    report.inputs.appPackage=await input(opt('app-package'));
  }
  const suite=JSON.parse(await readFile(report.inputs.suite.path,'utf8'));
  assert(Array.isArray(suite)&&suite.length,'suite must be a nonempty JSON array');
  report.scenarioOrder=suite.map(entry=>entry.name);
  const names=new Set();
  for(const entry of suite){
    assert(typeof entry.name==='string'&&entry.name&&!names.has(entry.name),'Scenario names must be unique and nonempty');names.add(entry.name);
    assert(typeof entry.source==='string'&&entry.source,'Each scenario requires a compiled source path');
  }
  if(opt('task-scenario'))assert(opt('task-package')&&names.has(opt('task-scenario')),'--task-scenario requires --task-package and an existing name');
  const response=await fetch(demoUrl,{signal:AbortSignal.timeout(3000)});
  assert(response.ok,'Canonical demo server is required');
  const fixture=await input(join(root,'examples/tasks/demo-form.html'));
  assert.equal(sha(Buffer.from(await response.arrayBuffer())),fixture.sha256,'Initial demo must be the canonical fixture');
  await record('canonical-demo',{url:demoUrl,...fixture});
  const extension=resolve(opt('extension')||join(root,'dist/development'));
  const binary=resolve(opt('chrome')||process.env.CHROME_FOR_TESTING_BIN||join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
  // Snapshot existing output only; never rebuild, reload daily Chrome, or stop a shared watcher.
  browser=await launchOwned({root,out,binary,extension,headless:!process.argv.includes('--headed')});
  await record('owned-browser',browser.metadata);report.buildSha256=browser.metadata.inputSha256;
  await record('chrome-version',await browser.call('Browser.getVersion'));
  view=await openNativePanel(browser,demoUrl);
  await record('real-sidepanel',{extensionId:view.extensionId,context:view.context});
  await record('user-scripts-consent',await enableUserScripts(browser,view.extensionId));
  await browser.call('Target.activateTarget',{targetId:view.target.targetId});
  await until(()=>view.panel.read('!!document.querySelector("#tab-develop")'),'real Develop navigation');
  await click(view.panel,'#tab-develop');
  await until(()=>view.panel.read('!!document.querySelector("#script-source")'),'real Develop editor');
  for(const entry of suite)await execute(entry);
  if(opt('task-package'))await installTask(opt('task-package'),opt('task-scenario')?
    report.scenarios.find(row=>row.name===opt('task-scenario')):report.scenarios.at(-1));
  if(opt('app-package')){
    for(const identity of [report.inputs.appDriver,report.inputs.appPackage,report.inputs.appConfigs])if(identity.path)await unchanged(identity);
    assert(!opt('app-lane')||opt('app-lane')==='original-sites','Unknown App lane');
    const {runExampleApp}=opt('app-lane')==='original-sites'?
      await import('./native-sites-app.mjs'):await import('./native-example-app.mjs');
    await runExampleApp({browser,view,candidate:opt('app-package'),configs:appConfigs,out,report,record,taskPackage:opt('task-package')});
    for(const identity of [report.inputs.appDriver,report.inputs.appPackage,report.inputs.appConfigs])if(identity.path)await unchanged(identity);
  }
  await unchanged(report.inputs.suite);await unchanged(report.inputs.driver);
  report.status=report.app==='PARTIAL_EXTERNAL_BLOCKER'?'PARTIAL_EXTERNAL_BLOCKER':'PASS_SCOPED';
}catch(error){
  report.status='BLOCKED';report.error={message:error.message,stack:error.stack};process.exitCode=1;
  const pending=report.scenarios.find(row=>row.status==='RUNNING');if(pending){pending.status='FAIL';pending.error=error.message;}
  report.notRun=(report.scenarioOrder||[]).filter(name=>!report.scenarios.some(row=>row.name===name));
  if(view){try{report.lastEditor=await observe();report.lastImport=await importState();
    report.lastHistory=await view.panel.read('document.querySelector("#script-history")?.textContent');
    report.lastUI=await view.panel.read('document.body.innerText');report.catalogUI=await view.bootstrap.read('document.body.innerText');}catch(e){report.observationError=e.message;}}
}finally{
  if(browser){
    try{if(view){const shot=await view.panel.call('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'panel.png'),Buffer.from(shot.data,'base64'));}}catch{}
    try{await browser.close();report.ownedBrowserReleased=true;}catch(error){report.cleanupError=error.message;report.status='BLOCKED';process.exitCode=1;}
  }
  report.finishedAt=new Date().toISOString();await persist();
  console.log(JSON.stringify({status:report.status,out,scenarios:report.scenarios.map(({name,status})=>({name,status})),error:report.error?.message}));
}
