#!/usr/bin/env node
// Attach only to the already retained, driver-owned frozen CFT. Never launch,
// pair, claim, rebuild, or close its browser. UI actions use real input events.
// Run from /tmp/opendesk-r37-candidate with development + developer env.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyPackage} from '../verify-package.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const installedPath=resolve(process.argv[2]||resolve(repo,'artifacts/r37-final-developer-installed/report.json'));
const output=resolve(process.argv[3]||resolve(repo,'artifacts/r37-developer-compat'));
const inspect=process.argv.includes('--inspect');
const finalize=process.argv.includes('--finalize');
const enableScripts=process.argv.includes('--enable-user-scripts');
const freshPreview=process.argv.includes('--generate-preview');
const coreOnly=process.argv.includes('--core-only');
const reusePreviewIndex=process.argv.indexOf('--reuse-offline-preview-evidence');
if(reusePreviewIndex!==-1)assert(process.argv[reusePreviewIndex+1]&&!process.argv[reusePreviewIndex+1].startsWith('--'),
  '--reuse-offline-preview-evidence requires an evidence directory');
const reusePreviewEvidence=reusePreviewIndex===-1?null:resolve(process.argv[reusePreviewIndex+1]);
assert(!(reusePreviewEvidence&&freshPreview),'reuse and generation of offline Preview evidence are mutually exclusive');
assert.equal(process.platform,'darwin');
assert.equal(await realpath(process.cwd()),await realpath('/tmp/opendesk-r37-candidate'));
assert.equal(process.env.OPENDESK_BUILD_MODE,'development');
assert.equal(process.env.OPENDESK_BROWSER_EDITION,'developer');
const installedBytes=await readFile(installedPath),installed=JSON.parse(installedBytes);
const installedReceiptSha256=createHash('sha256').update(installedBytes).digest('hex');
assert.equal(installed.browserRetained,true);
assert.equal(installed.extension,'/tmp/opendesk-r37-candidate/dist/development-developer');
await mkdir(output,{recursive:true});
const {chromium}=await import(process.env.OPENDESK_PLAYWRIGHT_MODULE||'/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const candidate=await verifyPackage(installed.extension,{mode:'development'});
assert.equal(installed.buildMode,'development');
assert.equal(candidate.packageHash,installed.packageHash,'retained browser must use this exact installed candidate');
assert.equal(candidate.edition,installed.edition);assert.equal(candidate.edition,'developer');
assert(installed.buildReceipt?.path&&installed.buildReceipt.sha256&&installed.buildReceipt.attemptId,'frozen build receipt required');
const buildBytes=await readFile(installed.buildReceipt.path),build=JSON.parse(buildBytes);
assert.equal(createHash('sha256').update(buildBytes).digest('hex'),installed.buildReceipt.sha256);
assert.equal(build.attemptId,installed.buildReceipt.attemptId);assert.equal(build.status,'passed');
assert.equal(build.mode,'development');assert.equal(build.report.mode,'development');
assert.equal(build.report.packageHash,candidate.packageHash);assert.equal(build.report.edition,candidate.edition);
const previous=finalize?JSON.parse(await readFile(resolve(output,'report.json'),'utf8')):null;
if(previous){
  assert.equal(previous.packageHash,candidate.packageHash);assert.equal(previous.edition,candidate.edition);
  assert.equal(previous.installedReceiptSha256,installedReceiptSha256,'cannot finalize evidence from another installed receipt');
  assert.deepEqual(previous.buildReceipt,installed.buildReceipt);
}
if(previous)await writeFile(resolve(output,'initial-attempt-report.json'),JSON.stringify(previous,null,2)+'\n',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
const report=previous||{source:'FROZEN_DEVELOPER_CANDIDATE_NATIVE_SIDE_PANEL',status:'RUNNING',extension:installed.extension,
  extensionId:installed.extensionId,packageHash:candidate.packageHash,buildMode:'development',edition:'developer',
  installedReceiptSha256,buildReceipt:installed.buildReceipt,
  startedAt:new Date().toISOString(),simulatedAuthority:false,steps:[],errors:[],externalConditions:[]};
report.stage='FROZEN_CANDIDATE_VALIDATION';
report.scope='NATIVE_MAC_SIDE_PANEL_DEVELOPER_COMPATIBILITY';
if(previous?.error){report.observationAttempts=[...(report.observationAttempts||[]),{error:previous.error,status:previous.status}];delete report.error;}
let browser,context,panel;
const failures=[];
async function snapshot(){return panel.evaluate(()=>({url:location.href,
  controls:[...document.querySelectorAll('button,input,select,textarea,summary,a')]
    .filter(n=>n.checkVisibility()).map(n=>({tag:n.tagName,id:n.id,text:(n.innerText||n.getAttribute('aria-label')||'').slice(0,120),
      value:n.matches('textarea')?'[source omitted]':n.value,disabled:n.disabled,
      options:n.tagName==='SELECT'?[...n.options].map(o=>({value:o.value,text:o.text})):undefined})),
  text:document.body.innerText.slice(-16000)}));}
async function evidence(name,data={}){
  report.steps.push({name,status:'PASS',...data});
  await panel.screenshot({path:resolve(output,name+'.png')});
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({name,status:'PASS',...data}));
}
async function findPanel(){for(const page of context.pages()){
  if(page.url().startsWith('chrome-extension://'+installed.extensionId+'/sidepanel.html')&&
    await page.evaluate(async()=>!await chrome.tabs.getCurrent()).catch(()=>false))return page;
}}
async function openDetails(id){
  if(!await panel.locator('#'+id).evaluate(n=>n.open))await panel.locator('#'+id+' > summary').click();
}
async function referenceOfflinePreview(){
  const files=[];
  for(const name of ['freeze.json','generation-final.json','browser-after.log']){
    const path=resolve(reusePreviewEvidence,name),bytes=await readFile(path);
    files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  const record={name:'independent-preview-evidence-reference',status:'REFERENCE_ONLY',scope:'UI_PREVIEW_ONLY',files,
    verification:'REFERENCE_BYTES_ONLY',inputClosureVerified:false,frozenCandidateVerified:false,
    previewExecuted:false,reason:'Existing offline evidence referenced by hash; no generation, browser replay or input-closure validation in this run.'};
  report.offlinePreviewStatus='REFERENCE_ONLY';report.steps.push(record);console.log(JSON.stringify(record));
}
async function independentPreview(){
  const builder=await readFile(resolve(repo,'scripts/preview/build-sidebar-six-react-preview.mjs'),'utf8');
  const styles=[...builder.match(/const stylePaths=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
  const paths=[...builder.match(/const inputs=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'|(\.\.\.stylePaths)/g)]
    .flatMap(x=>x[1]?[x[1]]:styles);
  const digest=async root=>createHash('sha256').update(Buffer.concat((await Promise.all(paths.map(async p=>[
    Buffer.from(p+'\0'),await readFile(resolve(root,p)),Buffer.from('\0')]))).flat())).digest('hex');
  const before=await digest(repo);
  const previewPath=freshPreview?resolve(output,'current-source-preview.html'):
    resolve(repo,'prototypes/sidebar/react-preview/index.html');
  if(freshPreview){
    const {generateSidebarSixReactPreview}=await import('../preview/build-sidebar-six-react-preview.mjs');
    let generated;
    try{generated=await generateSidebarSixReactPreview();}
    catch(error){
      report.steps.push({name:'independent-preview-generation',status:'FAIL',scope:'CURRENT_SOURCE_GENERATOR',
        error:String(error),inputSha256:before,generator:'scripts/preview/build-sidebar-six-react-preview.mjs'});
      throw error;
    }
    assert.equal(generated.inputSha256,before,'source inputs changed before generation');
    await writeFile(previewPath,generated.html);
  }
  const bytes=await readFile(previewPath);
  const declared=bytes.toString().match(/od-source-input-sha256" content="([a-f0-9]+)"/)[1];
  const worktree=await digest(repo),frozen=await digest('/tmp/opendesk-r37-candidate');
  if(freshPreview)assert.equal(worktree,before,'source inputs changed during generation');
  const identity={artifactSha256:createHash('sha256').update(bytes).digest('hex'),declaredInputSha256:declared,
    worktreeInputSha256:worktree,frozenInputSha256:frozen,inputCount:paths.length,
    generator:'scripts/preview/build-sidebar-six-react-preview.mjs#generateSidebarSixReactPreview',
    artifactPath:previewPath,currentSourceVerified:declared===worktree,
    frozenCandidateVerified:declared===frozen};
  report.steps.push({name:'independent-preview-identity',status:'OBSERVED',...identity});
  if(!identity.currentSourceVerified&&!report.externalConditions.some(c=>c.code==='STALE_INDEPENDENT_PREVIEW_ARTIFACT'))
    report.externalConditions.push({status:'NOT_TESTED',code:'STALE_INDEPENDENT_PREVIEW_ARTIFACT',
      operation:'current-source independent Preview',reason:'Generated Preview differs from frozen/current input hash; artifact left unchanged, no rebuild.'});
  const preview=await context.newPage(),errors=[],requests=[];
  preview.setDefaultTimeout(10000);
  preview.on('pageerror',error=>errors.push(String(error)));
  preview.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  try{
    await preview.goto(pathToFileURL(previewPath).href);
    await preview.locator('#tab-develop').click();
    if(await preview.locator('#local-project-mode').isChecked())await preview.locator('#local-project-mode').uncheck();
    const state=await preview.evaluate(()=>({url:location.href,text:document.body.innerText.slice(-9000),
      pages:[...document.querySelectorAll('[data-workbench-page]')].map(n=>({id:n.id,hidden:n.hidden})),
      sourceVisible:document.getElementById('script-source')?.checkVisibility(),
      localProject:document.getElementById('local-project-mode')?.checked}));
    await writeFile(resolve(output,'independent-preview-state.json'),JSON.stringify({state,errors,requests},null,2)+'\n');
    await preview.screenshot({path:resolve(output,'independent-preview-before-input.png')});
    assert(state.sourceVisible,'Independent Preview develop editor hidden after native tab click / manual mode');
    await preview.locator('#script-source').fill('async function main(){ return "R37 preview input"; }');
    assert.match(await preview.locator('#script-source').inputValue(),/R37 preview input/);
    await preview.locator('#page-component-react').check();
    assert.equal(await preview.locator('#script-run').isDisabled(),true,'offline Preview must not execute');
    await preview.screenshot({path:resolve(output,'independent-preview-develop.png')});
    await preview.locator('#tab-debug').click();
    assert.equal(await preview.locator('#debug-refresh').isDisabled(),true,'offline Preview has no Host');
    await preview.screenshot({path:resolve(output,'independent-preview-debug.png')});
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    const result={name:'independent-preview-artifact-smoke',status:'PASS',scope:'UI_PREVIEW_ONLY',
      ...identity,errors,networkRequests:requests};
    report.steps.push(result);console.log(JSON.stringify(result));
  }catch(error){
    await preview.screenshot({path:resolve(output,'independent-preview-failure.png')}).catch(()=>{});
    report.steps.push({name:'independent-preview-artifact-smoke',status:'FAIL',
      scope:identity.currentSourceVerified?'CURRENT_SOURCE_PREVIEW':'EXISTING_STALE_ARTIFACT_ONLY',
      error:String(error),errors,networkRequests:requests});
    console.log(JSON.stringify({name:'independent-preview-artifact-smoke',status:'FAIL',currentSourceVerified:identity.currentSourceVerified,error:String(error),errors}));
    if(identity.currentSourceVerified)throw error;
  }finally{await preview.close();}
}
async function enableUserScripts(){
  const url='chrome://extensions/?id='+installed.extensionId;
  const settings=context.pages().find(p=>p.url()===url)||await context.newPage();
  await settings.goto(url);await settings.bringToFront();
  const row=settings.locator('extensions-detail-view #allow-user-scripts');
  await row.waitFor({state:'visible'});
  const toggle=row.locator('cr-toggle');
  const before=await toggle.evaluate(n=>n.checked);
  const label=await row.innerText();
  await settings.screenshot({path:resolve(output,'user-scripts-before.png')});
  let gesture=null;
  if(!before){
    await toggle.evaluate(n=>n.addEventListener('click',event=>{
      n.dataset.r37Gesture=JSON.stringify({isTrusted:event.isTrusted,type:event.type,time:Date.now()});
    },{once:true,capture:true}));
    await toggle.click();
    gesture=JSON.parse(await toggle.getAttribute('data-r37-gesture'));
    assert.equal(gesture.isTrusted,true,'Chrome switch requires a real input gesture');
  }
  await toggle.waitFor({state:'visible'});
  assert.equal(await toggle.evaluate(n=>n.checked),true);
  await settings.screenshot({path:resolve(output,'user-scripts-after.png')});
  const record={url,extensionId:installed.extensionId,label,before,after:true,gesture,
    method:before?'ALREADY_ENABLED':'REAL_CHROME_EXTENSIONS_DETAIL_TOGGLE_CLICK',
    otherPermissionsChanged:false,developerModeChanged:false};
  await writeFile(resolve(output,'user-scripts-gesture.json'),JSON.stringify(record,null,2)+'\n');
  await settings.reload();await row.waitFor({state:'visible'});
  assert.equal(await toggle.evaluate(n=>n.checked),true,'Chrome UI persisted the switch');
  await evidence('user-scripts-authorized',record);
}
async function componentCase(framework,target){
  assert.equal(target.url(),'http://127.0.0.1:43111/demo-form.html','only the authorized local demo target');
  const token='r37-compat-'+framework+'-'+Date.now();
  const label='R37 '+framework+' '+token;
  const source=framework==='react'
    ? `import {useState} from 'react';\nexport default function App(){const [n,setN]=useState(0);return <button type="button" onClick={()=>setN(n+1)}>${label} {n}</button>;}`
    : `<script setup>\nimport {ref} from 'vue';\nconst n=ref(0);\n</script>\n<template><button type="button" @click="n++">${label} {{n}}</button></template>\n<style scoped>button{padding:8px}</style>`;
  await target.bringToFront();
  await panel.locator('#tab-develop').click();
  await panel.locator('#page-component-'+framework).check();
  await panel.locator('#script-source').fill(source);
  assert.equal(await panel.locator('#script-source').inputValue(),source);
  await openDetails('developer-program-management');await openDetails('script-version-identity');
  await panel.locator('#script-id').fill(token);await panel.locator('#script-revision').fill('1');
  await openDetails('page-preview-tools');
  await panel.locator('#page-candidate-save').click();
  await panel.waitForFunction(()=>['saved','error'].includes(document.getElementById('page-candidate-status')?.dataset.state),null,{timeout:45000});
  const save=await panel.locator('#page-candidate-status').innerText();
  assert.equal(await panel.locator('#page-candidate-status').getAttribute('data-state'),'saved',save);
  assert.equal(await panel.locator('#script-source').inputValue(),source,'preparation preserves author source');
  assert.equal(await target.getByRole('button',{name:label+' 0',exact:true}).count(),0,'save must not run Page code');
  await panel.locator('#page-program-refresh').click();
  await panel.waitForFunction(id=>[...document.querySelector('#page-program-list').options].some(n=>n.text.includes(id)),token);
  const savedOptions=await panel.locator('#page-program-list').locator('option').allTextContents();
  const prepared=await panel.locator('#page-component-status').innerText();
  await writeFile(resolve(output,framework+'-source.json'),JSON.stringify({token,source,sourceSha256:createHash('sha256').update(source).digest('hex')},null,2)+'\n');
  await evidence(framework+'-prepare-save',{token,save,prepared,savedOptions,saveDidNotRun:true});
  if(report.externalConditions.some(c=>c.code==='E_USER_SCRIPTS_UNAVAILABLE')){
    report.externalConditions.push({framework,status:'NOT_TESTED',code:'E_USER_SCRIPTS_UNAVAILABLE',
      operation:'Page component run / managed preview / stop',reason:'Same unchanged Chrome gate already observed; no duplicate runtime attempt.'});
    return;
  }
  await panel.locator('#script-run').click();
  const deadline=Date.now()+45000;
  while(!await target.getByRole('button',{name:label+' 0',exact:true}).isVisible()){
    const state=await panel.evaluate(()=>({status:document.getElementById('page-preview-status')?.dataset.state,
      text:document.getElementById('page-component-status')?.textContent||''}));
    if(state.text.includes('E_USER_SCRIPTS_UNAVAILABLE'))throw Object.assign(new Error(state.text),{code:'E_USER_SCRIPTS_UNAVAILABLE'});
    if(state.status==='error')throw new Error('Page component run rejected: '+state.text);
    assert(Date.now()<deadline,'Managed Page component did not become visible');
    await new Promise(r=>setTimeout(r,100));
  }
  await target.getByRole('button',{name:label+' 0',exact:true}).click();
  await target.getByRole('button',{name:label+' 1',exact:true}).waitFor({state:'visible'});
  await panel.waitForFunction(()=>document.getElementById('page-preview-status')?.dataset.state==='completed'&&
    document.getElementById('script-stop')?.disabled===false);
  const running=await panel.locator('#page-preview-status').innerText();
  const receipt=await panel.locator('#page-preview-result').innerText();
  const mounted=JSON.parse(await panel.locator('#page-preview-technical').textContent());
  assert.equal(mounted.state,'preview-evaluated');assert.equal(mounted.managedUI,true);
  assert.equal(typeof mounted.managedPreviewId,'string');assert(mounted.managedPreviewId.length>0);
  assert.match(mounted.sourceHash,/^[a-f0-9]{64}$/);
  await target.screenshot({path:resolve(output,framework+'-real-page.png')});
  await evidence(framework+'-run-preview',{token,targetUrl:target.url(),running,receipt,mounted,counterReadback:1});
  await panel.locator('#script-stop').click();
  await target.getByRole('button',{name:label+' 1',exact:true}).waitFor({state:'detached'});
  await panel.waitForFunction(()=>document.getElementById('script-stop')?.disabled===true);
  await panel.waitForFunction(()=>{
    if(document.getElementById('page-preview-status')?.dataset.state==='error')return true;
    try{return JSON.parse(document.getElementById('page-preview-result')?.textContent).state==='preview-retired';}
    catch{return false;}
  });
  const previewStatus=panel.locator('#page-preview-status'),componentStatus=panel.locator('#page-component-status');
  // Component mode presents its status and the disclosed technical receipt.
  // The shared JavaScript preview projection is intentionally hidden by the
  // field model; keep checking its data without treating it as visible UI.
  assert.equal(await componentStatus.isVisible(),true);
  const previewStatusText=await previewStatus.textContent(),componentStatusText=await componentStatus.innerText();
  assert.equal(await previewStatus.getAttribute('data-state'),'completed');assert.match(previewStatusText,/已停止/);
  assert.equal(await componentStatus.getAttribute('data-state'),'completed');assert.match(componentStatusText,/已停止/);
  assert.equal(await panel.locator('#script-status').isVisible(),true);
  assert.equal(await panel.locator('#script-status').getAttribute('data-state'),'completed');
  assert.match(await panel.locator('#script-status').innerText(),/受管组件已清理/);
  await openDetails('page-preview-technical-panel');
  const technical=panel.locator('#page-preview-technical');assert.equal(await technical.isVisible(),true);
  const stoppedTechnical=JSON.parse(await technical.innerText());
  const retirement=stoppedTechnical.stop;
  assert.equal(retirement.state,'preview-retired');
  assert.equal(retirement.previewId,mounted.managedPreviewId,'Stop must retire this exact mounted preview');
  assert.equal(retirement.sourceHash,mounted.sourceHash,'Stop must acknowledge the mounted compiled source');
  assert.equal(retirement.receipt?.ok,true);assert.equal(retirement.receipt.scope,'managed-ui-only');
  assert.equal(stoppedTechnical.framework,framework);
  assert.deepEqual(retirement,JSON.parse(await panel.locator('#page-preview-result').textContent()),
    'visible technical receipt must equal the stored preview result');
  await evidence(framework+'-stop',{previewStatusText,componentStatusText,
    taskStatusText:await panel.locator('#script-status').innerText(),retirement,managedUIRemoved:true,
    technicalReceiptVisible:true,sharedPreviewProjectionVisible:await previewStatus.isVisible()});
}
try{
  browser=await chromium.connectOverCDP(installed.cdpEndpoint);context=browser.contexts()[0];
  panel=await findPanel();
  if(!panel){
    const catalog=context.pages().find(p=>p.url().startsWith('chrome-extension://'+installed.extensionId+'/sidepanel.html?'));
    assert(catalog,'Existing driver-owned catalog required to open native panel');
    await catalog.locator('#catalog-open-dev-sidebar').click();
    browser=await chromium.connectOverCDP(installed.cdpEndpoint);context=browser.contexts()[0];
    for(let i=0;i<50&&!panel;i++){panel=await findPanel();if(!panel)await new Promise(r=>setTimeout(r,100));}
  }
  assert(panel,'Native Side Panel target required');panel.setDefaultTimeout(12000);
  panel.on('pageerror',error=>report.errors.push(String(error)));
  const identity=await panel.evaluate(async()=>({url:location.href,id:chrome.runtime.id,
    tab:await chrome.tabs.getCurrent(),contexts:await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}),
    tabs:[...document.querySelectorAll('[data-workbench-tab]')].filter(n=>!n.hidden).map(n=>n.dataset.workbenchTab)}));
  assert.equal(identity.id,installed.extensionId);assert.equal(identity.tab,undefined);
  assert(identity.contexts.some(c=>c.documentUrl===identity.url));
  assert.deepEqual(identity.tabs,['tasks','tools','workflow','develop','cloud','debug']);
  if(!finalize){
  await evidence('native-identity',identity);
  if(enableScripts)await enableUserScripts();
  if(!coreOnly){
  await panel.locator('#tab-debug').click();
  await panel.locator('#debug-refresh').click();
  await panel.waitForFunction(()=>!document.getElementById('debug-refresh').disabled);
  const debug=await snapshot();await writeFile(resolve(output,'debug-state.json'),JSON.stringify(debug,null,2)+'\n');
  await evidence('debug-refresh',{summary:await panel.locator('#debug-cloud-summary').innerText()});
  await panel.locator('#tab-develop').click();
  const develop=await snapshot();await writeFile(resolve(output,'develop-state.json'),JSON.stringify(develop,null,2)+'\n');
  await evidence('develop-visible');
  }
  }
  if(inspect){
    await panel.locator('#page-component-react').check();
    await writeFile(resolve(output,'react-state.json'),JSON.stringify(await snapshot(),null,2)+'\n');
    await evidence('react-visible');
  }
  if(inspect)report.status='INSPECTED_CORE_PENDING';
  else if(!finalize){
  let target=context.pages().find(p=>p.url()==='http://127.0.0.1:43111/demo-form.html');
    if(!target){target=await context.newPage();await target.goto('http://127.0.0.1:43111/demo-form.html');}
    for(const framework of ['react','vue']){
      try{await componentCase(framework,target);}catch(error){
        if(error.code==='E_USER_SCRIPTS_UNAVAILABLE')report.externalConditions.push({framework,status:'NOT_TESTED',code:error.code,
          operation:'Page component run / managed preview / stop',reason:error.message});
        else failures.push({name:framework,error:String(error.stack||error)});
        await writeFile(resolve(output,framework+'-failure-state.json'),JSON.stringify(await snapshot(),null,2)+'\n');
        await panel.screenshot({path:resolve(output,framework+'-failure.png')});
        console.log(JSON.stringify({name:framework,status:error.code==='E_USER_SCRIPTS_UNAVAILABLE'?'NOT_TESTED':'FAIL',error:String(error)}));
        // Cancel only our own preparation / managed preview through its real UI.
        if(await panel.locator('#script-stop').isVisible()&&await panel.locator('#script-stop').isEnabled()){
          await panel.locator('#script-stop').click();
          await panel.waitForFunction(()=>!document.getElementById('page-component-react').disabled).catch(()=>{});
        }
      }
    }
    report.failures=failures;
    report.coreStatus=failures.length?'FAIL':report.externalConditions.length?'PARTIAL_NOT_TESTED':'PASS';
    report.status=failures.length?'FAIL':'PASS_CORE_WITH_EXTERNAL_NOT_TESTED';
    if(failures.length)process.exitCode=1;
  }
  if(finalize){
    const remaining=[];
    for(const failure of report.failures||[]){
      const observed=JSON.parse(await readFile(resolve(output,failure.name+'-failure-state.json'),'utf8'));
      const condition=observed.text.match(/E_USER_SCRIPTS_UNAVAILABLE[^\n]*/)?.[0];
      if(condition){report.externalConditions.push({framework:failure.name,status:'NOT_TESTED',code:'E_USER_SCRIPTS_UNAVAILABLE',
        operation:'Page component run / managed preview / stop',reason:condition,
        originalObservation:'Initial target wait timed out; contemporaneous UI failure state identifies external Chrome gate. No retry or setting change.'});}
      else remaining.push(failure);
    }
    report.failures=remaining;report.finalizedAt=new Date().toISOString();
  }
  if(!inspect){
    if(reusePreviewEvidence)await referenceOfflinePreview();else await independentPreview();
    report.status=report.failures?.length?'FAIL':report.externalConditions.length?'PARTIAL_NOT_TESTED':
      reusePreviewEvidence?'PASS_NATIVE_CORE_WITH_PREVIEW_REFERENCE_ONLY':'PASS_NATIVE_CORE_WITH_UI_PREVIEW';
  }
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;
  if(panel)await panel.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});
}finally{
  report.packageHashAfter=(await verifyPackage(installed.extension,{mode:'development'})).packageHash;
  assert.equal(report.packageHashAfter,report.packageHash,'frozen candidate changed during observation');
  assert.equal(createHash('sha256').update(await readFile(installedPath)).digest('hex'),installedReceiptSha256,'installed receipt changed during observation');
  assert.equal(createHash('sha256').update(await readFile(installed.buildReceipt.path)).digest('hex'),installed.buildReceipt.sha256,'build receipt changed during observation');
  report.finishedAt=new Date().toISOString();
  await writeFile(resolve(output,inspect?'inspect-report.json':'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,error:report.error,packageHash:report.packageHash}));
}
// Disconnect this observer; retain the owned CFT and its existing profile.
setTimeout(()=>process.exit(process.exitCode||0),10);
