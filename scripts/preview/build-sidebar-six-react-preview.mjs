#!/usr/bin/env node
// Offline design preview of the existing trusted app. No installed Host,
// dynamic-tool sandbox, permission authority, Native or Cloud is connected.
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {build} from 'vite';
import {clipperStagePaths,generateClipperStage} from './clipper-stage.mjs';
import {compileSharedToolCss} from './shared-tool-design.mjs';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'prototypes/sidebar/react-preview/index.html');
const stylePaths=[
  'src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css',
  'src/ui/cloud-hosting.css','src/ui/extension-center.css'
];
const inputs=[
  'src/ui/sidepanel.html',...stylePaths,
  'src/ui/react/main.tsx','src/ui/react/app-shell.tsx',
  'src/ui/react/preview/extension-ui-showcase.tsx','src/ui/react/preview/extension-ui-showcase.css',
  'src/ui/react/tabs/navigation.tsx','src/ui/react/tabs/browser-history.tsx',
  'src/ui/react/components/ui/button.tsx',
  'src/ui/react/tabs/tools.tsx','src/ui/react/tabs/tool-host.tsx',
  'src/ui/react/preview/clipper-preview.js','src/ui/sidebar-tools-fields.js',
  'src/ui/react/tabs/develop.tsx',
  'src/ui/react/tabs/develop-controls.tsx','src/ui/react/tabs/develop-dependencies.tsx',
  'src/ui/develop-view.js','src/ui/develop-fields.js',
  'src/ui/react/preview/developer-preview.js',
  'src/ui/my-workbench-view.js','src/ui/sidebar-tools-view.js',
  'src/ui/workflow/workflow-ui-state.js','src/ui/react/tabs/workflow.tsx',
  'src/ui/react/preview/shared-ai-preview.js','src/ui/conversation/draft-suggestion.js',
  'src/ui/react/preview/locale-preview.js',
  'examples/sidebar-tools/reading-toc/tool.config.json','examples/sidebar-tools/reading-toc/locales.json',
  'examples/sidebar-tools/reading-toc/src/index.html','examples/sidebar-tools/reading-toc/src/style.css',
  'examples/sidebar-tools/reading-toc/src/main.js',
  'src/ui/react/tabs/my-agent.tsx','src/ui/react/tabs/my-agent.css',
  'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/my-page.tsx',
  'src/ui/react/tabs/schedule.tsx','src/ui/react/tabs/cloud.tsx','src/ui/react/tabs/debug.tsx',
  'scripts/preview/build-sidebar-six-react-preview.mjs','scripts/preview/clipper-stage.mjs','scripts/preview/shared-tool-design.mjs',
  ...clipperStagePaths,'examples/sidebar-tools/web-markdown-clipper/tool.config.json','package.json','package-lock.json'
];
const must=(ok,message)=>{if(!ok)throw Error('E_SIX_TAB_PREVIEW: '+message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=entries=>sha(Buffer.concat(entries.flatMap(([path,bytes])=>[
  Buffer.from(path+'\0'),bytes,Buffer.from('\0')])));

// Presentation adapters only. Production mountSidebarApp remains the sole DOM
// owner, with the same explicit onNavigate contract as src/ui/tool-shell.js.
const previewEntry=`
import {createExtensionUiShowcase} from ${JSON.stringify(join(root,'src/ui/react/preview/extension-ui-showcase.tsx'))};
import {mountSidebarApp} from ${JSON.stringify(join(root,'src/ui/react/main.tsx'))};
import {createDeveloperPreviewView} from ${JSON.stringify(join(root,'src/ui/react/preview/developer-preview.js'))};
import {createMyWorkbenchView} from ${JSON.stringify(join(root,'src/ui/my-workbench-view.js'))};
import {createSidebarToolsView} from ${JSON.stringify(join(root,'src/ui/sidebar-tools-view.js'))};
import {createClipperPreview} from ${JSON.stringify(join(root,'src/ui/react/preview/clipper-preview.js'))};
import {createWorkflowUIState} from ${JSON.stringify(join(root,'src/ui/workflow/workflow-ui-state.js'))};
import {createPreviewProviderSettings,createPreviewMyAgent,bindPreviewSettingsViewport} from ${JSON.stringify(join(root,'src/ui/react/preview/shared-ai-preview.js'))};
import {appendWorkflowSuggestionDraft} from ${JSON.stringify(join(root,'src/ui/conversation/draft-suggestion.js'))};
import {createLocalePreview} from ${JSON.stringify(join(root,'src/ui/react/preview/locale-preview.js'))};
const localePreview=createLocalePreview(LOCALE_PREVIEW_TOOL);
let localeManagerOpen=false,localeSession=0;
const proof={scope:'UI_PREVIEW_ONLY',realHost:false,realPermission:false,realResult:false};
const names=['tasks','tools','workflow','develop','cloud','debug'];
const initial=new URLSearchParams(location.search).get('tab');
document.documentElement.dataset.opendeskTab=names.includes(initial)?initial:'tools';
// The standalone HTML must allocate a real viewport to the production flex root.
// This changes the preview frame only; no installed Side Panel geometry is changed.
const previewParams=new URLSearchParams(location.search);
const showcaseMode=previewParams.get('ui')==='showcase';
if(showcaseMode){
 const originalRoot=document.getElementById('opendesk-react-app');
 if(originalRoot){originalRoot.inert=true;originalRoot.setAttribute('aria-hidden','true');}
}
const themeInput=document.getElementById('od-sidebar-preview-theme');
if(themeInput){
 const applyTheme=value=>{document.documentElement.dataset.opendeskPreviewTheme=value;themeInput.value=value;};
 applyTheme(['light','dark'].includes(previewParams.get('theme'))?previewParams.get('theme'):'auto');
 themeInput.addEventListener('change',event=>applyTheme(event.currentTarget.value));
}
const previewShell=document.getElementById('od-sidebar-preview-shell');
const releaseSettingsViewport=bindPreviewSettingsViewport(document.getElementById('od-sidebar-preview-stage'));
const previewWidth=Number(previewParams.get('width'));
const widthChoices=[320,360,400,440,520,960];
const selectedWidth=widthChoices.includes(previewWidth)?previewWidth:400;
if(previewShell)previewShell.style.width='min(100%, '+selectedWidth+'px)';
const widthInput=document.getElementById('od-sidebar-preview-width');
if(widthInput){
 widthInput.value=String(selectedWidth);
 widthInput.addEventListener('change',event=>{
  const value=Number(event.currentTarget.value);
  if(!widthChoices.includes(value))return;
  previewShell.style.width='min(100%, '+value+'px)';
  const url=new URL(location.href);url.searchParams.set('width',String(value));
  try{history.replaceState(null,'',url);}catch{/* file:// history restrictions do not block width changes. */}
 });
}
const developerView=createDeveloperPreviewView();
for(const id of ['page-candidate-save','page-program-refresh'])
  if(developerView.fields[id])developerView.patch(id,{disabled:true});
const myView=createMyWorkbenchView(),toolView=createSidebarToolsView();
myView.setText('task-installed-count','仅预览 · 无真实安装任务');
myView.actions.taskSearchToggleClick=()=>{
  myView.field('task-search-panel').hidden=!myView.field('task-search-panel').hidden;myView.publish();
};
// Optional offline states live only in the existing six-tab React preview.
// ?tab=tasks&task=selected and ?tab=tasks&task=running never invoke a Host.
const taskScene=new URLSearchParams(location.search).get('task');
myView.project('runDock',{taskHidden:true,developHidden:true,hidden:true,stopOnly:true});
if(taskScene==='selected'||taskScene==='running'){
  myView.project('taskRows',{rows:[{taskId:'preview-task',title:'演示任务',
    description:'仅预览选中任务详情，不访问当前网页',enabled:true}],
    selectedId:'preview-task',emptyText:'',onSelect:()=>{}});
  myView.setText('task-installed-count','1 个演示任务 · 未安装');
  myView.setText('task-current-site','当前网页适用 · 仅预览');
  myView.field('task-run').disabled=taskScene==='running';
  myView.actions.taskRunClick=()=>myView.setText('task-status','仅预览 · 没有实际运行任务');
  if(taskScene==='running'){
    myView.project('runDock',{taskHidden:false,developHidden:true,hidden:false,stopOnly:true});
    myView.field('task-dock').hidden=false;
    myView.field('task-stop').disabled=false;
    myView.field('task-stop').attributes['aria-label']='停止「演示任务」';
    myView.actions.taskStopClick=()=>{
      myView.setText('task-status','仅预览 · 没有实际 Stop 或 RunHost 回执');
      myView.field('task-stop').disabled=true;
      myView.field('task-dock').hidden=true;
      myView.project('runDock',{taskHidden:true,developHidden:true,hidden:true,stopOnly:true});
    };
  }
}
const providerSettings=createPreviewProviderSettings();
const myAgent=createPreviewMyAgent();
const workflow=createWorkflowUIState();
providerSettings.subscribeSettings(()=>{
 const source=providerSettings.settingsSnapshot().source;
 workflow.control('workflow-ai-provider').value=source;
 workflow.patch({sourceName:source==='local_codex'?'本机 Codex':
  source==='cloud_responses'?'HTTPS Responses':'HTTPS Chat Completions'});
});
for(const id of ['workflow-ai-plan','workflow-save','workflow-run','workflow-local-connect'])
  workflow.control(id).disabled=true;
workflow.control('workflow-local-status').textContent='未连接';
workflow.control('workflow-local-connected').hidden=true;
const workflowActions={
  input(id,value){workflow.control(id).value=value;},
  click(id){
    if(id==='workflow-provider-toggle')workflow.control('workflow-provider-settings').open=true;
    if(id==='workflow-ai-new-session')workflow.patch({entryMode:'new-chat',messages:[]});
    if(id==='workflow-new')workflow.patch({entryMode:'new-workflow',messages:[]});
  },
  closeSettings(){workflow.control('workflow-provider-settings').open=false;},
  chooseExample(key){
   const text={fill:'在本地演示表单填写内容',read:'读取本地演示页面',
    continue:'继续上次的工作流',check:'检查已有工作流'}[key];
   const outcome=appendWorkflowSuggestionDraft(workflow.control('workflow-ai-request').value,text);
   if(['filled','appended'].includes(outcome.kind))
    workflow.control('workflow-ai-request').value=outcome.value;
   workflow.setFocus('workflow-ai-request');
   return outcome;
  }
};
let app;
const onNavigate=tab=>{
  document.documentElement.dataset.opendeskTab=tab;
  app.renderNavigation(tab);return true;
};
app=mountSidebarApp(document,{debugEnabled:true,onNavigate,developerView,myView,toolView,providerSettings,
  previewContents:showcaseMode?createExtensionUiShowcase():null});
app.connectMyAgent(myAgent);
const clipper=createClipperPreview({view:toolView,stage:CLIPPER_STAGE_DOCUMENT,
  onUninstall:id=>{
    demoRemoved.add('app:'+id);publishRows();
    app.renderStatus({text:'UI_PREVIEW_ONLY · 已从内存列表移除「'+id+'」，没有真实卸载或清理',state:'success'});
  }});
app.connectWorkflowPage({...workflow,actions:workflowActions});
// Deep-link the *real shared React sheet*, rather than drawing a second demo UI.
// The preview Provider facade is memory-only and cannot acquire inference authority.
if(new URLSearchParams(location.search).get('ai-settings')==='1')
  app.openProviderSettings();
// Debug-only, read-only preview: no Chrome permission, history query or data.
app.renderBrowserHistory({text:'',startDate:'',endDate:'',limit:'25',busy:false,
  status:'仅界面预览 · 不读取浏览器历史',permission:'unknown',visits:null});
app.connectBrowserHistoryActions(null);
// Presentation data only: the real React component consumes the same snapshot
// contract, while no Installer, Chrome permission or Host operation is present.
const demoRows=Object.freeze([
  {key:'app:web-markdown-clipper',title:'网页剪藏',kind:'app',type:'应用',
    description:'正式业务源码 · 模拟 Host 与预览数据',installed:true,version:'CLIPPER_TOOL_VERSION'},
  {key:'app:bookmark-manager',title:'书签管理',kind:'app',type:'应用',
    description:'共享管理 UI · 完整书签授权（仅预览）',installed:true,version:'1.0.0'},
  {key:'app:cookie-editor',title:'Cookie Editor',kind:'app',type:'应用',
    description:'共享管理 UI · Cookie 首次授权与撤销（仅预览）',installed:true,version:'1.0.0'},
  {key:'app:prompt-shortcuts',title:'提示词快捷按钮',kind:'app',type:'应用',
    description:'共享管理 UI · 快捷栏业务设置（仅预览）',installed:true,version:'1.0.0'},
  {key:'app:demo-generic',title:'普通扩展',kind:'app',type:'应用',
    description:'共享管理 UI · 无特殊权限（仅预览）',installed:true,version:'1.0.0'},
  {key:'app:demo-reading',title:'演示 · 阅读目录',kind:'app',type:'应用',
    description:'展示网页标题与文章大纲（演示数据）',installed:true,version:'1.0.0'},
  {key:'page:demo-markup',title:'演示 · 网页内容标注与阅读辅助工具',kind:'page',type:'网页增强',
    description:'在示例网站标注文字（不运行任何脚本）',installed:true,version:'1'},
  {key:'app:demo-import',title:'演示 · 待安装应用',kind:'app',type:'应用',
    description:'仅展示官方目录候选外观，不提供模拟安装',installed:false,version:'2.0.0'}
]);
const demoRemoved=new Set();
let pendingDemoReview=null,listDemoReview=null,selectedDemoKey=null;
const demoInstalled=row=>row.installed&&!demoRemoved.has(row.key);
const toolbar={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
const previewNotice=()=>app.renderStatus({text:'仅预览 · 请在正式 Chrome 扩展中执行此操作',state:'info'});
// The canonical React preview demonstrates the drawer and file metadata only.
// Neither this adapter nor the disabled button can install, update or grant access.
let previewSelection=0;
const previewOpenImport=()=>{
  toolbar.menuOpen=false;publishToolbar();
  toolView.patch('sidebar-tool-import',{hidden:false});
};
toolView.bind('sidebar-tool-import-close','click',()=>{
  previewSelection++;
  toolView.patch('sidebar-tool-import',{hidden:true});
  toolView.patch('sidebar-tool-preview',{hidden:true});
  toolView.patch('sidebar-tool-file',{value:''});
  toolView.patch('sidebar-tool-file-error',{hidden:true,textContent:''});
});
toolView.bind('sidebar-tool-file','change',async event=>{
  const selection=++previewSelection,file=event?.target?.files?.[0];
  toolView.patch('sidebar-tool-preview',{hidden:true});
  toolView.patch('sidebar-tool-file-error',{hidden:true,textContent:''});
  if(!file)return;
  try{
    if(file.size>1024*1024)throw Error('文件超过预览读取上限 1 MiB');
    const value=JSON.parse(await file.text());
    if(selection!==previewSelection)return;
    const isPage=value?.format==='opendesk.page-install.v1';
    const isTool=['opendesk.sidebar-tool.v1','opendesk.sidebar-tool.v2'].includes(value?.format);
    const identity=isPage?value?.programId:value?.id;
    if((!isPage&&!isTool)||typeof identity!=='string'||!identity.trim()||
       typeof value.title!=='string'||!value.title.trim()||
       typeof value.version!=='string'||!value.version.trim())
      throw Error('无法识别安装包格式、身份、标题或版本；仅预览字段，不是完整包校验');
    const sites=isPage&&Array.isArray(value.pageRules?.matches)
      ?value.pageRules.matches.filter(item=>typeof item==='string').slice(0,20):[];
    const requested=isPage
      ?'作用网站：'+(sites.join('、')||'未提供可显示的网站范围')
      :Array.isArray(value.capabilities)
        ?value.capabilities.filter(item=>typeof item==='string').slice(0,30).join('、')||'未声明额外能力'
        :'未读取';
    toolView.patch('sidebar-tool-preview-title',{textContent:value.title.slice(0,100)});
    toolView.patch('sidebar-tool-preview-version',{textContent:'v'+value.version.slice(0,40)+
      (isPage&&Number.isSafeInteger(value.revision)?' · r'+value.revision:'')});
    toolView.patch('sidebar-tool-preview-description',{textContent:
      (isPage?'网页增强':'侧边栏应用')+' · 仅显示文件自述字段；未执行包验证、安装列表读回或真实授权，无法安装。'});
    toolView.patch('sidebar-tool-preview-capabilities',{textContent:requested});
    toolView.patch('sidebar-tool-preview-file',{textContent:'文件：'+file.name.slice(0,140)+
      ' · 身份（未验证）：'+identity.slice(0,100)});
    toolView.patch('sidebar-tool-update',{hidden:true});
    toolView.patch('sidebar-tool-install',{disabled:true,textContent:'仅预览 · 不执行安装'});
    toolView.patch('sidebar-tool-preview',{hidden:false});
  }catch(error){
    if(selection!==previewSelection)return;
    toolView.patch('sidebar-tool-file-error',{hidden:false,
      textContent:'仅预览 · '+String(error?.message||error)});
  }
});
const closeRowMenu=()=>app.renderRowMenu([]);
const closeDetail=()=>{
  pendingDemoReview=null;selectedDemoKey=null;closeRowMenu();app.renderView('list');
};
function publishDemoUninstall(){
  const row=demoRows.find(item=>item.key===listDemoReview&&demoInstalled(item));
  app.renderUninstall(row?{
    title:'卸载「'+row.title+'」？',busy:false,
    text:'仅预览：确认后从本页内存中的已安装列表移除，不执行真实卸载或清理。',
    identity:{key:row.key,kind:row.kind,version:row.version},
    onCancel:cancelDemoUninstallReview,onConfirm:confirmDemoUninstallReview
  }:null);
}
function openDemoListUninstall(key,event){
  if(!event?.isTrusted||listDemoReview||
    !demoRows.some(row=>row.key===key&&demoInstalled(row)))return;
  pendingDemoReview=key;listDemoReview=key;closeRowMenu();publishDemoUninstall();
}
function openDemoUninstallReview(key,event){
  if(!event?.isTrusted||!demoRows.some(row=>row.key===key&&demoInstalled(row)))return;
  pendingDemoReview=key;openDemoDetail(key);
}
function cancelDemoUninstallReview(event){
  if(!event?.isTrusted||!pendingDemoReview)return;
  const key=pendingDemoReview,inList=listDemoReview===key;
  pendingDemoReview=null;listDemoReview=null;
  if(inList)publishDemoUninstall();else openDemoDetail(key);
}
function confirmDemoUninstallReview(event){
  if(!event?.isTrusted||!pendingDemoReview||
     (pendingDemoReview!==selectedDemoKey&&pendingDemoReview!==listDemoReview))return;
  const key=pendingDemoReview,row=demoRows.find(item=>item.key===key);
  if(!row||!demoInstalled(row)){cancelDemoUninstallReview(event);return;}
  demoRemoved.add(key);listDemoReview=null;closeDetail();publishDemoUninstall();publishRows();
  app.renderStatus({text:'仅预览 · 已从安装列表移除「'+row.title+
    '」（仅内存演示，没有真实卸载或权限变更）',state:'success'});
  document.getElementById('extension-center-search')?.focus({preventScroll:true});
}
function openDemoDetail(key){
  const row=demoRows.find(item=>item.key===key&&!demoRemoved.has(item.key));
  if(!row)return;
  selectedDemoKey=key;closeRowMenu();
  const installed=demoInstalled(row),reviewing=pendingDemoReview===key;
  app.renderDetail({key:row.key,title:row.title,kind:row.kind,type:row.type,
    description:row.description,installed,cleanupPending:false,
    version:row.version,busy:false,
    actions:installed&&!reviewing?[{id:'uninstall',label:'卸载…',
      onClick:event=>openDemoUninstallReview(key,event)}]:[],
    confirmation:reviewing?{
      text:'确认后，该演示条目会从已安装列表消失。这里不调用真实卸载、数据清理或权限 API。',
      onCancel:cancelDemoUninstallReview,onConfirm:confirmDemoUninstallReview
    }:null,
    source:installed?{label:'演示来源（非真实安装）'}:null,
    installationText:installed?'演示条目 · 非真实安装':'演示候选 · 尚未安装',
    usageText:'仅供审阅排版，不运行扩展',appDataText:'',
    sites:row.kind==='page'?['https://example.com/*']:[],suspended:false,
    pageInfo:row.kind==='page'?{
      source:'演示数据',excluded:[],capabilities:[],networkOrigins:[],
      authorization:'无真实授权',nativeState:'无真实注册',installationId:'无',
      dataRule:'演示界面不读取、修改或清理任何网站数据'
    }:null});
  app.renderView('detail');
}
app.connectBack(closeDetail);
function publishRows(){
  const query=toolbar.query.trim().toLocaleLowerCase();
  const shown=demoRows.filter(row=>
    !demoRemoved.has(row.key)&&
    (toolbar.kind==='all'||toolbar.kind===row.kind)&&
    (toolbar.scope==='available'?!demoInstalled(row):demoInstalled(row))&&
    (!query||(row.title+' '+row.description).toLocaleLowerCase().includes(query)));
  app.renderRows({rows:shown.map(({key,title,kind,type,description,installed})=>
    ({key,title,kind,type,description,installed,stateKnown:true,primaryAction:null})),
    busy:false,pendingKey:null,onOpenRow:key=>key==='app:web-markdown-clipper'?clipper.open():
      ['app:bookmark-manager','app:cookie-editor','app:prompt-shortcuts','app:demo-generic'].includes(key)
        ?clipper.openScenario(key.slice(4)):openDemoDetail(key),
    onMore:(key,trigger)=>{
      const row=demoRows.find(item=>item.key===key);
      if(!row)return;
      const items=[{id:'detail',label:'查看详情',onClick:()=>openDemoDetail(key)}];
      if(demoInstalled(row))items.push({id:'uninstall',label:'卸载…',onClick:event=>{
        trigger.focus({preventScroll:true});
        openDemoListUninstall(key,event);
      }});
      app.renderRowMenu(items,{key,title:row.title,trigger,onClose:returnFocus=>{
        closeRowMenu();
        if(!returnFocus)return;
        const next=trigger?.isConnected?trigger:
          [...document.querySelectorAll('[data-extension-action="more"]')]
            .find(node=>node.dataset.extensionKey===key);
        next?.focus({preventScroll:true});
      }});
    }});
  app.renderFeedback({showEmpty:shown.length===0,
    emptyText:'仅预览 · 当前筛选下没有演示条目',
    countText:'仅预览 · '+shown.length+' 个演示条目'});
}
function publishToolbar(){
  app.renderToolbar({...toolbar,
    onLanguageSettings:()=>{localeManagerOpen=true;localeSession++;toolbar.menuOpen=false;publishToolbar();},
    localeManager:localeManagerOpen?{...localePreview,session:localeSession,
      onClose:()=>{localeManagerOpen=false;publishToolbar();}}:null,
    onSearch:value=>{toolbar.query=value;publishToolbar();publishRows();},
    onKind:value=>{toolbar.kind=value;publishToolbar();publishRows();},
    onScope:value=>{toolbar.scope=value;publishToolbar();publishRows();},
    onLanguage:value=>{toolbar.language=value;publishToolbar();previewNotice();},
    onToggleMenu:()=>{toolbar.menuOpen=!toolbar.menuOpen;publishToolbar();},
    onCloseMenu:()=>{toolbar.menuOpen=false;publishToolbar();},
    onReset:()=>{toolbar.kind='all';toolbar.scope='smart';toolbar.menuOpen=false;
      publishToolbar();publishRows();},
    onMarket:previewNotice,onImport:previewOpenImport,onReload:previewNotice
  });
}
publishToolbar();
publishRows();
publishDemoUninstall();
app.renderDebugDiagnostics({cloudSummary:'仅预览 · 未连接真实 Host',snapshotText:'UI_PREVIEW_ONLY'});
const previewTool=new URLSearchParams(location.search).get('tool');
if(previewTool==='web-markdown-clipper')clipper.open();
else if(previewTool)clipper.openScenario(previewTool);
window.addEventListener('pagehide',()=>{releaseSettingsViewport();clipper.dispose();localePreview.dispose();app.dispose();
 developerView.dispose();workflow.dispose();myAgent.dispose();providerSettings.dispose();},{once:true});
document.documentElement.dataset.previewProof=proof.scope;
document.documentElement.dataset.previewBootScript='ready';
document.getElementById('od-sidebar-preview-boot')?.remove();
document.getElementById('od-sidebar-preview-error')?.setAttribute('hidden','');
document.getElementById('od-sidebar-preview-stage')?.setAttribute('data-preview-ready','true');
`;

export async function generateSidebarSixReactPreview(){
  const initial=await Promise.all(inputs.map(async path=>[path,await readFile(join(root,path))]));
  const $=load(initial[0][1].toString());
  must($('#opendesk-react-app').length===1&&$('#opendesk-react-app').contents().length===0,
    'official app must provide one empty root');
  must($('nav.workbench-nav,#workspace-content,#workspace-dock').length===0,
    'official app must not restore a legacy UI template');
  const appRoot=$('#opendesk-react-app').toString();
  const links=$('head link[rel=stylesheet]').map((_,node)=>relative(root,resolve(root,'src',$(node).attr('href')))).get()
    .filter(path=>path!=='src/ui/time-review.css');
  must(JSON.stringify(links)===JSON.stringify(stylePaths),'official CSS list/order drift');
  const officialCss=initial.slice(1,1+stylePaths.length).map(([,bytes])=>bytes.toString()).join('\n');
  must(!/<\/style/i.test(officialCss),'official CSS cannot terminate its element');
  const temp=await mkdtemp(join(tmpdir(),'opendesk-six-react-'));
  const sources=new Map(initial),entry=join(temp,'preview-entry.mjs'),bundle=join(temp,'bundle');
  const clipperStage=generateClipperStage(sources,{compiledCss:await compileSharedToolCss(sources.get(clipperStagePaths[1]).toString())});
  try{
    const clipperVersion=JSON.parse(await readFile(join(root,'examples/sidebar-tools/web-markdown-clipper/tool.config.json'),'utf8')).version;
    const localeTool=await createSidebarToolPackage(join(root,'examples/sidebar-tools/reading-toc'));
    await writeFile(entry,previewEntry.replace('CLIPPER_STAGE_DOCUMENT',JSON.stringify(clipperStage)).replace('CLIPPER_TOOL_VERSION',clipperVersion)
      .replace('LOCALE_PREVIEW_TOOL',JSON.stringify(localeTool)));
    await build({root,configFile:false,logLevel:'error',
      plugins:[{name:'opendesk-offline-app-inputs',enforce:'pre',
        async load(id){
          const path=id.split('?')[0];
          if(path.startsWith(root)&&!path.includes('/node_modules/')&&/\.(?:[cm]?[jt]sx?|css)$/.test(path)){
            const key=relative(root,path);
            if(!sources.has(key))sources.set(key,await readFile(path));
          }
          return null;
        }}],
      define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{
        target:'es2022',outDir:bundle,emptyOutDir:true,minify:'esbuild',sourcemap:false,cssCodeSplit:false,
        lib:{entry,formats:['iife'],name:'OpenDeskSidebarPreview',fileName:()=> 'preview.js'}
      }});
    const scripts=(await readdir(bundle)).filter(path=>path.endsWith('.js'));
    must(scripts.length===1,'single offline bundle required');
    const compiled=await readFile(join(bundle,scripts[0]));
    const componentCss=(await Promise.all((await readdir(bundle)).filter(path=>path.endsWith('.css')).map(path=>readFile(join(bundle,path),'utf8')))).join('\n');
    must(!/<\/style/i.test(componentCss),'component CSS cannot terminate its element');
    must(compiled.length>20000&&!compiled.toString().includes('process.env.NODE_ENV'),'React production bundle missing');
    for(const [path,bytes]of sources)must(bytes.equals(await readFile(join(root,path))),'source changed during generation: '+path);
    const inputSha256=digest(initial),sourceInputs=[...sources].sort(([a],[b])=>a.localeCompare(b));
    const bundleInputSha256=digest(sourceInputs);
    // Preserve a visible failure reason even when React crashes before its first render.
    // No unsafe HTML and no exception payload is sent to a server.
    const probe=`(function(){
      function report(error){
        const message=String(error||'未知启动错误').slice(0,300);
        document.documentElement.dataset.previewBootError=message;
        const banner=document.getElementById('od-sidebar-preview-error');
        if(banner){banner.textContent='React 预览启动失败：'+message+
          '。请重新执行 node scripts/preview/build-sidebar-six-react-preview.mjs，并检查浏览器控制台。';
          banner.hidden=false;}
        document.getElementById('od-sidebar-preview-boot')?.remove();
      }
      window.addEventListener('error',e=>report(e.message));
      window.addEventListener('unhandledrejection',e=>report(e.reason));
    })();`;
    const executable=Buffer.concat([Buffer.from(probe),compiled]);
    // Preview theme selectors reuse the exact canonical token bodies. No
    // copied palette or product styling is maintained by this adapter.
    const tokenCss=await readFile(join(root,'src/ui/design-tokens.css'),'utf8');
    const lightTokens=tokenCss.match(/:root\{([\s\S]*?)\n\}/)?.[1];
    const darkTokens=tokenCss.slice(tokenCss.indexOf('@media(prefers-color-scheme:dark)'))
      .match(/:root\{([\s\S]*?)\n  \}/)?.[1];
    must(lightTokens&&darkTokens,'canonical theme tokens unavailable');
    const themeCss=':root[data-opendesk-preview-theme="light"]{'+lightTokens+'}\n'+
      ':root[data-opendesk-preview-theme="dark"]{'+darkTokens+'}';
    const html=[
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data:; '+
        'style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; frame-src \'self\' about:; '+
        'object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
      '<meta name="od-preview-proof" content="UI_PREVIEW_ONLY">',
      '<meta name="od-source-input-sha256" content="'+inputSha256+'">',
      '<meta name="od-bundle-source-sha256" content="'+bundleInputSha256+'">',
      '<title>OpenDesk · 可信侧边栏离线设计预览</title>',
      '<style id="od-official-ui-css">'+officialCss+'\n'+componentCss+'\n'+themeCss+'</style>',
      '<style>'+
        'html,body{height:auto;min-height:100%;overflow:auto!important}'+
        'body{display:block;margin:0;padding:16px;background:var(--od-bg,#f8f8f8)}'+
        '.od-sidebar-preview-shell{width:min(100%,400px);max-width:100%;margin:auto}'+
        '.od-sidebar-preview-header{display:flex;align-items:center;justify-content:space-between;'+
          'gap:12px;flex-wrap:wrap;margin:0 0 10px;color:var(--od-ink);font:12px/1.5 sans-serif}'+
        '.od-sidebar-preview-header strong{font-size:14px}'+
        '.od-sidebar-preview-header label{display:flex;align-items:center;gap:6px;margin:0}'+
        '.od-sidebar-preview-header select{width:auto;min-height:30px;padding:3px 8px}'+
        '.od-sidebar-preview-stage{display:flex;flex-direction:column;position:relative;'+
          'height:clamp(520px,calc(100dvh - 150px),860px);min-height:520px;min-width:0;'+
          'overflow:hidden;background:var(--od-paper);border:1px solid var(--od-line);'+
          'border-radius:var(--radius-surface)}'+
        '#opendesk-react-app{flex:1 1 auto;min-height:0;height:100%;overflow:hidden}'+
        '#od-preview-gallery{display:none}'+
        '#od-preview-gallery:not(:empty){display:block;position:absolute;inset:0;overflow:auto;'+
          'z-index:20;background:var(--od-bg)}'+
        'body>.workflow-sheet-overlay{inset:var(--od-preview-stage-top) auto auto var(--od-preview-stage-left);'+
          'width:var(--od-preview-stage-width);height:var(--od-preview-stage-height)}'+
        'body>.workflow-sheet-overlay .workflow-sheet-panel{max-height:min(72dvh,560px,100%)}'+
        'body>.workflow-sheet-overlay .od-shared-provider-sheet{max-height:calc(100% - 58px)}'+
        '.od-sidebar-preview-notice{margin:9px 0 0;color:var(--od-sub);font:11px/1.5 sans-serif}'+
        '.od-sidebar-preview-boot,.od-sidebar-preview-error{position:absolute;z-index:25;'+
          'inset:48px 8px auto;padding:12px;border-radius:8px;'+
          'border:1px solid var(--od-line);background:var(--od-paper);color:var(--od-ink);'+
          'font:12px/1.6 sans-serif;overflow-wrap:anywhere}'+
        '.od-sidebar-preview-error{color:var(--od-negative);border-color:var(--od-negative)}'+
        '.od-sidebar-preview-error[hidden]{display:none!important}'+
        '@media(max-width:420px){body{padding:10px}'+
         '.od-sidebar-preview-stage{height:clamp(520px,calc(100dvh - 125px),860px)}}'+
      '</style>',
      '</head><body><div id="od-sidebar-preview-shell" class="od-sidebar-preview-shell">'+
        '<header class="od-sidebar-preview-header" data-preview-development-only="true">'+
          '<strong>OpenDesk · React UI 预览</strong>'+
          '<label>宽度 <select id="od-sidebar-preview-width" aria-label="预览宽度">'+
            '<option value="320">320</option><option value="360">360</option>'+
            '<option value="400" selected>400</option><option value="440">440</option>'+
            '<option value="520">520</option><option value="960">960</option></select></label>'+
          '<label>主题 <select id="od-sidebar-preview-theme" aria-label="预览主题">'+
            '<option value="auto">跟随系统</option><option value="light">浅色</option>'+
            '<option value="dark">深色</option></select></label>'+
        '</header>',
      '<div id="od-sidebar-preview-stage" class="od-sidebar-preview-stage">'+
        '<div id="od-sidebar-preview-boot" class="od-sidebar-preview-boot" role="status">'+
          '正在加载正式 React 界面… 若持续只有此提示，请检查浏览器控制台。'+
        '</div>'+
        '<div id="od-sidebar-preview-error" class="od-sidebar-preview-error" role="alert" hidden></div>'+
        appRoot+'<div id="od-preview-gallery"></div></div>',
      '<p class="od-sidebar-preview-notice">UI_PREVIEW_ONLY · 仅用于界面审阅，'+
       '无真实安装、授权、模型推理或任务执行；含开发专用调试 Tab。</p></div>',
      '<script src="data:text/javascript;base64,'+executable.toString('base64')+'"></script>',
      '</body></html>\n'
    ].join('\n');
    must(!/<script(?=\s)[^>]*src="https?:/i.test(html),'network script unexpectedly included');
    return {html,clipperStage,bytes:Buffer.byteLength(html),bundleBytes:compiled.length,inputSha256,bundleInputSha256,
      sourceInputs:sourceInputs.map(([path,bytes])=>({path,sha256:sha(bytes)}))};
  }finally{await rm(temp,{recursive:true,force:true});}
}
export async function buildSidebarSixReactPreview({check=false,outputPath=output}={}){
  const result=await generateSidebarSixReactPreview();
  const target=resolve(outputPath);
  const stageTarget=join(root,'examples/sidebar-tools/web-markdown-clipper/preview/stage.html');
  if(check){
    let current='';try{current=await readFile(target,'utf8');}catch{}
    must(current===result.html,'generated index.html missing or stale');
    must(await readFile(stageTarget,'utf8')===result.clipperStage,'generated clipper stage missing or stale');
  }else{await mkdir(dirname(target),{recursive:true});await writeFile(target,result.html,'utf8');
    await writeFile(stageTarget,result.clipperStage,'utf8');}
  return {path:target,bytes:result.bytes,bundleBytes:result.bundleBytes,inputSha256:result.inputSha256,
    bundleInputSha256:result.bundleInputSha256,sourceInputs:result.sourceInputs,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),index=args.indexOf('--out');
  const outputPath=index>=0?args[index+1]:output;
  must(outputPath&&args.every((arg,i)=>arg==='--check'||arg==='--out'||index>=0&&i===index+1),
    'usage: node scripts/preview/build-sidebar-six-react-preview.mjs [--check] [--out path]');
  try{console.log(JSON.stringify(await buildSidebarSixReactPreview({check:args.includes('--check'),outputPath})));}
  catch(error){console.error(error);process.exitCode=1;}
}
