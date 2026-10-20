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
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'prototypes/sidebar/react-preview/index.html');
const stylePaths=[
  'src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css',
  'src/ui/cloud-hosting.css','src/ui/extension-center.css'
];
const inputs=[
  'src/ui/sidepanel.html',...stylePaths,
  'src/ui/react/main.tsx','src/ui/react/app-shell.tsx',
  'src/ui/react/tabs/navigation.tsx','src/ui/react/tabs/browser-history.tsx',
  'src/ui/react/components/ui/button.tsx',
  'src/ui/react/tabs/tools.tsx','src/ui/react/tabs/develop.tsx',
  'src/ui/react/tabs/develop-controls.tsx','src/ui/react/tabs/develop-dependencies.tsx',
  'src/ui/develop-view.js','src/ui/develop-fields.js',
  'src/ui/react/preview/developer-preview.js',
  'src/ui/my-workbench-view.js','src/ui/sidebar-tools-view.js',
  'src/ui/workflow/workflow-ui-state.js','src/ui/react/tabs/workflow.tsx',
  'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/my-page.tsx',
  'src/ui/react/tabs/schedule.tsx','src/ui/react/tabs/cloud.tsx','src/ui/react/tabs/debug.tsx',
  'scripts/preview/build-sidebar-six-react-preview.mjs','package.json','package-lock.json'
];
const must=(ok,message)=>{if(!ok)throw Error('E_SIX_TAB_PREVIEW: '+message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=entries=>sha(Buffer.concat(entries.flatMap(([path,bytes])=>[
  Buffer.from(path+'\0'),bytes,Buffer.from('\0')])));

// Presentation adapters only. Production mountSidebarApp remains the sole DOM
// owner, with the same explicit onNavigate contract as src/ui/tool-shell.js.
const previewEntry=`
import {mountSidebarApp} from ${JSON.stringify(join(root,'src/ui/react/main.tsx'))};
import {createDeveloperPreviewView} from ${JSON.stringify(join(root,'src/ui/react/preview/developer-preview.js'))};
import {createMyWorkbenchView} from ${JSON.stringify(join(root,'src/ui/my-workbench-view.js'))};
import {createSidebarToolsView} from ${JSON.stringify(join(root,'src/ui/sidebar-tools-view.js'))};
import {createWorkflowUIState} from ${JSON.stringify(join(root,'src/ui/workflow/workflow-ui-state.js'))};
const proof={scope:'UI_PREVIEW_ONLY',realHost:false,realPermission:false,realResult:false};
const names=['tasks','tools','workflow','develop','cloud','debug'];
const initial=new URLSearchParams(location.search).get('tab');
document.documentElement.dataset.opendeskTab=names.includes(initial)?initial:'tasks';
const developerView=createDeveloperPreviewView();
for(const id of ['page-candidate-save','page-program-refresh'])
  if(developerView.fields[id])developerView.patch(id,{disabled:true});
const myView=createMyWorkbenchView(),toolView=createSidebarToolsView();
myView.setText('task-installed-count','仅预览 · 无真实安装任务');
myView.actions.taskSearchToggleClick=()=>{
  myView.field('task-search-panel').hidden=!myView.field('task-search-panel').hidden;myView.publish();
};
const workflow=createWorkflowUIState();
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
  chooseExample(key){workflow.control('workflow-ai-request').value={
    fill:'在本地演示表单填写内容',read:'读取本地演示页面',continue:'继续上次的工作流',check:'检查已有工作流'
  }[key]||'';}
};
let app;
const onNavigate=tab=>{
  document.documentElement.dataset.opendeskTab=tab;
  app.renderNavigation(tab);return true;
};
app=mountSidebarApp(document,{debugEnabled:true,onNavigate,developerView,myView,toolView});
app.connectWorkflowPage({...workflow,actions:workflowActions});
// Debug-only, read-only preview: no Chrome permission, history query or data.
app.renderBrowserHistory({text:'',startDate:'',endDate:'',limit:'25',busy:false,
  status:'仅界面预览 · 不读取浏览器历史',permission:'unknown',visits:null});
app.connectBrowserHistoryActions(null);
// Presentation data only: the real React component consumes the same snapshot
// contract, while no Installer, Chrome permission or Host operation is present.
const demoRows=Object.freeze([
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
    busy:false,pendingKey:null,onOpenRow:openDemoDetail,
    onMore:(key,trigger)=>{
      const row=demoRows.find(item=>item.key===key);
      if(!row)return;
      const items=[{id:'detail',label:'查看详情',onClick:()=>openDemoDetail(key)}];
      if(demoInstalled(row))items.push({id:'uninstall',label:'卸载…',onClick:event=>{
        trigger.focus({preventScroll:true});
        openDemoListUninstall(key,event);
      }});
      app.renderRowMenu(items,{key,title:row.title,trigger,onClose:closeRowMenu});
    }});
  app.renderFeedback({showEmpty:shown.length===0,
    emptyText:'仅预览 · 当前筛选下没有演示条目',
    countText:'仅预览 · '+shown.length+' 个演示条目'});
}
function publishToolbar(){
  app.renderToolbar({...toolbar,
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
window.addEventListener('pagehide',()=>{app.dispose();developerView.dispose();workflow.dispose();},{once:true});
document.documentElement.dataset.previewProof=proof.scope;
document.documentElement.dataset.previewBootScript='ready';
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
  try{
    await writeFile(entry,previewEntry);
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
    must(compiled.length>20000&&!compiled.toString().includes('process.env.NODE_ENV'),'React production bundle missing');
    for(const [path,bytes]of sources)must(bytes.equals(await readFile(join(root,path))),'source changed during generation: '+path);
    const inputSha256=digest(initial),sourceInputs=[...sources].sort(([a],[b])=>a.localeCompare(b));
    const bundleInputSha256=digest(sourceInputs);
    const probe="window.addEventListener('error',e=>{document.documentElement.dataset.previewBootError=String(e.message)});"+
      "window.addEventListener('unhandledrejection',e=>{document.documentElement.dataset.previewBootRejection=String(e.reason)});";
    const executable=Buffer.concat([Buffer.from(probe),compiled]);
    const html=[
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data:; '+
        'style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; frame-src \'none\'; '+
        'object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
      '<meta name="od-preview-proof" content="UI_PREVIEW_ONLY">',
      '<meta name="od-source-input-sha256" content="'+inputSha256+'">',
      '<meta name="od-bundle-source-sha256" content="'+bundleInputSha256+'">',
      '<title>OpenDesk · 可信侧边栏离线设计预览</title>',
      '<style id="od-official-ui-css">'+officialCss+'</style>',
      '<style>body{margin:0;padding:12px;background:var(--od-bg,#f8f8f8)}'+
        '.od-sidebar-preview-stage{max-width:480px;margin:auto}'+
        '#opendesk-react-app{min-height:640px}'+
        '.od-sidebar-preview-header{max-width:480px;margin:0 auto 12px;font:14px/1.5 sans-serif}</style>',
      '</head><body><header class="od-sidebar-preview-header" data-preview-development-only="true">'+
        'UI_PREVIEW_ONLY · 离线设计预览，含开发专用调试 Tab。'+
        '无真实安装、授权、执行结果；不是动态工具 Preview 验收。</header>',
      '<div class="od-sidebar-preview-stage">'+appRoot+'</div>',
      '<script src="data:text/javascript;base64,'+executable.toString('base64')+'"></script>',
      '</body></html>\n'
    ].join('\n');
    must(!/<script(?=\s)[^>]*src="https?:/i.test(html),'network script unexpectedly included');
    return {html,bytes:Buffer.byteLength(html),bundleBytes:compiled.length,inputSha256,bundleInputSha256,
      sourceInputs:sourceInputs.map(([path,bytes])=>({path,sha256:sha(bytes)}))};
  }finally{await rm(temp,{recursive:true,force:true});}
}
export async function buildSidebarSixReactPreview({check=false,outputPath=output}={}){
  const result=await generateSidebarSixReactPreview();
  const target=resolve(outputPath);
  if(check){
    let current='';try{current=await readFile(target,'utf8');}catch{}
    must(current===result.html,'generated index.html missing or stale');
  }else{await mkdir(dirname(target),{recursive:true});await writeFile(target,result.html,'utf8');}
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
