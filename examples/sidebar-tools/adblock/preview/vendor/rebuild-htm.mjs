// Maintainer-only, deterministic, offline HTM 3.1.1 browser bundle generator.
// Run: node examples/sidebar-tools/adblock/preview/vendor/rebuild-htm.mjs
// Daily component edits never invoke this script.
import {readFile,writeFile} from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const [build,index,constants] = await Promise.all([
  readFile(new URL('htm-src/build.mjs',root),'utf8'),
  readFile(new URL('htm-src/index.mjs',root),'utf8'),
  readFile(new URL('htm-src/constants.mjs',root),'utf8')
]);
if (!/export const MINI = false;/.test(constants)) throw Error('HTM constant drift');
if (!index.includes('export default MINI ? build : regular;') ||
    !build.includes('export const evaluate =') || !build.includes('export const build =')) {
  throw Error('HTM pinned source drift; review upstream before regenerating');
}
const dropImports = input => input.replace(/^import .*;\r?\n/gm, '');
const bundle = [
  '/* HTM 3.1.1 · Apache-2.0 · https://github.com/developit/htm/tree/3.1.1',
  ' * Generated deterministically from included htm-src; see LICENSE-htm.txt. */',
  '(function () {','"use strict";','const MINI = false;',
  dropImports(build).replace(/^export const /gm,'const '),
  dropImports(index).replace('export default MINI ? build : regular;',
    'Object.defineProperty(globalThis,"OpenDeskPreviewHTM",{value:regular,writable:false,configurable:false});'),
  '})();',''
].join('\n');
await writeFile(new URL('htm-3.1.1.js',root),bundle);
console.log('HTM_BROWSER_BUNDLE ' + Buffer.byteLength(bundle) + ' bytes');
