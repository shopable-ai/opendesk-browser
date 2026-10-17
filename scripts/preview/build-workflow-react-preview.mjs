#!/usr/bin/env node
// R33.3.6: build a single offline page from the production trusted Workflow
// DOM, canonical CSS and real React 19 JSX. Not the independently maintained
// R23.9.2 design HTML; the only mock lives at the Provider/Host boundary.
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {build} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=join(root,'prototypes/sidebar/workflow/react-preview/index.html');
const inputs=[
  'src/ui/tool.html',
  'src/ui/design-tokens.css',
  'src/ui/design-system.css',
  'src/ui/tool-shell.css',
  'src/ui/react/preview/workflow-preview.tsx',
  'src/ui/react/tabs/workflow.tsx',
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
  const $=load(bytes[0].toString('utf8'),{decodeEntities:false});
  const nav=$('nav.workbench-nav').first();
  const workflow=$('#workbench-workflow');
  must(nav.length===1&&workflow.length===1,'installed Side Panel navigation/Workflow DOM not found');
  for(const id of ['workflow-editor','workflow-ai-transcript','workflow-provider-settings',
    'workflow-settings-react-host','workflow-ai-request','workflow-provider-toggle']){
    must(workflow.find('#'+id).length===1,'real DOM element missing '+id);
  }
  must(workflow.find('.workflow-head-actions').length===1,'React header target missing');
  nav.find('button').each((_,node)=>{
    const el=$(node),active=el.attr('id')==='tab-workflow';
    el.attr('aria-selected',String(active)).attr('tabindex',active?'0':'-1');
    if(!active)el.attr('aria-disabled','true').attr('disabled','');
  });
  workflow.removeAttr('hidden');
  const actualDom='<div id="od-workflow-preview-stage" class="od-workflow-preview-stage"'+
    ' style="width:360px">'+nav.toString()+
    '<main id="workspace-content">'+workflow.toString()+'</main></div>';
  const officialCss=bytes.slice(1,4).map(b=>b.toString('utf8')).join('\n');
  must(!/<\/style/i.test(officialCss),'CSS contains a style-closing token');
  const temp=await mkdtemp(join(tmpdir(),'opendesk-workflow-react-'));
  try{
    await build({root,configFile:false,logLevel:'error',
      build:{target:'es2022',outDir:temp,emptyOutDir:true,minify:'esbuild',
        sourcemap:false,cssCodeSplit:false,
        lib:{entry:join(root,'src/ui/react/preview/workflow-preview.tsx'),
          formats:['iife'],name:'OpenDeskWorkflowPreview',fileName:()=> 'preview.js'}}});
    const jsFiles=(await readdir(temp)).filter(x=>x.endsWith('.js'));
    must(jsFiles.length===1,'offline React output must be a single JS bundle');
    const compiled=await readFile(join(temp,jsFiles[0]));
    must(compiled.length>20000,'real ReactDOM is absent from the bundle');
    const previewCss=[
      '*,*::before,*::after{box-sizing:border-box}',
      'html,body{margin:0;min-width:0}',
      'body{display:block!important;background:var(--od-bg);color:var(--od-ink);min-height:100vh}',
      '.od-workflow-preview-top{display:flex;justify-content:center;padding:12px 10px 0}',
      '.od-workflow-preview-controls{width:min(100%,640px);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.od-workflow-preview-copy{flex:1 1 100%;display:grid;gap:3px;font-size:12px}',
      '.od-workflow-preview-copy strong{font-size:13px;font-weight:650}',
      '.od-workflow-preview-copy span{color:var(--od-sub);font-size:11px}',
      '.od-workflow-preview-controls label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--od-sub)}',
      '.od-workflow-preview-controls select{min-height:34px;min-width:110px;color:var(--od-ink);'+
        'border:1px solid var(--od-input-border);background:var(--od-paper);border-radius:var(--radius-control);padding:5px 8px}',
      '.od-workflow-preview-frame{padding:12px 10px 20px;display:flex;justify-content:center}',
      '.od-workflow-preview-stage{max-width:100%;height:750px;max-height:calc(100dvh - 145px);'+
        'min-height:490px;background:var(--od-bg);border:1px solid var(--od-line);'+
        'border-radius:var(--radius-surface);box-shadow:0 10px 30px #142a4c14;'+
        'overflow:hidden;display:flex;flex-direction:column;min-width:0}',
      '.od-workflow-preview-stage>.workbench-nav{flex:0 0 auto}',
      '.od-workflow-preview-stage>#workspace-content{flex:1;min-height:0;'+
        'max-width:none;width:100%;overflow:hidden}',
      '.od-workflow-preview-stage #workbench-workflow{height:100%;min-height:0}',
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
      '<!-- SOURCE_BOUND_UI_PREVIEW React19; PREVIEW_ADAPTER_NOT_NATIVE; '+
        'inputsSha256='+sourceSha+' -->',
      '<style id="od-official-ui-css">'+officialCss+'</style>',
      '<style id="od-preview-viewport-css">'+previewCss+'</style>',
      '</head><body>',
      '<div class="od-workflow-preview-top" id="od-workflow-preview-controls"></div>',
      '<div class="od-workflow-preview-frame">'+actualDom+'</div>',
      '<p class="od-workflow-preview-footer">正式 React 19 组件与正式 DOM/CSS；'+
        '模拟 UI 状态不代表 Native/Provider/RunHost 业务验收</p>',
      '<div id="od-workflow-preview-root" hidden></div>',
      '<script src="data:text/javascript;base64,'+compiled.toString('base64')+'"></script>',
      '</body></html>\n'
    ].join('\n');
    must(!/<script(?=\s)[^>]*src="https?:/i.test(page),
      'preview must contain no network scripts');
    return {html:page,inputSha256:sourceSha,bytes:Buffer.byteLength(page),
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
    bundleBytes:result.bundleBytes,check};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  must(args.length===0||(args.length===1&&args[0]==='--check'),
    'usage: node scripts/preview/build-workflow-react-preview.mjs [--check]');
  try{console.log(JSON.stringify(await buildWorkflowReactPreview({check:args[0]==='--check'})));}
  catch(error){console.error(error);process.exitCode=1;}
}
