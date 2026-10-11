import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
export const PACKAGE_ENTRIES = Object.freeze({
  sw: './src/sw.js',
  'ui/tool-shell': './src/ui/tool-shell.js',
  'ui/marketplace': './src/marketplace/page.js',
  'native-agent/settings': './src/native-agent/settings.js',
  'native-agent/transport': './src/native-agent/transport.js',
  'knowledge/knowledge-host': './src/knowledge/service.js',
  'cloud-control/cloud-host': './src/cloud-control/service.js',
  'time-review/time-review-host': './src/time-review/service.js',
  'sidebar-tools/preinstall-intent': './src/entrypoints/preinstall-intent.js',
  'agents/health': './src/agents/health.js',
  'agents/health-host': './src/entrypoints/health-host.js',
  'agents/selection-entry': './src/agents/selection-entry.js',
  'agents/bootstrap': './src/agents/bootstrap.js',
  'agents/page-agent': './src/agents/page-agent.js',
  'agents/page-relay': './src/agents/page-relay.js',
  'framework/sdk-main': './src/framework/sdk/entry.js',
  'scripting/packaged/page-session': './src/scripting/packaged/page-session.js',
  'scripting/sandbox/sandbox': './src/scripting/sandbox/sandbox.js',
  'sidebar-tools/bridge': './src/sidebar-tools/bridge.js',
  'scripting/sandbox/worker-runtime': './src/scripting/sandbox/worker-runtime.js',
  'libs/runtime/page-core': './src/entrypoints/page-core.js',
  'libs/packages/lodash': './src/entrypoints/lodash.js',
  'libs/packages/dayjs': './src/entrypoints/dayjs.js',
  'libs/packages/js-cookie': './src/entrypoints/js-cookie.js',
  'libs/packages/crypto-js': './src/entrypoints/crypto-js.js',
  'libs/packages/file-saver': './src/entrypoints/file-saver.js',
  'libs/packages/query-string': './src/entrypoints/query-string.js',
  'libs/packages/axios': './src/entrypoints/axios.js',
  'libs/packages/store': './src/entrypoints/store.js',
  'libs/packages/cheerio': './src/entrypoints/cheerio.js'
});

// These are project-owned engineering budgets, not Chrome MV3 size limits.
// Keep the fixed, self-contained classic bundles and security scanners.
// Production SW has a 1 MiB hard cap and a non-blocking 512 KiB review line.
// Development SW has 1.5 MiB; other generated JS remains capped at 512 KiB.
// This is an engineering budget, not an MV3/Chrome size or security exemption.
export const BUILD_POLICY = Object.freeze({productionBytes: 512 * 1024, fixedEntryReviewBytes: 320 * 1024, serviceWorkerProductionBytes: 1024 * 1024, serviceWorkerReviewBytes: 512 * 1024, developmentBytes: 1536 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}});
// Existing reader/CLI limits, shared by the build and package verifier. These
// are separate from the unchanged generated-entry budget above.
export const RESOURCE_LIMITS = Object.freeze({vendorBytes:128 * 1024, manifestBytes:8192, licenseBytes:8192});
export function entryByteBudget(target, mode='production') {
  if(!['production','development'].includes(mode))throw Error('Unknown build mode: '+mode);
  if(target!=='sw.js')return BUILD_POLICY.productionBytes;
  return mode==='development'?BUILD_POLICY.developmentBytes:BUILD_POLICY.serviceWorkerProductionBytes;
}
export const FIXED_OUTPUTS = Object.freeze(Object.fromEntries(Object.keys(PACKAGE_ENTRIES).filter(name => name !== 'sw').map(name => [name.split('/').at(-1), name + '.js'])));

// Deliberately not a WXT executable entry or web-accessible MAIN resource.
// It is only passed as verified text to approved chrome.userScripts USER_SCRIPT worlds.
// The catalog is the only authored registry; build allowlists derive from it.
export const PINNED_USER_SCRIPT_LIBRARIES=Object.freeze(Object.fromEntries(
  Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='vendor').map(row=>[
    row.id,Object.freeze({id:row.id,version:row.version,output:row.output,bytes:row.bytes,
      sha256:row.sha256,licenseOutput:row.licensePath,licenseSha256:row.licenseSha256})
  ])
));
