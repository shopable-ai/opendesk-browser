#!/usr/bin/env node
// R33.3.6: build a single offline page from the production trusted Workflow
// DOM, canonical CSS and real React 19 JSX. Not the independently maintained
// R23.9.2 design HTML; the only mock lives at the Provider/Host boundary.
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {build} from 'vite';
import {renderSidebarReact} from './react-sidebar-ssr.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'prototypes/sidebar/workflow/react-preview/index.html');
const inputs=[
  'src/ui/sidepanel.html',
  'src/ui/design-tokens.css',
  'src/ui/design-system.css',
  'src/ui/tool-shell.css',
  'src/ui/react/preview/workflow-preview.tsx',
  'src/ui/react/preview/shared-ai-preview.js',
  'src/ui/conversation/draft-suggestion.js',
  'src/ui/react/app-shell.tsx',
  'src/ui/workflow/workflow-ui-state.js',
  'src/ui/react/tabs/workflow.tsx',
  'src/ui/react/components/conversation.tsx',
  'src/ui/react/main.tsx',
  'src/ui/react/components/provider-settings.tsx',
  'src/ui/react/components/conversation-dock.css',
  'src/ui/ai/provider-https-source.js',
  'src/ui/workflow/workflow-view.js',
  'scripts/preview/build-workflow-react-preview.mjs',
  'package.json',
  'package-lock.json'
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const must=(ok,message)=>{if(!ok)throw Error('E_WORKFLOW_REACT_PREVIEW: '+message);};
export async function generateWorkflowReactPreview(){
  const bytes=await Promise.all(inputs.map(path=>readFile(join(root,path))));
  const sourceSha=sha(Buffer.concat(bytes.flatMap((value,i)=>[
    Buffer.from(inputs[i]+'\u0000'),value,Buffer.from('\u0000')])));
  const $=load(await renderSidebarReact({activeTab:'workflow',debugEnabled:true,
    providerSettings:{settingsSnapshot:()=>({
      source:'local_codex',endpoint:'',model:'',hasApiKey:false,generation:1
    }),subscribeSettings:()=>()=>{}}}),{decodeEntities:false});
  const nav=$('nav.workbench-nav').first();
  const workflow=$('#workbench-workflow');
  must(nav.length===1&&workflow.length===1,'installed Side Panel navigation/Workflow DOM not found');
  for(const id of ['workflow-editor','workflow-ai-transcript',
    'workflow-history-panel','workflow-provider-toggle']){
    must(workflow.find('#'+id).length===1,'real DOM element missing '+id);
  }
  must(workflow.find('.workflow-head-actions').length===1,'React header target missing');
  must(workflow.find('.workflow-composer-frame').length===1,
    'shared composer Portal target missing from SSR structure');
  must(workflow.find('#workflow-provider-toggle[aria-haspopup="menu"]').length===1,
    'shared AI source icon menu missing');
  must(workflow.find('.workflow-source-name').length===0,
    'standalone legacy model-name label leaked into shared Workflow');
  // Validate the installed JSX SSR, but mount the installed SidebarAppShell
  // through mountSidebarApp rather than portalling into its already-owned DOM.
  // One product React root renders navigation, WorkflowPage and its settings.
  const actualDom='<div id="od-workflow-preview-stage" class="od-workflow-preview-stage"'+
    ' data-preview-theme="light" style="width:360px"><div id="opendesk-react-app"></div></div>';
  const officialCss=bytes.slice(1,4).map(b=>b.toString('utf8')).join('\n');
  must(!/<\/style/i.test(officialCss),'CSS contains a style-closing token');
  const temp=await mkdtemp(join(tmpdir(),'opendesk-workflow-react-'));
  const sources=new Map(inputs.map((path,i)=>[path,bytes[i]]));
  try{
    // React 19's CJS entry reads process.env.NODE_ENV. Browser file:// has
    // no Node process global; Vite library mode must replace this at build time.
    await build({root,configFile:false,logLevel:'error',
      plugins:[{name:'opendesk-workflow-preview-inputs',enforce:'pre',
        async load(id){
          const path=id.split('?')[0];
          if(path.startsWith(root)&&!path.includes('/node_modules/')&&/\.(?:[cm]?[jt]sx?|css)$/.test(path)){
            const key=relative(root,path);
            if(!sources.has(key))sources.set(key,await readFile(path));
          }
          return null;
        }}],
      define:{'process.env.NODE_ENV':JSON.stringify('production')},
      build:{target:'es2022',outDir:temp,emptyOutDir:true,minify:'esbuild',
        sourcemap:false,cssCodeSplit:false,
        lib:{entry:join(root,'src/ui/react/preview/workflow-preview.tsx'),
          formats:['iife'],name:'OpenDeskWorkflowPreview',fileName:()=> 'preview.js'}}});
    const jsFiles=(await readdir(temp)).filter(x=>x.endsWith('.js'));
    must(jsFiles.length===1,'offline React output must be a single JS bundle');
    const compiled=await readFile(join(temp,jsFiles[0]));
    must(compiled.length>20000,'real ReactDOM is absent from the bundle');
    const componentCss=(await Promise.all((await readdir(temp)).filter(path=>path.endsWith('.css'))
      .map(path=>readFile(join(temp,path),'utf8')))).join('\n');
    must(!/<\/style/i.test(componentCss),'component CSS cannot terminate its element');
    for(const [path,value]of sources)
      must(value.equals(await readFile(join(root,path))),'source changed during generation: '+path);
    const sourceInputs=[...sources].sort(([a],[b])=>a.localeCompare(b));
    const bundleInputSha256=sha(Buffer.concat(sourceInputs.flatMap(([path,value])=>[
      Buffer.from(path+'\u0000'),value,Buffer.from('\u0000')])));
    const previewCss=[
      '*,*::before,*::after{box-sizing:border-box}',
      'html,body{margin:0;min-width:0}',
      'body{display:block!important;background:var(--od-bg);color:var(--od-ink);min-height:100vh}',
      '.od-workflow-preview-top{display:flex;justify-content:center;padding:12px 10px 0}',
      '.od-workflow-preview-controls{width:min(100%,640px);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.od-workflow-preview-copy{flex:1 1 100%;display:grid;gap:3px;font-size:12px}',
      '.od-workflow-preview-copy strong{font-size:13px;font-weight:650}',
      '.od-workflow-preview-copy span{color:var(--od-sub);font-size:11px}',
      '.od-workflow-preview-controls label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--od-sub);white-space:nowrap;flex:0 0 auto}',
      '.od-workflow-preview-controls select{min-height:34px;min-width:110px;color:var(--od-ink);'+
        'border:1px solid var(--od-input-border);background:var(--od-paper);border-radius:var(--radius-control);padding:5px 8px}',
      '.od-workflow-preview-frame{padding:12px 10px 20px;display:flex;justify-content:center}',
      '.od-workflow-preview-stage{max-width:100%;height:750px;max-height:calc(100dvh - 145px);'+
        'min-height:490px;background:var(--od-bg);border:1px solid var(--od-line);'+
        'border-radius:var(--radius-surface);box-shadow:0 10px 30px #142a4c14;'+
        'overflow:hidden;display:flex;flex-direction:column;min-width:0;position:relative;'+
        'color:var(--od-ink);--ink:var(--od-ink);--sub:var(--od-sub);--line:var(--od-line);'+
        '--blue:var(--od-brand);--paper:var(--od-paper);'+
        '--od-action-bg:var(--od-muted);--od-action-border:var(--od-input-border);--od-action-ink:var(--od-ink)}',
      // In the real extension the Side Panel IS the viewport. Here the
      // external 360px review frame must bound the unchanged modal.
      'body>.workflow-sheet-overlay{inset:var(--od-preview-stage-top) auto auto var(--od-preview-stage-left);'+
        'width:var(--od-preview-stage-width);height:var(--od-preview-stage-height)}',
      'body>.workflow-sheet-overlay .workflow-sheet-panel{max-height:min(72dvh,560px,100%)}',
      '.od-workflow-preview-stage #opendesk-react-app{height:100%;min-height:0;'+
        'display:flex;flex-direction:column;overflow:hidden}',
      '.od-workflow-preview-stage .workbench-nav{flex:0 0 auto}',
      '.od-workflow-preview-stage #workspace-content{flex:1;min-height:0;'+
        'max-width:none;width:100%;overflow:hidden}',
      '.od-workflow-preview-stage #workbench-workflow{height:100%;min-height:0}',
      // Only review controls override tokens; production components use the
      // unchanged official design system. Dark values reuse its dark palette.
      '.od-workflow-preview-stage[data-preview-theme="dark"]{'+
        '--od-ink:var(--od-dark-ink);--od-sub:var(--od-dark-sub);'+
        '--od-line:var(--od-dark-line);--od-brand:var(--od-dark-brand);'+
        '--od-paper:var(--od-dark-paper);--od-bg:var(--od-dark-bg);'+
        '--od-input-border:var(--od-dark-input-border);--od-focus:var(--od-dark-accent-ink);'+
        '--od-positive:var(--od-dark-positive);--od-negative:var(--od-dark-negative);'+
        '--od-muted:var(--od-dark-muted);--od-accent-ink:var(--od-dark-accent-ink);'+
        '--od-warning-bg:#392d21;'+
        '--od-warning-border:#8b6841;--od-warning-ink:#f6dca8}',
      '.od-workflow-preview-stage[data-preview-theme="light"]{'+
        '--od-ink:#1b2c49;--od-sub:#53647e;--od-line:#e1e8f1;--od-brand:#365eda;'+
        '--od-paper:#fff;--od-bg:#f5f7fb;--od-input-border:#7f8da1;'+
        '--od-focus:#365eda;--od-positive:#117a5d;--od-negative:#ae3d4b;'+
        '--od-muted:#f5f7fb;--od-accent-ink:#365eda;'+
        '--od-warning-bg:#fff9ec;--od-warning-border:#dcc58a;--od-warning-ink:#76501b}',
      '.od-workflow-preview-stage[data-preview-theme] .workbench-nav{--od-nav-active:var(--od-accent-ink)}',
      '.od-workflow-preview-footer{text-align:center;padding:0 10px 12px;'+
        'font-size:10px;color:var(--od-sub)}',
      '@media(max-width:380px){.od-workflow-preview-frame{padding-inline:0}'+
        '.od-workflow-preview-stage{border-radius:0}}'
    ].join('\n');
    const page=[
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '+
        'script-src data:; style-src \'unsafe-inline\'; img-src data:;'+
        ' connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
      '<title>OpenDesk · Workflow 正式 React 同源离线预览</title>',
      '<meta name="od-source-input-sha256" content="'+sourceSha+'">',
      '<meta name="od-bundle-source-sha256" content="'+bundleInputSha256+'">',
      '<meta name="od-preview-proof" content="UI_PREVIEW_ONLY">',
      '<!-- SOURCE_BOUND_UI_PREVIEW React19; PREVIEW_ADAPTER_NOT_NATIVE; '+
        'inputsSha256='+sourceSha+' -->',
      '<style id="od-official-ui-css">'+officialCss+'\n'+componentCss+'</style>',
      '<style id="od-preview-viewport-css">'+previewCss+'</style>',
      '</head><body>',
      '<div class="od-workflow-preview-top" id="od-workflow-preview-controls">',
      '<div class="od-workflow-preview-controls">',
      '<div class="od-workflow-preview-copy"><strong>正式 React 同源预览</strong>',
      '<span>仅预览界面 · 不连接本机，不执行网页操作</span></div>',
      '<label>界面状态<select id="od-workflow-preview-scenario" data-preview-scenario>',
      '<option value="empty">空白</option><option value="conversation">对话</option>',
      '<option value="planning">规划中</option><option value="running">执行中</option>',
      '<option value="success">成功</option><option value="failure">失败</option>',
      '<option value="unknown">结果未知</option><option value="approval">摘要授权</option>',
      '<option value="run-review">网站权限</option>',
      '<option value="denied">授权拒绝</option><option value="disconnected">连接中断</option>',
      '<option value="history">历史</option><option value="settings">设置</option>',
      '</select></label>',
      '<label>宽度<select id="od-workflow-preview-width" data-preview-width>',
      '<option value="320">320px</option><option value="360" selected>360px</option>',
      '<option value="400">400px</option><option value="420">420px</option>',
      '<option value="440">440px</option>',
      '<option value="520">520px</option><option value="640">640px</option>',
      '<option value="768">768px</option><option value="960">960px</option></select></label>',
      '<label>主题<select id="od-workflow-preview-theme" data-preview-theme>',
      '<option value="light">浅色</option><option value="dark">深色</option>',
      '</select></label></div></div>',
      '<div class="od-workflow-preview-frame">'+actualDom+'</div>',
      '<p class="od-workflow-preview-footer">UI_PREVIEW_ONLY · 交互仅用于界面审阅，不会连接模型或操作网页</p>',
      '<div id="od-workflow-preview-root" hidden></div>',
      '<script src="data:text/javascript;base64,'+compiled.toString('base64')+'"></script>',
      '</body></html>\n'
    ].join('\n');
    must(!/<script(?=\s)[^>]*src="https?:/i.test(page),
      'preview must contain no network scripts');
    return {html:page,inputSha256:sourceSha,bundleInputSha256,bytes:Buffer.byteLength(page),
      bundleBytes:compiled.length};
  }finally{await rm(temp,{recursive:true,force:true});}
}
export async function buildWorkflowReactPreview({check=false}={}){
  const result=await generateWorkflowReactPreview();
  if(check){
    let current='';
    try{current=await readFile(output,'utf8');}catch{}
    must(current===result.html,'generated HTML missing/stale; regenerate with this script');
  }else{
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,result.html,'utf8');
  }
  return {path:output,inputSha256:result.inputSha256,bytes:result.bytes,
    bundleInputSha256:result.bundleInputSha256,
    bundleBytes:result.bundleBytes,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  must(args.length===0||(args.length===1&&args[0]==='--check'),
    'usage: node scripts/preview/build-workflow-react-preview.mjs [--check]');
  try{console.log(JSON.stringify(await buildWorkflowReactPreview({check:args[0]==='--check'})));}
  catch(error){console.error(error);process.exitCode=1;}
}
