import {defineConfig} from 'wxt';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {FIXED_OUTPUTS, BUILD_POLICY} from './scripts/build-contract.mjs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
delete manifest.manifest_version;
delete manifest.background; // Generated from the actual WXT background entry.

export default defineConfig({
  srcDir: 'src',
  publicDir: '.wxt/public',
  outDir: 'dist',
  outDirTemplate: '{{mode}}',
  manifestVersion: 3,
  imports: false,
  manifest,
  // Match the existing ES2022 output target and run normal compression twice.
  // Do not enable unsafe transforms, property mangling, or remove the size gate.
  vite: () => ({build: {minify: 'terser', terserOptions: {ecma: 2022,
    compress: {passes: 2, unsafe: false}, format: {comments: false}},
    sourcemap: process.env.OPENDESK_BUILD_MODE === 'development', target: 'es2022'}}),
  hooks: {
    'entrypoints:resolved'(wxt, entries) {
      const names = new Set();
      for (const entry of entries) {
        names.add(entry.name);
        if (entry.type === 'background') {
          if (entry.name !== 'background') throw new Error('Unexpected background entry');
          entry.name = 'sw';
          entry.outputDir = wxt.config.outDir;
        } else {
          const target = FIXED_OUTPUTS[entry.name];
          if (!target || entry.type !== 'unlisted-script') throw new Error(`Unapproved WXT entry: ${entry.name}`);
          entry.outputDir = resolve(wxt.config.outDir, dirname(target));
        }
      }
      if (names.size !== 11 || !names.has('background') || Object.keys(FIXED_OUTPUTS).some(name => !names.has(name)))
        throw new Error('WXT must resolve exactly the 11 approved entries');
    },
    'prepare:publicPaths'(_wxt, paths) {
      paths.push(...Object.values(FIXED_OUTPUTS));
    },
    'vite:build:extendConfig'(entries, config) {
      if (entries.length !== 1) throw new Error('Fixed classic scripts require individual WXT builds');
      const entry = entries[0], target = entry.type === 'background' ? 'sw.js' : FIXED_OUTPUTS[entry.name];
      if (!target || !config.build?.lib) throw new Error('Expected approved WXT library entry');
      config.build.lib.formats = ['iife'];
      config.build.rollupOptions.external = [];
      config.build.rollupOptions.output = {entryFileNames: target, format: 'iife', inlineDynamicImports: true};
      config.plugins.push({
        name: `opendesk-fixed-${entry.name}`,
        generateBundle(_options, bundle) {
          const chunks = Object.values(bundle).filter(value => value.type === 'chunk');
          if (chunks.length !== 1 || chunks[0].fileName !== target || chunks[0].imports.length || chunks[0].dynamicImports.length)
            throw new Error(`Non-self-contained fixed WXT output: ${target}`);
          const allowed = new Set([target, ...(config.build.sourcemap ? [target + '.map'] : [])]);
          if (Object.keys(bundle).some(path => !allowed.has(path))) throw new Error(`Unregistered WXT resource in ${target}`);
          const budget = entry.type === 'background' && config.mode === 'development'
            ? BUILD_POLICY.developmentBytes : BUILD_POLICY.productionBytes;
          const bytes = Buffer.byteLength(chunks[0].code);
          console.log(`[fixed-entry] ${target}: ${bytes}/${budget} bytes`);
          if (bytes > budget) {
            console.log('[fixed-entry-module-sizes]', JSON.stringify(Object.entries(chunks[0].modules)
              .map(([id, module]) => ({id, renderedLength: module.renderedLength}))
              .sort((a, b) => b.renderedLength - a.renderedLength).slice(0, 20)));
            throw new Error(`WXT entry exceeds unchanged byte budget: ${target} (${bytes} > ${budget})`);
          }
        }
      });
    }
  }
});
