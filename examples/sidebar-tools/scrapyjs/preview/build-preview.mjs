// Tool-local source-bound preview. Consumes tool builds; Shared UI compiles only in memory.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';
import {officialDesignSources, canonicalThemeOverride} from '../../../../scripts/preview/shared-tool-design.mjs';
import {sidebarPreviewShellSource} from '../../../../scripts/preview/sidebar-shell-source.mjs';
import {loadPreviewRuntime} from './runtime.mjs';
import {installPreviewConversationHeader} from './conversation-header.js';
export {loadPreviewRuntime} from './runtime.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(project, '../../..');
export const SCENARIOS = Object.freeze(['success', 'empty', 'error', 'permission-denied', 'loading', 'untrusted']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = bytes => ({bytes: Buffer.byteLength(bytes), sha256: sha(bytes)});
const base64 = bytes => Buffer.from(bytes).toString('base64');
const uri = (mime, bytes) => 'data:' + mime + ';base64,' + base64(bytes);
const safeJS = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fail = message => {throw Error('E_SCRAPYJS_PREVIEW: ' + message);};
const same = (bytes, row) => row?.sha256 === sha(bytes) && row?.bytes === Buffer.byteLength(bytes);

const bootstrap = selected => 'Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:' + safeJS(selected) + '});';

export function previewControlsScript(frameHtml, scenario) {
  return `(()=>{
    const frame=document.getElementById('opendesk-preview-frame');
    const picker=document.getElementById('scrapyjs-preview-scenario');
    const original=new TextDecoder().decode(Uint8Array.from(atob(${safeJS(base64(frameHtml))}),c=>c.charCodeAt(0)));
    let locked=false;
    const controls=['scrapyjs-preview-scenario','scrapyjs-preview-reset','od-preview-reset',
      'sidebar-tool-remove','od-preview-accept-uninstall'].map(id=>document.getElementById(id)).filter(Boolean);
    window.addEventListener('message',event=>{
      if(event.source!==frame.contentWindow||event.origin!=='null')return;
      const state=event.data;
      if(!state||state.type!=='scrapyjs-preview-state'||typeof state.dirty!=='boolean'||typeof state.busy!=='boolean')return;
      locked=state.dirty||state.busy;
      const reason=state.busy?'任务正在进行，完成或停止后可重置模拟数据':state.dirty?'有未保存修改，请先保存或取消后再切换或重置':'';
      for(const control of controls){control.disabled=locked;control.title=reason;}
      document.getElementById('scrapyjs-preview-guard').textContent=reason;
    });
    picker.addEventListener('change',event=>{
      if(locked)return;
      const selected=event.target.value;
      if(!${safeJS(SCENARIOS)}.includes(selected))return;
      const bootstrap='Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:'+JSON.stringify(selected)+'});';
      frame.srcdoc=original.replace(${safeJS(bootstrap(scenario))},bootstrap);
    });
    document.getElementById('scrapyjs-preview-reset').addEventListener('click',()=>{
      if(locked)return;
      picker.value=${safeJS(scenario)};frame.srcdoc=original;
    });
    document.getElementById('od-preview-reset').addEventListener('click',()=>{if(!locked)picker.value=${safeJS(scenario)};});
  })();`;
}

export async function buildPreview({scenario = 'success', runtimeDir, runtimeReceipt, out} = {}) {
  if (!SCENARIOS.includes(scenario)) fail('unsupported scenario');
  const sources = {};
  async function record(path) {
    const bytes = await readFile(path).catch(error => fail('missing existing input ' + path + ': ' + error.message));
    if (sources[path] && !same(bytes, sources[path])) fail('input changed during preview generation: ' + path);
    sources[path] = fingerprint(bytes);
    return bytes;
  }
  const {react, shared, provenance: runtimeEvidence} = await loadPreviewRuntime({runtimeDir, runtimeReceipt, record});
  const snapshotVerified = runtimeEvidence.receiptStatus === 'COMPILED_AND_PACKAGE_VERIFIED';
  const sourcePreview = runtimeEvidence.receiptStatus === 'SOURCE_COMPONENT_PREVIEW';
  await record(fileURLToPath(new URL('./runtime.mjs', import.meta.url)));
  const pkg = await createSidebarToolPackage(project);
  const config = JSON.parse(await record(join(project, 'tool.config.json')));
  if (pkg.id !== 'scrapyjs' || pkg.uiRuntime !== 'opendesk.react-ui.v1' ||
      config.files.js !== 'dist/tool.js' || config.files.css !== 'dist/tool.css')
    fail('parent React build/config is not ready');
  await record(join(project, config.files.html));
  const ready = JSON.parse(await record(join(project, 'dist/build-ready.json')));
  for (const [name, row] of Object.entries({...ready.sources, ...ready.files}))
    if (!same(await record(join(project, name)), row)) fail('tool source/build drift: ' + name);
  for (const [name,row] of Object.entries(ready.designSources||{}))
    if(!same(await record(join(repo,name)),row))fail('public design source/build drift: '+name);
  if (!same(pkg.js, ready.files?.['dist/tool.js']) || !same(pkg.css, ready.files?.['dist/tool.css']))
    fail('package bytes differ from current tool build receipt');
  if (ready.buildId !== sha(JSON.stringify({sources: ready.sources, files: ready.files,...(ready.designSources?{designSources:ready.designSources}:{})}))) fail('non-deterministic tool receipt');
  const task = pkg.delegatedTasks?.find(row => row.taskId === 'scrapyjs.capture');
  if (!task) fail('fixed delegated Task identity is missing');
  const mock = await record(join(project, 'preview/mock-host.js'));
  await record(fileURLToPath(import.meta.url));
  for (const name of ['scripts/preview/shared-tool-design.mjs', 'scripts/preview/sidebar-shell-source.mjs',
    'scripts/preview/react-sidebar-ssr.mjs', 'scripts/preview/sidebar-shell-behavior.js',
    'src/ui/react/app-shell.tsx', 'src/ui/react/tabs/navigation.tsx', 'src/ui/react/tabs/tool-host.tsx',
    'src/ui/sidebar-tools-view.js', 'src/ui/sidebar-tools-fields.js', 'src/i18n/sidebar-navigation.js',
    'src/ui/design-tokens.css', 'src/ui/design-system.css', 'src/ui/tool-shell.css']) await record(join(repo, name));
  const templatePath = join(repo, 'scripts/templates/sidebar-tool-preview-shell.html');
  const template = (await record(templatePath)).toString('utf8');
  const {tokens, components, digest} = await officialDesignSources();
  const shell = await sidebarPreviewShellSource({tool: 'scrapyjs'});
  const conversationCSS=(await record(join(repo,'src/ui/react/components/conversation-layout.css'))).toString('utf8');
  const light = await canonicalThemeOverride('light');
  const shellBehavior = (await record(join(repo, 'scripts/preview/sidebar-shell-behavior.js'))).toString('utf8');
  const frameHtml = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">' +
    '<link rel="stylesheet" href="' + uri('text/css', pkg.css) + '"></head><body><div id="tool-root">' + pkg.html + '</div>' +
    '<script>' + bootstrap(scenario) + 'Object.defineProperty(globalThis,"__opendeskPreviewTask",{value:' + safeJS(task) + '});</script>' +
    [mock, react, shared, ...(pkg.scripts || []).map(row => row.code), pkg.js]
      .map(code => '<script src="' + uri('text/javascript', code) + '"></script>').join('') + '</body></html>';
  const sourceCommit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const manifest = {format: 'opendesk.ui-preview.v1', tool: pkg.id, toolVersion: pkg.version,
    sourceCommit, evidenceLevel: sourcePreview ? 'SOURCE_COMPONENT_PREVIEW' : runtimeEvidence.receiptStatus, scenario, surface: 'side-panel', shellTheme: 'light', buildId: ready.buildId,
    simulation: {mock: true, memoryOnly: true, network: false, installed: false,
      realCapture: false, export: 'Blob download of simulated results only', nativeChrome: 'NOT_TESTED'},
    sourceLock: {algorithm: 'sha256', inputs: sources}, sources, runtime: {reactVersion: runtimeEvidence.reactVersion, react: fingerprint(react), shared: fingerprint(shared), provenance: runtimeEvidence},
    validatedBytes: {html: fingerprint(pkg.html), css: fingerprint(pkg.css), js: fingerprint(pkg.js),
      scripts: (pkg.scripts || []).map(row => ({name: row.name, ...fingerprint(row.code)}))},
    task, frame: fingerprint(frameHtml), shellSha256: shell.digest, designSha256: digest};
  const uiSha = sha(JSON.stringify(manifest.validatedBytes));
  const controls = '<aside class="preview-meta" aria-label="离线场景控制（不属于正式工具）"><details class="od-disclosure">' +
    '<summary>纯模拟场景控制（切换会清空本次内存草稿与任务）</summary><label>场景 <select id="scrapyjs-preview-scenario">' +
    SCENARIOS.map(name => '<option value="' + name + '"' + (name === scenario ? ' selected' : '') + '>' + name + '</option>').join('') +
    '</select></label><button id="scrapyjs-preview-reset" type="button" class="od-button od-button--secondary">重置模拟数据</button><p id="scrapyjs-preview-guard" class="od-note" role="status" aria-live="polite"></p></details></aside>';
  await record(join(project,'preview/conversation-header.js'));
  const controlsJS = previewControlsScript(frameHtml, scenario)+'\n('+installPreviewConversationHeader.toString()+')(document.getElementById("opendesk-preview-frame"),document.getElementById("sidebar-tool-conversation-toggle"));';
  const values = {
    APP_CONTENT: '<div id="sidebar-tool-frame" class="sidebar-tool-frame"><iframe id="opendesk-preview-frame" class="sidebar-tool-iframe" title="scrapyjs 模拟 App" sandbox="allow-scripts allow-downloads" referrerpolicy="no-referrer"></iframe></div>',
    PREVIEW_CONTROLS: controls,
    SHELL_DATA_JSON: safeJS({title: pkg.title, scenario, theme: 'light', frameBase64: base64(frameHtml)}),
    SHELL_BEHAVIOR: shellBehavior,
    PAGE_TITLE: escape(pkg.title + ' · 纯模拟离线预览'), TOOL_NAME: escape(pkg.title), TOOL_NAME_JSON: safeJS(pkg.title),
    SCENARIO: scenario, TOOL_THEME: 'light', TOKENS: tokens, COMPONENTS: components, SHELL_CSS: shell.css+'\n'+conversationCSS,
    ADBLOCK_HOST_CSS: '', ADBLOCK_HOST: '', ADBLOCK_RESTORE_DIALOG: '', ADBLOCK_SNAPSHOTS_JSON: '{}',
    ADBLOCK_PREVIEW_SCRIPT: controlsJS, LIGHT_CSS: light, WIDTH: '400', HEIGHT: '800', NAV: shell.nav, HEADER: shell.head,
    SOURCE_COMMIT: sourceCommit, DESIGN_SHA: digest, SHELL_SHA: shell.digest, UI_SHA: uiSha,
    MANIFEST_JSON: safeJS(manifest), FRAME_BASE64: base64(frameHtml)};
  let html = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) fail('unknown template slot: ' + key);
    return values[key];
  });
  html = html.replace('sandbox="allow-scripts"', 'sandbox="allow-scripts allow-downloads"')
    .replace('<div class="preview-stage">',
      '<aside class="preview-meta"><p class="preview-provenance">Shared UI 来源状态：' +
      escape(runtimeEvidence.receiptStatus) + (sourcePreview ?
        '；当前共享组件仅内存编译；WXT / 安装包 / Native 验收：NOT_TESTED' : snapshotVerified ?
        '；原构建：' + escape(runtimeEvidence.normalBuildCommand) +
        '；后续编译与包验证完成；WXT passed：false' : '；WXT passed：true') +
      '</p></aside><div class="preview-stage">')
    .replace('模拟预览 · 非真实安装、权限或网络执行', '纯模拟 · 保存仅在内存 · 不采集网页 · AI 为固定提案 · 复制仅模拟确认 · 导出为模拟数据')
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; frame-src \'self\' about:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
  // Recheck all recorded inputs before saving a preview of concurrently edited sources.
  for (const [path, expected] of Object.entries(sources))
    if (!same(await readFile(path), expected)) fail('input changed during preview generation: ' + path);
  const directory = resolve(out || join(repo, 'artifacts/previews/scrapyjs', new Date().toISOString().replaceAll(':', '-')));
  await mkdir(directory, {recursive: true});
  await writeFile(join(directory, 'preview.html'), html, {flag: 'wx'});
  await writeFile(join(directory, 'preview.manifest.json'), JSON.stringify({...manifest, output: fingerprint(html)}, null, 2) + '\n', {flag: 'wx'});
  await writeFile(join(directory, 'preview.context.json'), JSON.stringify({tool: 'scrapyjs', view: 'side-panel', scenario,
    source: {commit: sourceCommit, buildId: ready.buildId, evidenceLevel: manifest.evidenceLevel, runtime: runtimeEvidence.receiptStatus}, simulation: manifest.simulation,
    usage: '打开 preview.html；场景选择位于 iframe 外，切换和重载重置内存。'}, null, 2) + '\n', {flag: 'wx'});
  return {html: join(directory, 'preview.html'), manifest: join(directory, 'preview.manifest.json'), runtimeEvidence};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {}, names = {'--scenario': 'scenario', '--out': 'out', '--runtime-dir': 'runtimeDir', '--runtime-receipt': 'runtimeReceipt'};
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = names[process.argv[index]], value = process.argv[index + 1];
    if (!name || !value || value.startsWith('--')) fail('usage: node preview/build-preview.mjs [--scenario success] [--out DIR] [--runtime-dir DIR --runtime-receipt FILE]');
    options[name] = value;
  }
  const {html,manifest,runtimeEvidence}=await buildPreview(options);
  console.log(JSON.stringify({html,manifest,runtime:runtimeEvidence.receiptStatus}, null, 2));
}
