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
  'runtime/builtin-libraries/page-core': './src/entrypoints/page-core.js'
});

// Trusted local task candidate verification and immutable install checks ship in the
// existing single Service Worker. Retain the hard single-bundle ceiling; this is
// a reviewed product growth allowance, not permission to split or load remote code.
export const BUILD_POLICY = Object.freeze({productionBytes: 320 * 1024, developmentBytes: 512 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}});
export const FIXED_OUTPUTS = Object.freeze(Object.fromEntries(Object.keys(PACKAGE_ENTRIES).filter(name => name !== 'sw').map(name => [name.split('/').at(-1), name + '.js'])));

// Deliberately not a WXT executable entry or web-accessible MAIN resource.
// It is only passed as verified text to approved chrome.userScripts USER_SCRIPT worlds.
export const PINNED_USER_SCRIPT_LIBRARIES = Object.freeze({
  jquery: Object.freeze({id:'jquery',version:'3.7.1',output:'vendor/jquery-3.7.1.min.js',bytes:87533,
    sha256:'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a',
    licenseOutput:'licenses/jquery-MIT.txt',licenseSha256:'d4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d'})
});
