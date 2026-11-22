// Assemble this offline design using the repository's one Preview Kit.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { load } from 'cheerio';
import { checkPreview, createComponentReference, createPreviewKit } from '../../../scripts/sidebar-preview-kit.mjs';

const output = process.argv[2];
if (!output) throw new Error('用法：node projects/video-auto-skip/preview/build.mjs <候选输出目录>');
const destination = resolve(output);
const sources = ['app.html', 'rules.js', 'time-track.js', 'app.js'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const [kit, inputs] = await Promise.all([
  createPreviewKit({ title: '连播助手' }),
  Promise.all(sources.map(file => readFile(new URL(file, import.meta.url), 'utf8'))),
]);
const [markup, ...behavior] = inputs;
const $ = load(kit.html);
$('#od-preview-app').html(markup);
const script = $('#od-preview-behavior');
const marker = '/* DESIGN_APP_BEHAVIOR */';
const [shared, sample] = script.text().split(marker);
if (!sample) throw new Error('Preview Kit missing its editable behavior marker');
script[0].children[0].data = shared + marker + '\n' + behavior.join('\n');
const html = $.html();
const result = await checkPreview(html);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
const components = await createComponentReference(kit);
const reference = load(components.html);
const returnLink = reference('#od-preview-controls a[href="preview.html"]');
if (returnLink.length !== 1) throw new Error('Preview Kit missing its design return link');
returnLink.attr('href', 'index.html');
const componentHtml = reference.html();
const manifest = {
  ...kit.manifest,
  htmlHash: result.htmlHash,
  appInputs: Object.fromEntries(sources.map((file, i) => [file, sha256(inputs[i])])),
  componentReference: {htmlHash: sha256(componentHtml), inputs: components.inputs, evidence: components.evidence},
};
await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(join(destination, 'index.html'), html),
  writeFile(join(destination, 'components.html'), componentHtml),
  writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
]);
