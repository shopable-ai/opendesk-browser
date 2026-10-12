import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalToolHostUrl} from '../../src/ui/sidebar-tools/navigation.js';
import {toolDocumentIdentity} from '../../src/tool-document-url.js';
import {isToolSender} from '../../src/environment.js';

const load=path=>readFile(path,'utf8');
const extension='chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
const base=extension+'ui/tool.html';
const host='12345678-1234-4123-8123-123456789abc';

test('official scheduled plan is nested inside 我的 and keeps icon-only task actions',async()=>{
  const html=await load('src/ui/tool.html');
  assert.match(html,/id="workbench-tasks"/);
  assert.match(html,/id="scheduled-panel"[^>]*hidden/);
  const row=html.match(/<div class="schedule-source-row">([\s\S]*?)<\/div>/);
  assert.ok(row,'source select and two icon buttons stay adjacent');
  const select=row[1].indexOf('id="schedule-task-select"');
  const create=row[1].indexOf('id="schedule-new-script"');
  const manage=row[1].indexOf('id="schedule-manage-tasks"');
  assert.ok(select>=0&&create>select&&manage>create);
  assert.match(row[1],/aria-label="新建脚本"/);
  assert.match(row[1],/aria-label="管理任务"/);
  assert.doesNotMatch(row[1],/<option[^>]*>\s*(新建|管理)/);
  assert.doesNotMatch(row[1],/<p[^>]*>\s*(新建脚本|管理任务)/);
  assert.match(html,/id="schedule-task-manager"/);
  assert.match(html,/id="schedule-manager-search"/);
  assert.match(html,/id="schedule-manager-filter"/);
  assert.match(html,/id="schedule-uninstall-confirm"/);
  assert.match(html,/id="schedule-open-runner"/);
  assert.match(html,/id="schedule-stop"/);
  assert.match(html,/id="schedule-plan-list"/);
});
test('source UI provides four triggers and a strictly typed local time rule',async()=>{
  const html=await load('src/ui/tool.html');
  for(const type of ['once','daily','weekly','interval'])
    assert.match(html,new RegExp('<option value="'+type+'">'));
  for(const id of ['schedule-timezone','schedule-once','schedule-clock',
    'schedule-weekdays-field','schedule-minutes','schedule-target','schedule-params',
    'schedule-misfire','schedule-deadline','schedule-open-target'])
    assert.match(html,new RegExp('id="'+id+'"'));
  const css=await load('src/ui/tool-shell.css');
  assert.match(css,/\.schedule-source-row\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/var\(--od-icon-size\)/);
  assert.match(css,/#scheduled-panel\[hidden\],#scheduled-panel \[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(html,/id="tab-schedule"/);
});
test('no native JS alert/confirm/prompt and no unapproved background execution realm',async()=>{
  const [ui,host,service,sw]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),load('src/ui/scheduled-task-host.js'),
    load('src/platform/tasks/schedule-service.js'),load('src/sw.js')
  ]);
  for(const src of [ui,host,service])assert.doesNotMatch(src,/(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  assert.match(host,/host\.start\(/);
  assert.match(host,/scheduledFireId:fire\.fireId/);
  assert.match(service,/api\.alarms\.getAll\(/);
  assert.match(service,/api\.alarms\.clear\(row\.name\)/);
  assert.doesNotMatch(service,/alarms\.clearAll\(/);
  assert.match(sw,/chrome\.alarms\.onAlarm\.addListener/);
});
test('visible scheduled runner uses trusted tool.html URL without widening sender admission',()=>{
  const withoutId=base+'?scheduledRunner=1';
  const route=canonicalToolHostUrl(withoutId,host);
  assert.equal(canonicalToolHostUrl(base+'?toolId=..%2Funsafe&scheduledRunner=1',host)
    .includes('scheduledRunner=1'),false,'invalid mixed locator cannot elevate to scheduled runner');
  const parsed=toolDocumentIdentity(base,route);
  assert.equal(parsed?.scheduledRunner,true);
  assert.equal(parsed?.hasLocator,true);
  const api={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',getURL:path=>extension+path}};
  const sender={id:api.runtime.id,url:route,documentId:'real-extension-document',
    frameId:0,tab:{id:7,incognito:false}};
  assert.equal(isToolSender(api,sender),true);
  assert.equal(isToolSender(api,{...sender,tab:undefined}),false,'runner must be a visible extension tab');
  for(const modified of [
    route+'&scheduledRunner=1',route.replace('scheduledRunner=1','scheduledRunner=2'),
    route+'&toolId=quick-notes',route+'&other=1',route+'#script'
  ])assert.equal(toolDocumentIdentity(base,modified),null);
});
test('existing preview asset remains committed separately from production runtime',async()=>{
  const preview=await load('examples/ui/scheduled-tasks-r1-preview.html');
  assert.match(preview,/OpenDesk Browser · 定时计划 R1/);
  const html=await load('src/ui/tool.html');
  assert.doesNotMatch(html,/scheduled-tasks-r1-preview\.html/);
});

test('R1.12 real runner focuses the scheduled page and keeps human-readable plan labels',async()=>{
  const [css,ui,host]=await Promise.all([
    load('src/ui/tool-shell.css'),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/scheduled-task-host.js')
  ]);
  assert.match(css,/:root\[data-opendesk-surface="scheduled-runner"\] \.workbench-nav\{display:none!important\}/);
  assert.match(css,/:root\[data-opendesk-surface="scheduled-runner"\] #workspace-content\{/);
  assert.match(css,/max-width:760px/);
  assert.match(ui,/frequencyLabel\(plan\)/,'plan displays translated schedule instead of internal trigger enum');
  assert.match(ui,/scheduleStatus\(last.status\)/,'history status is user-readable');
  assert.match(ui,/catalogEntry\?\.manifest\?\.title\|\|plan.taskId/,'installed Task title is preferred');
  assert.match(ui,/再开运行页 ↗/,'runner tab has a distinct second-host action');
  assert.match(host,/host\.start\(/,'layout must not replace the actual Controller runner');
});

test('R2 standalone running tab shows a focused operational dashboard and retains the single trusted Host',async()=>{
  const [html,css,ui,shell]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),load('src/ui/tool-shell.js')
  ]);
  for(const id of ['schedule-runner-view','schedule-runner-host-status','schedule-runner-next',
    'schedule-runner-current','schedule-runner-result','schedule-runner-toggle',
    'schedule-runner-manage','schedule-runner-history','schedule-runner-refresh'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-runner-view"[^>]*hidden/);
  assert.match(shell,/scheduleUI\.open\('runner'\)/);
  assert.match(shell,/onStatus:scheduleStatus/);
  assert.match(ui,/const views=\{runner:get\('schedule-runner-view'\)/);
  assert.match(ui,/renderPlans\(\);renderManager\(\);renderRunner\(\)/);
  assert.match(ui,/runnerFocusId/);
  assert.match(css,/schedule-runner-metrics\{display:grid/);
  assert.match(css,/:root\[data-opendesk-surface="scheduled-runner"\] #workspace-dock\{display:none!important\}/);
  assert.doesNotMatch(ui,/chrome\.alarms\.create|new Worker\(/);
});
test('R2 history keeps technical run identity behind expandable detail',async()=>{
  const ui=await load('src/ui/scheduled-task-workbench.js');
  assert.match(ui,/element\(doc,'details','schedule-run-details'\)/);
  assert.match(ui,/RunId：/);
  assert.match(ui,/scheduleStatus\(fire.status\)/);
});
