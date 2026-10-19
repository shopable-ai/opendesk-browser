import test,{after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalToolHostUrl} from '../../src/ui/sidebar-tools/navigation.js';
import {toolDocumentIdentity} from '../../src/tool-document-url.js';
import {isToolSender} from '../../src/environment.js';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';
import {createScheduledTaskWorkbench,mergeScheduleHistoryView,commitScheduledMutation,describeScheduleMutationFailure} from '../../src/ui/scheduled-task-workbench.js';
import {formatScheduleRule,presentSchedulePlan} from '../../src/ui/schedule-plan-presentation.js';

const load=path=>readFile(path,'utf8');
const extension='chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
const base=extension+'sidepanel.html';
const host='12345678-1234-4123-8123-123456789abc';
// Compile only the test entry in memory; no product build, listener or watcher.
const require=createRequire(import.meta.url);
const compiled=await build({stdin:{contents:"export {MyTasksPage} from './src/ui/react/tabs/my-page.tsx';",resolveDir:process.cwd()},
  bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',
  plugins:[{name:'test-react-instance',setup(builder){
    builder.onResolve({filter:/^react(?:$|\/)/},({path})=>({path:pathToFileURL(require.resolve(path)).href,external:true}));
  }}]});
const {MyTasksPage}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const renderMyPage=(view=createMyWorkbenchView())=>renderToStaticMarkup(React.createElement(MyTasksPage,{view}));
const detailPlan={scheduleId:'plan-detail',title:'示例计划',taskId:'sample.task',version:'1.0.0',
  timezone:'Asia/Shanghai',triggerKind:'daily',triggerSpec:{hour:9,minute:5},
  targetUrl:'https://example.com',nextDueAt:Date.now()+3600000,paused:false};
const renderDetail=(overrides={})=>{
  const view=createMyWorkbenchView();
  view.project('scheduleDetail',{plan:detailPlan,taskTitle:'示例任务',records:[{
    fireId:'fire-detail',runId:'run-original',resultId:'result-original',status:'SUCCESS',scheduledAt:Date.now()
  }],...overrides});
  return parseHTML(renderMyPage(view)).document.getElementById('schedule-detail-view');
};
const fixtures=new Set(),previousDom={window:globalThis.window,document:globalThis.document};
after(async()=>{await new Promise(resolve=>setImmediate(resolve));Object.assign(globalThis,previousDom);});
afterEach(()=>{for(const dispose of fixtures)dispose();});

test('R34.3 Host timeout and post-commit error never invite a duplicate schedule/task mutation',async()=>{
  const timedOut=Object.assign(new Error('Worker response deadline exceeded; request was not replayed'),
    {code:'E_EFFECT_UNKNOWN'});
  for(const action of ['保存计划','删除计划','卸载任务','启用任务']){
    const failure=describeScheduleMutationFailure(timedOut,action);
    assert.equal(failure.uncertain,true);
    assert.match(failure.message,new RegExp(action+'结果未知'));
    assert.match(failure.message,/重新读取真实状态核对，确认前不要重复操作/);
  }
  const alarmFailed=describeScheduleMutationFailure(new Error('Chrome alarms reconciliation failed'),'保存计划');
  assert.equal(alarmFailed.uncertain,true,
    'saveSchedule commits before reconcile; an untyped Host error cannot prove rollback');
  const rejected=describeScheduleMutationFailure(Object.assign(new Error('stale generation'),
    {code:'E_REVISION'}),'删除计划');
  assert.equal(rejected.uncertain,false);
  assert.match(rejected.message,/删除计划未完成/);
  assert.doesNotMatch(rejected.message,/结果未知/);
  const [client,ui]=await Promise.all([
    load('src/platform/host/client.js'),load('src/ui/scheduled-task-workbench.js')
  ]);
  assert.match(client,/new FoundationError\('E_EFFECT_UNKNOWN'/);
  const save=ui.slice(ui.indexOf('  async function confirmSave(){'),ui.indexOf('  function enterDeveloper(){'));
  const remove=ui.slice(ui.indexOf('  async function uninstall(){'),ui.indexOf('  async function open(view='));
  const change=ui.slice(ui.indexOf('  async function change(plan,operation){'),ui.indexOf('  function switchKind(){'));
  const toggle=ui.slice(ui.indexOf('  async function toggleManagedTask(row,originList){'),
    ui.indexOf('  async function copyManagedTask(row){'));
  assert.match(save,/if\(failure\.uncertain\)\{[\s\S]*?clearConfirmation\(\);formDirty=true/);
  assert.match(remove,/confirmUninstall=null;ui\('schedule-uninstall-confirm'\)\.hidden=true/);
  assert.match(change,/if\(failure\.uncertain&&operation==='delete'\)/);
  assert.match(toggle,/rpcStarted=true;[\s\S]*?commitScheduledMutation\(/);
});

test('R1.2 acknowledged schedule mutations remain successful when the next list read fails',async()=>{
  const phases=[],saved={scheduleId:'schedule-real',generation:4};
  const result=await commitScheduledMutation(async()=>{
    phases.push('committed');return saved;
  },async()=>{
    phases.push('refresh-attempted');
    throw new Error('host disconnected after commit');
  });
  assert.strictEqual(result.result,saved,'the authoritative successful mutation receipt is retained');
  assert.equal(result.refreshError?.message,'host disconnected after commit',
    'the UI must present refresh failure separately from the successful write');
  assert.deepEqual(phases,['committed','refresh-attempted']);
  const refreshed=await commitScheduledMutation(async()=>saved,async()=>true);
  assert.strictEqual(refreshed.result,saved);
  assert.equal(refreshed.refreshError,null);

  let wasRefreshed=false;
  await assert.rejects(()=>commitScheduledMutation(async()=>{
    throw new Error('E_GENERATION: task changed');
  },async()=>{wasRefreshed=true;}),/E_GENERATION/);
  assert.equal(wasRefreshed,false,'a rejected write must never be treated as committed or trigger a misleading refresh');
});

test('R1.2 UI fences late poll responses and distinguishes committed writes from reload failure',async()=>{
  const source=await load('src/ui/scheduled-task-workbench.js');
  assert.match(source,/const requestSeq=\+\+refreshSeq/);
  assert.match(source,/if\(disposed\|\|requestSeq!==refreshSeq\)return/,
    'old list/catalog response must not repaint a newer snapshot');
  const change=source.slice(source.indexOf('  async function change(plan,operation){'),source.indexOf('  function switchKind(){'));
  const save=source.slice(source.indexOf('  async function confirmSave(){'),source.indexOf('  function enterDeveloper(){'));
  const uninstall=source.slice(source.indexOf('  async function uninstall(){'),source.indexOf('  async function open(view='));
  for(const [name,section] of [['pause/resume/delete',change],['create/edit',save],['uninstall',uninstall]]){
    assert.match(section,/commitScheduledMutation\(/,name+' must preserve backend commit acknowledgment');
    assert.match(section,/refreshError/,name+' must show a post-commit refresh warning');
    assert.match(section,/列表刷新失败/,name+' must not claim the write failed after a successful RPC');
  }
  assert.match(change,/expectedGeneration:plan\.generation,action:operation/);
  assert.match(save,/clearConfirmation\(\);formDirty=false/);
  assert.doesNotMatch(source,/chrome\.alarms\.create|new Worker\(/);
});

test('R34.2 installed task mutation distinguishes a committed toggle from a failed readback',async()=>{
  const source=await load('src/ui/scheduled-task-workbench.js');
  const toggle=source.slice(source.indexOf('  async function toggleManagedTask(row,originList){'),
    source.indexOf('  async function copyManagedTask(row){'));
  const copy=source.slice(source.indexOf('  async function copyManagedTask(row){'),
    source.indexOf('  function createPlanFromManagedTask(row,title){'));
  assert.match(toggle,/const \{refreshError\}=await commitScheduledMutation\(/);
  assert.match(toggle,/\(\)=>client\.request\('setInstalledTaskEnabled'/);
  assert.match(toggle,/expectedGeneration:row\.generation/);
  assert.match(toggle,/expectedInstallationId:row\.installationId/);
  assert.match(toggle,/列表刷新失败/);
  assert.match(copy,/if\(busy\)return;busy=true;/);
  assert.ok(copy.indexOf('await taskWorkbench.receiveDraft(')>=0);
  assert.ok(copy.indexOf('hidePanel();')>copy.indexOf('await taskWorkbench.receiveDraft('),
    'do not hide the only error surface before Developer accepts the draft');
});

test('R34.5 installed Task copy cannot replace an unsaved Developer draft without explicit trusted review',async()=>{
  const [ui,native]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),load('tests/framework/scheduled-tasks-r1-native-mac.test.mjs')
  ]);
  const view=createMyWorkbenchView();
  view.field('schedule-copy-confirm').hidden=false;
  view.field('schedule-copy-label').text='确认覆盖当前未保存草稿';
  const document=parseHTML(renderMyPage(view)).document,review=document.getElementById('schedule-copy-confirm');
  assert.equal(review.hidden,false);assert.equal(review.getAttribute('role'),'group');
  assert.equal(document.getElementById('schedule-copy-yes').textContent,'确认覆盖并复制');
  assert.equal(document.getElementById('schedule-copy-no').textContent,'取消');
  assert.match(ui,/registerAction\('scheduleCopyYesClick'/);
  assert.match(ui,/registerAction\('scheduleCopyNoClick',\(\)=>closeCopyReview\(true\)/);
  assert.match(ui,/onCopy:myView\.action\(row=>reviewCopyManagedTask\(row,row\.title\)\)/);
  const request=ui.slice(ui.indexOf('  function reviewCopyManagedTask(row,title){'),
    ui.indexOf('  async function copyManagedTask(row){'));
  assert.doesNotMatch(request,/receiveDraft\(/);
  const copy=ui.slice(ui.indexOf('  async function copyManagedTask(row){'),ui.indexOf('  function createPlanFromManagedTask(row,title){'));
  assert.match(copy,/current\.installationId!==row\.installationId/);
  assert.ok(copy.indexOf('await taskWorkbench.receiveDraft(')>0);
  assert.match(native,/nativeManagerCopyCancelPreservesDeveloperDraft='PASS'/);
  assert.match(native,/await click\(client,formSid,'#schedule-copy-no'\)/);
  assert.match(native,/await click\(client,formSid,'#schedule-copy-yes'\)/);
});

test('official scheduled plan is nested inside 我的 and keeps icon-only task actions',async()=>{
  const html=await renderMyPage();
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
  for(const id of ['schedule-new-script','schedule-manage-tasks'])
    assert.match(row[1],new RegExp('id="'+id+'"[^>]*class="od-icon-button(?: [^"]*)?"'),
      id+' retains the shared icon size');
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
  const html=await renderMyPage();
  for(const type of ['once','daily','weekly','interval'])
    assert.ok(parseHTML(html).document.querySelector('#schedule-kind option[value="'+type+'"]'));
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
test('visible scheduled runner uses trusted sidepanel.html URL without widening sender admission',()=>{
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
  const html=await load('src/ui/sidepanel.html');
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
  // R33.3.14: display rules have one pure owner, shared by the real card and preview.
  const plan={triggerKind:'daily',triggerSpec:{hour:9,minute:5},timezone:'Asia/Tokyo',
    nextDueAt:Date.parse('2026-10-18T00:00:00Z'),paused:false,needsAttention:false};
  assert.equal(formatScheduleRule({...plan,triggerKind:'once'}),'执行一次');
  assert.equal(formatScheduleRule(plan),'每天 09:05');
  assert.equal(formatScheduleRule({...plan,triggerKind:'weekly',
    triggerSpec:{days:[5,1],hour:18,minute:30}}),'每周一、五 18:30');
  assert.equal(formatScheduleRule({...plan,triggerKind:'interval',
    triggerSpec:{everyMinutes:15}}),'每隔 15 分钟');
  assert.match(presentSchedulePlan(plan,[]).timingText,/每天 09:05/);
  assert.match(await load('src/ui/react/tabs/my-sections.tsx'),/presentSchedulePlan\(plan,records\)/,
    'React detail shares the production presentation');
  assert.match(renderDetail().querySelector('.schedule-history-row').textContent,/成功/,'history status is user-readable');
  assert.match(ui,/taskTitle:catalogEntry\?\.manifest\?\.title\|\|plan.taskId/,'installed Task title is preferred');
  assert.match(ui,/const runnerLabel=isRunner\(\)\?'再打开一个独立运行页':'打开独立运行页'/,
    'runner tab must expose a distinct accessible second-host action');
  assert.match(ui,/registerAction\('scheduleOpenRunnerClick',\(\)=>void api\.tabs\.create\(/,
    'runner launch must still create a separate tab through the existing API');
  assert.match(host,/host\.start\(/,'layout must not replace the actual Controller runner');
});

test('R2 standalone running tab shows a focused operational dashboard and retains the single trusted Host',async()=>{
  const [html,css,ui,shell]=await Promise.all([
    renderMyPage(),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),load('src/ui/tool-shell.js')
  ]);
  for(const id of ['schedule-runner-view','schedule-runner-host-status','schedule-runner-next',
    'schedule-runner-current','schedule-runner-result','schedule-runner-toggle',
    'schedule-runner-manage','schedule-runner-history','schedule-runner-refresh'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-runner-view"[^>]*hidden/);
  assert.match(shell,/scheduleUI\.open\('runner'\)/);
  assert.match(shell,/onStatus:scheduleStatus/);
  assert.match(ui,/const views=\{runner:ui\('schedule-runner-view'\)/);
  assert.match(ui,/if\(plansChanged\)\{renderPlans\(\);planListSignature=plansSignature;\}/);
  assert.match(ui,/if\(tasksChanged\|\|plansChanged\)renderManager\(\)/);
  assert.match(ui,/renderRunner\(\)/);
  assert.match(ui,/runnerFocusId/);
  assert.match(css,/schedule-runner-metrics\{display:grid/);
  assert.match(css,/:root\[data-opendesk-surface="scheduled-runner"\] #workspace-dock\{display:none!important\}/);
  assert.doesNotMatch(ui,/chrome\.alarms\.create|new Worker\(/);
});
test('R2 history keeps technical run identity behind expandable detail',async()=>{
  const ui=await load('src/ui/scheduled-task-workbench.js');
  const technical=renderDetail().querySelector('.schedule-run-details');
  assert.equal(technical.tagName,'DETAILS');assert.equal(technical.querySelector('summary').textContent,'技术详情');
  assert.match(technical.textContent,/RunId：run-original.*ResultId：result-original/);
});

test('R2 create form validates URL, JSON and wall-time inline and requires an explicit product confirmation',async()=>{
  const [html,ui,css]=await Promise.all([
    renderMyPage(),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css')
  ]);
  for(const id of ['schedule-title-error','schedule-task-error','schedule-target-error',
    'schedule-params-error','schedule-time-error','schedule-save-confirm',
    'schedule-save-summary','schedule-confirm-yes','schedule-confirm-no'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-save-confirm"[^>]*hidden/);
  assert.equal(parseHTML(html).document.getElementById('schedule-form').getAttributeNames().some(name=>name.toLowerCase()==='novalidate'),true);
  assert.match(ui,/revision!==editRevision/);
  assert.match(html,/id="schedule-save"[^>]*>检查并确认/);
  assert.match(ui,/function validateLocal\(showAll=false\)/);
  assert.match(ui,/fail\('target'/);
  assert.match(ui,/fail\('params'/);
  assert.match(ui,/awaitingSave=\{input\}/);
  assert.match(ui,/registerAction\('scheduleConfirmYesClick'/);
  assert.match(ui,/\(\)=>client\.request\('saveSchedule',pending\.input\)/,
    'the confirmation must still call the real authorized saveSchedule RPC');
  assert.match(ui,/const \{refreshError\}=await commitScheduledMutation\(/,
    'a committed save must not be reported as a failed write when only refresh fails');
  assert.match(ui,/原计划绑定的任务版本或授权已变化/);
  assert.match(css,/schedule-field-error:empty\{display:none\}/);
  assert.doesNotMatch(ui,/window\.(?:alert|prompt|confirm)\(/);
});

test('R2 history pagination is authorized and preserves original Run/Result audit identity',async()=>{
  const [ui,repo,broker,authority]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),load('src/platform/tasks/schedule-repository.js'),
    load('src/platform/host/broker.js'),load('src/platform/host/authority.js')
  ]);
  assert.match(ui,/client\.request\('listScheduleHistory'/);
  const detail=renderDetail({hasMore:true});
  assert.equal(detail.querySelector('.schedule-load-more').textContent,'加载更早记录');
  assert.match(detail.querySelector('.schedule-run-details').textContent,/run-original.*result-original/);
  assert.match(repo,/grouped\.push\(\.\.\.await tx\.scan\('frameworkKV'/);
  assert.match(repo,/generation>=1&&grouped\.length<needed/);
  assert.match(broker,/'listSchedules','listScheduleHistory','listDueSchedules'/);
  assert.match(authority,/'listSchedules','listScheduleHistory','listDueSchedules'/);
});

test('R33.3.14 current plan authorization and history display are independent',async()=>{
  const [ui,presentation]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/schedule-plan-presentation.js')
  ]);
  assert.match(await load('src/ui/react/tabs/my-sections.tsx'),/presentSchedulePlan\(plan,records\)/);
  assert.match(presentation,/plan\.paused\?'已暂停':plan\.needsAttention\?'需要处理':/);
  assert.match(presentation,/completedOnce\?'已完成'/);
  assert.doesNotMatch(presentation,/plan\.history\?\.\[0\]\?\.status==='NEEDS_ATTENTION'\?'需要处理'/);
  const detail=renderDetail({records:[{fireId:'denied',status:'NEEDS_ATTENTION',scheduledAt:Date.now()}]});
  assert.match(detail.querySelector('.schedule-history-row').textContent,/需要处理.*安装身份或网站授权/,'historical denial remains visible in history');
});

test('R2.3 explains audit retention and shows native Chrome origin-wide storage without deleting records',async()=>{
  const [html,ui,css,shared]=await Promise.all([
    renderMyPage(),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css'),load('src/ui/design-system.css')
  ]);
  assert.equal(parseHTML(html).document.getElementById("schedule-storage-status").getAttribute("role"),"status");
  assert.match(html,/<details class="schedule-storage-details od-disclosure">/);
  assert.match(ui,/navigator\?\.storage/);
  assert.match(ui,/\.estimate\(\)/);
  assert.match(ui,/并非仅定时任务占用/);
  assert.match(ui,/历史不会自动清理/);
  assert.doesNotMatch(ui,/indexedDB\.deleteDatabase\(|chrome\.storage\.(?:local|sync)\.clear\(/);
  assert.match(shared,/(?:^|\n):focus-visible,#workspace-content :focus-visible\{outline:2px solid var\(--od-focus\);outline-offset:2px\}/);
  assert.doesNotMatch(css,/\.schedule-storage-details>summary:focus-visible/,
    'storage disclosure uses the shared focus ring');
});

test('R33.3.19 two-line plan list keeps authoritative header deletion behind explicit review',async()=>{
  const [html,css,ui,shared]=await Promise.all([
    renderMyPage(),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),load('src/ui/design-system.css')
  ]);
  assert.equal(parseHTML(html).document.getElementById("schedule-list-summary").getAttribute("aria-live"),"polite");
  const detail=renderDetail({deleteReview:true});
  assert.equal(detail.querySelector('.schedule-more').tagName,'DETAILS');
  assert.equal(detail.querySelectorAll('.schedule-delete-confirm').length,1);
  assert.doesNotMatch(ui,/more\.append\(remove\)/);
  assert.equal(parseHTML(html).document.getElementById('schedule-detail-delete').getAttribute('aria-label'),'删除当前计划');
  assert.match(ui,/registerAction\('scheduleDetailDeleteClick'/);
  assert.match(detail.querySelector('.schedule-delete-confirm').textContent,/确定删除「示例计划」/);
  assert.match(ui,/client\.request\('changeSchedule'/);
  assert.match(css,/\.schedule-card \.schedule-plan-meta\{display:flex/);
  assert.match(css,/\.schedule-card \.schedule-plan-actions\{display:flex/);
  assert.match(shared,/(?:^|\n):focus-visible,#workspace-content :focus-visible\{outline:2px solid var\(--od-focus\);outline-offset:2px\}/);
  assert.match(shared,/\.od-disclosure--flat>summary\{min-height:36px/);
});
test('R2.6 runner separates running Fire from waiting history and preserves original Stop contract',async()=>{
  const [html,css,ui]=await Promise.all([
    renderMyPage(),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js')
  ]);
  assert.match(ui,/\['ADMITTED','RUNNING'\]\.includes\(item\.fire\.status\)/);
  assert.match(ui,/\['READY','WAITING_HOST','WAITING_TARGET','WAITING_SLOT','SETTLING'\]/);
  assert.match(ui,/waiting\?'未运行 · '/);
  assert.match(ui,/scheduleStatusGuidance\.UNKNOWN/);
  assert.match(ui,/host\.stop\(\{runId:selectedFire,controller:true\}\)/);
  assert.match(css,/:root\[data-opendesk-surface="scheduled-runner"\] \.schedule-runner-view \.schedule-runner-focus\{order:1\}/);
  assert.match(html,/id="schedule-runner-focus-title"/);
});

test('R2.6 unsaved editor Back/cancel must review changes while task manager preserves the draft',async()=>{
  const [html,ui,css]=await Promise.all([
    renderMyPage(),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css')
  ]);
  for(const id of ['schedule-discard-confirm','schedule-discard-yes','schedule-discard-no'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-discard-confirm"[^>]*hidden/);
  assert.match(ui,/function requestLeaveForm\(destination\)/);
  assert.match(ui,/if\(formDirty\)\{/);
  assert.match(ui,/function navigateBack\(\)/);
  assert.match(ui,/registerAction\('scheduleBackClick',navigateBack\)/);
  assert.match(ui,/registerAction\('scheduleCancelClick',\(\)=>requestLeaveForm/);
  assert.match(ui,/function leaveManager\(\)\{\s*const destination=managerReturn;\s*show\(destination\)/);
  assert.match(ui,/registerAction\('scheduleManagerBackClick',leaveManager\)/,
    'the manager Back still uses the established navigation action');
  assert.match(ui,/if\(activeView==='manager'\)\{leaveManager\(\);return;\}/,
    'the visible header Back uses the same focus-restoring action');
  assert.match(ui,/if\(destination==='form'\)focus\('schedule-manage-tasks',\{preventScroll:true\}\)/,
    'returning to an unsaved editor restores focus to the original management entry');
  assert.match(css,/#schedule-discard-confirm\{display:grid/);
  assert.ok(css.includes(':root[data-opendesk-surface="scheduled-runner"]:has(#schedule-runner-view:not([hidden])) .schedule-header-heading{display:none}'));
  assert.equal(css.includes(':root[data-opendesk-surface="scheduled-runner"] .schedule-header:has(#schedule-stop[hidden]){display:none}'),false,
    'standalone editor must never hide its Back header merely because no Run is active');
  assert.doesNotMatch(ui,/(?:window\.)?confirm\s*\(/);
});

test('R2.6 locked editing Task identity survives uninstall and script-install roundtrip',async()=>{
  const [ui,css,preview]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),load('src/ui/tool-shell.css'),
    load('examples/ui/scheduled-tasks-r2.5-preview.html')
  ]);
  assert.match(ui,/if\(editing&&!rows\.some\(row=>row\.taskId===editing\.taskId\)\)/);
  assert.match(ui,/choices\.push\(\{value:editing\.taskId,[\s\S]*?disabled:true\}\)/);
  assert.match(ui,/select\.value=editing\?editing\.taskId/);
  assert.match(ui,/select\.disabled=Boolean\(editing\)/);
  assert.match(ui,/ui\('schedule-task-select'\)\.disabled=false/);
  assert.match(ui,/原计划固定任务不可用；请恢复相同安装身份与网站授权/);
  assert.match(ui,/pendingCreateFromForm=activeView==='form'/);
  assert.match(ui,/if\(!pendingCreateFromForm\)reset\(\)/);
  assert.match(ui,/if\(!editing\)\{\s*ui\('schedule-task-select'\)\.value=taskId/);
  assert.match(ui,/原计划仍固定原任务身份/);
  assert.match(css,/#schedule-task-select:disabled/);
  assert.match(preview,/editing\?'disabled title="编辑计划不允许更换任务/);
  assert.match(preview,/原固定任务 · v\$\{safe\(original\?\.version\|\|'\?'\)\}/);
});

test('R2.6 real runner never labels SETTLING or stale terminal Run as running',async()=>{
  const [ui,preview]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),
    load('examples/ui/scheduled-tasks-r2.5-preview.html')
  ]);
  assert.match(ui,/const owned=selectedFire\?observed\.find\(item=>item\.fire\.runId===selectedFire&&/);
  assert.match(ui,/\['ADMITTED','RUNNING'\]\.includes\(item\.fire\.status\)/);
  assert.match(ui,/const settling=observed\.filter\(item=>item\.fire\.status==='SETTLING'\)/);
  assert.match(ui,/const alreadyTerminal=Boolean\(selectedFire&&observed\.some/);
  assert.match(ui,/settling\?'正在核对上次结果'/);
  assert.match(ui,/正在结算（尚未确认成功）/);
  assert.match(ui,/waiting\.fire\.status==='WAITING_HOST'&&isRunner\(\)/);
  assert.match(ui,/本页已经可见，正在检查原触发是否仍符合执行条件/);
  assert.doesNotMatch(ui,/WAITING_HOST:'没有合法可见运行宿主；请打开运行页/);
  assert.match(preview,/settlingFocus=!active&&settling\?\.p\.id===focus\?\.id/);
  assert.match(preview,/正在结算 · 尚未确认成功/);
  assert.match(preview,/next===null\?'暂无后续执行'/);
});

test('R33.3.12 direct native timezone selector preserves IANA scheduling and next-run projection',async()=>{
  const [html,css,ui,preview]=await Promise.all([
    renderMyPage(),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),
    load('examples/ui/scheduled-tasks-r2.5-preview.html')
  ]);
  for(const id of ['schedule-timezone','schedule-timezone-help',
    'schedule-next','schedule-next-time','schedule-next-zone'])
    assert.match(html,new RegExp('id="'+id+'"'));
  for(const id of ['schedule-timezone-summary','schedule-timezone-edit',
    'schedule-timezone-controls','schedule-timezone-search','schedule-timezone-done'])
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
  const zone=parseHTML(html).document.getElementById('schedule-timezone');
  assert.equal(zone.tagName,'SELECT');assert.equal(zone.hasAttribute('required'),true);assert.ok(zone.getAttribute('aria-describedby'));
  assert.match(ui,/populateTimeZoneSelect\(plan\.timezone\)/,
    'editing must preserve the saved concrete IANA time zone');
  assert.match(ui,/function scheduleZoneOffset\(zone\)/);
  assert.match(ui,/text\(ui\('schedule-next-time'\),describeTime\(next,zone\)\)/);
  assert.match(css,/\.schedule-next-preview>strong\{font-size:17px/);
  assert.match(css,/\.schedule-timezone-picker #schedule-timezone\{/);
  assert.doesNotMatch(css,/\.schedule-form \.od-field,\.schedule-rule \.od-field/,
    'native text inputs must remain standard controls');
  // The historical R2.5 static prototype remains a historical comparison.
  assert.match(preview,/id="zone-summary"/);
});

test('R2.7 unavailable Controller task has an actionable, truthful empty state',async()=>{
  const [html,ui]=await Promise.all([
    renderMyPage(),load('src/ui/scheduled-task-workbench.js')
  ]);
  assert.match(html,/id="schedule-task-empty"[^>]*hidden/);
  assert.match(html,/id="schedule-task-empty-create"/);
  assert.match(html,/请先在「开发」中验证并安装 Controller Task/);
  assert.match(ui,/ui\('schedule-task-empty'\)\.hidden=Boolean\(editing\)\|\|rows\.length>0/);
  assert.match(ui,/registerAction\('scheduleTaskEmptyCreateClick',enterDeveloper\)/);
  assert.match(ui,/registerAction\('scheduledPanelKeydown'/);
  assert.match(ui,/event\.key!=='Escape'/);
  assert.doesNotMatch(ui,/chrome\.permissions\.request\(/,
    'the UI must not bypass the normal Chrome permission gate');
});

test('R2.7 runner presents focus before compact summary and defers details',async()=>{
  const [html,css,ui,native]=await Promise.all([
    renderMyPage(),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),
    load('tests/framework/scheduled-tasks-r23-native-zoom.test.mjs')
  ]);
  const focus=html.indexOf('id="schedule-runner-focus-title"');
  const summary=html.indexOf('class="schedule-runner-metrics"');
  const detail=html.indexOf('class="schedule-runner-extra od-disclosure od-disclosure--flat"');
  assert(focus>0&&summary>focus&&detail>summary,
    'single focus card should precede Host/result and disclosure');
  for(const id of ['schedule-runner-next','schedule-runner-current',
    'schedule-runner-host-status','schedule-runner-result','schedule-runner-focus-time'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(css,/\.schedule-runner-view \.schedule-runner-extra\{order:3\}/);
  assert.match(ui,/text\(ui\('schedule-runner-focus-time'\)/);
  assert.match(ui,/host\.stop\(\{runId:selectedFire,controller:true\}\)/);
  assert.match(native,/await click\(client,session,'#schedule-timezone'\)/);
  assert.doesNotMatch(native,/await click\(client,session,'#schedule-timezone-edit'\)/);
  assert.match(native,/chrome\.tabs\.setZoom/,'real zoom is not viewport emulation');
});

test('R2.8 host polling preserves paginated FireId history while a newer result arrives',()=>{
  const stored=Array.from({length:40},(_,index)=>({
    fireId:'fire-'+(40-index),scheduledAt:400000-index*1000,
    status:'WAITING_HOST',runId:null,resultId:null
  }));
  const latest=[
    {fireId:'fire-41',scheduledAt:401000,status:'RUNNING',runId:'run-41'},
    {...stored[0],status:'SUCCESS',runId:'run-40',resultId:'result-40'},
    ...stored.slice(1,19)
  ];
  const merged=mergeScheduleHistoryView(latest,stored);
  assert.equal(merged.length,41,'new poll cannot truncate previously loaded history pages');
  assert.equal(merged[0].fireId,'fire-41','newest Fire remains first');
  assert.equal(merged.find(row=>row.fireId==='fire-40').status,'SUCCESS',
    'newly confirmed status wins over cached stale history');
  assert.equal(merged.find(row=>row.fireId==='fire-40').resultId,'result-40',
    'original Run/Result identity survives a refresh');
  assert.equal(merged.at(-1).fireId,'fire-1');
  assert.equal(new Set(merged.map(row=>row.fireId)).size,merged.length);
  assert.deepEqual(mergeScheduleHistoryView([],[]),[]);
});


test('R1.2 135 loaded Fire records survive a newer poll and remain isolated by plan',()=>{
  const histories=['plan-A','plan-B'].map((plan,index)=>Array.from({length:135},(_,i)=>({
    fireId:plan+'-fire-'+(135-i),
    scheduledAt:2_000_000+index*1_000_000-i*1_000,
    status:'WAITING_HOST',runId:null,resultId:null
  })));
  const loadPages=records=>{
    let retained=[];
    for(let offset=0;offset<records.length;offset+=20)
      retained=mergeScheduleHistoryView(records.slice(0,20),
        [...retained,...records.slice(offset,offset+20)]);
    return retained;
  };
  const retainedA=loadPages(histories[0]),retainedB=loadPages(histories[1]);
  assert.equal(retainedA.length,135,'every paginated FireId remains retained');
  assert.equal(retainedB.length,135);
  assert.equal(new Set(retainedA.map(fire=>fire.fireId)).size,135);
  assert.equal(new Set(retainedB.map(fire=>fire.fireId)).size,135);
  const completed={...histories[0][0],status:'SUCCESS',runId:'original-run',
    resultId:'original-result'};
  const newFire={fireId:'plan-A-new',scheduledAt:2_000_001,
    status:'WAITING_HOST',runId:null,resultId:null};
  const refreshed=mergeScheduleHistoryView([newFire,completed,...histories[0].slice(1,19)],retainedA);
  assert.equal(refreshed.length,136,'newer poll adds one Fire without dropping 7 loaded pages');
  assert.equal(refreshed[0].fireId,newFire.fireId);
  assert.equal(refreshed.find(row=>row.fireId===completed.fireId).resultId,'original-result',
    'a later real Run/Result acknowledgement replaces the stale history state');
  assert.equal(refreshed.at(-1).fireId,histories[0].at(-1).fireId);
  assert.equal(retainedB.length,135,'refreshing plan A must not mutate the other plan');
  assert(retainedB.every(fire=>fire.fireId.startsWith('plan-B-')));
  assert(refreshed.every(fire=>fire.fireId.startsWith('plan-A-')));
});

test('R2.8 true host refresh retains keyboard focus, open details and inline confirmation',async()=>{
  const source=await load('src/ui/scheduled-task-workbench.js');
  assert.match(source,/const tasksChanged=tasksSignature!==taskListSignature/);
  assert.match(source,/const plansChanged=plansSignature!==planListSignature/);
  assert.match(source,/if\(tasksChanged\)\{taskListSignature=tasksSignature;populateChoices\(\);\}/);
  assert.match(source,/if\(plansChanged\)\{renderPlans\(\);planListSignature=plansSignature;\}/);
  assert.match(source,/if\(tasksChanged\|\|plansChanged\)renderManager\(\)/);
  assert.match(source,/myView\.project\('scheduleDetail',\{plan/);
  const detail=renderDetail({open:true,moreOpen:true,deleteReview:true,expandedRuns:new Set(['fire-detail'])});
  for(const selector of ['.schedule-history','.schedule-more','.schedule-run-details'])
    assert.equal(detail.querySelector(selector).hasAttribute('open'),true,selector+' uses projected disclosure state');
  assert.ok(detail.querySelector('.schedule-delete-confirm'));
  assert.match(source,/\?\.focus\(\{preventScroll:true\}\)/,
    'background updates must restore focus without scrolling the list');
  assert.match(source,/scheduleId:plan\.scheduleId,offset:view\.records\.length,limit:20/);
  assert.match(source,/const overlap=!latest\.length\|\|!view\.records\.length/);
  assert.match(source,/view\.records=mergeScheduleHistoryView\(latest,overlap\?view\.records:\[\]\)/,
    'a non-overlapping first page cannot create a hidden pagination hole');
  assert.match(source,/if\(!previous\|\|!overlap\|\|view\.records\.length<20\)view\.hasMore=latest\.length===20/);
  assert.match(source,/if\(shown\)\{\s*\/\/ Do not clear a visible inline save\/permission error/,
    'periodic refresh must not clear the active form error');
  assert.doesNotMatch(source,/chrome\.alarms\.create|new Worker\(/);
});

test('R2.8 production create form keeps 36px controls and a distinct field label layout',async()=>{
  const [html,css,shared]=await Promise.all([
    renderMyPage(),load('src/ui/tool-shell.css'),load('src/ui/design-system.css')
  ]);
  for(const id of ['schedule-source-section-title','schedule-target-section-title',
    'schedule-timezone','schedule-timezone-help','schedule-next-time',
    'schedule-next-zone','schedule-confirm-yes'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(html,/id="schedule-timezone-controls"/);
  assert.match(css,/\.schedule-form label\.od-field,#schedule-task-manager label\.od-field\{display:grid;gap:var\(--space-2\)/);
  assert.match(css,/#schedule-task-manager input,#schedule-task-manager select\{max-width:100%;width:100%;min-width:0;min-height:36px/);
  assert.match(css,/\.schedule-source-row\{display:grid;grid-template-columns:minmax\(0,1fr\) max-content max-content/);
  assert.match(shared,/\.od-icon-button\{[^}]*width:var\(--od-icon-size\);height:var\(--od-icon-size\)/,
    'intrinsic icon columns retain their shared fixed size');
  assert.match(css,/\.schedule-form-section input\.od-field,\.schedule-form-section textarea\.od-field,/);
  assert.match(css,/\.schedule-next-preview>strong\{font-size:17px/);
  assert.match(css,/#scheduled-panel\[hidden\],#scheduled-panel \[hidden\]\{display:none!important\}/,
    'collapsed native controls must remain hidden instead of taking space');
});

test('R2.8 native runner uses separate React task and schedule surfaces without retired Cloud entry',async()=>{
  const source=await load('src/ui/scheduled-task-workbench.js');
  const document=parseHTML(renderMyPage()).document;
  const tasks=document.getElementById('my-task-surface'),schedule=document.getElementById('scheduled-panel');
  assert.equal(document.querySelector('.cloud-my-entry'),null);
  assert.equal(document.getElementById('task-local-discovery'),null);
  assert.equal(tasks.contains(schedule),false,'schedule is a sibling of the My task surface');
  assert.ok(tasks.contains(document.getElementById('task-search-panel')));
  assert.equal(tasks.parentElement===schedule.parentElement,true);
  assert.match(source,/ui\('my-task-surface'\)\.hidden=true/);
  assert.match(source,/ui\('my-task-surface'\)\.hidden=false/);
  assert.doesNotMatch(source,/querySelector\('#workbench-tasks \.cloud-my-entry'\)/);
});

test('R2.8 subview navigation clears old editor errors without hiding current form errors on Host refresh',async()=>{
  const ui=await load('src/ui/scheduled-task-workbench.js');
  assert.match(ui,/if\(changing\)message\(''\);\s*activeView=view;/,
    'only a deliberate subview change may clear the previous form notice');
  assert.match(ui,/if\(shown\)\{\s*\/\/ Do not clear a visible inline save\/permission error/,
    '15-second Host polling must preserve actionable validation while editing');
  assert.match(ui,/registerAction\('scheduleDiscardYesClick',\(\)=>\{[\s\S]*?show\(discardDestination\)/,
    'explicit discard transitions to another view where stale errors are dismissed');
  assert.match(ui,/registerAction\('scheduleConfirmNoClick',\(\)=>\{clearConfirmation\(\);focus\('schedule-save'\);\}/,
    'returning to edit from confirmation keeps the active form state');
});

test('R1.2 edit-form task manager roundtrip restores origin focus and retains real native coverage',async()=>{
  const [source,native]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),
    load('tests/framework/scheduled-tasks-r1-native-mac.test.mjs')
  ]);
  assert.match(source,/function leaveManager\(\)/);
  assert.match(source,/if\(activeView==='manager'\)\{leaveManager\(\);return;\}/);
  assert.match(source,/if\(destination==='form'\)focus\('schedule-manage-tasks',\{preventScroll:true\}\)/);
  assert.match(source,/registerAction\('scheduleManagerBackClick',leaveManager\)/);
  assert.match(native,/nativeManagerRoundTripPreservesDraft='PASS'/);
  assert.match(native,/assert\.deepEqual\(await readDraft\(\),unsaved,/);
  assert.match(native,/manager Back restores actual keyboard focus/);
});

test('R3 index vs detail navigation and fixed schedule authorization boundaries',async()=>{
  const [html,source,css]=await Promise.all([
    renderMyPage(),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css')
  ]);
  assert.match(html,/id="schedule-detail-view"[^>]*hidden/);
  const edit=parseHTML(html).document.getElementById('schedule-detail-edit');
  assert.equal(edit.getAttribute('aria-label'),'编辑当前计划');assert.equal(edit.hidden,true);
  assert.match(html,/class="schedule-header od-page-head"/);
  assert.equal(parseHTML(html).document.getElementById('schedule-panel-title').classList.contains('od-page-title'),true);
  const list=source.slice(source.indexOf('  function renderPlans(){'),source.indexOf('  function renderDetail(){'));
  assert(!list.includes('schedule-history od-disclosure')&&!list.includes('schedule-delete-confirm'),
    'index cards must not inline history or deletion');
  assert.match(list,/onOpen:myView\.action\(openDetail\)/);
  assert.match(list,/view\.records=mergeScheduleHistoryView\(latest,overlap\?view\.records:\[\]\)/);
  assert.match(source,/detail:ui\('schedule-detail-view'\)/);
  assert.match(source,/function openDetail\(scheduleId\)/);
  assert.match(source,/function leaveDetail\(\)/);
  assert.match(source,/scroller.scrollTop=listScrollTop/);
  assert.match(source,/scroller.scrollTop=view==='list'&&\['detail','form'\].includes\(prior\)\?listScrollTop:\s*view==='form'&&prior==='manager'&&managerReturn==='form'\?formScrollTop:0/,
    'index scroll restoration and editor scroll restoration both remain intact');
  assert.match(source,/function focusReturnedView\(view,scheduleId=editing\?\.scheduleId\)/);
  assert.match(source,/focus\(\{preventScroll:true\}\)/);
  assert.match(source,/formReturnView=activeView==='detail'\?'detail'/);
  assert.match(source,/requestLeaveForm\(formReturnView\)/);
  assert.match(source,/afterSave=editing\?formReturnView/);
  assert.match(source,/if\(returnAfterDelete&&activeView==='detail'\)leaveDetail\(\)/);
  assert.match(source,/scheduleId:plan.scheduleId,offset:view.records.length,limit:20/);
  assert.ok(renderDetail({deleteReview:true}).querySelector('.schedule-delete-confirm'));
  assert.match(source,/expectedGeneration:plan.generation,action:operation/);
  assert.match(css,/\.schedule-card-head \.schedule-plan-open\{/);
  assert.doesNotMatch(source,/chrome\.alarms\.create|new Worker\(/);
});


// Component-only DOM fixture. No Chrome permission, native input, Fire or Result
// is fabricated as product evidence; genuine native coverage lives in R3.
async function scheduledDomFixture({count=1,historyCount=1,historyFailures=0,host={},rpc={},receiveDraft=null}={}){
  const {document,window}=parseHTML('<!doctype html><html><body><main id="workspace-content"><div id="my-test-root"></div></main></body></html>');
  Object.assign(globalThis,{window,document});
  const myView=createMyWorkbenchView(),root=createRoot(document.getElementById('my-test-root'));
  const render=()=>flushSync(()=>root.render(React.createElement(MyTasksPage,{view:myView})));
  const unsubscribe=myView.subscribe(render);
  render();
  let focused=document.body;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  const prepare=node=>{
    node.focus=()=>{focused=node;};
    // Component-only gesture driver: React receives the modeled trust bit;
    // the companion schedule test verifies rejection of untrusted events.
    const dispatch=node.dispatchEvent.bind(node);
    node.dispatchEvent=event=>{
      const result=dispatch(event);if(['click','input','change','keydown'].includes(event.type))render();return result;
    };
    node.click=()=>{
      if(node.disabled)return;
      const event=new window.Event('click',{bubbles:true});
      Object.defineProperty(event,'isTrusted',{value:true});node.dispatchEvent(event);
    };
    if(node.tagName==='DETAILS')Object.defineProperty(node,'open',{
      get:()=>node.hasAttribute('open'),
      set:next=>{const changed=node.hasAttribute('open')!==Boolean(next);node.toggleAttribute('open',Boolean(next));
        if(changed)node.dispatchEvent(new window.Event('toggle'));},configurable:true
    });
    if(node.tagName==='SELECT'){
      Object.defineProperty(node,'value',{
        get:()=>node.querySelector('option[selected]')?.value||'',
        set:next=>{for(const option of node.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(next));},
        configurable:true
      });
    }
    return node;
  };
  const prepared=new WeakSet();
  const prepareTree=()=>document.querySelectorAll('*').forEach(node=>{if(!prepared.has(node)){prepared.add(node);prepare(node);}});
  const prepareUnsubscribe=myView.subscribe(prepareTree);
  prepareTree();
  const create=document.createElement.bind(document);
  document.createElement=(...args)=>{const node=create(...args);prepared.add(node);return prepare(node);};
  document.getElementById('schedule-form').reset=()=>{};
  const now=Date.now();
  const history=Array.from({length:historyCount},(_,i)=>({fireId:'fire-'+i,
    scheduledAt:now-i*60000,status:i===0?'UNKNOWN':'SUCCESS',runId:'run-'+i,
    resultId:'result-'+i,retirementState:'released'}));
  const installed={taskId:'sample.task',version:'1.0.0',enabled:true,
    installationId:'install',manifestHash:'manifest',generation:1};
  const entry={...installed,stage:'available',manifest:{title:'很长的中文任务名称'.repeat(6),
    siteOrigins:['https://example.com']}};
  const state={plans:Array.from({length:count},(_,i)=>({scheduleId:'plan-'+i,generation:1,
    title:'计划'+i+'长中文名称'.repeat(8),taskId:installed.taskId,version:installed.version,
    sourceHash:'source',manifestHash:installed.manifestHash,installationId:'install',taskGeneration:1,
    paused:true,nextDueAt:null,timezone:'Asia/Shanghai',triggerKind:'daily',
    triggerSpec:{hour:9,minute:0},targetUrl:'https://example.com/'+('long/path/'.repeat(20)),
    params:{keep:'original'},misfirePolicy:'skip',startDeadlineMs:300000,
    history:i===0?history.slice(0,20):[]})),history,historyFailures,installed:[installed],catalog:[entry],calls:[]};
  const client={async request(method,input){
    state.calls.push({method,input});
    if(typeof rpc[method]==='function')return rpc[method](input,state);
    if(method==='listTaskCatalog')return structuredClone({catalog:state.catalog,installed:state.installed});
    if(method==='listSchedules')return {schedules:structuredClone(state.plans)};
    if(method==='listScheduleHistory'){
      if(state.historyFailures-->0)throw Error('component history unavailable');
      return {history:structuredClone(state.history.slice(input.offset,input.offset+input.limit)),
        hasMore:input.offset+input.limit<state.history.length};
    }
    throw Error('Unexpected component RPC '+method);
  }};
  const ui=createScheduledTaskWorkbench({client,document,myView,
    host,taskWorkbench:{navigate(){},receiveDraft:receiveDraft||(()=>{throw Error('Unexpected Developer import');})},
    api:{permissions:{contains:async()=>true}}});
  const dispose=()=>{fixtures.delete(dispose);uiDispose();unsubscribe();prepareUnsubscribe();flushSync(()=>root.unmount());};
  const uiDispose=ui.dispose.bind(ui);ui.dispose=dispose;fixtures.add(dispose);
  await ui.open();render();prepareTree();
  return {document,window,state,ui,myView,get:id=>document.getElementById(id),
    flush:async()=>{await new Promise(resolve=>setImmediate(resolve));render();}};
}

test('R34.6 schedule save rejects a silent installed Task Generation shift',async()=>{
  const source=await load('src/ui/scheduled-task-workbench.js');
  const save=source.slice(source.indexOf('  async function save(event){'),
    source.indexOf('  async function confirmSave(){'));
  assert.match(save,/resolved\.generation!==local\.row\.generation/,
    'the new plan must not bind a later authorization generation without review');
});

test('R34.6 Task source copy rejects a real Registry generation change after candidate read',async()=>{
  const source='async function main(){return "verified fixture";}';
  const imports=[];
  const {ui,get,state,flush}=await scheduledDomFixture({
    rpc:{getTaskCandidate:(_input,current)=>{
      current.installed[0].generation+=1;
      return {taskId:'sample.task',version:'1.0.0',manifestHash:'manifest',
        package:{sourceUtf8:source}};
    }},
    receiveDraft:async value=>{imports.push(value);}
  });
  const plansBefore=structuredClone(state.plans);
  get('schedule-open-manager').click();await flush();
  get('schedule-manager-list').querySelector('.schedule-manager-copy').click();await flush();
  assert.equal(get('schedule-copy-confirm').hidden,false);
  get('schedule-copy-yes').click();await flush();
  await flush();
  assert.equal(imports.length,0,'a stale generation never overwrites the Developer draft');
  assert.match(get('schedule-message').textContent,/安装或授权在复制期间已变更/);
  assert.equal(get('scheduled-panel').hidden,false,'recovery remains visible');
  assert.deepEqual(state.plans,plansBefore,'rejecting copy does not rebind scheduled plans');
  assert.equal(state.calls.filter(call=>call.method==='listTaskCatalog').length,2,
    'the fixed installation identity is fetched again after candidate read');
  ui.dispose();
});

test('R34.6 unchanged fixed Task source still copies to Developer without scheduling it',async()=>{
  const source='async function main(){return "unchanged";}';
  const imports=[];
  const {ui,get,state,flush}=await scheduledDomFixture({
    rpc:{getTaskCandidate:()=>({taskId:'sample.task',version:'1.0.0',
      manifestHash:'manifest',package:{sourceUtf8:source}})},
    receiveDraft:async value=>{imports.push(value);}
  });
  const before=structuredClone(state.plans);
  get('schedule-open-manager').click();await flush();
  get('schedule-manager-list').querySelector('.schedule-manager-copy').click();await flush();
  get('schedule-copy-yes').click();await flush();
  await flush();
  assert.deepEqual(imports,[source],'Developer receives the exact candidate source');
  assert.equal(get('scheduled-panel').hidden,true,'manager closes only after import succeeds');
  assert.deepEqual(state.plans,before,'copy never creates or modifies a schedule');
  assert.equal(state.calls.some(call=>['saveSchedule','changeSchedule','uninstallTask'].includes(call.method)),false);
  ui.dispose();
});

test('R5.1 schedule Back restores My opener focus and task surface without rebuilding the task list',async()=>{
  const {document,ui,get,flush}=await scheduledDomFixture();
  const surface=document.querySelector('#workbench-tasks .tasks-surface');
  assert.equal(get('scheduled-panel').hidden,false);
  assert.equal(surface.hidden,true);
  get('schedule-back').focus();
  get('schedule-back').click();await flush();
  assert.equal(get('scheduled-panel').hidden,true);
  assert.equal(surface.hidden,false);
  assert.equal(document.activeElement===get('schedule-open'),true);
  ui.dispose();
});

test('R32 empty list has one explanation and restores the summary when plans arrive',async()=>{
  const {document,ui,get,state,flush}=await scheduledDomFixture();
  const plan=state.plans[0];
  state.plans=[];
  await ui.refresh();
  const list=get('schedule-plan-list');
  assert.equal(get('schedule-list-summary').hidden,true);
  assert.equal(list.querySelectorAll('.schedule-empty').length,1);
  assert.equal(list.querySelector('[role=status] h3').textContent,'尚无定时计划');
  assert.equal(list.textContent.match(/尚无定时计划/g)?.length,1);
  assert.match(list.querySelector('.schedule-empty-hint').textContent,/右上角「＋ 新建」/);
  assert.equal(list.querySelectorAll('button').length,0,'the header remains the single create entry');
  state.plans=[plan];
  await ui.refresh();
  assert.equal(get('schedule-list-summary').hidden,false);
  assert.equal(list.querySelector('.schedule-empty'),null);
  assert.equal(list.querySelectorAll('.schedule-card').length,1);
  assert.match(get('schedule-list-summary').textContent,/共 1 个计划/);
  assert.equal(get('schedule-list-summary').textContent.includes(plan.title),false,
    'a long plan title belongs in its card rather than being repeated in the summary');
  get('schedule-create').click();await flush();
  assert.equal(get('schedule-form').hidden,false);
  assert.equal(get('schedule-list-view').hidden,true);
  assert.equal(get('schedule-cancel').textContent,'返回定时计划');
  assert.equal(document.querySelectorAll('#schedule-create').length,1);
  ui.dispose();
});

test('R32 list editing keeps contextual return text and secondary plan actions',async()=>{
  const {ui,get,document,flush}=await scheduledDomFixture();
  const buttons=get('schedule-plan-list').querySelectorAll('.schedule-plan-actions button');
  assert.equal(buttons.length,2);
  assert.equal([...buttons].every(button=>button.classList.contains('od-icon-button')),true);
  assert.deepEqual([...buttons].map(button=>button.getAttribute('aria-label').slice(0,4)),
    ['恢复计划','编辑计划']);
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  get('schedule-detail-edit').click();await flush();
  assert.equal(get('schedule-cancel').textContent,'返回计划详情');
  get('schedule-cancel').click();await flush();
  assert.equal(get('schedule-detail-view').hidden,false);
  document.documentElement.dataset.opendeskSurface='scheduled-runner';
  await ui.open();
  get('schedule-create').click();await flush();
  assert.equal(get('schedule-cancel').textContent,'返回运行概览');
  assert.equal(get('schedule-back').getAttribute('aria-label'),'返回运行概览');
  get('schedule-cancel').click();await flush();
  assert.equal(get('schedule-runner-view').hidden,false);
  ui.dispose();
});

test('R32 runner action keeps the live Host status while its launch button moves to the header',async()=>{
  const {document,ui,get,flush}=await scheduledDomFixture({count:0});
  const status=get('schedule-host-status'),runner=get('schedule-open-runner');
  assert.equal(status.parentElement?.id,'schedule-list-view',
    'the live Host status stays in the plan list instead of being moved into the header');
  assert.equal(runner.parentElement.classList.contains('schedule-runner-secondary'),true,
    'runner is secondary to top-right plan management and creation');
  assert.equal(runner.textContent.trim(),'打开运行概览');
  assert.equal(runner.getAttribute('aria-label'),'打开独立运行页');
  assert.equal(runner.classList.contains('od-button'),true);
  status.textContent='宿主已断开；等待重新连接';
  await ui.refresh();
  assert.equal(get('schedule-host-status')===status,true,'the host retains the same status node');
  assert.equal(status.textContent,'宿主已断开；等待重新连接');
  assert.equal(get('schedule-create').getAttribute('aria-label'),'新建定时计划');
  assert.equal(document.querySelectorAll('#schedule-open-runner').length,1);
  ui.dispose();
});

test('R33.3.15-C mouse hover, focus and touch reveal safe schedule card actions',async()=>{
  const [css,preview,shared]=await Promise.all([
    load('src/ui/tool-shell.css'),
    load('src/ui/react/preview/sidebar-six-my-flows.tsx'),
    load('src/ui/react/tabs/schedule.tsx')
  ]);
  assert.match(css,/\.schedule-card:is\(:hover,:focus-within\) \.schedule-plan-actions/,
    'mouse hover and keyboard focus both reveal quick actions');
  assert.match(css,/@media\(hover:none\), \(pointer:coarse\)/,
    'touch devices do not depend on hover to show controls');
  assert.match(css,/\.schedule-card \.schedule-plan-actions\{position:absolute/,
    'fine-pointer toolbar must float instead of reserving an always-visible action column');
  assert.match(preview,/createPortal\(<SchedulePlanRows/);
  assert.match(shared,/data-schedule-action="stop"/);
  assert.match(shared,/data-schedule-action="toggle"/);
  assert.match(shared,/presentation\.nextText/);
  assert.match(shared,/presentation\.frequencyText/);
  assert.doesNotMatch(preview,/UI_PREVIEW_ONLY ·|预览表单：|不写入真实计划/,
    'development markers must not leak into the create form');
});

test('R33.3.15-C plan cards stop only the current owned Fire and keep the plan scheduled',async()=>{
  const stops=[],host={currentRun:'run-0',
    async stop(input){stops.push(input);return {state:'unknown'};}};
  const {ui,get,state,flush}=await scheduledDomFixture({host});
  const plan=state.plans[0];
  plan.paused=false;plan.nextDueAt=Date.now()+3600000;
  plan.history[0].status='RUNNING';
  await ui.refresh();
  let card=get('schedule-plan-list').querySelector('.schedule-card');
  let stop=card.querySelector('[data-schedule-action="stop"]');
  assert.ok(stop,'admitted/running Fire exposes a distinct quick-stop icon');
  assert.equal(stop.disabled,false,'only the verified current Host run can be stopped');
  assert.match(stop.getAttribute('aria-label'),/^停止本次执行/);
  assert.match(card.querySelector('.schedule-state').getAttribute('aria-label'),/执行：运行中；计划：已安排/,
    'the one-line icon tooltip must distinguish Fire execution from plan lifecycle');
  assert.equal(card.querySelector('.schedule-state').getAttribute('role'),'img');
  assert.match(card.querySelector('.schedule-plan-frequency').textContent,/每天/);
  assert.match(card.querySelector('.schedule-next-time').textContent,/下次/);
  stop.click();await flush();
  assert.deepEqual(stops,[{runId:'run-0',controller:true}]);
  assert.equal(state.plans[0].paused,false,'stopping a Fire does not pause a schedule');
  assert.match(get('schedule-message').textContent,/以运行记录为准/);
  // A stale or foreign Host must not gain a functional stop control.
  host.currentRun='different-run';
  await ui.refresh();
  card=get('schedule-plan-list').querySelector('.schedule-card');
  stop=card.querySelector('[data-schedule-action="stop"]');
  assert.equal(stop.disabled,true);
  stop.click();await flush();
  assert.equal(stops.length,1,'no second stop request after Host ownership changes');
  state.plans[0].history[0].status='UNKNOWN';
  await ui.refresh();
  assert.equal(get('schedule-plan-list').querySelector('[data-schedule-action="stop"]'),null,
    'unknown execution is not safe to stop or automatically retry');
  ui.dispose();
});


test('R33.3.19 manager is in plan header; detail delete has one owner and cancellable review',async()=>{
  const {document,ui,get,flush}=await scheduledDomFixture();
  assert.equal(get('schedule-open-manager').hidden,false);
  get('schedule-open-manager').click();await flush();
  assert.equal(get('schedule-task-manager').hidden,false);
  assert.equal(get('schedule-manager-create').hidden,false);
  const taskCard=get('schedule-manager-list').querySelector('.schedule-manager-card');
  assert.ok(taskCard);
  assert.equal(taskCard.querySelector('.schedule-manager-title-line .schedule-manager-state')
    .getAttribute('role'),'img');
  assert.ok(taskCard.querySelector('.schedule-manager-menu > summary'));
  assert.ok(taskCard.querySelector('.schedule-manager-menu-panel .schedule-manager-uninstall'));
  get('schedule-back').click();await flush();
  assert.equal(get('schedule-list-view').hidden,false);
  assert.equal(get('schedule-open-manager').hidden,false);
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  assert.equal(get('schedule-detail-delete').hidden,false);
  assert.equal(get('schedule-detail-view').querySelector('.schedule-more .schedule-danger-link'),null,
    'deletion cannot remain inside additional actions');
  get('schedule-detail-delete').click();await flush();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-delete-confirm').length,1);
  const review=get('schedule-detail-view').querySelector('.schedule-delete-confirm');
  assert.match(review.textContent,/Run\/Result 历史不会因删除计划自动清除/);
  assert.equal(document.activeElement===review.querySelector('button'),true);
  review.querySelectorAll('button')[1].click();await flush();
  assert.equal(get('schedule-detail-view').querySelector('.schedule-delete-confirm'),null);
  assert.equal(document.activeElement===get('schedule-detail-delete'),true);
  assert.equal(get('schedule-detail-view').hidden,false,
    'cancel only closes the review; it never commits a delete');
  ui.dispose();
});
test('R24.2 finished one-off detail hides impossible pause; header deletion requires confirmation',async()=>{
  const {get,state,ui,flush}=await scheduledDomFixture();
  const plan=state.plans[0];
  plan.triggerKind='once';plan.paused=false;plan.nextDueAt=null;
  await ui.refresh();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  assert.equal(get('schedule-detail-delete').hidden,false);
  assert.equal(get('schedule-detail-view').querySelector('.schedule-detail-actions button'),null,
    'a finished one-off must not offer pause or resume');
  get('schedule-detail-delete').click();await flush();
  const review=get('schedule-detail-view').querySelector('.schedule-delete-confirm');
  assert.ok(review,'header action opens review, not deletion');
  assert.equal(state.plans.length,1);
  review.querySelectorAll('button')[1].click();await flush();
  assert.equal(get('schedule-detail-view').querySelector('.schedule-delete-confirm'),null);
  assert.equal(state.plans.length,1);
  get('schedule-back').click();await flush();
  assert.equal(get('schedule-detail-delete').hidden,true);
  ui.dispose();
});

test('R1.2 polling preserves expanded per-Fire technical detail and keyboard focus',async()=>{
  const {get,state,ui,document,flush}=await scheduledDomFixture();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  const history=get('schedule-detail-view').querySelector('.schedule-history');history.open=true;
  const technical=history.querySelector('.schedule-run-details');technical.open=true;
  technical.querySelector('summary').focus();
  get('workspace-content').scrollTop=260;
  state.plans[0].history[0].status='FAILED';await ui.refresh();
  const updated=get('schedule-detail-view').querySelector('.schedule-run-details');
  assert.equal(updated.open,true,'background result update must retain the expanded actual Fire');
  assert.equal(document.activeElement===updated.querySelector('summary'),true,'keyboard focus stays on the same Fire');
  assert.equal(get('workspace-content').scrollTop,260,'poll must not jump the detail scroll');
  ui.dispose();
});

test('R1.2 task poll with identical choices preserves option nodes, selection, focus and draft',async()=>{
  const {get,state,ui,document,flush}=await scheduledDomFixture();
  get('schedule-create').click();await flush();
  const select=get('schedule-task-select');
  select.value='sample.task';
  select.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));await flush();
  select.focus();
  get('schedule-title').value='未保存草稿';
  get('schedule-title').dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  const options=[...select.querySelectorAll('option')];
  state.catalog[0]={...state.catalog[0],receipt:{generatedAt:Date.now(),note:'metadata-only'}};
  state.installed[0]={...state.installed[0],lastSeenAt:Date.now()};
  await ui.refresh();
  const refreshed=[...select.querySelectorAll('option')];
  assert.equal(refreshed.length,options.length);
  refreshed.forEach((option,index)=>assert.equal(option===options[index],true,
    'metadata-only refresh with the same value/label/disabled projection must not rebuild options'));
  assert.equal(select.value,'sample.task','selected task remains fixed on the draft');
  assert.equal(document.activeElement===select,true,'focused native select node remains active');
  assert.equal(get('schedule-title').value,'未保存草稿','unrelated draft fields remain untouched');
  get('schedule-cancel').click();await flush();
  assert.equal(get('schedule-discard-confirm').hidden,false,'dirty draft state remains visible');
  ui.dispose();
});

test('R1.2 real task choice changes update options without rebinding a locked edit plan',async()=>{
  const {get,state,ui,flush}=await scheduledDomFixture();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  get('schedule-detail-edit').click();await flush();
  const select=get('schedule-task-select');
  assert.equal(select.disabled,true);
  assert.equal(select.value,'sample.task');
  const before=[...select.querySelectorAll('option')];
  state.installed=[{taskId:'other.task',version:'1.0.0',enabled:true,
    installationId:'install-other',manifestHash:'manifest-other',generation:1}];
  state.catalog=[{...state.installed[0],stage:'available',
    manifest:{title:'另一个任务',siteOrigins:['https://example.com']}}];
  await ui.refresh();
  const after=[...select.querySelectorAll('option')];
  assert.equal(after.some((option,index)=>option!==before[index]),true,
    'actual uninstall/replacement changes the visible choices');
  assert.equal(after.at(-1).value,'sample.task','locked editor keeps the original task value available');
  assert.equal(after.at(-1).hasAttribute('disabled'),true,'unavailable fixed task is shown as disabled review state');
  assert.equal(select.value,'sample.task','editing does not silently rebind to the newly installed task');
  assert.equal(select.disabled,true,'editing still forbids task changes after refresh');
  ui.dispose();
});

test('R1.2 task manager return keeps editor draft, scroll and visible focus',async()=>{
  const {get,ui,document,flush}=await scheduledDomFixture();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  get('schedule-detail-edit').click();await flush();
  get('schedule-title').value='未保存的计划';
  get('schedule-title').dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  get('workspace-content').scrollTop=170;
  get('schedule-manage-tasks').click();await flush();
  await ui.refresh();
  assert.equal(get('schedule-back').hidden,false,'manager exposes the shared page-header Back');
  get('schedule-back').click();await flush();
  assert.equal(get('schedule-form').hidden,false);
  assert.equal(get('schedule-title').value,'未保存的计划');
  assert.equal(document.activeElement?.id,'schedule-manage-tasks','return receives a visible editor control');
  assert.equal(get('workspace-content').scrollTop,170);
  get('schedule-cancel').click();await flush();
  assert.equal(get('schedule-discard-confirm').hidden,false,'unsaved draft still requires review');
  ui.dispose();
});

test('R1.2 externally removed detail returns to a usable index',async()=>{
  const {get,state,ui,document,flush}=await scheduledDomFixture({count:2});
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  state.plans.shift();await ui.refresh();await flush();
  assert.equal(get('schedule-detail-view').hidden,true,'removed plan must not leave a blank detail');
  assert.equal(get('schedule-list-view').hidden,false);
  assert.equal(document.activeElement===get('schedule-plan-list').querySelector('.schedule-plan-open'),true,
    'removed plan must focus a remaining card (active connected: '+document.activeElement?.isConnected+')');
  assert.match(get('schedule-message').textContent,/已.*移除|已.*删除/);
  ui.dispose();
});

test('R1.2 120-record pagination retains pages and keeps twenty plans isolated on poll',async()=>{
  const {get,state,ui,flush}=await scheduledDomFixture({count:20,historyCount:120});
  assert.equal(get('schedule-plan-list').querySelectorAll('.schedule-card').length,20);
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  get('schedule-detail-view').querySelector('.schedule-history').open=true;
  for(let page=0;page<5;page++){
    get('schedule-detail-view').querySelector('.schedule-load-more').click();await flush();
  }
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,120);
  assert.equal(get('schedule-detail-view').querySelector('.schedule-load-more'),null);
  state.plans[0].generation++;await ui.refresh();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,120);
  get('schedule-back').click();await flush();
  get('schedule-plan-list').querySelectorAll('.schedule-plan-open')[1].click();await flush();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,0);
  get('schedule-back').click();await flush();get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,120);
  assert.deepEqual(state.calls.filter(call=>call.method==='listScheduleHistory').map(call=>call.input.offset),[20,40,60,80,100]);
  ui.dispose();
});

test('R1.2 successful history retry clears only its local error and preserves final-page focus',async()=>{
  const {get,ui,document,flush}=await scheduledDomFixture({historyCount:21,historyFailures:1});
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  const history=get('schedule-detail-view').querySelector('.schedule-history');history.open=true;
  const more=history.querySelector('.schedule-load-more');more.click();await flush();
  assert.match(history.textContent,/component history unavailable/);
  get('schedule-message').textContent='其他授权反馈应保留';
  more.focus();more.click();await flush();
  assert.equal(history.querySelectorAll('.schedule-history-row').length,21);
  assert.equal(history.querySelector('.schedule-history-status').hidden,true);
  assert.equal(history.querySelector('.schedule-history-status').textContent,'');
  assert.equal(get('schedule-message').textContent,'其他授权反馈应保留');
  assert.equal(document.activeElement===history.querySelector('summary'),true,
    'removing the final pagination button leaves focus in the visible history (active connected: '+document.activeElement?.isConnected+')');
  ui.dispose();
});

test('R1.2 background changes retain focus on installed-task recovery action',async()=>{
  const {get,state,ui,document,flush}=await scheduledDomFixture({count:2});
  state.plans[0].needsAttention=true;await ui.refresh();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  get('schedule-detail-view').querySelector('.schedule-status-help button').focus();
  state.plans[1].generation++;await ui.refresh();
  assert.equal(document.activeElement===get('schedule-detail-view').querySelector('.schedule-status-help button'),true);
  ui.dispose();
});

test('R1.2 resolved recovery state returns focus to the stable detail header',async()=>{
  const {get,state,ui,document,flush}=await scheduledDomFixture();
  state.plans[0].needsAttention=true;await ui.refresh();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();await flush();
  get('schedule-detail-view').querySelector('.schedule-status-help button').focus();
  state.plans[0].needsAttention=false;await ui.refresh();await flush();
  assert.equal(document.activeElement===get('schedule-back'),true,
    'removing a resolved recovery action must not leave keyboard focus detached (active connected: '+document.activeElement?.isConnected+')');
  ui.dispose();
});
