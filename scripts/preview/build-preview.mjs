// R1 offline preview: compile the exact validated sidebar tool package, then substitute ONLY its SDK boundary.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';
import {officialSourceProjectPath} from '../../src/sidebar-tools/official-catalog.js';
import {officialDesignSources,canonicalThemeOverride} from './shared-tool-design.mjs';
import {sidebarPreviewShellSource} from './sidebar-shell-source.mjs';
import {canonicalAdblockPreviewHost} from './adblock-host-source.mjs';
import {readingTocOverlayPreview} from './reading-toc-overlay-source.mjs';
import {addReadingTocControls} from './reading-toc-controls.mjs';

export const PREVIEW_FORMAT='opendesk.ui-preview.v1';
export const PREVIEW_CONTEXT_FORMAT='opendesk.ui-preview-context.v1';
export const PREVIEW_SCENARIOS=Object.freeze(['success','empty','error','loading','permission-denied','untrusted']);
export const PREVIEW_MOCK_OPERATIONS=Object.freeze(['storage.get','storage.set','currentPage.info','tasks.open']);
export const PREVIEW_ADBLOCK_OPERATIONS=Object.freeze([
  'adblock.status','adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore',
  'adblock.cosmetic.pick','adblock.cosmetic.cancel','adblock.cosmetic.restore',
  'adblock.cosmetic.inspect','adblock.cosmetic.check','adblock.cosmetic.locate',
  'adblock.cosmetic.display','adblock.cosmetic.add','adblock.cosmetic.replace'
]);
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
// Legacy Knowledge Inbox still has its own scoped palette. Derive the forced
// preview scheme from its exact packaged CSS, never from a second hand-drawn skin.
function legacyPreviewPalette(tool,css,theme){
  if(tool!=='knowledge-inbox')return '';
  const light=css.match(/^:root\{([^}]*)\}/);
  const dark=css.match(/@media\(prefers-color-scheme:dark\)\{\s*:root\{([^}]*)\}/);
  if(!light||!dark)fail('Knowledge Inbox production light/dark palette is unavailable');
  const declarations=theme==='dark'?dark[1]:light[1];
  if(!declarations.includes('--ki-bg:')||!declarations.includes('--ki-ink:')||
     /@import|url\s*\(|[{}]/i.test(declarations))
    fail('Knowledge Inbox preview palette contains unsupported declarations');
  return '\n:root{'+declarations+'}';
}

export async function generatePreview({
  tool='quick-notes',surface='side-panel',scenario='success',theme='light',
  width=360,height=760,out=null
}={}){
  if(!/^[a-z0-9-]{1,64}$/.test(tool))fail('invalid tool ID');
  // Fail closed: injected-page/standalone need their own real production mounting adapter.
  if(surface!=='side-panel'&&!(tool==='reading-toc'&&surface==='page-overlay'))
    fail('surface '+surface+' has no verified production preview adapter');
  if(!['quick-notes','bookmark-manager','adblock','reading-toc',
    'markdown-workbench','web-markdown-clipper','knowledge-inbox','ai-knowledge-answers'].includes(tool))
    fail('mock SDK adapter is not implemented for '+tool);
  if(!PREVIEW_SCENARIOS.includes(scenario)&&!(tool==='reading-toc'&&scenario==='chatgpt-multi'))fail('unsupported scenario');
  if(!['light','dark'].includes(theme))fail('unsupported theme');
  if(tool==='reading-toc'&&theme!=='light')fail('Reading TOC preview shell is light only');
  if(!Number.isInteger(width)||width<240||width>1440||
    !Number.isInteger(height)||height<320||height>2400)fail('invalid CSS viewport');
  const project=join(repoRoot,officialSourceProjectPath(tool));
  const pkg=await createSidebarToolPackage(project);
  // Respect each existing production CSS contract: some older official tools use
  // canonical shared tokens or a legacy scoped stylesheet; do not silently reskin.
  if(!['reading-toc','adblock','knowledge-inbox','web-markdown-clipper'].includes(tool)&&
    !pkg.css.startsWith('/* opendesk.shared-design.v1 sha256='))
    fail('official design CSS is missing from the validated tool package');
  if(tool==='web-markdown-clipper'&&!pkg.css.startsWith('/* opendesk.shared-tokens.v1 sha256='))
    fail('clipper is not compiled from the canonical shared tokens');
  if(tool==='knowledge-inbox'&&(!pkg.css.includes('.ki{')||/@import\b|url\s*\(\s*['"]?\s*(?:https?:|\/\/)/i.test(pkg.css)))
    fail('knowledge-inbox legacy scoped CSS source contract has changed');
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
    // The production React component owns the UI; static JSX constants are
    // preserved in the real compiled bundle, even when dispatch uses a variable.
    if(pkg.uiRuntime!=='opendesk.react-ui.v1'||
      PREVIEW_ADBLOCK_OPERATIONS.some(op=>!pkg.js.includes(op))||
      !pkg.html.includes('id="tool-app"'))
      fail('AdBlock preview requires the compiled production React/Host contract');
    mock=await readFile(new URL('./adblock-mock.js',import.meta.url));
    operations=PREVIEW_ADBLOCK_OPERATIONS;
  }else if(tool==='markdown-workbench'){
    if(!pkg.js.includes("OpenDeskSDK.browser.downloads.text")||
       !pkg.html.includes('id="mdw-source"'))fail('Markdown editor bundle no longer matches the SDK mock');
    mock=await readFile(new URL('./markdown-workbench-mock.js',import.meta.url));
    operations=['browser.clipboard.writeText','browser.downloads.text'];
  }else if(tool==='web-markdown-clipper'){
    if(!pkg.js.includes('OpenDeskClipNotes')||!pkg.js.includes('currentPage.info'))
      fail('clipper bundle no longer matches its existing preview adapter');
    // Reuse its well-tested existing standalone SDK simulation, but keep internal
    // navigation buttons: this canonical Host shell has no clipper navigation bridge.
    const original=await readFile(new URL('../../projects/web-markdown-clipper/preview/mock-host.js',import.meta.url),'utf8');
    const bridge=" setNavigation({page}={}){post('navigation-state',{page});},";
    const fixture='if(!local.clips){';
    const saved="try{const saved=sessionStorage.getItem(key);if(saved)local=JSON.parse(saved);}catch{/* Isolated demo fallback only. */}";
    const persist="const persist=()=>{try{sessionStorage.setItem(key,JSON.stringify(local));}catch{/* Preview-only. */}};";
    if(![bridge,fixture,saved,persist].every(marker=>original.includes(marker)))
      fail('existing clipper mock navigation, fixture or storage contract changed');
    // Canonical previews are deterministic and ephemeral; the original Clipper
    // standalone demonstration still retains its own sessionStorage behavior.
    const source=original.replace(bridge,' // In-tool navigation remains active in this shell.')
      .replace(saved,'/* Canonical preview: no session storage reads. */')
      .replace(persist,'const persist=()=>{}; // Canonical preview: memory only.')
      .replace(fixture,"if(globalThis.__opendeskPreviewScenario==='empty')local.clips={version:1,items:[]};\n"+fixture);
    const faultLayer=await readFile(new URL('./web-markdown-clipper-scenario-mock.js',import.meta.url),'utf8');
    mock=Buffer.from(source+'\n'+faultLayer);
    operations=['currentPage.info','clipNotes.list','clipNotes.get','clipNotes.save','clipNotes.edit',
      'clipNotes.remove','clipNotes.backup','browser.clipboard.writeText','browser.downloads.text'];
  }else if(tool==='knowledge-inbox'){
    if(!pkg.js.includes("request('knowledge.list'")||!pkg.js.includes("request('knowledge.create'"))
      fail('inbox bundle no longer matches SDK boundary');
    mock=await readFile(new URL('./knowledge-inbox-mock.js',import.meta.url));
    operations=['knowledge.editorState','knowledge.list','knowledge.get','knowledge.create',
      'knowledge.update','knowledge.remove','knowledge.download','knowledge.workspace',
      'knowledge.openSource','knowledge.backup','browser.clipboard.writeText'];
  }else if(tool==='ai-knowledge-answers'){
    if(!pkg.js.includes("request('storage.get'")||!pkg.js.includes('OpenDeskKnowledgeAnswersModel'))
      fail('knowledge answers bundle no longer matches SDK/model boundary');
    mock=await readFile(new URL('./ai-knowledge-answers-mock.js',import.meta.url));
    operations=['storage.get','storage.set','file.download','clipboard.writeText'];
  }else{
    if(!pkg.js.includes('BookmarkR2Model')||!pkg.js.includes('BookmarkR2Service')||
       !pkg.js.includes('OpenDeskSDK'))
      fail('bookmark-manager package is missing the real SDK consumer');
    mock=await readFile(new URL('./bookmark-manager-mock.js',import.meta.url));
    operations=PREVIEW_BOOKMARK_OPERATIONS;
  }
  const {tokens,components,digest}=await officialDesignSources();
  const override=await canonicalThemeOverride(theme);
  const legacyPalette=legacyPreviewPalette(tool,pkg.css,theme);
  const shell=await sidebarPreviewShellSource({tool});
  const tocOverlay=tool==='reading-toc'?await readingTocOverlayPreview({scenario}):null;
  const adblock=tool==='adblock'?await canonicalAdblockPreviewHost():null;
  // The offline preview runs the SAME fixed, host-owned React 19 + Shared UI
  // scripts as Chrome. WXT must build the reviewed shared entry beforehand.
  // Neither runtime is bundled into the independent AdBlock package.
  const adblockSharedScripts=tool==='adblock'?await Promise.all([
    readFile(new URL('../../src/libs/page-frameworks/react-19.2.0.js',import.meta.url)),
    readFile(new URL('../../dist/production/sidebar-shared-ui.js',import.meta.url))
  ]).catch(error=>fail('build production Shared UI before React AdBlock preview: '+error.message)):[];
  const shellTemplate=await readFile(new URL('../templates/sidebar-tool-preview-shell.html',import.meta.url),'utf8');
  const lightShellOverride=await canonicalThemeOverride('light');
  let commit;
  try {commit=process.env.GITHUB_SHA||execFileSync('git',['-C',repoRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();}
  catch {fail('a checked-out Git source revision is required');}
  if(!/^[0-9a-f]{40}$/.test(commit))fail('invalid Git source revision');
  const uiDigest=sha256(JSON.stringify([pkg.id,pkg.version,pkg.html,pkg.css,pkg.js,
    ...(pkg.scripts||[]).map(script=>[script.name,script.sha256,script.code])]));
  const frameHtml=[
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    '<link rel="stylesheet" href="'+dataUrl('text/css',pkg.css)+'">',
    '</head><body><div id="tool-root">'+pkg.html+'</div>',
    '<script>Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:'+JSON.stringify(scenario)+'});</script>',
    '<script src="'+dataUrl('text/javascript',mock)+'"></script>',
    ...adblockSharedScripts.map(bytes=>'<script src="'+dataUrl('text/javascript',bytes)+'"></script>'),
    // The v2 package runs its pinned Classic dependencies before its entrypoint.
    // Omitting these produced a plausible HTML shell but a nonfunctional bookmark UI.
    ...(pkg.scripts||[]).map(script=>'<script src="'+dataUrl('text/javascript',script.code)+'"></script>'),
    // Shared UI installs canonical styles at runtime. Force the requested
    // preview theme after those styles, so it does not depend on the OS theme.
    '<style>'+override+legacyPalette+'</style>',
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
  // Offline target page is separate from the official React tool: only the
  // left iframe mounts the exact production JSX bundle and shared UI runtime.
  const hostMarkup=adblock?'':'';
  const adblockPage=adblock?[
    '<section id="od-preview-adblock-target-site" aria-label="模拟目标网页">',
    '<header class="ab-web-head"><strong>news.example.com</strong><span>模拟网页 · 无真实网络拦截</span></header>',
    '<div class="ab-web-body"><h2>今日资讯</h2>',
    '<p>报道内容与页面其他功能仍保持正常。</p>',
    '<div class="ab-web-content">新闻正文示例。网页内容不是 AdBlock 产品 UI。</div>',
    '<button type="button" id="native-promo" class="ab-web-ad ad-banner" data-preview-selector="#native-promo">',
    '<span class="ab-web-ad-caption">推广区域</span><strong>原生推广横幅</strong><small>可单击隐藏 · 可以从侧栏恢复</small></button>',
    '<button type="button" id="promo-sidebar" class="ab-web-ad" data-preview-selector="#promo-sidebar">',
    '<span class="ab-web-ad-caption">广告</span><strong>侧边推荐广告</strong><small>用于测试隐藏与撤销</small></button>',
    '<button type="button" id="sponsor-card" class="ab-web-ad" data-preview-selector="#sponsor-card">',
    '<span class="ab-web-ad-caption">赞助</span><strong>赞助内容模块</strong><small>刷新后重新测试规则</small></button>',
    '<div class="ab-web-content">其余正文仍然可读，不受手动屏蔽影响。</div>',
    '</div></section>'
  ].join(''):'';
  const adblockDialog=adblock?[
    '<dialog class="preview-confirm od-surface" id="od-preview-adblock-restore-dialog" aria-labelledby="od-preview-adblock-restore-title" aria-describedby="od-preview-adblock-restore-description">',
    '<h2 id="od-preview-adblock-restore-title">模拟确认 AdBlock 操作？</h2>',
    '<p id="od-preview-adblock-restore-description"></p>',
    '<div class="preview-confirm-actions">',
    '<button id="od-preview-adblock-restore-cancel" class="od-button od-button--secondary" type="button">取消</button>',
    '<button id="od-preview-adblock-restore-accept" class="od-button" type="button">确认模拟</button>',
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
    ADBLOCK_SNAPSHOTS_JSON:safeJS(adblock?{scenario,source:'compiled-react'}:{}),
    ADBLOCK_PREVIEW_SCRIPT:adblockScript,
    LIGHT_CSS:lightShellOverride,WIDTH:String(width),
    HEIGHT:String(height),
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
  if(adblock){
    const marker='  </section>\n</div>\n<dialog class="preview-confirm od-surface"';
    if(outputHtml.split(marker).length!==2)
      fail('AdBlock target page insertion point is unavailable');
    outputHtml=outputHtml.replace(marker,
      '  </section>\n'+adblockPage+'\n</div>\n<dialog class="preview-confirm od-surface"');
    const css=[
      '.preview-stage:has(#od-preview-adblock-target-site){flex-wrap:wrap;gap:16px;align-items:flex-start}',
      '#od-preview-adblock-target-site{width:min(470px,100%);min-width:260px;background:var(--od-paper);border:1px solid var(--od-line);border-radius:12px;overflow:hidden}',
      '.ab-web-head{display:flex;justify-content:space-between;flex-wrap:wrap;gap:7px;padding:12px 16px;background:var(--od-bg);border-bottom:1px solid var(--od-line);font-size:12px}',
      '.ab-web-head span{color:var(--od-sub);font-size:11px}',
      '.ab-web-body{padding:18px;display:grid;gap:12px}',
      '.ab-web-body h2{margin:0;font-size:18px}',
      '.ab-web-body>p{margin:0;color:var(--od-sub);font-size:12px}',
      '.ab-web-content{background:var(--od-bg);padding:14px;font-size:12px;border-radius:7px}',
      '.ab-web-ad{position:relative;display:grid;gap:6px;text-align:left;padding:17px 14px;background:#f1f5fc;border:1px dashed #b9c9e2;border-radius:9px;cursor:default;color:#354b68}',
      '.ab-web-ad-caption{font-size:10px;font-weight:700;letter-spacing:.04em}',
      '.ab-web-ad small{color:#667d9f}',
      '#od-preview-adblock-target-site.is-picking .ab-web-ad{cursor:crosshair}',
      '#od-preview-adblock-target-site.is-picking .ab-web-ad:hover{outline:2px solid #3675ef;outline-offset:2px;background:#e7efff}',
      '#od-preview-adblock-target-site .ab-web-ad.is-hidden{display:none}',
       '#od-preview-adblock-target-site .ab-web-ad.is-located{outline:2px solid #3675ef;outline-offset:2px}',
      '@media(max-width:660px){#od-preview-adblock-target-site{min-width:0}}'
    ].join('\n');
    outputHtml=outputHtml.replace('</head>',
      '<style id="od-preview-adblock-target-css">\n'+css+'\n</style>\n</head>');
  }
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
      ...(manifest.tool==='adblock'?['正式 React 全局与本站开关（离线模拟）','全部四种可信写操作的确认与取消（离线模拟）']:[]),
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
      if(!opts.has(args[i])||i+1>=args.length)fail('usage: --tool <supported tool ID> --surface side-panel --scenario success --theme light --width 360 [--height 760] [--out file]');
      const key=opts.get(args[i]);
      parsed[key]=['width','height'].includes(key)?Number(args[i+1]):args[i+1];
    }
    buildPreview(parsed).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  }catch(error){console.error(error.message);process.exitCode=1;}
}
