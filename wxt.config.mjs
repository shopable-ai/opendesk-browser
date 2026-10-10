import {createSchemaSpecializer} from './scripts/scoped-schema.mjs';
import protocolSchema from './src/platform/schema.js';
import {recordBundle} from './scripts/bundle-provenance.mjs';
import {defineConfig} from 'wxt';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {FIXED_OUTPUTS, entryByteBudget} from './scripts/build-contract.mjs';
import {configureDevelopment,closeDevelopment,publishDevelopment,waitDevelopmentPublication} from './scripts/wxt-development.mjs';

const schemaSpecializer=createSchemaSpecializer(protocolSchema);
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
  webExt: {disabled: true},
  dev: {reloadCommand: false, server: {host:'127.0.0.1',port:43119}},
  manifest,
  vite: () => ({build: {minify: 'terser', terserOptions: {ecma:2022, compress:{passes:3}, format: {comments: false}},
    sourcemap: process.env.OPENDESK_BUILD_MODE === 'development', target: 'es2022'}}),
  hooks: {
    'build:publicAssets'(wxt){if(wxt.config.command==='serve')return waitDevelopmentPublication(wxt);},
    'vite:devServer:extendConfig'(config){config.optimizeDeps={...config.optimizeDeps,noDiscovery:true,include:[],entries:[]};},
    'build:manifestGenerated'(wxt,output){
      if(wxt.config.command==='serve'){
        // All fixed classic files run from the extension; no remote script
        // execution or extra host permission is needed by this development path.
        output.content_security_policy=structuredClone(manifest.content_security_policy);
        output.host_permissions=[...manifest.host_permissions];
      }
    },
    'server:started': configureDevelopment,
    'server:closed': closeDevelopment,
    'build:done'(wxt,output) {if(wxt.config.command==='serve')return publishDevelopment(wxt,output);},
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
      if (names.size !== 17 || !names.has('background') || Object.keys(FIXED_OUTPUTS).some(name => !names.has(name)))
        throw new Error('WXT must resolve exactly the 17 approved entries');
    },
    'prepare:publicPaths'(_wxt, paths) {
      paths.push(...Object.values(FIXED_OUTPUTS));
    },
    'vite:build:extendConfig'(entries, config) {
      if (entries.length !== 1) throw new Error('Fixed classic scripts require individual WXT builds');
      const entry = entries[0], target = entry.type === 'background' ? 'sw.js' : FIXED_OUTPUTS[entry.name];
      if(entry.type==='background'&&config.mode==='development')config.plugins.push({
        name:'opendesk-disable-wxt-reload-command',
        transform(code,id){
          if(!id.startsWith('\0virtual:wxt-background-entrypoint?'))return;
          // WXT 0.21.4 registers this listener even with reloadCommand:false;
          // Chrome omits commands entirely when no command is declared.
          const listener=/\s*browser\.commands\.onCommand\.addListener\(\(command\) => \{[\s\S]*?\n\s*\}\);/;
          if(!listener.test(code))throw Error('WXT background reload-command wrapper changed; review development safety');
          return {code:code.replace(listener,''),map:null};
        }
      });
      // Background's single classic bundle sits at the fixed 320 KiB cap.
      // Perform isolated SW-only whole-program compression and native built-in
      // optimizations. This self-contained privileged worker owns its realm;
      // runtime/Chrome regressions must still pass on this exact artifact.
      // Never raise the fixed byte budget.
      if (entry.type === 'background') {
        const options = config.build.terserOptions;
        config.build.terserOptions = {...options, compress:{...options.compress, passes:6, toplevel:true, top_retain:['sw','background'], unsafe:true}};
      }
      if (!target || !config.build?.lib) throw new Error('Expected approved WXT library entry');
      config.build.lib.formats = ['iife'];
      config.build.rollupOptions.external = [];
      config.build.rollupOptions.output = {entryFileNames: target, format: 'iife', inlineDynamicImports: true};
      // lodash-es@4.18.1 has an unreachable Function('return this')()
      // fallback in its upstream _root module. It is forbidden by the strict
      // MV3 classic-IIFE verifier even when dead after minification. Replace
      // only this exact pinned module/pattern with the built-in globalThis;
      // never loosen the package scanner or CSP for third-party code.
      config.plugins.push({
        name:'opendesk-lodash-es-csp-root',
        enforce:'pre',
        transform(code,id) {
          const module=id.replaceAll('\\','/');
          if(module.endsWith('/node_modules/lodash-es/_root.js')) {
            const marker="var root = freeGlobal || freeSelf || Function('return this')();";
            if(!code.includes(marker) || code.split("Function('return this')()").length !== 2)
              throw new Error('Unexpected lodash-es@4.18.1 _root.js; re-audit CSP fallback');
            return {code:code.replace(marker,'var root = freeGlobal || freeSelf || globalThis;'),map:null};
          }
          if(['/node_modules/lodash-es/_baseIsNative.js','/node_modules/lodash-es/_toSource.js']
              .some(suffix=>module.endsWith(suffix))) {
            const marker='Function.prototype';
            if(!code.includes(marker) || code.split(marker).length !== 2 ||
                !code.includes('var funcProto = Function.prototype'))
              throw new Error('Unexpected lodash-es@4.18.1 native-reflection module; re-audit CSP');
            // Only introspection of native functions is required; replacing this
            // identity with Math.max's prototype avoids exposing Function by name.
            return {code:code.replace(marker,'Object.getPrototypeOf(Math.max)'),map:null};
          }
        }
      });
      config.plugins.push({
        name: `opendesk-fixed-${entry.name}`,
        transform(code,id) {
          if(id===resolve('src/platform/schema.js'))
            return {code:schemaSpecializer.schemaModuleSource(code,{background:entry.type==='background'}),map:null};
          if(entry.type==='background') {const specialized=schemaSpecializer.transform(code,id);if(specialized)return specialized;}
          if(entry.type==='background' && id===resolve('src/platform/template-runtime-contract.js')) {
            if(code.trim() !== 'export const INCLUDE_DORMANT_TEMPLATE_RUNTIME = true;' &&
              !code.includes('export const INCLUDE_DORMANT_TEMPLATE_RUNTIME = true;'))
              throw new Error('Unexpected dormant Template runtime contract');
            return {code:'export const INCLUDE_DORMANT_TEMPLATE_RUNTIME = false;',map:null};
          }
        },
        async generateBundle(_options, bundle) {
          const chunks = Object.values(bundle).filter(value => value.type === 'chunk');
          if (chunks.length !== 1 || chunks[0].fileName !== target || chunks[0].imports.length || chunks[0].dynamicImports.length)
            throw new Error(`Non-self-contained fixed WXT output: ${target}`);
          const allowed = new Set([target, ...(config.build.sourcemap ? [target + '.map'] : [])]);
          if (Object.keys(bundle).some(path => !allowed.has(path))) throw new Error(`Unregistered WXT resource in ${target}`);
          // Keep the actual failing module graph before enforcing the ceiling.
          // build.mjs saves it as FAILED diagnostics, never a verified receipt.
          await recordBundle(chunks[0]);
          const budget=entryByteBudget(target,config.mode),bytes=Buffer.byteLength(chunks[0].code);
          if(bytes>budget)throw Object.assign(new Error(`WXT entry exceeds unchanged byte budget: ${target} (${bytes} > ${budget})`),
            {target,bytes,budgetBytes:budget});
        }
      });
    }
  }
});
