#!/usr/bin/env node
// R33.3.6 six-tab offline preview. DOM/CSS are extracted from the installed
// tool.html. React Portals reuse the actual trusted component implementations;
// legacy My/Cloud/Debug/Editor regions remain explicit DOM-owner snapshots.
// Generated HTML is a build artifact; edit the real sources, not index.html.
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {build} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'prototypes/sidebar/react-preview/index.html');
const stylePaths=[
  'src/ui/design-tokens.css',
  'src/ui/design-system.css',
  'src/ui/tool-shell.css',
  'src/ui/cloud-hosting.css',
  'src/ui/extension-center.css'
];
const inputs=[
  'src/ui/tool.html',
  ...stylePaths,
  'src/ui/react/main.tsx',
  'src/ui/react/components/ui/button.tsx',
  'src/ui/react/tabs/tools.tsx',
  'src/ui/react/tabs/develop.tsx',
  'src/ui/react/tabs/debug.tsx',
  'src/ui/react/tabs/workflow.tsx',
  'src/ui/react/tabs/tasks.tsx',
  'src/ui/react/tabs/cloud.tsx',
  'src/ui/react/preview/sidebar-six-preview.tsx',
  'src/ui/react/preview/sidebar-six-my-flows.tsx',
  'src/ui/schedule-plan-presentation.js',
  'scripts/preview/build-sidebar-six-react-preview.mjs',
  'package.json','package-lock.json'
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const must=(ok,message)=>{if(!ok)throw Error('E_SIX_TAB_PREVIEW: '+message);};
export async function generateSidebarSixReactPreview(){
  const files=await Promise.all(inputs.map(path=>readFile(join(root,path))));
  const sourceSha=sha(Buffer.concat(files.flatMap((value,i)=>[
    Buffer.from(inputs[i]+'\u0000'),value,Buffer.from('\u0000')])));
  const html=files[0].toString('utf8');
  const $=load(html,{decodeEntities:false});
  const nav=$('nav.workbench-nav').first();
  const workspace=$('main#workspace-content');
  const dock=$('#workspace-dock');
  must(nav.length===1&&workspace.length===1&&dock.length===1,
    'trusted navigation, workspace or dock missing');
  const tabs=['tasks','tools','workflow','develop','cloud','debug'];
  const selectors={
    tasks:'tab-my-tasks',tools:'tab-tools',workflow:'tab-workflow',
    develop:'tab-develop',cloud:'tab-cloud',debug:'tab-debug'
  };
  for(const name of tabs){
    const button=nav.find('#'+selectors[name]);
    const panel=workspace.find('#workbench-'+name);
    must(button.length===1&&panel.length===1,'tab/tabpanel missing '+name);
    must(button.attr('aria-controls')==='workbench-'+name,
      'ARIA tab relationship drift '+name);
    const active=name==='tasks';
    button.attr('aria-selected',String(active))
      .attr('tabindex',active?'0':'-1')
      .removeAttr('disabled');
    if(name==='debug')button.removeAttr('hidden')
      .attr('data-preview-development-only','true');
  }
  const mustIds=[
    'task-status','extension-center-list','extension-center-list-view',
    'extension-center-detail','extension-center-detail-body',
    'extension-center-empty','extension-center-back',
    'workflow-editor','workflow-provider-settings','workflow-settings-react-host',
    'workflow-ai-transcript','workflow-chat-intro','workflow-provider-toggle',
    'workflow-planning-indicator','workflow-ai-progress','workflow-ai-approval',
    'workflow-manage-panel','page-component-framework','develop-dock',
    'script-status','cloud-status','debug-cloud-summary','debug-snapshot',
    'task-dock','workflow-dock'
  ];
  for(const id of mustIds)must($('#'+id).length===1,'required official node missing '+id);
  must($('#workflow-editor .workflow-head-actions').length===1,'workflow React target missing');
  must($('#extension-center-list-view .ec-toolbar').length===1,'extension React target missing');
  must($('#page-component-framework .page-component-choices').length===1,
    'developer React target missing');
  must($('#develop-dock .dock-buttons').length===1,'developer buttons target missing');
  const originalLinks=$('head link[rel=stylesheet]').map((_,node)=>$(node).attr('href')).get()
    .filter(path=>path!=='time-review.css'); // CSS for time-review is a build-only asset.
  must(originalLinks.length===stylePaths.length&&
    originalLinks.every((path,i)=>('src/ui/'+path)===stylePaths[i]),
  'installed CSS list/order drift, update source-bound builder');
  const officialCss=files.slice(1,1+stylePaths.length)
    .map(value=>value.toString('utf8')).join('\n');
  must(!/<\/style/i.test(officialCss),'official CSS contains closing style token');

  // Extract existing panels, not duplicated JSX or hand-authored mock markup.
  const panelHtml=tabs.map(name=>{
    const panel=workspace.find('#workbench-'+name).first();
    panel.find('script').remove();
    panel.find('iframe').each((_,node)=>{
      $(node).removeAttr('src').removeAttr('srcdoc')
        .attr('sandbox','').attr('hidden','');
    });
    return panel.toString();
  }).join('\n');
  const catalog=workspace.find('#workbench-discover').first();
  must(catalog.length===1,'authoritative task catalog missing');
  catalog.attr('hidden','');
  const previewPanels=panelHtml+'\n'+catalog.toString();
  dock.find('script').remove();
  const actualDom='<div id="od-sidebar-preview-stage" class="od-sidebar-preview-stage" '+
    'style="width:360px">'+nav.toString()+
    '<main id="workspace-content">'+previewPanels+'</main>'+
    dock.toString()+'</div>';
  const temp=await mkdtemp(join(tmpdir(),'opendesk-six-react-'));
  try{
    await build({root,configFile:false,logLevel:'error',
      define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{
      target:'es2022',outDir:temp,emptyOutDir:true,
      minify:'esbuild',sourcemap:false,cssCodeSplit:false,
      lib:{entry:join(root,'src/ui/react/preview/sidebar-six-preview.tsx'),
        formats:['iife'],name:'OpenDeskSidebarPreview',fileName:()=> 'preview.js'}
    }});
    const jsFiles=(await readdir(temp)).filter(name=>name.endsWith('.js'));
    must(jsFiles.length===1,'single offline React bundle required');
    const compiled=await readFile(join(temp,jsFiles[0]));
    must(compiled.length>20000,'React 19 / ReactDOM missing from bundle');
    must(!compiled.toString('utf8').includes('process.env.NODE_ENV'),
      'Vite failed to inline the production React condition');
    const previewCss=[
      '*,*::before,*::after{box-sizing:border-box}',
      'html,body{margin:0;min-width:0}',
      'body{display:block!important;background:var(--od-bg);color:var(--od-ink);min-height:100vh}',
      '.od-sidebar-preview-header{display:flex;justify-content:center;padding:12px 10px 0}',
      '.od-sidebar-preview-toolbar{width:min(100%,700px);display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}',
      '.od-sidebar-preview-heading{display:grid;gap:2px;flex:1 1 100%}',
      '.od-sidebar-preview-heading strong{font-size:13px;font-weight:700}',
      '.od-sidebar-preview-heading span{font-size:11px;color:var(--od-sub)}',
      '.od-sidebar-preview-toolbar label{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--od-sub)}',
      '.od-sidebar-preview-toolbar select{min-height:34px;color:var(--od-ink);background:var(--od-paper);border:1px solid var(--od-input-border);border-radius:var(--radius-control);padding:5px 8px}',
      '.od-sidebar-preview-label{font-size:11px;color:var(--od-sub);line-height:1.4}',
      '.od-sidebar-preview-frame{padding:12px 10px 20px;display:flex;justify-content:center}',
      '.od-sidebar-preview-stage{height:750px;max-height:calc(100dvh - 135px);min-height:480px;max-width:100%;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:var(--od-bg);border:1px solid var(--od-line);border-radius:var(--radius-surface);box-shadow:0 10px 30px #142a4c14}',
      '.od-sidebar-preview-stage>.workbench-nav{flex:none}',
      '.od-sidebar-preview-stage>#workspace-content{flex:1;min-height:0;max-width:none;width:100%;overflow-y:auto}',
      '.od-sidebar-preview-stage>.workspace-dock{flex:none}',
      '.od-sidebar-preview-stage #workbench-discover .catalog-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}',
      '.od-sidebar-preview-stage #workbench-discover .catalog-card-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}',
      '.od-sidebar-preview-stage #workbench-discover .catalog-card{min-height:60px;padding:10px}',
      '.od-sidebar-preview-stage #workbench-discover .catalog-intro h2{font-size:17px!important}',
      '.od-sidebar-preview-stage .od-preview-card{display:grid;gap:6px;min-width:0;text-align:left;background:var(--od-paper);border:1px solid var(--od-line);padding:12px;border-radius:var(--radius-surface);color:var(--od-ink)}',
      '.od-sidebar-preview-stage .od-preview-actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}',
      '.od-sidebar-preview-stage .schedule-rule-row{grid-template-columns:minmax(0,1fr)}',
      '@media(max-width:380px){.od-sidebar-preview-frame{padding-inline:0}.od-sidebar-preview-stage{border-radius:0}}'
    ].join('\n');
    // Tiny isolated bootstrap probe: capture an actual Chromium script error
    // without creating a second React UI or touching installed extension code.
    const probe=Buffer.from("document.documentElement.dataset.previewBootScript='started';"+
      "window.addEventListener('error',event=>{document.documentElement.dataset.previewBootError=String(event.message).slice(0,250)});"+
      "window.addEventListener('unhandledrejection',event=>{document.documentElement.dataset.previewBootRejection=String(event.reason).slice(0,250)});");
    const result=[
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '+
      'script-src data:; style-src \'unsafe-inline\'; img-src data:; '+
      'connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
      '<title>OpenDesk · 六 Tab 正式 React 同源预览</title>',
      '<meta name="od-source-input-sha256" content="'+sourceSha+'">',
      '<!-- SOURCE_BOUND_UI_PREVIEW React19; UI_PREVIEW_ONLY; '+
        'INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED; inputsSha256='+sourceSha+' -->',
      '<style id="od-official-ui-css">'+officialCss+'</style>',
      '<style id="od-preview-viewport-css">'+previewCss+'</style>',
      '</head><body>',
      '<div id="od-sidebar-preview-controls" class="od-sidebar-preview-header"></div>',
      '<div class="od-sidebar-preview-frame">'+actualDom+'</div>',
      '<div id="od-sidebar-preview-root" hidden></div>',
      '<script src="data:text/javascript;base64,'+probe.toString('base64')+'"></script>',
      '<script src="data:text/javascript;base64,'+compiled.toString('base64')+'"></script>',
      '</body></html>\n'
    ].join('\n');
    must(!/<script(?=\s)[^>]*src="https?:/i.test(result),
      'network script unexpectedly included');
    return {html:result,bytes:Buffer.byteLength(result),bundleBytes:compiled.length,
      inputSha256:sourceSha};
  }finally{await rm(temp,{recursive:true,force:true});}
}
export async function buildSidebarSixReactPreview({check=false}={}){
  const result=await generateSidebarSixReactPreview();
  if(check){
    let current='';
    try{current=await readFile(output,'utf8');}catch{}
    must(current===result.html,'generated index.html missing or stale');
  }else{
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,result.html,'utf8');
  }
  return {path:output,bytes:result.bytes,bundleBytes:result.bundleBytes,
    inputSha256:result.inputSha256,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  must(args.length===0||(args.length===1&&args[0]==='--check'),
    'usage: node scripts/preview/build-sidebar-six-react-preview.mjs [--check]');
  try{console.log(JSON.stringify(await buildSidebarSixReactPreview({check:args[0]==='--check'})));}
  catch(error){console.error(error);process.exitCode=1;}
}
