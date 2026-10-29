// Tool-local source-bound preview. Consumes existing builds; never invokes a compiler.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createSidebarToolPackage} from '../../../../scripts/build-sidebar-tool.mjs';
import {officialDesignSources, canonicalThemeOverride} from '../../../../scripts/preview/shared-tool-design.mjs';
import {sidebarPreviewShellSource} from '../../../../scripts/preview/sidebar-shell-source.mjs';
import {loadPreviewRuntime} from './runtime.mjs';
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

export async function buildPreview({scenario = 'success', runtimeDir, runtimeReceipt, out,compilePreview=false} = {}) {
  if (!SCENARIOS.includes(scenario)) fail('unsupported scenario');
  const sources = {};
  async function record(path) {
    const bytes = await readFile(path).catch(error => fail('missing existing input ' + path + ': ' + error.message));
    sources[path] = fingerprint(bytes);
    return bytes;
  }
  const {react, shared, provenance: runtimeEvidence} = await loadPreviewRuntime({runtimeDir, runtimeReceipt, record,compilePreview});
  const snapshotVerified = runtimeEvidence.receiptStatus === 'COMPILED_AND_PACKAGE_VERIFIED';
  await record(fileURLToPath(new URL('./runtime.mjs', import.meta.url)));
  const pkg = await createSidebarToolPackage(project);
  const config = JSON.parse(await record(join(project, 'tool.config.json')));
  if (pkg.id !== 'scrapyjs' || pkg.uiRuntime !== 'opendesk.react-ui.v1' ||
      config.files.js !== 'dist/tool.js' || config.files.css !== 'dist/tool.css')
    fail('parent React build/config is not ready');
  const ready = JSON.parse(await record(join(project, 'dist/build-ready.json')));
  for (const [name, row] of Object.entries({...ready.sources, ...ready.files}))
    if (!same(await record(join(project, name)), row)) fail('tool source/build drift: ' + name);
  if (ready.buildId !== sha(JSON.stringify({sources: ready.sources, files: ready.files}))) fail('non-deterministic tool receipt');
  const task = pkg.delegatedTasks?.find(row => row.taskId === 'scrapyjs.capture');
  if (!task) fail('fixed delegated Task identity is missing');
  const mock = await record(join(project, 'preview/mock-host.js'));
  await record(fileURLToPath(import.meta.url));
  for (const name of ['scripts/preview/shared-tool-design.mjs', 'scripts/preview/sidebar-shell-source.mjs',
    'src/ui/design-tokens.css', 'src/ui/design-system.css', 'src/ui/tool-shell.css']) await record(join(repo, name));
  const templatePath = join(repo, 'scripts/templates/sidebar-tool-preview-shell.html');
  const template = (await record(templatePath)).toString('utf8');
  const {tokens, components, digest} = await officialDesignSources();
  const shell = await sidebarPreviewShellSource({tool: 'scrapyjs'});
  const light = await canonicalThemeOverride('light');
  const bootstrap = selected => 'Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:' + safeJS(selected) + '});';
  const frameHtml = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">' +
    '<link rel="stylesheet" href="' + uri('text/css', pkg.css) + '"></head><body><div id="tool-root">' + pkg.html + '</div>' +
    '<script>' + bootstrap(scenario) + 'Object.defineProperty(globalThis,"__opendeskPreviewTask",{value:' + safeJS(task) + '});</script>' +
    [mock, react, shared, ...(pkg.scripts || []).map(row => row.code), pkg.js]
      .map(code => '<script src="' + uri('text/javascript', code) + '"></script>').join('') + '</body></html>';
  const sourceCommit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const manifest = {format: 'opendesk.ui-preview.v1', tool: pkg.id, toolVersion: pkg.version,
    sourceCommit, scenario, surface: 'side-panel', shellTheme: 'light', buildId: ready.buildId,
    simulation: {mock: true, memoryOnly: true, network: false, installed: false,
      realCapture: false, export: 'Blob download of simulated results only', nativeChrome: 'NOT_TESTED'},
    sources, runtime: {reactVersion: runtimeEvidence.reactVersion, react: fingerprint(react), shared: fingerprint(shared), provenance: runtimeEvidence},
    validatedBytes: {html: fingerprint(pkg.html), css: fingerprint(pkg.css), js: fingerprint(pkg.js),
      scripts: (pkg.scripts || []).map(row => ({name: row.name, ...fingerprint(row.code)}))},
    task, frame: fingerprint(frameHtml), shellSha256: shell.digest, designSha256: digest};
  const uiSha = sha(JSON.stringify(manifest.validatedBytes));
  const controls = '<aside class="preview-meta" aria-label="离线场景控制（不属于正式工具）"><details class="od-disclosure">' +
    '<summary>纯模拟场景控制（切换会清空本次内存草稿与任务）</summary><label>场景 <select id="scrapyjs-preview-scenario">' +
    SCENARIOS.map(name => '<option value="' + name + '"' + (name === scenario ? ' selected' : '') + '>' + name + '</option>').join('') +
    '</select></label></details></aside>';
  const controlsJS = `(()=>{
    const frame=document.getElementById('opendesk-preview-frame');
    const original=new TextDecoder().decode(Uint8Array.from(atob(${safeJS(base64(frameHtml))}),c=>c.charCodeAt(0)));
    document.getElementById('scrapyjs-preview-scenario').addEventListener('change',event=>{
      const scenario=event.target.value;
      if(!${safeJS(SCENARIOS)}.includes(scenario))return;
      const bootstrap='Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:'+JSON.stringify(scenario)+'});';
      frame.srcdoc=original.replace(${safeJS(bootstrap(scenario))},bootstrap);
    });
  })();`;
  const values = {PAGE_TITLE: escape(pkg.title + ' · 纯模拟离线预览'), TOOL_NAME: escape(pkg.title), TOOL_NAME_JSON: safeJS(pkg.title),
    SCENARIO: scenario, TOOL_THEME: 'light', TOKENS: tokens, COMPONENTS: components, SHELL_CSS: shell.css,
    ADBLOCK_HOST_CSS: '', ADBLOCK_HOST: '', ADBLOCK_RESTORE_DIALOG: '', ADBLOCK_SNAPSHOTS_JSON: '{}',
    ADBLOCK_PREVIEW_SCRIPT: controlsJS, LIGHT_CSS: light, WIDTH: '400', HEIGHT: '800', NAV: shell.nav, HEADER: shell.head,
    SOURCE_COMMIT: sourceCommit, DESIGN_SHA: digest, SHELL_SHA: shell.digest, UI_SHA: uiSha,
    MANIFEST_JSON: safeJS(manifest), FRAME_BASE64: base64(frameHtml)};
  let html = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) fail('unknown template slot: ' + key);
    return values[key];
  });
  html = html.replace('sandbox="allow-scripts"', 'sandbox="allow-scripts allow-downloads"')
    .replace('<div class="preview-stage">', controls +
      '<aside class="preview-meta"><p class="preview-provenance">Shared UI 来源状态：' +
      escape(runtimeEvidence.receiptStatus) + (snapshotVerified ?
        '；原构建：' + escape(runtimeEvidence.normalBuildCommand) +
        '；后续编译与包验证完成；WXT passed：false' : '；WXT passed：'+String(runtimeEvidence.wxtPassed)) +
      '</p></aside><div class="preview-stage">')
    .replace('模拟预览 · 非真实安装、权限或网络执行', '纯模拟 · 保存仅在内存 · 任务不采集网页 · 导出仅下载模拟结果')
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; frame-src \'self\' about:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
  // Recheck all recorded inputs before saving a preview of concurrently edited sources.
  for (const [path, expected] of Object.entries(sources))
    if (!same(await readFile(path), expected)) fail('input changed during preview generation: ' + path);
  const directory = resolve(out || join(repo, 'artifacts/previews/scrapyjs', new Date().toISOString().replaceAll(':', '-')));
  await mkdir(directory, {recursive: true});
  await writeFile(join(directory, 'preview.html'), html, {flag: 'wx'});
  await writeFile(join(directory, 'preview.manifest.json'), JSON.stringify({...manifest, output: fingerprint(html)}, null, 2) + '\n', {flag: 'wx'});
  await writeFile(join(directory, 'preview.context.json'), JSON.stringify({tool: 'scrapyjs', view: 'side-panel', scenario,
    source: {commit: sourceCommit, buildId: ready.buildId}, simulation: manifest.simulation,
    usage: '打开 preview.html；场景选择位于 iframe 外，切换和重载重置内存。'}, null, 2) + '\n', {flag: 'wx'});
  return {html: join(directory, 'preview.html'), manifest: join(directory, 'preview.manifest.json'), runtimeEvidence};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {}, names = {'--scenario': 'scenario', '--out': 'out', '--runtime-dir': 'runtimeDir', '--runtime-receipt': 'runtimeReceipt','--compile-preview-runtime':'compilePreview'};
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = names[process.argv[index]], value = process.argv[index + 1];
    if (!name || !value || value.startsWith('--')) fail('usage: node preview/build-preview.mjs [--scenario success] [--out DIR] [--runtime-dir DIR --runtime-receipt FILE]');
    options[name] = name==='compilePreview'?value==='true':value;
  }
  console.log(JSON.stringify(await buildPreview(options), null, 2));
}
