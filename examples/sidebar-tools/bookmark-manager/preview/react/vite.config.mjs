import {defineConfig} from 'vite';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
 root,base:'./',define:{'process.env.NODE_ENV':JSON.stringify('production')},
 build:{target:'es2022',minify:'esbuild',cssCodeSplit:false,emptyOutDir:true,
  lib:{entry:resolve(root,'src/main.jsx'),name:'OpenDeskBookmarkReactPreview',formats:['iife'],fileName:()=> 'bookmark-react.js',cssFileName:'bookmark-react'},
  rollupOptions:{external:[],output:{inlineDynamicImports:true}}}
});
