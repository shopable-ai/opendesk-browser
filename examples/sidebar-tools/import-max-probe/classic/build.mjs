import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('.', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('vendor/provenance.json', root), 'utf8'));
for (const file of provenance.files) {
  const bytes = await readFile(new URL('vendor/' + file.path, root));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error('Vendor SHA mismatch: ' + file.path);
}
const license = await readFile(new URL('vendor/mitt-3.0.1/LICENSE', root), 'utf8');
const main = await readFile(new URL('src/main.js', root), 'utf8');
await mkdir(new URL('build/', root), {recursive: true});
const bytes = Buffer.from(`/*! mitt 3.0.1 — MIT\n${license}*/\n${main}`);
await writeFile(new URL('build/main.js', root), bytes);
console.log(JSON.stringify({builder: 'local license assembly (no compilation needed for Classic)', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), installed: false}, null, 2));
