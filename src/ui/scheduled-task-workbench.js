import {permissionPattern} from '../environment.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {nextScheduleAt,parseWallScheduleTime,formatWallScheduleTime} from '../platform/tasks/schedule-time.js';

const terminal=new Set(['SUCCESS','FAILED','STOPPED','UNKNOWN','MISSED','CANCELLED','NEEDS_ATTENTION']);
const text=(node,value)=>{node.textContent=value??'';return node;};
function element(doc,tag,css,content){
  const node=doc.createElement(tag);
  if(css)node.className=css;
  if(content!==undefined)node.textContent=content;
  return node;
}
function action(doc,label,fn,css='od-button od-button--secondary'){
  const button=element(doc,'button',css,label);
  button.type='button';button.addEventListener('click',fn);return button;
}
const scheduleStatusLabels=Object.freeze({
  READY:'待执行',WAITING_HOST:'等待运行页',WAITING_TARGET:'等待目标页',
  WAITING_SLOT:'等待执行槽',ADMITTED:'已启动',RUNNING:'运行中',
  SUCCESS:'成功',SETTLING:'正在结算',FAILED:'失败',STOPPED:'已停止',
  UNKNOWN:'结果未确认',MISSED:'已错过',CANCELLED:'已取消',
  NEEDS_ATTENTION:'需要处理'
});
const scheduleStatus=status=>scheduleStatusLabels[status]||status||'未知';
const scheduleStatusGuidance=Object.freeze({
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
const pad2=value=>String(value).padStart(2,'0');
const frequencyLabel=plan=>{
  const kind=plan.triggerKind,rule=plan.triggerSpec||{};
  const at=pad2(rule.hour)+':'+pad2(rule.minute);
  if(kind==='once')return '执行一次';
  if(kind==='daily')return '每天 '+at;
  if(kind==='weekly'){
    const weekdays=['日','一','二','三','四','五','六'];
    return '每周'+(rule.days||[]).slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(i=>weekdays[i]).join('、')+' '+at;
  }
  if(kind==='interval')return '每隔 '+rule.everyMinutes+' 分钟';
  return kind||'未知频率';
};
const describeTime=(at,zone)=>{
  if(at===null||!Number.isFinite(at))return '无后续触发';
  try{return new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));}
  catch{return new Date(at).toISOString();}
};

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
  document:doc=globalThis.document,onClose=()=>{},onOpen=()=>{}}){
  const get=id=>doc.getElementById(id),listeners=[];
  const bind=(id,event,fn)=>{
    const node=get(id);if(!node)throw new Error('Missing schedule UI: '+id);
    node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));
  };
  let disposed=false,shown=false,busy=false,editing=null,managerReturn='list';
  let pendingCreate=false,pendingCreateFromForm=false,pendingTask=null,confirmUninstall=null,allPlans=[],catalog=[],installed=[];
  let selectedFire=null,lastRefresh=0,activeView='list',runnerFocusId=null;
  let selectedPlanId=null,detailReturnView='list',formReturnView='list',listScrollTop=0;
  let cloudPanelVisibility;
  let permissionSeq=0,awaitingSave=null,editRevision=0,storageProbeRevision=0,refreshSeq=0;
  let formDirty=false,discardDestination='list';
  let taskListSignature='',planListSignature='';
  const historyViews=new Map();
  const touched=new Set();
  const formFields={title:'schedule-title',task:'schedule-task-select',
    target:'schedule-target',params:'schedule-params',time:'schedule-timezone'};
  const clearConfirmation=()=>{
    awaitingSave=null;get('schedule-save-confirm').hidden=true;
  };
  function fieldError(name,value){
    const field=get(formFields[name]),error=get('schedule-'+name+'-error');
    text(error,value||'');
    field?.setAttribute('aria-invalid',value?'true':'false');
    if(name==='time'){
      for(const id of ['schedule-kind','schedule-once','schedule-clock','schedule-minutes','schedule-deadline']){
        const control=get(id);
        if(control&&!control.closest('[hidden]'))control.setAttribute('aria-invalid',value?'true':'false');
        else control?.removeAttribute('aria-invalid');
      }
    }
  }
  const message=(value,error=false)=>{
    const el=get('schedule-message');text(el,value);el.dataset.state=error?'error':'ready';
  };
  // Only reads native Chrome origin-wide quota. It is NOT a schedule-only
  // count, and never garbage-collects UNKNOWN, unsettled or audit records.
  async function refreshStorageUsage(){
    const serial=++storageProbeRevision,display=get('schedule-storage-status');
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
  const views={runner:get('schedule-runner-view'),list:get('schedule-list-view'),
    detail:get('schedule-detail-view'),form:get('schedule-form'),manager:get('schedule-task-manager')};
  const show=view=>{
    // Preserve the index position across detail/editor transitions. A new
    // subview always starts at the top: 20+ plans can scroll far beyond a
    // short detail and otherwise produce an apparently blank first screen.
    const prior=activeView,changing=view!==prior;
    const scroller=get('workspace-content');
    if(changing&&prior==='list')listScrollTop=scroller?.scrollTop??0;
    // Inline validation belongs to the editor, not the list or dedicated
    // runner. Polling never calls show() so active form errors persist.
    if(changing)message('');
    activeView=view;
    for(const [key,node] of Object.entries(views))node.hidden=key!==view;
    if(changing&&scroller)
      scroller.scrollTop=view==='list'&&['detail','form'].includes(prior)?listScrollTop:0;
    get('schedule-create').hidden=view!=='list';
    get('schedule-detail-edit').hidden=view!=='detail';
    // The separately visible runner is already a Host, not a second Side Panel.
    text(get('schedule-open-runner'),isRunner()?'再开运行页 ↗':'打开运行页 ↗');
    get('schedule-back').hidden=isRunner()&&view==='runner';
    const backLabel=view==='detail'?(detailReturnView==='runner'?'返回运行概览':'返回计划列表'):
      view==='form'?(formReturnView==='detail'?'返回计划详情':
        formReturnView==='manager'?'返回任务管理':'返回定时计划'):
      view==='manager'?(managerReturn==='form'?'返回编辑计划':
        managerReturn==='detail'?'返回计划详情':'返回定时计划'):
      isRunner()?'返回运行概览':'返回我的任务';
    get('schedule-back').setAttribute('aria-label',backLabel);
    get('schedule-back').title=backLabel;
    text(get('schedule-panel-title'),view==='detail'?
      (allPlans.find(plan=>plan.scheduleId===selectedPlanId)?.title||'计划详情'):
      view==='runner'?'运行概览':view==='manager'?'任务管理':view==='form'?
        (editing?'编辑定时计划':'创建定时计划'):'定时计划');
    text(get('schedule-panel-subtitle'),'');
    get('schedule-panel-subtitle').hidden=true;
  };
  const showPanel=()=>{
    const cloudPanel=doc.querySelector('#workbench-tasks .cloud-panel');
    if(!shown)cloudPanelVisibility=cloudPanel?.hidden;
    shown=true;get('scheduled-panel').hidden=false;
    taskWorkbench.setScheduledSurfaceActive?.(true);
    doc.querySelector('#workbench-tasks .tasks-surface').hidden=true;
    // The optional Cloud quick entry was retired from current tool.html.
    // Keep both the old optional entry and the official Tasks surface safe.
    const cloudEntry=doc.querySelector('#workbench-tasks .cloud-my-entry');
    if(cloudEntry)cloudEntry.hidden=true;
    if(cloudPanel)cloudPanel.hidden=true;
    onOpen();
  };
  function hidePanel(){
    shown=false;get('scheduled-panel').hidden=true;
    taskWorkbench.setScheduledSurfaceActive?.(false);
    doc.querySelector('#workbench-tasks .tasks-surface').hidden=false;
    const cloudEntry=doc.querySelector('#workbench-tasks .cloud-my-entry');
    if(cloudEntry)cloudEntry.hidden=false;
    const cloudPanel=doc.querySelector('#workbench-tasks .cloud-panel');
    if(cloudPanel&&cloudPanelVisibility!==undefined)cloudPanel.hidden=cloudPanelVisibility;
    cloudPanelVisibility=undefined;
    onClose();
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
  function populateChoices(){
    const select=get('schedule-task-select'),previous=select.value;
    select.replaceChildren(element(doc,'option',null,'请选择已安装并验证的任务'));
    select.firstChild.value='';
    for(const row of eligible()){
      const option=element(doc,'option',null,(candidate(row)?.manifest?.title||row.taskId)+' · v'+row.version);
      option.value=row.taskId;select.append(option);
    }
    // Existing schedules are bound to exact Task + version + installation identity.
    // Preserve an unavailable historical choice as a readable, disabled option,
    // never silently substitute another installed version during editing.
    if(editing&&!eligible().some(row=>row.taskId===editing.taskId)){
      const unavailable=element(doc,'option',null,
        '原固定任务 · v'+editing.version+'（已不可用，需检查安装与授权）');
      unavailable.value=editing.taskId;unavailable.disabled=true;select.append(unavailable);
    }
    if(editing)select.value=editing.taskId;
    else if(eligible().some(row=>row.taskId===previous))select.value=previous;
    else select.value='';
    select.disabled=Boolean(editing);
    get('schedule-task-empty').hidden=Boolean(editing)||eligible().length>0;
    showTaskVersion();
  }
  async function showTaskVersion(){
    const seq=++permissionSeq;
    const row=eligible().find(r=>r.taskId===get('schedule-task-select').value);
    const origins=candidate(row)?.manifest?.siteOrigins||[];
    if(!row){
      text(get('schedule-task-version'),editing?
        '原计划固定任务不可用；请恢复相同安装身份与网站授权。需使用其他任务时请新建计划。':
        '请选择已安装、已验证且已启用的 Controller 任务');
      return;
    }
    const prefix=`固定版本 v${row.version}`+
      (editing?' · 编辑时任务身份不可更换（更换请新建计划）':'')+
      ` · 网站范围：${origins.join('，')||'不可用'}`;
    text(get('schedule-task-version'),prefix+' · 正在核查网站权限…');
    try{
      const allowed=Boolean(api.permissions?.contains)&&origins.length>0&&
        (await Promise.all(origins.map(origin=>api.permissions.contains({
          origins:[permissionPattern(origin)]}).catch(()=>false)))).every(Boolean);
      if(seq!==permissionSeq)return;
      text(get('schedule-task-version'),prefix+(allowed?' · 网站权限已授权':' · 网站权限不足，需要处理'));
    }catch{
      if(seq===permissionSeq)text(get('schedule-task-version'),prefix+' · 网站权限状态未知');
    }
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
    text(get('schedule-runner-next'),upcoming?upcoming.title:'暂无待执行计划');
    text(get('schedule-runner-next-detail'),upcoming?
      frequencyLabel(upcoming)+' · '+describeTime(upcoming.nextDueAt,upcoming.timezone):'可从计划管理创建或恢复计划');
    text(get('schedule-runner-current'),current?current.plan.title:
      settling?'正在核对上次结果':unconfirmedRun?'执行状态待确认':'暂无任务运行');
    text(get('schedule-runner-current-detail'),current?
      scheduleStatus(current.fire.status)+' · '+describeTime(current.fire.scheduledAt,current.plan.timezone):
      settling?settling.plan.title+' · 正在结算（尚未确认成功）':
      unconfirmedRun?'已关联原执行槽，正在核对真实状态':
      waiting?'未运行 · '+scheduleStatus(waiting.fire.status):'到期后才检查执行条件');
    text(get('schedule-runner-result'),latest?scheduleStatus(latest.fire.status):'尚无执行结果');
    text(get('schedule-runner-result-detail'),latest?
      latest.plan.title+' · '+describeTime(latest.fire.scheduledAt,latest.plan.timezone):'运行历史可在计划管理中查看');
    text(get('schedule-runner-focus-title'),focus?focus.title:'还没有定时计划');
    text(get('schedule-runner-focus-time'),current&&focus?.scheduleId===current.plan.scheduleId?
      '正在执行 · '+describeTime(current.fire.scheduledAt,current.plan.timezone):
      settling&&focus?.scheduleId===settling.plan.scheduleId?'正在结算 · 尚未确认成功':
      focus?.paused?'已暂停':focus?.needsAttention?'需要处理授权或固定任务':
      Number.isFinite(focus?.nextDueAt)?describeTime(focus.nextDueAt,focus.timezone):
      '暂无下次执行');
    text(get('schedule-runner-focus-detail'),focus?
      (current&&focus.scheduleId===current.plan.scheduleId?'当前任务 · '+scheduleStatus(current.fire.status):
        settling&&focus.scheduleId===settling.plan.scheduleId?'最近执行 · 正在结算（不是成功）':
        frequencyLabel(focus)+' · '+(focus.paused?'已暂停':describeTime(focus.nextDueAt,focus.timezone))):
      '创建一个已验证并安装的任务计划');
    text(get('schedule-runner-explain'),current&&focus?.scheduleId===current.plan.scheduleId?
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
    const toggle=get('schedule-runner-toggle');
    toggle.disabled=!focus||Boolean(focus.needsAttention&&!focus.paused);
    text(toggle,focus?.paused?'恢复计划':'暂停计划');
  }
  function makeHistoryRow(fire,zone){
    const row=element(doc,'div','schedule-history-row',
      `${describeTime(fire.scheduledAt,zone)} · ${scheduleStatus(fire.status)}`);
    const guidance=scheduleStatusGuidance[fire.status];
    if(guidance)row.append(element(doc,'small','schedule-status-guidance',guidance));
    if(fire.runId){
      const advanced=element(doc,'details','schedule-run-details od-disclosure od-disclosure--flat');
      advanced.append(element(doc,'summary',null,'技术详情'));
      advanced.append(element(doc,'small',null,
        `RunId：${fire.runId} · ResultId：${fire.resultId??'未生成'} · 资源：${fire.retirementState==='released'?'已释放':'等待释放'}`));
      row.append(advanced);
    }
    return row;
  }

  // Keep all loaded Fire pages and disclosure states keyed by the stable plan.
  function rememberDetailState(){
    const root=get('schedule-detail-view');
    const view=historyViews.get(root.dataset.scheduleId);
    if(!view)return;
    view.open=Boolean(root.querySelector('.schedule-history')?.open);
    view.moreOpen=Boolean(root.querySelector('.schedule-more')?.open);
    view.deleteReview=Boolean(root.querySelector('.schedule-delete-confirm'));
  }
  function renderPlans(){
    rememberDetailState();
    const parent=get('schedule-plan-list');
    const focused=doc.activeElement?.closest?.('.schedule-card');
    const focusedId=focused&&parent.contains(focused)?focused.dataset.scheduleId:null;
    const focusSelectors=['.schedule-plan-open','.schedule-plan-actions button:first-child',
      '.schedule-plan-actions button:nth-child(2)'];
    const focusedSelector=focusedId?focusSelectors.find(selector=>
      doc.activeElement?.matches?.(selector)):null;
    const ids=new Set(allPlans.map(plan=>plan.scheduleId));
    for(const id of historyViews.keys())if(!ids.has(id))historyViews.delete(id);
    parent.replaceChildren();
    const sorted=allPlans.slice().sort((a,b)=>(a.nextDueAt??Infinity)-(b.nextDueAt??Infinity));
    const enabled=allPlans.filter(p=>!p.paused&&!p.needsAttention&&Number.isFinite(p.nextDueAt)).length;
    const upcoming=sorted.find(p=>!p.paused&&!p.needsAttention&&Number.isFinite(p.nextDueAt));
    text(get('schedule-list-summary'),allPlans.length?
      `共 ${allPlans.length} 个计划 · ${enabled} 个已安排下次执行`+
        (upcoming?` · 最近：${upcoming.title}，${describeTime(upcoming.nextDueAt,upcoming.timezone)}`:' · 暂无可预期的下次执行'):
      '尚无定时计划');
    if(!allPlans.length){
      parent.append(element(doc,'p','schedule-empty-hint hint',
        '尚无定时计划。点击「新建计划」安排第一个已验证任务。'));
      renderDetail();return;
    }
    for(const plan of sorted){
      const card=element(doc,'article','schedule-card od-surface');
      card.dataset.scheduleId=plan.scheduleId;
      const head=element(doc,'div','schedule-card-head od-toolbar');
      head.append(action(doc,plan.title,()=>openDetail(plan.scheduleId),
        'od-button od-button--quiet schedule-plan-open'),
        element(doc,'span','schedule-state',
          plan.paused?'已暂停':plan.needsAttention?'需要处理':
            !Number.isFinite(plan.nextDueAt)?'暂无后续':'已启用'));
      const catalogEntry=catalog.find(item=>item.taskId===plan.taskId&&item.version===plan.version);
      const next=element(doc,'p','schedule-next-time',
        plan.paused?'已暂停 · 不会触发':plan.needsAttention?'需要处理后才能执行':
          Number.isFinite(plan.nextDueAt)?
            '下次：'+describeTime(plan.nextDueAt,plan.timezone):'暂无后续执行');
      const info=element(doc,'p','schedule-plan-meta hint',
        frequencyLabel(plan)+' · '+(catalogEntry?.manifest?.title||plan.taskId));
      const previous=historyViews.get(plan.scheduleId);
      const view=previous||{records:[],hasMore:false,open:false,moreOpen:false,deleteReview:false};
      const latest=plan.history||[];
      const overlap=!latest.length||!view.records.length||
        latest.some(fire=>view.records.some(loaded=>loaded.fireId===fire.fireId));
      // Never skip an unobserved page after a long background gap.
      view.records=mergeScheduleHistoryView(latest,overlap?view.records:[]);
      if(!previous||!overlap)view.hasMore=latest.length===20;
      historyViews.set(plan.scheduleId,view);
      const toolbar=element(doc,'div','schedule-actions od-toolbar schedule-plan-actions');
      toolbar.append(action(doc,plan.paused?'恢复':'暂停',
        ()=>void change(plan,plan.paused?'resume':'pause'),'od-button'));
      toolbar.append(action(doc,'编辑',()=>edit(plan)));
      card.append(head,next,info,toolbar);
      parent.append(card);
    }
    renderDetail();
    if(focusedId&&focusedSelector){
      const restored=[...parent.querySelectorAll('.schedule-card')].find(card=>
        card.dataset.scheduleId===focusedId);
      restored?.querySelector(focusedSelector)?.focus();
    }
  }
  function renderDetail(){
    const parent=get('schedule-detail-view');
    const plan=allPlans.find(row=>row.scheduleId===selectedPlanId);
    if(!plan){parent.replaceChildren();parent.dataset.scheduleId='';return;}
    const view=historyViews.get(plan.scheduleId);
    if(!view)return;
    const focusSelectors=['.schedule-history > summary','.schedule-load-more',
      '.schedule-more > summary','.schedule-danger-link',
      '.schedule-delete-confirm button:first-child','.schedule-delete-confirm button:nth-child(2)',
      '.schedule-detail-actions button'];
    const focusSelector=parent.contains(doc.activeElement)?
      focusSelectors.find(selector=>doc.activeElement?.matches?.(selector)):null;
    const card=element(doc,'div','schedule-detail-card od-stack');
    const summary=element(doc,'section','schedule-detail-summary od-surface od-surface--padded od-stack');
    const catalogEntry=catalog.find(item=>item.taskId===plan.taskId&&item.version===plan.version);
    summary.append(
      element(doc,'span','schedule-state',plan.paused?'已暂停':plan.needsAttention?'需要处理':
        !Number.isFinite(plan.nextDueAt)?'暂无后续':'已启用'),
      element(doc,'p','schedule-next-time',plan.paused?'已暂停 · 不会触发':
        plan.needsAttention?'需要处理后才能执行':
        Number.isFinite(plan.nextDueAt)?'下次：'+describeTime(plan.nextDueAt,plan.timezone):'暂无后续执行'),
      element(doc,'p','schedule-plan-meta hint',
        frequencyLabel(plan)+' · '+(catalogEntry?.manifest?.title||plan.taskId)),
      element(doc,'p','schedule-detail-url hint','目标网页：'+plan.targetUrl)
    );
      const last=view.records[0];
      const warning=plan.needsAttention?
        '当前任务安装身份或网站权限不足；请检查已安装任务，不会自动换绑新版。':
        last&&!['SUCCESS','STOPPED'].includes(last.status)?scheduleStatusGuidance[last.status]:'';
      const hint=warning?element(doc,'p','schedule-status-help',warning):null;
      if(hint&&plan.needsAttention){
        hint.append(' ');
        hint.append(action(doc,'检查已安装任务',()=>{managerReturn='detail';show('manager');},
          'od-button od-button--secondary'));
      }
      const history=element(doc,'details','schedule-history od-disclosure od-disclosure--flat');
      history.open=view.open;
      history.append(element(doc,'summary',null,
        '运行记录'+(last?` · 最近：${scheduleStatus(last.status)} · ${describeTime(last.scheduledAt,plan.timezone)}`:' · 暂无')));
      const historyList=element(doc,'div','od-stack');
      for(const fire of view.records)historyList.append(makeHistoryRow(fire,plan.timezone));
      if(view.hasMore){
        const more=action(doc,'加载更早记录',async()=>{
          if(more.disabled)return;
          more.disabled=true;text(more,'正在读取…');
          try{
            const page=await client.request('listScheduleHistory',{
              scheduleId:plan.scheduleId,offset:view.records.length,limit:20});
            const seen=new Set(view.records.map(fire=>fire.fireId));
            for(const fire of page.history){
              if(seen.has(fire.fireId))continue;
              seen.add(fire.fireId);view.records.push(fire);
              if(historyList.isConnected)historyList.insertBefore(makeHistoryRow(fire,plan.timezone),more);
            }
            view.hasMore=Boolean(page.hasMore&&page.history.length);
            if(!historyList.isConnected){renderPlans();return;}
            if(!view.hasMore)more.remove();
            else {more.disabled=false;text(more,'加载更早记录');}
          }catch(error){
            more.disabled=false;text(more,'重试加载记录');
            message('加载历史失败：'+(error?.message||String(error)),true);
          }
        },'od-button od-button--secondary schedule-load-more');
        historyList.append(more);
      }
      history.append(historyList);

    const toolbar=element(doc,'div','schedule-actions od-toolbar schedule-detail-actions');
    toolbar.append(action(doc,plan.paused?'恢复计划':'暂停计划',
      ()=>void change(plan,plan.paused?'resume':'pause'),'od-button od-button--secondary'));
      const more=element(doc,'details','schedule-more od-disclosure od-disclosure--flat');
      more.open=view.moreOpen;
      more.append(element(doc,'summary',null,'更多操作与固定版本'));
      more.append(element(doc,'p','hint',
        `固定版本 v${plan.version} · IANA 时区 ${plan.timezone} · 任务 ${plan.taskId}`));
      const remove=action(doc,'删除此计划',()=>{
        const existing=card.querySelector('.schedule-delete-confirm');
        if(existing){existing.remove();return;}
        const confirm=element(doc,'div','schedule-delete-confirm od-surface');
        confirm.append(element(doc,'p',null,
          `确定删除「${plan.title}」？已有的 Run/Result 审计历史不会随之清除。`));
        confirm.append(action(doc,'确认删除',()=>void change(plan,'delete'),
          'od-button schedule-danger-button'),
          action(doc,'取消',()=>{confirm.remove();remove.focus();}));
        card.append(confirm);confirm.querySelector('button')?.focus();
      },'od-button od-button--secondary schedule-danger-link');
      more.append(remove);

    card.append(summary);
    if(hint)card.append(hint);
    card.append(toolbar,history,more);
    parent.dataset.scheduleId=plan.scheduleId;
    parent.replaceChildren(card);
    // Reopen the inline review only; never invoke its dangerous RPC here.
    if(view.deleteReview)remove.click();
    if(focusSelector)card.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  function openDetail(scheduleId){
    if(!allPlans.some(plan=>plan.scheduleId===scheduleId))return;
    rememberDetailState();
    if(activeView==='list')listScrollTop=get('workspace-content')?.scrollTop??0;
    detailReturnView=activeView==='runner'?'runner':'list';
    selectedPlanId=scheduleId;
    renderDetail();show('detail');
    get('schedule-back').focus({preventScroll:true});
  }
  function leaveDetail(){
    rememberDetailState();
    const scheduleId=selectedPlanId;
    show(detailReturnView);
    if(detailReturnView==='list'){
      const card=[...get('schedule-plan-list').querySelectorAll('.schedule-card')]
        .find(row=>row.dataset.scheduleId===scheduleId);
      (card?.querySelector('.schedule-plan-open')||
        get('schedule-plan-list').querySelector('.schedule-plan-open')||
        get('schedule-create')).focus({preventScroll:true});
      const scroller=get('workspace-content');
      if(scroller)scroller.scrollTop=listScrollTop;
    }else get('schedule-runner-history').focus({preventScroll:true});
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
    }catch(error){message(error?.message||String(error),true);}finally{busy=false;}
  }
  function switchKind(){
    const kind=get('schedule-kind').value;
    get('schedule-once-field').hidden=kind!=='once';
    get('schedule-clock-field').hidden=!['daily','weekly'].includes(kind);
    get('schedule-weekdays-field').hidden=kind!=='weekly';
    get('schedule-interval-field').hidden=kind!=='interval';
    preview();
  }
  function trigger(){
    const kind=get('schedule-kind').value,zone=get('schedule-timezone').value.trim();
    if(kind==='once')return {kind,zone,spec:{at:parseWallScheduleTime(zone,get('schedule-once').value)}};
    if(kind==='interval'){
      const everyMinutes=Number(get('schedule-minutes').value);
      const unchanged=editing?.triggerKind==='interval'&&
        editing.triggerSpec.everyMinutes===everyMinutes;
      return {kind,zone,spec:{anchorAt:unchanged?editing.triggerSpec.anchorAt:Date.now()+everyMinutes*60000,
        everyMinutes}};
    }
    const match=get('schedule-clock').value.match(/^(\d{2}):(\d{2})$/);
    if(!match)throw Error('请输入有效的执行时间');
    const spec={hour:Number(match[1]),minute:Number(match[2])};
    if(kind==='weekly'){
      spec.days=[...get('schedule-weekdays-field').querySelectorAll('input:checked')].map(node=>Number(node.value));
    }
    return {kind,zone,spec};
  }
  function preview(){
    try{
      const {kind,zone,spec}=trigger();
      const next=nextScheduleAt(kind,spec,zone,Date.now());
      if(next===null)throw Error('该时间没有后续触发，请选择未来时间');
      text(get('schedule-next-time'),describeTime(next,zone));
      text(get('schedule-next-zone'),'按 '+zone+' 固定时区执行 · Chrome 关闭时不唤醒电脑');
      get('schedule-next').dataset.state='valid';
      if(!touched.has('time'))fieldError('time','');
    }catch(error){
      text(get('schedule-next-time'),'请检查执行时间');
      text(get('schedule-next-zone'),error?.message||'请输入有效的执行时间和时区');
      get('schedule-next').dataset.state='invalid';
      if(touched.has('time'))fieldError('time',error?.message||'请输入有效的执行时间和时区');
    }
  }
  function validateLocal(showAll=false){
    const errors={};const fail=(name,value)=>{errors[name]=value;};
    const title=get('schedule-title').value.trim();
    if(!title||title.length>100)fail('title','计划名称应为 1–100 个字符');
    const row=eligible().find(r=>r.taskId===get('schedule-task-select').value);
    if(!row)fail('task','请选择已验证、已安装且已启用的任务');
    let url;
    const entered=get('schedule-target').value.trim();
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
      params=JSON.parse(get('schedule-params').value||'{}');
      if(!params||typeof params!=='object'||Array.isArray(params)||
        JSON.stringify(params).length>8192)throw Error('请输入不超过 8192 字符的 JSON 对象');
    }catch(error){fail('params',error instanceof SyntaxError?
      'JSON 格式错误，请检查逗号、引号及括号':error.message);}
    let rule;
    try{
      rule=trigger();
      const next=nextScheduleAt(rule.kind,rule.spec,rule.zone,Date.now());
      if(next===null)throw Error('执行时间已过，请选择未来时间');
      const deadline=Number(get('schedule-deadline').value);
      if(!Number.isSafeInteger(deadline)||deadline<1||deadline>60)
        throw Error('最长等待时间必须为 1–60 分钟');
    }catch(error){fail('time',error?.message||'执行规则或 IANA 时区不正确');}
    for(const name of Object.keys(formFields))
      if(showAll||touched.has(name))fieldError(name,errors[name]||'');
    return Object.keys(errors).length?null:{title,row,url,params,rule};
  }
  function setTimeZoneExpanded(expanded,focus=false){
    const pane=get('schedule-timezone-controls'),button=get('schedule-timezone-edit');
    pane.hidden=!expanded;
    button.setAttribute('aria-expanded',String(expanded));
    text(button,expanded?'收起':'更改');
    if(focus)(expanded?get('schedule-timezone-search'):button).focus();
  }
  function updateTimeZoneSummary(zone){
    const named=commonScheduleTimeZones.find(([value])=>value===zone)?.[1]||
      zone.replaceAll('_',' ');
    text(get('schedule-timezone-summary'),isScheduleTimeZone(zone,globalThis.Intl)?
      (editing?'固定时区 · ':'已选择 · ')+named+'（'+zone+'）':
      '原计划时区不可用 · '+zone+'；请选择有效地区');
  }
  function populateTimeZoneSelect(selected=getScheduleDeviceTimeZone(),search=''){
    const select=get('schedule-timezone');
    const all=listScheduleTimeZoneGroups(globalThis.Intl,selected);
    const groups=filterScheduleTimeZoneGroups(all,search,selected);
    select.replaceChildren(...groups.map(row=>{
      const group=doc.createElement('optgroup');
      group.label=row.label;
      for(const {value,label} of row.options){
        const option=doc.createElement('option');
        option.value=value;text(option,label);group.append(option);
      }
      return group;
    }));
    // Search is a filter: the fixed IANA value never silently changes.
    select.value=selected;
    updateTimeZoneSummary(selected);
    const count=groups.flatMap(group=>group.options).filter(item=>item.value!==selected).length;
    text(get('schedule-timezone-match'),search.trim()?
      (count?`找到 ${count} 个其他匹配地区；选择下拉项才会更改时区。`:
        '未找到其他匹配地区；当前时区保持不变。'):'');
  }
  function reset(){
    editing=null;pendingTask=null;formDirty=false;
    get('schedule-discard-confirm').hidden=true;
    clearConfirmation();touched.clear();
    for(const name of Object.keys(formFields))fieldError(name,'');
    const form=get('schedule-form');form.reset();
    get('schedule-title').value='';
    const selectedZone=getScheduleDeviceTimeZone();
    // A missing/invalid device zone falls back to UTC. The default wall time
    // must be computed in the SAME selected IANA zone, not host Date getters.
    get('schedule-once').value=formatWallScheduleTime(selectedZone,Date.now()+10*60000);
    populateTimeZoneSelect(selectedZone);
    setTimeZoneExpanded(false);
    get('schedule-timezone-search').value='';
    get('schedule-params').value='{}';get('schedule-kind').value='once';
    get('schedule-task-select').disabled=false;
    get('schedule-clock').value='09:00';get('schedule-minutes').value='60';
    get('schedule-deadline').value='5';get('schedule-misfire').value='skip';
    populateChoices();switchKind();
  }
  function edit(plan){
    formDirty=false;get('schedule-discard-confirm').hidden=true;
    clearConfirmation();touched.clear();
    for(const name of Object.keys(formFields))fieldError(name,'');
    formReturnView=activeView==='detail'?'detail':isRunner()?'runner':'list';
    editing=plan;show('form');
    get('schedule-title').value=plan.title;
    populateChoices();
    get('schedule-target').value=plan.targetUrl;
    get('schedule-params').value=JSON.stringify(plan.params,null,2);
    get('schedule-kind').value=plan.triggerKind;
    get('schedule-timezone-search').value='';
    populateTimeZoneSelect(plan.timezone);
    setTimeZoneExpanded(false);
    if(plan.triggerKind==='once')
      get('schedule-once').value=formatWallScheduleTime(plan.timezone,plan.triggerSpec.at);
    else if(['daily','weekly'].includes(plan.triggerKind)){
      get('schedule-clock').value=`${String(plan.triggerSpec.hour).padStart(2,'0')}:${String(plan.triggerSpec.minute).padStart(2,'0')}`;
      if(plan.triggerKind==='weekly')
        for(const input of get('schedule-weekdays-field').querySelectorAll('input'))
          input.checked=plan.triggerSpec.days.includes(Number(input.value));
    }else get('schedule-minutes').value=String(plan.triggerSpec.everyMinutes);
    get('schedule-misfire').value=plan.misfirePolicy;
    get('schedule-deadline').value=String(plan.startDeadlineMs/60000);
    get('schedule-open-target').checked=plan.openIfMissing;
    get('schedule-paused').checked=plan.paused;
    switchKind();showTaskVersion();get('schedule-title').focus();
  }
  async function save(event){
    event.preventDefault();if(busy)return;
    clearConfirmation();
    const revision=editRevision;
    const local=validateLocal(true);
    if(!local){
      message('请先修正上方标记的字段',true);
      const invalid=Object.keys(formFields).find(name=>get(formFields[name])?.getAttribute('aria-invalid')==='true');
      if(invalid==='time'){
         const badZone=!isScheduleTimeZone(get('schedule-timezone').value,globalThis.Intl);
         if(badZone)setTimeZoneExpanded(true);
         const kind=get('schedule-kind').value;
         const target=badZone?get('schedule-timezone'):
           kind==='once'?get('schedule-once'):
           kind==='interval'?get('schedule-minutes'):get('schedule-clock');
         target.focus();
       }else if(invalid)get(formFields[invalid]).focus();
      return;
    }
    busy=true;get('schedule-save').disabled=true;
    try{
      const resolved=await client.request('resolveInstalledTask',{taskId:local.row.taskId});
      if(resolved.version!==local.row.version||resolved.manifestHash!==local.row.manifestHash||
        resolved.installationId!==local.row.installationId)
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
        params:local.params,targetUrl:local.url.href,openIfMissing:get('schedule-open-target').checked,
        timezone:zone,triggerKind:kind,triggerSpec:spec,misfirePolicy:get('schedule-misfire').value,
        startDeadlineMs:Number(get('schedule-deadline').value)*60000,paused:get('schedule-paused').checked};
      if(revision!==editRevision)throw Error('表单在核对过程中被修改，请重新检查并确认');
      awaitingSave={input};
      const timing=frequencyLabel(input)+' · '+describeTime(nextScheduleAt(kind,spec,zone,Date.now()),zone);
      text(get('schedule-save-summary'),
        `${input.title}\n任务：${resolved.manifest.title||resolved.taskId} · v${resolved.version}\n网址：${input.targetUrl}\n时区：${zone}（保存后固定）\n时间：${timing}\n状态：${input.paused?'先暂停':'启用'}`);
      get('schedule-save-confirm').hidden=false;
      message('请核对固定任务、目标网址与执行规则后确认保存');
      get('schedule-confirm-yes').focus();
    }catch(error){message('无法确认计划：'+(error?.message||String(error)),true);}
    finally{busy=false;get('schedule-save').disabled=false;}
  }
  async function confirmSave(){
    if(busy||!awaitingSave)return;
    busy=true;get('schedule-confirm-yes').disabled=true;
    const pending=awaitingSave;
    try{
      const {refreshError}=await commitScheduledMutation(
        ()=>client.request('saveSchedule',pending.input),refresh);
      clearConfirmation();formDirty=false;get('schedule-discard-confirm').hidden=true;
      const afterSave=editing?formReturnView:isRunner()?'runner':'list';
      const savedPlanId=editing?.scheduleId??null;
      editing=null;show(afterSave==='manager'?'list':afterSave);
      focusReturnedView(afterSave==='manager'?'list':afterSave,savedPlanId);
      message(refreshError?'定时计划已保存，但列表刷新失败：'+
        (refreshError?.message||String(refreshError))+'；请重新打开定时计划核对。':
        '定时计划已保存，Chrome Alarms 已按照持久计划对账',Boolean(refreshError));
    }catch(error){message('无法保存计划：'+(error?.message||String(error)),true);}
    finally{busy=false;get('schedule-confirm-yes').disabled=false;}
  }
  function enterDeveloper(){
    pendingCreateFromForm=activeView==='form';
    pendingCreate=true;hidePanel();taskWorkbench.navigate('develop');
    text(get('task-dev-status'),'请先真实运行并验证源码、安装固定版本；安装后返回定时计划。');
  }
  function renderManager(){
    const parent=get('schedule-manager-list');parent.replaceChildren();
    const filter=get('schedule-manager-filter').value,q=get('schedule-manager-search').value.trim().toLowerCase();
    const rows=installed.filter(row=>(filter==='all'||row.enabled===(filter==='enabled'))&&
      [row.taskId,candidate(row)?.manifest?.title||''].some(value=>value.toLowerCase().includes(q)));
    if(!rows.length){parent.append(element(doc,'p','hint','没有符合条件的已安装任务。'));return;}
    for(const row of rows){
      const details=candidate(row),card=element(doc,'article','schedule-manager-card od-surface');
      card.append(element(doc,'strong',null,details?.manifest?.title||row.taskId));
      card.append(element(doc,'p','hint',
        `${row.taskId} · v${row.version} · ${row.enabled?'已启用':'已停用'} · 关联计划 ${allPlans.filter(p=>p.taskId===row.taskId).length}`));
      card.append(element(doc,'p','hint','网站权限：'+(details?.manifest?.siteOrigins||[]).join('，')));
      const toolbar=element(doc,'div','schedule-actions od-toolbar');
      toolbar.append(action(doc,'设置定时',()=>{managerReturn='list';formReturnView='manager';show('form');
        reset();get('schedule-task-select').value=row.enabled?row.taskId:'';
        showTaskVersion();get('schedule-title').value=(details?.manifest?.title||row.taskId)+' 定时';}));
      toolbar.append(action(doc,row.enabled?'停用':'启用',async event=>{
        if(busy)return;busy=true;
        try{
          if(!row.enabled)await requireChromePermissions({api,request:{origins:(details?.manifest?.siteOrigins||[])
            .map(origin=>permissionPattern(origin))}});
          await client.request('setInstalledTaskEnabled',{taskId:row.taskId,version:row.version,
            enabled:!row.enabled,expectedGeneration:row.generation??null,
            expectedInstallationId:row.installationId??null});
          await refresh();message('任务安装状态已更新');
        }catch(error){message(error?.message||String(error),true);}finally{busy=false;}
      }));
      toolbar.append(action(doc,'复制到开发',async()=>{
        try{
          const existing=await client.request('getTaskCandidate',{taskId:row.taskId,version:row.version});
          hidePanel();
          await taskWorkbench.receiveDraft(existing.package.sourceUtf8);
        }catch(error){message(error?.message||String(error),true);}
      }));
      toolbar.append(action(doc,'卸载',()=>{
        confirmUninstall=row;get('schedule-uninstall-confirm').hidden=false;
        text(get('schedule-uninstall-label'),`确认卸载「${details?.manifest?.title||row.taskId}」v${row.version}？历史运行记录将保留。`);
      }));
      card.append(toolbar);parent.append(card);
    }
  }
  async function uninstall(){
    if(!confirmUninstall||busy)return;busy=true;
    const row=confirmUninstall;
    try{
      const {refreshError}=await commitScheduledMutation(
        ()=>client.request('uninstallTask',{taskId:row.taskId,version:row.version,
          expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null}),
        refresh);
      get('schedule-uninstall-confirm').hidden=true;confirmUninstall=null;
      message(refreshError?'固定版本已卸载，但列表刷新失败：'+
        (refreshError?.message||String(refreshError))+'；请重新进入任务管理核对。':
        '已卸载固定版本；关联计划需重新安装授权',Boolean(refreshError));
    }catch(error){message(error?.message||String(error),true);}finally{busy=false;}
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
    if(view==='detail')get('schedule-detail-edit').focus({preventScroll:true});
    else if(view==='list'){
      const card=[...get('schedule-plan-list').querySelectorAll('.schedule-card')]
        .find(row=>row.dataset.scheduleId===scheduleId);
      (card?.querySelector('.schedule-plan-open')||get('schedule-create'))
        .focus({preventScroll:true});
    }else if(view==='manager')get('schedule-manager-search').focus({preventScroll:true});
    else if(view==='runner')get('schedule-runner-history').focus({preventScroll:true});
  }
  function requestLeaveForm(destination){
    if(busy)return;
    if(formDirty){
      discardDestination=destination;
      clearConfirmation();
      get('schedule-discard-confirm').hidden=false;
      get('schedule-discard-no').focus();
      return;
    }
    clearConfirmation();show(destination);focusReturnedView(destination);
  }
  function navigateBack(){
    if(activeView==='manager'){show(managerReturn);return;}
    if(activeView==='detail'){leaveDetail();return;}
    if(activeView==='form'){
      requestLeaveForm(formReturnView);return;
    }
    if(isRunner()){show('runner');return;}
    hidePanel();
  }
  bind('schedule-open','click',()=>void open());
  bind('schedule-stop','click',stop);
  bind('schedule-back','click',navigateBack);
  bind('schedule-runner-manage','click',()=>show('list'));
  bind('schedule-runner-refresh','click',()=>void refresh().catch(error=>message(error.message,true)));
  bind('schedule-runner-toggle','click',()=>{
    const plan=allPlans.find(p=>p.scheduleId===runnerFocusId);
    if(plan)void change(plan,plan.paused?'resume':'pause');
  });
  bind('schedule-runner-history','click',()=>{
    const plan=allPlans.find(row=>row.scheduleId===runnerFocusId);
    if(!plan){show('list');return;}
    openDetail(plan.scheduleId);
    const details=get('schedule-detail-view').querySelector('.schedule-history');
    if(details){details.open=true;
      const view=historyViews.get(plan.scheduleId);if(view)view.open=true;
      details.querySelector('summary')?.focus();}
  });
  bind('schedule-create','click',()=>{formReturnView=isRunner()?'runner':'list';reset();show('form');get('schedule-title').focus();});
  bind('schedule-detail-edit','click',()=>{
    const plan=allPlans.find(row=>row.scheduleId===selectedPlanId);
    if(plan)edit(plan);
  });
  bind('schedule-cancel','click',()=>requestLeaveForm(formReturnView));
  bind('schedule-discard-yes','click',()=>{
    formDirty=false;
    get('schedule-discard-confirm').hidden=true;
    clearConfirmation();
    show(discardDestination);
    focusReturnedView(discardDestination);
  });
  bind('schedule-discard-no','click',()=>{
    get('schedule-discard-confirm').hidden=true;
    get('schedule-title').focus();
  });
  bind('schedule-confirm-yes','click',()=>void confirmSave());
  bind('schedule-confirm-no','click',()=>{clearConfirmation();get('schedule-save').focus();});
  for(const [id,name] of [
    ['schedule-title','title'],['schedule-task-select','task'],['schedule-target','target'],
    ['schedule-params','params'],['schedule-kind','time'],['schedule-timezone','time'],
    ['schedule-once','time'],['schedule-clock','time'],['schedule-minutes','time'],
    ['schedule-weekdays-field','time'],['schedule-deadline','time']]){
    bind(id,'input',()=>{
      touched.add(name);formDirty=true;editRevision++;
      get('schedule-discard-confirm').hidden=true;
      clearConfirmation();validateLocal(false);
      if(name==='time')preview();
    });
  }
  for(const id of ['schedule-open-target','schedule-misfire','schedule-paused'])
    bind(id,'change',()=>{formDirty=true;editRevision++;clearConfirmation();});
  bind('schedule-form','submit',save);
  bind('schedule-task-select','change',()=>{
    formDirty=true;editRevision++;clearConfirmation();void showTaskVersion();
  });
  bind('schedule-timezone-search','input',()=>
    populateTimeZoneSelect(get('schedule-timezone').value,get('schedule-timezone-search').value));
  bind('schedule-timezone','change',()=>{
    formDirty=true;editRevision++;clearConfirmation();
    const selected=get('schedule-timezone').value;
    get('schedule-timezone-search').value='';
    populateTimeZoneSelect(selected);
  });
  bind('schedule-timezone-edit','click',()=>
    setTimeZoneExpanded(get('schedule-timezone-controls').hidden,true));
  bind('schedule-timezone-done','click',()=>setTimeZoneExpanded(false,true));
  bind('schedule-task-empty-create','click',enterDeveloper);
  bind('scheduled-panel','keydown',event=>{
    if(event.key!=='Escape'||event.defaultPrevented)return;
    if(!get('schedule-discard-confirm').hidden){
      event.preventDefault();get('schedule-discard-no').click();
    }else if(!get('schedule-save-confirm').hidden){
      event.preventDefault();clearConfirmation();get('schedule-save').focus();
    }else if(!get('schedule-timezone-controls').hidden&&
      get('schedule-timezone-controls').contains(doc.activeElement)){
      event.preventDefault();setTimeZoneExpanded(false,true);
    }
  });
  bind('schedule-new-script','click',enterDeveloper);
  bind('schedule-manage-tasks','click',()=>{managerReturn='form';show('manager');});
  bind('schedule-manager-create','click',enterDeveloper);
  bind('schedule-manager-back','click',()=>show(managerReturn));
  bind('schedule-manager-search','input',renderManager);
  bind('schedule-manager-filter','change',renderManager);
  bind('schedule-uninstall-yes','click',()=>void uninstall());
  bind('schedule-uninstall-no','click',()=>{confirmUninstall=null;get('schedule-uninstall-confirm').hidden=true;});
  for(const id of ['schedule-kind','schedule-once','schedule-timezone','schedule-clock',
    'schedule-minutes','schedule-weekdays-field'])
    bind(id,'change',()=>{
      formDirty=true;editRevision++;clearConfirmation();
      if(id==='schedule-kind')switchKind();else preview();
    });
  bind('schedule-open-runner','click',()=>void api.tabs.create({url:api.runtime.getURL('ui/tool.html?scheduledRunner=1')})
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
        get('schedule-task-select').value=taskId;
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
    get('schedule-stop').hidden=!runId;
    renderRunner();
  },onInstalled:onInstalledTask,get shown(){return shown;},dispose(){
    disposed=true;for(const remove of listeners)remove();unsubscribe?.();installedUpdates?.();hidePanel();
  }};
}
