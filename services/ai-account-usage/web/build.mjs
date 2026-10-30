import {build} from 'esbuild';
import {mkdir, copyFile} from 'node:fs/promises';
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
console.log(`Built ${preview?'synthetic preview':'production'} UI: ${target}`);
