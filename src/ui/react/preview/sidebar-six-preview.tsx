import * as React from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {ExtensionToolbar,ExtensionRows,ExtensionDetail,ExtensionEmpty} from '../tabs/tools.tsx';
import {DeveloperPage,DeveloperDock} from '../tabs/develop.tsx';
import {createDeveloperPreviewView} from './developer-preview.js';
import {WorkflowHeader,WorkflowHistory,WorkflowSourceName,WorkflowTranscript,WorkflowSettingsSheet} from '../tabs/workflow.tsx';
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
const developerPageHost=doc.createElement('div');
const developerDockHost=doc.createElement('div');
get('workbench-develop').replaceWith(developerPageHost);
get('develop-dock').replaceWith(developerDockHost);
const developerView=createDeveloperPreviewView();
const panels=names.map(key=>key==='develop'?developerPageHost:get('workbench-'+key));
const controls=get('od-sidebar-preview-controls');
const toolbar=get('extension-center-list-view').querySelector('.ec-toolbar');
const extensionList=get('extension-center-list');
const extensionDetail=get('extension-center-detail-body');
const extensionEmpty=get('extension-center-empty');
const toolFrame=get('sidebar-tool-frame');
const importPanel=get('sidebar-tool-import'),importOverlay=importPanel.closest('.od-import-overlay');
const actionReview=get('sidebar-tool-action-review');
// The installed ToolHost now portals the SAME importer above the entire list.
const myCount=get('task-installed-count'),myRows=get('task-installed-cards');
const myDetail=get('task-installed-detail'),myWorkspace=get('task-selected-workspace');
const cloudKeys={myState:'cloud-my-state',summary:'cloud-overview-state',
  provider:'cloud-overview-provider',connection:'cloud-overview-connection',
  host:'cloud-overview-host',slot:'cloud-overview-slot',
  tasks:'cloud-overview-tasks',requests:'cloud-overview-requests'};
const cloudNodes=Object.fromEntries(Object.entries(cloudKeys).map(([key,id])=>[key,get(id)]));
const workflowHeader=get('workflow-editor').querySelector('.workflow-head-actions');
const workflowTranscript=get('workflow-ai-transcript');
const workflowHistoryHost=get('workflow-history-react-host');
const workflowSourceHost=get('workflow-source-react-host');
const workflowSheetHost=get('workflow-settings-react-host');
const workflowSettings=get('workflow-provider-settings');
const debugIds={
  summary:'debug-cloud-summary',pairing:'debug-pairing',connection:'debug-connection',
  reconcile:'debug-reconcile',slot:'debug-slot',taskCount:'debug-task-count',
  requestCount:'debug-request-count',snapshot:'debug-snapshot',feedback:'debug-feedback'
};
const debugNodes=Object.fromEntries(Object.entries(debugIds).map(([key,id])=>[key,get(id)]));
if(!toolbar||!workflowHeader)throw Error('E_SIDEBAR_PREVIEW_PORTAL');
for(const node of [toolbar,extensionList,extensionDetail,extensionEmpty,toolFrame,
  myCount,myRows,myDetail,...Object.values(cloudNodes),
  workflowHeader,workflowTranscript,
  workflowHistoryHost,workflowSourceHost,...Object.values(debugNodes)])
  node.replaceChildren();
const sampleExtensions=Object.freeze([
  {key:'clipper-preview',kind:'app',type:'应用',title:'网页剪藏',
    description:'正式网页剪藏 JS/CSS 交互预览 · 模拟 Host 和会话数据',
    installed:true,enabled:true,version:'1.2.4',update:false,primaryAction:'打开'},
  {key:'preview-app',kind:'app',type:'应用',title:'示例工具（仅预览）',
    description:'仅内存演示的安装条目 · 无真实记录',installed:true,enabled:true,
    version:'1.0.0',update:true,primaryAction:'打开'},
  {key:'preview-page',kind:'page',type:'网页增强',title:'示例网页增强（仅预览）',
    description:'演示类型与网站授权信息 · 无真实权限',installed:true,
    version:'1',enabled:false,primaryAction:''},
  {key:'preview-new',kind:'app',type:'应用',title:'可安装候选（仅预览）',
    description:'固定身份与能力需由真实 Installer 审阅',installed:false,
    version:'1.0.0',enabled:false,primaryAction:''}
]);
// UI_PREVIEW_ONLY: read-only strings; no Provider/RunHost/Authority is invoked.
const cloudScenarios=Object.freeze({
  unpaired:{brief:'未配对',summary:'未配对 · 需要连接可信提供者（仅界面演示）',myState:'无真实配对回执',provider:'未配对',connection:'未连接',host:'未就绪',slot:'不可用',tasks:'0',requests:'0'},
  ready:{brief:'已连接（演示）',summary:'连接可用 · 仅预览（非真实连接）',myState:'无真实 Provider、执行宿主或任务批准回执',provider:'已配对（模拟）',connection:'已连接（模拟）',host:'已就绪（模拟）',slot:'空闲（模拟）',tasks:'2（模拟）',requests:'1（模拟）'},
  approval:{brief:'待授权（演示）',summary:'任务授权尚未完成 · 仅预览',myState:'需逐项核对固定版本、网站和结果许可',provider:'已配对（模拟）',connection:'已连接（模拟）',host:'待授权',slot:'未开放',tasks:'0',requests:'0'},
  disconnected:{brief:'断线（演示）',summary:'Provider 连接断开 · 需核对请求与回执',myState:'断线时不可自动重试未知操作',provider:'已配对（模拟）',connection:'断线（模拟）',host:'待核对',slot:'待核对',tasks:'待核对',requests:'待核对'},
  error:{brief:'状态异常（演示）',summary:'连接或授权状态读取失败 · 请核对',myState:'读取失败不代表凭据已经撤销',provider:'待核对',connection:'待核对',host:'待核对',slot:'待核对',tasks:'待核对',requests:'待核对'},
  unknown:{brief:'结果未知（演示）',summary:'结果未知 · 不允许自动重试',myState:'需核对原始结果、资源释放和授权状态',provider:'待核对',connection:'待核对',host:'待核对',slot:'待核对',tasks:'待核对',requests:'待核对'}
});
const labels={
  normal:'仅演示 UI，不读取真实数据',
  empty:'无项目 · 仅预览',
  loading:'加载中 · 仅预览',
  running:'运行中 · 仅预览（未执行）',
  error:'错误演示 · 仅预览',
  denied:'权限拒绝 · 仅预览',
  unknown:'状态未知 · 禁止自动重试',
  disconnected:'Host 断开 · 仅预览'
};
const messages={
  normal:[{id:'w1',speaker:'你',message:'给我一个亿的项目'},
    {id:'w2',speaker:'AI',message:'请确认任务目标和网页范围，确认后再执行。'}],
  empty:[],
  loading:[{id:'w3',speaker:'AI',message:'正在规划网页操作步骤…'}],
  running:[{id:'w4',speaker:'AI',message:'正在执行网页操作步骤…'}],
  error:[{id:'w5',speaker:'AI',message:'模型连接不可用，请检查 AI 设置。'}],
  denied:[{id:'w6',speaker:'AI',message:'本轮网页摘要授权已拒绝。'}],
  unknown:[{id:'w7',speaker:'AI',message:'运行回执未知；不能自动重复执行。'}],
  disconnected:[{id:'w8',speaker:'AI',message:'本机连接已断开，请检查连接设置。'}]
};
function Preview(){
  const initial=new URLSearchParams(window.location.search).get('tab');
  const [tab,setTab]=React.useState(names.includes(initial)?initial:'tasks');
  const initialWidth=Number(new URLSearchParams(window.location.search).get('width'));
  const [width,setWidth]=React.useState([320,360,400,420,440,520].includes(initialWidth)?initialWidth:420);
  const [scene,setScene]=React.useState('normal');
  const [cloudScenario,setCloudScenario]=React.useState('unpaired');
  const [cloudFeedback,setCloudFeedback]=React.useState('');
  const [cloudDetailOpen,setCloudDetailOpen]=React.useState(false);
  const [search,setSearch]=React.useState('');
  const [kind,setKind]=React.useState('all');
  const [scope,setScope]=React.useState('smart');
  const [menuOpen,setMenuOpen]=React.useState(false);
  const [selected,setSelected]=React.useState(null);
  const [openToolKey,setOpenToolKey]=React.useState(null);
  const [toolSettingsOpen,setToolSettingsOpen]=React.useState(false);
  const [toolDraft,setToolDraft]=React.useState('');
  const [toolFeedback,setToolFeedback]=React.useState('');
  const [clipperPage,setClipperPage]=React.useState('home');
  const [clipperDirty,setClipperDirty]=React.useState(false);
  const [clipperBusy,setClipperBusy]=React.useState(false);
  const clipperFrame=React.useRef(null);
  const [selectedTask,setSelectedTask]=React.useState('preview-task');
  const [taskManageMode,setTaskManageMode]=React.useState(false);
  const [taskEnabled,setTaskEnabled]=React.useState({'preview-task':true,'preview-off':false});
  const [installedTaskIds,setInstalledTaskIds]=React.useState(['preview-task','preview-off']);
  const [taskNotice,setTaskNotice]=React.useState('');
  const onTaskAction=(action,id)=>{
    if(!id)return;
    if(action==='toggle'){
      setTaskEnabled(old=>({...old,[id]:!old[id]}));
      setTaskNotice('已在预览内切换启停；未更改实际安装状态。');
    }else if(action==='uninstall'){
      // Only the offline memory fixture changes, never a Chrome installation.
      setInstalledTaskIds(old=>old.filter(taskId=>taskId!==id));
      setSelectedTask(old=>old===id?'':old);
      setTaskNotice('已从预览列表移除演示任务；实际安装与权限均未更改。');
    }else if(action==='fork'){
      setTaskNotice('正式扩展会复制固定源码到独立草稿；预览未读取源码。');
    }else if(action==='refresh'){
      setTaskNotice('预览列表未连接任务服务；正式扩展会重新读取安装状态。');
    }
  };
  const initialMode=new URLSearchParams(window.location.search).get('mode');
  const [taskMode,setTaskMode]=React.useState(
    initial==='tasks'&&initialMode==='schedule'?'schedule':'list');
  const [planDensity,setPlanDensity]=React.useState('many');
  const [taskSearch,setTaskSearch]=React.useState('');
  const [taskFilter,setTaskFilter]=React.useState('all');
  const previousRoute=React.useRef('');
  const [sheetOpen,setSheetOpen]=React.useState(false);
  const [history,setHistory]=React.useState(false);
  const [workflowSource,setWorkflowSource]=React.useState('Codex');
  const [workflowDraft,setWorkflowDraft]=React.useState('');
  const [workflowConversationCleared,setWorkflowConversationCleared]=React.useState(false);
  const [workflowEntry,setWorkflowEntry]=React.useState('new-workflow');
  const [workflowFeedback,setWorkflowFeedback]=React.useState('');
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
      (!search||[row.title,row.description,row.type].join(' ').includes(search)))
      .map(row=>({...row,primaryAction:row.kind==='app'&&row.installed&&
        row.enabled===true&&!['unknown','disconnected'].includes(scene)?'打开':''})),
    [scene,kind,scope,search,extensionRecords]);
  const opened=extensionRecords.find(row=>row.key===openToolKey&&row.kind==='app'&&
    row.installed===true&&row.enabled===true)||null;
  const clipperPreviewOpened=opened?.key==='clipper-preview';
  const clipperPageNames={home:'网页剪藏',library:'我的摘录',reader:'摘录详情',edit:'编辑摘录',new:'新建便签'};
  const clipperPageActions={library:['new','新建便签','M12 5v14M5 12h14'],
    reader:['edit','编辑摘录','M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z'],
    edit:['save','保存摘录','M4 3h14l3 3v15H3V3h1M7 3v6h10V3M7 21v-8h10v8'],
    new:['save','保存便签','M4 3h14l3 3v15H3V3h1M7 3v6h10V3M7 21v-8h10v8']};
  React.useEffect(()=>{
    if(!clipperPreviewOpened)return;
    const frame=clipperFrame.current;
    const receive=event=>{
      if(event.source!==frame?.contentWindow)return;
      if(event.data?.kind==='clipper-demo-nav'&&Object.hasOwn(clipperPageNames,event.data.page))
        setClipperPage(event.data.page);
      if(event.data?.kind==='clipper-demo-state'){
        setClipperDirty(event.data.dirty===true);setClipperBusy(event.data.busy===true);
      }
    };
    const loaded=()=>{setClipperPage('home');setClipperDirty(false);setClipperBusy(false);};
    window.addEventListener('message',receive);frame?.addEventListener('load',loaded);
    return ()=>{window.removeEventListener('message',receive);frame?.removeEventListener('load',loaded);};
  },[clipperPreviewOpened]);
  // Mirrors resolveExtensionRowIntent: an active installed app opens usage UI.
  // All Host, install, permissions and Sandbox behavior remain unavailable here.
  const openExtensionRow=key=>{
    const row=extensionRecords.find(item=>item.key===key);
    if(row?.kind==='app'&&row.installed&&row.enabled===true&&
      !['unknown','disconnected'].includes(scene)){
      setSelected(null);setImportOpen(false);setOpenToolKey(key);
      setToolSettingsOpen(false);setToolFeedback('');
    }else{setOpenToolKey(null);setSelected(key);}
  };
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
    return {...row,version:row.version||'仅预览',
      installationText:row.installed?'仅预览 · 内存安装状态，未连接 Host':
        '仅预览 · 可安装演示项，未校验固定包',
      source:{label:'仅预览（无真实来源回执）'},
      sites:row.kind==='page'?['https://example.invalid/*（预览）']:[],
      actions,busy:!!extensionReview,suspended:scene==='denied'||row.suspended===true,
      pageControl:row.kind==='page'&&row.installed?{
        enabled:row.enabled===true,enabledKnown:!['unknown','disconnected'].includes(scene),
        state:scene==='denied'?'restricted':row.enabled===false?'off':'pending',
        status:scene==='denied'?'网站权限受限（仅预览）':
          row.enabled?'模拟启用 · 未连接 Chrome 注册':'模拟停用 · 未连接 Chrome 注册',
        note:'仅界面状态；无 Page Authority 或 Chrome 注册读回。',
        busy:!!extensionReview,canRestore:false,legacyProgramId:null,
        onToggle:(enabled,event)=>{
          if(event?.isTrusted!==true)return;
          setExtensionRecords(current=>current.map(item=>
            item.key===row.key?{...item,enabled}:item));
          setNotice('仅预览 · 已更新内存开关；未修改安装或授权。');
        },
        onRefresh:()=>setNotice('仅预览 · 无真实 Page Authority 状态。')
      }:null,
      pageInfo:row.kind==='page'&&row.installed?{
        source:'仅预览',authorization:'未连接（预览）',nativeState:'未连接（预览）',
        capabilities:[],networkOrigins:[],excluded:[],dataRule:'无真实数据或授权'
      }:null,
      cleanupPending:false};
  })();
  const transcript=workflowConversationCleared?[]:(messages[scene]||[]);
  const allTaskRows=scene==='empty'||scene==='loading'?[]:[
    {taskId:'preview-task',title:'网页资料填写',version:'1.0.0',
      siteOrigins:['https://example.invalid/*'],
      description:'将项目名称填入表单并读回',enabled:taskEnabled['preview-task']},
    {taskId:'preview-off',title:'每周资料整理',version:'1.0.0',
      siteOrigins:['https://example.invalid/*'],
      description:'整理目标网页中的所需信息',enabled:taskEnabled['preview-off']}
  ].filter(row=>installedTaskIds.includes(row.taskId));
  const taskRows=allTaskRows.filter(p=>
    (taskFilter!=='disabled'||!p.enabled)&&
    (!taskSearch||[p.title,p.taskId,p.description].join(' ').toLocaleLowerCase()
      .includes(taskSearch.toLocaleLowerCase())));
  const cloudPreview=cloudScenarios[cloudScenario];
  const debugPreview={
    summary:'只读诊断 · '+labels[scene],pairing:'未检测',connection:'未连接',
    reconcile:'未检测',slot:'未检测',taskCount:'—',requestCount:'—',
    snapshot:'仅预览：未读取 Host 诊断，未生成敏感快照。',
    feedback:'仅预览：只读文本展示，不执行刷新、配对或领取任务。'
  };
  const sheetClose=React.useCallback(()=>{
    // Match WorkflowView.closeAISettings: the details must close with the sheet.
    workflowSettings.open=false;setSheetOpen(false);
  },[]);
  React.useEffect(()=>{
    developerView.patch('script-status',{textContent:labels[scene],
      data:{state:scene==='error'?'error':scene==='running'?'running':'unknown'}});
  },[scene]);
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
    get('sidebar-tool-list-view').hidden=!!opened;
    get('sidebar-tool-display').hidden=!opened;
    get('sidebar-tool-title').textContent=clipperPreviewOpened?
      (toolSettingsOpen?'工具设置':clipperPageNames[clipperPage]):opened?.title||'';
    const primary=doc.getElementById('sidebar-tool-primary-action');
    if(primary){
      const action=clipperPreviewOpened&&!toolSettingsOpen?clipperPageActions[clipperPage]:null;
      primary.hidden=!action;primary.disabled=clipperBusy;
      if(action){
        primary.title=action[1];primary.setAttribute('aria-label',action[1]);
        primary.querySelector('path')?.setAttribute('d',action[2]);
      }
    }
    get('sidebar-tool-settings-open').hidden=!opened;
    get('sidebar-tool-settings-open').setAttribute('aria-expanded',String(!!opened&&toolSettingsOpen));
    get('sidebar-tool-remove').disabled=!opened;
    get('sidebar-tool-settings-view').hidden=true; // Host settings cannot execute offline.
    importPanel.hidden=!importOpen;
    if(importOverlay)importOverlay.hidden=!importOpen;
    actionReview.hidden=!extensionReview;
    get('sidebar-tool-preview').hidden=!importCandidate;
    get('sidebar-tool-install').disabled=!importCandidate;
    get('sidebar-tool-preview-title').textContent=importCandidate?.title||'';
    get('sidebar-tool-preview-version').textContent=importCandidate?'v'+importCandidate.version+' · 仅预览':'';
    get('sidebar-tool-preview-description').textContent='预览仅做基础 JSON 结构检查；完整合法性和 Host 权限未校验。';
    get('sidebar-tool-preview-capabilities').textContent=importCandidate?.capabilities?.join('、')||'尚未读取';
    get('sidebar-tool-preview-file').textContent=importCandidate?.id||'';
    get('sidebar-tool-file-error').hidden=!importError;
    get('sidebar-tool-file-error').textContent=importError;
    const prior=importCandidate&&extensionRecords.find(p=>p.key===importCandidate.key);
    get('sidebar-tool-update').hidden=!prior?.installed;
    get('sidebar-tool-update-versions').textContent=prior?.installed?
      '内存版本 '+prior.version+' → '+importCandidate.version+'（仅预览）':'';
    get('sidebar-tool-update-capabilities').textContent=prior?.installed?
      '仅内存能力演示；正式更新必须重新审阅权限':'';
    get('sidebar-tool-install').textContent=prior?.installed?'审阅并更新（仅预览）':'确认安装（仅预览）';
    get('sidebar-tool-action-summary').textContent=extensionReview?
      '仅预览 · '+extensionReview.title+' · '+extensionReview.type+
      '。确认仅修改内存 Fixture，绝不安装、执行或撤销真实权限。':'';
    const content=get('workspace-content');
    const route=[tab,taskMode,selected||'',openToolKey||'',importOpen?'import':''].join('|');
    // A route change starts at the top; typing, changing timezone, local-mode
    // toggles and other in-page state updates must not jump the scroller.
    if(previousRoute.current!==route){
      content.scrollTop=0;
      previousRoute.current=route;
    }
    const dock=get('workspace-dock');
    const taskDock=get('task-dock'),workflowDock=get('workflow-dock');
    taskDock.hidden=tab!=='tasks';
    workflowDock.hidden=true; // No real workflow RunHost in preview.
    dock.hidden=(tab!=='tasks'&&tab!=='develop')||(tab==='tasks'&&taskMode!=='list');
    get('extension-center-list-view').hidden=!!detail;
    get('extension-center-detail').hidden=!detail;
    const intro=get('workflow-chat-intro');
    intro.hidden=transcript.length>0;
    const isNewChat=workflowEntry==='new-chat';
    get('workflow-ai-title').textContent=isNewChat?'开始新对话':'创建新工作流';
    get('workflow-intro-description').textContent=isNewChat
      ?'保留当前工作流，可以继续提出下一步需求。'
      :'用一句话描述任务，或选择下方示例开始。';
    for(const button of get('workflow-intro-suggestions').querySelectorAll('[data-example-mode]'))
      button.hidden=button.dataset.exampleMode!==workflowEntry;
    workflowTranscript.hidden=transcript.length===0;
    get('workflow-editor').dataset.viewState=transcript.length?'conversation':'empty';
    get('workflow-planning-indicator').hidden=scene!=='loading';
    get('workflow-ai-progress').hidden=scene!=='loading';
    get('workflow-ai-approval').hidden=scene!=='denied';
    const status=get('task-status');
    // Preview boundary is already stated once in the preview toolbar.
    // Keep the default task detail clean; announce scoped feedback only on
    // actionable changes or non-default failure/connection scenarios.
    status.textContent=taskNotice||(scene==='normal'?'':labels[scene]);
    status.dataset.state=scene;
    const cloud=get('cloud-status');
    cloud.textContent='仅预览 · '+cloudPreview.brief+'；未连接真实 Provider。';
    get('cloud-brief').textContent=cloudPreview.brief;
    get('cloud-first-run').hidden=cloudScenario!=='unpaired';
    get('cloud-approval-section').hidden=!['ready','approval'].includes(cloudScenario);
    get('cloud-request-detail').hidden=!cloudDetailOpen;
    get('workflow-provider-toggle').setAttribute('aria-expanded',String(sheetOpen));
    get('workflow-editor').dataset.historyOpen=String(history);
    const workflowStatus=get('workflow-status');
    workflowStatus.textContent=workflowFeedback;
    workflowStatus.hidden=!workflowFeedback;
  },[tab,width,scene,cloudScenario,cloudDetailOpen,selected,sheetOpen,history,workflowFeedback,transcript.length,workflowEntry,detail,taskMode,
    opened,openToolKey,toolSettingsOpen,clipperPreviewOpened,clipperPage,clipperBusy,
    importOpen,importCandidate,importError,extensionReview,extensionRecords,taskNotice]);
  React.useEffect(()=>{
    const handlers=tabButtons.map((button,i)=>{
      const click=event=>{if(!event.isTrusted)return;setTab(names[i]);
        workflowSettings.open=false;setSheetOpen(false);};
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
      // Match WorkflowView.openAISettings: a visible modal still needs its
      // legacy details opened to expose the real Codex/HTTPS controls.
      workflowSettings.open=true;
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
  React.useEffect(()=>{
    const sendClipper=action=>clipperFrame.current?.contentWindow?.postMessage(
      {kind:'clipper-demo-nav-action',action},'*');
    const back=()=>{
      if(clipperPreviewOpened){
        if(toolSettingsOpen){setToolSettingsOpen(false);return;}
        if(clipperBusy){setToolFeedback('操作进行中，请完成后返回。');return;}
        if(clipperPage!=='home'){sendClipper('back');return;}
      }
      const key=openToolKey;
      setOpenToolKey(null);setToolSettingsOpen(false);
      requestAnimationFrame(()=>doc.querySelector('[data-extension-id="'+key+'"] .ec-row-main')
        ?.focus({preventScroll:true}));
    };
    const settings=()=>{
      if(clipperPreviewOpened&&!toolSettingsOpen&&(clipperDirty||clipperBusy)){
        setToolFeedback('请先保存或取消当前编辑，再打开工具设置。');return;
      }
      setToolSettingsOpen(value=>!value);
    };
    const uninstall=()=>{
      if(!opened)return;
      setExtensionReview({type:'uninstall',key:opened.key,title:opened.title,
        kind:'app',proposedVersion:opened.version});
    };
    const handlers=[['sidebar-tool-back',back],['sidebar-tool-settings-open',settings],
      ['sidebar-tool-remove',uninstall]];
    if(doc.getElementById('sidebar-tool-primary-action'))
      handlers.push(['sidebar-tool-primary-action',()=>{if(clipperPreviewOpened&&!clipperBusy)sendClipper('primary');}]);
    for(const [id,fn] of handlers)get(id).addEventListener('click',fn);
    return ()=>{for(const [id,fn] of handlers)get(id).removeEventListener('click',fn);};
  },[openToolKey,opened,clipperPreviewOpened,clipperPage,clipperDirty,clipperBusy,toolSettingsOpen]);
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
      if(type==='install'){setScope('smart');setSelected(null);}
      if(type==='uninstall'){
        setOpenToolKey(null);setToolSettingsOpen(false);setSelected(null);setScope('available');
        // Restore focus to a visible control when the detail and review close.
        requestAnimationFrame(()=>get('extension-center-search').focus({preventScroll:true}));
      }
      setNotice('仅预览 · 仅修改内存扩展列表，无任何真实 Host 回执');
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
      }catch(error){setImportError('仅预览 · '+String(error?.message||error));}
    };
    fileInput.addEventListener('change',readFile);
    const install=bind('sidebar-tool-install',()=>{
      if(!importCandidate)return;
      setExtensionRecords(previous=>{
        const item={...importCandidate,installed:true,enabled:true,primaryAction:'打开'};
        const found=previous.findIndex(row=>row.key===item.key);
        return found<0?[...previous,item]:previous.map(row=>row.key===item.key?item:row);
      });
      setNotice('仅预览 · 内存安装/更新演示；从未调用真实 Installer');
      setImportOpen(false);setImportCandidate(null);setScope('smart');setSelected(null);
    });
    return ()=>{closed();open();closeReview();confirm();install();
      fileInput.removeEventListener('change',readFile);};
  },[extensionReview,importCandidate]);
  // Installed DOM stays the only markup; fixture rows never leave memory.
  React.useEffect(()=>{
    const task=doc.createElement('div');task.className='cloud-task-choice';
    const label=doc.createElement('label');
    const check=doc.createElement('input');check.type='checkbox';check.disabled=true;
    const name=doc.createElement('span');name.textContent='示例任务（仅预览）';
    label.append(check,name);task.append(label);
    const scope=doc.createElement('p');scope.className='cloud-task-scope';
    scope.textContent='固定版本、网站范围、结果许可必须由真实 Host 核对';
    task.append(scope);get('cloud-task-list').replaceChildren(task);
    get('cloud-approval-summary').textContent='演示布局：不能批准、启用或保存。';
    get('cloud-clients-status').textContent='仅预览 · 无真实凭据可创建、复制或撤销。';
    const li=doc.createElement('li'),title=doc.createElement('span');
    title.textContent='请求版式示例 · 非真实请求';
    const state=doc.createElement('span');state.textContent='结果未知 · 仅预览';
    const open=doc.createElement('button');open.type='button';
    open.className='od-button od-button--secondary';open.textContent='查看详情';
    open.addEventListener('click',()=>setCloudDetailOpen(true));
    li.append(title,state,open);get('cloud-request-samples').replaceChildren(li);
    get('cloud-request-page').textContent='仅演示 1 条版式 · 无真实历史';
    get('cloud-request-detail-title').textContent='请求详情（仅预览）';
    get('cloud-request-detail-state').textContent='结果未知 · 仅预览';
    get('cloud-request-detail-facts').textContent='无真实请求、时间或 Run ID。';
    get('cloud-request-detail-reason').textContent='未知结果禁止自动重试。';
    get('cloud-request-detail-run-id').textContent='无真实 Run ID';
    get('cloud-request-detail-note').textContent='不能跳转真实 Run / Result';
    for(const id of ['cloud-approve','cloud-stop','cloud-pair','cloud-unpair',
      'cloud-client-create','cloud-client-copy','cloud-request-open-result'])
      get(id).disabled=true;
    const handlers=[
      ['cloud-open-console',()=>setCloudFeedback('仅预览 · 正式控制台仅在真实扩展中打开')],
      ['cloud-overview-refresh',()=>setCloudFeedback('仅预览 · 未调用 Provider，仍显示本地场景')],
      ['cloud-configure',()=>{get('cloud-hosting').open=true;get('cloud-url').focus({preventScroll:true});
        setCloudFeedback('仅预览 · 查看连接表单，配对操作已禁用');}],
      ['cloud-request-close',()=>setCloudDetailOpen(false)],
      ['cloud-client-refresh',()=>setCloudFeedback('仅预览 · 无凭据可刷新')],
      ['cloud-refresh',()=>setCloudFeedback('仅预览 · 无真实状态可核对')]
    ];
    for(const [id,fn] of handlers)get(id).addEventListener('click',fn);
    return ()=>{open.remove();for(const [id,fn] of handlers)get(id).removeEventListener('click',fn);};
  },[]);
  // Offline workflow adapter: the *same* formal React portals and DOM hosts.
  // Actions never read saved revisions, approve permissions or invoke Provider/RunHost.
  React.useEffect(()=>{
    const provider=get('workflow-ai-provider'),model=get('workflow-ai-model');
    const draft=get('workflow-ai-request');
    const protocol=get('workflow-https-protocol');
    const localSource=get('workflow-source-local'),httpsSource=get('workflow-source-https');
    const refreshSource=()=>{
      const local=provider.value==='local_codex',external=['cloud_responses','custom_https'].includes(provider.value);
      setWorkflowSource(local?'Codex':external?model.value.trim():'');
      localSource.setAttribute('aria-pressed',String(local));
      httpsSource.setAttribute('aria-pressed',String(external));
      get('workflow-local-settings').hidden=!local;
      get('workflow-custom-settings').hidden=!external;
      get('workflow-https-mode').hidden=!external;
      // The shared product markup stays disconnected: no preview Native/Host claims.
      get('workflow-local-status').textContent='未连接';
      get('workflow-local-status').dataset.state='DISCONNECTED';
      get('workflow-local-status').title='本机连接未建立';
      get('workflow-local-status-detail').textContent='请在已安装的 OpenDesk 扩展中连接本机应用。';
      get('workflow-local-connected').hidden=true;
      get('workflow-local-connect').disabled=true;
      get('workflow-local-connect').title='请在已安装的 OpenDesk 扩展中连接';
      if(external)protocol.value=provider.value;
    };
    const chooseLocal=()=>{provider.value='local_codex';refreshSource();};
    const chooseHttps=()=>{provider.value=protocol.value||'custom_https';refreshSource();};
    const chooseProtocol=()=>{if(provider.value!=='local_codex'){provider.value=protocol.value;refreshSource();}};
    const draftEdited=()=>setWorkflowDraft(draft.value);
    const explainSend=()=>setWorkflowFeedback(
      'OpenDesk 尚未连接。请在 AI 设置中完成连接后重试。');
    // Exact installed suggestion nodes. Filling text never starts AI or a RunHost.
    const examplePrompts={
      continue:'请继续修改刚才填写的内容，并读回确认。不要提交表单。',
      check:'请检查当前网页中的输入内容与重要信息，先报告检查结果，不要进行写入。',
      fill:'请将指定内容填入当前网页的目标表单，并读取输入框实际值进行验证，不要提交。',
      read:'请只读提取当前网页的主要内容并整理，不要修改网页或提交表单。'
    };
    const exampleButtons=[...get('workflow-intro-suggestions').querySelectorAll('[data-workflow-example]')];
    const fillExample=event=>{
      if(!event.isTrusted)return;
      const requestText=examplePrompts[event.currentTarget.dataset.workflowExample];
      if(!requestText)return;
      draft.value=requestText;setWorkflowDraft(requestText);
      draft.focus({preventScroll:true});
      setWorkflowFeedback('示例已填入草稿，没有触发发送或网页执行。');
    };
    for(const button of exampleButtons)button.addEventListener('click',fillExample);
    provider.addEventListener('change',refreshSource);
    localSource.addEventListener('click',chooseLocal);
    httpsSource.addEventListener('click',chooseHttps);
    protocol.addEventListener('change',chooseProtocol);
    model.addEventListener('input',refreshSource);
    draft.addEventListener('input',draftEdited);
    get('workflow-ai-plan').addEventListener('click',explainSend);
    refreshSource();draftEdited();
    return ()=>{
      provider.removeEventListener('change',refreshSource);
      localSource.removeEventListener('click',chooseLocal);
      httpsSource.removeEventListener('click',chooseHttps);
      protocol.removeEventListener('change',chooseProtocol);
      model.removeEventListener('input',refreshSource);
      draft.removeEventListener('input',draftEdited);
      for(const button of exampleButtons)button.removeEventListener('click',fillExample);
      get('workflow-ai-plan').removeEventListener('click',explainSend);
    };
  },[]);
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
      filter={taskFilter} onFilter={setTaskFilter} density={planDensity}
      selectedTask={selectedTask} manageMode={taskManageMode} onManageMode={setTaskManageMode}
      onTaskAction={onTaskAction}/>
    {createPortal(<div className="od-sidebar-preview-toolbar">
      <div className="od-sidebar-preview-heading"><strong>OpenDesk · 六 Tab 正式源码预览</strong>
        <span>UI 交互预览 · 未连接真实调度，操作不会更改真实任务</span></div>
      {tab==='cloud'?<label>云控场景 <select data-preview-cloud-scenario value={cloudScenario}
        onChange={event=>{setCloudScenario(event.target.value);setCloudDetailOpen(false);setCloudFeedback('');}}>
        <option value="unpaired">未配对</option><option value="ready">已连接（演示）</option>
        <option value="approval">待授权</option><option value="disconnected">断线</option>
        <option value="error">异常</option><option value="unknown">结果未知</option>
      </select></label>:<label>状态 <select data-preview-scenario value={scene} onChange={event=>{setScene(event.target.value);setWorkflowConversationCleared(false);}}>
        <option value="normal">普通</option><option value="empty">空状态</option>
        <option value="loading">加载</option><option value="running">运行中</option>
        <option value="error">错误</option><option value="denied">权限拒绝</option>
        <option value="unknown">未知</option><option value="disconnected">断线</option>
      </select></label>}
      {tab==='tasks'&&taskMode==='schedule'&&<label>计划密度 <select
        data-preview-schedule-density value={planDensity}
        onChange={event=>setPlanDensity(event.target.value)}>
        <option value="many">全部状态</option>
        <option value="single">单计划</option>
        <option value="empty">空状态</option>
      </select></label>}
      <label>宽度 <select data-preview-width value={width}
        onChange={event=>setWidth(Number(event.target.value))}>
        <option value={320}>320px</option><option value={360}>360px</option><option value={400}>400px</option><option value={420}>420px</option>
        <option value={440}>440px</option><option value={520}>520px</option>
      </select></label>
      {!(tab==='tasks'&&taskMode==='schedule')&&<span className="od-sidebar-preview-label" role="status">
        {tab==='cloud'?cloudPreview.brief+' · 仅预览':labels[scene]} · {tab==='debug'?'调试仅开发构建':tab==='tasks'?
          'React 任务列表/详情 + 原生执行与定时计划':tab==='cloud'?
          'React 只读概览 + 原生授权与请求队列':tab==='tools'?
          'React 列表/详情 + 原生其余业务':tab==='develop'?
          'React 局部控件 + 原生编辑器':'React 标题/对话/设置 + 原生执行'}</span>}
      {notice&&<span className="od-sidebar-preview-label" role="status">{notice}</span>}
      {tab==='cloud'&&cloudFeedback&&<span className="od-sidebar-preview-label" role="status">{cloudFeedback}</span>}
    </div>,controls)}
    {createPortal(<ExtensionToolbar model={{
      query:search,kind,scope,menuOpen,language:'zh-CN',
      onSearch:setSearch,onKind:setKind,onScope:next=>{setScope(next);setMenuOpen(false);},onToggleMenu:()=>setMenuOpen(v=>!v),
      onReset:()=>{setSearch('');setKind('all');setScope('smart');},
      onMarket:()=>setNotice('市场仅为 UI 预览，不打开网络页面'),
      onImport:()=>{beginImport();
        setNotice('仅预览 · 可审阅本地 JSON；不会触发真实安装');},
      onReload:()=>setNotice('仅预览 · 已展示当前内存状态；没有真实安装回读')
    }}/>,toolbar)}
    {createPortal(<ExtensionRows rows={rows} busy={scene==='loading'}
      pendingKey={null} menuKey={null} onOpenRow={openExtensionRow}
      onMore={setSelected}/>,extensionList)}
    {createPortal(opened&&<section className="od-preview-card od-stack"
      aria-label="已安装工具使用页面 · 仅预览">
      <strong>{clipperPreviewOpened?'网页剪藏 · 正式业务源码预览':'工具工作区 · '+opened.title}</strong>
      {clipperPreviewOpened ? <>
        <small>v1.2.4 · 实际 src/notes.js / src/style.css；会话模拟数据，不使用 Chrome 授权、持久化或 React Host 真正消息通道。</small>
        {toolSettingsOpen&&<div className="od-preview-card">
          <strong>工具设置（模拟）</strong>
          <p>返回后仍在原有摘录页面。真实权限管理只能通过已安装工具验收。</p>
          <button className="od-button od-button--secondary" type="button"
            onClick={()=>setToolFeedback('预览不会打开独立标签页。')}>在新标签页打开（预览不执行）</button>
        </div>}
        <iframe ref={clipperFrame} title="网页剪藏正式 JS/CSS · 模拟 Host"
          src="../../../examples/sidebar-tools/web-markdown-clipper/preview/stage.html"
          hidden={toolSettingsOpen} style={{width:'100%',height:660,border:0}}/>
        {toolFeedback&&<p role="status">{toolFeedback}</p>}
      </> : <>
      <small>v{opened.version} · 仅预览 · 隔离 Fixture，未连接真实 iframe 或 Host。</small>
      {toolSettingsOpen?<div className="od-preview-card">
        <strong>工具设置（仅预览）</strong>
        <p>实际网站权限、启停与持久数据由原工具 Host 管理；预览不更改这些状态。</p>
      </div>:<>
        <label className="od-field" htmlFor="preview-tool-draft">工作区草稿（仅内存）</label>
        <textarea id="preview-tool-draft" className="od-field" rows={4}
          value={toolDraft} onChange={event=>setToolDraft(event.target.value)}
          placeholder="在这里体验工具使用页；不会发送或保存"/>
        <button type="button" className="od-button"
          onClick={()=>setToolFeedback('仅预览 · 当前页内存草稿，未调用扩展 API')}>保存预览草稿</button>
        {toolFeedback&&<p role="status">{toolFeedback}</p>}
      </>}
      </>}
    </section>,toolFrame)}
    {createPortal(<ExtensionEmpty model={{showEmpty:rows.length===0,
      emptyText:'仅预览 · 当前没有匹配项目'}} container={extensionEmpty}/>,extensionEmpty)}
    {createPortal(<ExtensionDetail model={detail} container={extensionDetail}/>,extensionDetail)}
    {createPortal(<MyTaskCount value={taskRows.length+' 个已安装任务'}/>,myCount)}
    {createPortal(<MyTaskRows rows={taskRows} selectedId={selectedTask}
      workspace={myWorkspace} manageMode={taskManageMode}
      onManage={setSelectedTask} onSelect={setSelectedTask}
      emptyText={'暂无任务'}/>,myRows)}
    {createPortal(<MyTaskDetail value={taskRows.find(row=>row.taskId===selectedTask)?
      '适用网站：example.invalid\n所需能力：网页自动化\n来源：本地任务 · 界面预览':''}/>,myDetail)}
    {Object.entries(cloudNodes).map(([key,node])=>
      createPortal(<CloudOverviewText value={cloudPreview[key]}/>,node,'cloud-'+key))}
    {createPortal(<DeveloperPage view={developerView} hidden={tab!=='develop'}/>,developerPageHost)}
    {createPortal(<DeveloperDock view={developerView} hidden={tab!=='develop'}/>,developerDockHost)}
    {createPortal(<WorkflowHeader model={{
      saved:false,busy:scene==='loading',planning:scene==='loading',
      historyExpanded:history,sessionHint:'新对话（仅预览）'}}
      actions={{
        onHistory:()=>{setHistory(open=>!open);
          get('workflow-manage-panel').hidden=true;},
        onNewSession:()=>{setHistory(false);setWorkflowConversationCleared(true);
          setWorkflowEntry('new-chat');
          setWorkflowFeedback('演示对话已清空；不删除或重新执行真实工作流。');},
        onNewWorkflow:()=>{
          setHistory(false);
          get('workflow-ai-request').value='';setWorkflowDraft('');
          setWorkflowConversationCleared(true);setWorkflowEntry('new-workflow');
          setWorkflowFeedback('已打开演示空工作流；没有创建或删除真实版本。');
        },
        onOpenSavedHistory:()=>setWorkflowFeedback(
          '这是只读演示条目。正式打开须通过 WorkflowView 验证版本、来源与源码哈希。')
      }}/>,workflowHeader)}
    {createPortal(<WorkflowHistory model={{open:history,canResume:false,busy:false,
      rows:[{key:'preview-only',title:'演示工作流（仅预览）',
        fullTitle:'无真实保存记录，不可作为已验证的修订版',
        savedText:'预览条目 · 没有真实版本或哈希'}]}}
      actions={{onOpenSavedHistory:()=>{setHistory(false);setWorkflowFeedback(
        '预览无法加载工作流；正式打开会先核对来源、版本及源码哈希。');}}}/>,workflowHistoryHost)}
    {createPortal(<WorkflowSourceName value={workflowSource}/>,workflowSourceHost)}
    {createPortal(<WorkflowTranscript rows={transcript}/>,workflowTranscript)}
    {Object.entries(debugNodes).map(([key,node])=>
      createPortal(<DebugDiagnosticText value={debugPreview[key]}/>,node,key))}
    {createPortal(<WorkflowSettingsSheet open={sheetOpen} onClose={sheetClose}
      settings={workflowSettings} doc={doc}/>,workflowSheetHost)}
  </>;
}
const root=createRoot(get('od-sidebar-preview-root'));
root.render(<Preview/>);
window.addEventListener('pagehide',()=>{root.unmount();developerView.dispose();},{once:true});
