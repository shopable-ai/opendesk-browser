// Local compilation only; formal tool packaging remains scripts/build-sidebar-tool.mjs.
import {build, version} from 'esbuild';
import {readFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const provenance = JSON.parse(await readFile(join(root, 'vendor/provenance.json'), 'utf8'));
for (const file of provenance.files) {
  const bytes = await readFile(join(root, 'vendor', file.path));
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`Vendor identity mismatch: ${file.path}`);
  }
}
const license = await readFile(join(root, 'vendor/d3-array-3.2.4/LICENSE'), 'utf8');
await mkdir(join(root, 'build'), {recursive: true});
const output = join(root, 'build/tool.js');
await build({
  entryPoints: [join(root, 'src/main.js')],
  outfile: output,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  minify: false,
  banner: {js: `/*! d3-array v3.2.4 — ISC\n${license}*/`}
});
const bytes = await readFile(output);
console.log(JSON.stringify({builder: 'esbuild', version, output, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), installed: false}, null, 2));
