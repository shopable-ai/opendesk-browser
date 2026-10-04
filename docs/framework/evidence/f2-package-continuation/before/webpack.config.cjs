const path = require('node:path');
const TerserPlugin = require('terser-webpack-plugin');
// Every entry is independently executable: no shared runtime, lazy chunks or eval devtool.
module.exports = (mode = 'production') => ({
  mode,
  target: ['web', 'es2022'],
  entry: {
    sw: './src/sw.js',
    'ui/tool-shell': './src/ui/tool-shell.js',
    'agents/health': './src/agents/health.js',
    'agents/selection-entry': './src/agents/selection-entry.js',
    'agents/bootstrap': './src/agents/bootstrap.js',
    'agents/page-agent': './src/agents/page-agent.js'
  },
  output: { path: path.resolve(__dirname, 'dist', mode), filename: '[name].js', iife: true, clean: true },
  devtool: mode === 'development' ? 'source-map' : false,
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
    minimize: mode === 'production',
    minimizer: [new TerserPlugin({parallel: false, extractComments: false, terserOptions: {format: {comments: false}}})]
  },
  performance: {hints: 'error', maxEntrypointSize: 256 * 1024, maxAssetSize: 256 * 1024}
});
