export const PACKAGE_ENTRIES = Object.freeze({
  sw: './src/sw.js',
  'ui/tool-shell': './src/ui/tool-shell.js',
  'agents/health': './src/agents/health.js',
  'agents/selection-entry': './src/agents/selection-entry.js',
  'agents/bootstrap': './src/agents/bootstrap.js',
  'agents/page-agent': './src/agents/page-agent.js',
  'agents/page-relay': './src/agents/page-relay.js',
  'framework/sdk-main': './src/framework/sdk/entry.js',
  'scripting/packaged/page-session': './src/scripting/packaged/page-session.js',
  'scripting/sandbox/sandbox': './src/scripting/sandbox/sandbox.js',
  'scripting/sandbox/worker-runtime': './src/scripting/sandbox/worker-runtime.js'
});

export const BUILD_POLICY = Object.freeze({productionBytes: 256 * 1024, developmentBytes: 512 * 1024, splitChunks: false, runtimeChunk: false, formats: ['iife'], sourcemap: {production: false, development: true}});
export const FIXED_OUTPUTS = Object.freeze(Object.fromEntries(Object.keys(PACKAGE_ENTRIES).filter(name => name !== 'sw').map(name => [name.split('/').at(-1), name + '.js'])));
