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
const toolbar={query:'',kind:'all',scope:'smart',language:'zh-CN',menuOpen:false};
const publishToolbar=()=>app.renderToolbar({...toolbar,
  onSearch:value=>{toolbar.query=value;publishToolbar();},
  onKind:value=>{toolbar.kind=value;publishToolbar();},
  onScope:value=>{toolbar.scope=value;publishToolbar();},
  onLanguage:value=>{toolbar.language=value;publishToolbar();},
  onToggleMenu:()=>{toolbar.menuOpen=!toolbar.menuOpen;publishToolbar();}
});
publishToolbar();
app.renderFeedback({showEmpty:true,emptyText:'仅预览 · 没有真实安装记录',countText:'仅预览'});
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
