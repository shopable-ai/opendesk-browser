import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
export const PACKAGE_ENTRIES = Object.freeze({
  sw: './src/sw.js',
  'ui/tool-shell': './src/ui/tool-shell.js',
  'native-agent/settings': './src/native-agent/settings.js',
  'native-agent/transport': './src/native-agent/transport.js',
  'agents/health': './src/agents/health.js',
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
  'libs/packages/dayjs': './src/entrypoints/dayjs.js'
});

// Trusted local task candidate verification and immutable install checks ship in the
// existing single Service Worker. Retain the hard single-bundle ceiling; this is
// a reviewed product growth allowance, not permission to split or load remote code.
export const BUILD_POLICY = Object.freeze({productionBytes: 320 * 1024, developmentBytes: 512 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}});
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
