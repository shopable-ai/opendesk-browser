import * as React from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {ExtensionToolbar,ExtensionRows,ExtensionDetail,ExtensionEmpty} from '../tabs/tools.tsx';
import {DeveloperActions,DeveloperFramework,DeveloperRunStatus} from '../tabs/develop.tsx';
import {WorkflowHeader,WorkflowTranscript,WorkflowSettingsSheet} from '../tabs/workflow.tsx';
import {DebugDiagnosticText} from '../tabs/debug.tsx';
import {MyTaskCount,MyTaskRows,MyTaskDetail} from '../tabs/tasks.tsx';
import {CloudOverviewText} from '../tabs/cloud.tsx';
import {PreviewMyFlows} from './sidebar-six-my-flows.tsx';

// UI_PREVIEW_ONLY. No browser permissions, storage, Host, Provider, compiler or Task Authority.
// Every visible product panel and every product React component is imported from
// the installed Side Panel source; all sample state stops at this adapter.
const doc=document;
const get=id=>{
  const el=doc.getElementById(id);
  if(!el)throw new Error('E_SIDEBAR_PREVIEW_MISSING:'+id);
  return el;
};
const names=['tasks','tools','workflow','develop','cloud','debug'];
const tabButtons=names.map(key=>doc.querySelector('[data-workbench-tab="'+key+'"]'));
if(tabButtons.some(el=>!el))throw Error('E_SIDEBAR_PREVIEW_NAV');
const panels=names.map(key=>get('workbench-'+key));
const controls=get('od-sidebar-preview-controls');
const toolbar=get('extension-center-list-view').querySelector('.ec-toolbar');
const extensionList=get('extension-center-list');
const extensionDetail=get('extension-center-detail-body');
const extensionEmpty=get('extension-center-empty');
const importHost=get('extension-center-import-host'),importPanel=get('sidebar-tool-import');
const actionReview=get('sidebar-tool-action-review');
importHost.append(importPanel); // Relocate the SAME installed DOM, preview-only adapter.
const myCount=get('task-installed-count'),myRows=get('task-installed-cards');
const myDetail=get('task-installed-detail'),myWorkspace=get('task-selected-workspace');
const cloudKeys={myState:'cloud-my-state',summary:'cloud-overview-state',
  provider:'cloud-overview-provider',connection:'cloud-overview-connection',
  host:'cloud-overview-host',slot:'cloud-overview-slot',
  tasks:'cloud-overview-tasks',requests:'cloud-overview-requests'};
const cloudNodes=Object.fromEntries(Object.entries(cloudKeys).map(([key,id])=>[key,get(id)]));
const developerChoices=get('page-component-framework').querySelector('.page-component-choices');
const developerDock=get('develop-dock').querySelector('.dock-buttons');
const developerStatus=get('script-status');
const workflowHeader=get('workflow-editor').querySelector('.workflow-head-actions');
const workflowTranscript=get('workflow-ai-transcript');
const workflowSheetHost=get('workflow-settings-react-host');
const workflowSettings=get('workflow-provider-settings');
const debugIds={
  summary:'debug-cloud-summary',pairing:'debug-pairing',connection:'debug-connection',
  reconcile:'debug-reconcile',slot:'debug-slot',taskCount:'debug-task-count',
  requestCount:'debug-request-count',snapshot:'debug-snapshot',feedback:'debug-feedback'
};
const debugNodes=Object.fromEntries(Object.entries(debugIds).map(([key,id])=>[key,get(id)]));
if(!toolbar||!developerChoices||!developerDock||!workflowHeader)throw Error('E_SIDEBAR_PREVIEW_PORTAL');
for(const node of [toolbar,extensionList,extensionDetail,extensionEmpty,
  myCount,myRows,myDetail,...Object.values(cloudNodes),
  developerChoices,developerDock,developerStatus,workflowHeader,workflowTranscript,
  ...Object.values(debugNodes)])
  node.replaceChildren();
const sampleExtensions=Object.freeze([
  {key:'preview-app',kind:'app',type:'应用',title:'示例工具（仅预览）',
    description:'仅内存演示的安装条目 · 无真实记录',installed:true,enabled:true,
    version:'1.0.0',update:true,primaryAction:'打开'},
  {key:'preview-page',kind:'page',type:'网页增强',title:'示例网页增强（仅预览）',
    description:'演示类型与网站授权信息 · 无真实权限',installed:false,
    version:'1',enabled:false,primaryAction:''}
]);
const labels={
  normal:'仅演示 UI，不读取真实数据',
  empty:'无项目 · UI_PREVIEW_ONLY',
  loading:'加载中 · UI_PREVIEW_ONLY',
  running:'运行中 · UI_PREVIEW_ONLY（未执行）',
  error:'错误演示 · UI_PREVIEW_ONLY',
  denied:'权限拒绝 · UI_PREVIEW_ONLY',
  unknown:'状态未知 · 禁止自动重试',
  disconnected:'Host 断开 · UI_PREVIEW_ONLY'
};
const messages={
  normal:[{id:'w1',speaker:'你',message:'给我一个亿的项目'},
    {id:'w2',speaker:'AI',message:'这是正式 React 对话组件的离线展示，不连接真实模型。'}],
  empty:[],
  loading:[{id:'w3',speaker:'AI',message:'正在准备规划（UI 演示）。'}],
  running:[{id:'w4',speaker:'AI',message:'步骤执行中（无真实 RunHost）。'}],
  error:[{id:'w5',speaker:'AI',message:'E_PREVIEW_ONLY：无真实 Provider。'}],
  denied:[{id:'w6',speaker:'AI',message:'本轮网页摘要授权已拒绝（UI 演示）。'}],
  unknown:[{id:'w7',speaker:'AI',message:'运行回执未知；不能自动重复执行。'}],
  disconnected:[{id:'w8',speaker:'AI',message:'Native Host 未连接，无法执行网页操作。'}]
};
function Preview(){
  const initial=new URLSearchParams(window.location.search).get('tab');
  const [tab,setTab]=React.useState(names.includes(initial)?initial:'tasks');
  const initialWidth=Number(new URLSearchParams(window.location.search).get('width'));
  const [width,setWidth]=React.useState([360,420,520].includes(initialWidth)?initialWidth:360);
  const [scene,setScene]=React.useState('normal');
  const [search,setSearch]=React.useState('');
  const [kind,setKind]=React.useState('all');
  const [scope,setScope]=React.useState('smart');
  const [menuOpen,setMenuOpen]=React.useState(false);
  const [selected,setSelected]=React.useState(null);
  const [selectedTask,setSelectedTask]=React.useState('preview-task');
  const [taskMode,setTaskMode]=React.useState('list');
  const [taskSearch,setTaskSearch]=React.useState('');
  const [taskFilter,setTaskFilter]=React.useState('all');
  const [framework,setFramework]=React.useState('javascript');
  const [sheetOpen,setSheetOpen]=React.useState(false);
  const [history,setHistory]=React.useState(false);
  const [notice,setNotice]=React.useState('');
  const [extensionRecords,setExtensionRecords]=React.useState(sampleExtensions);
  const [importOpen,setImportOpen]=React.useState(false);
  const [importCandidate,setImportCandidate]=React.useState(null);
  const [importError,setImportError]=React.useState('');
  const [extensionReview,setExtensionReview]=React.useState(null);
  const beginImport=()=>{
    // Re-selecting the same file must re-trigger native file change/read.
    get('sidebar-tool-file').value='';
    setImportCandidate(null);setImportError('');
    setSelected(null);setImportOpen(true);setMenuOpen(false);
  };
  const rows=React.useMemo(()=>scene==='empty'||scene==='loading'?[]:
    extensionRecords.filter(row=>(kind==='all'||row.kind===kind)&&
      (scope!=='smart'||row.installed)&&
      (scope!=='available'||!row.installed||row.update)&&
      (!search||[row.title,row.description,row.type].join(' ').includes(search))),
    [scene,kind,scope,search,extensionRecords]);
  const detail=selected===null?null:(()=>{
    const row=extensionRecords.find(x=>x.key===selected);
    if(!row)return null;
    const actions=[];
    const add=(id,label)=>actions.push({id,label,onClick:()=>setExtensionReview({
      type:id,key:row.key,title:row.title,kind:row.kind,
      proposedVersion:row.update?'1.0.1':row.version
    })});
    if(row.kind==='app'){
      if(row.installed){
        add('settings','设置与权限…');
        add('toggle',row.enabled===false?'启用（预览）':'停用（预览）');
        if(row.update)add('update','审阅新版…');
        add('uninstall','卸载…');
      }else add('install','审阅并安装（预览）');
    }else{
      add('toggle',row.enabled?'停用自动运行':'启用自动运行');
      add('revoke','撤销网站授权…');
      add('develop','前往开发');
    }
    return {...row,version:row.version||'UI_PREVIEW_ONLY',
      installationText:row.installed?'UI_PREVIEW_ONLY · 内存安装状态，未连接 Host':
        'UI_PREVIEW_ONLY · 可安装演示项，未校验固定包',
      source:{label:'UI_PREVIEW_ONLY（无真实来源回执）'},
      sites:row.kind==='page'?['https://example.invalid/*（预览）']:[],
      actions,busy:!!extensionReview,suspended:scene==='denied'||row.suspended===true,
      cleanupPending:false};
  })();
  const transcript=messages[scene]||[];
  const allTaskRows=scene==='empty'||scene==='loading'?[]:[
    {taskId:'preview-task',title:'示例自动化（仅预览）',
      description:'来自原 TaskWorkbench 的任务资料投影',enabled:scene!=='denied'},
    {taskId:'preview-off',title:'已停用任务（仅预览）',
      description:'保留版本、权限及原始执行身份',enabled:false}
  ];
  const taskRows=allTaskRows.filter(p=>
    (taskFilter!=='disabled'||!p.enabled)&&
    (!taskSearch||[p.title,p.taskId,p.description].join(' ').toLocaleLowerCase()
      .includes(taskSearch.toLocaleLowerCase())));
  const cloudPreview={
    myState:labels[scene],summary:'云控状态展示 · UI_PREVIEW_ONLY',
    provider:scene==='normal'?'未配对':'待核对',
    connection:scene==='normal'?'未连接':labels[scene],
    host:scene==='normal'?'未就绪':'待核对',
    slot:scene==='normal'?'不可用':'待核对',tasks:'0',requests:'0'
  };
  const debugPreview={
    summary:'只读诊断 · '+labels[scene],pairing:'未检测',connection:'未连接',
    reconcile:'未检测',slot:'未检测',taskCount:'—',requestCount:'—',
    snapshot:'UI_PREVIEW_ONLY：未读取 Host 诊断，未生成敏感快照。',
    feedback:'UI_PREVIEW_ONLY：只读文本展示，不执行刷新、配对或领取任务。'
  };
  const sheetClose=React.useCallback(()=>setSheetOpen(false),[]);
  React.useLayoutEffect(()=>{
    get('od-sidebar-preview-stage').style.width=width+'px';
    names.forEach((name,i)=>{
      const active=name===tab;
      panels[i].hidden=!active||(name==='tasks'&&taskMode==='catalog');
      tabButtons[i].removeAttribute('disabled');
      tabButtons[i].hidden=false; // Debug is previewed as a development-only tab.
      tabButtons[i].setAttribute('aria-selected',String(active));
      tabButtons[i].tabIndex=active?0:-1;
    });
    importPanel.hidden=!importOpen;
    actionReview.hidden=!extensionReview;
    get('sidebar-tool-preview').hidden=!importCandidate;
    get('sidebar-tool-install').disabled=!importCandidate;
    get('sidebar-tool-preview-title').textContent=importCandidate?.title||'';
    get('sidebar-tool-preview-version').textContent=importCandidate?'v'+importCandidate.version+' · UI_PREVIEW_ONLY':'';
    get('sidebar-tool-preview-description').textContent='预览仅做基础 JSON 结构检查；完整合法性和 Host 权限未校验。';
    get('sidebar-tool-preview-capabilities').textContent=importCandidate?.capabilities?.join('、')||'尚未读取';
    get('sidebar-tool-preview-file').textContent=importCandidate?.id||'';
    get('sidebar-tool-file-error').hidden=!importError;
    get('sidebar-tool-file-error').textContent=importError;
    const prior=importCandidate&&extensionRecords.find(p=>p.key===importCandidate.key);
    get('sidebar-tool-update').hidden=!prior?.installed;
    get('sidebar-tool-update-versions').textContent=prior?.installed?
      '内存版本 '+prior.version+' → '+importCandidate.version+'（UI_PREVIEW_ONLY）':'';
    get('sidebar-tool-update-capabilities').textContent=prior?.installed?
      '仅内存能力演示；正式更新必须重新审阅权限':'';
    get('sidebar-tool-install').textContent=prior?.installed?'审阅并更新（仅预览）':'确认安装（仅预览）';
    get('sidebar-tool-action-summary').textContent=extensionReview?
      'UI_PREVIEW_ONLY · '+extensionReview.title+' · '+extensionReview.type+
      '。确认仅修改内存 Fixture，绝不安装、执行或撤销真实权限。':'';
    const content=get('workspace-content');
    content.scrollTop=0;
    const dock=get('workspace-dock');
    const taskDock=get('task-dock'),developDock=get('develop-dock'),workflowDock=get('workflow-dock');
    taskDock.hidden=tab!=='tasks';
    developDock.hidden=tab!=='develop';
    workflowDock.hidden=true; // No real workflow RunHost in preview.
    dock.hidden=(tab!=='tasks'&&tab!=='develop')||(tab==='tasks'&&taskMode!=='list');
    get('extension-center-list-view').hidden=!!detail;
    get('extension-center-detail').hidden=!detail;
    const intro=get('workflow-chat-intro');
    intro.hidden=transcript.length>0;
    workflowTranscript.hidden=transcript.length===0;
    get('workflow-editor').dataset.viewState=transcript.length?'conversation':'empty';
    get('workflow-planning-indicator').hidden=scene!=='loading';
    get('workflow-ai-progress').hidden=scene!=='loading';
    get('workflow-ai-approval').hidden=scene!=='denied';
    const status=get('task-status');
    status.textContent=labels[scene];
    status.dataset.state=scene;
    const cloud=get('cloud-status');
    cloud.textContent=labels[scene];
    get('workflow-provider-toggle').setAttribute('aria-expanded',String(sheetOpen));
  },[tab,width,scene,selected,sheetOpen,transcript.length,detail,taskMode,
    importOpen,importCandidate,importError,extensionReview,extensionRecords]);
  React.useEffect(()=>{
    const handlers=tabButtons.map((button,i)=>{
      const click=event=>{if(!event.isTrusted)return;setTab(names[i]);setSheetOpen(false);};
      button.addEventListener('click',click);
      return ()=>button.removeEventListener('click',click);
    });
    const nav=doc.querySelector('.workbench-nav');
    const keydown=event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      const current=names.indexOf(tab);
      const index=event.key==='Home'?0:event.key==='End'?names.length-1:
        (current+(event.key==='ArrowRight'?1:-1)+names.length)%names.length;
      event.preventDefault();
      tabButtons[index].focus({preventScroll:true});
      setTab(names[index]);
    };
    nav.addEventListener('keydown',keydown);
    const sheetClick=event=>{
      if(!event.isTrusted)return;
      setSheetOpen(true);
    };
    get('workflow-provider-toggle').addEventListener('click',sheetClick);
    const back=()=>setSelected(null);
    get('extension-center-back').addEventListener('click',back);
    const submit=event=>event.preventDefault();
    doc.addEventListener('submit',submit,true);
    const anchor=event=>{if(event.target.closest('a[href]'))event.preventDefault();};
    doc.addEventListener('click',anchor,true);
    return ()=>{
      handlers.forEach(fn=>fn());
      nav.removeEventListener('keydown',keydown);
      get('workflow-provider-toggle').removeEventListener('click',sheetClick);
      get('extension-center-back').removeEventListener('click',back);
      doc.removeEventListener('submit',submit,true);
      doc.removeEventListener('click',anchor,true);
    };
  },[tab]);
  // The real import card, file chooser, update review and confirm IDs are
  // borrowed from tool.html. No browser storage or installer is invoked.
  React.useEffect(()=>{
    const bind=(id,fn)=>{
      const node=get(id);node.addEventListener('click',fn);
      return ()=>node.removeEventListener('click',fn);
    };
    const closed=bind('sidebar-tool-import-close',()=>setImportOpen(false));
    const open=bind('sidebar-tool-import-trigger',beginImport);
    const closeReview=bind('sidebar-tool-action-cancel',()=>setExtensionReview(null));
    const confirm=bind('sidebar-tool-action-continue',()=>{
      if(!extensionReview)return;
      const {type,key}=extensionReview;
      if(type==='develop'){setTab('develop');setExtensionReview(null);return;}
      setExtensionRecords(previous=>previous.map(row=>{
        if(row.key!==key)return row;
        if(type==='install')return {...row,installed:true,enabled:true,primaryAction:'打开'};
        if(type==='uninstall')return {...row,installed:false,enabled:false,primaryAction:'查看详情'};
        if(type==='update')return {...row,version:extensionReview.proposedVersion,update:false};
        if(type==='toggle')return {...row,enabled:!row.enabled};
        if(type==='revoke')return {...row,suspended:true,enabled:false};
        return row;
      }));
      if(type==='uninstall'){
        setSelected(null);setScope('available');
        // Restore focus to a visible control when the detail and review close.
        requestAnimationFrame(()=>get('extension-center-search').focus({preventScroll:true}));
      }
      setNotice('UI_PREVIEW_ONLY · 仅修改内存扩展列表，无任何真实 Host 回执');
      setExtensionReview(null);
    });
    const fileInput=get('sidebar-tool-file');
    const readFile=async event=>{
      const file=event.currentTarget.files?.[0];setImportCandidate(null);setImportError('');
      if(!file)return;
      if(file.size>1024*1024){setImportError('预览文件超过 1 MiB，未读取');return;}
      try{
        const value=JSON.parse(await file.text());
        if(!value||typeof value!=='object'||Array.isArray(value)||
          !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(value.id||'')||
          typeof value.version!=='string'||!value.version||
          typeof value.title!=='string'||!value.title.trim()||
          !Array.isArray(value.capabilities))
          throw Error('缺少合法 id、title、version 或 capabilities');
        const id=value.id;
        setImportCandidate({key:'app:'+id,id,title:value.title.slice(0,100),
          description:'从本地文件演示的应用 · 无 Host 记录',version:value.version.slice(0,40),
          capabilities:value.capabilities.map(x=>String(x).slice(0,80)).slice(0,30),
          type:'应用',kind:'app',installed:false,enabled:false,primaryAction:'查看详情'});
      }catch(error){setImportError('UI_PREVIEW_ONLY · '+String(error?.message||error));}
    };
    fileInput.addEventListener('change',readFile);
    const install=bind('sidebar-tool-install',()=>{
      if(!importCandidate)return;
      setExtensionRecords(previous=>{
        const item={...importCandidate,installed:true,enabled:true,primaryAction:'打开'};
        const found=previous.findIndex(row=>row.key===item.key);
        return found<0?[...previous,item]:previous.map(row=>row.key===item.key?item:row);
      });
      setNotice('UI_PREVIEW_ONLY · 内存安装/更新演示；从未调用真实 Installer');
      setImportOpen(false);setImportCandidate(null);setScope('smart');setSelected(null);
    });
    return ()=>{closed();open();closeReview();confirm();install();
      fileInput.removeEventListener('change',readFile);};
  },[extensionReview,importCandidate]);
  React.useEffect(()=>{
    doc.documentElement.dataset.sidebarPreviewReady='true';
    window.__sidebarPreviewInfo=Object.freeze({sourceBound:true,tabs:6,
      previewOnly:true,realHost:false,realProvider:false,realPermission:false,realResult:false});
    return ()=>{delete doc.documentElement.dataset.sidebarPreviewReady;delete window.__sidebarPreviewInfo;};
  },[]);
  return <>
    <PreviewMyFlows tab={tab} mode={taskMode} onMode={setTaskMode}
      onOpenDevelop={()=>{setTab('develop');setTaskMode('list');}}
      rows={allTaskRows} search={taskSearch} onSearch={setTaskSearch}
      filter={taskFilter} onFilter={setTaskFilter}/>
    {createPortal(<div className="od-sidebar-preview-toolbar">
      <div className="od-sidebar-preview-heading"><strong>OpenDesk · 六 Tab 正式源码预览</strong>
        <span>UI_PREVIEW_ONLY · 开发版包含调试 · Native / 权限 / 执行全部未连接</span></div>
      <label>状态 <select data-preview-scenario value={scene} onChange={event=>setScene(event.target.value)}>
        <option value="normal">普通</option><option value="empty">空状态</option>
        <option value="loading">加载</option><option value="running">运行中</option>
        <option value="error">错误</option><option value="denied">权限拒绝</option>
        <option value="unknown">未知</option><option value="disconnected">断线</option>
      </select></label>
      <label>宽度 <select data-preview-width value={width}
        onChange={event=>setWidth(Number(event.target.value))}>
        <option value={360}>360px</option><option value={420}>420px</option>
        <option value={520}>520px</option>
      </select></label>
      <span className="od-sidebar-preview-label" role="status">
        {labels[scene]} · {tab==='debug'?'调试仅开发构建':tab==='tasks'?
          'React 任务列表/详情 + 原生执行与定时计划':tab==='cloud'?
          'React 只读概览 + 原生授权与请求队列':tab==='tools'?
          'React 列表/详情 + 原生其余业务':tab==='develop'?
          'React 局部控件 + 原生编辑器':'React 标题/对话/设置 + 原生执行'}</span>
      {notice&&<span className="od-sidebar-preview-label" role="status">{notice}</span>}
    </div>,controls)}
    {createPortal(<ExtensionToolbar model={{
      query:search,kind,scope,menuOpen,language:'zh-CN',
      onSearch:setSearch,onKind:setKind,onScope:setScope,onToggleMenu:()=>setMenuOpen(v=>!v),
      onReset:()=>{setSearch('');setKind('all');setScope('smart');},
      onMarket:()=>setNotice('市场仅为 UI 预览，不打开网络页面'),
      onImport:()=>{beginImport();
        setNotice('UI_PREVIEW_ONLY · 可审阅本地 JSON；不会触发真实安装');},
      onReload:()=>setNotice('UI_PREVIEW_ONLY · 已展示当前内存状态；没有真实安装回读')
    }}/>,toolbar)}
    {createPortal(<ExtensionRows rows={rows} busy={scene==='loading'}
      pendingKey={null} menuKey={null} onOpenRow={setSelected}
      onMore={setSelected}/>,extensionList)}
    {createPortal(<ExtensionEmpty model={{showEmpty:rows.length===0,
      emptyText:'UI_PREVIEW_ONLY · 当前没有匹配项目'}} container={extensionEmpty}/>,extensionEmpty)}
    {createPortal(<ExtensionDetail model={detail} container={extensionDetail}/>,extensionDetail)}
    {createPortal(<MyTaskCount value={taskRows.length+' 个 · UI_PREVIEW_ONLY'}/>,myCount)}
    {createPortal(<MyTaskRows rows={taskRows} selectedId={selectedTask}
      workspace={myWorkspace} onSelect={setSelectedTask}
      emptyText={'暂无任务 · UI_PREVIEW_ONLY'}/>,myRows)}
    {createPortal(<MyTaskDetail value={taskRows.find(row=>row.taskId===selectedTask)?
      '仅预览：任务版本与网站授权仍由原 TaskWorkbench 管理':''}/>,myDetail)}
    {Object.entries(cloudNodes).map(([key,node])=>
      createPortal(<CloudOverviewText value={cloudPreview[key]}/>,node,'cloud-'+key))}
    {createPortal(<DeveloperFramework model={{mode:framework,compilerEnabled:true,
      onSelect:setFramework}}/>,developerChoices)}
    {createPortal(<DeveloperRunStatus node={developerStatus}
      model={{state:scene==='error'?'error':scene==='running'?'running':'unknown',
        text:labels[scene]}}/>,developerStatus)}
    {createPortal(<DeveloperActions model={{runDisabled:true,saveDisabled:true,stopDisabled:true,
      runLabel:'运行草稿',saveLabel:'保存版本',stopLabel:'停止'}}/>,developerDock)}
    {createPortal(<WorkflowHeader model={{
      saved:false,busy:scene==='loading',planning:scene==='loading',
      historyExpanded:history,sessionHint:'新对话（预览）'}}
      actions={{onHistory:()=>{setHistory(v=>!v);get('workflow-manage-panel').hidden=history;},
        onNewSession:()=>setScene('empty'),onNewWorkflow:()=>setScene('empty')}}/>,workflowHeader)}
    {createPortal(<WorkflowTranscript rows={transcript}/>,workflowTranscript)}
    {Object.entries(debugNodes).map(([key,node])=>
      createPortal(<DebugDiagnosticText value={debugPreview[key]}/>,node,key))}
    {createPortal(<WorkflowSettingsSheet open={sheetOpen} onClose={sheetClose}
      settings={workflowSettings} doc={doc}/>,workflowSheetHost)}
  </>;
}
const root=createRoot(get('od-sidebar-preview-root'));
root.render(<Preview/>);
window.addEventListener('pagehide',()=>root.unmount(),{once:true});
