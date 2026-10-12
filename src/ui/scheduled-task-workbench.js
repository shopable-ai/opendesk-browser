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
export function createScheduledTaskWorkbench({client,host,taskWorkbench,api=globalThis.chrome,
  document:doc=globalThis.document,onClose=()=>{},onOpen=()=>{}}){
  const get=id=>doc.getElementById(id),listeners=[];
  const bind=(id,event,fn)=>{
    const node=get(id);if(!node)throw new Error('Missing schedule UI: '+id);
    node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));
  };
  let disposed=false,shown=false,busy=false,editing=null,managerReturn='list';
  let pendingCreate=false,pendingTask=null,confirmUninstall=null,allPlans=[],catalog=[],installed=[];
  let selectedFire=null,lastRefresh=0,activeView='list',runnerFocusId=null;
  let permissionSeq=0,awaitingSave=null,editRevision=0;
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
  }
  const message=(value,error=false)=>{
    const el=get('schedule-message');text(el,value);el.dataset.state=error?'error':'ready';
  };
  const isRunner=()=>doc.documentElement?.dataset?.opendeskSurface==='scheduled-runner';
  const views={runner:get('schedule-runner-view'),list:get('schedule-list-view'),
    form:get('schedule-form'),manager:get('schedule-task-manager')};
  const show=view=>{
    activeView=view;
    for(const [key,node] of Object.entries(views))node.hidden=key!==view;
    // The separately visible runner is already a Host, not a second Side Panel.
    text(get('schedule-open-runner'),isRunner()?'再开运行页 ↗':'打开运行页 ↗');
    get('schedule-back').hidden=isRunner()&&view==='runner';
    get('schedule-back').setAttribute('aria-label',isRunner()?'返回运行概览':'返回我的任务');
    text(get('schedule-panel-title'),view==='runner'?'OpenDesk 运行页 · 运行概览':
      view==='manager'?'任务管理':view==='form'?
      (editing?'编辑定时计划':'创建定时计划'):'定时计划');
    text(get('schedule-panel-subtitle'),view==='runner'?'已验证任务 · 可见运行页':
      '安排已验证安装的自动化任务');
  };
  const showPanel=()=>{
    shown=true;get('scheduled-panel').hidden=false;
    taskWorkbench.setScheduledSurfaceActive?.(true);
    doc.querySelector('#workbench-tasks .tasks-surface').hidden=true;
    doc.querySelector('#workbench-tasks .cloud-my-entry').hidden=true;
    onOpen();
  };
  function hidePanel(){
    shown=false;get('scheduled-panel').hidden=true;
    taskWorkbench.setScheduledSurfaceActive?.(false);
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
    populateChoices();renderPlans();renderManager();renderRunner();
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
  async function showTaskVersion(){
    const seq=++permissionSeq;
    const row=eligible().find(r=>r.taskId===get('schedule-task-select').value);
    const origins=candidate(row)?.manifest?.siteOrigins||[];
    if(!row){
      text(get('schedule-task-version'),'请选择已安装、已验证且已启用的 Controller 任务');
      return;
    }
    const prefix=`固定版本 v${row.version} · 网站范围：${origins.join('，')||'不可用'}`;
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
    const upcoming=plans.find(p=>!p.paused&&Number.isFinite(p.nextDueAt));
    const focus=upcoming||plans.find(p=>!p.paused)||plans[0];
    runnerFocusId=focus?.scheduleId??null;
    const active=allPlans.flatMap(plan=>(plan.history||[])
      .filter(f=>['READY','WAITING_HOST','WAITING_TARGET','WAITING_SLOT','ADMITTED','RUNNING','SETTLING'].includes(f.status))
      .map(f=>({plan,fire:f}))).sort((a,b)=>b.fire.scheduledAt-a.fire.scheduledAt)[0];
    const latest=allPlans.flatMap(plan=>(plan.history||[])
      .filter(f=>terminal.has(f.status)).map(f=>({plan,fire:f})))
      .sort((a,b)=>b.fire.scheduledAt-a.fire.scheduledAt)[0];
    text(get('schedule-runner-next'),upcoming?upcoming.title:'暂无待执行计划');
    text(get('schedule-runner-next-detail'),upcoming?
      frequencyLabel(upcoming)+' · '+describeTime(upcoming.nextDueAt,upcoming.timezone):'可从计划管理创建或恢复计划');
    text(get('schedule-runner-current'),selectedFire?'正在执行任务':
      active?active.plan.title:'暂无任务运行');
    text(get('schedule-runner-current-detail'),selectedFire?'任务已进入原始 Controller 执行槽':
      active?scheduleStatus(active.fire.status)+' · '+describeTime(active.fire.scheduledAt,active.plan.timezone):
      '任务到期后将在此页检查执行条件');
    text(get('schedule-runner-result'),latest?scheduleStatus(latest.fire.status):'尚无执行结果');
    text(get('schedule-runner-result-detail'),latest?
      latest.plan.title+' · '+describeTime(latest.fire.scheduledAt,latest.plan.timezone):'运行历史可在计划管理中查看');
    text(get('schedule-runner-focus-title'),focus?focus.title:'还没有定时计划');
    text(get('schedule-runner-focus-detail'),focus?
      frequencyLabel(focus)+' · '+(focus.paused?'已暂停':describeTime(focus.nextDueAt,focus.timezone)):'创建一个已验证并安装的任务计划');
    text(get('schedule-runner-explain'),focus?.needsAttention?
      '任务安装或网站访问权限发生变化，需处理后才能继续。':
      focus?.paused?'此计划已暂停，不会在到期时触发。':
      '计划到期后校验目标网页、固定任务身份和执行槽；浏览器关闭期间不执行。');
    const toggle=get('schedule-runner-toggle');
    toggle.disabled=!focus||Boolean(focus.needsAttention&&!focus.paused);
    text(toggle,focus?.paused?'恢复计划':'暂停计划');
  }
  function renderPlans(){
    const parent=get('schedule-plan-list');parent.replaceChildren();
    if(!allPlans.length){parent.append(element(doc,'p','hint','尚无定时计划。点击「新建计划」安排第一个已验证任务。'));return;}
    for(const plan of allPlans.slice().sort((a,b)=>(a.nextDueAt??Infinity)-(b.nextDueAt??Infinity))){
      const card=element(doc,'article','schedule-card od-surface');
      card.dataset.scheduleId=plan.scheduleId;
      const head=element(doc,'div','schedule-card-head od-toolbar');
      head.append(element(doc,'strong',null,plan.title),element(doc,'span','schedule-state',
        plan.paused?'已暂停':plan.needsAttention||plan.history?.[0]?.status==='NEEDS_ATTENTION'?'需要处理':'已启用'));
      const catalogEntry=catalog.find(item=>item.taskId===plan.taskId&&item.version===plan.version);
      const info=element(doc,'p','hint',`${catalogEntry?.manifest?.title||plan.taskId} · v${plan.version} · ${frequencyLabel(plan)} · ${plan.timezone}`);
      const next=element(doc,'p','hint','下次：'+describeTime(plan.nextDueAt,plan.timezone));
      if(plan.needsAttention)next.append(element(doc,'span','schedule-warning',' · 任务已停用、版本改变或网站权限不足，需重新授权'));
      const last=plan.history?.[0];
      const history=element(doc,'details','schedule-history');
      history.append(element(doc,'summary',null,
        '运行记录'+(last?` · 最近：${scheduleStatus(last.status)} · ${describeTime(last.scheduledAt,plan.timezone)}`:' · 暂无')));
      const historyList=element(doc,'div','od-stack');
      for(const fire of plan.history||[]){
        const row=element(doc,'div','schedule-history-row',
          `${describeTime(fire.scheduledAt,plan.timezone)} · ${scheduleStatus(fire.status)}`);
        if(fire.runId){
          const advanced=element(doc,'details','schedule-run-details');
          advanced.append(element(doc,'summary',null,'技术详情'));
          advanced.append(element(doc,'small',null,
            `RunId：${fire.runId} · ResultId：${fire.resultId??'未生成'} · 资源：${fire.retirementState==='released'?'已释放':'等待释放'}`));
          row.append(advanced);
        }
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
      if(next===null)throw Error('该时间没有后续触发，请选择未来时间');
      text(get('schedule-next'),'预计下次：'+describeTime(next,zone));
      if(!touched.has('time'))fieldError('time','');
    }catch(error){
      text(get('schedule-next'),'填写有效时区和时间后显示下一次触发');
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
  function reset(){
    editing=null;pendingTask=null;clearConfirmation();touched.clear();
    for(const name of Object.keys(formFields))fieldError(name,'');
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
    clearConfirmation();touched.clear();
    for(const name of Object.keys(formFields))fieldError(name,'');
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
    clearConfirmation();
    const revision=editRevision;
    const local=validateLocal(true);
    if(!local){message('请先修正上方标记的字段',true);return;}
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
        `${input.title}\n任务：${resolved.manifest.title||resolved.taskId} · v${resolved.version}\n网址：${input.targetUrl}\n时间：${timing}\n状态：${input.paused?'先暂停':'启用'}`);
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
      await client.request('saveSchedule',pending.input);
      clearConfirmation();await refresh();editing=null;show(isRunner()?'runner':'list');
      message('定时计划已保存，Chrome Alarms 已按照持久计划对账');
    }catch(error){message('无法保存计划：'+(error?.message||String(error)),true);}
    finally{busy=false;get('schedule-confirm-yes').disabled=false;}
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
  bind('schedule-back','click',()=>isRunner()?show('runner'):hidePanel());
  bind('schedule-runner-manage','click',()=>show('list'));
  bind('schedule-runner-refresh','click',()=>void refresh().catch(error=>message(error.message,true)));
  bind('schedule-runner-toggle','click',()=>{
    const plan=allPlans.find(p=>p.scheduleId===runnerFocusId);
    if(plan)void change(plan,plan.paused?'resume':'pause');
  });
  bind('schedule-runner-history','click',()=>{
    show('list');
    const card=[...get('schedule-plan-list').querySelectorAll('.schedule-card')]
      .find(node=>node.dataset.scheduleId===runnerFocusId);
    const details=card?.querySelector('.schedule-history');
    if(details){details.open=true;details.querySelector('summary')?.focus();card.scrollIntoView?.({block:'nearest'});}
  });
  bind('schedule-create','click',()=>{reset();show('form');get('schedule-title').focus();});
  bind('schedule-cancel','click',()=>{clearConfirmation();show(isRunner()?'runner':'list');});
  bind('schedule-confirm-yes','click',()=>void confirmSave());
  bind('schedule-confirm-no','click',()=>{clearConfirmation();get('schedule-save').focus();});
  for(const [id,name] of [
    ['schedule-title','title'],['schedule-task-select','task'],['schedule-target','target'],
    ['schedule-params','params'],['schedule-kind','time'],['schedule-timezone','time'],
    ['schedule-once','time'],['schedule-clock','time'],['schedule-minutes','time'],
    ['schedule-weekdays-field','time'],['schedule-deadline','time']]){
    bind(id,'input',()=>{
      touched.add(name);editRevision++;clearConfirmation();validateLocal(false);
      if(name==='time')preview();
    });
  }
  for(const id of ['schedule-open-target','schedule-misfire','schedule-paused'])
    bind(id,'change',()=>{editRevision++;clearConfirmation();});
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
    taskWorkbench.setScheduledRunOwner?.(runId);
    get('schedule-stop').hidden=!runId;
    renderRunner();
  },onInstalled:onInstalledTask,get shown(){return shown;},dispose(){
    disposed=true;for(const remove of listeners)remove();unsubscribe?.();installedUpdates?.();hidePanel();
  }};
}
