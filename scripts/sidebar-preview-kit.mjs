#!/usr/bin/env node
// Offline design artifact only. This does not build/install Sidebar Tools.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {parse} from 'acorn';
import {build} from 'esbuild';
import {sidebarPreviewShellSource} from './preview/sidebar-shell-source.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = ['src/ui/design-tokens.css', 'src/ui/design-system.css', 'scripts/templates/sidebar-preview.html', 'scripts/sidebar-preview-kit.mjs', 'src/ui/react/components/ui/sidebar-shared.css',
  'scripts/templates/sidebar-tool-preview-shell.html', 'scripts/preview/sidebar-shell-behavior.js',
  'scripts/preview/sidebar-shell-source.mjs', 'src/ui/tool-shell.css',
  'src/ui/react/tabs/navigation.tsx', 'src/ui/react/tabs/tool-host.tsx',
  'scripts/preview/sidebar-component-recipes.jsx',
  'src/ui/react/components/ui/button.tsx', 'src/ui/react/components/ui/card.tsx',
  'src/ui/react/components/ui/switch.tsx', 'src/entrypoints/sidebar-shared-ui.js', 'package-lock.json',
  'scripts/preview/shared-tool-design.mjs'];
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = text => createHash('sha256').update(text).digest('hex');
const policies = `default-src 'none'; script-src 'nonce-opendesk-preview'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;

export async function createPreviewKit({title = '我的工具', repoRoot = ROOT} = {}) {
  if (typeof title !== 'string' || !title.trim() || title.length > 80) throw Error('标题须为 1–80 字符');
  const source = await Promise.all(INPUTS.map(path => readFile(join(repoRoot, path), 'utf8')));
  const inputs = Object.fromEntries(INPUTS.map((path, i) => [path, hash(source[i])]));
  const shell = await sidebarPreviewShellSource();
  const sourceHash = hash(JSON.stringify({inputs,shellSha256:shell.digest}));
  const lightTokens=source[0].match(/:root\s*\{([^}]+)\}/)?.[1];
  const darkTokens=source[0].match(/@media\s*\(prefers-color-scheme:dark\)\s*\{\s*:root\s*\{([^}]+)\}/)?.[1];
  if(!lightTokens?.includes('--od-brand:')||!darkTokens)
    throw Error('E_PREVIEW_KIT_LIGHT: official design tokens are unavailable');
  const fragment=load(source[2],null,false);
  // Rebind derived aliases in the app scope before applying the dark palette.
  // Inherited custom properties would otherwise retain the host's light values.
  const themeCss=['light','dark'].map(theme=>'#od-preview-app[data-preview-theme="'+theme+'"]{color-scheme:'+theme+';'+lightTokens+(theme==='dark'?darkTokens:'')+'}').join('\n');
  const safeJSON=value=>JSON.stringify(value).replaceAll('<','\\u003c');
  const values={PAGE_TITLE:escapeHTML(title)+' · OpenDesk 交互预览',
    TOOL_NAME:escapeHTML(title),SCENARIO:'ready',TOOL_THEME:'light',
    TOKENS:source[0],COMPONENTS:source[1]+'\n'+source[4],SHELL_CSS:shell.css,
    LIGHT_CSS:':root{color-scheme:light;'+lightTokens+'}',
    NAV:shell.nav,HEADER:shell.head,WIDTH:'390',HEIGHT:'760',
    SOURCE_COMMIT:'OFFLINE_DESIGN',DESIGN_SHA:sourceHash,SHELL_SHA:shell.digest,UI_SHA:'DESIGN_ONLY',
    APP_CONTENT:fragment('#od-preview-app').toString(),PREVIEW_CONTROLS:fragment('#od-preview-controls').toString(),
    SHELL_DATA_JSON:safeJSON({title}),SHELL_BEHAVIOR:source[6]+'\n/* DESIGN_APP_BEHAVIOR */\n'+fragment('#od-preview-behavior').text(),
    MANIFEST_JSON:safeJSON({mock:true,installed:false,permissionsGranted:false}),
    ADBLOCK_HOST_CSS:'',ADBLOCK_HOST:'',ADBLOCK_RESTORE_DIALOG:'',ADBLOCK_SNAPSHOTS_JSON:'{}',ADBLOCK_PREVIEW_SCRIPT:''};
  let html=source[5].replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,key)=>{
    if(!Object.hasOwn(values,key))throw Error('Unknown shell slot '+key);
    return values[key];
  });
  const document=load(html);
  document('head').append('<meta name="od-preview-source" content="'+sourceHash+'">');
  document('head').append('<meta http-equiv="Content-Security-Policy" content="'+policies+'">');
  document('head').append(fragment('#od-preview-frame').toString());
  document('#od-preview-frame').append(themeCss);
  document('#od-preview-controls>details').prepend('<p><a id="od-component-reference-link" href="components.html">打开可操作组件与用法 →</a></p>');
  document('#od-preview-shell-behavior').attr('id','od-preview-behavior').attr('nonce','opendesk-preview');
  document('#opendesk-preview-adblock-snapshots, #opendesk-preview-manifest').remove();
  document('script').filter((_,el)=>!document(el).text().trim()).remove();
  html=document.html();
  const prompt = `请基于随附的 preview.html 设计「${title}」的 OpenDesk 扩展应用交互预览。先读取附件内容；若无法读取，请说明缺失，勿声称已遵守附件。仅有仓库路径不代表你已读到文件。\n\n` +
    `这是独立离线设计稿，宿主保持浅色，工具浅/深色由应用外部辅助区演示；模拟数据、未安装，不调用真实浏览器/文件/SDK/权限。保持头部预览声明、模拟状态选择器、CSP、源身份、全部样式块、真实来源导航/工具栏和外层文档不变。只修改 #od-preview-app 的内部 HTML 与 #od-preview-behavior 中工具的本地模拟逻辑；保留共享宿主交互。不要新增 style、内联 style/on*、外部资源、CDN、网络请求或真实 OpenDeskTool/chrome 调用。\n\n` +
    `同时阅读随附 component-recipes.md；components.html 可离线操作真实共享 React 组件，属于参考文件，不修改它。HTML 的主/次/轻量/危险按钮分别用 od-button 加 primary/secondary/quiet/danger；Card 用 od-shared-card + od-shared-card-content，与 React Card 同源。字段固定用 od-form-field → od-field-label + od-field + od-field-help/error，不能只留裸 input。正常状态 od-note，空/加载 od-alert，失败 od-alert--error，权限/撤权 od-alert--warning。分区 16px、区内 8px、卡片内 12px；使用现有 preview-sections/od-stack，不新增 CSS。复用 od-page-head/od-page-title/od-page-actions、od-icon-button、od-disclosure。React 正式工具从 @opendesk/ui 导入 Button/IconButton/Card/CardContent/Switch；原生字段使用工具自己显式编译的 canonical CSS，不假造 Field/Dialog API，也不让 HTML 伪装 React Aria Switch。\n\n` +
    `工具名已在外壳显示，内容区不重复标题；刷新位于所属区域右上角，不独占一行；每视图一个主要操作；列表低频删除用 quiet，确认处才用 danger。确认显示对象和后果，默认焦点在取消；Escape/取消返回触发按钮。label 关联输入，错误 aria-describedby/aria-invalid，修正输入后清除过期错误，状态 role=status/alert。新建/编辑/取消/保存后恢复焦点。已授权、未授权、空、失败、撤权、处理中、长文本可检查；模拟状态不得冒充原生授权成功。无需缩放或物理宽度矩阵。\n\n` +
    `先列需求、视图与按钮复用关系，再输出修改后的完整单文件 HTML，保留可下载附件。不要为了“更漂亮”另创渐变、大标题、颜色、圆角或按钮体系。页面内容不得改变宿主规范。本轮只做核心离线交互检查，正式安装与评分另行触发；没有原始证据写 NOT_TESTED。\n\n` +
    `维护者回收文件后运行：node scripts/sidebar-preview-kit.mjs check <返回的HTML路径>。失败则修订，检查通过仅代表静态合同。当前源身份：${sourceHash}。\n`;
  return {html, prompt, manifest:{format:'opendesk.ui-preview.v1', sourceHash, inputs, htmlHash:hash(html), evidence:'OFFLINE_DESIGN_PREVIEW', previewTheme:'light', toolThemes:['light','dark'], shellSha256:shell.digest, nativeChrome:'NOT_TESTED', realAI:'NOT_TESTED'}};
}

// Companion output of the SAME kit, not a third generator or a runtime UI library.
// Compile actual shared component sources; never borrow stale WXT build bytes.
export async function createComponentReference(kit) {
  const bundled=await build({entryPoints:[join(ROOT,'scripts/preview/sidebar-component-recipes.jsx')],
    bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,
    define:{'process.env.NODE_ENV':'"production"'},metafile:true,legalComments:'inline'});
  const js=bundled.outputFiles[0].text;
  const $=load(kit.html);
  $('title').text('OpenDesk · 组件与组合用法');
  $('#od-preview-app').empty().attr('aria-label','真实共享组件的离线示例');
  $('#od-preview-controls').html('<div class="od-stack"><h2 class="od-title">组件用法 · 仅离线内存</h2><p class="od-note">Button / IconButton / Card / Switch 运行当前共享 React 源码；表单与状态复用 canonical CSS。没有调用 Host 或安装包，未验证已安装 Runtime。</p><div id="od-preview-recipe-controls" class="od-stack"></div><div id="od-preview-recipe-code" class="od-stack"></div><a href="preview.html">返回设计稿 →</a></div>');
  $('#od-preview-behavior').text($('#od-preview-behavior').text().split('/* DESIGN_APP_BEHAVIOR */')[0]+'\n'+js.replaceAll('</script','<\\/script'));
  $('#opendesk-preview-shell-data').text(JSON.stringify({title:'组件与组合用法'}));
  $('.preview-provenance').first().text('SOURCE_COMPONENT_PREVIEW · 当前共享组件源码编译；未安装。');
  $('.preview-provenance').last().text('sourceHash: '+kit.manifest.sourceHash);
  const recipes=componentRecipeGuide();
  $('#od-preview-recipe-code').append('<pre class="preview-actions-code"></pre>').find('pre').text(recipes);
  const inputs={};
  for(const path of Object.keys(bundled.metafile.inputs).sort())inputs[path]=hash(await readFile(join(ROOT,path)));
  return {html:$.html(),guide:recipes,inputs,evidence:'SOURCE_COMPONENT_PREVIEW'};
}

function componentRecipeGuide(){return `# OpenDesk 组件与组合入口

真实导出：src/entrypoints/sidebar-shared-ui.js → src/ui/react/components/ui/{button,card,switch}.tsx。
唯一 Tokens：src/ui/design-tokens.css；HTML 字段/状态：src/ui/design-system.css；Card/Switch：sidebar-shared.css。
完整参考仍是 prototypes/sidebar/extension-ui-showcase/index.html，本页只演示模板用到的组合。

React Sidebar Tool（复用已有 React 项目/Vite external，不装第二份 React）：
import {Button, IconButton, Card, CardContent, Switch} from '@opendesk/ui';
<Card><CardContent>
  <Button variant="primary" onClick={save}>保存</Button>
  <Button variant="secondary" onClick={cancel}>取消</Button>
  <Switch aria-label="自动整理" isSelected={enabled} onChange={setEnabled}/>
</CardContent></Card>
Button 默认为 secondary；HTML od-button 基类默认为 primary，必须明确选择用途。
IconButton 必须传 label；Switch 用 isDisabled，Button/原生输入用 disabled。

HTML（保留原工具语言，不转 React）：
<div class="od-shared-card"><div class="od-shared-card-content">
  <div class="od-form-field">
    <label for="name" class="od-field-label">名称</label>
    <input id="name" class="od-field" aria-describedby="name-help name-error">
    <p id="name-help" class="od-field-help">最多 80 个字符。</p>
    <p id="name-error" class="od-field-error" role="alert" hidden>请输入名称。</p>
  </div>
  <button type="submit" class="od-button od-button--primary">保存</button>
</div></div>
校验失败显示错误并设 aria-invalid=true，修正后移除；必填字段加 required。
React 中同样组合原生 label/input/select 与 od-*，当前没有共享 Field/Select/Dialog 导出。

布局：od-page-head + od-page-title + od-page-actions（刷新在所属区域右上）；
od-stack 为区内 8px；独立分区使用 --space-4；CardContent 为 12px；不逐字段套卡。
状态：正常 od-note；空/加载 od-alert；失败 od-alert od-alert--error；
权限/撤权 od-alert od-alert--warning，文字解释原因。错误 role=alert，其余 role=status。
确认：Card + 对象/后果 + secondary 取消 + danger 确认；焦点先取消，Escape 恢复触发者。
示例：本目录 preview.html 新建/空值错误/保存/编辑取消/删除确认；components.html 真实 React 组件与字段组合。

正式接入：HTML CSS 由原 build-sidebar-tool.mjs 的 @opendesk-shared-design 构建期提取；
该现有提取器也输出同源 Card 子集，无需作者另抄 Card CSS。React 示例参考 projects/quick-notes-react。
@opendesk/ui 当前自动提供 Button/Card/Switch 样式，不自动提供表单/布局全套 CSS；
字段/od-stack/od-alert 须由工具自己的静态 CSS 显式编译 canonical 规则，参考本仓库 shared-tool-design.mjs。
禁止把整个宿主 CSS/权限 JS 注入工具 iframe。HTML Switch 保留原生 checkbox，不能手绘冒充真实 React Aria。
Menu/Tree/Combobox/Dialog 的统一沙箱 API 尚未封装；需要时按实际项目与公开边界评估。
本页从共享源码离线编译，不是正式 sidebar-shared-ui.js 运行时或工具包；Native/安装/真实 AI 为 NOT_TESTED。
`;}

function shape(node) {
  if (node.type === 'comment') return null;
  if (node.type === 'text') return node.data.trim() || null;
  const attrs = Object.fromEntries(Object.entries(node.attribs || {}).sort(([a], [b]) => a.localeCompare(b)));
  const editable = ['od-preview-app','od-preview-behavior'].includes(attrs.id);
  return [node.name || node.type, attrs, editable ? 'EDITABLE_CONTENT' : (node.children || []).map(shape).filter(x => x !== null)];
}

export async function checkPreview(html, {repoRoot = ROOT} = {}) {
  const errors = [];
  if (Buffer.byteLength(html) > 500000) return {ok:false, errors:['预览超过 500KB'], evidence:'STATIC_CONTRACT_ONLY'};
  const $ = load(html), title = $('title').text().replace(/ · OpenDesk 交互预览$/, '');
  let kit;
  try { kit = await createPreviewKit({title, repoRoot}); } catch (e) {
    const message=String(e.message||e);
    return {ok:false,
      errors:[message.includes('E_PREVIEW_KIT_LIGHT')
        ? '源身份过期或正式浅色 Token 不可用：'+message : message],
      evidence:'STATIC_CONTRACT_ONLY'};
  }
  const expected = load(kit.html);
  if ($('meta[name="od-preview-source"]').attr('content') !== kit.manifest.sourceHash) errors.push('源身份过期或缺失：请重生成模板并迁移可编辑区域');
  if (JSON.stringify(shape($.root()[0])) !== JSON.stringify(shape(expected.root()[0]))) errors.push('保护区被修改：保留外壳、声明、CSP 与原样式');
  if ($('meta[http-equiv="Content-Security-Policy"]').attr('content') !== policies) errors.push('CSP 被修改');
  for (const id of ['od-preview-production-css','od-preview-shell-layout','od-preview-frame']) {
    if ($('#' + id).length !== 1 || $('#' + id).html() !== expected('#' + id).html()) errors.push('样式快照不一致：' + id);
  }
  const app = $('#od-preview-app');
  if ($('style').length !== 3 || $('[style]').length) errors.push('禁止新增 CSS 或内联 style；复用既有组件');
  if ($('script:not([type])').length !== 1 || $('#od-preview-behavior').length !== 1) errors.push('仅允许单一本地模拟脚本');
  if (app.find('script,style,link,meta,iframe,object,embed,base,foreignObject').length) errors.push('内容区域含额外执行或嵌入入口');
  const ids = new Set();
  $('*').each((_, el) => {
    const id = $(el).attr('id'); if (id && ids.has(id)) errors.push('重复 id：' + id); if (id) ids.add(id);
    for (const key of Object.keys(el.attribs || {})) {
      const referenceLink=key==='href'&&id==='od-component-reference-link'&&$(el).attr(key)==='components.html'&&expected('#'+id).toString()===$(el).toString()&&!app.find(el).length;
      if (/^on/i.test(key) || (!referenceLink&&/^(?:src|srcset|href|xlink:href|action|formaction|poster|srcdoc)$/i.test(key))) errors.push('不允许内联事件或资源/导航属性：' + key);
    }
  });
  if (app.find('h1').length) errors.push('工具名由外壳展示，内容区不重复主标题');
  if (!app.find('[role="status"], [role="alert"]').length) errors.push('缺少可访问状态区域');
  app.find('button').each((_, el) => {
    const b = $(el), classes = (b.attr('class') || '').split(/\s+/);
    if (!classes.includes('od-button') && !classes.includes('od-icon-button')) errors.push('按钮未复用 od-button/od-icon-button');
    const variants=classes.filter(name=>/^od-button--/.test(name));
    if(variants.some(name=>!['od-button--primary','od-button--secondary','od-button--quiet','od-button--danger','od-button--tab'].includes(name))||variants.length>1)
      errors.push('按钮变体未知或冲突：只选一个 canonical 变体');
    if (!['button','submit','reset'].includes(b.attr('type'))) errors.push('按钮缺少显式 type');
    if (!b.text().trim() && !b.attr('aria-label')?.trim() && !b.attr('aria-labelledby')?.trim()) errors.push('按钮缺少可访问名称');
  });
  app.find('input,select,textarea').each((_, el) => {
    const field = $(el), id = field.attr('id');
    if (!field.hasClass('od-field')) errors.push('输入未复用 od-field');
    const hasLabel = id && app.find('label').toArray().some(label => $(label).attr('for') === id && $(label).text().trim());
    if (!hasLabel && !field.attr('aria-label')?.trim()) errors.push('输入缺少关联 label/aria-label');
    for(const described of (field.attr('aria-describedby')||'').split(/\s+/).filter(Boolean)){
      if(!app.find('[id]').toArray().some(node=>$(node).attr('id')===described))errors.push('输入描述引用不存在：'+described);
    }
  });
  const sharedPrefix=expected('#od-preview-behavior').text().split('/* DESIGN_APP_BEHAVIOR */')[0]+'/* DESIGN_APP_BEHAVIOR */';
  if (!$('#od-preview-behavior').text().startsWith(sharedPrefix)) errors.push('共享宿主交互被修改：只修改 DESIGN_APP_BEHAVIOR 标记之后的工具模拟逻辑');
  let ast;
  try { ast = parse($('#od-preview-behavior').text(), {ecmaVersion:'latest', sourceType:'script'}); } catch (e) { errors.push('模拟脚本语法错误：' + e.message); }
  const forbidden = new Set(['chrome','browser','OpenDeskTool','fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','localStorage','sessionStorage','indexedDB','eval','Function','importScripts','sendBeacon']);
  function inspect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ImportExpression' || (node.type === 'Identifier' && forbidden.has(node.name))) errors.push('模拟脚本含禁止的入口：' + (node.name || node.type));
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(inspect); else if (value && typeof value === 'object') inspect(value);
  }
  inspect(ast);
  return {ok:errors.length === 0, errors:[...new Set(errors)], sourceHash:kit.manifest.sourceHash, htmlHash:hash(html), evidence:'STATIC_CONTRACT_ONLY', limitation:'静态合同 lint，不证明任意 JavaScript 安全、视觉通过、真实 AI 生成或原生功能'};
}

async function cli(args) {
  const [command, ...rest] = args;
  if (command === 'create') {
    const options = {};
    for (let i = 0; i < rest.length; i += 2) {
      if (!['--out','--title'].includes(rest[i]) || !rest[i + 1]) throw Error('create 参数：--out <新目录> [--title <标题>]');
      options[rest[i].slice(2)] = rest[i + 1];
    }
    if (!options.out) throw Error('请用 --out 指定新的独立输出目录');
    const out = resolve(options.out);
    if (['dist','.wxt','src','official-tools'].some(p => out === join(ROOT,p) || out.startsWith(join(ROOT,p) + '/'))) throw Error('禁止覆盖共享产品/构建目录');
    const kit = await createPreviewKit({title:options.title});
    const reference=await createComponentReference(kit);
    for(const [path,expected] of Object.entries(kit.manifest.inputs)){
      if(hash(await readFile(join(ROOT,path)))!==expected)throw Error('生成期间来源漂移，请重新生成：'+path);
    }
    kit.manifest.componentReference={evidence:reference.evidence,htmlHash:hash(reference.html),guideHash:hash(reference.guide),inputs:reference.inputs};
    await mkdir(dirname(out), {recursive:true}); await mkdir(out); // existing output is never overwritten
    for (const [name, text] of Object.entries({'preview.html':kit.html,'components.html':reference.html,'component-recipes.md':reference.guide,'chatgpt-prompt.txt':kit.prompt,'manifest.json':JSON.stringify(kit.manifest,null,2) + '\n'})) await writeFile(join(out,name),text,{flag:'wx'});
    console.log(JSON.stringify({out,sourceHash:kit.manifest.sourceHash,htmlHash:kit.manifest.htmlHash,
      componentReference:{evidence:reference.evidence,htmlHash:kit.manifest.componentReference.htmlHash,
        inputs:Object.keys(reference.inputs).length},nativeChrome:'NOT_TESTED',realAI:'NOT_TESTED'},null,2));
  } else if (command === 'check' && rest.length === 1) {
    const result = await checkPreview(await readFile(resolve(rest[0]),'utf8')); console.log(JSON.stringify(result,null,2)); if (!result.ok) process.exitCode = 1;
  } else throw Error('用法：node scripts/sidebar-preview-kit.mjs create --out <新目录> [--title <标题>] | check <HTML文件>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli(process.argv.slice(2)).catch(e => {console.error(e.message); process.exitCode = 1;});
