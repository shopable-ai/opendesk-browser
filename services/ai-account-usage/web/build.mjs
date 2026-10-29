import {build} from 'esbuild';
import {mkdir, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
await mkdir(`${root}dist`, {recursive:true});
await build({entryPoints:[`${root}main.jsx`], bundle:true, minify:true, sourcemap:false,
  outfile:`${root}dist/app.js`, jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'}});
await copyFile(`${root}index.html`, `${root}dist/index.html`);
console.log('Built standalone UI: services/ai-account-usage/web/dist');
