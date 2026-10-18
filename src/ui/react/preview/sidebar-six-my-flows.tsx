import * as React from 'react';
import {createPortal} from 'react-dom';
import {presentSchedulePlan,scheduleFireLabel,formatScheduleTime,schedulePlanIconPath,
  schedulePlanStatusLabel,schedulePlanNeedsNotice} from '../../schedule-plan-presentation.js';

// Offline-only UI state. The installed TaskWorkbench and scheduler remain
// the only authorities for task identity, drafts, installation and execution.
const get=id=>{
  const node=document.getElementById(id);
  if(!node)throw Error('E_MY_PREVIEW_NODE:'+id);
  return node;
};
const cards=get('task-catalog-cards'),reader=get('task-catalog-detail');
const list=get('schedule-plan-list'),detail=get('schedule-detail-view');
const manager=get('schedule-manager-list');
for(const node of [cards,reader,list,detail,manager])node.replaceChildren();
const previewBase=Date.parse('2026-10-17T00:00:00Z'); // Fixed UI fixture clock, never a live scheduler.
const previewFire=(id,status,when=previewBase)=>({
  fireId:'preview-fire-'+id,status,scheduledAt:when});
const fixture=(id,title,kind,details={})=>({
  id,title,kind,triggerKind:kind,triggerSpec:
    kind==='weekly'?{days:[5],hour:18,minute:0}:
    kind==='interval'?{everyMinutes:30}:
    kind==='once'?{at:previewBase}:
    {hour:9,minute:0},
  clock:kind==='weekly'?'18:00':'09:00',weekdays:['5'],minutes:30,
  once:'2026-10-18T09:00',timezone:'Asia/Tokyo',
  target:'https://example.invalid/',paramsText:'{}',
  paused:false,needsAttention:false,nextDueAt:null,history:[],
  ...details
});
const fixtures=[
  fixture('preview-1','每日网页整理','daily',{
    nextDueAt:Date.parse('2026-10-18T00:00:00Z'),
    history:[previewFire('daily','SUCCESS')]}),
  fixture('preview-2','每周报告','weekly',{
    paused:true,previewNextDueAt:Date.parse('2026-10-23T09:00:00Z'),
    history:[previewFire('weekly','SUCCESS')]}),
  fixture('preview-3','进行中的资料同步','interval',{
    nextDueAt:Date.parse('2026-10-18T00:30:00Z'),
    history:[previewFire('active','RUNNING')]}),
  fixture('preview-4','一次性资料归档','once',{
    nextDueAt:null,once:'2026-10-15T20:00',
    history:[previewFire('complete','SUCCESS',Date.parse('2026-10-15T11:00:00Z'))]}),
  fixture('preview-5','失败后继续按计划执行','daily',{
    nextDueAt:Date.parse('2026-10-18T00:00:00Z'),
    history:[previewFire('failed','FAILED')]}),
  fixture('preview-6','需要处理的网站权限','weekly',{
    needsAttention:true,history:[previewFire('attention','NEEDS_ATTENTION')]}),
  fixture('preview-7','未知结果待人工核对','once',{
    history:[previewFire('unknown','UNKNOWN')]}),
  fixture('preview-8','已错过的一次性计划','once',{
    history:[previewFire('missed','MISSED')]}),
  fixture('preview-9','等待运行条件','daily',{
    nextDueAt:Date.parse('2026-10-18T00:00:00Z'),
    history:[previewFire('waiting','WAITING_HOST')]}),
  fixture('preview-10','正在核对结果','once',{
    history:[previewFire('settling','SETTLING')]})
];
const seed=fixtures[0];
const ruleName=k=>({once:'执行一次',daily:'每天',weekly:'每周',interval:'按间隔'})[k]||k;
const previewDeviceZone=()=>{
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
  catch{return 'UTC';}
};
export function PreviewMyFlows({tab,mode,onMode,onOpenDevelop,rows,search,onSearch,filter,onFilter,
  selectedTask='',manageMode=false,onManageMode=()=>{},onTaskAction=()=>{},density='many'}){
  const [showSearch,setShowSearch]=React.useState(false);
  const [addOpen,setAddOpen]=React.useState(false);
  const [addStatus,setAddStatus]=React.useState('');
  const [removalReview,setRemovalReview]=React.useState('');
  const [catalogSearch,setCatalogSearch]=React.useState('');
  const [catalogSelected,setCatalogSelected]=React.useState('preview-task');
  const [importReview,setImportReview]=React.useState('');
  const [view,setView]=React.useState('list');
  const [formOrigin,setFormOrigin]=React.useState('list');
  const [plans,setPlans]=React.useState(fixtures);
  const [selectedId,setSelectedId]=React.useState(seed.id);
  const [editingId,setEditingId]=React.useState('');
  const [pending,setPending]=React.useState(null);
  const [dirtyConfirm,setDirtyConfirm]=React.useState(false);
  const [removeConfirm,setRemoveConfirm]=React.useState(false);
  const [rule,setRule]=React.useState('once');
  const [managerQuery,setManagerQuery]=React.useState('');
  const [managerFilter,setManagerFilter]=React.useState('all');
  const [managerRemoving,setManagerRemoving]=React.useState('');
  const [managerOrigin,setManagerOrigin]=React.useState('form');
  const formBaseline=React.useRef('');
  const previousPlanView=React.useRef('list');
  const planListScroll=React.useRef(0);
  const planEditorScroll=React.useRef(0);
  const [feedback,setFeedback]=React.useState('');
  const selected=plans.find(p=>p.id===selectedId);
  const selectedPresentation=selected?presentSchedulePlan(selected,selected.history):null;
  const visiblePlans=density==='empty'?[]:density==='single'?plans.slice(0,1):plans;
  const managerRows=rows.filter(p=>(managerFilter==='all'||
    p.enabled===(managerFilter==='enabled'))&&
    [p.title,p.taskId,p.description].join(' ').toLocaleLowerCase().includes(managerQuery.trim().toLocaleLowerCase()));
  const found=rows.filter(p=>!catalogSearch||
    [p.title,p.description].join(' ').toLocaleLowerCase().includes(catalogSearch.toLocaleLowerCase()));
  const formSignature=()=>JSON.stringify([
    ...['schedule-title','schedule-target','schedule-params','schedule-kind',
      'schedule-timezone','schedule-once','schedule-clock','schedule-minutes'].map(id=>get(id).value),
    ...[...get('schedule-weekdays-field').querySelectorAll('input')].map(input=>input.checked),
    get('schedule-paused').checked
  ]);
  const showForm=plan=>{
    // A prior list operation must not leave an unrelated notice in the form.
    setFeedback('');
    setFormOrigin(view==='detail'?'detail':view==='manager'?'manager':'list');
    setEditingId(plan?.id||'');setPending(null);setDirtyConfirm(false);
    get('schedule-title').value=plan?.title||'';
    get('schedule-target').value=plan?.target||'https://example.invalid/';
    get('schedule-params').value=plan?.paramsText||'{}';
    get('schedule-timezone').value=plan?.timezone||previewDeviceZone();
    get('schedule-once').value=plan?.once||'';
    get('schedule-clock').value=plan?.clock||'09:00';
    get('schedule-minutes').value=String(plan?.minutes||60);
    get('schedule-paused').checked=Boolean(plan?.paused);
    for(const input of get('schedule-weekdays-field').querySelectorAll('input'))
      input.checked=(plan?.weekdays||['1']).includes(input.value);
    get('schedule-kind').value=plan?.kind||'once';
    formBaseline.current=formSignature();
    setRule(plan?.kind||'once');setView('form');
  };
  const back=()=>{
    if(view==='manager'){setManagerRemoving('');setView(managerOrigin);return;}
    if(view==='form'){
      if(formSignature()!==formBaseline.current){setDirtyConfirm(true);return;}
      setView(formOrigin);setPending(null);return;
    }
    if(view!=='list'){setView('list');return;}
    onMode('list');
  };
  React.useLayoutEffect(()=>{
    get('workbench-discover').hidden=tab!=='tasks'||mode!=='catalog';
    get('workbench-tasks').querySelector('.tasks-surface').hidden=mode!=='list';
    get('scheduled-panel').hidden=mode!=='schedule';
    get('task-search-panel').hidden=!showSearch;
    get('task-add-menu').hidden=!addOpen||mode!=='list';
    get('task-open-catalog').setAttribute('aria-expanded',String(addOpen&&mode==='list'));
    get('task-manage-toggle').setAttribute('aria-pressed',String(manageMode));
    const current=rows.find(p=>p.taskId===selectedTask);
    if(manageMode)get('task-tools').open=true;
    for(const id of ['task-toggle','task-uninstall','task-fork-draft'])
      get(id).disabled=!current;
    get('task-toggle').title=current?.enabled?'停用任务':'启用任务';
    get('task-toggle').setAttribute('aria-label',get('task-toggle').title);
    for(const icon of get('task-toggle').children)
      if(icon.dataset?.taskToggleIcon)
        icon.hidden=icon.dataset.taskToggleIcon!==(current?.enabled?'pause':'play');
    get('task-uninstall-confirm').hidden=removalReview!==selectedTask;
    get('task-uninstall-summary').textContent=current
      ?'确认卸载「'+current.title+'」？历史结果仍可能保留。'
      :'确认卸载此任务？';
    get('task-add-status').textContent=addStatus;
    get('task-search-toggle').setAttribute('aria-expanded',String(showSearch));
    get('local-discover-count').textContent='显示 '+rows.length+' 项 · 仅预览';
    for(const key of ['all','current','disabled'])
      get('local-filter-'+key).setAttribute('aria-pressed',String(filter===key));
    for(const [name,id] of [['list','schedule-list-view'],['detail','schedule-detail-view'],
      ['form','schedule-form'],['manager','schedule-task-manager']])
      get(id).hidden=name!==view;
    if(mode==='schedule'&&view!==previousPlanView.current){
      const scroll=get('workspace-content'),previous=previousPlanView.current;
      if(previous==='list')planListScroll.current=scroll.scrollTop;
      if(previous==='form'&&view==='manager')planEditorScroll.current=scroll.scrollTop;
      scroll.scrollTop=view==='list'?planListScroll.current:
        view==='form'&&previous==='manager'?planEditorScroll.current:0;
      previousPlanView.current=view;
      if(view==='form')(previous==='manager'?get('schedule-manage-tasks'):get('schedule-title'))
        .focus({preventScroll:true});
      if(view==='manager')get('schedule-manager-search').focus({preventScroll:true});
      if(view==='detail'&&previous==='manager')
        get('schedule-detail-view').querySelector('[data-schedule-open-manager]')?.focus({preventScroll:true});
      if(view==='detail'&&previous==='form')get('schedule-detail-edit').focus({preventScroll:true});
    }
    get('schedule-cancel').textContent=formOrigin==='detail'?'返回计划详情':
      formOrigin==='manager'?'返回任务管理':'返回定时计划';
    get('schedule-manager-count').textContent='显示 '+managerRows.length+' / '+rows.length+' 个已安装任务 · 仅预览';
    get('schedule-uninstall-confirm').hidden=!managerRemoving;
    if(managerRemoving)requestAnimationFrame(()=>{
      const review=get('schedule-uninstall-confirm');
      review.scrollIntoView?.({block:'nearest'});
      review.querySelector('button')?.focus({preventScroll:true});
    });
    get('schedule-uninstall-label').textContent=managerRemoving?
      '确认从预览内存移除「'+(rows.find(p=>p.taskId===managerRemoving)?.title||managerRemoving)+
      '」？正式安装和运行记录不会改变。':'';
    get('schedule-panel-title').textContent=view==='form'?(editingId?'编辑定时计划':'创建定时计划'):
      view==='detail'?(selected?.title||'计划详情'):view==='manager'?'任务管理':'定时计划';
    get('schedule-create').hidden=view!=='list';
    get('schedule-open-manager').hidden=view!=='list';
    get('schedule-manager-create').hidden=view!=='manager';
    get('schedule-open-runner').hidden=view!=='list';
    get('schedule-detail-edit').hidden=view!=='detail';
    get('schedule-detail-delete').hidden=view!=='detail';
    get('schedule-manager-back').hidden=true; // One authoritative back button in Header.
    get('schedule-save-confirm').hidden=!pending;
    get('schedule-discard-confirm').hidden=!dirtyConfirm;
    const arranged=visiblePlans.filter(p=>!p.paused&&!p.needsAttention&&Number.isFinite(p.nextDueAt)).length;
    const pausedCount=visiblePlans.filter(p=>p.paused).length;
    const activeCount=visiblePlans.filter(p=>(p.history||[]).some(fire=>
      ['ADMITTED','RUNNING'].includes(fire.status))).length;
    get('schedule-list-summary').hidden=view!=='list'||visiblePlans.length===0;
    get('schedule-list-summary').textContent=
      '共 '+visiblePlans.length+' 个计划 · '+arranged+' 个已安排 · '+
      pausedCount+' 个已暂停 · '+activeCount+' 个运行中';
    get('schedule-host-status').hidden=true; // Preview banner already names the missing Host.
    get('schedule-message').textContent=feedback||'';
    get('schedule-save-summary').textContent=pending?
      pending.title+' / '+pending.target+' / '+ruleName(pending.kind):'';
    get('schedule-once-field').hidden=rule!=='once';
    get('schedule-clock-field').hidden=!['daily','weekly'].includes(rule);
    get('schedule-weekdays-field').hidden=rule!=='weekly';
    get('schedule-interval-field').hidden=rule!=='interval';
    get('schedule-next-time').textContent='请核对执行规则与时区';
    get('task-catalog-count').textContent=found.length+' 个 · 仅预览';
    get('task-catalog-status').textContent=importReview||
      '仅预览 · 仅展示正式目录 UI，安装须核对任务与授权';
    get('task-install').disabled=true;
  },[tab,mode,rows,selectedTask,manageMode,removalReview,managerRows.length,managerRemoving,filter,showSearch,addOpen,addStatus,editingId,view,
    plans,density,pending,dirtyConfirm,rule,feedback,found.length,importReview,managerOrigin]);
  React.useEffect(()=>{
    const zone=get('schedule-timezone');
    if(zone.options.length<2){
      const examples=[['Asia/Tokyo','日本 · 东京 · UTC+09:00'],
        ['Asia/Shanghai','中国 · 北京 / 上海 · UTC+08:00'],
        ['Europe/London','英国 · 伦敦（当前偏移由正式环境计算）'],
        ['America/New_York','美国 · 纽约（当前偏移由正式环境计算）'],
        ['UTC','协调世界时 · UTC+00:00']];
      const device=previewDeviceZone();
      if(!examples.some(([value])=>value===device))
        examples.unshift([device,'设备时区 · '+device]);
      zone.replaceChildren(...examples.map(([value,label])=>new Option(label,value)));
      zone.value=device;
    }
    const taskSelect=get('schedule-task-select');
    if(taskSelect.options.length<2)
      taskSelect.replaceChildren(new Option('演示任务','preview-task'),
        new Option('已停用的演示任务','preview-off'));
    const off=[];
    const bind=(id,event,fn)=>{
      const node=get(id);node.addEventListener(event,fn);
      off.push(()=>node.removeEventListener(event,fn));
    };
    bind('task-search-toggle','click',()=>setShowSearch(v=>!v));
    bind('task-manage-toggle','click',()=>onManageMode(!manageMode));
    bind('task-refresh','click',()=>onTaskAction('refresh',selectedTask));
    bind('task-fork-draft','click',()=>onTaskAction('fork',selectedTask));
    bind('task-toggle','click',()=>onTaskAction('toggle',selectedTask));
    bind('task-uninstall','click',()=>setRemovalReview(selectedTask));
    bind('task-uninstall-cancel','click',()=>{
      setRemovalReview('');get('task-uninstall').focus({preventScroll:true});
    });
    bind('task-uninstall-yes','click',()=>{
      if(removalReview===selectedTask){onTaskAction('uninstall',selectedTask);setRemovalReview('');}
    });
    bind('open-catalog','click',()=>onMode('catalog'));
    bind('task-catalog-back','click',()=>onMode('list'));
    bind('local-discover-search','input',e=>onSearch(e.currentTarget.value));
    for(const key of ['all','current','disabled'])
      bind('local-filter-'+key,'click',()=>onFilter(key));
    bind('task-search-panel','keydown',e=>{
      if(e.key==='Escape'&&!e.isComposing){setShowSearch(false);get('task-search-toggle').focus();}
    });
    bind('task-open-catalog','click',()=>setAddOpen(open=>!open));
    bind('task-add-close','click',()=>{setAddOpen(false);get('task-open-catalog').focus();});
    bind('task-add-import','click',()=>get('task-add-file').click());
    bind('task-add-file','change',async e=>{
      const input=e.currentTarget,file=input.files?.[0];
      if(!file)return;
      try{
        if(file.size>1024*1024){setAddStatus('仅预览 · 文件超过预览大小限制');return;}
        if(/\.json$/i.test(file.name)){
          const value=JSON.parse(await file.text());
          if(/\.opendesk-tool\.json$/i.test(file.name)||/^opendesk\.sidebar-tool\./.test(value?.format||''))
            setAddStatus('仅预览 · 这是扩展工具包，请到「扩展」导入；未安装。');
          else if(value?.format==='opendesk.task-package.v1')
            setAddStatus('仅预览 · 任务包已选择；须在正式目录核验固定源码及网站权限。');
          else if(['opendesk.program-draft.v1','opendesk.program-draft.v2'].includes(value?.format))
            setAddStatus('仅预览 · 程序草稿已选择；正式导入后进入开发编辑器，不会运行。');
          else setAddStatus('仅预览 · 不是受支持的任务包或程序草稿 JSON；未导入。');
        }else if(/\.js$/i.test(file.name))
          setAddStatus('仅预览 · JavaScript 草稿已选择；未运行');
        else setAddStatus('仅预览 · 仅支持 .json 或 .js；未导入。');
      }catch{setAddStatus('仅预览 · 文件解析失败，未导入');}
      finally{input.value='';}
    });
    bind('task-add-catalog','click',()=>{setAddOpen(false);onMode('catalog');});
    bind('task-add-develop','click',()=>{setAddOpen(false);onOpenDevelop();});
    bind('task-search','input',e=>setCatalogSearch(e.currentTarget.value));
    bind('task-package-file','change',async e=>{
      const file=e.currentTarget.files?.[0];
      if(!file){setImportReview('');return;}
      if(file.size>1024*1024){setImportReview('仅预览 · 文件超过本预览 1 MiB 限制');return;}
      try{
        if(/\.json$/i.test(file.name)){
          const obj=JSON.parse(await file.text());
          setImportReview('仅预览 · '+file.name+
            (obj?.format==='opendesk.task-package.v1'?' · 待验证任务包':
              ['opendesk.program-draft.v1','opendesk.program-draft.v2'].includes(obj?.format)?' · 程序草稿':
                /^opendesk\.sidebar-tool\./.test(obj?.format||'')?' · 应由扩展中心导入':
                  ' · 格式不受支持')+'；没有 Host 安装。');
        }else setImportReview('仅预览 · 源码草稿已选择，未运行');
      }catch{setImportReview('仅预览 · JSON 无法解析；未安装');}
    });
    bind('schedule-open','click',()=>{setView('list');onMode('schedule');});
    bind('schedule-back','click',back);
    bind('schedule-create','click',()=>showForm(null));
    bind('schedule-open-manager','click',()=>{setManagerOrigin('list');setView('manager');});
    bind('schedule-detail-edit','click',()=>{if(selected)showForm(selected);});
    bind('schedule-detail-delete','click',()=>{
      if(selected&&view==='detail'){
        setRemoveConfirm(true);
        requestAnimationFrame(()=>get('schedule-detail-view')
          .querySelector('.schedule-delete-confirm button')?.focus({preventScroll:true}));
      }
    });
    bind('schedule-cancel','click',back);
    bind('schedule-discard-yes','click',()=>{setDirtyConfirm(false);setPending(null);setView(formOrigin);});
    bind('schedule-discard-no','click',()=>setDirtyConfirm(false));
    bind('schedule-kind','change',e=>setRule(e.currentTarget.value));
    bind('schedule-timezone','change',()=>{
      zone.title='IANA：'+zone.value+' · 仅预览';
    });
    bind('schedule-manage-tasks','click',()=>{setManagerOrigin('form');setView('manager');});
    bind('schedule-manager-back','click',()=>setView(managerOrigin));
    bind('schedule-manager-search','input',e=>setManagerQuery(e.currentTarget.value));
    bind('schedule-manager-filter','change',e=>setManagerFilter(e.currentTarget.value));
    bind('schedule-uninstall-no','click',()=>{
      const taskId=managerRemoving;setManagerRemoving('');
      get('schedule-manager-list').querySelector('[data-manager-more="'+taskId+'"]')
        ?.focus({preventScroll:true});
    });
    bind('schedule-uninstall-yes','click',()=>{
      if(!managerRemoving)return;
      onTaskAction('uninstall',managerRemoving);
      setManagerRemoving('');
      setFeedback('仅从预览内存列表移除；未请求真实卸载，也未变更浏览器权限。');
      get('schedule-manager-search').focus({preventScroll:true});
    });
    bind('scheduled-panel','keydown',event=>{
      if(event.key!=='Escape'||event.defaultPrevented)return;
      const menu=get('schedule-manager-list').querySelector('.schedule-manager-menu[open]');
      if(menu){event.preventDefault();menu.open=false;
        menu.querySelector('summary')?.focus({preventScroll:true});
      }else if(managerRemoving){event.preventDefault();get('schedule-uninstall-no').click();
      }else if(removeConfirm){event.preventDefault();setRemoveConfirm(false);
        get('schedule-detail-delete').focus({preventScroll:true});}
    });
    const dismissMenus=event=>{
      for(const menu of get('schedule-manager-list').querySelectorAll('.schedule-manager-menu[open]'))
        if(!menu.contains(event.target))menu.open=false;
    };
    document.addEventListener('pointerdown',dismissMenus);
    off.push(()=>document.removeEventListener('pointerdown',dismissMenus));
    bind('schedule-manager-create','click',onOpenDevelop);
    bind('schedule-new-script','click',onOpenDevelop);
    bind('schedule-task-empty-create','click',onOpenDevelop);
    bind('schedule-open-runner','click',()=>setFeedback('运行页需要已安装的扩展。'));
    bind('schedule-form','submit',e=>{
      e.preventDefault();
      const title=get('schedule-title').value.trim(),target=get('schedule-target').value.trim();
      if(!title||!/^https?:\/\//.test(target)){
        setFeedback('请输入计划名称和有效的 HTTP(S) 网页地址');return;
      }
      const paramsText=get('schedule-params').value.trim()||'{}';
      try{
        const params=JSON.parse(paramsText);
        if(!params||Array.isArray(params)||typeof params!=='object')throw Error('params');
      }catch{setFeedback('任务参数必须是合法的 JSON 对象');return;}
      const kind=get('schedule-kind').value;
      const weekdays=[...get('schedule-weekdays-field').querySelectorAll('input:checked')]
        .map(input=>input.value);
      const minutes=Number(get('schedule-minutes').value);
      if(kind==='weekly'&&!weekdays.length){
        setFeedback('每周至少选择一天');return;
      }
      if(kind==='interval'&&(!Number.isInteger(minutes)||minutes<1||minutes>10080)){
        setFeedback('执行间隔必须是 1–10080 分钟');return;
      }
      setPending({title,target,kind,paramsText,taskId:get('schedule-task-select').value,
        timezone:get('schedule-timezone').value,
        once:get('schedule-once').value,clock:get('schedule-clock').value,
        weekdays,minutes,paused:get('schedule-paused').checked});
      setFeedback('请检查计划信息，再确认保存。');
    });
    bind('schedule-confirm-no','click',()=>setPending(null));
    bind('schedule-confirm-yes','click',()=>{
      if(!pending)return;
      const id=editingId||'preview-'+Date.now().toString(36);
      // The preview has no Scheduler; the edit changes only an in-memory display plan.
      const spec=pending.kind==='once'?{at:Date.parse(pending.once)}:
        pending.kind==='interval'?{everyMinutes:pending.minutes}:
        pending.kind==='weekly'?{days:pending.weekdays.map(Number),
          hour:Number(pending.clock.split(':')[0]),minute:Number(pending.clock.split(':')[1])}:
          {hour:Number(pending.clock.split(':')[0]),minute:Number(pending.clock.split(':')[1])};
      setPlans(all=>editingId?all.map(p=>p.id===id?
        {...p,...pending,triggerKind:pending.kind,triggerSpec:spec,
          nextDueAt:pending.paused?null:p.nextDueAt,paused:Boolean(pending.paused)}:p):
        [...all,fixture(id,pending.title,pending.kind,{...pending,
          triggerSpec:spec,paused:Boolean(pending.paused)})]);
      setSelectedId(id);setPending(null);setEditingId('');setView(editingId?formOrigin:'list');
      setFeedback('已更新预览展示；真实计划未修改。');
    });
    return ()=>off.forEach(fn=>fn());
  },[onMode,onOpenDevelop,onSearch,onFilter,onManageMode,onTaskAction,manageMode,
    selectedTask,removalReview,managerRemoving,managerOrigin,selected,editingId,pending,view,removeConfirm,formOrigin]);
  return <>
    {createPortal(found.map(p=><button key={p.taskId} type="button"
      className="catalog-card" aria-pressed={p.taskId===catalogSelected}
      onClick={()=>setCatalogSelected(p.taskId)}>
      <strong>{p.title}</strong><span>{p.description}</span>
    </button>),cards)}
    {createPortal(<div className="od-stack">
      <strong>{rows.find(p=>p.taskId===catalogSelected)?.title||'选择候选'}</strong>
      <p>安装前请核对来源、权限及版本。</p>
    </div>,reader)}
    {createPortal(<>
      {visiblePlans.length===0?<div className="schedule-empty od-stack" role="status">
        <h3 className="od-page-title">尚无定时计划</h3>
        <p className="schedule-empty-hint hint">点击右上角新建，添加第一条计划。</p>
      </div>:visiblePlans.map(p=>{
        const present=presentSchedulePlan(p,p.history);
        const active=(p.history||[]).find(fire=>['ADMITTED','RUNNING'].includes(fire.status));
        const canToggle=p.paused||p.triggerKind!=='once'||Number.isFinite(p.nextDueAt);
        const toggle=()=>{
          if(p.paused&&p.needsAttention)return;
          setPlans(all=>all.map(item=>item.id===p.id?
            {...item,paused:!item.paused,
              nextDueAt:item.paused?(item.previewNextDueAt??item.nextDueAt):null}:item));
          setFeedback('仅演示交互，未修改真实计划。');
        };
        const stopCurrent=()=>{
          if(!active)return;
          // This is explicitly an offline UI fixture, NOT a Host stop receipt.
          setPlans(all=>all.map(item=>item.id===p.id?{...item,
            history:item.history.map(fire=>fire.fireId===active.fireId?
              {...fire,status:'STOPPED'}:fire)}:item));
          setFeedback('仅演示停止按钮；真实执行未受影响。');
          requestAnimationFrame(()=>{
            const card=[...get('schedule-plan-list').querySelectorAll('.schedule-card')]
              .find(row=>row.dataset.scheduleId===p.id);
            card?.querySelector('.schedule-plan-open')?.focus({preventScroll:true});
          });
        };
        return <article key={p.id} className="schedule-card od-surface"
          data-schedule-id={p.id} onClick={event=>{
            if(!event.target.closest('button,a,summary,input,select')){
              setSelectedId(p.id);setRemoveConfirm(false);setView('detail');
            }
          }}>
          <div className="schedule-card-head od-toolbar">
            <div className="schedule-plan-title-row">
              <button type="button" className="od-button od-button--quiet schedule-plan-open"
                onClick={()=>{setSelectedId(p.id);setRemoveConfirm(false);setView('detail');}}>
                {p.title}
              </button>
              <span className="schedule-state schedule-state-icon" data-tone={present.tone}
                role="img" title={schedulePlanStatusLabel(present)}
                aria-label={schedulePlanStatusLabel(present)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={schedulePlanIconPath(present)}/></svg>
              </span>
            </div>
            <div className="schedule-plan-actions od-toolbar" role="group" aria-label="计划快捷操作">
              {active&&<button type="button"
                className="od-icon-button schedule-plan-action schedule-action-stop"
                data-schedule-action="stop" title="停止本次执行"
                aria-label={'停止本次执行「'+p.title+'」'} onClick={stopCurrent}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              </button>}
              {canToggle&&<button type="button" className="od-icon-button schedule-plan-action"
                data-schedule-action="toggle" disabled={Boolean(p.paused&&p.needsAttention)}
                title={p.paused?'恢复计划（下次触发时执行）':'暂停后续计划'}
                aria-label={(p.paused?'恢复计划':'暂停计划')+'「'+p.title+'」'}
                onClick={toggle}>
                {p.paused?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7Z"/></svg>:
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M17 5v14"/></svg>}
              </button>}
              <button type="button" className="od-icon-button schedule-plan-action"
                data-schedule-action="edit"
                title="编辑计划" aria-label={'编辑计划「'+p.title+'」'} onClick={()=>showForm(p)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16 4l4 4-11 11H5v-4L16 4Z"/></svg>
              </button>
            </div>
          </div>
          <p className="schedule-plan-meta schedule-timing-line">
            <span className="schedule-plan-frequency">{present.frequencyText}</span>
            <span className="schedule-timing-separator"> · </span>
            <span className="schedule-next-time">{present.nextText}</span>
          </p>
          {(p.needsAttention||schedulePlanNeedsNotice(present))&&present.recentText&&
            <p className="schedule-recent-result" data-tone={present.recentTone}>
              最近：{present.recentText}</p>}
        </article>;
      })}
    </>,list)}
    {createPortal(selected&&<div className="od-stack schedule-detail-card">
      <section className="schedule-detail-summary od-surface od-surface--padded od-stack">
        <span className="schedule-state" data-tone={selectedPresentation.tone}>
          {selectedPresentation.badge}</span>
        <p className="schedule-next-time">{selectedPresentation.nextText}</p>
        <p className="schedule-plan-frequency">{selectedPresentation.frequencyText}</p>
        <p className="schedule-detail-url hint">目标网页：{selected.target}</p>
        {selectedPresentation.recentText&&<p className="schedule-recent-result"
          data-tone={selectedPresentation.recentTone}>{selectedPresentation.recentText}</p>}
      </section>
      {(selected.paused||selected.triggerKind!=='once'||Number.isFinite(selected.nextDueAt))&&
        <div className="schedule-actions od-toolbar">
          <button type="button" className="od-button od-button--secondary"
            disabled={Boolean(selected.paused&&selected.needsAttention)}
            onClick={()=>{setPlans(all=>all.map(p=>p.id===selected.id?
              {...p,paused:!p.paused,
                nextDueAt:p.paused?(p.previewNextDueAt??p.nextDueAt):null}:p));
              setFeedback('仅演示交互，未修改真实计划。');}}>
            {selected.paused?'恢复计划':'暂停计划'}</button>
        </div>}
      {selected.needsAttention&&<>
        <p className="schedule-status-help">
          固定任务版本或网站权限需要处理。此处仅展示状态，不会自动换绑。</p>
        <button type="button" data-schedule-open-manager className="od-button od-button--secondary"
          onClick={()=>{setManagerOrigin('detail');setView('manager');}}>
          检查已安装任务
        </button>
      </>}
      <details className="schedule-history od-disclosure od-disclosure--flat">
        <summary>运行记录{selected.history?.length?' · 最近 '+selectedPresentation.recentText:' · 暂无'}</summary>
        {(selected.history||[]).map(fire=><div className="schedule-history-row" key={fire.fireId}>
          {scheduleFireLabel(fire.status)} · {formatScheduleTime(fire.scheduledAt,selected.timezone)}
          {fire.status==='UNKNOWN'&&<small>结果待人工核对，不能自动重复执行。</small>}
        </div>)}
      </details>
      <details className="schedule-more od-disclosure od-disclosure--flat">
        <summary>固定版本与时区</summary>
        <p className="hint">v{selected.version||'1.0.0'} · {selected.timezone}</p>
      </details>
      {removeConfirm&&<div className="schedule-delete-confirm od-surface">
        <p>删除将停止此计划后续触发；已有 Run/Result 历史不会自动清除。这里只移除预览内存数据，真实计划不受影响。</p>
        <div className="schedule-actions od-toolbar">
          <button type="button" className="od-button schedule-danger-button"
            onClick={()=>{setPlans(all=>all.filter(p=>p.id!==selected.id));
              setSelectedId('');setView('list');setRemoveConfirm(false);
              setFeedback('仅演示交互，未修改真实计划。');}}>确认删除演示计划</button>
          <button type="button" className="od-button od-button--secondary"
            onClick={()=>{setRemoveConfirm(false);get('schedule-detail-delete').focus({preventScroll:true});}}>取消</button>
        </div>
      </div>}
    </div>,detail)}
    {createPortal(<>
      {managerRows.length===0?<p className="task-search-empty" role="status">
        {rows.length?'没有符合条件的任务，可更改搜索或筛选。':'暂无已安装任务，请先到开发页创建并安装。'}
      </p>:managerRows.map(p=><article key={p.taskId}
        className="schedule-manager-card od-surface" data-manager-task-id={p.taskId}>
        <div className="schedule-manager-card-head">
          <div className="schedule-manager-identity">
            <div className="schedule-manager-title-line">
              <strong>{p.title}</strong>
              <span className="schedule-manager-state schedule-state-icon"
                data-state={p.enabled?'enabled':'disabled'} role="img"
                title={p.enabled?'已启用':'已停用'} aria-label={p.enabled?'已启用':'已停用'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path
                  d={p.enabled?'M4 12l5 5L20 6':'M8 5v14M16 5v14'}/></svg>
              </span>
            </div>
            <p className="hint">v{p.version||'1.0.0'} · {plans.filter(plan=>plan.taskId===p.taskId).length} 个关联计划</p>
          </div>
        </div>
        <div className="schedule-manager-actions od-toolbar" role="group" aria-label={'管理「'+p.title+'」'}>
          <button type="button" className="od-icon-button schedule-manager-action schedule-manager-toggle"
            title={p.enabled?'停用任务（仅预览）':'启用任务（仅预览）'}
            aria-label={(p.enabled?'停用':'启用')+'「'+p.title+'」'}
            onClick={()=>{onTaskAction('toggle',p.taskId);
              setFeedback('仅预览：已切换任务状态，未请求真实权限或 Registry 修改。');}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path
              d={p.enabled?'M7 5v14M17 5v14':'m8 5 12 7-12 7Z'}/></svg>
          </button>
          <button type="button" className="od-icon-button schedule-manager-action schedule-manager-copy"
            title="复制到开发（仅预览）" aria-label={'复制「'+p.title+'」到开发'}
            onClick={()=>{onTaskAction('fork',p.taskId);
              setFeedback('仅预览：没有真实任务源码，不会创建开发草稿。');}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h12v12H8zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
          </button>
          <details className="schedule-manager-menu">
            <summary className="od-icon-button schedule-manager-action schedule-manager-menu-trigger"
              data-manager-more={p.taskId} title="更多操作" aria-label={'更多操作：'+p.title}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
              </svg>
            </summary>
            <div className="schedule-manager-menu-panel od-surface" role="group" aria-label={'其他操作：'+p.title}>
              {managerOrigin!=='form'&&<button type="button" className="od-button od-button--quiet"
                onClick={event=>{
                  event.currentTarget.closest('details').open=false;
                  showForm(null);
                  const target=get('schedule-task-select');
                  if(![...target.options].some(option=>option.value===p.taskId))
                    target.add(new Option(p.title,p.taskId));
                  target.value=p.enabled?p.taskId:'';
                  get('schedule-title').value=p.title+' 定时';
                  setFeedback('已载入演示定时计划草稿，未创建或执行任何计划。');
                }}>为此任务设置定时</button>}
              <button type="button" className="od-button od-button--quiet schedule-manager-uninstall"
                data-manager-uninstall={p.taskId} aria-label={'卸载固定版本「'+p.title+'」'}
                onClick={event=>{event.currentTarget.closest('details').open=false;
                  setManagerRemoving(p.taskId);}}>卸载固定版本</button>
              <details className="schedule-manager-more od-disclosure od-disclosure--flat">
                <summary>固定版本与网站范围</summary>
                <p className="hint">用途：{p.description}</p>
                <p className="hint">任务 ID：{p.taskId}</p>
                <p className="hint">固定演示版本：v{p.version||'1.0.0'}</p>
                <p className="hint">适用网站：{(p.siteOrigins||[]).join('，')||'未指定'}</p>
              </details>
            </div>
          </details>
        </div>
      </article>)}
    </>,manager)}
  </>;
}
