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
const describeTime=(at,zone)=>{
  if(at===null||!Number.isFinite(at))return '无后续触发';
  try{return new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));}
  catch{return new Date(at).toISOString();}
};
export function createScheduledTaskWorkbench({client,host,taskWorkbench,api=globalThis.chrome,
  document:doc=globalThis.document,onClose=()=>{},onOpen=()=>{}}){
  const get=id=>doc.getElementById(id),listeners=[];
  const bind=(id,event,fn)=>{
    const node=get(id);if(!node)throw new Error('Missing schedule UI: '+id);
    node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));
  };
  let disposed=false,shown=false,busy=false,editing=null,managerReturn='list';
  let pendingCreate=false,pendingTask=null,confirmUninstall=null,allPlans=[],catalog=[],installed=[];
  let selectedFire=null,lastRefresh=0;
  const message=(value,error=false)=>{
    const el=get('schedule-message');text(el,value);el.dataset.state=error?'error':'ready';
  };
  const views={list:get('schedule-list-view'),form:get('schedule-form'),manager:get('schedule-task-manager')};
  const show=view=>{
    for(const [key,node] of Object.entries(views))node.hidden=key!==view;
    get('schedule-panel-title').textContent=view==='manager'?'任务管理':view==='form'?
      (editing?'编辑定时计划':'创建定时计划'):'定时计划';
  };
  const showPanel=()=>{
    shown=true;get('scheduled-panel').hidden=false;
    doc.querySelector('#workbench-tasks .tasks-surface').hidden=true;
    doc.querySelector('#workbench-tasks .cloud-my-entry').hidden=true;
    onOpen();
  };
  function hidePanel(){
    shown=false;get('scheduled-panel').hidden=true;
    doc.querySelector('#workbench-tasks .tasks-surface').hidden=false;
    doc.querySelector('#workbench-tasks .cloud-my-entry').hidden=false;
    onClose();
  }
  async function refresh(){
    if(disposed)return;
    const [tasks,plans]=await Promise.all([client.request('listTaskCatalog',{}),
      client.request('listSchedules',{})]);
    if(disposed)return;
    catalog=tasks.catalog||[];installed=tasks.installed||[];
    allPlans=plans.schedules||[];lastRefresh=Date.now();
    populateChoices();renderPlans();renderManager();
    if(shown)message('');
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
    if(eligible().some(row=>row.taskId===previous))select.value=previous;
    else if(editing&&eligible().some(row=>row.taskId===editing.taskId))select.value=editing.taskId;
    else select.value='';
    showTaskVersion();
  }
  function showTaskVersion(){
    const row=eligible().find(r=>r.taskId===get('schedule-task-select').value);
    const manifest=candidate(row)?.manifest;
    text(get('schedule-task-version'),row?
      `固定版本 v${row.version} · 授权网站：${manifest?.siteOrigins?.join('，')||'不可用'}`:
      '请选择已安装、已验证且已启用的 Controller 任务');
  }
  function renderPlans(){
    const parent=get('schedule-plan-list');parent.replaceChildren();
    if(!allPlans.length){parent.append(element(doc,'p','hint','尚无定时计划。点击「新建计划」安排第一个已验证任务。'));return;}
    for(const plan of allPlans.slice().sort((a,b)=>(a.nextDueAt??Infinity)-(b.nextDueAt??Infinity))){
      const card=element(doc,'article','schedule-card od-surface');
      const head=element(doc,'div','schedule-card-head od-toolbar');
      head.append(element(doc,'strong',null,plan.title),element(doc,'span','schedule-state',
        plan.paused?'已暂停':plan.needsAttention||plan.history?.[0]?.status==='NEEDS_ATTENTION'?'需要处理':'已启用'));
      const info=element(doc,'p','hint',`${plan.taskId} · v${plan.version} · ${plan.triggerKind} · ${plan.timezone}`);
      const next=element(doc,'p','hint','下次：'+describeTime(plan.nextDueAt,plan.timezone));
      if(plan.needsAttention)next.append(element(doc,'span','schedule-warning',' · 任务已停用、版本改变或网站权限不足，需重新授权'));
      const last=plan.history?.[0];
      const history=element(doc,'details','schedule-history');
      history.append(element(doc,'summary',null,
        '运行记录'+(last?` · 最近：${last.status} · ${describeTime(last.scheduledAt,plan.timezone)}`:' · 暂无')));
      const historyList=element(doc,'div','od-stack');
      for(const fire of plan.history||[]){
        const row=element(doc,'div','schedule-history-row',
          `${describeTime(fire.scheduledAt,plan.timezone)} · ${fire.status}`);
        if(fire.runId)row.append(element(doc,'small',null,
          `Run ${fire.runId} · Result ${fire.resultId??'未生成'} · 释放：${fire.retirementState||'等待'}`));
        historyList.append(row);
      }
      history.append(historyList);
      const toolbar=element(doc,'div','schedule-actions od-toolbar');
      toolbar.append(action(doc,'编辑',()=>edit(plan)));
      toolbar.append(action(doc,plan.paused?'恢复':'暂停',()=>void change(plan,plan.paused?'resume':'pause')));
      const remove=action(doc,'删除',()=>{
        const existing=card.querySelector('.schedule-delete-confirm');
        if(existing){existing.remove();return;}
        const confirm=element(doc,'div','schedule-delete-confirm od-surface');
        confirm.append(element(doc,'p',null,'删除此计划？已产生的 Run/Result 历史不会删除。'));
        confirm.append(action(doc,'确认删除',()=>void change(plan,'delete')),
          action(doc,'取消',()=>confirm.remove()));
        card.append(confirm);
      });toolbar.append(remove);
      card.append(head,info,next,history,toolbar);parent.append(card);
    }
  }
  async function change(plan,operation){
    if(busy)return;busy=true;
    try{
      await client.request('changeSchedule',{scheduleId:plan.scheduleId,
        expectedGeneration:plan.generation,action:operation});
      await refresh();message(operation==='delete'?'计划已删除':'计划状态已更新');
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
      text(get('schedule-next'),'预计下次：'+describeTime(next,zone));
    }catch{ text(get('schedule-next'),'填写有效时区和时间后显示下一次触发'); }
  }
  function reset(){
    editing=null;pendingTask=null;
    const form=get('schedule-form');form.reset();
    get('schedule-title').value='';
    const local=new Date(Date.now()+10*60000);
    get('schedule-once').value=`${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}T${String(local.getHours()).padStart(2,'0')}:${String(local.getMinutes()).padStart(2,'0')}`;
    get('schedule-timezone').value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
    get('schedule-params').value='{}';get('schedule-kind').value='once';
    get('schedule-clock').value='09:00';get('schedule-minutes').value='60';
    get('schedule-deadline').value='5';get('schedule-misfire').value='skip';
    populateChoices();switchKind();
  }
  function edit(plan){
    editing=plan;show('form');
    get('schedule-title').value=plan.title;
    get('schedule-task-select').value=plan.taskId;
    get('schedule-target').value=plan.targetUrl;
    get('schedule-params').value=JSON.stringify(plan.params,null,2);
    get('schedule-kind').value=plan.triggerKind;
    get('schedule-timezone').value=plan.timezone;
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
    busy=true;get('schedule-save').disabled=true;
    try{
      const id=get('schedule-task-select').value;
      const resolved=await client.request('resolveInstalledTask',{taskId:id});
      const url=new URL(get('schedule-target').value.trim());
      url.hash='';
      if(!resolved.manifest.siteOrigins.includes(url.origin))throw Error('目标 URL 不在任务已批准网站范围内');
      const params=JSON.parse(get('schedule-params').value||'{}');
      const {kind,zone,spec}=trigger();
      const input={...(editing?{scheduleId:editing.scheduleId,expectedGeneration:editing.generation}:{}),
        title:get('schedule-title').value.trim(),taskId:resolved.taskId,
        version:resolved.version,manifestHash:resolved.manifestHash,sourceHash:resolved.contentHash,
        installationId:resolved.installationId,taskGeneration:resolved.generation,
        params,targetUrl:url.href,openIfMissing:get('schedule-open-target').checked,
        timezone:zone,triggerKind:kind,triggerSpec:spec,misfirePolicy:get('schedule-misfire').value,
        startDeadlineMs:Number(get('schedule-deadline').value)*60000,paused:get('schedule-paused').checked};
      await client.request('saveSchedule',input);
      await refresh();editing=null;show('list');message('定时计划已保存，Chrome Alarms 已按照持久计划对账');
    }catch(error){message('无法保存计划：'+(error?.message||String(error)),true);}
    finally{busy=false;get('schedule-save').disabled=false;}
  }
  function enterDeveloper(){
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
      toolbar.append(action(doc,'设置定时',()=>{managerReturn='list';show('form');
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
      await client.request('uninstallTask',{taskId:row.taskId,version:row.version,
        expectedGeneration:row.generation??null,expectedInstallationId:row.installationId??null});
      get('schedule-uninstall-confirm').hidden=true;confirmUninstall=null;
      await refresh();message('已卸载固定版本；关联计划需重新安装授权');
    }catch(error){message(error?.message||String(error),true);}finally{busy=false;}
  }
  async function open(view='list'){
    taskWorkbench.navigate('tasks');showPanel();show(view);
    try{await refresh();}catch(error){message('读取计划失败：'+(error?.message||String(error)),true);}
  }
  function stop(){
    if(!selectedFire||host.currentRun!==selectedFire)return;
    void host.stop({runId:selectedFire,controller:true}).catch(error=>message(error.message,true));
  }
  bind('schedule-open','click',()=>void open());
  bind('schedule-stop','click',stop);
  bind('schedule-back','click',()=>hidePanel());
  bind('schedule-create','click',()=>{reset();show('form');get('schedule-title').focus();});
  bind('schedule-cancel','click',()=>show('list'));
  bind('schedule-form','submit',save);
  bind('schedule-task-select','change',showTaskVersion);
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
    bind(id,'change',id==='schedule-kind'?switchKind:preview);
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
      showPanel();show('form');get('schedule-task-select').value=taskId;
      showTaskVersion();message('已安装验证过的任务，可继续设置时间和目标。');
    }catch(error){message('任务安装后刷新失败：'+error.message,true);}
  }
  return {open,hidePanel,refresh,setRun(runId){
    selectedFire=runId;
    get('schedule-stop').hidden=!runId;
  },onInstalled:onInstalledTask,get shown(){return shown;},dispose(){
    disposed=true;for(const remove of listeners)remove();unsubscribe?.();installedUpdates?.();hidePanel();
  }};
}
