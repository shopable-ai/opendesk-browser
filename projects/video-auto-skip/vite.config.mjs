import {createHash, randomUUID} from 'node:crypto';
import {readFile, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const sources = ['src/index.html', 'src/style.css', 'src/main.js', 'src/rules.js', 'src/editor.js', 'src/time-track.js', 'vite.config.mjs'];
const files = ['src/style.css', 'dist/tool.js'];
const fingerprints = async names => Object.fromEntries(await Promise.all(names.map(async name => {
  const bytes = await readFile(join(root, name));
  return [name, {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}];
})));

function sourceReceipt() {
  let before;
  return {
    name: 'video-auto-skip-source-receipt',
    async buildStart() {
      for (const name of sources) this.addWatchFile(join(root, name));
      before = await fingerprints(sources);
    },
    generateBundle(_, bundle) {
      const [entry, ...others] = Object.values(bundle);
      if (!entry || entry.type !== 'chunk' || entry.fileName !== 'tool.js' || others.length ||
          entry.imports.length || entry.dynamicImports.length) throw Error('Sidebar must bundle to a single local script');
    },
    async writeBundle() {
      const bound = await fingerprints(sources);
      if (JSON.stringify(bound) !== JSON.stringify(before)) throw Error('Sidebar sources changed during compilation; rebuild');
      const destination = join(root, 'dist/build-ready.json');
      const temporary = destination + '.' + randomUUID() + '.new';
      const ready = {format: 'opendesk.ui-build-ready.v1', buildId: randomUUID(), sources: bound, files: await fingerprints(files)};
      await writeFile(temporary, JSON.stringify(ready) + '\n', {flag: 'wx'});
      await rename(temporary, destination);
    },
  };
}

export default defineConfig({root, publicDir: false, plugins: [sourceReceipt()], build: {
  target: 'es2022', minify: 'esbuild', emptyOutDir: false,
  lib: {entry: join(root, 'src/main.js'), name: 'OpenDeskVideoAutoSkip', formats: ['iife'], fileName: () => 'tool.js'},
}});
