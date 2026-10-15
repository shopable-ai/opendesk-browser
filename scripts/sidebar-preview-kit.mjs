#!/usr/bin/env node
// Offline design artifact only. This does not build/install Sidebar Tools.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {parse} from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = ['src/ui/design-tokens.css', 'src/ui/design-system.css', 'scripts/templates/sidebar-preview.html', 'scripts/sidebar-preview-kit.mjs'];
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = text => createHash('sha256').update(text).digest('hex');
const policies = `default-src 'none'; script-src 'nonce-opendesk-preview'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;

export async function createPreviewKit({title = '我的工具', repoRoot = ROOT} = {}) {
  if (typeof title !== 'string' || !title.trim() || title.length > 80) throw Error('标题须为 1–80 字符');
  const source = await Promise.all(INPUTS.map(path => readFile(join(repoRoot, path), 'utf8')));
  const inputs = Object.fromEntries(INPUTS.map((path, i) => [path, hash(source[i])]));
  const sourceHash = hash(JSON.stringify(inputs));
  const values = {TITLE:escapeHTML(title), SOURCE:sourceHash, TOKENS:source[0], COMPONENTS:source[1]};
  // Replace once; never interpret placeholder-looking user titles or CSS recursively.
  const html = source[2].replace(/\{\{(TITLE|SOURCE|TOKENS|COMPONENTS)\}\}/g, (_, key) => values[key]);
  const prompt = `请基于随附的 preview.html 设计「${title}」的 OpenDesk 扩展应用交互预览。先读取附件内容；若无法读取，请说明缺失，勿声称已遵守附件。仅有仓库路径不代表你已读到文件。\n\n` +
    `这是独立离线设计稿：模拟数据、未安装，不调用真实浏览器/文件/SDK/权限。保持头部预览声明、模拟状态选择器、CSP、源身份、三个 style 块及外层文档不变。只修改 #od-preview-app 的内部 HTML 与 #od-preview-behavior 的本地模拟 JS。不要新增 style、内联 style/on*、外部资源、CDN、网络请求或真实 OpenDeskTool/chrome 调用。\n\n` +
    `沿用 od-page-head/od-page-title/od-page-actions、od-stack、od-surface/od-surface--padded、od-button（secondary/danger/quiet）、od-icon-button、od-field、od-disclosure。只用一个主标题；同一视图一个主要操作；危险操作明确文字并二次确认。label 关联输入，错误 aria-describedby，状态 role=status/alert；新建/编辑/取消/保存/删除确认后恢复焦点。正常、空、失败、撤权、处理中、长文本状态都可操作检查；模拟状态不得冒充原生授权成功。无需缩放或物理宽度矩阵。\n\n` +
    `先列需求、视图与按钮复用关系，再输出修改后的完整单文件 HTML，保留可下载附件。不要为了“更漂亮”另创渐变、大标题、颜色、圆角或按钮体系。页面内容不得改变宿主规范。设计评审≥95与真实扩展验收是两个独立门槛；没有原始证据写 NOT_TESTED。\n\n` +
    `维护者回收文件后运行：node scripts/sidebar-preview-kit.mjs check <返回的HTML路径>。失败则修订，检查通过仅代表静态合同。当前源身份：${sourceHash}。\n`;
  return {html, prompt, manifest:{format:'opendesk.ui-preview.v1', sourceHash, inputs, htmlHash:hash(html), evidence:'OFFLINE_DESIGN_PREVIEW', nativeChrome:'NOT_TESTED', realAI:'NOT_TESTED'}};
}

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
  try { kit = await createPreviewKit({title, repoRoot}); } catch (e) { return {ok:false, errors:[e.message], evidence:'STATIC_CONTRACT_ONLY'}; }
  const expected = load(kit.html);
  if ($('meta[name="od-preview-source"]').attr('content') !== kit.manifest.sourceHash) errors.push('源身份过期或缺失：请重生成模板并迁移可编辑区域');
  if (JSON.stringify(shape($.root()[0])) !== JSON.stringify(shape(expected.root()[0]))) errors.push('保护区被修改：保留外壳、声明、CSP 与原样式');
  if ($('meta[http-equiv="Content-Security-Policy"]').attr('content') !== policies) errors.push('CSP 被修改');
  for (const id of ['od-preview-tokens','od-preview-components','od-preview-frame']) {
    if ($('#' + id).length !== 1 || $('#' + id).html() !== expected('#' + id).html()) errors.push('样式快照不一致：' + id);
  }
  const app = $('#od-preview-app');
  if ($('style').length !== 3 || $('[style]').length) errors.push('禁止新增 CSS 或内联 style；复用既有组件');
  if ($('script').length !== 1 || $('#od-preview-behavior').length !== 1) errors.push('仅允许单一本地模拟脚本');
  if (app.find('script,style,link,meta,iframe,object,embed,base,foreignObject').length) errors.push('内容区域含额外执行或嵌入入口');
  const ids = new Set();
  $('*').each((_, el) => {
    const id = $(el).attr('id'); if (id && ids.has(id)) errors.push('重复 id：' + id); if (id) ids.add(id);
    for (const key of Object.keys(el.attribs || {})) {
      if (/^on/i.test(key) || /^(?:src|srcset|href|xlink:href|action|formaction|poster|srcdoc)$/i.test(key)) errors.push('不允许内联事件或资源/导航属性：' + key);
    }
  });
  if (app.find('h1').length !== 1) errors.push('工具内容须恰有一个主标题');
  if (!app.find('[role="status"], [role="alert"]').length) errors.push('缺少可访问状态区域');
  app.find('button').each((_, el) => {
    const b = $(el), classes = (b.attr('class') || '').split(/\s+/);
    if (!classes.includes('od-button') && !classes.includes('od-icon-button')) errors.push('按钮未复用 od-button/od-icon-button');
    if (!['button','submit','reset'].includes(b.attr('type'))) errors.push('按钮缺少显式 type');
    if (!b.text().trim() && !b.attr('aria-label')?.trim() && !b.attr('aria-labelledby')?.trim()) errors.push('按钮缺少可访问名称');
  });
  app.find('input,select,textarea').each((_, el) => {
    const field = $(el), id = field.attr('id');
    if (!field.hasClass('od-field')) errors.push('输入未复用 od-field');
    const hasLabel = id && app.find('label').toArray().some(label => $(label).attr('for') === id && $(label).text().trim());
    if (!hasLabel && !field.attr('aria-label')?.trim()) errors.push('输入缺少关联 label/aria-label');
  });
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
    await mkdir(dirname(out), {recursive:true}); await mkdir(out); // existing output is never overwritten
    for (const [name, text] of Object.entries({'preview.html':kit.html,'chatgpt-prompt.txt':kit.prompt,'manifest.json':JSON.stringify(kit.manifest,null,2) + '\n'})) await writeFile(join(out,name),text,{flag:'wx'});
    console.log(JSON.stringify({out, ...kit.manifest},null,2));
  } else if (command === 'check' && rest.length === 1) {
    const result = await checkPreview(await readFile(resolve(rest[0]),'utf8')); console.log(JSON.stringify(result,null,2)); if (!result.ok) process.exitCode = 1;
  } else throw Error('用法：node scripts/sidebar-preview-kit.mjs create --out <新目录> [--title <标题>] | check <HTML文件>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli(process.argv.slice(2)).catch(e => {console.error(e.message); process.exitCode = 1;});
