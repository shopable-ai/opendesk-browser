// Memory-only design preview: frozen pre-redesign sidebar + existing Settings.
// Baseline substitutions are preview-only; never write production sources.
// Builds no Browser/package and executes no privileged Host.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,join,relative} from 'node:path';
import {build} from 'esbuild';
import {managementActionsPreview} from '../preview/management-actions.mjs';
import {officialDesignSources,canonicalThemeOverride,compileSharedToolCss,SHARED_DESIGN_MARKER} from '../../../scripts/preview/shared-tool-design.mjs';
import {sidebarPreviewShellSource} from '../../../scripts/preview/sidebar-shell-source.mjs';

const project=fileURLToPath(new URL('..',import.meta.url)),repo=resolve(project,'../..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const serve=process.argv.includes('--serve');
const currentSources=process.argv.includes('--current-sources');
const cliValue=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const initialView=cliValue('--view','quick');
if(!['quick','settings','add'].includes(initialView))throw Error('Invalid --view');
const aliases={'@opendesk/ui':join(repo,'src/ui/react/components/ui/button.tsx')};
const entry=join(project,'preview/main.jsx');
const frameEntry=join(project,'preview/frame.jsx');
const sources={};
const baseline=currentSources?null:JSON.parse(await readFile(join(project,'preview/baseline/source.json'),'utf8'));
for(const row of Object.values(baseline?.files||{}))if(hash(await readFile(join(repo,row.snapshot)))!==row.sha256)throw Error('Frozen sidebar input changed: '+row.snapshot);
const replacements=new Map(Object.entries(baseline?.files||{}).map(([original,row])=>[join(repo,original),join(repo,row.snapshot)]));
const snapshotPath=path=>replacements.get(path)||path;
const baselinePlugin={name:'ai-proxy-frozen-sidebar',setup(builder){
  builder.onLoad({filter:/\.(tsx|css)$/},async args=>{
    const snapshot=replacements.get(args.path);if(!snapshot)return;
    await input(relative(repo,snapshot));
    let contents=await readFile(snapshot,'utf8');
    if(args.path===join(project,'src/QuickPanel.tsx'))contents=managementActionsPreview(contents);
    return {contents,loader:args.path.endsWith('.tsx')?'tsx':'css',resolveDir:resolve(args.path,'..')};
  });
}};
async function input(name){const bytes=await readFile(join(repo,name));sources[name]={bytes:bytes.length,sha256:hash(bytes)};return bytes.toString();}
const cssRaw={name:'ai-proxy-raw-css',setup(builder){
  builder.onResolve({filter:/\?(?:inline|raw)$/},args=>({path:resolve(args.resolveDir,args.path.split('?')[0]),namespace:'raw-css'}));
  builder.onLoad({filter:/.*/,namespace:'raw-css'},async args=>{
    if(!args.path.endsWith('.css'))return {contents:await readFile(args.path,'utf8'),loader:'text'};
    const css=await build({entryPoints:[args.path],bundle:true,write:false,metafile:true,plugins:[baselinePlugin]});
    for(const path of Object.keys(css.metafile.inputs))await input(relative(repo,snapshotPath(resolve(path))));
    const source=await readFile(snapshotPath(args.path),'utf8');
    // Use the packer's public visual extraction, never the full host stylesheet.
    const bundled=(source.trimStart().startsWith(SHARED_DESIGN_MARKER)?SHARED_DESIGN_MARKER+'\n':'')+css.outputFiles[0].text;
    return {contents:await compileSharedToolCss(bundled),loader:'text'};
  });
}};
// Only the outer preview imports the real Host confirmation styles. The tool
// iframe continues to receive its own compiled, sandbox-safe visual resources.
const outerStyles={name:'ai-proxy-preview-host-styles',setup(builder){
  builder.onLoad({filter:/\.css$/},async args=>{
    const css=await input(relative(repo,args.path));
    return {contents:'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.head.append(style);',loader:'js'};
  });
}};
async function documentHtml({script,watch=false,initial={scenario:'success',view:'quick'}}={}){
  await input('projects/ai-proxy/scripts/stage-preview.mjs');
  await input('projects/ai-proxy/preview/baseline/source.json');
  await input('projects/ai-proxy/preview/management-actions.mjs');
  await input('scripts/preview/shared-tool-design.mjs');
  const [template,behavior,design,shell,light,tokens,components,shared]=await Promise.all([
    input('scripts/templates/sidebar-tool-preview-shell.html'),input('scripts/preview/sidebar-shell-behavior.js'),
    officialDesignSources(),sidebarPreviewShellSource({tool:'ai-proxy'}),canonicalThemeOverride('light'),
    input('src/ui/design-tokens.css'),input('src/ui/design-system.css'),input('src/ui/react/components/ui/sidebar-shared.css')]);
  const frameBuild=await build({entryPoints:[frameEntry],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',
    minify:true,jsx:'automatic',alias:aliases,plugins:[cssRaw,baselinePlugin],metafile:true,
    define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":true,"MODE":"preview"}'}});
  for(const path of Object.keys(frameBuild.metafile.inputs)){
    if(path.startsWith('<'))continue;
    const name=path.startsWith('raw-css:')?relative(repo,snapshotPath(path.slice(8))):relative(repo,snapshotPath(resolve(path)));
    if(!name.startsWith('../')&&!name.includes('node_modules/'))await input(name);
  }
  const frameHtml='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
    '<style>html,body{margin:0;height:100%;}#ai-proxy-app{height:100dvh}</style>'+
    '<script type="application/json" id="ai-proxy-preview-config">'+json(initial)+'</script><div id="ai-proxy-app"></div>'+
    '<script src="data:text/javascript;base64,'+Buffer.from(frameBuild.outputFiles[0].text).toString('base64')+'"></script></html>';
  const manifest={format:'ai-proxy.preview-only-dual-document.v3',productionParity:false,currentSources,baselineSubstitution:!currentSources,baseline,
    commit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
    presentation:currentSources?'Current App/QuickPanel/Settings + production confirmation; memory-only SDK boundary':'Preview-only baseline substitution + existing App/Settings; not current production parity',runtime:'React 19.2.0 + canonical @opendesk/ui',
    container:'sidebar-tool-frame > sandbox allow-scripts > same App/Surface',iframe:true,
    simulation:'Memory service/storage only. No Chrome, real proxy, network probes or persistence.',sources,
    nativeChrome:'NOT_TESTED',browserInteraction:'NOT_TESTED'};
  const values={PAGE_TITLE:'AI Proxy · 交互设计预览',TOOL_NAME:'AI Proxy',SCENARIO:'success',TOOL_THEME:'light',
    SOURCE_COMMIT:manifest.commit,DESIGN_SHA:design.digest,SHELL_SHA:shell.digest,UI_SHA:hash(json(sources)),
    TOKENS:tokens,COMPONENTS:components+'\n'+shared,SHELL_CSS:shell.css,LIGHT_CSS:light,WIDTH:'400',HEIGHT:'800',NAV:shell.nav,HEADER:shell.head,
    APP_CONTENT:'<div id="od-preview-app"><div id="sidebar-tool-frame" class="sidebar-tool-frame"><iframe id="opendesk-preview-frame" class="sidebar-tool-iframe" title="AI Proxy · 内存模拟" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div></div>',
    PREVIEW_CONTROLS:'<aside class="preview-diagnostic-area" aria-label="离线预览辅助"><p id="preview-sidebar-session" role="status">体验直连：选择「直连」→「启用直连」，直接执行，无二次弹窗；暂停后可再次启用。齿轮或「管理全部」打开独立管理页。</p><details><summary>预览说明与辅助 · 非正式工具</summary><p>'+(currentSources?'侧栏和管理页使用当前业务源码；直连免二次确认，新代理线路仍复用正式审阅组件与文案。':'侧栏采用改版前业务源码快照；PC 复用现有管理组件。')+' 真实浏览器标签页仅演示导航，不代表正式 Host 已接线。两页共享本次内存模拟，不调用真实 Chrome、代理、网络或正式存储；恢复初始预览同时清除模拟线路授权。</p><div class="preview-controls"><button type="button" class="od-button" data-preview-view="settings">PC 管理预览 ↗</button><label>模拟状态<select id="od-preview-scenario">'+['success','empty','permission-denied','conflict','error','revoked'].map(s=>'<option value="'+s+'"'+(s===initial.scenario?' selected':'')+'>'+s+'</option>').join('')+'</select></label><button id="od-preview-restore" class="od-button" type="button">恢复初始预览</button></div><p id="od-preview-controls-feedback" role="status">打开管理页或存在未保存内容时保留当前会话，不自动重置。</p><p>本次内存操作计数 <output id="preview-operation-receipt"></output></p></details></aside>',
    SHELL_BEHAVIOR:behavior,SHELL_DATA_JSON:json({title:'AI Proxy',scenario:initial.scenario,theme:'light',initialView:initial.view,currentSources,frameBase64:Buffer.from(frameHtml).toString('base64')}),MANIFEST_JSON:json(manifest),
    ADBLOCK_SNAPSHOTS_JSON:'{}',ADBLOCK_HOST_CSS:'',ADBLOCK_HOST:'',ADBLOCK_RESTORE_DIALOG:'',ADBLOCK_PREVIEW_SCRIPT:''};
  const csp="default-src 'none'; script-src 'self' data: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src "+(watch?"'self'":"'none'")+"; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'self' about:";
  return {manifest,frameHtml,html:template.replace(/\{\{([A-Z_]+)\}\}/g,(_,name)=>{if(!Object.hasOwn(values,name))throw Error(name);return values[name];})
    .replace('<html lang="zh-CN">','<html lang="zh-CN" data-preview-watch="'+watch+'">')
    .replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+csp+'">')
    .replace('</head>','<style>[data-ai-proxy-compare="true"] .preview-meta,[data-ai-proxy-compare="true"] .preview-diagnostic-area{display:none}[data-ai-proxy-compare="true"] .preview-stage{padding:0}[data-ai-proxy-compare="true"] .preview-device{border:0;border-radius:0}[data-ai-proxy-surface="management"] .preview-meta,[data-ai-proxy-surface="management"] .workbench-nav,[data-ai-proxy-surface="management"] .sidebar-tool-view-head{display:none}[data-ai-proxy-surface="management"] .preview-stage{padding:0 24px 24px}[data-ai-proxy-surface="management"] .preview-device{width:min(1280px,calc(100vw - 50px))}[data-ai-proxy-surface="management"] .preview-body{padding:0}[data-ai-proxy-surface="management"] #opendesk-preview-frame{height:calc(100dvh - 120px);min-height:600px}#preview-management-bar{max-width:1280px;box-sizing:border-box;margin:0 auto;padding:16px 24px;display:flex;gap:12px;align-items:center}#preview-management-bar[hidden]{display:none}#preview-management-bar strong{font-size:16px}#preview-management-bar .preview-badge{font-size:12px;color:var(--od-sub)}#preview-draft-state{margin-left:auto;font-size:12px;color:var(--od-sub)}</style></head>')
    .replace('<body>','<body><header id="preview-management-bar" hidden><strong>AI Proxy</strong><span class="preview-badge">管理 · 交互预览</span><span id="preview-draft-state" role="status"></span><button id="preview-return" class="od-button od-button--secondary" type="button">返回侧栏</button><button id="preview-close" class="od-button od-button--secondary" type="button">关闭管理页</button></header>')
    .replace('</body>',script+'</body>')};
}

if(serve){
  const {createServer}=await import('vite');
  let revision=randomUUID();
  const server=await createServer({configFile:false,root:repo,resolve:{alias:aliases,dedupe:['react','react-dom']},
    esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:43263,strictPort:true,hmr:false,
      watch:{ignored:['**/artifacts/**','**/.opendesk-preview/**','**/dist/**','**/.wxt/**']}},
    plugins:[{name:'ai-proxy-preview-document',configureServer(server){
      server.watcher.on('change',file=>{if(file.startsWith(join(project,'src'))||file.startsWith(join(project,'trusted'))||
        file.startsWith(join(project,'preview'))||file.includes('/src/ui/'))revision=randomUUID();});
      server.middlewares.use(async(req,res,next)=>{
        if(req.url==='/__ai-proxy-preview-revision'){res.setHeader('Cache-Control','no-store');res.end(revision);return;}
        if(!['/','/ai-proxy-preview','/ai-proxy-content','/index.html'].includes(req.url?.split('?')[0]))return next();
        try{
          const params=new URL(req.url,'http://127.0.0.1').searchParams;
          const scenario=['success','empty','permission-denied','conflict','error','revoked'].includes(params.get('scenario'))?params.get('scenario'):'success';
          const view=['quick','add','settings'].includes(params.get('view'))?params.get('view'):'quick';
          const {html,frameHtml}=await documentHtml({initial:{scenario,view},watch:true,script:'<script type="module" src="/projects/ai-proxy/preview/main.jsx"></script>'});
          res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(req.url.split('?')[0]==='/ai-proxy-content'?frameHtml:html);
        }catch(error){res.statusCode=500;res.end(String(error.stack));}
      });
    }}]});
  await server.listen();console.log('AI_PROXY_PREVIEW http://127.0.0.1:43263/ai-proxy-preview');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit();});
}else{
  const result=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',
    minify:true,jsx:'automatic',alias:aliases,plugins:[cssRaw,baselinePlugin,outerStyles],metafile:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":true,"MODE":"preview"}'}});
  for(const path of Object.keys(result.metafile.inputs)){
    if(path.startsWith('<'))continue;
    const name=path.startsWith('raw-css:')?relative(repo,snapshotPath(path.slice(8))):relative(repo,snapshotPath(resolve(path)));
    if(!name.startsWith('../')&&!name.includes('node_modules/'))await input(name);
  }
  await input('projects/ai-proxy/scripts/stage-preview.mjs');
  await input('projects/ai-proxy/preview/baseline/source.json');
  await input('projects/ai-proxy/preview/management-actions.mjs');
  const js=result.outputFiles[0].text;
  const {html,manifest}=await documentHtml({initial:{scenario:'success',view:initialView},script:'<script src="data:text/javascript;base64,'+Buffer.from(js).toString('base64')+'"></script>'});
  for(const [path,row]of Object.entries(sources))if(hash(await readFile(join(repo,path)))!==row.sha256)throw Error('Preview input changed: '+path);
  const out=join(project,'.opendesk-preview'),snapshot=join(out,'source-'+randomUUID());await mkdir(snapshot,{recursive:true});
  await writeFile(join(snapshot,'preview.html'),html);await writeFile(join(snapshot,'manifest.json'),json({...manifest,outputs:{'preview.html':hash(html)}}));
  const target=relative(out,join(snapshot,'preview.html')),tmp=join(out,randomUUID()+'.new');
  await writeFile(tmp,'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url='+target+'"><a href="'+target+'">AI Proxy React 同源预览</a>');
  await rename(tmp,join(out,'index.html'));
  const requestedOut=cliValue('--out',null);
  if(requestedOut){
    const file=resolve(repo,requestedOut);
    if(!file.startsWith(join(project,'preview')+'/')||!file.endsWith('.html'))throw Error('--out must be an HTML file in this project preview directory');
    const context={tool:'ai-proxy',view:initialView,surface:initialView==='settings'?'management':'side-panel',source:manifest.presentation,baseline,simulation:manifest.simulation,hostInteractions:['trusted-direct-explicit-apply-without-review','direct-selection-without-apply','direct-pause-reenable-without-review','stop-without-review','new-proxy-route-review','cancel-without-apply'],activation:'Trusted AI Proxy UI provenance and activation simulated at the boundary; native activation is not proven',nativeChrome:'NOT_TESTED',htmlSha256:hash(html)};
    await writeFile(file,html);
    await writeFile(file.slice(0,-5)+'.manifest.json',json({...manifest,outputs:{[file.split('/').pop()]:hash(html)}}));
    await writeFile(file.slice(0,-5)+'.context.json',json(context));
    console.log(JSON.stringify({publishedPreview:file,sha256:hash(html)}));
  }
  console.log(JSON.stringify({preview:join(snapshot,'preview.html'),sha256:hash(html),sources:Object.keys(sources).length}));
}
