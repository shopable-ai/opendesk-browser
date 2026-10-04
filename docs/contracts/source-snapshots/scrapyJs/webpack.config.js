const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './src/index.js',  // Your entry file that imports all other modules
  output: {
    filename: 'scrapyJs.js',  // The output bundle file name
    path: path.resolve(__dirname, 'dist'),  // Output directory (e.g., `dist`)
  },
  mode: 'production',
  devtool: false,
  resolve: {
    extensions: ['.js'],
    fallback: {
      fs: false,
      path: false,
    },
  },
  optimization: {
    minimize: false,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true, // 去除console语句
          },
        },
      }),
    ],
  },
};
 
