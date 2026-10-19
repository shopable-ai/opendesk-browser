import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {verifyPackage} from '../verify-package.mjs';
const {chromium}=await import(process.env.OPENDESK_PLAYWRIGHT_MODULE||'playwright');
const installed=JSON.parse(await readFile(process.argv[2],'utf8')),out=resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const report={source:'NATIVE_MAC_TASK_COMPAT',status:'FAIL',extensionId:installed.extensionId,steps:[]};
let browser,panel,catalog;
const planTitle='R37 paused native schedule '+Date.now(),editedTitle=planTitle+' edited';
const record=async(name,data={})=>{report.steps.push({name,...data});await panel.screenshot({path:resolve(out,`${name}.png`)});};
try{
  const before=await verifyPackage(installed.extension,{mode:installed.buildMode});report.packageHash=before.packageHash;
  browser=await chromium.connectOverCDP(installed.cdpEndpoint);const context=browser.contexts()[0];
  for(const page of context.pages())if(page.url().includes('/sidepanel.html')){
    if(await page.evaluate(()=>chrome.tabs.getCurrent()))catalog=page;else panel=page;
  }
  assert(panel&&catalog,'real native panel and Catalog tab required');
  report.contexts=await panel.evaluate(()=>chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}));
  const target=context.pages().find(p=>p.url()==='http://127.0.0.1:43111/demo-form.html');assert(target);await target.bringToFront();
  const packagePath=resolve('examples/tasks/form-fill.v1.opendesk-task.json');
  const pkg=JSON.parse(await readFile(packagePath,'utf8'));
  if(await panel.locator('#schedule-cancel').isVisible()){
    await panel.locator('#schedule-cancel').click();
    if(await panel.locator('#schedule-discard-confirm').isVisible())await panel.locator('#schedule-discard-yes').click();
    await panel.locator('#schedule-form').waitFor({state:'hidden'});
  }
  for(let i=0;i<3&&await panel.locator('#scheduled-panel').isVisible();i++){
    const title=await panel.locator('#schedule-panel-title').textContent();await panel.locator('#schedule-back').click();
    await panel.waitForFunction(title=>document.querySelector('#scheduled-panel')?.hidden||document.querySelector('#schedule-panel-title')?.textContent!==title,title);
  }
  await panel.locator('[data-workbench-tab="tasks"]').click();
  if(process.argv[4]!=='--continue-installed'){
  if(!await panel.locator('#task-add-menu').isVisible())await panel.locator('#task-open-catalog').click();
  await panel.locator('#task-add-file').setInputFiles(packagePath);
  await panel.locator('#task-add-status').filter({hasText:'已导入待验证任务'}).waitFor();
  await record('candidate-import',{taskId:pkg.manifest.taskId});
  await panel.locator('[data-workbench-tab="develop"]').click();
  await panel.locator('#script-source').fill(pkg.sourceUtf8);
  if(!await panel.locator('#script-params').isVisible())await panel.locator('#manual-project-params-tools > summary').click();
  await panel.locator('#script-params').fill(JSON.stringify({name:'R37 Native Task'}));
  await target.locator('#name').fill('');
  const previousRun=await panel.locator('#script-task-id').textContent();
  await panel.locator('#script-run').click();
  await target.waitForFunction(()=>document.querySelector('#name')?.value==='R37 Native Task');
  await panel.waitForFunction(previous=>document.querySelector('#script-task-id')?.textContent!==previous&&
    !document.querySelector('#script-run')?.disabled&&document.querySelector('#script-result')?.textContent.includes('"ok": true'),previousRun);
  assert.equal(await target.locator('#name').inputValue(),'R37 Native Task');
  const runId=(await panel.locator('#script-task-id').textContent()).replace(/^runId：/,'').trim();assert(runId);
  await record('real-task-source-run',{runId});
  await catalog.locator('#task-catalog-refresh').click();
  await catalog.locator('.catalog-card').filter({hasText:pkg.manifest.title}).click();
  if(!await catalog.locator('#task-verify-run').isVisible())await catalog.locator('#catalog-verification > summary').click();
  await catalog.locator('#task-verify-run').fill(runId);await catalog.locator('#task-verify').click();
  await catalog.locator('#task-catalog-status').filter({hasText:'已核对本机持久运行及页面原生回执'}).waitFor();
  await catalog.locator('#task-publish').click();
  await catalog.locator('#task-catalog-status').filter({hasText:'已成为本地可安装版本'}).waitFor();
  await catalog.locator('#task-install').click();
  // The original permission review remains visible and receives an explicit user click.
  const consent=catalog.getByRole('dialog');
  if(await consent.isVisible()){
    report.permissionReview=await consent.innerText();
    const buttons=await consent.getByRole('button').allTextContents();
    const approve=buttons.find(text=>/确认安装|同意并安装|安装确定版本|允许并安装/.test(text));
    assert(approve,`unexpected review requires inspection: ${buttons}`);
    await consent.getByRole('button',{name:approve,exact:true}).click();
  }
  await catalog.locator('#task-catalog-status').filter({hasText:'已安装'}).waitFor();
  }
  await panel.locator('[data-workbench-tab="tasks"]').click();
  await panel.locator('[data-task-id="sample.form-fill"]').waitFor({state:'visible'});
  const card=panel.locator('[data-task-id="sample.form-fill"]');
  if(await card.getAttribute('aria-expanded')!=='true')await card.click();
  await record('task-installed',{text:await panel.locator('#workbench-tasks').innerText()});
  await panel.locator('#task-param-name').fill('R37 Installed Run');
  await target.locator('#name').fill('');
  await panel.locator('#task-run').click();
  await target.waitForFunction(()=>document.querySelector('#name')?.value==='R37 Installed Run');
  await panel.locator('#task-result-panel').waitFor({state:'visible'});
  await panel.waitForFunction(()=>document.querySelector('#task-result')?.textContent.includes('"ok": true'));
  assert.equal(await target.locator('#name').inputValue(),'R37 Installed Run');
  await record('installed-task-run');
  await panel.locator('#schedule-open').click();await panel.locator('#schedule-create').click();
  await panel.locator('#schedule-title').fill(planTitle);
  await panel.locator('#schedule-task-select').selectOption(pkg.manifest.taskId);
  await panel.locator('#schedule-target').fill('http://127.0.0.1:43111/demo-form.html');
  await panel.locator('#schedule-params').fill(JSON.stringify({name:'Scheduled R37'}));
  await panel.locator('#schedule-kind').selectOption('interval');await panel.locator('#schedule-minutes').fill('60');
  await panel.locator('#schedule-paused').check();await panel.locator('#schedule-save').click();
  await panel.locator('#schedule-save-confirm').waitFor({state:'visible'});await panel.locator('#schedule-confirm-yes').click();
  await panel.locator('#schedule-plan-list [data-schedule-id]').filter({hasText:planTitle}).waitFor({state:'visible'});
  const planId=await panel.locator('#schedule-plan-list [data-schedule-id]').filter({hasText:planTitle}).getAttribute('data-schedule-id');
  await record('schedule-created-paused');
  if(!await panel.locator('#schedule-open-runner').isVisible())
    await panel.locator('details').filter({has:panel.locator('#schedule-open-runner')}).locator(':scope > summary').click();
  const runnerOpened=context.waitForEvent('page');void runnerOpened.catch(()=>{});await panel.locator('#schedule-open-runner').click();const runner=await runnerOpened;
  await runner.waitForFunction(()=>document.documentElement.dataset.opendeskSurface==='scheduled-runner');
  await runner.locator('#schedule-runner-view').waitFor({state:'visible'});
  report.runner=await runner.evaluate(async()=>({url:location.href,tab:await chrome.tabs.getCurrent(),
    roots:document.querySelectorAll('#opendesk-react-app').length,surface:document.documentElement.dataset.opendeskSurface,
    status:document.querySelector('#schedule-runner-host-status')?.textContent}));
  assert(report.runner.tab?.id);assert.equal(report.runner.roots,1);
  assert.equal(new URL(report.runner.url).searchParams.get('scheduledRunner'),'1');
  await runner.screenshot({path:resolve(out,'scheduled-runner.png')});await runner.close();
  await panel.locator('#schedule-plan-list [data-schedule-id]').filter({hasText:planTitle}).getByRole('button',{name:planTitle,exact:true}).click();
  await panel.locator('#schedule-detail-edit').click();
  await panel.locator('#schedule-title').fill(editedTitle);await panel.locator('#schedule-save').click();
  await panel.locator('#schedule-save-confirm').waitFor({state:'visible'});await panel.locator('#schedule-confirm-yes').click();
  await panel.waitForFunction(({id,title})=>[...document.querySelectorAll('#schedule-plan-list [data-schedule-id]')].some(n=>n.dataset.scheduleId===id&&n.textContent.includes(title)),{id:planId,title:editedTitle});
  await record('schedule-edited');
  if(!await panel.locator('#schedule-detail-delete').isVisible())
    await panel.locator(`#schedule-plan-list [data-schedule-id="${planId}"]`).getByRole('button',{name:editedTitle,exact:true}).click();
  await panel.locator('#schedule-detail-delete').click();
  const deleteReview=panel.getByRole('group',{name:'确认删除当前计划',exact:true});await deleteReview.waitFor({state:'visible'});
  await deleteReview.getByRole('button',{name:'取消',exact:true}).click();
  await deleteReview.waitFor({state:'hidden'});await panel.locator('#schedule-detail-delete').click();
  await deleteReview.getByRole('button',{name:'确认删除',exact:true}).click();
  await panel.locator(`#schedule-plan-list [data-schedule-id="${planId}"]`).waitFor({state:'detached'});
  await record('schedule-delete-confirmed',{planId});
  report.status='PASS_TASK_AND_PAUSED_SCHEDULE';
  const after=await verifyPackage(installed.extension,{mode:installed.buildMode});assert.equal(after.packageHash,before.packageHash);
}catch(error){report.error=String(error.stack||error);if(panel)await panel.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});
  if(catalog)report.catalogText=await catalog.locator('body').innerText().catch(()=>null);
  if(panel)report.scheduleState=await panel.evaluate(()=>({message:document.querySelector('#schedule-message')?.textContent,
    errors:[...document.querySelectorAll('[id$="-error"]')].filter(n=>!n.hidden).map(n=>({id:n.id,text:n.textContent})),
    fields:[...document.querySelectorAll('#schedule-form input,#schedule-form select,#schedule-form textarea')].map(n=>({id:n.id,value:n.value,checked:n.checked}))})).catch(()=>null);
}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,error:report.error}));process.exit(report.status.startsWith('PASS')?0:1);}
