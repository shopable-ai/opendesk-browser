// R1 offline preview: compile the exact validated sidebar tool package, then substitute ONLY its SDK boundary.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';
import {officialDesignSources,canonicalThemeOverride} from './shared-tool-design.mjs';
import {sidebarPreviewShellSource} from './sidebar-shell-source.mjs';
import {canonicalAdblockPreviewHost} from './adblock-host-source.mjs';
import {readingTocOverlayPreview} from './reading-toc-overlay-source.mjs';
import {addReadingTocControls} from './reading-toc-controls.mjs';

export const PREVIEW_FORMAT='opendesk.ui-preview.v1';
export const PREVIEW_CONTEXT_FORMAT='opendesk.ui-preview-context.v1';
export const PREVIEW_SCENARIOS=Object.freeze(['success','empty','error','loading','permission-denied','untrusted']);
export const PREVIEW_MOCK_OPERATIONS=Object.freeze(['storage.get','storage.set','currentPage.info','tasks.open']);
export const PREVIEW_ADBLOCK_OPERATIONS=Object.freeze(['adblock.status','adblock.site.restore']);
export const PREVIEW_TOC_OPERATIONS=Object.freeze(['toc.snapshot','toc.navigate']);
export const PREVIEW_BOOKMARK_OPERATIONS=Object.freeze([
  'getTree','get','search','create','update','move','remove','prepareRemoveTree','removeTree',
  'observe.start','observe.read','observe.stop'
]);
const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const base64=bytes=>Buffer.from(bytes).toString('base64');
const dataUrl=(mime,bytes)=>'data:'+mime+';base64,'+base64(bytes);
const htmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fail=message=>{throw Error('E_UI_PREVIEW: '+message);};

export async function generatePreview({
  tool='quick-notes',surface='side-panel',scenario='success',theme='light',
  width=360,height=760,out=null
}={}){
  if(!/^[a-z0-9-]{1,64}$/.test(tool))fail('invalid tool ID');
  // Fail closed: injected-page/standalone need their own real production mounting adapter.
  if(surface!=='side-panel'&&!(tool==='reading-toc'&&surface==='page-overlay'))
    fail('surface '+surface+' has no verified production preview adapter');
  if(!['quick-notes','bookmark-manager','adblock','reading-toc'].includes(tool))fail('mock SDK adapter is not implemented for '+tool);
  if(!PREVIEW_SCENARIOS.includes(scenario))fail('unsupported scenario');
  if(!['light','dark'].includes(theme))fail('unsupported theme');
  if(tool==='reading-toc'&&theme!=='light')fail('Reading TOC preview shell is light only');
  if(!Number.isInteger(width)||width<240||width>1440||
    !Number.isInteger(height)||height<320||height>2400)fail('invalid CSS viewport');
  const project=join(repoRoot,'examples/sidebar-tools',tool);
  const pkg=await createSidebarToolPackage(project);
  if(tool!=='reading-toc'&&!pkg.css.startsWith('/* opendesk.shared-design.v1 sha256='))
    fail('official design CSS is missing from the validated tool package');
  let mock,operations;
  if(tool==='quick-notes'){
    const invoked=[...pkg.js.matchAll(/\brequest\s*\(\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
    if(!invoked.length||invoked.some(operation=>!PREVIEW_MOCK_OPERATIONS.includes(operation))||
      PREVIEW_MOCK_OPERATIONS.some(operation=>!invoked.includes(operation)))
      fail('mock and real UI request operations do not match');
    mock=await readFile(new URL('./quick-notes-mock.js',import.meta.url));
    operations=PREVIEW_MOCK_OPERATIONS;
  }else if(tool==='reading-toc'){
    if(!PREVIEW_TOC_OPERATIONS.every(op=>pkg.js.includes("request('"+op+"'")))
      fail('Reading TOC preview cannot reproduce the real tool request contract');
    mock=await readFile(new URL('./reading-toc-mock.js',import.meta.url));
    operations=PREVIEW_TOC_OPERATIONS;
  }else if(tool==='adblock'){
    const invoked=[...pkg.js.matchAll(/\brequest\s*\(\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
    if(invoked.length!==2||invoked.some(op=>!PREVIEW_ADBLOCK_OPERATIONS.includes(op))||
       PREVIEW_ADBLOCK_OPERATIONS.some(op=>!invoked.includes(op)))
      fail('AdBlock mock and real sandbox request operations do not match');
    mock=await readFile(new URL('./adblock-mock.js',import.meta.url));
    operations=PREVIEW_ADBLOCK_OPERATIONS;
  }else{
    if(!pkg.js.includes('BookmarkR2Model')||!pkg.js.includes('BookmarkR2Service')||
       !pkg.js.includes('OpenDeskSDK'))
      fail('bookmark-manager package is missing the real SDK consumer');
    mock=await readFile(new URL('./bookmark-manager-mock.js',import.meta.url));
    operations=PREVIEW_BOOKMARK_OPERATIONS;
  }
  const {tokens,components,digest}=await officialDesignSources();
  const override=await canonicalThemeOverride(theme);
  const shell=await sidebarPreviewShellSource();
  const tocOverlay=tool==='reading-toc'?await readingTocOverlayPreview({scenario}):null;
  const adblock=tool==='adblock'?await canonicalAdblockPreviewHost():null;
  const shellTemplate=await readFile(new URL('../templates/sidebar-tool-preview-shell.html',import.meta.url),'utf8');
  const lightShellOverride=await canonicalThemeOverride('light');
  let commit;
  try {commit=execFileSync('git',['-C',repoRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();}
  catch {fail('a checked-out Git source revision is required');}
  if(!/^[0-9a-f]{40}$/.test(commit))fail('invalid Git source revision');
  const uiDigest=sha256(JSON.stringify([pkg.id,pkg.version,pkg.html,pkg.css,pkg.js,
    ...(pkg.scripts||[]).map(script=>[script.name,script.sha256,script.code])]));
  const frameHtml=[
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    '<link rel="stylesheet" href="'+dataUrl('text/css',pkg.css)+'">',
    '<style>'+override+'</style>',
    '</head><body><div id="tool-root">'+pkg.html+'</div>',
    '<script>Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:'+JSON.stringify(scenario)+'});</script>',
    '<script src="'+dataUrl('text/javascript',mock)+'"></script>',
    // The v2 package runs its pinned Classic dependencies before its entrypoint.
    // Omitting these produced a plausible HTML shell but a nonfunctional bookmark UI.
    ...(pkg.scripts||[]).map(script=>'<script src="'+dataUrl('text/javascript',script.code)+'"></script>'),
    '<script src="'+dataUrl('text/javascript',pkg.js)+'"></script>',
    '</body></html>'
  ].join('');
  const frameForDisplay=surface==='page-overlay'?tocOverlay?.html:frameHtml;
  const manifest=Object.freeze({
    format:PREVIEW_FORMAT,tool:pkg.id,toolVersion:pkg.version,surface,scenario,theme,
    viewport:{width,height},sourceCommit:commit,designSha256:digest,uiSha256:uiDigest,
    shellSha256:shell.digest,shellTheme:'light',previewBuild:tool==='reading-toc'?'R1.2-reading-toc':'R1.1',
    ...(tocOverlay?{trustedOverlaySourceSha256:tocOverlay.sourceSha256,
      trustedOverlayModuleSha256:tocOverlay.moduleSha256}:{}),
    mock:true,installed:false,permissionsGranted:false,
    operations
  });
  const viewportTitle='OpenDesk Browser · '+pkg.title+' · 仅供离线模拟';
  // The maintainable preview template has no copy of official component markup,
  // colors or button styling: its real Side Panel tabs/header/CSS are extracted.
  // This outer shell is always light; the inner tool may explicitly use a dark
  // diagnostic scenario without adding a theme switch to the preview UI.
  const safeJS=value=>JSON.stringify(value).replaceAll('<','\\u003c')
    .replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
  const adblockScript=adblock?await readFile(new URL('./adblock-host-preview.js',import.meta.url),'utf8'):'';
  // Test-only controls are rendered OUTSIDE the simulated Side Panel. The
  // validated tool package and its sandbox iframe contain no lab DOM.
  const bookmarkScript=tool==='bookmark-manager'?
    await readFile(new URL('./bookmark-manager-lab.js',import.meta.url),'utf8'):'';
  const bookmarkCommands=Object.freeze([
    ['write-fail','下一次写入失败'],
    ['write-unknown','下一次写入结果未知'],
    ['external-conflict','模拟外部冲突'],
    ['read-timeout','下一次读取超时'],
    ['extra-folders','新增 130 个模拟文件夹'],
    ['external-delete','模拟外部删除当前书签'],
    ['revoke','模拟撤销权限'],
    ['restore','恢复模拟权限']
  ]);
  const bookmarkLab=tool==='bookmark-manager'?[
    '<aside id="od-preview-bookmark-lab" class="preview-diagnostic-area" aria-label="书签预览辅助测试，位于扩展界面之外">',
    '<details class="od-disclosure od-surface od-surface--padded">',
    '<summary>预览测试辅助工具（不属于书签管理器）</summary>',
    '<p class="od-note">这里属于离线预览外壳，不在安装工具、Side Panel 或 iframe 内。仅用于模拟故障、冲突和权限变化。</p>',
    '<div class="od-toolbar" role="group" aria-label="离线书签模拟诊断">',
    ...bookmarkCommands.map(([command,label])=>
      '<button class="od-button od-button--secondary" type="button" data-bookmark-diagnostic="'+
      htmlEscape(command)+'">'+htmlEscape(label)+'</button>'),
    '</div>',
    '<p id="od-preview-bookmark-feedback" class="od-note" role="status" aria-live="polite">这里只会修改预览内存。操作结果请在书签预览中查看。</p>',
    '</details></aside>'
  ].join(''):'';
  const hostKey=scenario==='success'?'on-site-off':scenario==='empty'||
    scenario==='permission-denied'?'no-permission':
    scenario==='untrusted'?'on-site-on':scenario;
  const hostMarkup=adblock?adblock.snapshots[hostKey]:'';
  const adblockDialog=adblock?[
    '<dialog class="preview-confirm od-surface" id="od-preview-adblock-restore-dialog" aria-labelledby="od-preview-adblock-restore-title" aria-describedby="od-preview-adblock-restore-description">',
    '<h2 id="od-preview-adblock-restore-title">模拟恢复网站过滤？</h2>',
    '<p id="od-preview-adblock-restore-description"></p>',
    '<div class="preview-confirm-actions">',
    '<button id="od-preview-adblock-restore-cancel" class="od-button od-button--secondary" type="button">取消</button>',
    '<button id="od-preview-adblock-restore-accept" class="od-button" type="button">确认恢复</button>',
    '</div></dialog>'
  ].join(''):'';
  const values=Object.freeze({
    PAGE_TITLE:htmlEscape(viewportTitle),
    TOOL_NAME:htmlEscape(pkg.title),TOOL_NAME_JSON:safeJS(pkg.title),
    SCENARIO:htmlEscape(scenario),TOOL_THEME:htmlEscape(theme),
    TOKENS:tokens,COMPONENTS:components,SHELL_CSS:shell.css,
    ADBLOCK_HOST_CSS:adblock?.css||'',
    ADBLOCK_HOST:hostMarkup,
    ADBLOCK_RESTORE_DIALOG:adblockDialog,
    ADBLOCK_SNAPSHOTS_JSON:safeJS(adblock?{scenario,snapshots:adblock.snapshots}:{}),
    ADBLOCK_PREVIEW_SCRIPT:adblockScript,
    LIGHT_CSS:lightShellOverride,WIDTH:String(width),
    HEIGHT:String(tool==='adblock'?220:height),
    NAV:shell.nav,HEADER:shell.head,
    SOURCE_COMMIT:commit,DESIGN_SHA:digest,SHELL_SHA:shell.digest,UI_SHA:uiDigest,
    MANIFEST_JSON:safeJS(manifest),FRAME_BASE64:base64(frameForDisplay)
  });
  const used=new Set();
  let outputHtml=shellTemplate.replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,key)=>{
    if(!Object.hasOwn(values,key))fail('unsupported preview template slot '+key);
    used.add(key);return values[key];
  });
  for(const key of Object.keys(values))
    if(!used.has(key))fail('preview template is missing required slot '+key);
  if(/\{\{[A-Z0-9_]+\}\}/.test(outputHtml))
    fail('unresolved preview template slot');
  if(tool==='bookmark-manager'){
    // Insert only for this OFFLINE tool, beyond .preview-device. The shared
    // Quick Notes, Reading TOC and AdBlock preview HTML is byte-identical.
    const marker='</div>\n<dialog class="preview-confirm od-surface" id="od-preview-confirm-uninstall"';
    const insertion='</div>\n'+bookmarkLab+'\n<dialog class="preview-confirm od-surface" id="od-preview-confirm-uninstall"';
    if(!outputHtml.includes(marker)||outputHtml.split(marker).length!==2)
      fail('canonical outer preview location is unavailable');
    outputHtml=outputHtml.replace(marker,insertion);
    const labCss=[
      '.preview-diagnostic-area{max-width:880px;margin:var(--space-3) auto;padding-inline:var(--space-2);min-width:0}',
      '.preview-diagnostic-area .od-toolbar{flex-wrap:wrap}',
      '.preview-diagnostic-area .od-toolbar>button{flex:0 1 auto}',
      '.preview-diagnostic-area p{overflow-wrap:anywhere}'
    ].join('\n');
    const headClose='</head>';
    // The checked-in shell intentionally ends with a trailing newline.
    if(outputHtml.split(headClose).length!==2||
      !outputHtml.trimEnd().endsWith('</body></html>')||
      outputHtml.split('</body></html>').length!==2)
      fail('canonical head/body markers changed');
    outputHtml=outputHtml.replace(headClose,
      '<style id="od-preview-bookmark-lab-style">\n'+labCss+'\n</style>\n'+headClose);
    outputHtml=outputHtml.replace('</body></html>',
      '<script>'+bookmarkScript+'</script>\n</body></html>');
  }
  if(tocOverlay){
    outputHtml=addReadingTocControls(outputHtml,{
      sidePanelHtml:frameHtml,overlayHtml:tocOverlay.html,scenario,surface
    });
  }
  const output=resolve(out||join(repoRoot,'artifacts/previews',pkg.id,
    [surface,scenario,theme,String(width)].join('-')+'.html'));
  return Object.freeze({manifest,frameHtml,html:outputHtml,output});
}
// A small source-bound sidecar for AI review; never a second rendering pipeline.
export function previewReviewContext(preview){
  const {manifest,output}=preview;
  return Object.freeze({
    format:PREVIEW_CONTEXT_FORMAT,
    toolId:manifest.tool,surface:manifest.surface,
    view:'extension-tool-detail',activeTab:'扩展',
    // Tool interactions remain owned by the real packaged HTML/JS, not a summary registry.
    hostInteractions:['五个顶部页签（非扩展仅占位）','返回精简列表与重新进入','模拟卸载、取消和确认',
      ...(manifest.tool==='adblock'?['可信宿主全局与当前网站开关（离线模拟）','网站例外恢复确认（离线模拟）']:[]),
      ...(manifest.tool==='bookmark-manager'?['外层预览测试控制（不属于正式工具）']:[]),
      ...(manifest.tool==='reading-toc'?['简体中文/English 原位切换（离线模拟）','Side Panel / 可信网页悬浮源代码切换','章节/空态/加载/错误模拟']:[])],
    scenario:manifest.scenario,viewportCssPx:manifest.viewport,
    source:{commit:manifest.sourceCommit,designSha256:manifest.designSha256,
      shellSha256:manifest.shellSha256,uiSha256:manifest.uiSha256},
    simulation:{mock:true,installed:false,permissionsGranted:false,network:false,
      realUninstall:false,sdkOperations:manifest.operations},
    html:output,inlinePreview:'REQUIRES_CLIENT_RENDER_CHECK'
  });
}
export async function buildPreview(options={}){
  const preview=await generatePreview(options);
  const contextPath=preview.output.endsWith('.html')?
    preview.output.slice(0,-5)+'.context.json':preview.output+'.context.json';
  await mkdir(dirname(preview.output),{recursive:true});
  await writeFile(preview.output,preview.html,'utf8');
  await writeFile(contextPath,JSON.stringify(previewReviewContext(preview),null,2)+'\n','utf8');
  return {output:preview.output,context:contextPath,...preview.manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),parsed={};
  const opts=new Map([['--tool','tool'],['--surface','surface'],['--scenario','scenario'],
    ['--theme','theme'],['--width','width'],['--height','height'],['--out','out']]);
  try {
    for(let i=0;i<args.length;i+=2){
      if(!opts.has(args[i])||i+1>=args.length)fail('usage: --tool quick-notes|bookmark-manager|adblock|reading-toc --surface side-panel --scenario success --theme light --width 360 [--height 760] [--out file]');
      const key=opts.get(args[i]);
      parsed[key]=['width','height'].includes(key)?Number(args[i+1]):args[i+1];
    }
    buildPreview(parsed).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  }catch(error){console.error(error.message);process.exitCode=1;}
}