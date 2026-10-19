import {createMyWorkbenchView} from './my-workbench-view.js';
import {permissionPattern} from '../environment.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {nextScheduleAt,parseWallScheduleTime,formatWallScheduleTime} from '../platform/tasks/schedule-time.js';
import {formatScheduleRule as frequencyLabel,formatScheduleTime as describeTime,
  scheduleFireLabel as scheduleStatus} from './schedule-plan-presentation.js';

const terminal=new Set(['SUCCESS','FAILED','STOPPED','UNKNOWN','MISSED','CANCELLED','NEEDS_ATTENTION']);
// Task management is a safe detour for an active editor, not a new-plan flow.
export const canStartScheduleFromManager=returnView=>returnView!=='form';
export const scheduleStatusGuidance=Object.freeze({
  READY:'已排队，等待到期后检查授权及运行条件。',
  WAITING_HOST:'这次触发曾等待合法可见运行宿主；保持运行页打开供后续检查。Chrome 退出时无法执行。',
  WAITING_TARGET:'等待获准访问的目标网页；按计划设置检查是否需要打开目标页。',
  WAITING_SLOT:'等待现有 Controller 执行槽；不会创建第二次执行。',
  ADMITTED:'已获准进入原执行链，等待真实结果。',
  RUNNING:'任务正在原 Controller 执行链运行。',
  SETTLING:'正在核对真实结果；结算前不是成功。',
  SUCCESS:'已报告执行成功，可展开历史查看关联结果。',
  FAILED:'执行失败；请查看历史并检查任务与目标网页。',
  STOPPED:'执行已停止；后续仍按原规则安排。',
  UNKNOWN:'执行结果无法确认，可能存在网页副作用；不会自动重试，请人工核对。',
  MISSED:'错过了触发时间；是否补执行依照计划的错过策略。',
  CANCELLED:'本次触发已取消；不表示执行成功。',
  NEEDS_ATTENTION:'任务安装身份或网站授权需处理；不会自动更换版本。'
});
// The host polls every 15 seconds. Keep the original FireId and loaded history
// pages in the visible list when a fresher snapshot arrives; never synthesize
// a Run/Result or reuse a stale page offset after new history appears.
export function mergeScheduleHistoryView(latest=[],loaded=[]){
  const ids=new Set();
  return [...latest,...loaded].filter(fire=>{
    if(typeof fire?.fireId!=='string'||!fire.fireId||ids.has(fire.fireId))return false;
    ids.add(fire.fireId);return true;
  }).sort((a,b)=>b.scheduledAt-a.scheduledAt);
}
// A mutation acknowledged by the authoritative scheduler has succeeded even
// when the following read cannot refresh the UI. Never encourage a duplicate
// create/delete/retry by presenting a post-commit read error as a write failure.
export async function commitScheduledMutation(commit,refreshView){
  const result=await commit();
  try{await refreshView();return {result,refreshError:null};}
  catch(refreshError){return {result,refreshError};}
}
// The Host client can time out after a durable mutation (E_EFFECT_UNKNOWN),
// and schedule-service reconciles alarms after committing a schedule. Only
// known pre-write contract/revision rejections prove that nothing changed.
const rejectedBeforeMutation=new Set(['E_SCHEMA','E_REVISION','E_REQUEST_CONFLICT','E_VERIFICATION']);
export function describeScheduleMutationFailure(error,action='操作'){
  const detail=String(error?.message||error||'Host 请求未完成').slice(0,240);
  const confirmedRejection=rejectedBeforeMutation.has(error?.code);
  return {uncertain:!confirmedRejection,message:confirmedRejection?
    action+'未完成：'+detail:
    action+'结果未知：'+detail+'。请重新读取真实状态核对，确认前不要重复操作。'};
}
/* Only UI choices; the storage/Alarm contract still accepts a concrete IANA
 * timeZone string. A detected device zone is a one-time default, not an auto
 * binding that silently shifts an existing scheduled plan. */
const commonScheduleTimeZones=Object.freeze([
  ['Asia/Shanghai','中国 · 北京 / 上海'],['Asia/Hong_Kong','中国 · 香港'],
  ['Asia/Taipei','中国 · 台北'],['Asia/Tokyo','日本 · 东京'],
  ['Asia/Seoul','韩国 · 首尔'],['Asia/Singapore','新加坡'],
  ['Asia/Kolkata','印度 · 加尔各答'],['Asia/Dubai','阿联酋 · 迪拜'],
  ['Europe/London','英国 · 伦敦'],['Europe/Paris','法国 · 巴黎'],
  ['Europe/Berlin','德国 · 柏林'],['America/New_York','美国 · 纽约'],
  ['America/Chicago','美国 · 芝加哥'],['America/Los_Angeles','美国 · 洛杉矶'],
  ['America/Toronto','加拿大 · 多伦多'],['Australia/Sydney','澳大利亚 · 悉尼'],
  ['Pacific/Auckland','新西兰 · 奥克兰'],['UTC','协调世界时 UTC']
]);
const isScheduleTimeZone=(zone,intl)=>{
  if(typeof zone!=='string'||zone.length>80||!(zone==='UTC'||zone.includes('/')))return false;
  try{new intl.DateTimeFormat('en-US',{timeZone:zone});return true;}catch{return false;}
};
export function getScheduleDeviceTimeZone(intl=globalThis.Intl){
  try{
    const zone=new intl.DateTimeFormat().resolvedOptions().timeZone;
    return isScheduleTimeZone(zone,intl)?zone:'UTC';
  }catch{return 'UTC';}
}
export function listScheduleTimeZoneGroups(intl=globalThis.Intl,selected=''){
  const device=getScheduleDeviceTimeZone(intl);
  const labels=new Map(commonScheduleTimeZones);
  let supported=[];
  try{supported=typeof intl.supportedValuesOf==='function'?intl.supportedValuesOf('timeZone'):[];}catch{/* Older Intl versions use common regions. */}
  const all=new Set([device,selected,...commonScheduleTimeZones.map(([zone])=>zone),...supported]
    .filter(zone=>isScheduleTimeZone(zone,intl)));
  const seen=new Set([device]);
  const groups=[{label:'当前设备 · 默认',options:[{value:device,label:
    '自动识别 · '+(labels.get(device)||device)+' ('+device+')'}]}];
  if(selected&&!isScheduleTimeZone(selected,intl)){
    groups.push({label:'原计划时区 · 请检查',options:[{value:selected,label:'原值不可用 · '+selected}]});
    seen.add(selected);
  }
  const common=commonScheduleTimeZones.filter(([zone])=>all.has(zone)&&!seen.has(zone))
    .map(([value,title])=>{seen.add(value);return {value,label:title+' ('+value+')'};});
  if(common.length)groups.push({label:'常用地区',options:common});
  const regions={
    Africa:'非洲',America:'美洲',Antarctica:'南极地区',Asia:'亚洲',
    Atlantic:'大西洋地区',Australia:'澳大利亚',Europe:'欧洲',
    Indian:'印度洋地区',Pacific:'太平洋地区',Etc:'其他'
  };
  const regionGroups=new Map();
  for(const value of [...all].sort()){
    if(seen.has(value))continue;
    const group=value.split('/')[0];
    if(!regionGroups.has(group))regionGroups.set(group,[]);
    regionGroups.get(group).push({value,label:labels.get(value)||value.replaceAll('_',' ')});
    seen.add(value);
  }
  for(const [key,label] of Object.entries(regions)){
    const options=regionGroups.get(key);
    if(options?.length)groups.push({label,options});
  }
  return groups;
}

/** Search only filters IANA options; existing fixed selection remains selectable. */
export function filterScheduleTimeZoneGroups(groups,search='',selected=''){
  const needle=String(search).trim().toLocaleLowerCase('zh-CN');
  if(!needle)return groups;
  const filtered=groups.map(group=>({...group,options:group.options.filter(item=>
    (group.label+' '+item.label+' '+item.value).toLocaleLowerCase('zh-CN').includes(needle))}))
    .filter(group=>group.options.length);
  if(selected&&!filtered.some(group=>group.options.some(item=>item.value===selected))){
    const original=groups.flatMap(group=>group.options).find(item=>item.value===selected);
    if(original)filtered.unshift({label:'当前已选 · 搜索不会更改',options:[original]});
  }
  return filtered;
}

export function createScheduledTaskWorkbench({client,host,taskWorkbench,api=globalThis.chrome,
  document:doc=globalThis.document,myView=taskWorkbench.myView||createMyWorkbenchView({document:doc}),onClose=()=>{},onOpen=()=>{}}){
  const get=id=>doc.getElementById(id),ui=id=>myView.field(id),listeners=[];
  const text=(field,value)=>{field.text=value??'';myView.publish();return field;};
  // Single Header owns navigation. Host availability remains in the list.
  ui('schedule-create').attributes['aria-label']='新建定时计划';
  const focus=(id,options)=>{
    myView.publish();queueMicrotask(()=>get(id)?.focus?.(options));
  };
  const actionName=(id,event)=>id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())+event[0].toUpperCase()+event.slice(1);
  function registerAction(name,fn){
    const callback=myView.action(fn);myView.actions[name]=callback;
    listeners.push(()=>{if(myView.actions[name]===callback)delete myView.actions[name];});
  }
  let disposed=false,shown=false,busy=false,editing=null,managerReturn='list';
  let pendingCreate=false,pendingCreateFromForm=false,pendingTask=null,confirmUninstall=null,allPlans=[],catalog=[],installed=[];
  let uninstallReturnFocus=null,pendingCopyTask=null,copyTaskReturnId=null;
  let selectedFire=null,lastRefresh=0,activeView='list',runnerFocusId=null;
  let selectedPlanId=null,detailReturnView='list',formReturnView='list',listScrollTop=0,formScrollTop=0;
  let managerScrollTop=0;
  let permissionSeq=0,awaitingSave=null,editRevision=0,storageProbeRevision=0,refreshSeq=0;
  let formDirty=false,discardDestination='list';
  let taskListSignature='',planListSignature='';
  const historyViews=new Map();
  const touched=new Set();
  const formFields={title:'schedule-title',task:'schedule-task-select',
    target:'schedule-target',params:'schedule-params',time:'schedule-timezone'};
  const clearConfirmation=()=>{
    awaitingSave=null;ui('schedule-save-confirm').hidden=true;
  };
  function fieldError(name,value){
    const field=ui(formFields[name]),error=ui('schedule-'+name+'-error');
    text(error,value||'');
    if(field)field.attributes['aria-invalid']=value?'true':'false';
    if(name==='time'){
      for(const id of ['schedule-kind','schedule-once','schedule-clock','schedule-minutes','schedule-deadline']){
        const control=ui(id);
        if(control)control.attributes['aria-invalid']=value?'true':'false';

      }
    }
  }
  const message=(value,error=false)=>{
    const el=ui('schedule-message');text(el,value);el.dataset.state=error?'error':'ready';myView.publish();
  };
  // Only reads native Chrome origin-wide quota. It is NOT a schedule-only
  // count, and never garbage-collects UNKNOWN, unsettled or audit records.
  async function refreshStorageUsage(){
    const serial=++storageProbeRevision,display=ui('schedule-storage-status');
    const area=doc.defaultView?.navigator?.storage;
    const policy='历史不会自动清理；按计划分页查看。';
    if(typeof area?.estimate!=='function'){
      text(display,policy+' 当前 Chrome 未提供存储空间估算。');return;
    }
    try{
      const estimate=await area.estimate();
      if(disposed||serial!==storageProbeRevision)return;
      const {usage,quota}=estimate||{};
      if(!Number.isFinite(usage)||usage<0||!Number.isFinite(quota)||quota<=0){
        text(display,policy+' 无法获取有效的 Chrome 存储配额。');return;
      }
      const units=value=>value>=1073741824?(value/1073741824).toFixed(2)+' GiB':
        (value/1048576).toFixed(1)+' MiB';
      const percentage=100*usage/quota;
      const pressure=percentage>=80?'存储接近 Chrome 配额，请保留重要数据并检查整个扩展空间。 ':'';
      text(display,pressure+'整个 OpenDesk 扩展来源约使用 '+units(usage)+' / '+units(quota)+
        '（'+percentage.toFixed(1)+'%）。并非仅定时任务占用。'+policy);
    }catch{
      if(!disposed&&serial===storageProbeRevision)
        text(display,policy+' Chrome 存储使用量暂时无法读取。');
    }
  }
  const isRunner=()=>doc.documentElement?.dataset?.opendeskSurface==='scheduled-runner';
  const views={runner:ui('schedule-runner-view'),list:ui('schedule-list-view'),
    detail:ui('schedule-detail-view'),form:ui('schedule-form'),manager:ui('schedule-task-manager')};
  // Never replace an unsaved Developer buffer without the user's decision.
  // This review is trusted UI next to the existing manager; the Task Registry,
  // Scheduler and Developer stay the only owners of their actual data.
  const copyReview=ui('schedule-copy-confirm');copyReview.hidden=true;
  const copyReviewLabel=ui('schedule-copy-label');
  registerAction('scheduleCopyYesClick',()=>{
    const row=pendingCopyTask;if(!row||busy)return;
    closeCopyReview();void copyManagedTask(row);
  });
  registerAction('scheduleCopyNoClick',()=>closeCopyReview(true));
  function closeCopyReview(restoreFocus=false){
    const taskId=copyTaskReturnId;
    pendingCopyTask=null;copyTaskReturnId=null;copyReview.hidden=true;
    if(restoreFocus&&taskId){
      const card=[...get('schedule-manager-list')?.querySelectorAll('.schedule-manager-card')||[]]
        .find(node=>node.dataset.managerTaskId===taskId);
      card?.querySelector('[data-manager-action="copy"]')?.focus({preventScroll:true});
    }
  }
  const show=view=>{
    // Preserve the index position across detail/editor transitions. A new
    // subview always starts at the top: 20+ plans can scroll far beyond a
    // short detail and otherwise produce an apparently blank first screen.
    const prior=activeView,changing=view!==prior;
    const scroller=get('workspace-content');
    if(changing&&prior==='list')listScrollTop=scroller?.scrollTop??0;
    if(changing&&prior==='form'&&view==='manager')formScrollTop=scroller?.scrollTop??0;
    // Inline validation belongs to the editor, not the list or dedicated
    // runner. Polling never calls show() so active form errors persist.
    if(changing)message('');
    activeView=view;
    if(view!=='manager')closeCopyReview();
    for(const [key,state] of Object.entries(views))state.hidden=key!==view;myView.publish();
    if(changing&&scroller)
      scroller.scrollTop=view==='list'&&['detail','form'].includes(prior)?listScrollTop:
        view==='form'&&prior==='manager'&&managerReturn==='form'?formScrollTop:0;
    ui('schedule-create').hidden=view!=='list';
    ui('schedule-open-manager').hidden=view!=='list';
    ui('schedule-manager-create').hidden=view!=='manager';
    ui('schedule-detail-edit').hidden=view!=='detail';
    ui('schedule-detail-delete').hidden=view!=='detail';
    ui('schedule-open-runner').hidden=view!=='list';
    const runnerLabel=isRunner()?'再打开一个独立运行页':'打开独立运行页';
    ui('schedule-open-runner').attributes['aria-label']=runnerLabel;
    ui('schedule-open-runner').title=runnerLabel;
    ui('schedule-back').hidden=isRunner()&&view==='runner';
    const backLabel=view==='detail'?(detailReturnView==='runner'?'返回运行概览':'返回计划列表'):
      view==='form'?(formReturnView==='detail'?'返回计划详情':
        formReturnView==='manager'?'返回任务管理':
          formReturnView==='runner'?'返回运行概览':'返回定时计划'):
      view==='manager'?(managerReturn==='form'?'返回编辑计划':
        managerReturn==='detail'?'返回计划详情':'返回定时计划'):
      isRunner()?'返回运行概览':'返回我的任务';
    ui('schedule-back').attributes['aria-label']=backLabel;
    ui('schedule-back').title=backLabel;
    if(view==='form')text(ui('schedule-cancel'),backLabel);
    text(ui('schedule-panel-title'),view==='detail'?
      (allPlans.find(plan=>plan.scheduleId===selectedPlanId)?.title||'计划详情'):
      view==='runner'?'运行概览':view==='manager'?'任务管理':view==='form'?
        (editing?'编辑定时计划':'创建定时计划'):'定时计划');
    text(ui('schedule-panel-subtitle'),'');
    ui('schedule-panel-subtitle').hidden=true;
  };
  const showPanel=()=>{
    shown=true;ui('scheduled-panel').hidden=false;
    taskWorkbench.setScheduledSurfaceActive?.(true);
    ui('my-task-surface').hidden=true;onOpen();
  };
  function hidePanel(){
    closeCopyReview();shown=false;ui('scheduled-panel').hidden=true;
    taskWorkbench.setScheduledSurfaceActive?.(false);
    ui('my-task-surface').hidden=false;onClose();
  }
  async function refresh(){
    if(disposed)return;
    const requestSeq=++refreshSeq;
    const [tasks,plans]=await Promise.all([client.request('listTaskCatalog',{}),
      client.request('listSchedules',{})]);
    // A later poll/manual refresh may have returned first. Do not render an
    // obsolete catalog/plan generation over a newer user-visible snapshot.
    if(disposed||requestSeq!==refreshSeq)return;
    catalog=tasks.catalog||[];installed=tasks.installed||[];
    allPlans=plans.schedules||[];lastRefresh=Date.now();
    // Polling must not destroy an open native <select>, focused buttons or
    // paginated <details> merely because the server returned identical data.
    const tasksSignature=JSON.stringify([catalog,installed]);
    const plansSignature=JSON.stringify([allPlans,catalog.map(row=>[
      row.taskId,row.version,row.manifest?.title])]);
    const tasksChanged=tasksSignature!==taskListSignature;
    const plansChanged=plansSignature!==planListSignature;
    if(tasksChanged){taskListSignature=tasksSignature;populateChoices();}
    else if(shown&&activeView==='form')void showTaskVersion();
    if(plansChanged){renderPlans();planListSignature=plansSignature;}
    else syncStopButtons(); // Host ownership may change without a plan snapshot change.
    if(tasksChanged||plansChanged)renderManager();
    renderRunner();
    if(shown){
      // Do not clear a visible inline save/permission error on each 15s Host
      // poll. Explicit user navigation and successful operations own messages.
      void refreshStorageUsage();
    }
  }
  function eligible(){
    return installed.filter(row=>row.enabled===true&&row.installationId&&
      catalog.some(candidate=>candidate.taskId===row.taskId&&candidate.version===row.version&&
        candidate.stage==='available'&&candidate.manifestHash===row.manifestHash));
  }
  function candidate(row){return catalog.find(c=>c.taskId===row?.taskId&&c.version===row?.version);}
  function taskChoiceProjection(rows){
    const choices=[{value:'',label:'请选择已安装并验证的任务',disabled:false}];
    for(const row of rows)choices.push({value:row.taskId,
      label:(candidate(row)?.manifest?.title||row.taskId)+' · v'+row.version,disabled:false});
    // Existing schedules are bound to exact Task + version + installation identity.
    // Preserve an unavailable historical choice as a readable, disabled option,
    // never silently substitute another installed version during editing.
    if(editing&&!rows.some(row=>row.taskId===editing.taskId))
      choices.push({value:editing.taskId,
        label:'原固定任务 · v'+editing.version+'（已不可用，需检查安装与授权）',disabled:true});
    return choices;
  }
  function populateChoices(){
    const select=ui('schedule-task-select'),previous=select.value;
    const rows=eligible(),choices=taskChoiceProjection(rows);
    if(JSON.stringify(select.options)!==JSON.stringify(choices))myView.options('schedule-task-select',choices);
    select.value=editing?editing.taskId:rows.some(row=>row.taskId===previous)?previous:'';
    select.disabled=Boolean(editing);
    ui('schedule-task-empty').hidden=Boolean(editing)||rows.length>0;
    void showTaskVersion();
  }
  async function showTaskVersion(){
    const seq=++permissionSeq;
    const row=eligible().find(r=>r.taskId===ui('schedule-task-select').value);
    const origins=candidate(row)?.manifest?.siteOrigins||[];
    if(!row){
      text(ui('schedule-task-version'),editing?
        '原计划固定任务不可用；请恢复相同安装身份与网站授权。需使用其他任务时请新建计划。':
        '请选择已安装、已验证且已启用的 Controller 任务');
      return;
    }
    const prefix=`固定版本 v${row.version}`+
      (editing?' · 编辑时任务身份不可更换（更换请新建计划）':'')+
      ` · 网站范围：${origins.join('，')||'不可用'}`;
    text(ui('schedule-task-version'),prefix+' · 正在核查网站权限…');
    try{
      const allowed=Boolean(api.permissions?.contains)&&origins.length>0&&
        (await Promise.all(origins.map(origin=>api.permissions.contains({
          origins:[permissionPattern(origin)]}).catch(()=>false)))).every(Boolean);
      if(disposed||seq!==permissionSeq)return;
      text(ui('schedule-task-version'),prefix+(allowed?' · 网站权限已授权':' · 网站权限不足，需要处理'));
    }catch{
      if(!disposed&&seq===permissionSeq)text(ui('schedule-task-version'),prefix+' · 网站权限状态未知');
    }finally{myView.publish();}
  }
  function renderRunner(){
    const byTime=(a,b)=>(a.nextDueAt??Infinity)-(b.nextDueAt??Infinity);
    const plans=allPlans.slice().sort(byTime);
    const upcoming=plans.find(p=>!p.paused&&!p.needsAttention&&Number.isFinite(p.nextDueAt));
    const observed=allPlans.flatMap(plan=>(plan.history||[]).map(fire=>({plan,fire})));
    const running=observed.filter(item=>['ADMITTED','RUNNING'].includes(item.fire.status))
      .sort((a,b)=>b.fire.scheduledAt-a.fire.scheduledAt)[0];
    const owned=selectedFire?observed.find(item=>item.fire.runId===selectedFire&&
      ['ADMITTED','RUNNING'].includes(item.fire.status)):null;
    const current=owned||running;
    const settling=observed.filter(item=>item.fire.status==='SETTLING')
      .sort((a,b)=>b.fire.scheduledAt-a.fire.scheduledAt)[0];
    const alreadyTerminal=Boolean(selectedFire&&observed.some(item=>
      item.fire.runId===selectedFire&&terminal.has(item.fire.status)));
    const unconfirmedRun=Boolean(selectedFire&&!alreadyTerminal);
    const waiting=observed.filter(item=>
      ['READY','WAITING_HOST','WAITING_TARGET','WAITING_SLOT','SETTLING'].includes(item.fire.status))
      .sort((a,b)=>b.fire.scheduledAt-a.fire.scheduledAt)[0];
    const latest=observed.filter(item=>terminal.has(item.fire.status))
      .sort((a,b)=>b.fire.scheduledAt-a.fire.scheduledAt)[0];
    const focus=current?.plan||settling?.plan||upcoming||plans.find(p=>p.needsAttention)||
      plans.find(p=>!p.paused)||plans[0];
    runnerFocusId=focus?.scheduleId??null;
    text(ui('schedule-runner-next'),upcoming?upcoming.title:'暂无待执行计划');
    text(ui('schedule-runner-next-detail'),upcoming?
      frequencyLabel(upcoming)+' · '+describeTime(upcoming.nextDueAt,upcoming.timezone):'可从计划管理创建或恢复计划');
    text(ui('schedule-runner-current'),current?current.plan.title:
      settling?'正在核对上次结果':unconfirmedRun?'执行状态待确认':'暂无任务运行');
    text(ui('schedule-runner-current-detail'),current?
      scheduleStatus(current.fire.status)+' · '+describeTime(current.fire.scheduledAt,current.plan.timezone):
      settling?settling.plan.title+' · 正在结算（尚未确认成功）':
      unconfirmedRun?'已关联原执行槽，正在核对真实状态':
      waiting?'未运行 · '+scheduleStatus(waiting.fire.status):'到期后才检查执行条件');
    text(ui('schedule-runner-result'),latest?scheduleStatus(latest.fire.status):'尚无执行结果');
    text(ui('schedule-runner-result-detail'),latest?
      latest.plan.title+' · '+describeTime(latest.fire.scheduledAt,latest.plan.timezone):'运行历史可在计划管理中查看');
    text(ui('schedule-runner-focus-title'),focus?focus.title:'还没有定时计划');
    text(ui('schedule-runner-focus-time'),current&&focus?.scheduleId===current.plan.scheduleId?
      '正在执行 · '+describeTime(current.fire.scheduledAt,current.plan.timezone):
      settling&&focus?.scheduleId===settling.plan.scheduleId?'正在结算 · 尚未确认成功':
      focus?.paused?'已暂停':focus?.needsAttention?'需要处理授权或固定任务':
      Number.isFinite(focus?.nextDueAt)?describeTime(focus.nextDueAt,focus.timezone):
      '暂无下次执行');
    text(ui('schedule-runner-focus-detail'),focus?
      (current&&focus.scheduleId===current.plan.scheduleId?'当前任务 · '+scheduleStatus(current.fire.status):
        settling&&focus.scheduleId===settling.plan.scheduleId?'最近执行 · 正在结算（不是成功）':
        frequencyLabel(focus)+' · '+(focus.paused?'已暂停':describeTime(focus.nextDueAt,focus.timezone))):
      '创建一个已验证并安装的任务计划');
    text(ui('schedule-runner-explain'),current&&focus?.scheduleId===current.plan.scheduleId?
      scheduleStatusGuidance[current.fire.status]:
      settling&&focus?.scheduleId===settling.plan.scheduleId?
        scheduleStatusGuidance.SETTLING:
      focus?.needsAttention?'任务安装身份或网站权限发生变化，需要处理；不会自动重新绑定版本。':
      focus?.paused?'此计划已暂停，不会在到期时触发。':
      waiting&&waiting.plan.scheduleId===focus?.scheduleId?
        (waiting.fire.status==='WAITING_HOST'&&isRunner()?
          '历史记录曾等待运行宿主；本页已经可见，正在检查原触发是否仍符合执行条件。':
          scheduleStatusGuidance[waiting.fire.status]):
      latest?.fire.status==='UNKNOWN'&&latest.plan.scheduleId===focus?.scheduleId?
        scheduleStatusGuidance.UNKNOWN:
      '计划到期后校验目标网页、固定任务身份和执行槽；浏览器关闭期间不执行。');
    const toggle=ui('schedule-runner-toggle');
    toggle.disabled=!focus||Boolean(focus.needsAttention&&!focus.paused);
    text(toggle,focus?.paused?'恢复计划':'暂停计划');myView.publish();
  }
  function syncStopButtons(){
    myView.project('planRows',{...myView.data.planRows,currentRunId:host.currentRun||''});
  }
  async function stopCardRun(plan,fire){
    // A list card may stop only the exact admitted scheduled Fire owned by
    // this Host. Pausing a plan does not stop a running Controller execution.
    const current=allPlans.find(item=>item.scheduleId===plan.scheduleId)
      ?.history?.find(item=>item.fireId===fire.fireId);
    if(busy||!current||!['ADMITTED','RUNNING'].includes(current.status)||
      !current.runId||current.runId!==fire.runId||host.currentRun!==current.runId){
      message('当前执行不属于此运行宿主；请打开运行页核对。',true);return;
    }
    busy=true;
    try{
      await host.stop({runId:current.runId,controller:true});
      message('停止请求已发送；是否真正停止，请以运行记录为准。');
    }catch(error){
      message('停止请求结果未确认，请查看运行历史后再操作：'+
        (error?.message||String(error)),true);
    }finally{busy=false;}
  }
  function renderPlans(){
    const ids=new Set(allPlans.map(plan=>plan.scheduleId));
    for(const id of historyViews.keys())if(!ids.has(id))historyViews.delete(id);
    const sorted=allPlans.slice().sort((a,b)=>(a.nextDueAt??Infinity)-(b.nextDueAt??Infinity));
    const enabled=allPlans.filter(p=>!p.paused&&!p.needsAttention&&Number.isFinite(p.nextDueAt)).length;
    const paused=allPlans.filter(p=>p.paused).length;
    const running=allPlans.filter(p=>(p.history||[]).some(f=>['ADMITTED','RUNNING'].includes(f.status))).length;
    ui('schedule-list-summary').hidden=!allPlans.length;
    text(ui('schedule-list-summary'),allPlans.length?
      `共 ${allPlans.length} 个计划 · ${enabled} 个已安排 · ${paused} 个已暂停 · ${running} 个运行中`:'');
    const plans=sorted.map(plan=>{
      const previous=historyViews.get(plan.scheduleId);
      const view=previous||{records:[],hasMore:false,open:false,moreOpen:false,deleteReview:false,expandedRuns:new Set()};
      const latest=plan.history||[];
      const overlap=!latest.length||!view.records.length||latest.some(fire=>view.records.some(loaded=>loaded.fireId===fire.fireId));
      view.records=mergeScheduleHistoryView(latest,overlap?view.records:[]);
      if(!previous||!overlap)view.hasMore=latest.length===20;
      historyViews.set(plan.scheduleId,view);
      return {...plan,history:view.records};
    });
    myView.project('planRows',{plans,currentRunId:host.currentRun||'',
      onOpen:myView.action(openDetail),onToggle:plan=>void change(plan,plan.paused?'resume':'pause'),
      onEdit:myView.action(edit),onStop:(plan,fire)=>void stopCardRun(plan,fire)});
    renderDetail();
  }
  function renderDetail(){
    const plan=allPlans.find(row=>row.scheduleId===selectedPlanId);
    if(!plan){
      myView.project('scheduleDetail',null);
      if(activeView==='detail'){
        leaveDetail();selectedPlanId=null;message('此计划已被移除，已返回计划列表');
      }
      return;
    }
    const view=historyViews.get(plan.scheduleId);if(!view)return;
    const setOpen=(key,value)=>{view[key]=value;renderDetail();};
    const catalogEntry=catalog.find(item=>item.taskId===plan.taskId&&item.version===plan.version);
    myView.project('scheduleDetail',{plan,taskTitle:catalogEntry?.manifest?.title||plan.taskId,
      ...view,records:[...view.records],expandedRuns:new Set(view.expandedRuns||[]),
      onHistoryToggle:value=>setOpen('open',value),onMoreToggle:value=>setOpen('moreOpen',value),
      onRunToggle:(id,open)=>{view.expandedRuns??=new Set();if(open)view.expandedRuns.add(id);else view.expandedRuns.delete(id);},
      onToggle:()=>void change(plan,plan.paused?'resume':'pause'),
      onManage:myView.action(()=>openManager('detail')),onDelete:()=>void change(plan,'delete'),
      onCancelDelete:()=>{view.deleteReview=false;renderDetail();focus('schedule-detail-delete',{preventScroll:true});},
      onLoadMore:async()=>{
        if(view.loading||!view.hasMore)return;
        view.loading=true;renderDetail();
        try{
          const page=await client.request('listScheduleHistory',{scheduleId:plan.scheduleId,offset:view.records.length,limit:20});
          if(disposed||historyViews.get(plan.scheduleId)!==view)return;
          view.records=mergeScheduleHistoryView(view.records,page.history||[]);
          view.hasMore=Boolean(page.hasMore&&page.history?.length);view.historyError='';
        }catch(error){if(!disposed)view.historyError='加载历史失败：'+(error?.message||String(error));}
        finally{view.loading=false;if(!disposed)renderDetail();}
      }});
    text(ui('schedule-panel-title'),plan.title);
  }
  function openDetail(scheduleId){
    if(!allPlans.some(plan=>plan.scheduleId===scheduleId))return;
    rememberDetailState();
    if(activeView==='list')listScrollTop=get('workspace-content')?.scrollTop??0;
    detailReturnView=activeView==='runner'?'runner':'list';
    selectedPlanId=scheduleId;
    renderDetail();show('detail');
    focus('schedule-back',{preventScroll:true});
  }
  function leaveDetail(){
    rememberDetailState();
    if(historyViews.has(selectedPlanId))historyViews.get(selectedPlanId).deleteReview=false;
    const scheduleId=selectedPlanId;
    show(detailReturnView);
    if(detailReturnView==='list'){
      const card=[...get('schedule-plan-list')?.querySelectorAll('.schedule-card')||[]]
        .find(row=>row.dataset.scheduleId===scheduleId);
      (card?.querySelector('.schedule-plan-open')||
        get('schedule-plan-list')?.querySelector('.schedule-plan-open')||
        get('schedule-create'))?.focus({preventScroll:true});
      const scroller=get('workspace-content');
      if(scroller)scroller.scrollTop=listScrollTop;
    }else focus('schedule-runner-history',{preventScroll:true});
  }
  async function change(plan,operation){
    if(busy)return;busy=true;
    try{
      const returnAfterDelete=operation==='delete'&&selectedPlanId===plan.scheduleId;
      const {refreshError}=await commitScheduledMutation(
        ()=>client.request('changeSchedule',{scheduleId:plan.scheduleId,
          expectedGeneration:plan.generation,action:operation}),
        async()=>{
          if(returnAfterDelete)selectedPlanId=null;
          await refresh();
        });
      if(returnAfterDelete&&activeView==='detail')leaveDetail();
      const outcome=operation==='delete'?'计划已删除':'计划状态已更新';
      message(refreshError?outcome+'，但列表刷新失败：'+
        (refreshError?.message||String(refreshError))+'；请重新打开定时计划核对。':outcome,
        Boolean(refreshError));
    }catch(error){
      const failure=describeScheduleMutationFailure(error,operation==='delete'?'删除计划':'修改计划');
      if(failure.uncertain&&operation==='delete'){
        const view=historyViews.get(plan.scheduleId);
        if(view){view.deleteReview=false;renderDetail();}
      }
      message(failure.message,true);
    }finally{busy=false;}
  }
  function switchKind(){
    const kind=ui('schedule-kind').value;
    ui('schedule-once-field').hidden=kind!=='once';
    ui('schedule-clock-field').hidden=!['daily','weekly'].includes(kind);
    ui('schedule-weekdays-field').hidden=kind!=='weekly';
    ui('schedule-interval-field').hidden=kind!=='interval';
    preview();
  }
  function trigger(){
    const kind=ui('schedule-kind').value,zone=ui('schedule-timezone').value.trim();
    if(kind==='once')return {kind,zone,spec:{at:parseWallScheduleTime(zone,ui('schedule-once').value)}};
    if(kind==='interval'){
      const everyMinutes=Number(ui('schedule-minutes').value);
      const unchanged=editing?.triggerKind==='interval'&&
        editing.triggerSpec.everyMinutes===everyMinutes;
      return {kind,zone,spec:{anchorAt:unchanged?editing.triggerSpec.anchorAt:Date.now()+everyMinutes*60000,
        everyMinutes}};
    }
    const match=ui('schedule-clock').value.match(/^(\d{2}):(\d{2})$/);
    if(!match)throw Error('请输入有效的执行时间');
    const spec={hour:Number(match[1]),minute:Number(match[2])};
    if(kind==='weekly'){
      spec.days=[0,1,2,3,4,5,6].filter(day=>get('my-weekday-'+day).checked);
    }
    return {kind,zone,spec};
  }
  function preview(){
    try{
      const {kind,zone,spec}=trigger();
      const next=nextScheduleAt(kind,spec,zone,Date.now());
      if(next===null)throw Error('该时间没有后续触发，请选择未来时间');
      text(ui('schedule-next-time'),describeTime(next,zone));
      text(ui('schedule-next-zone'),'按 '+zone+' 固定时区执行 · Chrome 关闭时不唤醒电脑');
      ui('schedule-next').dataset.state='valid';
      if(!touched.has('time'))fieldError('time','');
    }catch(error){
      text(ui('schedule-next-time'),'请检查执行时间');
      text(ui('schedule-next-zone'),error?.message||'请输入有效的执行时间和时区');
      ui('schedule-next').dataset.state='invalid';
      if(touched.has('time'))fieldError('time',error?.message||'请输入有效的执行时间和时区');
    }
  }
  function validateLocal(showAll=false){
    const errors={};const fail=(name,value)=>{errors[name]=value;};
    const title=ui('schedule-title').value.trim();
    if(!title||title.length>100)fail('title','计划名称应为 1–100 个字符');
    const row=eligible().find(r=>r.taskId===ui('schedule-task-select').value);
    if(!row)fail('task','请选择已验证、已安装且已启用的任务');
    let url;
    const entered=ui('schedule-target').value.trim();
    try{
      url=new URL(entered);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||
        url.href.length>2048)throw Error('请输入没有账号密码或片段的 HTTP(S) 地址');
      if(row&&!candidate(row)?.manifest?.siteOrigins?.includes(url.origin))
        throw Error('目标网址不在当前任务批准的网站范围内');
    }catch(error){fail('target',error?.message?.startsWith('Invalid URL')?
      '请输入完整的 http:// 或 https:// 网页地址':(error?.message||'目标网址无效'));}
    let params;
    try{
      params=JSON.parse(ui('schedule-params').value||'{}');
      if(!params||typeof params!=='object'||Array.isArray(params)||
        JSON.stringify(params).length>8192)throw Error('请输入不超过 8192 字符的 JSON 对象');
    }catch(error){fail('params',error instanceof SyntaxError?
      'JSON 格式错误，请检查逗号、引号及括号':error.message);}
    let rule;
    try{
      rule=trigger();
      const next=nextScheduleAt(rule.kind,rule.spec,rule.zone,Date.now());
      if(next===null)throw Error('执行时间已过，请选择未来时间');
      const deadline=Number(ui('schedule-deadline').value);
      if(!Number.isSafeInteger(deadline)||deadline<1||deadline>60)
        throw Error('最长等待时间必须为 1–60 分钟');
    }catch(error){fail('time',error?.message||'执行规则或 IANA 时区不正确');}
    for(const name of Object.keys(formFields))
      if(showAll||touched.has(name))fieldError(name,errors[name]||'');
    return Object.keys(errors).length?null:{title,row,url,params,rule};
  }
  // One native picker; values remain IANA. Current offset is only a
  // display hint (DST may change); canonical scheduling stays untouched.
  function scheduleZoneOffset(zone){
    try{
      const part=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'shortOffset'})
        .formatToParts(new Date()).find(item=>item.type==='timeZoneName')?.value;
      if(part==='GMT'||part==='UTC')return 'UTC+00:00';
      const match=/^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/.exec(part||'');
      return match?'UTC'+match[1]+match[2].padStart(2,'0')+':'+(match[3]||'00'):'';
    }catch{return '';}
  }
  function populateTimeZoneSelect(selected=getScheduleDeviceTimeZone()){
    const select=ui('schedule-timezone'),groups=listScheduleTimeZoneGroups(globalThis.Intl,selected);
    myView.options('schedule-timezone',groups.map(group=>({...group,options:group.options.map(({value,label})=>{
      const name=label.replace(/\s*\([^)]*\)\s*$/,'').replace(/^自动识别\s*·\s*/,''),offset=scheduleZoneOffset(value);
      return {value,label:name+(offset?' · '+offset:''),title:value};
    })})));
    select.value=selected;
    select.title='IANA：'+selected;
  }
  function reset(){
    editing=null;pendingTask=null;formDirty=false;
    ui('schedule-discard-confirm').hidden=true;
    clearConfirmation();touched.clear();
    for(const name of Object.keys(formFields))fieldError(name,'');
    myView.resetScheduleForm();
    ui('schedule-title').value='';
    const selectedZone=getScheduleDeviceTimeZone();
    // A missing/invalid device zone falls back to UTC. The default wall time
    // must be computed in the SAME selected IANA zone, not host Date getters.
    ui('schedule-once').value=formatWallScheduleTime(selectedZone,Date.now()+10*60000);
    populateTimeZoneSelect(selectedZone);
    ui('schedule-params').value='{}';ui('schedule-kind').value='once';
    ui('schedule-task-select').disabled=false;
    ui('schedule-clock').value='09:00';ui('schedule-minutes').value='60';
    ui('schedule-deadline').value='5';ui('schedule-misfire').value='skip';
    populateChoices();switchKind();
  }
  function edit(plan){
    formDirty=false;ui('schedule-discard-confirm').hidden=true;
    clearConfirmation();touched.clear();
    for(const name of Object.keys(formFields))fieldError(name,'');
    formReturnView=activeView==='detail'?'detail':isRunner()?'runner':'list';
    editing=plan;show('form');
    ui('schedule-title').value=plan.title;
    populateChoices();
    ui('schedule-target').value=plan.targetUrl;
    ui('schedule-params').value=JSON.stringify(plan.params,null,2);
    ui('schedule-kind').value=plan.triggerKind;
    populateTimeZoneSelect(plan.timezone);
    if(plan.triggerKind==='once')
      ui('schedule-once').value=formatWallScheduleTime(plan.timezone,plan.triggerSpec.at);
    else if(['daily','weekly'].includes(plan.triggerKind)){
      ui('schedule-clock').value=`${String(plan.triggerSpec.hour).padStart(2,'0')}:${String(plan.triggerSpec.minute).padStart(2,'0')}`;
      if(plan.triggerKind==='weekly')
        for(const day of [0,1,2,3,4,5,6])get('my-weekday-'+day).checked=plan.triggerSpec.days.includes(day);
    }else ui('schedule-minutes').value=String(plan.triggerSpec.everyMinutes);
    ui('schedule-misfire').value=plan.misfirePolicy;
    ui('schedule-deadline').value=String(plan.startDeadlineMs/60000);
    ui('schedule-open-target').checked=plan.openIfMissing;
    ui('schedule-paused').checked=plan.paused;
    switchKind();showTaskVersion();focus('schedule-title');
  }
  async function save(event){
    event.preventDefault();if(busy)return;
    clearConfirmation();
    const revision=editRevision;
    const local=validateLocal(true);
    if(!local){
      message('请先修正上方标记的字段',true);
      const invalid=Object.keys(formFields).find(name=>ui(formFields[name])?.attributes['aria-invalid']==='true');
      if(invalid==='time'){
         const badZone=!isScheduleTimeZone(ui('schedule-timezone').value,globalThis.Intl);
         const kind=ui('schedule-kind').value;
         const target=badZone?'schedule-timezone':kind==='once'?'schedule-once':kind==='interval'?'schedule-minutes':'schedule-clock';
         focus(target);
       }else if(invalid)focus(formFields[invalid]);
      return;
    }
    busy=true;ui('schedule-save').disabled=true;
    try{
      const resolved=await client.request('resolveInstalledTask',{taskId:local.row.taskId});
      // Re-authorizing a Task can increment Generation without changing
      // Version or Installation ID. Never pin a different generation silently.
      if(resolved.version!==local.row.version||resolved.manifestHash!==local.row.manifestHash||
        resolved.installationId!==local.row.installationId||
        resolved.generation!==local.row.generation)
        throw Error('任务安装身份已变更，请重新选择已验证的固定版本');
      if(editing&&(editing.taskId!==resolved.taskId||editing.version!==resolved.version||
        editing.manifestHash!==resolved.manifestHash||editing.sourceHash!==resolved.contentHash||
        editing.installationId!==resolved.installationId||editing.taskGeneration!==resolved.generation))
        throw Error('原计划绑定的任务版本或授权已变化；请新建计划，不能自动替换原固定版本');
      const {kind,zone,spec}=local.rule;
      const input={...(editing?{scheduleId:editing.scheduleId,expectedGeneration:editing.generation}:{}),
        title:local.title,taskId:resolved.taskId,
        version:resolved.version,manifestHash:resolved.manifestHash,sourceHash:resolved.contentHash,
        installationId:resolved.installationId,taskGeneration:resolved.generation,
        params:local.params,targetUrl:local.url.href,openIfMissing:ui('schedule-open-target').checked,
        timezone:zone,triggerKind:kind,triggerSpec:spec,misfirePolicy:ui('schedule-misfire').value,
        startDeadlineMs:Number(ui('schedule-deadline').value)*60000,paused:ui('schedule-paused').checked};
      if(revision!==editRevision)throw Error('表单在核对过程中被修改，请重新检查并确认');
      awaitingSave={input};
      const timing=frequencyLabel(input)+' · '+describeTime(nextScheduleAt(kind,spec,zone,Date.now()),zone);
      text(ui('schedule-save-summary'),
        `${input.title}\n任务：${resolved.manifest.title||resolved.taskId} · v${resolved.version}\n网址：${input.targetUrl}\n时区：${zone}（保存后固定）\n时间：${timing}\n状态：${input.paused?'先暂停':'启用'}`);
      ui('schedule-save-confirm').hidden=false;
      message('请核对固定任务、目标网址与执行规则后确认保存');
      focus('schedule-confirm-yes');
    }catch(error){message('无法确认计划：'+(error?.message||String(error)),true);}
    finally{busy=false;ui('schedule-save').disabled=false;}
  }
  async function confirmSave(){
    if(busy||!awaitingSave)return;
    busy=true;ui('schedule-confirm-yes').disabled=true;
    const pending=awaitingSave;
    try{
      const {refreshError}=await commitScheduledMutation(
        ()=>client.request('saveSchedule',pending.input),refresh);
      clearConfirmation();formDirty=false;ui('schedule-discard-confirm').hidden=true;
      const afterSave=editing?formReturnView:isRunner()?'runner':'list';
      const savedPlanId=editing?.scheduleId??null;
      editing=null;show(afterSave==='manager'?'list':afterSave);
      focusReturnedView(afterSave==='manager'?'list':afterSave,savedPlanId);
      message(refreshError?'定时计划已保存，但列表刷新失败：'+
        (refreshError?.message||String(refreshError))+'；请重新打开定时计划核对。':
        '定时计划已保存，Chrome Alarms 已按照持久计划对账',Boolean(refreshError));
    }catch(error){
      const failure=describeScheduleMutationFailure(error,'保存计划');
      if(failure.uncertain){
        // The first create may already exist; discard the old submit intent
        // without discarding the user's form draft for manual reconciliation.
        clearConfirmation();formDirty=true;
      }
      message(failure.message,true);
    }
    finally{busy=false;ui('schedule-confirm-yes').disabled=false;}
  }
  function enterDeveloper(){
    pendingCreateFromForm=activeView==='form'||(activeView==='manager'&&managerReturn==='form');
    pendingCreate=true;hidePanel();taskWorkbench.navigate('develop');
    get('task-dev-status').textContent='请先真实运行并验证源码、安装固定版本；安装后返回定时计划。';
  }

  async function toggleManagedTask(row,originList){
    if(busy)return;busy=true;
    let rpcStarted=false;
    try{
      if(!row.enabled)await requireChromePermissions({api,request:{origins:originList
        .map(origin=>permissionPattern(origin))}});
      rpcStarted=true;
      const {refreshError}=await commitScheduledMutation(
        ()=>client.request('setInstalledTaskEnabled',{taskId:row.taskId,version:row.version,
          enabled:!row.enabled,expectedGeneration:row.generation??null,
          expectedInstallationId:row.installationId??null}),refresh);
      const outcome=row.enabled?'任务已停用':'任务已启用';
      message(refreshError?outcome+'，但列表刷新失败：'+
        (refreshError?.message||String(refreshError))+'；请重新进入任务管理核对。':
        outcome+'；已重新读取安装状态',Boolean(refreshError));
    }catch(error){
      message(rpcStarted?describeScheduleMutationFailure(error,row.enabled?'停用任务':'启用任务').message:
        (error?.message||String(error)),true);
    }finally{busy=false;}
  }
  function reviewCopyManagedTask(row,title){
    if(busy||disposed)return;
    // Copy and uninstall never share a pending destructive intention.
    confirmUninstall=null;ui('schedule-uninstall-confirm').hidden=true;
    pendingCopyTask=row;copyTaskReturnId=row.taskId;
    text(copyReviewLabel,'将「'+title+'」v'+row.version+
      ' 复制到开发？开发编辑器当前未保存的源码与修改将被替换。'+
      '请先保存或备份草稿。已安装任务、固定身份与定时计划均不会改变。');
    copyReview.hidden=false;get('schedule-copy-confirm')?.scrollIntoView?.({block:'nearest'});
    focus('schedule-copy-yes',{preventScroll:true});
  }
  async function copyManagedTask(row){
    if(busy)return;busy=true;
    try{
      const current=installed.find(value=>value.taskId===row.taskId);
      if(!current||current.version!==row.version||
        current.installationId!==row.installationId||current.generation!==row.generation)
        throw Error('任务固定版本或安装身份已变化，请刷新后重新复制');
      const existing=await client.request('getTaskCandidate',{taskId:row.taskId,version:row.version});
      if(existing.taskId!==row.taskId||existing.version!==row.version||
        existing.manifestHash!==row.manifestHash||
        typeof existing.package?.sourceUtf8!=='string')
        throw Error('固定任务源码与当前安装不匹配，请刷新后再复制');
      // The installed authorization may change while Host reads the candidate.
      // Re-read authoritative Task Registry state before overwriting Developer.
      // listTaskCatalog also supports disabled Tasks; resolveInstalledTask does not.
      const checked=await client.request('listTaskCatalog',{});
      const latest=(checked.installed||[]).find(value=>value.taskId===row.taskId);
      if(!latest||latest.version!==row.version||latest.manifestHash!==row.manifestHash||
        latest.installationId!==row.installationId||latest.generation!==row.generation)
        throw Error('任务安装或授权在复制期间已变更；请重新打开任务管理核对');
      await taskWorkbench.receiveDraft(existing.package.sourceUtf8);
      hidePanel(); // Leave manager only after the existing Developer accepts the draft.
    }catch(error){message('复制到开发失败：'+(error?.message||String(error)),true);}
    finally{busy=false;}
  }
  function createPlanFromManagedTask(row,title){
    managerReturn='list';formReturnView='manager';show('form');
    reset();ui('schedule-task-select').value=row.enabled?row.taskId:'';
    showTaskVersion();ui('schedule-title').value=title+' 定时';
  }
  function confirmManagedTaskUninstall(row,title,trigger){
    closeCopyReview();uninstallReturnFocus=trigger;confirmUninstall=row;
    const review=ui('schedule-uninstall-confirm');
    review.hidden=false;
    text(ui('schedule-uninstall-label'),'确认卸载「'+title+'」v'+row.version+
      '？后续计划可能无法运行，但已有 Run/Result 历史不会自动清除。');
    get('schedule-uninstall-confirm')?.scrollIntoView?.({block:'nearest'});
    focus('schedule-uninstall-yes',{preventScroll:true});
  }
  function renderManager(){
    const filter=ui('schedule-manager-filter').value;
    const q=ui('schedule-manager-search').value.trim().toLowerCase();
    const rows=installed.filter(row=>(filter==='all'||row.enabled===(filter==='enabled'))&&
      [row.taskId,candidate(row)?.manifest?.title||''].some(value=>value.toLowerCase().includes(q)));
    text(ui('schedule-manager-count'),'显示 '+rows.length+' / '+installed.length+' 个已安装任务');
    myView.project('managerRows',{rows:rows.map(row=>{
      const entry=candidate(row);
      return {...row,title:entry?.manifest?.title||row.taskId,description:entry?.manifest?.description||'',
        siteOrigins:entry?.manifest?.siteOrigins||[],linked:allPlans.filter(plan=>plan.taskId===row.taskId).length};
    }),canCreatePlan:canStartScheduleFromManager(managerReturn),
      emptyText:installed.length?'没有符合条件的任务，可更改搜索或筛选。':'暂无已安装任务，请先到开发页创建并安装。',
      onToggle:row=>void toggleManagedTask(row,row.siteOrigins),onCopy:myView.action(row=>reviewCopyManagedTask(row,row.title)),
      onCreatePlan:myView.action(row=>createPlanFromManagedTask(row,row.title)),
      onUninstall:myView.action((row,trigger)=>confirmManagedTaskUninstall(row,row.title,trigger))});
  }
  function openManager(returnView){
    managerScrollTop=get('workspace-content')?.scrollTop??0;
    managerReturn=returnView;
    renderManager();show('manager');
    focus('schedule-manager-search',{preventScroll:true});
  }
  async function uninstall(){
    if(!confirmUninstall||busy)return;busy=true;
    const row=confirmUninstall;
    try{
      const {refreshError}=await commitScheduledMutation(
        ()=>client.request('uninstallTask',{taskId:row.taskId,version:row.version,
          expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null}),
        refresh);
      ui('schedule-uninstall-confirm').hidden=true;confirmUninstall=null;
      focus('schedule-manager-search',{preventScroll:true});
      message(refreshError?'固定版本已卸载，但列表刷新失败：'+
        (refreshError?.message||String(refreshError))+'；请重新进入任务管理核对。':
        '已卸载固定版本；关联计划需重新安装授权',Boolean(refreshError));
    }catch(error){
      const failure=describeScheduleMutationFailure(error,'卸载任务');
      if(failure.uncertain){
        // Keep the stale row for inspection, but do not leave a destructive
        // confirmation available for a blind second submission.
        confirmUninstall=null;ui('schedule-uninstall-confirm').hidden=true;
        focus('schedule-manager-search',{preventScroll:true});
      }
      message(failure.message,true);
    }finally{busy=false;}
  }
  async function open(view='list'){
    taskWorkbench.navigate('tasks');showPanel();show(view);message('');
    try{await refresh();}catch(error){message('读取计划失败：'+(error?.message||String(error)),true);}
  }
  function stop(){
    if(!selectedFire||host.currentRun!==selectedFire)return;
    void host.stop({runId:selectedFire,controller:true}).catch(error=>message(error.message,true));
  }
  function focusReturnedView(view,scheduleId=editing?.scheduleId){
    if(view==='detail')focus('schedule-detail-edit',{preventScroll:true});
    else if(view==='list'){
      const card=[...get('schedule-plan-list')?.querySelectorAll('.schedule-card')||[]]
        .find(row=>row.dataset.scheduleId===scheduleId);
      (card?.querySelector('.schedule-plan-open')||get('schedule-create'))?.focus({preventScroll:true});
    }else if(view==='manager')focus('schedule-manager-search',{preventScroll:true});
    else if(view==='runner')focus('schedule-runner-history',{preventScroll:true});
  }
  function requestLeaveForm(destination){
    if(busy)return;
    if(formDirty){
      discardDestination=destination;
      clearConfirmation();
      ui('schedule-discard-confirm').hidden=false;
      focus('schedule-discard-no');
      return;
    }
    clearConfirmation();show(destination);focusReturnedView(destination);
  }
  function leaveManager(){
    const destination=managerReturn;
    show(destination);
    if(destination==='form')focus('schedule-manage-tasks',{preventScroll:true});
    else if(destination==='detail')
      (get('schedule-detail-view')?.querySelector('.schedule-status-help .od-button')||
        get('schedule-detail-edit'))?.focus({preventScroll:true});
    else focusReturnedView(destination);
    const scroller=get('workspace-content');if(scroller)scroller.scrollTop=managerScrollTop;
  }
  function navigateBack(){
    if(activeView==='manager'){leaveManager();return;}
    if(activeView==='detail'){leaveDetail();return;}
    if(activeView==='form'){
      requestLeaveForm(formReturnView);return;
    }
    if(isRunner()){show('runner');return;}
    hidePanel();
    // Back returns keyboard users to the exact control that opened this subview.
    focus('schedule-open',{preventScroll:true});
  }
  registerAction('scheduleOpenClick',()=>void open());
  registerAction('scheduleStopClick',stop);
  registerAction('scheduleBackClick',navigateBack);
  registerAction('scheduleRunnerManageClick',()=>show('list'));
  registerAction('scheduleRunnerRefreshClick',()=>void refresh().catch(error=>message(error.message,true)));
  registerAction('scheduleRunnerToggleClick',()=>{
    const plan=allPlans.find(p=>p.scheduleId===runnerFocusId);
    if(plan)void change(plan,plan.paused?'resume':'pause');
  });
  registerAction('scheduleRunnerHistoryClick',()=>{
    const plan=allPlans.find(row=>row.scheduleId===runnerFocusId);
    if(!plan){show('list');return;}
    openDetail(plan.scheduleId);
    const view=historyViews.get(plan.scheduleId);if(view){view.open=true;renderDetail();}
    queueMicrotask(()=>get('schedule-detail-view')?.querySelector('.schedule-history > summary')?.focus());
  });
  registerAction('scheduleCreateClick',()=>{formReturnView=isRunner()?'runner':'list';reset();show('form');focus('schedule-title');});
  registerAction('scheduleOpenManagerClick',()=>openManager('list'));
  registerAction('scheduleDetailEditClick',()=>{
    const plan=allPlans.find(row=>row.scheduleId===selectedPlanId);
    if(plan)edit(plan);
  });
  registerAction('scheduleDetailDeleteClick',()=>{
    if(activeView!=='detail'||busy)return;
    const plan=allPlans.find(row=>row.scheduleId===selectedPlanId);
    const view=historyViews.get(plan?.scheduleId);
    if(!plan||!view)return;
    view.deleteReview=true;
    renderDetail();
    queueMicrotask(()=>get('schedule-detail-view')?.querySelector('.schedule-delete-confirm button')?.focus({preventScroll:true}));
  });
  registerAction('scheduleCancelClick',()=>requestLeaveForm(formReturnView));
  registerAction('scheduleDiscardYesClick',()=>{
    formDirty=false;
    ui('schedule-discard-confirm').hidden=true;
    clearConfirmation();
    show(discardDestination);
    focusReturnedView(discardDestination);
  });
  registerAction('scheduleDiscardNoClick',()=>{
    ui('schedule-discard-confirm').hidden=true;
    focus('schedule-title');
  });
  registerAction('scheduleConfirmYesClick',()=>void confirmSave());
  registerAction('scheduleConfirmNoClick',()=>{clearConfirmation();focus('schedule-save');});
  for(const [id,name] of [
    ['schedule-title','title'],['schedule-task-select','task'],['schedule-target','target'],
    ['schedule-params','params'],['schedule-kind','time'],['schedule-timezone','time'],
    ['schedule-once','time'],['schedule-clock','time'],['schedule-minutes','time'],
    ['schedule-weekdays-field','time'],['schedule-deadline','time']]){
    registerAction(actionName(id,'input'),()=>{
      touched.add(name);formDirty=true;editRevision++;
      ui('schedule-discard-confirm').hidden=true;
      clearConfirmation();validateLocal(false);
      if(name==='time')preview();
    });
  }
  for(const id of ['schedule-open-target','schedule-misfire','schedule-paused'])
    registerAction(actionName(id,'change'),()=>{formDirty=true;editRevision++;clearConfirmation();});
  registerAction('scheduleFormSubmit',save);
  registerAction('scheduleTaskSelectChange',()=>{
    formDirty=true;editRevision++;clearConfirmation();void showTaskVersion();
  });
  registerAction('scheduleTaskEmptyCreateClick',enterDeveloper);
  registerAction('scheduledPanelKeydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented)return;
    if(!ui('schedule-discard-confirm').hidden){
      event.preventDefault();get('schedule-discard-no')?.click?.();
    }else if(!ui('schedule-save-confirm').hidden){
      event.preventDefault();clearConfirmation();focus('schedule-save');
    }else if(!ui('schedule-uninstall-confirm').hidden){
      event.preventDefault();get('schedule-uninstall-no')?.click?.();
    }else if(!copyReview.hidden){
      event.preventDefault();closeCopyReview(true);
    }else{
      // The React manager owns menu dismissal and returns focus to its trigger.
    }
  });
  registerAction('scheduleNewScriptClick',enterDeveloper);
  registerAction('scheduleManageTasksClick',()=>openManager('form'));
  registerAction('scheduleManagerCreateClick',enterDeveloper);
  registerAction('scheduleManagerBackClick',leaveManager);
  registerAction('scheduleManagerSearchInput',()=>{closeCopyReview();renderManager();});
  registerAction('scheduleManagerFilterChange',()=>{closeCopyReview();renderManager();});
  registerAction('scheduleUninstallYesClick',()=>void uninstall());
  registerAction('scheduleUninstallNoClick',()=>{
    confirmUninstall=null;ui('schedule-uninstall-confirm').hidden=true;
    if(uninstallReturnFocus?.isConnected)uninstallReturnFocus.focus?.({preventScroll:true});
    uninstallReturnFocus=null;
  });
  for(const id of ['schedule-kind','schedule-once','schedule-timezone','schedule-clock',
    'schedule-minutes','schedule-weekdays-field'])
    registerAction(actionName(id,'change'),()=>{
      formDirty=true;editRevision++;clearConfirmation();
      if(id==='schedule-timezone')ui(id).title='IANA：'+ui(id).value;
      if(id==='schedule-kind')switchKind();else preview();
    });
  registerAction('scheduleOpenRunnerClick',()=>void api.tabs.create({url:api.runtime.getURL('ui/tool.html?scheduledRunner=1')})
    .catch(error=>message('无法打开运行页：'+error.message,true)));
  const installedUpdates=client.subscribeInstalledTasks?.(event=>{
    if(event?.taskId&&pendingCreate)void onInstalledTask(event.taskId);
    else if(shown)void refresh().catch(()=>{});
  });
  const unsubscribe=host.subscribe?.(event=>{
    if(event?.runId&&event?.scheduledFireId)selectedFire=event.runId;
    if(selectedFire&&event?.runId===selectedFire&&terminal.has(event.state))selectedFire=null;
  });
  async function onInstalledTask(taskId){
    if(!pendingCreate||disposed)return;
    try{
      await refresh();
      if(!eligible().some(row=>row.taskId===taskId))return;
      pendingCreate=false;pendingTask=taskId;taskWorkbench.navigate('tasks');
      // Task manager launches a NEW plan. Editor launches preserve the current
      // draft; an existing plan must never silently rebind to the new version.
      if(!pendingCreateFromForm)reset();
      if(!pendingCreateFromForm)formReturnView='manager';
      pendingCreateFromForm=false;
      showPanel();show('form');
      if(!editing){
        ui('schedule-task-select').value=taskId;
        showTaskVersion();
        message('新任务已验证安装，可继续设置时间和目标。');
      }else{
        populateChoices();
        message('新任务已安装；原计划仍固定原任务身份。如需使用新任务，请另建计划。');
      }
    }catch(error){message('任务安装后刷新失败：'+error.message,true);}
  }
  return {open,hidePanel,refresh,setRun(runId){
    selectedFire=runId;
    taskWorkbench.setScheduledRunOwner?.(runId);
    ui('schedule-stop').hidden=!runId;
    renderRunner();
  },onInstalled:onInstalledTask,get shown(){return shown;},dispose(){
    disposed=true;permissionSeq++;refreshSeq++;storageProbeRevision++;for(const remove of listeners)remove();unsubscribe?.();installedUpdates?.();hidePanel();
  }};
}
