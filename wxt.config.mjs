import {createSchemaSpecializer} from './scripts/scoped-schema.mjs';
import protocolSchema from './src/platform/schema.js';
import {recordBundle} from './scripts/bundle-provenance.mjs';
import {transformPinnedAxiosBrowserSource} from './scripts/axios-browser-csp.mjs';
import {defineConfig} from 'wxt';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {FIXED_OUTPUTS, entryByteBudget} from './scripts/build-contract.mjs';
import {configureDevelopment,closeDevelopment,publishDevelopment,waitDevelopmentPublication} from './scripts/wxt-development.mjs';
import {outputGuardPort} from './scripts/development-lock.mjs';
import {resolveMarketChannel,marketExternalConnectable} from './scripts/market-channel.mjs';
import {resolveBrowserEdition,DEVELOPER_BROWSER_NAME} from './scripts/browser-editions-r245.mjs';

const browserEdition=resolveBrowserEdition();
const schemaSpecializer=createSchemaSpecializer(protocolSchema);
const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
delete manifest.manifest_version;
delete manifest.background; // Generated from the actual WXT background entry.

export default defineConfig({
  srcDir: 'src',
  publicDir: '.wxt/public',
  outDir: 'dist',
  outDirTemplate: '{{mode}}'+(browserEdition==='developer'?'-developer':''),
  manifestVersion: 3,
  imports: false,
  webExt: {disabled: true},
  dev: {reloadCommand: false, server: {host:'127.0.0.1',port:outputGuardPort(process.env.OPENDESK_DEV_PORT??43119)}},
  manifest: structuredClone(manifest),
  vite: () => ({define:{__OPENDESK_BROWSER_COMPILER_ENABLED__:JSON.stringify(browserEdition==='developer')},optimizeDeps:{noDiscovery:true,include:[],entries:[]},build: {minify: 'terser', terserOptions: {ecma:2022, compress:{passes:3}, format: {comments: false}},
    sourcemap: process.env.OPENDESK_BUILD_MODE === 'development', target: 'es2022'}}),
  hooks: {
    'build:publicAssets'(wxt){if(wxt.config.command==='serve')return waitDevelopmentPublication(wxt);},
    'build:manifestGenerated'(wxt,output){
      if(browserEdition==='developer')output.name=DEVELOPER_BROWSER_NAME;
      const channel=resolveMarketChannel({mode:process.env.OPENDESK_BUILD_MODE||wxt.config.mode||'production'});
      const external=marketExternalConnectable(channel);
      if(external)output.externally_connectable=external;
      else delete output.externally_connectable;
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
      if (names.size !== Object.keys(FIXED_OUTPUTS).length+1 || !names.has('background') || Object.keys(FIXED_OUTPUTS).some(name => !names.has(name)))
        throw new Error('WXT entries must match the approved fixed output catalog');
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
      // Other generated JS retains its 512 KiB production cap; production SW
      // has a 1 MiB hard gate (512 KiB advisory), development SW 1.5 MiB.
      // 320 KiB remains advisory for other generated entries. Neither the
      // fixed IIFE allowlist nor CSP/package/security checks are weakened.
      if (entry.type === 'background') {
        const options = config.build.terserOptions;
        config.build.terserOptions = {...options, format:{...options.format,semicolons:false}, compress:{...options.compress, passes:6, toplevel:true, top_retain:['sw','background'], unsafe:true}};
      }
      if (target === 'ui/tool-shell.js') {
         // Preserve the 512 KiB fixed IIFE ceiling; optimize, never relax.
         const options=config.build.terserOptions;
         config.build.terserOptions={...options,
           format:{...options.format,wrap_func_args:false},
           compress:{...options.compress,passes:6,toplevel:true}};
       }
       if (!target || !config.build?.lib) throw new Error('Expected approved WXT library entry');
      // WXT names classic IIFEs after their entry basename by default.
      // A bundle named "dayjs" creates/hoists globalThis.dayjs BEFORE our
      // audited installer runs in the same USER_SCRIPT compilation unit.
      // That triggers E_BUILTIN_COLLISION and fails without a native receipt.
      // Keep the published asset paths unchanged, but give these private
      // WXT wrappers non-API names. Runtime dayjs/_ remain installed only
      // by src/libs/core.js after every registered library is ready.
      if (target === 'libs/packages/dayjs.js') config.build.lib.name = 'OpenDeskDayjsBundle';
      if (target === 'libs/packages/lodash.js') config.build.lib.name = 'OpenDeskLodashBundle';
      if (target === 'libs/packages/js-cookie.js') config.build.lib.name = 'OpenDeskCookiesBundle';
      if (target === 'libs/packages/crypto-js.js') config.build.lib.name = 'OpenDeskCryptoJSBundle';
      // CryptoJS's guarded Node fallback requires only the default export of
      // Vite's browser stub. Avoid Rollup's constructor-bearing namespace helper;
      // keep the strict package scanner and the actual upstream implementation.
      if (target === 'libs/packages/crypto-js.js')
        config.build.commonjsOptions={...config.build.commonjsOptions,requireReturnsDefault:'preferred'};
      if (target === 'libs/packages/file-saver.js') config.build.lib.name = 'OpenDeskFileSaverBundle';
      if (target === 'libs/packages/query-string.js') config.build.lib.name = 'OpenDeskQueryStringBundle';
      if (target === 'libs/packages/axios.js') config.build.lib.name = 'OpenDeskAxiosBundle';
      if (target === 'libs/packages/store.js') config.build.lib.name = 'OpenDeskStoreBundle';
      if (target === 'libs/packages/cheerio.js') config.build.lib.name = 'OpenDeskCheerioBundle';
      if (target === 'libs/packages/fingerprintjs.js') config.build.lib.name = 'OpenDeskFingerprintJSBundle';
      if (target === 'libs/packages/axios.js')config.plugins.push({
        name:'opendesk-audited-axios-browser-csp',
        enforce:'pre',
        transform(code,id){
          const changed=transformPinnedAxiosBrowserSource(code,id);
          return changed===null?undefined:{code:changed,map:null};
        }
      });
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
          // Sidebar already passes null; do not bundle its unused legacy default.
          // Other entries and the source compatibility API retain their default.
          if(target==='ui/tool-shell.js'&&id===resolve('src/run-host.js')) {
            const marker='templateModuleFactory = createScrapingModule';
            const disabled='    const module = getModule();';
            if(code.split(marker).length!==2||code.split(disabled).length!==2)
              throw Error('RunHost template default changed; review Sidebar boundary');
            return {code:code.replace(marker,'templateModuleFactory = null')
              .replace(disabled,"    throw new FoundationError('E_MODULE_NOT_INSTALLED', 'Template module is disabled or unregistered');"),map:null};
          }
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
          if(bytes>budget){
            // Build-only diagnostics. Rendered lengths are pre-minification and
            // do not replace the real output byte gate or verified receipts.
            const largest=Object.entries(chunks[0].modules)
              .map(([id,info])=>({module:id.replace(process.cwd()+'/', ''),
                renderedLength:info.renderedLength||0}))
              .sort((a,b)=>b.renderedLength-a.renderedLength).slice(0,18);
            console.error('OVERSIZE_FIXED_ENTRY_MODULES='+JSON.stringify({target,bytes,budget,largest}));
            throw Object.assign(new Error(`WXT entry exceeds configured byte budget: ${target} (${bytes} > ${budget})`),
              {target,bytes,budgetBytes:budget});
          }
        }
      });
    }
  }
});
