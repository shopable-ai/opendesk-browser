import * as React from 'react';
import {createPortal} from 'react-dom';
import {presentSchedulePlan,scheduleFireLabel,formatScheduleTime} from '../../schedule-plan-presentation.js';

// Offline-only UI state. The installed TaskWorkbench and scheduler remain
// the only authorities for task identity, drafts, installation and execution.
const get=id=>{
  const node=document.getElementById(id);
  if(!node)throw Error('E_MY_PREVIEW_NODE:'+id);
  return node;
};
const cards=get('task-catalog-cards'),reader=get('task-catalog-detail');
const catalogBack=get('catalog-dev-sidebar-status');
const list=get('schedule-plan-list'),detail=get('schedule-detail-view');
const manager=get('schedule-manager-list');
for(const node of [cards,reader,catalogBack,list,detail,manager])node.replaceChildren();
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
export function PreviewMyFlows({tab,mode,onMode,onOpenDevelop,rows,search,onSearch,filter,onFilter,density='many'}){
  const [showSearch,setShowSearch]=React.useState(false);
  const [addOpen,setAddOpen]=React.useState(false);
  const [addStatus,setAddStatus]=React.useState('');
  const [catalogSearch,setCatalogSearch]=React.useState('');
  const [catalogSelected,setCatalogSelected]=React.useState('preview-task');
  const [importReview,setImportReview]=React.useState('');
  const [view,setView]=React.useState('list');
  const [plans,setPlans]=React.useState(fixtures);
  const [selectedId,setSelectedId]=React.useState(seed.id);
  const [editingId,setEditingId]=React.useState('');
  const [pending,setPending]=React.useState(null);
  const [dirtyConfirm,setDirtyConfirm]=React.useState(false);
  const [removeConfirm,setRemoveConfirm]=React.useState(false);
  const [rule,setRule]=React.useState('once');
  const [managerQuery,setManagerQuery]=React.useState('');
  const [managerFilter,setManagerFilter]=React.useState('all');
  const formBaseline=React.useRef('');
  const previousPlanView=React.useRef('list');
  const planListScroll=React.useRef(0);
  const planEditorScroll=React.useRef(0);
  const [feedback,setFeedback]=React.useState('');
  const selected=plans.find(p=>p.id===selectedId);
  const selectedPresentation=selected?presentSchedulePlan(selected,selected.history):null;
  const visiblePlans=density==='empty'?[]:density==='single'?plans.slice(0,1):plans;
  const found=rows.filter(p=>!catalogSearch||
    [p.title,p.description].join(' ').toLocaleLowerCase().includes(catalogSearch.toLocaleLowerCase()));
  const formSignature=()=>JSON.stringify([
    ...['schedule-title','schedule-target','schedule-params','schedule-kind',
      'schedule-timezone','schedule-once','schedule-clock','schedule-minutes'].map(id=>get(id).value),
    ...[...get('schedule-weekdays-field').querySelectorAll('input')].map(input=>input.checked),
    get('schedule-paused').checked
  ]);
  const showForm=plan=>{
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
    if(view==='manager'){setView('form');return;}
    if(view==='form'){
      if(formSignature()!==formBaseline.current){setDirtyConfirm(true);return;}
      setView('list');setPending(null);return;
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
    get('task-add-status').textContent=addStatus;
    get('task-search-toggle').setAttribute('aria-expanded',String(showSearch));
    get('local-discover-count').textContent='显示 '+rows.length+' 项 · UI_PREVIEW_ONLY';
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
      if(view==='form')get('schedule-title').focus({preventScroll:true});
      if(view==='manager')get('schedule-manager-search').focus({preventScroll:true});
    }
    get('schedule-panel-title').textContent=view==='form'?(editingId?'编辑定时计划':'创建定时计划'):
      view==='detail'?'计划详情':view==='manager'?'任务管理':'定时计划';
    get('schedule-create').hidden=view!=='list';
    get('schedule-open-runner').hidden=view!=='list';
    get('schedule-detail-edit').hidden=view!=='detail';
    get('schedule-manager-back').hidden=true; // One authoritative back button in Header.
    get('schedule-save-confirm').hidden=!pending;
    get('schedule-discard-confirm').hidden=!dirtyConfirm;
    get('schedule-list-summary').hidden=true; // Fixture density belongs to the preview toolbar.
    get('schedule-host-status').hidden=true; // Preview banner already names the missing Host.
    get('schedule-message').textContent=feedback||'';
    get('schedule-save-summary').textContent=pending?
      pending.title+' / '+pending.target+' / '+ruleName(pending.kind)+
      '\n仅本次预览，不核验执行授权。':'';
    get('schedule-once-field').hidden=rule!=='once';
    get('schedule-clock-field').hidden=!['daily','weekly'].includes(rule);
    get('schedule-weekdays-field').hidden=rule!=='weekly';
    get('schedule-interval-field').hidden=rule!=='interval';
    get('schedule-next-time').textContent='仅预览执行规则，未计算真实调度时间';
    get('task-catalog-count').textContent=found.length+' 个 · UI_PREVIEW_ONLY';
    get('task-catalog-status').textContent=importReview||
      'UI_PREVIEW_ONLY · 仅展示正式目录 UI，安装须核对任务与授权';
    get('task-install').disabled=true;
  },[tab,mode,rows.length,filter,showSearch,addOpen,addStatus,editingId,view,
    plans.length,pending,dirtyConfirm,rule,feedback,found.length,importReview]);
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
      taskSelect.replaceChildren(new Option('示例任务 · UI_PREVIEW_ONLY','preview-task'),
        new Option('已停用任务 · UI_PREVIEW_ONLY','preview-off'));
    const off=[];
    const bind=(id,event,fn)=>{
      const node=get(id);node.addEventListener(event,fn);
      off.push(()=>node.removeEventListener(event,fn));
    };
    bind('task-search-toggle','click',()=>setShowSearch(v=>!v));
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
        if(file.size>1024*1024){setAddStatus('UI_PREVIEW_ONLY · 文件超过预览大小限制');return;}
        if(/\.json$/i.test(file.name)){
          const value=JSON.parse(await file.text());
          if(/\.opendesk-tool\.json$/i.test(file.name)||/^opendesk\.sidebar-tool\./.test(value?.format||''))
            setAddStatus('UI_PREVIEW_ONLY · 这是扩展工具包，请到「扩展」导入；未安装。');
          else if(value?.format==='opendesk.task-package.v1')
            setAddStatus('UI_PREVIEW_ONLY · 任务包已选择；须在正式目录核验固定源码及网站权限。');
          else if(['opendesk.program-draft.v1','opendesk.program-draft.v2'].includes(value?.format))
            setAddStatus('UI_PREVIEW_ONLY · 程序草稿已选择；正式导入后进入开发编辑器，不会运行。');
          else setAddStatus('UI_PREVIEW_ONLY · 不是受支持的任务包或程序草稿 JSON；未导入。');
        }else if(/\.js$/i.test(file.name))
          setAddStatus('UI_PREVIEW_ONLY · JavaScript 草稿已选择；未运行');
        else setAddStatus('UI_PREVIEW_ONLY · 仅支持 .json 或 .js；未导入。');
      }catch{setAddStatus('UI_PREVIEW_ONLY · 文件解析失败，未导入');}
      finally{input.value='';}
    });
    bind('task-add-catalog','click',()=>{setAddOpen(false);onMode('catalog');});
    bind('task-add-develop','click',()=>{setAddOpen(false);onOpenDevelop();});
    bind('task-search','input',e=>setCatalogSearch(e.currentTarget.value));
    bind('task-package-file','change',async e=>{
      const file=e.currentTarget.files?.[0];
      if(!file){setImportReview('');return;}
      if(file.size>1024*1024){setImportReview('UI_PREVIEW_ONLY · 文件超过本预览 1 MiB 限制');return;}
      try{
        if(/\.json$/i.test(file.name)){
          const obj=JSON.parse(await file.text());
          setImportReview('UI_PREVIEW_ONLY · '+file.name+
            (obj?.format==='opendesk.task-package.v1'?' · 待验证任务包':
              ['opendesk.program-draft.v1','opendesk.program-draft.v2'].includes(obj?.format)?' · 程序草稿':
                /^opendesk\.sidebar-tool\./.test(obj?.format||'')?' · 应由扩展中心导入':
                  ' · 格式不受支持')+'；没有 Host 安装。');
        }else setImportReview('UI_PREVIEW_ONLY · 源码草稿已选择，未运行');
      }catch{setImportReview('UI_PREVIEW_ONLY · JSON 无法解析；未安装');}
    });
    bind('schedule-open','click',()=>{setView('list');onMode('schedule');});
    bind('schedule-back','click',back);
    bind('schedule-create','click',()=>showForm(null));
    bind('schedule-detail-edit','click',()=>{if(selected)showForm(selected);});
    bind('schedule-cancel','click',back);
    bind('schedule-discard-yes','click',()=>{setDirtyConfirm(false);setPending(null);setView('list');});
    bind('schedule-discard-no','click',()=>setDirtyConfirm(false));
    bind('schedule-kind','change',e=>setRule(e.currentTarget.value));
    bind('schedule-timezone','change',()=>{
      zone.title='IANA：'+zone.value+' · UI_PREVIEW_ONLY';
    });
    bind('schedule-manage-tasks','click',()=>setView('manager'));
    bind('schedule-manager-back','click',()=>setView('form'));
    bind('schedule-manager-search','input',e=>setManagerQuery(e.currentTarget.value));
    bind('schedule-manager-filter','change',e=>setManagerFilter(e.currentTarget.value));
    bind('schedule-manager-create','click',onOpenDevelop);
    bind('schedule-new-script','click',onOpenDevelop);
    bind('schedule-task-empty-create','click',onOpenDevelop);
    bind('schedule-open-runner','click',()=>setFeedback('UI_PREVIEW_ONLY · 运行页需真实 Host'));
    bind('schedule-form','submit',e=>{
      e.preventDefault();
      const title=get('schedule-title').value.trim(),target=get('schedule-target').value.trim();
      if(!title||!/^https?:\/\//.test(target)){
        setFeedback('预览表单：请输入名称与 HTTP(S) 目标网址');return;
      }
      const paramsText=get('schedule-params').value.trim()||'{}';
      try{
        const params=JSON.parse(paramsText);
        if(!params||Array.isArray(params)||typeof params!=='object')throw Error('params');
      }catch{setFeedback('预览表单：参数必须是合法 JSON 对象');return;}
      const kind=get('schedule-kind').value;
      const weekdays=[...get('schedule-weekdays-field').querySelectorAll('input:checked')]
        .map(input=>input.value);
      const minutes=Number(get('schedule-minutes').value);
      if(kind==='weekly'&&!weekdays.length){
        setFeedback('预览表单：每周至少选择一天');return;
      }
      if(kind==='interval'&&(!Number.isInteger(minutes)||minutes<1||minutes>10080)){
        setFeedback('预览表单：间隔必须是 1–10080 分钟');return;
      }
      setPending({title,target,kind,paramsText,taskId:get('schedule-task-select').value,
        timezone:get('schedule-timezone').value,
        once:get('schedule-once').value,clock:get('schedule-clock').value,
        weekdays,minutes,paused:get('schedule-paused').checked});
      setFeedback('UI_PREVIEW_ONLY · 待审阅，不会立即创建真实计划');
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
      setSelectedId(id);setPending(null);setEditingId('');setView('list');
      setFeedback('仅演示交互，未修改真实计划；下次触发时间尚未计算。');
    });
    return ()=>off.forEach(fn=>fn());
  },[onMode,onOpenDevelop,onSearch,onFilter,selected,editingId,pending,view]);
  return <>
    {createPortal(found.map(p=><button key={p.taskId} type="button"
      className="catalog-card" aria-pressed={p.taskId===catalogSelected}
      onClick={()=>setCatalogSelected(p.taskId)}>
      <strong>{p.title}</strong><span>{p.description}</span>
    </button>),cards)}
    {createPortal(<div className="od-stack">
      <strong>{rows.find(p=>p.taskId===catalogSelected)?.title||'选择候选'}</strong>
      <p>UI_PREVIEW_ONLY · 当前没有真实已验证的固定任务；正式安装需核对来源、版本与权限。</p>
    </div>,reader)}
    {createPortal(<button type="button" className="od-button od-button--secondary"
      onClick={()=>onMode('list')}>← 返回我的任务</button>,catalogBack)}
    {createPortal(<>
      {visiblePlans.length===0?<div className="schedule-empty od-stack" role="status">
        <h3 className="od-page-title">尚无定时计划</h3>
        <p className="schedule-empty-hint hint">点击右上角新建，添加第一条计划。</p>
      </div>:visiblePlans.map(p=>{
        const present=presentSchedulePlan(p,p.history);
        const toggle=()=>{
          setPlans(all=>all.map(item=>item.id===p.id?
            {...item,paused:!item.paused,
              nextDueAt:item.paused?(item.previewNextDueAt??item.nextDueAt):null}:item));
          setFeedback('仅演示交互，未修改真实计划。');
        };
        return <article key={p.id} className="schedule-card od-surface"
          data-schedule-id={p.id} onClick={event=>{
            if(!event.target.closest('button,a,summary,input,select')){
              setSelectedId(p.id);setRemoveConfirm(false);setView('detail');
            }
          }}>
          <div className="schedule-card-head od-toolbar">
            <button type="button" className="od-button od-button--quiet schedule-plan-open"
              onClick={()=>{setSelectedId(p.id);setRemoveConfirm(false);setView('detail');}}>
              {p.title}
            </button>
            <span className="schedule-state" data-tone={present.tone}>{present.badge}</span>
            <div className="schedule-plan-actions od-toolbar" role="group" aria-label="计划快捷操作">
              <button type="button" className="od-icon-button schedule-plan-action"
                title={p.paused?'恢复计划':'暂停计划'}
                aria-label={(p.paused?'恢复计划':'暂停计划')+'「'+p.title+'」'}
                onClick={toggle}>
                {p.paused?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7Z"/></svg>:
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M17 5v14"/></svg>}
              </button>
              <button type="button" className="od-icon-button schedule-plan-action"
                title="编辑计划" aria-label={'编辑计划「'+p.title+'」'} onClick={()=>showForm(p)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16 4l4 4-11 11H5v-4L16 4Z"/></svg>
              </button>
            </div>
          </div>
          <p className="schedule-next-time">{present.timingText}</p>
          {present.recentText&&<p className="schedule-recent-result" data-tone={present.recentTone}>
            {present.recentText}</p>}
        </article>;
      })}
    </>,list)}
    {createPortal(selected&&<div className="od-stack schedule-detail-card">
      <section className="schedule-detail-summary od-surface od-surface--padded od-stack">
        <span className="schedule-state" data-tone={selectedPresentation.tone}>
          {selectedPresentation.badge}</span>
        <p className="schedule-next-time">{selectedPresentation.timingText}</p>
        <p className="schedule-detail-url hint">目标网页：{selected.target}</p>
        {selectedPresentation.recentText&&<p className="schedule-recent-result"
          data-tone={selectedPresentation.recentTone}>{selectedPresentation.recentText}</p>}
      </section>
      <div className="schedule-actions od-toolbar">
        <button type="button" className="od-button od-button--secondary"
          onClick={()=>{setPlans(all=>all.map(p=>p.id===selected.id?
            {...p,paused:!p.paused,
              nextDueAt:p.paused?(p.previewNextDueAt??p.nextDueAt):null}:p));
            setFeedback('仅演示交互，未修改真实计划。');}}>
          {selected.paused?'恢复计划':'暂停计划'}</button>
      </div>
      {selected.needsAttention&&<p className="schedule-status-help">
        固定任务版本或网站权限需要处理。此处仅展示状态，不会自动换绑。</p>}
      <details className="schedule-history od-disclosure od-disclosure--flat">
        <summary>运行记录{selected.history?.length?' · 最近 '+selectedPresentation.recentText:' · 暂无'}</summary>
        {(selected.history||[]).map(fire=><div className="schedule-history-row" key={fire.fireId}>
          {scheduleFireLabel(fire.status)} · {formatScheduleTime(fire.scheduledAt,selected.timezone)}
          {fire.status==='UNKNOWN'&&<small>结果待人工核对，不能自动重复执行。</small>}
        </div>)}
      </details>
      <details className="schedule-more od-disclosure od-disclosure--flat">
        <summary>更多操作</summary>
        <button type="button" className="od-button od-button--secondary schedule-danger-link"
          onClick={()=>setRemoveConfirm(true)}>删除此计划…</button>
      </details>
      {removeConfirm&&<div className="schedule-delete-confirm od-surface">
        <p>确认从预览内存中移除？真实计划与历史不会改变。</p>
        <div className="schedule-actions od-toolbar">
          <button type="button" className="od-button schedule-danger-button"
            onClick={()=>{setPlans(all=>all.filter(p=>p.id!==selected.id));
              setSelectedId('');setView('list');setRemoveConfirm(false);
              setFeedback('仅演示交互，未修改真实计划。');}}>确认删除演示计划</button>
          <button type="button" className="od-button od-button--secondary"
            onClick={()=>setRemoveConfirm(false)}>取消</button>
        </div>
      </div>}
    </div>,detail)}
    {createPortal(<div className="od-preview-card od-stack">
      <p>UI_PREVIEW_ONLY · 原 TaskWorkbench 才能真正管理启停、卸载与执行权限。</p>
      {rows.filter(p=>(!managerQuery||p.title.includes(managerQuery))&&
        (managerFilter==='all'||(managerFilter==='enabled'&&p.enabled)||
          (managerFilter==='disabled'&&!p.enabled))).map(p=>
        <p key={p.taskId}>{p.title} · {p.enabled?'启用':'已停用'} · 只读</p>)}
      {/* Header back is the single route to the editor; no duplicate body action. */}
    </div>,manager)}
  </>;
}
