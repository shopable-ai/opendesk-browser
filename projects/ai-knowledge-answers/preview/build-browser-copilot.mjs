import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [sourceArg, outputArg] = process.argv.slice(2);
const source = sourceArg ? resolve(sourceArg) : fileURLToPath(new URL(
  '../../../../opendesk/examples/ai-customer-support/preview/index.html', import.meta.url,
));
const output = outputArg ? resolve(outputArg) : fileURLToPath(new URL(
  '../../../artifacts/ai-customer-service-ui/preview.html', import.meta.url,
));
if (source === output) throw new Error('The preview output must differ from the Desktop source.');

const desktop = await readFile(source, 'utf8');
const tabs = ['reply', 'knowledge', 'customer', 'products', 'images', 'orders'];
if (
  !desktop.includes('id="app"') ||
  !desktop.includes('id:"odiv-tabs"') ||
  !tabs.every(tab => desktop.includes(`id:"${tab}",active:`)) ||
  /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*["']?stylesheet\b/i.test(desktop)
) {
  throw new Error(`Expected the bundled six-tab OpenDesk Desktop preview at ${source}`);
}

function replaceOnce(html, marker, replacement) {
  const start = html.indexOf(marker);
  if (start < 0 || html.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`The Desktop preview changed. Expected one occurrence of ${marker}`);
  }
  return html.slice(0, start) + replacement + html.slice(start + marker.length);
}

const adaptation = `<style>
html[data-od-browser-preview] #od-r12 .preview-top .ptitle,
html[data-od-browser-preview] #od-r12 .preview-top .pmeta {
  display: block !important;
}
html[data-od-browser-preview] #od-r12 .preview-top .brand {
  flex: none;
}
html[data-od-browser-preview] #od-r12 .preview-foot {
  display: none;
}
html[data-od-browser-preview] #od-compact-inline #odiv-tabs:not([hidden]) {
  display: grid;
  grid-template-columns: 1.45fr 1.15fr 1.45fr repeat(3, 1fr);
  gap: 0 !important;
  padding-inline: 8px !important;
  overflow: visible;
}
html[data-od-browser-preview] #od-compact-inline #odiv-tabs [role="tab"] {
  min-width: 0;
  padding-inline: 2px !important;
  transition-property: background-color;
}
html[data-od-browser-preview] #od-compact-inline #odiv-tabs [aria-selected="true"] {
  color: var(--text);
}
</style>`;

const sourceDigest = createHash('sha256').update(desktop).digest('hex');
let html = replaceOnce(desktop, '<html lang="zh-CN">', '<html lang="zh-CN" data-od-browser-preview>');
html = replaceOnce(html, '<meta name="description" content="OpenDesk Desktop AI 客服助手 · 六业务 Tab · 离线 React 演示">',
  '<meta name="description" content="OpenDesk Browser AI 客服 · 六页交互预览 · 演示数据">');
html = replaceOnce(html, '<title>OpenDesk AI 客服助手 · React R2.0</title>', '<title>OpenDesk Browser · AI 客服交互预览</title>');
html = replaceOnce(html, String.raw`className:"ptitle",children:"OpenDesk Desktop \xB7 AI \u5BA2\u670D\u52A9\u624B"`,
  'className:"ptitle",children:"AI 客服交互预览"');
html = replaceOnce(html, String.raw`className:"pmeta",children:"\u53CC\u7A97\u53E3\u5DE5\u4F5C\u53F0 \xB7 \u53F3\u4FA7 Compact Copilot 380px"`,
  'className:"pmeta",children:"演示数据"');
html = replaceOnce(html, '</head>', `<!-- Desktop preview SHA-256 ${sourceDigest} -->\n${adaptation}\n</head>`);

await mkdir(dirname(output), { recursive: true });
const temporary = `${output}.${randomUUID()}.tmp`;
try {
  await writeFile(temporary, html, { flag: 'wx' });
  await rename(temporary, output);
} finally {
  await rm(temporary, { force: true });
}
console.log(output);
