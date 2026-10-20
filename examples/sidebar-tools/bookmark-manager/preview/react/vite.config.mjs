import {defineConfig} from 'vite';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
 root,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
 // The single reviewed JSX lives in ../../src/react, outside this
 // standalone preview's node_modules ancestry. Resolve only the pinned
 // preview React dependency at build time; never inject another runtime
 // or let this alias affect the trusted WXT Host.
 resolve:{alias:[{find:/^react$/,replacement:resolve(root,'node_modules/react/index.js')}],
  dedupe:['react','react-dom']},
 // Keep the same pinned React.createElement implementation. A local JSX
 // factory binding lets minification avoid repeating the property name.
 esbuild:{jsxFactory:'__bookmarkJSX',
  jsxInject:'import __bookmarkReact from "react"; const __bookmarkJSX = __bookmarkReact.createElement;'},
 build:{target:'es2022',minify:'terser',cssCodeSplit:false,emptyOutDir:true,
  // Use the existing root-pinned Terser; retain notices and default safe
  // compression semantics. All preview/formal builds share these options.
  terserOptions:{ecma:2022,compress:{passes:3,hoist_funs:true},
   format:{comments:'some',wrap_func_args:false},maxWorkers:1},
  lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskBookmarkReactPreview',formats:['iife'],fileName:()=> 'bookmark-react.js',cssFileName:'bookmark-react'},
  rollupOptions:{external:[],output:{inlineDynamicImports:true}}}
});
