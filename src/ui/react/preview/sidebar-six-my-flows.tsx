import * as React from 'react';
import {createPortal} from 'react-dom';

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
const seed={id:'preview-1',title:'每日整理（仅预览）',kind:'daily',
  target:'https://example.invalid/',paused:false};
const ruleName=k=>({once:'执行一次',daily:'每天',weekly:'每周',interval:'按间隔'})[k]||k;
export function PreviewMyFlows({tab,mode,onMode,rows,search,onSearch,filter,onFilter}){
  const [showSearch,setShowSearch]=React.useState(false);
  const [catalogSearch,setCatalogSearch]=React.useState('');
  const [catalogSelected,setCatalogSelected]=React.useState('preview-task');
  const [importReview,setImportReview]=React.useState('');
  const [view,setView]=React.useState('list');
  const [plans,setPlans]=React.useState([seed]);
  const [selectedId,setSelectedId]=React.useState(seed.id);
  const [editingId,setEditingId]=React.useState('');
  const [pending,setPending]=React.useState(null);
  const [dirtyConfirm,setDirtyConfirm]=React.useState(false);
  const [removeConfirm,setRemoveConfirm]=React.useState(false);
  const [rule,setRule]=React.useState('once');
  const [managerQuery,setManagerQuery]=React.useState('');
  const [feedback,setFeedback]=React.useState('');
  const selected=plans.find(p=>p.id===selectedId);
  const found=rows.filter(p=>!catalogSearch||
    [p.title,p.description].join(' ').toLocaleLowerCase().includes(catalogSearch.toLocaleLowerCase()));
  const showForm=plan=>{
    setEditingId(plan?.id||'');setPending(null);setDirtyConfirm(false);
    get('schedule-title').value=plan?.title||'';
    get('schedule-target').value=plan?.target||'https://example.invalid/';
    get('schedule-params').value='{}';
    get('schedule-kind').value=plan?.kind||'once';setRule(plan?.kind||'once');setView('form');
  };
  const back=()=>{
    if(view==='form'){
      if(get('schedule-title').value.trim()){setDirtyConfirm(true);return;}
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
    get('task-search-toggle').setAttribute('aria-expanded',String(showSearch));
    get('local-discover-count').textContent='显示 '+rows.length+' 项 · UI_PREVIEW_ONLY';
    for(const key of ['all','current','disabled'])
      get('local-filter-'+key).setAttribute('aria-pressed',String(filter===key));
    for(const [name,id] of [['list','schedule-list-view'],['detail','schedule-detail-view'],
      ['form','schedule-form'],['manager','schedule-task-manager']])
      get(id).hidden=name!==view;
    get('schedule-panel-title').textContent=view==='form'?'创建 / 编辑计划 · 预览':
      view==='detail'?'计划详情 · 预览':view==='manager'?'任务管理 · 预览':'定时计划';
    get('schedule-create').hidden=view!=='list';
    get('schedule-detail-edit').hidden=view!=='detail';
    get('schedule-save-confirm').hidden=!pending;
    get('schedule-discard-confirm').hidden=!dirtyConfirm;
    get('schedule-list-summary').textContent=plans.length+' 个内存演示计划 · 未注册调度';
    get('schedule-host-status').textContent='UI_PREVIEW_ONLY · 未连接 Host';
    get('schedule-message').textContent=feedback||'UI_PREVIEW_ONLY · 不写入真实计划';
    get('schedule-save-summary').textContent=pending?
      pending.title+' / '+pending.target+' / '+ruleName(pending.kind)+
      '\n仅本次预览，不核验执行授权。':'';
    get('schedule-once-field').hidden=rule!=='once';
    get('schedule-clock-field').hidden=!['daily','weekly'].includes(rule);
    get('schedule-weekdays-field').hidden=rule!=='weekly';
    get('schedule-interval-field').hidden=rule!=='interval';
    get('schedule-next-time').textContent='UI_PREVIEW_ONLY · 无真实调度';
    get('task-catalog-count').textContent=found.length+' 个 · UI_PREVIEW_ONLY';
    get('task-catalog-status').textContent=importReview||
      'UI_PREVIEW_ONLY · 仅展示正式目录 UI，安装须核对任务与授权';
    get('task-install').disabled=true;
  },[tab,mode,rows.length,filter,showSearch,view,plans.length,pending,dirtyConfirm,
    rule,feedback,found.length,importReview]);
  React.useEffect(()=>{
    const zone=get('schedule-timezone');
    zone.replaceChildren(new Option('Asia/Tokyo · UI_PREVIEW_ONLY','Asia/Tokyo'));
    get('schedule-timezone-summary').textContent='Asia/Tokyo · UI_PREVIEW_ONLY';
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
    bind('task-open-catalog','click',()=>onMode('catalog'));
    bind('task-search','input',e=>setCatalogSearch(e.currentTarget.value));
    bind('task-package-file','change',async e=>{
      const file=e.currentTarget.files?.[0];
      if(!file){setImportReview('');return;}
      if(file.size>1024*1024){setImportReview('UI_PREVIEW_ONLY · 文件超过本预览 1 MiB 限制');return;}
      try{
        if(/\.json$/i.test(file.name)){
          const obj=JSON.parse(await file.text());
          setImportReview('UI_PREVIEW_ONLY · '+file.name+' · '+String(obj?.taskId||obj?.id||'无身份')+
            ' · 仅解析文件，不验证/安装');
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
    bind('schedule-manage-tasks','click',()=>setView('manager'));
    bind('schedule-manager-back','click',()=>setView('form'));
    bind('schedule-manager-search','input',e=>setManagerQuery(e.currentTarget.value));
    bind('schedule-manager-create','click',()=>onMode('list'));
    bind('schedule-new-script','click',()=>onMode('list'));
    bind('schedule-task-empty-create','click',()=>onMode('list'));
    bind('schedule-open-runner','click',()=>setFeedback('UI_PREVIEW_ONLY · 运行页需真实 Host'));
    bind('schedule-form','submit',e=>{
      e.preventDefault();
      const title=get('schedule-title').value.trim(),target=get('schedule-target').value.trim();
      if(!title||!/^https?:\/\//.test(target)){
        setFeedback('预览表单：请输入名称与 HTTP(S) 目标网址');return;
      }
      setPending({title,target,kind:get('schedule-kind').value});
      setFeedback('UI_PREVIEW_ONLY · 待审阅，不会立即创建真实计划');
    });
    bind('schedule-confirm-no','click',()=>setPending(null));
    bind('schedule-confirm-yes','click',()=>{
      if(!pending)return;
      const id=editingId||'preview-'+Date.now().toString(36);
      setPlans(all=>editingId?all.map(p=>p.id===id?{...p,...pending}:p):
        [...all,{id,...pending,paused:false}]);
      setSelectedId(id);setPending(null);setEditingId('');setView('list');
      setFeedback('UI_PREVIEW_ONLY · 内存列表更新，未保存或执行');
    });
    return ()=>off.forEach(fn=>fn());
  },[onMode,onSearch,onFilter,selected,editingId,pending,view]);
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
    {createPortal(plans.map(p=><button key={p.id} type="button"
      className="od-preview-card" onClick={()=>{setSelectedId(p.id);setRemoveConfirm(false);setView('detail');}}>
      <strong>{p.title}</strong><span>{ruleName(p.kind)} · {p.paused?'暂停':'启用'}（模拟）</span>
      <small>UI_PREVIEW_ONLY · 无 Chrome 调度记录</small>
    </button>),list)}
    {createPortal(selected&&<div className="od-stack od-preview-card">
      <strong>{selected.title}</strong>
      <p>{selected.target} · {ruleName(selected.kind)}</p>
      <p>UI_PREVIEW_ONLY · 未读取历史或授权</p>
      <div className="od-preview-actions">
        <button type="button" className="od-button od-button--secondary"
          onClick={()=>setPlans(all=>all.map(p=>p.id===selected.id?
            {...p,paused:!p.paused}:p))}>{selected.paused?'恢复':'暂停'}（预览）</button>
        <button type="button" className="od-button od-button--danger"
          onClick={()=>setRemoveConfirm(true)}>删除…</button>
      </div>
      {removeConfirm&&<div className="od-preview-card">
        <p>确认仅从内存 Fixture 中移除？真实计划不变。</p>
        <div className="od-preview-actions">
          <button type="button" className="od-button od-button--danger" onClick={()=>{
            setPlans(all=>all.filter(p=>p.id!==selected.id));setView('list');setRemoveConfirm(false);
          }}>确认删除（预览）</button>
          <button type="button" className="od-button od-button--secondary"
            onClick={()=>setRemoveConfirm(false)}>取消</button>
        </div>
      </div>}
    </div>,detail)}
    {createPortal(<div className="od-preview-card od-stack">
      <p>UI_PREVIEW_ONLY · 原 TaskWorkbench 才能真正管理启停、卸载与执行权限。</p>
      {rows.filter(p=>!managerQuery||p.title.includes(managerQuery)).map(p=>
        <p key={p.taskId}>{p.title} · {p.enabled?'启用':'已停用'} · 只读</p>)}
      <button type="button" className="od-button od-button--secondary"
        onClick={()=>setView('form')}>返回编辑</button>
    </div>,manager)}
  </>;
}
