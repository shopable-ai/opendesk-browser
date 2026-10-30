import {build} from 'esbuild';
import {mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const preview = process.argv.includes('--preview');
const target = `${root}${preview?'preview-dist':'dist'}`;
// Production MUST NOT contain the synthetic adapter, its identities or fixtures.
// The same main.jsx is compiled twice, with an exact-path build-time substitution.
const previewGate = {name:'no-preview-fixtures-in-production',setup(build) {
  if (preview) return;
  build.onResolve({filter:/^\.\/demo-data\.mjs$/}, () =>
    ({path:'demo-disabled',namespace:'opendesk-preview-disabled'}));
  build.onLoad({filter:/.*/,namespace:'opendesk-preview-disabled'}, () => ({
    contents:`export const DEMO_DATA_LABEL = '';
      export function createDemoApi(){throw Error('PREVIEW_DISABLED');}`,
    loader:'js'
  }));
}};
await mkdir(target, {recursive:true});
await build({entryPoints:[`${root}main.jsx`], bundle:true, minify:true, sourcemap:false,
  outfile:`${target}/app.js`, jsx:'automatic', plugins:[previewGate],
  define:{'process.env.NODE_ENV':'"production"',__OD_PREVIEW__:preview?'true':'false'}});
await copyFile(`${root}index.html`, `${target}/index.html`);
if (preview) {
  // Portable, source-bound HTML for browser viewing without a ChatGPT file viewer.
  // It embeds the very same compiled CSS/React JS as preview-dist; NO parallel UI.
  const htmlTemplate = await readFile(`${root}index.html`, 'utf8');
  const css = await readFile(`${target}/app.css`, 'utf8');
  const compiled = await readFile(`${target}/app.js`, 'utf8');
  const inlineJs = compiled.split('</script').join('<\\/script');
  const integrity = createHash('sha256').update(inlineJs).digest('base64');
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${integrity}'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'">`;
  const standalone = htmlTemplate
    .replace('<link rel="stylesheet" href="./app.css">', `${csp}<style>${css}</style>`)
    .replace('<script type="module" src="./app.js"></script>', `<script>${inlineJs}</script>`);
  if (standalone.includes('src="./app.js"') || standalone.includes('href="./app.css"') ||
      !standalone.includes('spare.pro@example.com')) throw Error('E_PREVIEW_INLINE_BUILD');
  await mkdir(`${root}preview`, {recursive:true});
  await writeFile(`${root}preview/index.html`, standalone, 'utf8');
  console.log('Built standalone HTML from the formal React preview: web/preview/index.html');
}
console.log(`Built ${preview?'synthetic preview':'production'} UI: ${target}`);
