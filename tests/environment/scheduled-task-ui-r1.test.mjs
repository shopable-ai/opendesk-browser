import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalToolHostUrl} from '../../src/ui/sidebar-tools/navigation.js';
import {toolDocumentIdentity} from '../../src/tool-document-url.js';
import {isToolSender} from '../../src/environment.js';
import {parseHTML} from 'linkedom';
import {createScheduledTaskWorkbench,mergeScheduleHistoryView,commitScheduledMutation} from '../../src/ui/scheduled-task-workbench.js';

const load=path=>readFile(path,'utf8');
const extension='chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
const base=extension+'ui/tool.html';
const host='12345678-1234-4123-8123-123456789abc';

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
  assert.match(ui,/element\(doc,'details','schedule-run-details od-disclosure od-disclosure--flat'\)/);
  assert.match(ui,/RunId：/);
  assert.match(ui,/scheduleStatus\(fire.status\)/);
});

test('R2 create form validates URL, JSON and wall-time inline and requires an explicit product confirmation',async()=>{
  const [html,ui,css]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css')
  ]);
  for(const id of ['schedule-title-error','schedule-task-error','schedule-target-error',
    'schedule-params-error','schedule-time-error','schedule-save-confirm',
    'schedule-save-summary','schedule-confirm-yes','schedule-confirm-no'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-save-confirm"[^>]*hidden/);
  assert.match(html,/<form id="schedule-form"[^>]*novalidate/);
  assert.match(ui,/revision!==editRevision/);
  assert.match(html,/id="schedule-save"[^>]*>检查并确认/);
  assert.match(ui,/function validateLocal\(showAll=false\)/);
  assert.match(ui,/fail\('target'/);
  assert.match(ui,/fail\('params'/);
  assert.match(ui,/awaitingSave=\{input\}/);
  assert.match(ui,/bind\('schedule-confirm-yes','click'/);
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
  assert.match(ui,/加载更早记录/);
  assert.match(ui,/makeHistoryRow\(fire,plan\.timezone\)/);
  assert.match(repo,/grouped\.push\(\.\.\.await tx\.scan\('frameworkKV'/);
  assert.match(repo,/generation>=1&&grouped\.length<needed/);
  assert.match(broker,/'listSchedules','listScheduleHistory','listDueSchedules'/);
  assert.match(authority,/'listSchedules','listScheduleHistory','listDueSchedules'/);
});

test('R2 current authorization controls plan badge without hiding historical needs-attention failure',async()=>{
  const ui=await load('src/ui/scheduled-task-workbench.js');
  assert.match(ui,/plan\.paused\?'已暂停':plan\.needsAttention\?'需要处理':/);
  assert.match(ui,/!Number\.isFinite\(plan\.nextDueAt\)\?'暂无后续':'已启用'/);
  assert.match(ui,/Number\.isFinite\(plan\.nextDueAt\)\?\s*'下次：'/);
  assert.doesNotMatch(ui,/plan\.history\?\.\[0\]\?\.status==='NEEDS_ATTENTION'\?'需要处理'/);
  assert.match(ui,/scheduleStatus\(last.status\)/,'historical denial remains visible in history');
});

test('R2.3 explains audit retention and shows native Chrome origin-wide storage without deleting records',async()=>{
  const [html,ui,css,shared]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css'),load('src/ui/design-system.css')
  ]);
  assert.match(html,/id="schedule-storage-status"[^>]*role="status"/);
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

test('R2.6 plan list keeps next run prominent and destructive actions behind explicit review',async()=>{
  const [html,css,ui,shared]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),load('src/ui/design-system.css')
  ]);
  assert.match(html,/id="schedule-list-summary"[^>]*aria-live="polite"/);
  assert.match(ui,/const next=element\(doc,'p','schedule-next-time'/);
  assert.match(ui,/const more=element\(doc,'details','schedule-more od-disclosure od-disclosure--flat'\)/);
  assert.match(ui,/more\.append\(remove\)/);
  assert.match(ui,/\`确定删除「\$\{plan\.title\}」/);
  assert.match(ui,/client\.request\('changeSchedule'/);
  assert.match(css,/\.schedule-card \.schedule-next-time\{font-size:16px/);
  assert.match(css,/\.schedule-plan-actions\{justify-content:flex-start/);
  assert.match(shared,/(?:^|\n):focus-visible,#workspace-content :focus-visible\{outline:2px solid var\(--od-focus\);outline-offset:2px\}/);
  assert.match(shared,/\.od-disclosure--flat>summary\{min-height:36px/);
});
test('R2.6 runner separates running Fire from waiting history and preserves original Stop contract',async()=>{
  const [html,css,ui]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/tool-shell.css'),
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
    load('src/ui/tool.html'),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css')
  ]);
  for(const id of ['schedule-discard-confirm','schedule-discard-yes','schedule-discard-no'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-discard-confirm"[^>]*hidden/);
  assert.match(ui,/function requestLeaveForm\(destination\)/);
  assert.match(ui,/if\(formDirty\)\{/);
  assert.match(ui,/function navigateBack\(\)/);
  assert.match(ui,/bind\('schedule-back','click',navigateBack\)/);
  assert.match(ui,/bind\('schedule-cancel','click',\(\)=>requestLeaveForm/);
  assert.match(ui,/function leaveManager\(\)\{\s*const destination=managerReturn;\s*show\(destination\)/);
  assert.match(ui,/bind\('schedule-manager-back','click',leaveManager\)/,
    'the manager Back still uses the established navigation action');
  assert.match(ui,/if\(activeView==='manager'\)\{leaveManager\(\);return;\}/,
    'the visible header Back uses the same focus-restoring action');
  assert.match(ui,/if\(destination==='form'\)get\('schedule-manage-tasks'\)\.focus\(\{preventScroll:true\}\)/,
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
  assert.match(ui,/const nextValue=editing\?editing\.taskId/);
  assert.match(ui,/if\(select\.disabled!==disabled\)select\.disabled=disabled/);
  assert.match(ui,/get\('schedule-task-select'\)\.disabled=false/);
  assert.match(ui,/原计划固定任务不可用；请恢复相同安装身份与网站授权/);
  assert.match(ui,/pendingCreateFromForm=activeView==='form'/);
  assert.match(ui,/if\(!pendingCreateFromForm\)reset\(\)/);
  assert.match(ui,/if\(!editing\)\{\s*get\('schedule-task-select'\)\.value=taskId/);
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

test('R2.7 compact pinned timezone and important next-run callout match the canonical preview',async()=>{
  const [html,css,ui,preview]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/tool-shell.css'),
    load('src/ui/scheduled-task-workbench.js'),
    load('examples/ui/scheduled-tasks-r2.5-preview.html')
  ]);
  for(const id of ['schedule-timezone-summary','schedule-timezone-edit',
    'schedule-timezone-controls','schedule-timezone-done','schedule-timezone-search',
    'schedule-next','schedule-next-time','schedule-next-zone'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-timezone-controls"[^>]*hidden/);
  assert.match(html,/id="schedule-timezone-edit"[^>]*aria-expanded="false"/);
  assert.match(ui,/function setTimeZoneExpanded\(expanded,focus=false\)/);
  assert.match(ui,/updateTimeZoneSummary\(selected\)/);
  assert.match(ui,/populateTimeZoneSelect\(plan\.timezone\)/,
    'editing continues to preserve the original fixed IANA time zone');
  assert.match(ui,/setTimeZoneExpanded\(false\)/);
  assert.match(ui,/text\(get\('schedule-next-time'\),describeTime\(next,zone\)\)/);
  assert.match(ui,/setTimeZoneExpanded\(get\('schedule-timezone-controls'\)\.hidden,true\)/);
  assert.match(css,/\.schedule-next-preview>strong\{font-size:17px/);
  assert.match(css,/\.schedule-timezone-selected\{/);
  assert.doesNotMatch(css,/\.schedule-form \.od-field,\.schedule-rule \.od-field/,
    'R2.7 must not turn input.od-field and select.od-field into grid containers');
  assert.match(preview,/id="zone-summary"/);
  assert.match(preview,/data-action="zone-expand"/);
  assert.match(preview,/s\.zoneExpanded\?'':'hidden'/);
  assert.match(preview,/case 'zone-done'/);
});

test('R2.7 unavailable Controller task has an actionable, truthful empty state',async()=>{
  const [html,ui]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/scheduled-task-workbench.js')
  ]);
  assert.match(html,/id="schedule-task-empty"[^>]*hidden/);
  assert.match(html,/id="schedule-task-empty-create"/);
  assert.match(html,/请先在「开发」中验证并安装 Controller Task/);
  assert.match(ui,/get\('schedule-task-empty'\)\.hidden=disabled\|\|rows\.length>0/);
  assert.match(ui,/bind\('schedule-task-empty-create','click',enterDeveloper\)/);
  assert.match(ui,/bind\('scheduled-panel','keydown'/);
  assert.match(ui,/event\.key!=='Escape'/);
  assert.doesNotMatch(ui,/chrome\.permissions\.request\(/,
    'the UI must not bypass the normal Chrome permission gate');
});

test('R2.7 runner presents focus before compact summary and defers details',async()=>{
  const [html,css,ui,native]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/tool-shell.css'),
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
  assert.match(ui,/text\(get\('schedule-runner-focus-time'\)/);
  assert.match(ui,/host\.stop\(\{runId:selectedFire,controller:true\}\)/);
  assert.match(native,/await click\(client,session,'#schedule-timezone-edit'\)/);
  assert.match(native,/await click\(client,session,'#schedule-timezone-done'\)/);
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
  assert.match(source,/view\.open=Boolean\(root\.querySelector\('\.schedule-history'\)\?\.open\)/);
  assert.match(source,/view\.moreOpen=Boolean\(root\.querySelector\('\.schedule-more'\)\?\.open\)/);
  assert.match(source,/view\.deleteReview=Boolean\(root\.querySelector\('\.schedule-delete-confirm'\)\)/);
  assert.match(source,/restored\?\.querySelector\(focusedSelector\)\?\.focus\(\)/);
  assert.match(source,/scheduleId:plan\.scheduleId,offset:view\.records\.length,limit:20/);
  assert.match(source,/const overlap=!latest\.length\|\|!view\.records\.length/);
  assert.match(source,/view\.records=mergeScheduleHistoryView\(latest,overlap\?view\.records:\[\]\)/,
    'a non-overlapping first page cannot create a hidden pagination hole');
  assert.match(source,/if\(!previous\|\|!overlap\)view\.hasMore=latest\.length===20/);
  assert.match(source,/if\(shown\)\{\s*\/\/ Do not clear a visible inline save\/permission error/,
    'periodic refresh must not clear the active form error');
  assert.doesNotMatch(source,/chrome\.alarms\.create|new Worker\(/);
});

test('R2.8 production create form keeps 36px controls and a distinct field label layout',async()=>{
  const [html,css,shared]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/tool-shell.css'),load('src/ui/design-system.css')
  ]);
  for(const id of ['schedule-source-section-title','schedule-target-section-title',
    'schedule-timezone-summary','schedule-timezone-edit','schedule-timezone-controls',
    'schedule-next-time','schedule-next-zone','schedule-confirm-yes'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="schedule-timezone-controls"[^>]*hidden/);
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

test('R2.8 native runner does not dereference a retired Cloud quick entry',async()=>{
  const [html,source]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/scheduled-task-workbench.js')
  ]);
  assert.doesNotMatch(html,/class="[^"]*cloud-my-entry/,'latest production markup retired the entry');
  assert.match(source,/const cloudEntry=doc\.querySelector\('#workbench-tasks \.cloud-my-entry'\)/);
  assert.match(source,/if\(cloudEntry\)cloudEntry\.hidden=true/);
  assert.match(source,/if\(cloudEntry\)cloudEntry\.hidden=false/);
  assert.match(source,/doc\.querySelector\('#workbench-tasks \.tasks-surface'\)\.hidden=true/,
    'present Tasks surface remains the required original view');
  assert.doesNotMatch(source,/querySelector\('#workbench-tasks \.cloud-my-entry'\)\.hidden=/,
    'optional absent element must not crash before runner can display');
});

test('R2.8 subview navigation clears old editor errors without hiding current form errors on Host refresh',async()=>{
  const ui=await load('src/ui/scheduled-task-workbench.js');
  assert.match(ui,/const show=view=>\{[\s\S]*?const prior=activeView,changing=view!==prior;[\s\S]*?if\(changing\)message\(''\);\s*activeView=view;/,
    'only a deliberate subview change may clear the previous form notice');
  assert.match(ui,/if\(shown\)\{\s*\/\/ Do not clear a visible inline save\/permission error/,
    '15-second Host polling must preserve actionable validation while editing');
  assert.match(ui,/bind\('schedule-discard-yes','click',\(\)=>\{[\s\S]*?show\(discardDestination\)/,
    'explicit discard transitions to another view where stale errors are dismissed');
  assert.match(ui,/bind\('schedule-confirm-no','click',\(\)=>\{clearConfirmation\(\);get\('schedule-save'\)\.focus\(\);\}/,
    'returning to edit from confirmation keeps the active form state');
});

test('R1.2 edit-form task manager roundtrip restores origin focus and retains real native coverage',async()=>{
  const [source,native]=await Promise.all([
    load('src/ui/scheduled-task-workbench.js'),
    load('tests/framework/scheduled-tasks-r1-native-mac.test.mjs')
  ]);
  assert.match(source,/function leaveManager\(\)/);
  assert.match(source,/if\(activeView==='manager'\)\{leaveManager\(\);return;\}/);
  assert.match(source,/if\(destination==='form'\)get\('schedule-manage-tasks'\)\.focus\(\{preventScroll:true\}\)/);
  assert.match(source,/bind\('schedule-manager-back','click',leaveManager\)/);
  assert.match(native,/nativeManagerRoundTripPreservesDraft='PASS'/);
  assert.match(native,/assert\.deepEqual\(await readDraft\(\),unsaved,/);
  assert.match(native,/manager Back restores actual keyboard focus/);
});

test('R3 index vs detail navigation and fixed schedule authorization boundaries',async()=>{
  const [html,source,css]=await Promise.all([
    load('src/ui/tool.html'),load('src/ui/scheduled-task-workbench.js'),
    load('src/ui/tool-shell.css')
  ]);
  assert.match(html,/id="schedule-detail-view"[^>]*hidden/);
  assert.match(html,/id="schedule-detail-edit"[^>]*aria-label="编辑当前计划"[^>]*hidden/);
  assert.match(html,/class="schedule-header od-page-head"/);
  assert.match(html,/id="schedule-panel-title" class="od-page-title"/);
  const list=source.slice(source.indexOf('  function renderPlans(){'),source.indexOf('  function renderDetail(){'));
  assert(!list.includes('schedule-history od-disclosure')&&!list.includes('schedule-delete-confirm'),
    'index cards must not inline history or deletion');
  assert.match(list,/schedule-plan-open/);
  assert.match(list,/view\.records=mergeScheduleHistoryView\(latest,overlap\?view\.records:\[\]\)/);
  assert.match(source,/detail:get\('schedule-detail-view'\)/);
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
  assert.match(source,/if\(view.deleteReview\)remove.click\(\)/);
  assert.match(source,/expectedGeneration:plan.generation,action:operation/);
  assert.match(css,/\.schedule-card-head \.schedule-plan-open\{/);
  assert.doesNotMatch(source,/chrome\.alarms\.create|new Worker\(/);
});


// Component-only DOM fixture. No Chrome permission, native input, Fire or Result
// is fabricated as product evidence; genuine native coverage lives in R3.
async function scheduledDomFixture({count=1,historyCount=1,historyFailures=0}={}){
  const {document,window}=parseHTML(await load('src/ui/tool.html'));
  let focused=document.body;
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  const prepare=node=>{
    node.focus=()=>{focused=node;};
    if(node.tagName==='SELECT'){
      let value=node.querySelector('option')?.value||'';
      Object.defineProperty(node,'value',{get:()=>value,set:next=>{value=String(next);},configurable:true});
    }
    return node;
  };
  document.querySelectorAll('*').forEach(prepare);
  const create=document.createElement.bind(document);
  document.createElement=(...args)=>prepare(create(...args));
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
    if(method==='listTaskCatalog')return structuredClone({catalog:state.catalog,installed:state.installed});
    if(method==='listSchedules')return {schedules:structuredClone(state.plans)};
    if(method==='listScheduleHistory'){
      if(state.historyFailures-->0)throw Error('component history unavailable');
      return {history:structuredClone(state.history.slice(input.offset,input.offset+input.limit)),
        hasMore:input.offset+input.limit<state.history.length};
    }
    throw Error('Unexpected component RPC '+method);
  }};
  const ui=createScheduledTaskWorkbench({client,document,
    host:{},taskWorkbench:{navigate(){}},api:{permissions:{contains:async()=>true}}});
  await ui.open();
  return {document,window,state,ui,get:id=>document.getElementById(id),
    flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('R1.2 polling preserves expanded per-Fire technical detail and keyboard focus',async()=>{
  const {get,state,ui,document}=await scheduledDomFixture();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
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
  const {get,state,ui,document}=await scheduledDomFixture();
  get('schedule-create').click();
  const select=get('schedule-task-select');
  select.value='sample.task';
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
  get('schedule-cancel').click();
  assert.equal(get('schedule-discard-confirm').hidden,false,'dirty draft state remains visible');
  ui.dispose();
});

test('R1.2 real task choice changes update options without rebinding a locked edit plan',async()=>{
  const {get,state,ui}=await scheduledDomFixture();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
  get('schedule-detail-edit').click();
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
  assert.equal(after.at(-1).disabled,true,'unavailable fixed task is shown as disabled review state');
  assert.equal(select.value,'sample.task','editing does not silently rebind to the newly installed task');
  assert.equal(select.disabled,true,'editing still forbids task changes after refresh');
  ui.dispose();
});

test('R1.2 task manager return keeps editor draft, scroll and visible focus',async()=>{
  const {get,ui,document}=await scheduledDomFixture();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
  get('schedule-detail-edit').click();
  get('schedule-title').value='未保存的计划';
  get('schedule-title').dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  get('workspace-content').scrollTop=170;
  get('schedule-manage-tasks').click();
  await ui.refresh();
  assert.equal(get('schedule-back').hidden,false,'manager exposes the shared page-header Back');
  get('schedule-back').click();
  assert.equal(get('schedule-form').hidden,false);
  assert.equal(get('schedule-title').value,'未保存的计划');
  assert.equal(document.activeElement?.id,'schedule-manage-tasks','return receives a visible editor control');
  assert.equal(get('workspace-content').scrollTop,170);
  get('schedule-cancel').click();
  assert.equal(get('schedule-discard-confirm').hidden,false,'unsaved draft still requires review');
  ui.dispose();
});

test('R1.2 externally removed detail returns to a usable index',async()=>{
  const {get,state,ui,document}=await scheduledDomFixture({count:2});
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
  state.plans.shift();await ui.refresh();
  assert.equal(get('schedule-detail-view').hidden,true,'removed plan must not leave a blank detail');
  assert.equal(get('schedule-list-view').hidden,false);
  assert.equal(document.activeElement===get('schedule-plan-list').querySelector('.schedule-plan-open'),true);
  assert.match(get('schedule-message').textContent,/已.*移除|已.*删除/);
  ui.dispose();
});

test('R1.2 120-record pagination retains pages and keeps twenty plans isolated on poll',async()=>{
  const {get,state,ui,flush}=await scheduledDomFixture({count:20,historyCount:120});
  assert.equal(get('schedule-plan-list').querySelectorAll('.schedule-card').length,20);
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
  get('schedule-detail-view').querySelector('.schedule-history').open=true;
  for(let page=0;page<5;page++){
    get('schedule-detail-view').querySelector('.schedule-load-more').click();await flush();
  }
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,120);
  assert.equal(get('schedule-detail-view').querySelector('.schedule-load-more'),null);
  state.plans[0].generation++;await ui.refresh();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,120);
  get('schedule-back').click();
  get('schedule-plan-list').querySelectorAll('.schedule-plan-open')[1].click();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,0);
  get('schedule-back').click();get('schedule-plan-list').querySelector('.schedule-plan-open').click();
  assert.equal(get('schedule-detail-view').querySelectorAll('.schedule-history-row').length,120);
  assert.deepEqual(state.calls.filter(call=>call.method==='listScheduleHistory').map(call=>call.input.offset),[20,40,60,80,100]);
  ui.dispose();
});

test('R1.2 successful history retry clears only its local error and preserves final-page focus',async()=>{
  const {get,ui,document,flush}=await scheduledDomFixture({historyCount:21,historyFailures:1});
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
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
    'removing the final pagination button leaves focus in the visible history');
  ui.dispose();
});

test('R1.2 background changes retain focus on installed-task recovery action',async()=>{
  const {get,state,ui,document}=await scheduledDomFixture({count:2});
  state.plans[0].needsAttention=true;await ui.refresh();
  get('schedule-plan-list').querySelector('.schedule-plan-open').click();
  get('schedule-detail-view').querySelector('.schedule-status-help button').focus();
  state.plans[1].generation++;await ui.refresh();
  assert.equal(document.activeElement===get('schedule-detail-view').querySelector('.schedule-status-help button'),true);
  ui.dispose();
});
